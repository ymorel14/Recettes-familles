import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import {
  estActif,
  libelle,
  libelleQuand,
  listerVoyages,
  messageErreurVoyage,
  mesPersonnes,
  repondre,
  STATUTS,
  type NatureVoyage,
  type ReponseInvite,
  type VoyageAvecParticipants,
} from '../services/voyage';
import { Chargement, MessageVide, Pastille } from '../components/ui';
import { listerPersonnes } from '../services/personnes';
import { GroupeNoms } from '@apps-famille/famille';
import { useFamillesVues } from '../../../services/familles';

// Refonte Événements (§ 3 et 4) : une seule liste pour les deux onglets,
// filtrée par nature. « À venir » d'abord (triés par date, sans date à la
// fin), puis « Terminés » repliés. La base ne renvoie jamais un événement
// auquel on n'est pas invité, ni une surprise dont on est la cible : il n'y a
// donc plus de carte « Organisé pour vous », qui trahirait la surprise.
export default function VoyagesScreen({ navigation }: any) {
  return <ListeEvenements navigation={navigation} nature="voyage" />;
}

const REPONSES_REPAS: { id: ReponseInvite; libelle: string }[] = [
  { id: 'partant', libelle: 'Oui' },
  { id: 'peut_etre', libelle: 'Peut-être' },
  { id: 'decline', libelle: 'Non' },
];

