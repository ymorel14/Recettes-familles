import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useKeepAwake } from 'expo-keep-awake';
import { Avatar } from '@apps-famille/famille';
import { theme, creerStylesThemes } from '../theme/theme';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import { useListe } from '../hooks/useListe';
import { changerEtat, terminerCourses, type Article, type EtatArticle } from '../services/courses';
import { formaterQuantite } from '../services/saisie';

// Écran allumé seulement sur téléphone (sans objet dans un navigateur).
function GarderEcranAllume() {
  useKeepAwake();
  return null;
}

type Annulable = { article: Article; etatAvant: EtatArticle; texte: string };

// Mode magasin : un appui met l'article dans le caddie et il disparaît
// aussitôt, chez tout le monde (temps réel). « Annuler » pendant 5 secondes.
// « Introuvable » le garde sur la liste pour la prochaine fois.
// « Terminer les courses » vide le caddie dans l'historique.
export default function MagasinScreen({ route, navigation }: any) {
  const listeId: string = route.params.listeId;
  const { liste, articles, setArticles, rayonsOrdonnes, parUtilisateur, moi, chargement } = useListe(listeId);
  const entree = useRef(new Date().toISOString());
  // Articles déclarés introuvables PENDANT ces courses (ceux d'une fois
  // précédente restent à chercher).
  const [pasTrouves, setPasTrouves] = useState<Set<string>>(new Set());
  const [annulable, setAnnulable] = useState<Annulable | null>(null);
  const [caddieOuvert, setCaddieOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: liste ? `Au magasin · ${liste.nom}` : 'Au magasin' });
  }, [navigation, liste]);

  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    []
  );

  const aChercher = useMemo(
    () => articles.filter((a) => a.etat !== 'caddie' && !pasTrouves.has(a.id)),
    [articles, pasTrouves]
  );
  const introuvables = useMemo(() => articles.filter((a) => pasTrouves.has(a.id) && a.etat === 'introuvable'), [articles, pasTrouves]);
  const caddie = useMemo(() => articles.filter((a) => a.etat === 'caddie'), [articles]);

  const sections = useMemo(
    () =>
      rayonsOrdonnes
        .map((r) => ({ rayon: r, articles: aChercher.filter((a) => a.rayon_id === r.id) }))
        .concat([
          {
            rayon: { id: '?', nom: 'Autres rayons', icone: 'ellipsis-horizontal-outline', ordre: 999 },
            articles: aChercher.filter((a) => !rayonsOrdonnes.some((r) => r.id === a.rayon_id)),
          },
        ])
        .filter((s) => s.articles.length > 0),
    [rayonsOrdonnes, aChercher]
  );

  // Changement d'état affiché tout de suite, envoyé ensuite ; remis comme
  // avant si l'envoi échoue.
  const appliquer = async (article: Article, etat: EtatArticle, texte?: string) => {
    const etatAvant = article.etat;
    setArticles((actuels) => actuels.map((a) => (a.id === article.id ? { ...a, etat } : a)));
    if (texte) {
      setAnnulable({ article, etatAvant, texte });
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => setAnnulable(null), 5000);
    }
    try {
      await changerEtat(article.id, etat);
    } catch {
      setArticles((actuels) => actuels.map((a) => (a.id === article.id ? { ...a, etat: etatAvant } : a)));
      setMessage('Pas de réseau : réessayez dans un instant.');
    }
  };

  const mettreAuCaddie = (a: Article) => appliquer(a, 'caddie', `« ${a.libelle} » dans le caddie`);
  const marquerIntrouvable = (a: Article) => {
    setPasTrouves((s) => new Set(s).add(a.id));
    appliquer(a, 'introuvable', `« ${a.libelle} » introuvable`);
  };
  const remettre = (a: Article) => {
    setPasTrouves((s) => {
      const n = new Set(s);
      n.delete(a.id);
      return n;
    });
    appliquer(a, 'a_acheter');
  };
  const annuler = () => {
    if (!annulable) return;
    const { article, etatAvant } = annulable;
    setAnnulable(null);
    if (etatAvant !== 'introuvable') {
      setPasTrouves((s) => {
        const n = new Set(s);
        n.delete(article.id);
        return n;
      });
    }
    appliquer(article, etatAvant);
  };

  const terminer = () => {
    const reste = aChercher.length + introuvables.length;
    alerte(
      'Terminer les courses ?',
      `${caddie.length} article${caddie.length > 1 ? 's' : ''} du caddie quitte${caddie.length > 1 ? 'nt' : ''} la liste.` +
        (reste > 0 ? ` ${reste} article${reste > 1 ? 's restent' : ' reste'} pour la prochaine fois.` : ''),
      [
        { text: 'Continuer les courses', style: 'cancel' },
        {
          text: 'Terminer',
          onPress: async () => {
            setEnCours(true);
            try {
              await terminerCourses(listeId, articles);
              // Retour à la liste (ce qui reste pour la prochaine fois).
              navigation.navigate('Liste', { listeId });
            } catch {
              setMessage('Impossible de terminer pour l’instant (réseau ?). Le caddie est conservé.');
            } finally {
              setEnCours(false);
            }
          },
        },
      ]
    );
  };

  if (chargement) return <Chargement />;

  const nouveau = (a: Article) => a.ajoute_le > entree.current && a.ajoute_par !== moi;

  return (
    <View style={styles.flex}>
      {Platform.OS !== 'web' && <GarderEcranAllume />}
      <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
        {message && <Text style={styles.erreur}>{message}</Text>}
        {sections.length === 0 && (
          <View style={styles.fini}>
            <Ionicons name="checkmark-circle-outline" size={56} color={theme.colors.success} />
            <Text style={styles.finiTitre}>Tout est dans le caddie !</Text>
            <Text style={styles.aide}>Touchez « Terminer les courses » une fois passé en caisse.</Text>
          </View>
        )}
        {sections.map((s) => (
          <View key={s.rayon.id} style={styles.section}>
            <View style={styles.rayon}>
              <Ionicons name={s.rayon.icone as any} size={20} color={theme.colors.accent} />
              <Text style={styles.rayonNom}>{s.rayon.nom}</Text>
            </View>
            {s.articles.map((a) => {
              const quantite = formaterQuantite(a.quantite, a.unite);
              const auteur = a.ajoute_par ? parUtilisateur.get(a.ajoute_par) : undefined;
              return (
                <View key={a.id} style={styles.ligne}>
                  <Pressable
                    onPress={() => mettreAuCaddie(a)}
                    style={({ pressed }) => [styles.zoneArticle, pressed && styles.appuye]}
                    accessibilityRole="button"
                    accessibilityLabel={`Mettre ${a.libelle} dans le caddie`}
                  >
                    <View style={styles.caseVide} />
                    <View style={styles.textes}>
                      <Text style={styles.libelle}>
                        {a.libelle}
                        {quantite ? <Text style={styles.quantite}>{`  ${quantite}`}</Text> : null}
                      </Text>
                      {a.note ? <Text style={styles.note}>{a.note}</Text> : null}
                      <View style={styles.marques}>
                        {nouveau(a) && (
                          <Text style={styles.nouveau}>
                            Nouveau{auteur ? ` · ajouté par ${auteur.prenom}` : ''}
                          </Text>
                        )}
                        {a.etat === 'introuvable' && <Text style={styles.dejaIntrouvable}>Introuvable la dernière fois</Text>}
                      </View>
                    </View>
                    {a.ajoute_par && !nouveau(a) && <Avatar utilisateurId={a.ajoute_par} prenom={auteur?.prenom} taille={22} />}
                  </Pressable>
                  <Pressable
                    onPress={() => marquerIntrouvable(a)}
                    style={({ pressed }) => [styles.boutonIntrouvable, pressed && styles.appuye]}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.libelle} introuvable`}
                    hitSlop={6}
                  >
                    <Ionicons name="help-circle-outline" size={24} color={theme.colors.textMuted} />
                    <Text style={styles.petitTexte}>Pas trouvé</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}

        {introuvables.length > 0 && (
          <View style={styles.section}>
            <View style={styles.rayon}>
              <Ionicons name="help-circle-outline" size={20} color={theme.colors.warning} />
              <Text style={[styles.rayonNom, { color: theme.colors.warning }]}>Pas trouvés (restent sur la liste)</Text>
            </View>
            {introuvables.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => remettre(a)}
                style={({ pressed }) => [styles.ligneDiscrete, pressed && styles.appuye]}
                accessibilityRole="button"
                accessibilityLabel={`Remettre ${a.libelle} à chercher`}
              >
                <Text style={styles.libelleBarre}>{a.libelle}</Text>
                <Text style={styles.lien}>Finalement trouvé</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {annulable && (
        <View style={styles.bandeau} accessibilityLiveRegion="polite">
          <Text style={styles.bandeauTexte} numberOfLines={1}>
            {annulable.texte}
          </Text>
          <Pressable onPress={annuler} hitSlop={8} accessibilityRole="button" accessibilityLabel="Annuler">
            <Text style={styles.bandeauAction}>Annuler</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.pied}>
        <Pressable
          onPress={() => setCaddieOuvert((o) => !o)}
          style={styles.caddieEntete}
          accessibilityRole="button"
          accessibilityState={{ expanded: caddieOuvert }}
        >
          <Ionicons name="cart" size={22} color={theme.colors.accent} />
          <Text style={styles.caddieTitre}>Dans le caddie ({caddie.length})</Text>
          <Ionicons name={caddieOuvert ? 'chevron-down' : 'chevron-up'} size={20} color={theme.colors.textMuted} />
        </Pressable>
        {caddieOuvert && (
          <ScrollView style={styles.caddieListe}>
            {caddie.length === 0 && <Text style={styles.aide}>Le caddie est vide.</Text>}
            {caddie.map((a) => {
              const parQui = a.caddie_par && a.caddie_par !== moi ? parUtilisateur.get(a.caddie_par)?.prenom : null;
              return (
                <View key={a.id} style={styles.ligneCaddie}>
                  <Ionicons name="checkmark" size={18} color={theme.colors.success} />
                  <Text style={styles.libelleCaddie}>
                    {a.libelle}
                    {parQui ? <Text style={styles.aide}>{`  pris par ${parQui}`}</Text> : null}
                  </Text>
                  <Pressable onPress={() => remettre(a)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Ressortir ${a.libelle} du caddie`}>
                    <Text style={styles.lien}>Ressortir</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        )}
        <Bouton titre="Terminer les courses" onPress={terminer} enCours={enCours} desactive={caddie.length === 0} />
      </View>
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  section: { gap: 8 },
  rayon: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  rayonNom: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  zoneArticle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.md, minHeight: 64 },
  caseVide: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: theme.colors.accent },
  textes: { flex: 1, gap: 2 },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 20, color: theme.colors.text },
  quantite: { fontFamily: theme.fontBody, fontSize: 18, color: theme.colors.accent },
  note: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted },
  marques: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nouveau: { fontFamily: theme.fontBodyBold, fontSize: 12, color: theme.colors.success },
  dejaIntrouvable: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.warning },
  boutonIntrouvable: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    gap: 2,
  },
  petitTexte: { fontFamily: theme.fontBody, fontSize: 11, color: theme.colors.textMuted },
  appuye: { opacity: 0.55 },
  ligneDiscrete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
  },
  libelleBarre: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.textMuted, textDecorationLine: 'line-through' },
  lien: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.accent, textDecorationLine: 'underline' },
  fini: { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xl },
  finiTitre: { fontFamily: theme.fontTitle, fontSize: 22, color: theme.colors.text },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
  bandeau: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    bottom: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    minHeight: 52,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.text,
  },
  bandeauTexte: { flex: 1, fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.background },
  bandeauAction: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.selection },
  pied: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  caddieEntete: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 40 },
  caddieTitre: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  caddieListe: { maxHeight: 220 },
  ligneCaddie: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 40 },
  libelleCaddie: { flex: 1, fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
}));
