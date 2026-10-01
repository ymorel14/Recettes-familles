import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { listerPersonnesParIds, type Personne } from '../services/personnes';
import { formaterEuros, lireEntier, listerHebergements, type Hebergement } from '../services/hebergements';
import { ageA, AGE_ADULTE, calculerBudget } from '../services/budget';
import { fenetrePeriode } from '../services/dates';
import { listerTrajets, type Trajet } from '../services/transport';
import { listerActivites, type Activite } from '../services/activites';
import { versIso } from '../services/calendrier';
import {
  estOrganisateur,
  libelle,
  listerPostes,
  messageErreurVoyage,
  modifierVoyage,
  obtenirVoyage,
  REPARTITIONS,
  type Poste,
  type Repartition,
  type VoyageAvecParticipants,
} from '../services/voyage';
import { Aide, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton, Chargement, MessageVide } from '../components/ui';

type Donnees = {
  voyage: VoyageAvecParticipants;
  personnes: Personne[]; // invités attendus (hors déclinés)
  hebergements: Hebergement[];
  postes: Poste[];
  trajets: Trajet[];
  activites: Activite[];
};

// Budget du voyage : hébergement + dépenses diverses, part de chacun, et
// "qui paie combien" par foyer. Transport et activités s'ajouteront en
// phase 2.
export default function BudgetScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const { session } = useAuth();
  const moiId = session?.user.id ?? '';

  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nuits, setNuits] = useState('');

  const charger = useCallback(async () => {
    try {
      const [voyage, hebergements, postes, trajets, activites] = await Promise.all([
        obtenirVoyage(voyageId),
        listerHebergements(voyageId),
        listerPostes(voyageId),
        listerTrajets(voyageId),
        listerActivites(voyageId),
      ]);
      const attendus = voyage.participants.filter((p) => p.reponse !== 'decline').map((p) => p.personne_id);
      const personnes = await listerPersonnesParIds(attendus);
      setDonnees({ voyage, personnes, hebergements, postes, trajets, activites });
      setNuits(voyage.nb_nuits == null ? '' : String(voyage.nb_nuits));
    } catch (e) {
      setErreurChargement(messageErreurVoyage(e));
    }
  }, [voyageId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (erreurChargement) return <MessageVide titre="Budget indisponible" texte={erreurChargement} />;
  if (!donnees) return <Chargement />;
  const { voyage, personnes, hebergements, postes, trajets, activites } = donnees;

  const maPersonneId = personnes.find((p) => p.utilisateur_id === moiId)?.id ?? null;
  const organisateur = estOrganisateur(voyage, moiId, maPersonneId);
  const dateReference = voyage.date_debut ?? versIso(fenetrePeriode(voyage.periode, voyage.annee).debut);
  const r = calculerBudget({
    nuits: voyage.nb_nuits,
    repartition: voyage.repartition,
    dateReference,
    personnes,
    hebergements,
    postes,
    trajets,
    activites,
  });
  const enfants = personnes.filter((p) => p.date_naissance && ageA(p.date_naissance, dateReference) < AGE_ADULTE);

  const agir = async (action: () => Promise<void>) => {
    setErreur(null);
    try {
      await action();
      await charger();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
    }
  };

  const enregistrerNuits = () => {
    const n = lireEntier(nuits);
    if (n === null || n > 365) return setErreur('Nombre de nuits invalide.');
    agir(() => modifierVoyage(voyage.id, { nb_nuits: n }));
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <View style={styles.resume}>
        <Text style={styles.resumeLibelle}>Budget estimé</Text>
        <Text style={styles.total}>{formaterEuros(r.total)}</Text>
        <Text style={styles.resumeDetail}>
          {r.nbPersonnes} personne{r.nbPersonnes > 1 ? 's' : ''} · {r.nuits ?? '?'} nuit{(r.nuits ?? 0) > 1 ? 's' : ''}
          {voyage.date_debut ? '' : ' (estimation)'}
          {r.moyenParPersonne !== null && r.nbPersonnes > 0 ? ` · ${formaterEuros(r.moyenParPersonne)} par personne en moyenne` : ''}
        </Text>
      </View>

      {r.avertissements.map((a) => (
        <View key={a} style={styles.avertissement}>
          <Ionicons name="information-circle-outline" size={18} color={theme.colors.textMuted} />
          <Text style={styles.detail}>{a}</Text>
        </View>
      ))}

      <View style={styles.sousTotaux}>
        {[
          { libelle: 'Hébergement', montant: r.hebergement.montant ?? 0, ecran: 'Hebergements' },
          { libelle: 'Transport', montant: r.transport, ecran: 'Transport' },
          { libelle: 'Loisirs', montant: r.loisirs, ecran: 'Activites' },
          {
            libelle: 'Divers',
            montant: r.lignes.filter((l) => l.poste === 'divers').reduce((s, l) => s + l.montant, 0),
            ecran: null,
          },
        ].map((b) => (
          <Pressable
            key={b.libelle}
            style={styles.sousTotal}
            disabled={!b.ecran}
            onPress={() => b.ecran && navigation.navigate(b.ecran, { voyageId: voyage.id })}
            accessibilityRole={b.ecran ? 'button' : undefined}
          >
            <Text style={styles.sousTotalLibelle}>{b.libelle}</Text>
            <Text style={styles.sousTotalMontant}>{formaterEuros(b.montant)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Qui paie combien</Text>
      <View style={styles.bloc}>
        {r.parFoyer.map((f) => (
          <View key={f.foyer_id} style={styles.ligneFoyer}>
            <View style={{ flex: 1 }}>
              <Text style={styles.foyerNom}>{f.foyer_nom}</Text>
              <Text style={styles.detail}>{f.personnes.join(', ')}</Text>
            </View>
            <Text style={styles.montant}>{formaterEuros(f.montant)}</Text>
          </View>
        ))}
        <Text style={styles.aide}>
          Frais communs {libelle(REPARTITIONS, voyage.repartition).toLowerCase()}
          {r.partCommune !== null
            ? ` : ${formaterEuros(r.partCommune, true)} par ${voyage.repartition === 'par_foyer' ? 'foyer' : 'personne qui paie'}`
            : ''}
          .
          {voyage.repartition === 'par_adulte' && enfants.length > 0
            ? ` Gratuit pour ${enfants.map((e) => `${e.prenom} (${ageA(e.date_naissance!, dateReference)} ans)`).join(', ')}.`
            : ''}
        </Text>
        {voyage.repartition === 'par_adulte' && r.agesInconnus.length > 0 && (
          <Text style={styles.aide}>
            Sans date de naissance, comptés adultes : {r.agesInconnus.join(', ')} (la date se renseigne dans le Profil).
          </Text>
        )}
      </View>

      <Text style={styles.section}>Détail</Text>
      <View style={styles.bloc}>
        {r.lignes.length === 0 && <Text style={styles.detail}>Rien de chiffré pour l’instant.</Text>}
        {r.lignes.map((l, i) => {
          const poste = l.posteId ? postes.find((p) => p.id === l.posteId) : undefined;
          const contenu = (
            <>
              <Ionicons
                name={
                  l.poste === 'hebergement'
                    ? 'home-outline'
                    : l.poste === 'transport'
                      ? 'car-outline'
                      : l.poste === 'activite'
                        ? 'ticket-outline'
                        : 'receipt-outline'
                }
                size={18}
                color={theme.colors.accent}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.ligneLibelle}>{l.libelle}</Text>
                <Text style={styles.detail}>
                  {l.detail}
                  {l.commun ? ' · frais communs' : l.poste === 'transport' ? ' · partagé entre les passagers' : l.poste === 'activite' ? '' : ' · à la charge de chacun'}
                </Text>
              </View>
              <Text style={styles.montant}>{formaterEuros(l.montant)}</Text>
            </>
          );
          return organisateur && poste ? (
            <Pressable
              key={i}
              style={styles.ligne}
              onPress={() => navigation.navigate('Poste', { voyageId: voyage.id, poste })}
              accessibilityRole="button"
              accessibilityLabel={`Modifier ${l.libelle}`}
            >
              {contenu}
            </Pressable>
          ) : (
            <View key={i} style={styles.ligne}>
              {contenu}
            </View>
          );
        })}
        {r.hebergement.fourchette && (
          <Text style={styles.aide}>
            Aucun hébergement retenu : propositions entre {formaterEuros(r.hebergement.fourchette[0])} et{' '}
            {formaterEuros(r.hebergement.fourchette[1])}.
          </Text>
        )}
      </View>
      {organisateur && (
        <Bouton
          titre="+ Ajouter une dépense"
          variante="pointille"
          onPress={() => navigation.navigate('Poste', { voyageId: voyage.id })}
        />
      )}

      {organisateur && (
        <>
          <Text style={styles.section}>Réglages</Text>
          <Libelle>Partage des frais communs</Libelle>
          <Puces
            options={REPARTITIONS}
            valeur={voyage.repartition}
            onChange={(rep: Repartition) => agir(() => modifierVoyage(voyage.id, { repartition: rep }))}
          />
          {!voyage.date_debut && (
            <>
              <Libelle nativeID="libelle-nuits">Nombre de nuits (estimation)</Libelle>
              <View style={styles.ligneNuits}>
                <Champ
                  value={nuits}
                  onChangeText={setNuits}
                  keyboardType="number-pad"
                  accessibilityLabelledBy="libelle-nuits"
                  style={{ flex: 1 }}
                />
                <Bouton titre="Mettre à jour" variante="contour" onPress={enregistrerNuits} />
              </View>
              <Aide>Une fois les dates retenues, le nombre de nuits suit les dates.</Aide>
            </>
          )}
        </>
      )}
      <Erreur texte={erreur} />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  resume: {
    alignItems: 'center',
    gap: 2,
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.accentTransparent,
  },
  resumeLibelle: { fontFamily: theme.fontBodyBold, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', color: theme.colors.textMuted },
  total: { fontFamily: theme.fontTitle, fontSize: 36, color: theme.colors.text },
  resumeDetail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
  sousTotaux: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  sousTotal: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  sousTotalLibelle: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  sousTotalMontant: { fontFamily: theme.fontBodyBold, fontSize: 18, color: theme.colors.text },
  avertissement: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  section: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.text, marginTop: theme.spacing.md },
  bloc: {
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  ligneFoyer: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  foyerNom: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  montant: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 40 },
  ligneLibelle: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, flexShrink: 1 },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  ligneNuits: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' },
}));
