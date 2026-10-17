import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '@apps-famille/famille';
import { theme, creerStylesThemes } from '../theme/theme';
import { Bouton, Chargement } from '../components/ui';
import { useListe } from '../hooks/useListe';
import { ajouterArticle, suggestions as chercherSuggestions, type Article, type Produit } from '../services/courses';
import { formaterQuantite, lireSaisie } from '../services/saisie';
import { cleProduit } from '../utils/texte';
import { formaterDateCourte } from '../utils/dates';

// Une liste : ajout rapide en haut (« 2 lait », « pain »…), articles rangés
// par rayon dans MON ordre des rayons, prénom de qui a ajouté chaque
// article. « Au magasin » ouvre le mode magasin.
export default function ListeScreen({ route, navigation }: any) {
  const listeId: string = route.params.listeId;
  const donnees = useListe(listeId);
  const { liste, articles, setArticles, rayonsOrdonnes, parUtilisateur, produits, chargement, erreur } = donnees;
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const champ = useRef<TextInput>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: liste?.nom ?? 'Liste',
      headerRight: () =>
        liste ? (
          <Pressable
            onPress={() => navigation.navigate('ListeForm', { listeId })}
            accessibilityRole="button"
            accessibilityLabel="Réglages de la liste"
            hitSlop={8}
            style={styles.boutonEntete}
          >
            <Ionicons name="settings-outline" size={24} color={theme.colors.accent} />
          </Pressable>
        ) : null,
    });
  }, [navigation, liste, listeId]);

  const aAcheter = useMemo(() => articles.filter((a) => a.etat !== 'caddie'), [articles]);
  const dansCaddie = articles.length - aAcheter.length;

  const sections = useMemo(
    () =>
      rayonsOrdonnes
        .map((r) => ({ rayon: r, data: aAcheter.filter((a) => a.rayon_id === r.id) }))
        .concat(
          // Article d'un rayon inconnu (ajouté par un autre foyer) : avec « Autres ».
          [{ rayon: { id: '?', nom: 'Autres rayons', icone: 'ellipsis-horizontal-outline', ordre: 999 }, data: aAcheter.filter((a) => !rayonsOrdonnes.some((r) => r.id === a.rayon_id)) }]
        )
        .filter((s) => s.data.length > 0),
    [rayonsOrdonnes, aAcheter]
  );

  const clesSurLaListe = useMemo(() => new Set(aAcheter.map((a) => cleProduit(a.libelle))), [aAcheter]);
  const propositions = useMemo(
    () => chercherSuggestions(produits, saisie, clesSurLaListe),
    [produits, saisie, clesSurLaListe]
  );

  const ajouter = async (texte: string) => {
    const lu = lireSaisie(texte);
    if (!lu.libelle || enCours) return;
    setEnCours(true);
    setMessage(null);
    try {
      const { article, fusionne } = await ajouterArticle(listeId, lu, produits, articles);
      setArticles((actuels) =>
        fusionne ? actuels.map((a) => (a.id === article.id ? article : a)) : [...actuels, article]
      );
      if (fusionne) setMessage(`« ${article.libelle} » était déjà sur la liste.`);
      setSaisie('');
    } catch {
      setMessage('Ajout impossible. Vérifiez votre connexion.');
    } finally {
      setEnCours(false);
      champ.current?.focus();
    }
  };

  const ajouterProduit = (p: Produit) => ajouter(p.libelle);

  if (chargement) return <Chargement />;
  if (!liste) {
    return (
      <View style={styles.centre}>
        <Text style={styles.vide}>{erreur ?? 'Liste introuvable.'}</Text>
      </View>
    );
  }

  const ligne = ({ item }: { item: Article }) => {
    const auteur = item.ajoute_par ? parUtilisateur.get(item.ajoute_par) : undefined;
    const quantite = formaterQuantite(item.quantite, item.unite);
    return (
      <Pressable
        style={({ pressed }) => [styles.ligne, pressed && styles.appuye]}
        onPress={() => navigation.navigate('Article', { listeId, articleId: item.id })}
        accessibilityRole="button"
        accessibilityLabel={`${item.libelle}${quantite ? `, ${quantite}` : ''}`}
      >
        <View style={styles.ligneTextes}>
          <Text style={styles.libelle}>
            {item.libelle}
            {quantite ? <Text style={styles.quantite}>{`  ${quantite}`}</Text> : null}
          </Text>
          {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
          {item.etat === 'introuvable' && (
            <View style={styles.introuvable}>
              <Ionicons name="alert-circle-outline" size={14} color={theme.colors.warning} />
              <Text style={styles.introuvableTexte}>Introuvable la dernière fois</Text>
            </View>
          )}
        </View>
        {item.ajoute_par && (
          <View style={styles.auteur} accessibilityLabel={`Ajouté par ${auteur?.prenom ?? 'quelqu’un'}`}>
            <Avatar utilisateurId={item.ajoute_par} prenom={auteur?.prenom} taille={22} />
            <View>
              <Text style={styles.auteurTexte} numberOfLines={1}>
                {auteur?.prenom ?? ''}
              </Text>
              <Text style={styles.auteurTexte} numberOfLines={1}>
                {formaterDateCourte(item.ajoute_le)}
              </Text>
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.saisie}>
        <View style={styles.saisieLigne}>
          <TextInput
            ref={champ}
            style={styles.champ}
            value={saisie}
            onChangeText={setSaisie}
            onSubmitEditing={() => ajouter(saisie)}
            placeholder="Ajouter : « pain », « 2 lait », « 500 g farine »"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="done"
            blurOnSubmit={false}
            accessibilityLabel="Ajouter un article"
          />
          <Pressable
            onPress={() => ajouter(saisie)}
            disabled={!saisie.trim() || enCours}
            style={({ pressed }) => [styles.boutonAjout, (!saisie.trim() || pressed) && styles.appuye]}
            accessibilityRole="button"
            accessibilityLabel="Ajouter"
          >
            <Ionicons name="add" size={28} color={theme.colors.background} />
          </Pressable>
        </View>
        {propositions.length > 0 && (
          <View style={styles.suggestions}>
            {propositions.map((p) => (
              <Pressable
                key={p.cle}
                onPress={() => ajouterProduit(p)}
                style={({ pressed }) => [styles.suggestion, pressed && styles.appuye]}
                accessibilityRole="button"
                accessibilityLabel={`Ajouter ${p.libelle}`}
              >
                <Ionicons name="add-circle-outline" size={16} color={theme.colors.accent} />
                <Text style={styles.suggestionTexte}>{p.libelle}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {message && <Text style={styles.message}>{message}</Text>}
      </View>

      <SectionList
        style={styles.flex}
        contentContainerStyle={styles.listeContenu}
        sections={sections}
        keyExtractor={(a) => a.id}
        renderItem={ligne}
        renderSectionHeader={({ section }) => (
          <View style={styles.rayon}>
            <Ionicons name={section.rayon.icone as any} size={18} color={theme.colors.accent} />
            <Text style={styles.rayonNom}>{section.rayon.nom}</Text>
            <Text style={styles.rayonNombre}>{section.data.length}</Text>
          </View>
        )}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.videBloc}>
            <Ionicons name="cart-outline" size={40} color={theme.colors.textMuted} />
            <Text style={styles.vide}>Rien à acheter pour l’instant.</Text>
            <Text style={styles.videAide}>Tapez un article ci-dessus : son rayon est trouvé tout seul.</Text>
          </View>
        }
      />

      <View style={styles.pied}>
        {dansCaddie > 0 && (
          <Text style={styles.caddieEnCours}>
            {dansCaddie} article{dansCaddie > 1 ? 's' : ''} déjà dans le caddie
          </Text>
        )}
        <Bouton
          titre={dansCaddie > 0 ? 'Reprendre les courses' : 'Au magasin'}
          onPress={() => navigation.navigate('Magasin', { listeId })}
          desactive={aAcheter.length === 0 && dansCaddie === 0}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  boutonEntete: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.sm },
  saisie: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  saisieLigne: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' },
  champ: {
    flex: 1,
    minHeight: 48,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  boutonAjout: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  suggestionTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  message: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  listeContenu: { padding: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  rayon: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginTop: theme.spacing.md, marginBottom: theme.spacing.xs },
  rayonNom: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  rayonNombre: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: 6,
    minHeight: 52,
  },
  appuye: { opacity: 0.6 },
  ligneTextes: { flex: 1, gap: 2 },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  quantite: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.accent },
  note: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  introuvable: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  introuvableTexte: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.warning },
  auteur: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 130 },
  auteurTexte: { fontFamily: theme.fontBody, fontSize: 11, color: theme.colors.textMuted, lineHeight: 14 },
  videBloc: { alignItems: 'center', gap: theme.spacing.sm, paddingTop: theme.spacing.xl },
  vide: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text, textAlign: 'center' },
  videAide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
  pied: {
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  caddieEnCours: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
}));
