import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import {
  evenementsPourMoi,
  estActif,
  libelle,
  libelleQuand,
  listerVoyages,
  messageErreurVoyage,
  PARTICIPATIONS,
  STATUTS,
  TYPES_SEJOUR,
  type EvenementPourMoi,
  type VoyageAvecParticipants,
} from '../services/voyage';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';
import { listerPersonnes } from '../services/personnes';
import { GroupeNoms } from '@apps-famille/famille';

// Onglet "Voyages" : les voyages de la famille active auxquels on a accès
// (la base ne renvoie jamais un voyage privé auquel on n'est pas invité),
// ceux en cours d'abord, puis les terminés et annulés.
export default function VoyagesScreen({ navigation }: any) {
  const { famille, foyersFamille } = useAuth();
  const [voyages, setVoyages] = useState<VoyageAvecParticipants[] | null>(null);
  const [rechargement, setRechargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [foyers, setFoyers] = useState<Map<string, string>>(new Map());
  const [prenoms, setPrenoms] = useState<Map<string, string>>(new Map());
  // Événements organisés pour moi (surprise) : je sais qu'ils existent, sans
  // en voir le contenu.
  const [pourMoi, setPourMoi] = useState<EvenementPourMoi[]>([]);

  const charger = useCallback(async () => {
    if (!famille) return;
    try {
      setErreur(null);
      const [liste, fetes, personnes] = await Promise.all([
        listerVoyages(famille.id),
        evenementsPourMoi(famille.id).catch(() => [] as EvenementPourMoi[]),
        listerPersonnes(foyersFamille).catch(() => []),
      ]);
      setVoyages(liste);
      setPourMoi(fetes.filter((e) => e.statut !== 'annule'));
      setFoyers(new Map(personnes.filter((p) => p.foyer_id && p.foyer_nom).map((p) => [p.foyer_id!, p.foyer_nom!])));
      setPrenoms(new Map(personnes.map((p) => [p.id, p.prenom])));
    } catch (e: any) {
      setErreur(messageErreurVoyage(e));
      setVoyages([]);
    }
  }, [famille, foyersFamille]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (voyages === null) return <Chargement />;

  const enCours = voyages.filter(estActif);
  const autres = voyages.filter((v) => !estActif(v));
  const lignes = [...enCours, ...autres];

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
        <View style={styles.entete}>
          <View style={styles.boutons}>
            <Bouton
              titre="+ Un voyage"
              onPress={() => navigation.navigate('NouveauVoyage', { nature: 'voyage' })}
              style={styles.boutonMoitie}
            />
            <Bouton
              titre="+ Un repas"
              variante="contour"
              onPress={() => navigation.navigate('NouveauVoyage', { nature: 'repas' })}
              style={styles.boutonMoitie}
            />
          </View>
          {erreur && <Text style={styles.erreur}>{erreur}</Text>}
          {pourMoi.length > 0 && <Text style={styles.section}>Organisé pour vous</Text>}
          {pourMoi.map((e) => (
            <View key={e.id} style={[styles.carte, styles.cartePourMoi]} accessibilityLabel={`Organisé pour vous : ${e.titre}`}>
              <View style={styles.carteHaut}>
                <Text style={styles.type}>{e.nature === 'repas' ? 'Repas en votre honneur' : 'Une surprise vous attend'}</Text>
                <Ionicons name="gift-outline" size={20} color={theme.colors.accent} />
              </View>
              <Text style={styles.titre}>{e.titre}</Text>
              <View style={styles.ligne}>
                <Ionicons name="calendar-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.detail}>{libelleQuand(e)}</Text>
              </View>
              <View style={styles.ligne}>
                <Ionicons name={e.nature === 'repas' ? 'restaurant-outline' : 'location-outline'} size={16} color={theme.colors.textMuted} />
                <Text style={styles.detail}>
                  {e.nature === 'repas'
                    ? e.foyer_hote
                      ? `Chez ${foyers.get(e.foyer_hote) ?? 'un foyer de la famille'}`
                      : e.lieu ?? 'Lieu à venir'
                    : 'Destination surprise'}
                </Text>
              </View>
              {e.message ? <Text style={styles.message}>« {e.message} »</Text> : null}
              <Text style={styles.detail}>Le reste est une surprise : vous n’en saurez pas plus d’ici là.</Text>
            </View>
          ))}
          {pourMoi.length > 0 && lignes.length > 0 && <Text style={styles.section}>Vos voyages et repas</Text>}
        </View>
      }
      ListEmptyComponent={
        erreur || pourMoi.length > 0 ? null : (
          <MessageVide
            titre="Rien de prévu pour l'instant"
            texte="Proposez un voyage (une destination ou juste une période) ou un repas de famille : chacun donnera ses disponibilités."
          />
        )
      }
      renderItem={({ item, index }) => {
        const actif = estActif(item);
        const premierAutre = !actif && index === enCours.length;
        const partants = item.participants.filter((p) => p.reponse === 'partant').length;
        const invites = item.participants.filter((p) => p.reponse !== 'decline').length;
        return (
          <>
            {premierAutre && <Text style={styles.section}>Terminés et annulés</Text>}
            <Pressable
              style={[styles.carte, !actif && styles.carteInactive]}
              onPress={() => navigation.navigate('Voyage', { voyageId: item.id })}
              accessibilityRole="button"
            >
              <View style={styles.carteHaut}>
                <Text style={styles.type}>
                  {item.nature === 'repas' ? 'Repas de famille' : libelle(TYPES_SEJOUR, item.type_sejour)} ·{' '}
                  {libelle(PARTICIPATIONS, item.participation)}
                </Text>
                <Pastille texte={libelle(STATUTS, item.statut)} ton={actif ? 'accent' : 'neutre'} />
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
                <Text style={styles.detail}>{libelleQuand(item)}</Text>
              </View>
              <View style={styles.ligne}>
                <Ionicons name="people-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.detail}>
                  {partants} partant{partants > 1 ? 's' : ''} sur {invites} invité{invites > 1 ? 's' : ''}
                </Text>
              </View>
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
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
