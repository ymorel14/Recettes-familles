import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { alerte } from '../utils/alerte';
import { formaterDate, formaterPlage, lireDateSaisie, listerPersonnesParIds, MOIS, type Personne } from '../services/personnes';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const formaterDateLongue = (iso: string) => {
  const [a, m, j] = iso.split('-').map(Number);
  return `${JOURS[new Date(a, m - 1, j).getDay()]} ${formaterDate(iso)}`;
};
import { versIso } from '../services/calendrier';
import {
  disponibilitesParticipants,
  fenetrePeriode,
  listerPropositions,
  proposerDates,
  REPONSES_VOTE,
  retirerProposition,
  suggererCreneaux,
  validerDates,
  voter,
  type PropositionDates,
  type ReponseVote,
  type Suggestion,
} from '../services/dates';
import {
  estOrganisateur,
  libelle,
  mesPersonnes,
  messageErreurVoyage,
  obtenirVoyage,
  PERIODES,
  type VoyageAvecParticipants,
} from '../services/voyage';
import { Aide, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton, Chargement, MessageVide } from '../components/ui';

type Donnees = {
  voyage: VoyageAvecParticipants;
  personnes: Map<string, Personne>;
  propositions: PropositionDates[];
  suggestions: Suggestion[];
};

// Choisir les dates : créneaux suggérés d'après le calendrier des invités,
// propositions de chacun, votes, puis un organisateur retient une plage.
export default function DatesScreen({ route }: any) {
  const voyageId: string = route.params?.voyageId;
  const { session, foyer } = useAuth();
  const moiId = session?.user.id ?? '';

  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const voyage = await obtenirVoyage(voyageId);
      const attendus = voyage.participants.filter((p) => p.reponse !== 'decline');
      const fenetre = fenetrePeriode(voyage.periode, voyage.annee);
      const [liste, propositions, dispos] = await Promise.all([
        listerPersonnesParIds(voyage.participants.map((p) => p.personne_id)),
        listerPropositions(voyageId),
        disponibilitesParticipants(voyageId, versIso(fenetre.debut), versIso(fenetre.fin)),
      ]);
      const personnes = new Map(liste.map((p) => [p.id, p]));
      const suggestions = suggererCreneaux(
        attendus.map((p) => ({ id: p.personne_id, prenom: personnes.get(p.personne_id)?.prenom ?? '?' })),
        dispos,
        fenetre,
        voyage.nature === 'repas' ? 0 : voyage.nb_nuits ?? 2
      );
      setDonnees({ voyage, personnes, propositions, suggestions });
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
    () => (donnees ? mesPersonnes([...donnees.personnes.values()], moiId, foyer?.id ?? null) : []),
    [donnees, moiId, foyer]
  );

  if (erreurChargement) return <MessageVide titre="Dates indisponibles" texte={erreurChargement} />;
  if (!donnees) return <Chargement />;
  const { voyage, personnes, propositions, suggestions } = donnees;
  const repas = voyage.nature === 'repas';
  // Repas : un seul jour s'affiche « le samedi 26 décembre 2026 ».
  const plage = (debut: string, fin: string) => (debut === fin ? `le ${formaterDateLongue(debut)}` : formaterPlage(debut, fin));

  const maPersonne = miennes.find((p) => p.utilisateur_id === moiId) ?? null;
  const organisateur = estOrganisateur(voyage, moiId, maPersonne?.id ?? null);
  const attendus = voyage.participants.filter((p) => p.reponse !== 'decline');
  const mesVotants = attendus.filter((p) => miennes.some((m) => m.id === p.personne_id));
  const nom = (id: string) => personnes.get(id)?.prenom ?? '?';
  const dejaProposee = (s: Suggestion) =>
    propositions.some((p) => p.date_debut === s.date_debut && p.date_fin === s.date_fin);

  const agir = async (action: () => Promise<void>) => {
    setErreur(null);
    setEnCours(true);
    try {
      await action();
      await charger();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
    } finally {
      setEnCours(false);
    }
  };

  const proposerSaisie = () => {
    const d = lireDateSaisie(debut);
    const f = repas && !fin.trim() ? d : lireDateSaisie(fin);
    if (!d || !f) return setErreur('Dates invalides (JJ/MM/AAAA).');
    if (repas ? f < d : f <= d) return setErreur('Le départ doit être après l’arrivée.');
    agir(async () => {
      await proposerDates(voyage.id, d, f);
      setDebut('');
      setFin('');
    });
  };

  const retenir = (p: PropositionDates) =>
    alerte(`Retenir ${plage(p.date_debut, p.date_fin)} ?`, repas ? 'La date du repas sera fixée pour tous les invités.' : 'Les dates du voyage seront fixées pour tous les invités.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retenir', onPress: () => agir(() => validerDates(p.id)) },
    ]);

  // Propositions : les plus de "oui" d'abord.
  const score = (p: PropositionDates) =>
    p.votes.filter((v) => v.reponse === 'oui').length * 2 + p.votes.filter((v) => v.reponse === 'si_besoin').length;
  const triees = [...propositions].sort((a, b) => score(b) - score(a) || a.date_debut.localeCompare(b.date_debut));

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {voyage.date_debut && voyage.date_fin ? (
        <View style={[styles.bloc, styles.blocRetenu]}>
          <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.blocTitre}>Dates retenues</Text>
            <Text style={styles.texte}>
              {plage(voyage.date_debut, voyage.date_fin)}
              {repas ? '' : ` · ${voyage.nb_nuits} nuit${(voyage.nb_nuits ?? 0) > 1 ? 's' : ''}`}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.texte}>
          {libelle(PERIODES, voyage.periode)} {voyage.annee ?? ''}
          {repas ? '' : ` · ${voyage.nb_nuits ?? 2} nuits environ`}. Proposez des
          dates, votez, puis un organisateur retient la meilleure plage.
        </Text>
      )}

      <Text style={styles.section}>Suggestions d’après le calendrier</Text>
      {suggestions.length === 0 ? (
        <Aide>Aucun créneau à suggérer sur cette période.</Aide>
      ) : (
        suggestions.map((s) => {
          const tous = s.libres === s.total && s.incertains.length === 0;
          return (
            <View key={s.date_debut} style={styles.suggestion}>
              <Ionicons
                name={tous ? 'sunny-outline' : 'partly-sunny-outline'}
                size={22}
                color={tous ? theme.colors.success : theme.colors.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.plage}>{plage(s.date_debut, s.date_fin)}</Text>
                <Text style={styles.detail}>
                  {tous
                    ? 'Personne n’a indiqué d’indisponibilité'
                    : [
                        s.indisponibles.length ? `Pris : ${s.indisponibles.join(', ')}` : '',
                        s.incertains.length ? `Peut-être : ${s.incertains.join(', ')}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </Text>
              </View>
              {dejaProposee(s) ? (
                <Text style={styles.detail}>Proposé</Text>
              ) : (
                <Bouton titre="Proposer" variante="contour" onPress={() => agir(() => proposerDates(voyage.id, s.date_debut, s.date_fin))} />
              )}
            </View>
          );
        })
      )}
      <Aide>
        Calculé sur les disponibilités que chacun a indiquées dans le calendrier : sans information, une personne est
        comptée libre.
      </Aide>

      <Text style={styles.section}>Propositions</Text>
      {triees.length === 0 && <Aide>Aucune proposition pour l’instant.</Aide>}
      {triees.map((p) => {
        const oui = p.votes.filter((v) => v.reponse === 'oui');
        const siBesoin = p.votes.filter((v) => v.reponse === 'si_besoin');
        const non = p.votes.filter((v) => v.reponse === 'non');
        const sansReponse = attendus.filter((a) => !p.votes.some((v) => v.personne_id === a.personne_id));
        const retenue = voyage.date_debut === p.date_debut && voyage.date_fin === p.date_fin;
        return (
          <View key={p.id} style={[styles.bloc, retenue && styles.bordureRetenue]}>
            <View style={styles.enteteProposition}>
              <Text style={[styles.plage, { flex: 1 }]}>{plage(p.date_debut, p.date_fin)}</Text>
              {(p.propose_par === moiId || organisateur) && !retenue && (
                <Pressable
                  onPress={() => agir(() => retirerProposition(p.id))}
                  accessibilityRole="button"
                  accessibilityLabel="Retirer cette proposition"
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={20} color={theme.colors.textMuted} />
                </Pressable>
              )}
            </View>
            <Text style={styles.detail}>
              <Text style={styles.oui}>{oui.length} oui</Text> · {siBesoin.length} si besoin · {non.length} non
            </Text>
            {oui.length + siBesoin.length + non.length > 0 && (
              <Text style={styles.detail}>
                {[
                  oui.length ? `Oui : ${oui.map((v) => nom(v.personne_id)).join(', ')}` : '',
                  siBesoin.length ? `Si besoin : ${siBesoin.map((v) => nom(v.personne_id)).join(', ')}` : '',
                  non.length ? `Non : ${non.map((v) => nom(v.personne_id)).join(', ')}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            )}
            {sansReponse.length > 0 && (
              <Text style={styles.detail}>Pas encore voté : {sansReponse.map((a) => nom(a.personne_id)).join(', ')}</Text>
            )}
            {mesVotants.map((m) => (
              <View key={m.personne_id} style={styles.vote}>
                {mesVotants.length > 1 && <Text style={styles.detail}>{nom(m.personne_id)}</Text>}
                <Puces
                  options={REPONSES_VOTE}
                  valeur={p.votes.find((v) => v.personne_id === m.personne_id)?.reponse ?? null}
                  onChange={(r: ReponseVote) => agir(() => voter(p.id, m.personne_id, r))}
                />
              </View>
            ))}
            {organisateur && !retenue && (
              <Bouton titre="Retenir ces dates" onPress={() => retenir(p)} enCours={enCours} />
            )}
            {retenue && <Text style={[styles.detail, styles.oui]}>Dates du voyage</Text>}
          </View>
        );
      })}

      <Text style={styles.section}>Proposer d’autres dates</Text>
      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-arrivee">{repas ? 'Jour' : 'Arrivée'}</Libelle>
          <Champ value={debut} onChangeText={setDebut} placeholder="JJ/MM/AAAA" accessibilityLabelledBy="libelle-arrivee" />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-depart">{repas ? 'Jusqu’au (facultatif)' : 'Départ'}</Libelle>
          <Champ value={fin} onChangeText={setFin} placeholder="JJ/MM/AAAA" accessibilityLabelledBy="libelle-depart" />
        </View>
      </View>
      <Erreur texte={erreur} />
      <Bouton titre="Proposer ces dates" variante="contour" onPress={proposerSaisie} enCours={enCours} />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  texte: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted },
  section: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.text, marginTop: theme.spacing.md },
  bloc: {
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  blocRetenu: { borderColor: theme.colors.success, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  bordureRetenue: { borderColor: theme.colors.success, borderWidth: 2 },
  blocTitre: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  plage: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  oui: { fontFamily: theme.fontBodyBold, color: theme.colors.success },
  enteteProposition: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  vote: { gap: 4, marginTop: theme.spacing.xs },
  ligne: { flexDirection: 'row', gap: theme.spacing.md },
  colonne: { flex: 1, gap: theme.spacing.sm },
}));
