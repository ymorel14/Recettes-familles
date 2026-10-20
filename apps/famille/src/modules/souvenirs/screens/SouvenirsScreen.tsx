import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, FlatList, Pressable, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { useFamilleDonnees } from '../contexts/FamilleDonneesContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import { ceJourLa, listerSouvenirs, type CarteSouvenir as Carte, type Souvenir } from '../services/souvenirs';
import { useAdresses, Vignette } from '../components/medias';
import Filtres, { AUCUN_FILTRE, appliquerFiltres, type FiltresActifs } from '../components/Filtres';
import { Bouton, Chargement, MessageVide } from '../components/ui';
import { anneeDe, aujourdhuiIso, formaterDateSouvenir, ilYaAns } from '../utils/dates';

export const SANS_DATE = 'Sans date';

type Annee = { annee: string; souvenirs: Carte[]; couvertures: string[] };
type Decennie = { titre: string | null; annees: Annee[] };

// Regroupe les souvenirs par année (la plus récente d'abord), et les années
// par décennie quand il y en a beaucoup.
export function regrouperParAnnee(souvenirs: Carte[]): Decennie[] {
  const parAnnee = new Map<string, Carte[]>();
  souvenirs.forEach((s) => {
    const a = anneeDe(s.date_debut);
    parAnnee.set(a, [...(parAnnee.get(a) ?? []), s]);
  });
  const annees: Annee[] = Array.from(parAnnee.entries())
    .sort(([a], [b]) => (a === SANS_DATE ? 1 : b === SANS_DATE ? -1 : b.localeCompare(a)))
    .map(([annee, liste]) => ({
      annee,
      souvenirs: liste,
      couvertures: liste.map((s) => s.couverture).filter(Boolean).slice(0, 3) as string[],
    }));
  // Peu d'années : une seule liste, sans titres de décennie.
  if (annees.length <= 6) return [{ titre: null, annees }];
  const decennies = new Map<string, Annee[]>();
  annees.forEach((a) => {
    const titre = a.annee === SANS_DATE ? SANS_DATE : `Années ${a.annee.slice(0, 3)}0`;
    decennies.set(titre, [...(decennies.get(titre) ?? []), a]);
  });
  return Array.from(decennies.entries()).map(([titre, liste]) => ({ titre, annees: liste }));
}