// Jour de la semaine + date, ex. « samedi 21 novembre ».
function jourLong(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function ListeEvenements({ navigation, nature }: { navigation: any; nature: NatureVoyage }) {
  const { famille, foyersFamille, session, foyer } = useAuth();
  const repas = nature === 'repas';
  // Toutes les familles du foyer (vue unique, retour de test G-2).
  const famillesVues = useFamillesVues();
  const [voyages, setVoyages] = useState<VoyageAvecParticipants[] | null>(null);
  const [rechargement, setRechargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [foyers, setFoyers] = useState<Map<string, string>>(new Map());
  const [prenoms, setPrenoms] = useState<Map<string, string>>(new Map());
  const [personnesIds, setPersonnesIds] = useState<string[]>([]);
  const [termines, setTermines] = useState(false);

  const charger = useCallback(async () => {
    if (!famille) return;
    try {
      setErreur(null);
      const [liste, personnes] = await Promise.all([
        listerVoyages(famillesVues),
        listerPersonnes(foyersFamille).catch(() => []),
      ]);
      setVoyages(liste.filter((v) => v.nature === nature));
      if (session) setPersonnesIds(mesPersonnes(personnes, session.user.id, foyer?.id ?? null).map((p) => p.id));
      setFoyers(new Map(personnes.filter((p) => p.foyer_id && p.foyer_nom).map((p) => [p.foyer_id!, p.foyer_nom!])));
      setPrenoms(new Map(personnes.map((p) => [p.id, p.prenom])));
    } catch (e: any) {
      setErreur(messageErreurVoyage(e));
      setVoyages([]);
    }
  }, [famille, foyersFamille, famillesVues, nature, session, foyer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (voyages === null) return <Chargement />;

  // À venir : par date de début, puis les événements sans date à la fin.
  const aVenir = voyages
    .filter(estActif)
    .sort((a, b) => (a.date_debut ?? '9999').localeCompare(b.date_debut ?? '9999'));
  const passes = voyages.filter((v) => !estActif(v));
  const lignes = termines ? [...aVenir, ...passes] : aVenir;
  const enCours = aVenir;

  const repondreRepas = async (v: VoyageAvecParticipants, reponse: ReponseInvite) => {
    try {
      await Promise.all(
        v.participants.filter((p) => personnesIds.includes(p.personne_id)).map((p) => repondre(v.id, p.personne_id, reponse))
      );
      await charger();
    } catch (e: any) {
      setErreur(messageErreurVoyage(e));
    }
  };

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.contenu}
      data={lignes}
      keyExtractor={(v) => v.id}
      refreshControl={
        <RefreshControl
          refreshing={rechargement}
          onRefresh={async () => {
            setRechargement(true);
            await charger();
            setRechargement(false);
          }}
          tintColor={theme.colors.accent}
        />
      }
      ListHeaderComponent={
        erreur ? (
          <View style={styles.entete}>
            <Text style={styles.erreur}>{erreur}</Text>
          </View>
        ) : null
      }
      ListFooterComponent={
        <View style={{ gap: theme.spacing.sm }}>
          {passes.length > 0 ? (
            <Pressable onPress={() => setTermines((t) => !t)} accessibilityRole="button" style={styles.replie}>
              <Text style={styles.section}>
                {repas ? 'Passés' : 'Terminés'} · {passes.length} · {termines ? 'masquer' : 'voir'}
              </Text>
            </Pressable>
          ) : null}
          <Text style={styles.aide}>
            {repas ? 'Pour proposer un repas, touchez + en bas.' : 'Pour proposer un voyage, touchez + en bas.'}
          </Text>
        </View>
      }
      ListEmptyComponent={
        erreur ? null : (
          <MessageVide
            titre="Rien de prévu pour l'instant"
            texte={
              repas
                ? 'Proposez un repas de famille : chacun répondra et choisira ce qu’il apporte.'
                : 'Proposez un voyage (une destination ou juste une période) : chacun donnera ses disponibilités.'
            }
          />
        )
      }
      renderItem={({ item, index }) => {
        const actif = estActif(item);
        const premierAutre = !actif && index === enCours.length;
        const maReponse = item.participants.find((p) => personnesIds.includes(p.personne_id))?.reponse;
        const partants = item.participants.filter((p) => p.reponse === 'partant').length;
        const invites = item.participants.filter((p) => p.reponse !== 'decline').length;
        return (
          <>
            {premierAutre && <Text style={styles.section}>{repas ? 'Passés' : 'Terminés et annulés'}</Text>}
            <Pressable
              style={[styles.carte, !actif && styles.carteInactive]}
              onPress={() => navigation.navigate('Voyage', { voyageId: item.id })}
              accessibilityRole="button"
            >
              <View style={styles.carteHaut}>
                <Text style={styles.type}>{repas ? 'Repas de famille' : 'Voyage'}</Text>
                <Pastille texte={libelle(STATUTS, item.statut)} ton={item.statut === 'confirme' ? 'succes' : actif ? 'accent' : 'neutre'} />
              </View>
              <Text style={styles.titre}>{item.titre}</Text>
              {item.secrets.length > 0 && (
                <View style={styles.ligne}>
                  <Ionicons name="gift-outline" size={16} color={theme.colors.accent} />
                  <GroupeNoms
                    style={{ flex: 1 }}
                    prefixe="Surprise pour"
                    suffixe=": chut !"
                    personnes={item.secrets.map((s) => ({
                      personneId: s.personne_id,
                      prenom: prenoms.get(s.personne_id) ?? 'quelqu’un',
                    }))}
                    styleTexte={styles.surprise}
                  />
                </View>
              )}
              <View style={styles.ligne}>
                <Ionicons
                  name={item.nature === 'repas' ? 'restaurant-outline' : 'location-outline'}
                  size={16}
                  color={theme.colors.textMuted}
                />
                <Text style={[styles.detail, !item.destination && !item.foyer_hote && styles.aChoisir]}>
                  {item.nature === 'repas'
                    ? item.foyer_hote
                      ? `Chez ${foyers.get(item.foyer_hote) ?? 'un foyer de la famille'}`
                      : item.destination ?? 'Lieu à décider'
                    : item.destination ?? 'Destination à choisir'}
                </Text>
              </View>
              <View style={styles.ligne}>
                <Ionicons name="calendar-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.detail}>
                  {repas && item.date_debut ? jourLong(item.date_debut) : libelleQuand(item)}
                </Text>
              </View>
              <View style={styles.ligne}>
                <Ionicons name="people-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.detail}>
                  {repas
                    ? `${partants} oui sur ${invites} invité${invites > 1 ? 's' : ''}`
                    : `${partants} partant${partants > 1 ? 's' : ''} sur ${invites} invité${invites > 1 ? 's' : ''}`}
                </Text>
              </View>
              {repas && actif && maReponse === 'invite' ? (
                <View style={styles.reponses}>
                  {REPONSES_REPAS.map((r) => (
                    <Pressable
                      key={r.id}
                      onPress={() => repondreRepas(item, r.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${r.libelle}, je viens au repas ${item.titre}`}
                      style={styles.boutonReponse}
                    >
                      <Text style={styles.boutonReponseTexte}>{r.libelle}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Pressable>
          </>
        );
      }}
    />
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  boutons: { flexDirection: 'row', gap: theme.spacing.sm },
  boutonMoitie: { flex: 1 },
  entete: { gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  section: {
    fontFamily: theme.fontTitle,
    fontSize: 18,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: 4,
  },
  carteInactive: { opacity: 0.7 },
  cartePourMoi: { borderColor: theme.colors.accent, borderStyle: 'dashed' },
  message: { fontFamily: theme.fontManuscrit, fontSize: 16, color: theme.colors.text },
  surprise: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  carteHaut: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm },
  type: {
    flexShrink: 1,
    fontFamily: theme.fontBodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.colors.textMuted,
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 22, color: theme.colors.text },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  aChoisir: { fontStyle: 'italic' },
  replie: { minHeight: 44, justifyContent: 'center' },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
  reponses: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  boutonReponse: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.selection,
  },
  boutonReponseTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
