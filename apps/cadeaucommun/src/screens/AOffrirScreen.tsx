import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  formaterDate,
  formaterPrix,
  libellePrix,
  joursAvant,
  libelleCompteARebours,
  listerPersonnes,
  marquerAchete,
  mesReservations,
  type MaReservation,
  type Personne,
} from '../services/wishlist';
import { Chargement, MessageVide, Pastille } from '../components/ui';

// Onglet "À offrir" : tout ce que j'ai réservé, regroupé par événement, avec
// ce qui reste à acheter et le budget. Personne d'autre ne voit cet écran.
export default function AOffrirScreen({ navigation }: any) {
  const { foyersFamille } = useAuth();
  const [reservations, setReservations] = useState<MaReservation[] | null>(null);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [rechargement, setRechargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setErreur(null);
      const [r, p] = await Promise.all([mesReservations(), listerPersonnes(foyersFamille)]);
      setReservations(r);
      setPersonnes(p);
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Chargement impossible.'));
      setReservations([]);
    }
  }, [foyersFamille]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (reservations === null) return <Chargement />;

  const basculerAchat = async (r: MaReservation) => {
    // Mise à jour immédiate à l'écran, puis enregistrement.
    setReservations((liste) => liste?.map((x) => (x.id === r.id ? { ...x, achete: !r.achete } : x)) ?? null);
    try {
      await marquerAchete(r.id, !r.achete);
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Enregistrement impossible.'));
      charger();
    }
  };

  // Regroupement par événement, les plus proches d'abord (passés à la fin).
  const groupes = new Map<string, { titre: string; date: string; lignes: MaReservation[] }>();
  reservations.forEach((r) => {
    const ev = r.souhait?.liste?.evenement;
    const cle = ev?.id ?? 'autre';
    if (!groupes.has(cle)) groupes.set(cle, { titre: ev?.titre ?? 'Autre', date: ev?.date_evenement ?? '', lignes: [] });
    groupes.get(cle)!.lignes.push(r);
  });
  const ordre = [...groupes.values()].sort((a, b) => {
    const pa = a.date && joursAvant(a.date) < 0;
    const pb = b.date && joursAvant(b.date) < 0;
    if (pa !== pb) return pa ? 1 : -1;
    return a.date.localeCompare(b.date);
  });

  const prenomDe = (personneId?: string) => personnes.find((p) => p.id === personneId)?.prenom || 'un proche';

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.contenu}
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
    >
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      {reservations.length === 0 ? (
        <MessageVide
          titre="Rien à offrir pour l'instant"
          texte="Réservez un cadeau dans la liste d'un proche : il apparaîtra ici. Vous seul le voyez."
        />
      ) : (
        ordre.map((g) => {
          const total = g.lignes.reduce((s, r) => s + (r.souhait?.prix ?? 0) * r.quantite, 0);
          const restants = g.lignes.filter((r) => !r.achete).length;
          return (
            <View key={g.titre + g.date} style={styles.groupe}>
              <View style={styles.groupeEntete}>
                <View style={styles.groupeTextes}>
                  <Text style={styles.groupeTitre}>{g.titre}</Text>
                  {g.date ? <Text style={styles.detail}>{formaterDate(g.date)}</Text> : null}
                </View>
                {g.date ? <Pastille texte={libelleCompteARebours(g.date)} /> : null}
              </View>
              <Text style={styles.detail}>
                {restants === 0 ? 'Tout est acheté' : `${restants} à acheter`}
                {total > 0 ? ` · budget ${formaterPrix(total)}` : ''}
              </Text>
              {g.lignes.map((r) => (
                <View key={r.id} style={styles.ligne}>
                  <Pressable
                    onPress={() => basculerAchat(r)}
                    style={styles.case}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: r.achete }}
                    accessibilityLabel={`${r.souhait?.titre ?? 'Cadeau'} acheté`}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={r.achete ? 'checkbox' : 'square-outline'}
                      size={26}
                      color={r.achete ? theme.colors.success : theme.colors.textMuted}
                    />
                  </Pressable>
                  <Pressable
                    style={styles.ligneTextes}
                    onPress={() => r.souhait?.liste && navigation.navigate('Liste', { listeId: r.souhait.liste.id })}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.ligneTitre, r.achete && styles.barre]}>
                      {r.souhait?.titre ?? 'Cadeau'}
                      {r.quantite > 1 ? ` ×${r.quantite}` : ''}
                    </Text>
                    <Text style={styles.detail}>
                      Pour {prenomDe(r.souhait?.liste?.destinataire_id)}
                      {r.souhait?.prix != null ? ` · ${libellePrix(r.souhait.prix, r.souhait.type_prix)}` : ''}
                      {r.souhait?.secret ? ' · idée de la famille' : ''}
                    </Text>
                    {r.souhait?.supprime_le && (
                      <Text style={styles.alerte}>Retiré de sa liste depuis : vérifiez avant d'acheter.</Text>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  groupe: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  groupeEntete: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  groupeTextes: { flex: 1 },
  groupeTitre: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
  },
  case: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ligneTextes: { flex: 1, gap: 2, minHeight: 44, justifyContent: 'center' },
  ligneTitre: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  barre: { textDecorationLine: 'line-through', color: theme.colors.textMuted },
  detail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  alerte: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.warning },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