// Accueil : « Ce jour-là », les derniers souvenirs ajoutés, puis une carte
// par année (regroupées par décennie) qui ouvre la page de l'année. Le
// détail de chaque souvenir n'apparaît plus ici, pour que l'écran reste
// lisible avec des centaines de souvenirs.
export default function SouvenirsScreen({ navigation }: any) {
  const { famille } = useAuth();
  const { categorie, completer } = useFamilleDonnees();
  const [souvenirs, setSouvenirs] = useState<Carte[] | null>(null);
  const [jourLa, setJourLa] = useState<Souvenir[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [filtres, setFiltres] = useState<FiltresActifs>(AUCUN_FILTRE);
  const [decenniesOuvertes, setDecenniesOuvertes] = useState<Set<string>>(new Set());

  const charger = useCallback(async () => {
    if (!famille) return;
    try {
      const [liste, jour] = await Promise.all([
        listerSouvenirs(famille.id),
        ceJourLa(aujourdhuiIso(), famille.id).catch(() => [] as Souvenir[]),
      ]);
      setSouvenirs(liste);
      setJourLa(jour);
      setErreur(null);
      completer(liste.flatMap((s) => s.personnes.map((p) => p.personne_id))).catch(() => {});
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de charger les souvenirs.'));
    }
  }, [famille?.id, completer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const filtres_ = useMemo(() => appliquerFiltres(souvenirs ?? [], filtres), [souvenirs, filtres]);
  const recents = useMemo(
    () => [...filtres_].sort((a, b) => b.cree_le.localeCompare(a.cree_le)).slice(0, 8),
    [filtres_]
  );
  const decennies = useMemo(() => regrouperParAnnee(filtres_), [filtres_]);

  // Seules les photos affichées sont demandées au stockage.
  const adresses = useAdresses([
    ...recents.map((s) => s.couverture),
    ...decennies.flatMap((d) => d.annees.flatMap((a) => a.couvertures)),
  ]);

  // La décennie la plus récente est ouverte ; les autres se déplient.
  const estOuverte = (titre: string | null, index: number) =>
    titre === null || index === 0 || decenniesOuvertes.has(titre) || filtres.categorie !== null || filtres.personne !== null;

  const rafraichir = async () => {
    setRafraichissement(true);
    await charger();
    setRafraichissement(false);
  };

  if (!souvenirs && !erreur) return <Chargement />;

  const ouvrirAnnee = (annee: string) => navigation.navigate('Annee', { annee, filtres });

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.contenu}
      refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={rafraichir} tintColor={theme.colors.accent} />}
    >
      <View style={styles.actions}>
        <Bouton titre="+ Nouveau souvenir" onPress={() => navigation.navigate('SouvenirForm')} style={styles.actionPrincipale} />
        <Bouton
          variante="contour"
          titre="Depuis un voyage"
          onPress={() => navigation.navigate('DepuisVoyage')}
          accessibilityLabel="Créer le souvenir d'un voyage de VoyageCommun"
        />
      </View>

      {jourLa.length > 0 && (
        <View style={styles.jourLa}>
          <Text style={styles.jourLaTitre}>Ce jour-là</Text>
          {jourLa.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => navigation.navigate('Souvenir', { id: s.id })}
              style={styles.jourLaLigne}
              accessibilityRole="button"
            >
              <Ionicons name={categorie(s.categorie).icone as any} size={18} color={theme.colors.accent} />
              <Text style={styles.jourLaTexte} numberOfLines={1}>
                <Text style={styles.gras}>{ilYaAns(s.date_debut!)}</Text> · {s.titre}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Filtres souvenirs={souvenirs ?? []} valeur={filtres} onChange={setFiltres} />
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {souvenirs && souvenirs.length === 0 ? (
        <MessageVide
          titre="Aucun souvenir pour l'instant"
          texte="Commencez par un voyage, une naissance, des premiers pas… Toute la famille pourra ajouter ses photos et ses commentaires."
        />
      ) : filtres_.length === 0 ? (
        <MessageVide titre="Aucun souvenir avec ces filtres" />
      ) : (
        <>
          <Text style={styles.section}>Derniers ajouts</Text>
          <FlatList
            horizontal
            data={recents}
            keyExtractor={(s) => s.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recents}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => navigation.navigate('Souvenir', { id: item.id })}
                style={styles.tuile}
                accessibilityRole="button"
                accessibilityLabel={item.titre}
              >
                {item.couverture && adresses[item.couverture] ? (
                  <Vignette uri={adresses[item.couverture]} style={styles.tuileImage} libelle={item.titre} />
                ) : (
                  <View style={[styles.tuileImage, styles.sansPhoto]}>
                    <Ionicons name={categorie(item.categorie).icone as any} size={30} color={theme.colors.accent} />
                  </View>
                )}
                <Text style={styles.tuileTitre} numberOfLines={2}>
                  {item.titre}
                </Text>
                <Text style={styles.tuileDate} numberOfLines={1}>
                  {formaterDateSouvenir(item.date_debut, null, item.precision_date)}
                </Text>
              </Pressable>
            )}
          />

          <Text style={styles.section}>Par année</Text>
          {decennies.map((d, i) => {
            const ouverte = estOuverte(d.titre, i);
            const total = d.annees.reduce((n, a) => n + a.souvenirs.length, 0);
            return (
              <View key={d.titre ?? 'toutes'} style={styles.decennie}>
                {d.titre && (
                  <Pressable
                    onPress={() =>
                      setDecenniesOuvertes((avant) => {
                        const n = new Set(avant);
                        if (n.has(d.titre!)) n.delete(d.titre!);
                        else n.add(d.titre!);
                        return n;
                      })
                    }
                    disabled={i === 0}
                    style={styles.decennieEntete}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: ouverte }}
                  >
                    <Text style={styles.decennieTitre}>{d.titre}</Text>
                    <Text style={styles.decennieCompte}>
                      {total} souvenir{total > 1 ? 's' : ''}
                    </Text>
                    {i > 0 && (
                      <Ionicons name={ouverte ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
                    )}
                  </Pressable>
                )}
                {ouverte &&
                  d.annees.map((a) => (
                    <Pressable
                      key={a.annee}
                      onPress={() => ouvrirAnnee(a.annee)}
                      style={({ pressed }) => [styles.annee, pressed && styles.appuye]}
                      accessibilityRole="button"
                      accessibilityLabel={`${a.annee}, ${a.souvenirs.length} souvenirs`}
                    >
                      <View style={styles.anneeTextes}>
                        <Text style={styles.anneeTitre}>
                          {a.annee}
                          <Text style={styles.anneeCompte}>
                            {'  '}
                            {a.souvenirs.length} souvenir{a.souvenirs.length > 1 ? 's' : ''}
                          </Text>
                        </Text>
                        <Text style={styles.anneeApercu} numberOfLines={1}>
                          {a.souvenirs
                            .slice(0, 3)
                            .map((s) => s.titre)
                            .join(' · ')}
                        </Text>
                      </View>
                      <View style={styles.mosaique}>
                        {a.couvertures.map((c) =>
                          adresses[c] ? <Vignette key={c} uri={adresses[c]} style={styles.mini} /> : null
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                    </Pressable>
                  ))}
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' },
  actionPrincipale: { flexGrow: 1 },
  jourLa: {
    backgroundColor: theme.colors.selectionTransparent,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  jourLaTitre: { fontFamily: theme.fontManuscrit, fontSize: 16, color: theme.colors.accent },
  jourLaLigne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, minHeight: 32 },
  jourLaTexte: { flex: 1, fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  gras: { fontFamily: theme.fontBodyBold },
  section: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text, marginTop: theme.spacing.sm },
  recents: { gap: theme.spacing.sm },
  tuile: { width: 132, gap: 4 },
  tuileImage: { width: 132, height: 132, borderRadius: theme.radii.md },
  sansPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tuileTitre: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text },
  tuileDate: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.textMuted },
  decennie: { gap: theme.spacing.xs },
  decennieEntete: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm, minHeight: 40, paddingTop: theme.spacing.xs },
  decennieTitre: { fontFamily: theme.fontManuscrit, fontSize: 18, color: theme.colors.accent },
  decennieCompte: { flex: 1, fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  annee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
  },
  appuye: { opacity: 0.7 },
  anneeTextes: { flex: 1, gap: 1 },
  anneeTitre: { fontFamily: theme.fontTitle, fontSize: 22, color: theme.colors.accent },
  anneeCompte: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.textMuted },
  anneeApercu: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.text },
  mosaique: { flexDirection: 'row' },
  mini: { width: 40, height: 40, borderRadius: theme.radii.sm, marginLeft: -10, borderWidth: 2, borderColor: theme.colors.surface },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
