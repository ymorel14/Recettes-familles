import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Linking, Pressable, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { formaterDate, listerPersonnesParIds, type Personne } from '../services/personnes';
import { formaterEuros } from '../services/hebergements';
import { coutActivite } from '../services/budget';
import { fenetrePeriode } from '../services/dates';
import { versIso } from '../services/calendrier';
import {
  AVIS_ACTIVITE,
  CATEGORIES_ACTIVITE,
  changerStatutActivite,
  donnerAvisActivite,
  listerActivites,
  type Activite,
} from '../services/activites';
import {
  estOrganisateur,
  mesPersonnes,
  messageErreurVoyage,
  obtenirVoyage,
  type VoyageAvecParticipants,
} from '../services/voyage';
import { Aide, Erreur, Puces } from '../components/formulaire';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';

// Activités et visites : propositions de chacun, qui vient, coût pour le
// groupe ; un organisateur retient celles qui entrent au budget loisirs.
export default function ActivitesScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const { session, foyer } = useAuth();
  const moiId = session?.user.id ?? '';

  const [donnees, setDonnees] = useState<{
    voyage: VoyageAvecParticipants;
    activites: Activite[];
    personnes: Personne[];
  } | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [voyage, activites] = await Promise.all([obtenirVoyage(voyageId), listerActivites(voyageId)]);
      const attendus = voyage.participants.filter((p) => p.reponse !== 'decline').map((p) => p.personne_id);
      setDonnees({ voyage, activites, personnes: await listerPersonnesParIds(attendus) });
    } catch (e) {
      setErreurChargement(messageErreurVoyage(e));
    }
  }, [voyageId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const miennes = useMemo(
    () => (donnees ? mesPersonnes(donnees.personnes, moiId, foyer?.id ?? null) : []),
    [donnees, moiId, foyer]
  );

  if (erreurChargement) return <MessageVide titre="Activités indisponibles" texte={erreurChargement} />;
  if (!donnees) return <Chargement />;
  const { voyage, activites, personnes } = donnees;

  const maPersonneId = miennes.find((p) => p.utilisateur_id === moiId)?.id ?? null;
  const organisateur = estOrganisateur(voyage, moiId, maPersonneId);
  const dateReference = voyage.date_debut ?? versIso(fenetrePeriode(voyage.periode, voyage.annee).debut);
  const nom = (id: string) => personnes.find((p) => p.id === id)?.prenom ?? '?';

  const agir = async (action: () => Promise<void>) => {
    setErreur(null);
    try {
      await action();
      await charger();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
    }
  };

  const retenues = activites.filter((a) => a.statut === 'retenu');
  const proposees = activites.filter((a) => a.statut === 'propose');
  const ecartees = activites.filter((a) => a.statut === 'ecarte');
  const budgetLoisirs = retenues.reduce((s, a) => s + coutActivite(a, personnes, dateReference).total, 0);

  const carte = (a: Activite) => {
    const cat = CATEGORIES_ACTIVITE.find((c) => c.id === a.categorie) ?? CATEGORIES_ACTIVITE[0];
    const cout = coutActivite(a, personnes, dateReference);
    const partants = a.avis.filter((x) => x.avis === 'partant').map((x) => nom(x.personne_id));
    const absents = a.avis.filter((x) => x.avis === 'non').map((x) => nom(x.personne_id));
    const tarifs = [
      a.prix_adulte != null ? `adulte ${formaterEuros(Number(a.prix_adulte), true)}` : '',
      a.prix_enfant != null ? `enfant ${formaterEuros(Number(a.prix_enfant), true)}${a.age_max_enfant != null ? ` (jusqu’à ${a.age_max_enfant} ans)` : ''}` : '',
      a.age_gratuit != null ? `gratuit avant ${a.age_gratuit} ans` : '',
      a.prix_forfait != null ? `forfait groupe ${formaterEuros(Number(a.prix_forfait), true)}` : '',
    ].filter(Boolean);
    return (
      <View key={a.id} style={[styles.carte, a.statut === 'retenu' && styles.carteRetenue, a.statut === 'ecarte' && styles.carteEcartee]}>
        {a.image ? <Image source={{ uri: a.image }} style={styles.photo} accessibilityLabel={`Photo : ${a.titre}`} /> : null}
        <View style={styles.haut}>
          <Ionicons name={cat.icone as any} size={18} color={theme.colors.accent} />
          <Text style={styles.categorie}>{cat.libelle}</Text>
          {a.statut === 'retenu' && <Pastille texte="Retenue" ton="succes" />}
          {a.statut === 'ecarte' && <Pastille texte="Écartée" ton="neutre" />}
        </View>
        <Text style={styles.titre}>{a.titre}</Text>
        {a.jour ? <Text style={styles.detail}>Prévu le {formaterDate(a.jour)}</Text> : null}
        {a.adresse ? <Text style={styles.detail}>{a.adresse}</Text> : null}
        {a.description ? <Text style={styles.description}>{a.description}</Text> : null}
        <Text style={styles.detail}>{tarifs.length ? tarifs.join(' · ') : 'Gratuit ou prix à préciser'}</Text>
        <Text style={styles.cout}>
          {formaterEuros(cout.total)} pour {cout.venants} personne{cout.venants > 1 ? 's' : ''}
          {cout.detail ? ` (${cout.detail})` : ''}
        </Text>
        {partants.length > 0 && <Text style={styles.detail}>Partants : {partants.join(', ')}</Text>}
        {absents.length > 0 && <Text style={styles.detail}>Ne viennent pas : {absents.join(', ')}</Text>}
        {a.lien ? (
          <Pressable onPress={() => Linking.openURL(a.lien!)} accessibilityRole="link" style={styles.lien}>
            <Ionicons name="open-outline" size={16} color={theme.colors.accent} />
            <Text style={styles.lienTexte}>Site / billetterie</Text>
          </Pressable>
        ) : null}

        {a.statut !== 'ecarte' &&
          miennes.map((m) => (
            <View key={m.id} style={styles.avis}>
              {miennes.length > 1 && <Text style={styles.detail}>{m.prenom}</Text>}
              <Puces
                options={AVIS_ACTIVITE}
                valeur={a.avis.find((x) => x.personne_id === m.id)?.avis ?? null}
                onChange={(v) => agir(() => donnerAvisActivite(a.id, m.id, v))}
              />
            </View>
          ))}

        <View style={styles.actions}>
          {(a.propose_par === moiId || organisateur) && (
            <Bouton
              titre="Modifier"
              variante="discret"
              onPress={() => navigation.navigate('Activite', { voyageId: voyage.id, activite: a })}
            />
          )}
          {organisateur && a.statut !== 'retenu' && (
            <Bouton titre="Retenir" onPress={() => agir(() => changerStatutActivite(a.id, 'retenu'))} />
          )}
          {organisateur && a.statut === 'propose' && (
            <Bouton titre="Écarter" variante="contour" onPress={() => agir(() => changerStatutActivite(a.id, 'ecarte'))} />
          )}
          {organisateur && a.statut !== 'propose' && (
            <Bouton titre="Remettre en jeu" variante="contour" onPress={() => agir(() => changerStatutActivite(a.id, 'propose'))} />
          )}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <View style={styles.resume}>
        <Text style={styles.resumeLibelle}>Budget loisirs</Text>
        <Text style={styles.resumeMontant}>{formaterEuros(budgetLoisirs)}</Text>
        <Text style={styles.detail}>
          {retenues.length} activité{retenues.length > 1 ? 's' : ''} retenue{retenues.length > 1 ? 's' : ''} ·{' '}
          {proposees.length} à décider
        </Text>
      </View>
      <Bouton titre="+ Proposer une activité" onPress={() => navigation.navigate('Activite', { voyageId: voyage.id })} />
      <Erreur texte={erreur} />
      {activites.length === 0 && (
        <MessageVide
          titre="Aucune activité"
          texte="Château, parc d’attractions, restaurant, balade… Proposez vos idées : chacun dira s’il est partant."
        />
      )}
      {retenues.length > 0 && <Text style={styles.section}>Retenues</Text>}
      {retenues.map(carte)}
      {proposees.length > 0 && <Text style={styles.section}>Propositions</Text>}
      {proposees.map(carte)}
      {ecartees.length > 0 && <Text style={styles.section}>Écartées</Text>}
      {ecartees.map(carte)}
      <Aide>« Ne vient pas » retire la personne du coût de l’activité ; sans réponse, elle est comptée.</Aide>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  resume: {
    alignItems: 'center',
    gap: 2,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.accentTransparent,
  },
  resumeLibelle: { fontFamily: theme.fontBodyBold, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', color: theme.colors.textMuted },
  resumeMontant: { fontFamily: theme.fontTitle, fontSize: 30, color: theme.colors.text },
  section: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.text, marginTop: theme.spacing.md },
  carte: {
    gap: 4,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  photo: { width: '100%', height: 140, borderRadius: theme.radii.md, marginBottom: theme.spacing.xs },
  carteRetenue: { borderColor: theme.colors.success, borderWidth: 2 },
  carteEcartee: { opacity: 0.7 },
  haut: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categorie: {
    flex: 1,
    fontFamily: theme.fontBodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.colors.textMuted,
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 21, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  description: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  cout: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  lien: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 32 },
  lienTexte: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.accent },
  avis: { gap: 4, marginTop: theme.spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
}));
