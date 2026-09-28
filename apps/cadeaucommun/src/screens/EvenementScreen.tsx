import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import { alerte } from '../utils/alerte';
import {
  creerListe,
  formaterDate,
  libelleCompteARebours,
  listerListesEvenement,
  listerPersonnes,
  obtenirEvenement,
  obtenirMaPersonne,
  supprimerEvenement,
  type Evenement,
  type Liste,
  type Personne,
} from '../services/wishlist';
import { Bouton, Chargement, Pastille } from '../components/ui';

// Un événement et ses listes de souhaits, toutes nommées : "Ma liste
// (Yves)", "La liste de Claire". On peut créer sa liste, ou celle d'un proche
// (avec ou sans compte) : la liste appartient toujours à la personne fêtée,
// et ce qu'un proche y ajoute lui reste caché.
export default function EvenementScreen({ route, navigation }: any) {
  const { evenementId } = route.params;
  const { session, foyersFamille } = useAuth();
  const [evenement, setEvenement] = useState<Evenement | null>(null);
  const [listes, setListes] = useState<Liste[]>([]);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [moi, setMoi] = useState<Personne | null>(null);
  const [choixOuvert, setChoixOuvert] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!session) return;
    try {
      const [e, l, p, m] = await Promise.all([
        obtenirEvenement(evenementId),
        listerListesEvenement(evenementId),
        listerPersonnes(foyersFamille),
        obtenirMaPersonne(session.user.id),
      ]);
      setEvenement(e);
      setListes(l);
      setPersonnes(p);
      setMoi(m);
    } catch (err) {
      setErreur(extraireMessageErreur(err, 'Chargement impossible.'));
    }
  }, [evenementId, session, foyersFamille]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!evenement) return erreur ? <Text style={styles.erreur}>{erreur}</Text> : <Chargement />;

  const personne = (id: string | null) => personnes.find((p) => p.id === id) ?? null;
  const prenomDe = (id: string | null) => personne(id)?.prenom || 'Quelqu’un';
  const listeDe = (personneId: string) => listes.find((l) => l.destinataire_id === personneId);
  const fete = personne(evenement.destinataire_id);
  const maListe = moi ? listeDe(moi.id) : undefined;
  // Personnes de la famille sans liste pour cet événement.
  const sansListe = personnes.filter((p) => !listeDe(p.id));

  const nouvelleListe = async (destinataire: Personne) => {
    if (!session) return;
    setErreur(null);
    setEnCours(destinataire.id);
    try {
      const pourMoi = destinataire.id === moi?.id;
      const id = await creerListe(evenement.id, destinataire.id, session.user.id, pourMoi ? 'brouillon' : 'publiee');
      setChoixOuvert(false);
      navigation.navigate('Liste', { listeId: id });
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de créer la liste.'));
    } finally {
      setEnCours(null);
    }
  };

  const supprimer = () =>
    alerte('Supprimer l’événement ?', 'Toutes ses listes, souhaits et réservations seront supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerEvenement(evenement.id);
            navigation.goBack();
          } catch (e) {
            setErreur(extraireMessageErreur(e, 'Suppression impossible.'));
          }
        },
      },
    ]);

  const carteListe = (l: Liste) => {
    const estMoi = l.destinataire_id === moi?.id;
    const p = personne(l.destinataire_id);
    return (
      <Pressable
        key={l.id}
        style={[styles.carte, estMoi && styles.carteMoi]}
        onPress={() => navigation.navigate('Liste', { listeId: l.id })}
        accessibilityRole="button"
      >
        <View style={styles.carteLigne}>
          <Ionicons
            name={estMoi ? 'heart-outline' : 'gift-outline'}
            size={22}
            color={estMoi ? theme.colors.accent : theme.colors.textMuted}
          />
          <View style={styles.carteTextes}>
            <Text style={styles.carteTitre}>
              {estMoi ? `Ma liste (${p?.prenom || 'moi'})` : `La liste de ${prenomDe(l.destinataire_id)}`}
            </Text>
            <Text style={styles.carteDetail}>
              {estMoi
                ? l.statut === 'brouillon'
                  ? 'Brouillon : pas encore visible par la famille'
                  : 'Visible par la famille · vous ne voyez pas les réservations'
                : !p?.utilisateur_id
                  ? 'Sans compte · remplie par ses parents'
                  : l.statut === 'brouillon'
                    ? 'Brouillon'
                    : 'Réservez un cadeau ou proposez une idée cachée'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
        </View>
      </Pressable>
    );
  };

  // Ordre : ma liste d'abord, puis celle de la personne fêtée, puis les autres.
  const listesTriees = [...listes].sort((a, b) => {
    const rang = (l: Liste) => (l.destinataire_id === moi?.id ? 0 : l.destinataire_id === fete?.id ? 1 : 2);
    return rang(a) - rang(b) || prenomDe(a.destinataire_id).localeCompare(prenomDe(b.destinataire_id));
  });

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <View style={styles.entete}>
        <Pastille texte={libelleCompteARebours(evenement.date_evenement)} />
        <Text style={styles.titre}>{evenement.titre}</Text>
        <Text style={styles.date}>
          {formaterDate(evenement.date_evenement)}
          {fete ? ` · pour ${fete.id === moi?.id ? 'vous' : fete.prenom}` : ' · toute la famille'}
        </Text>
      </View>

      {listesTriees.length === 0 ? (
        <Text style={styles.aide}>Aucune liste pour l'instant.</Text>
      ) : (
        listesTriees.map(carteListe)
      )}

      {/* Événement collectif : je crée ma liste. Événement personnel : la
          liste de la personne fêtée, si elle manque. */}
      {!evenement.destinataire_id && moi && !maListe && (
        <Bouton titre="Créer ma liste" onPress={() => nouvelleListe(moi)} enCours={enCours === moi.id} />
      )}
      {fete && !listeDe(fete.id) && (
        <Bouton
          titre={fete.id === moi?.id ? 'Créer ma liste' : `Créer la liste de ${fete.prenom}`}
          onPress={() => nouvelleListe(fete)}
          enCours={enCours === fete.id}
        />
      )}

      {!evenement.destinataire_id && sansListe.some((p) => p.id !== moi?.id) && (
        <View style={styles.bloc}>
          {!choixOuvert ? (
            <Bouton variante="pointille" titre="+ Créer la liste d’un proche" onPress={() => setChoixOuvert(true)} />
          ) : (
            <>
              <Text style={styles.aide}>
                La liste appartiendra à cette personne : si elle a un compte, elle y ajoutera ses souhaits, et ce que
                vous y mettez lui restera caché.
              </Text>
              {sansListe
                .filter((p) => p.id !== moi?.id)
                .map((p) => (
                  <Bouton
                    key={p.id}
                    variante="contour"
                    titre={`Liste de ${p.prenom || 'sans prénom'}${p.utilisateur_id ? '' : ' (sans compte)'}`}
                    onPress={() => nouvelleListe(p)}
                    enCours={enCours === p.id}
                  />
                ))}
              <Bouton variante="discret" titre="Annuler" onPress={() => setChoixOuvert(false)} />
            </>
          )}
        </View>
      )}

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      {session && evenement.cree_par === session.user.id && (
        <Bouton variante="discret" titre="Supprimer l’événement" onPress={supprimer} />
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  entete: {
    gap: 4,
    paddingBottom: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 30, color: theme.colors.text },
  date: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted },
  bloc: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    minHeight: 44,
  },
  carteMoi: { borderColor: theme.colors.accent },
  carteLigne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  carteTextes: { flex: 1, gap: 2 },
  carteTitre: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.text },
  carteDetail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, lineHeight: 19 },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning, padding: theme.spacing.md },
}));
