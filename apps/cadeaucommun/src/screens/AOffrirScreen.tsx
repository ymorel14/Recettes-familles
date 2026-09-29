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
  marquerVerse,
  mesParticipations,
  mesReservations,
  type MaParticipation,
  type MaReservation,
  type Personne,
  dateCle,
  libelleDates,
} from '../services/wishlist';
import { Chargement, MessageVide, Pastille } from '../components/ui';

// Onglet "À offrir" : tout ce que j'ai réservé et mes participations aux
// pots communs, regroupés par événement, avec ce qui reste à acheter ou à
// verser et le budget. Personne d'autre ne voit cet écran.
export default function AOffrirScreen({ navigation }: any) {
  const { foyersFamille } = useAuth();
  const [reservations, setReservations] = useState<MaReservation[] | null>(null);
  const [participations, setParticipations] = useState<MaParticipation[]>([]);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [rechargement, setRechargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setErreur(null);
      const [r, pa, p] = await Promise.all([mesReservations(), mesParticipations(), listerPersonnes(foyersFamille)]);
      setReservations(r);
      setParticipations(pa);
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

  const basculerVerse = async (p: MaParticipation) => {
    setParticipations((liste) => liste.map((x) => (x.id === p.id ? { ...x, verse: !p.verse } : x)));
    try {
      await marquerVerse(p.id, !p.verse);
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Enregistrement impossible.'));
      charger();
    }
  };

  // Regroupement par événement, les plus proches d'abord (passés à la fin).
  type Groupe = { titre: string; date: string; libelle: string; lignes: MaReservation[]; pots: MaParticipation[] };
  const groupes = new Map<string, Groupe>();
  const groupeDe = (souhait: MaReservation['souhait']) => {
    const ev = souhait?.liste?.evenement;
    const cle = ev?.id ?? 'autre';
    if (!groupes.has(cle))
      groupes.set(cle, { titre: ev?.titre ?? 'Autre', date: ev ? dateCle(ev) : '', libelle: ev ? libelleDates(ev) : '', lignes: [], pots: [] });
    return groupes.get(cle)!;
  };
  reservations.forEach((r) => groupeDe(r.souhait).lignes.push(r));
  participations.forEach((p) => groupeDe(p.souhait).pots.push(p));
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
      {reservations.length === 0 && participations.length === 0 ? (
        <MessageVide
          titre="Rien à offrir pour l'instant"
          texte="Réservez un cadeau ou participez à un pot commun dans la liste d'un proche : il apparaîtra ici. Vous seul le voyez."
        />
      ) : (
        ordre.map((g) => {
          const total =
            g.lignes.reduce((s, r) => s + (r.souhait?.prix ?? 0) * r.quantite, 0) +
            g.pots.reduce((s, p) => s + p.montant, 0);
          const restants = g.lignes.filter((r) => !r.achete).length;
          const aVerser = g.pots.filter((p) => !p.verse).length;
          const resume = [
            restants > 0 ? `${restants} à acheter` : null,
            aVerser > 0 ? `${aVerser} participation${aVerser > 1 ? 's' : ''} à verser` : null,
          ].filter(Boolean);
          return (
            <View key={g.titre + g.date} style={styles.groupe}>
              <View style={styles.groupeEntete}>
                <View style={styles.groupeTextes}>
                  <Text style={styles.groupeTitre}>{g.titre}</Text>
                  {g.libelle ? <Text style={styles.detail}>{g.libelle}</Text> : null}
                </View>
                {g.date ? <Pastille texte={libelleCompteARebours(g.date)} /> : null}
              </View>
              <Text style={styles.detail}>
                {resume.length === 0 ? 'Tout est réglé' : resume.join(' · ')}
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
              {g.pots.map((p) => (
                <View key={p.id} style={styles.ligne}>
                  <Pressable
                    onPress={() => basculerVerse(p)}
                    style={styles.case}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: p.verse }}
                    accessibilityLabel={`Participation à ${p.souhait?.titre ?? 'un pot commun'} versée`}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={p.verse ? 'checkbox' : 'square-outline'}
                      size={26}
                      color={p.verse ? theme.colors.success : theme.colors.textMuted}
                    />
                  </Pressable>
                  <Pressable
                    style={styles.ligneTextes}
                    onPress={() =>
                      p.souhait?.liste &&
                      navigation.navigate('Participation', {
                        listeId: p.souhait.liste.id,
                        souhaitId: p.souhait_id,
                        prenom: prenomDe(p.souhait.liste.destinataire_id),
                      })
                    }
                    accessibilityRole="button"
                  >
                    <Text style={[styles.ligneTitre, p.verse && styles.barre]}>
                      {p.souhait?.titre ?? 'Pot commun'} · {formaterPrix(p.montant)}
                    </Text>
                    <Text style={styles.detail}>
                      Pot commun pour {prenomDe(p.souhait?.liste?.destinataire_id)}
                      {p.verse ? ' · versé' : ' · à verser'}
                    </Text>
                    {p.souhait?.supprime_le && (
                      <Text style={styles.alerte}>Retiré de sa liste depuis : voyez avec la famille.</Text>
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
