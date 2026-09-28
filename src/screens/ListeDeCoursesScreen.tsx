import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { alerte } from '../utils/alerte';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import {
  obtenirOuCreerListeActive,
  listerArticles,
  listerContributionsDeListe,
  listerAjoutsDeListe,
  retirerAjoutDeListe,
  basculerArticle,
  ajouterArticleManuel,
  supprimerArticle,
  viderListe,
  clefDeArticle,
  detecterSuggestionsFusion,
  fusionnerArticles,
} from '../services/listesCourses';
import type { ArticleListeCourses, ContributionListeCourses, ListeCourses } from '../types/models';
import type { AjoutRecetteDansListe, SuggestionFusion } from '../services/listesCourses';

// Signature stable d'un groupe de suggestion (mêmes articles, dans un ordre
// prévisible), pour retenir les suggestions ignorées le temps de la session
// sans avoir besoin de les stocker en base.
function signatureSuggestion(suggestion: SuggestionFusion): string {
  return suggestion.articles.map((a) => a.id).sort().join(',');
}

// Écran "Liste de courses" — agrégation multi-recettes, partagée et
// synchronisée en temps réel entre les membres du foyer (§7, §9). Le détail
// par recette (panneau "Recettes ajoutées" + repli par article) permet de
// voir d'où vient chaque quantité, et de retirer proprement UN ajout précis
// (ex. la même recette ajoutée deux fois par erreur, en n'en retirant qu'une
// et en conservant l'autre) sans toucher au reste de la liste — voir
// `retirerAjoutDeListe`.
export default function ListeDeCoursesScreen({ navigation }: any) {
  const { foyer } = useAuth();
  const [liste, setListe] = useState<ListeCourses | null>(null);
  const [articles, setArticles] = useState<ArticleListeCourses[]>([]);
  const [contributions, setContributions] = useState<ContributionListeCourses[]>([]);
  const [ajoutsDansListe, setAjoutsDansListe] = useState<AjoutRecetteDansListe[]>([]);
  const [chargement, setChargement] = useState(true);
  const [nouvelArticle, setNouvelArticle] = useState('');
  // Articles dont on affiche le détail par recette (repli/dépli au toucher).
  const [articlesDeplies, setArticlesDeplies] = useState<Set<string>>(new Set());
  // Ajout (recette) dont le retrait de la liste est en cours (désactive son bouton).
  const [retraitEnCours, setRetraitEnCours] = useState<string | null>(null);
  // Suggestions de fusion écartées par l'utilisateur (le temps de la
  // session — elles pourraient réapparaître si la liste change beaucoup).
  const [suggestionsIgnorees, setSuggestionsIgnorees] = useState<Set<string>>(new Set());
  const [fusionEnCours, setFusionEnCours] = useState<string | null>(null);
  // Les articles cochés disparaissent de la liste ; ce bouton permet de les
  // réafficher (barrés) pour vérifier ou décocher un article.
  const [afficherCoches, setAfficherCoches] = useState(false);
  const [suppressionListeEnCours, setSuppressionListeEnCours] = useState(false);

  const charger = useCallback(async () => {
    if (!foyer) return;
    const listeActive = await obtenirOuCreerListeActive(foyer.id);
    setListe(listeActive);
    const [articlesCharges, contributionsChargees, ajoutsCharges] = await Promise.all([
      listerArticles(listeActive.id),
      listerContributionsDeListe(listeActive.id),
      listerAjoutsDeListe(listeActive.id),
    ]);
    setArticles(articlesCharges);
    setContributions(contributionsChargees);
    setAjoutsDansListe(ajoutsCharges);
    setChargement(false);
  }, [foyer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  // Synchronisation temps réel : les cases cochées par un autre membre du
  // foyer, un nouvel article ajouté, ou une recette ajoutée/retirée par un
  // autre membre, apparaissent sans recharger (§9).
  useEffect(() => {
    if (!liste) return;
    // Suffixe aléatoire dans le nom du canal à chaque montage, pour éviter
    // toute collision avec un canal du même nom pas encore complètement
    // fermé (voir le commentaire équivalent dans CategoriesScreen.tsx).
    const canal = supabase
      .channel(`liste-courses-${liste.id}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'recettes', table: 'liste_courses_articles', filter: `liste_id=eq.${liste.id}` },
        () => listerArticles(liste.id).then(setArticles)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'recettes', table: 'liste_courses_contributions', filter: `liste_id=eq.${liste.id}` },
        () => {
          listerContributionsDeListe(liste.id).then(setContributions);
          listerAjoutsDeListe(liste.id).then(setAjoutsDansListe);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [liste]);

  // Regroupe les contributions par article (même clef que la fusion des
  // articles), pour afficher le détail par recette sous un article déplié.
  const contributionsParArticle = useMemo(() => {
    const parClef = new Map<string, ContributionListeCourses[]>();
    contributions.forEach((c) => {
      const clef = clefDeArticle(c.libelle, c.unite);
      const existantes = parClef.get(clef) ?? [];
      existantes.push(c);
      parClef.set(clef, existantes);
    });
    return parClef;
  }, [contributions]);

  // Articles qui partagent un même mot-clé ("oeuf") sans avoir un texte
  // identique — proposés à l'utilisateur plutôt que fusionnés d'office
  // (retour utilisateur : repérer les aliments similaires est trop
  // incertain pour le faire sans confirmation).
  const suggestionsFusion = useMemo(
    () => detecterSuggestionsFusion(articles).filter((s) => !suggestionsIgnorees.has(signatureSuggestion(s))),
    [articles, suggestionsIgnorees]
  );

  const ignorerSuggestion = (suggestion: SuggestionFusion) => {
    setSuggestionsIgnorees((prev) => new Set(prev).add(signatureSuggestion(suggestion)));
  };

  const accepterSuggestion = async (suggestion: SuggestionFusion) => {
    if (!liste) return;
    const signature = signatureSuggestion(suggestion);
    setFusionEnCours(signature);
    try {
      // Libellé retenu : le plus court des articles du groupe (souvent le
      // plus générique, ex. "Oeufs" plutôt que "oeufs entiers"). Unité
      // retenue seulement si elle est la même pour tous, sinon aucune.
      const libelleRetenu = suggestion.articles
        .slice()
        .sort((a, b) => a.libelle.length - b.libelle.length)[0].libelle;
      const unitesDistinctes = new Set(suggestion.articles.map((a) => a.unite ?? ''));
      const uniteRetenue = unitesDistinctes.size === 1 ? suggestion.articles[0].unite : null;

      await fusionnerArticles(
        liste.id,
        suggestion.articles.map((a) => a.id),
        libelleRetenu,
        uniteRetenue
      );
      setSuggestionsIgnorees((prev) => new Set(prev).add(signature));
      await charger();
    } catch (e) {
      alerte('Échec de la fusion', e instanceof Error ? e.message : 'Veuillez réessayer.');
    } finally {
      setFusionEnCours(null);
    }
  };

  const nbCoches = useMemo(() => articles.filter((a) => a.coche).length, [articles]);
  const articlesAffiches = useMemo(
    () => (afficherCoches ? articles : articles.filter((a) => !a.coche)),
    [articles, afficherCoches]
  );

  const supprimerLaListe = async () => {
    if (!liste) return;
    setSuppressionListeEnCours(true);
    try {
      await viderListe(liste.id);
      setArticlesDeplies(new Set());
      setSuggestionsIgnorees(new Set());
      setAfficherCoches(false);
      await charger();
    } catch (e) {
      alerte('Échec de la suppression', e instanceof Error ? e.message : 'Veuillez réessayer.');
    } finally {
      setSuppressionListeEnCours(false);
    }
  };

  const proposerSuppressionListe = () => {
    alerte(
      'Courses terminées ?',
      "Tous les articles sont cochés. Voulez-vous supprimer cette liste et repartir d'une liste vide ?",
      [
        { text: 'Garder la liste', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: supprimerLaListe },
      ]
    );
  };

  const toggle = async (article: ArticleListeCourses) => {
    const apres = articles.map((a) => (a.id === article.id ? { ...a, coche: !a.coche } : a));
    setArticles(apres);
    await basculerArticle(article.id, !article.coche);
    // Le dernier article restant vient d'être coché : on propose de
    // supprimer la liste (uniquement sur l'action de cet utilisateur, pas
    // quand un autre membre coche depuis son téléphone).
    if (!article.coche && apres.length > 0 && apres.every((a) => a.coche)) {
      proposerSuppressionListe();
    }
  };

  const basculerDetail = (articleId: string) => {
    setArticlesDeplies((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(articleId)) suivant.delete(articleId);
      else suivant.add(articleId);
      return suivant;
    });
  };

  const ajouter = async () => {
    if (!liste || !nouvelArticle.trim()) return;
    await ajouterArticleManuel(liste.id, nouvelArticle);
    setNouvelArticle('');
    setArticles(await listerArticles(liste.id));
  };

  const demanderRetraitAjout = (ajout: AjoutRecetteDansListe) => {
    alerte(
      'Retirer cette recette ?',
      `Tout ce que "${ajout.titre}" a ajouté à la liste à ce moment-là sera retiré (les quantités partagées avec d'autres recettes ou d'autres ajouts de la même recette sont conservées).`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            if (!liste) return;
            setRetraitEnCours(ajout.ajoutId);
            try {
              await retirerAjoutDeListe(liste.id, ajout.ajoutId);
              await charger();
            } catch (e) {
              alerte('Échec du retrait', e instanceof Error ? e.message : 'Veuillez réessayer.');
            } finally {
              setRetraitEnCours(null);
            }
          },
        },
      ]
    );
  };

  if (chargement) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.enTete}>
        <Text style={styles.titre}>Liste de courses</Text>
        <Pressable style={styles.boutonAjouter} onPress={() => navigation.navigate('SelectionRecettes')}>
          <Text style={styles.boutonAjouterTexte}>+ Depuis des recettes</Text>
        </Pressable>
      </View>

      {ajoutsDansListe.length > 0 && (
        <View style={styles.recettesZone}>
          <Text style={styles.recettesTitre}>Recettes ajoutées</Text>
          <FlatList
            horizontal
            data={ajoutsDansListe}
            keyExtractor={(item) => item.ajoutId}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recettesListe}
            renderItem={({ item }) => {
              const enCours = retraitEnCours === item.ajoutId;
              return (
                <View style={styles.recetteChip}>
                  <View style={styles.recetteChipTextes}>
                    <Text style={styles.recetteChipTexte} numberOfLines={1}>
                      {item.titre}
                    </Text>
                    {/* Heure d'ajout : distingue au premier coup d'œil deux
                        vignettes identiques quand la même recette a été
                        ajoutée plusieurs fois. */}
                    <Text style={styles.recetteChipHeure}>
                      {new Date(item.ajouteLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Pressable hitSlop={8} onPress={() => demanderRetraitAjout(item)} disabled={enCours}>
                    {enCours ? (
                      <ActivityIndicator size="small" color={theme.colors.warning} />
                    ) : (
                      <Text style={styles.recetteChipSupprimer}>✕</Text>
                    )}
                  </Pressable>
                </View>
              );
            }}
          />
        </View>
      )}

      {suggestionsFusion.length > 0 && (
        <View style={styles.suggestionsZone}>
          {suggestionsFusion.map((suggestion) => {
            const signature = signatureSuggestion(suggestion);
            const enCours = fusionEnCours === signature;
            return (
              <View key={signature} style={styles.carteSuggestion}>
                <Text style={styles.suggestionTexte}>
                  Ces articles semblent identiques (mot commun : « {suggestion.motCle} ») —{' '}
                  {suggestion.articles.map((a) => a.libelle).join(', ')}. Les fusionner ?
                </Text>
                <View style={styles.suggestionBoutons}>
                  <Pressable
                    style={styles.suggestionBoutonIgnorer}
                    onPress={() => ignorerSuggestion(suggestion)}
                    disabled={enCours}
                  >
                    <Text style={styles.suggestionBoutonIgnorerTexte}>Ignorer</Text>
                  </Pressable>
                  <Pressable
                    style={styles.suggestionBoutonFusionner}
                    onPress={() => accepterSuggestion(suggestion)}
                    disabled={enCours}
                  >
                    {enCours ? (
                      <ActivityIndicator size="small" color={theme.colors.background} />
                    ) : (
                      <Text style={styles.suggestionBoutonFusionnerTexte}>Fusionner</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.ligneAjout}>
        <TextInput
          style={styles.champ}
          placeholder="Ajouter un article..."
          placeholderTextColor={theme.colors.textMuted}
          value={nouvelArticle}
          onChangeText={setNouvelArticle}
          onSubmitEditing={ajouter}
        />
      </View>

      {nbCoches > 0 && (
        <View style={styles.barreCoches}>
          <Pressable hitSlop={8} onPress={() => setAfficherCoches((v) => !v)}>
            <Text style={styles.lienCoches}>
              {afficherCoches
                ? 'Masquer les articles cochés'
                : `Afficher les articles cochés (${nbCoches})`}
            </Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={articlesAffiches}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.liste}
        ListEmptyComponent={
          articles.length > 0 ? (
            // Tout est coché (et masqué) : courses terminées.
            <View style={styles.videTermine}>
              <Text style={styles.vide}>Tous les articles sont cochés.</Text>
              <Pressable
                style={styles.boutonSupprimerListe}
                onPress={proposerSuppressionListe}
                disabled={suppressionListeEnCours}
              >
                {suppressionListeEnCours ? (
                  <ActivityIndicator size="small" color={theme.colors.warning} />
                ) : (
                  <Text style={styles.boutonSupprimerListeTexte}>Supprimer la liste</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Text style={styles.vide}>Liste vide pour l'instant.</Text>
          )
        }
        renderItem={({ item }) => {
          const contributionsArticle = contributionsParArticle.get(clefDeArticle(item.libelle, item.unite)) ?? [];
          const deplie = articlesDeplies.has(item.id);
          return (
            <View style={styles.carteArticle}>
              <View style={styles.ligne}>
                <Pressable style={styles.ligneToucher} onPress={() => toggle(item)}>
                  <View style={[styles.checkbox, item.coche && { backgroundColor: theme.colors.success }]} />
                  <Text style={[styles.label, item.coche && styles.labelCoche]}>
                    {[item.quantite, item.unite, item.libelle].filter(Boolean).join(' ')}
                  </Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => supprimerArticle(item.id).then(charger)}>
                  <Text style={styles.supprimerArticle}>✕</Text>
                </Pressable>
              </View>
              {contributionsArticle.length > 0 && (
                <Pressable style={styles.boutonDetail} onPress={() => basculerDetail(item.id)}>
                  <Text style={styles.boutonDetailTexte}>
                    {deplie ? '▲ Masquer le détail' : `▼ Détail (${contributionsArticle.length} recette${contributionsArticle.length > 1 ? 's' : ''})`}
                  </Text>
                </Pressable>
              )}
              {deplie && (
                <View style={styles.detailRecettes}>
                  {contributionsArticle.map((c) => (
                    <Text key={c.id} style={styles.detailLigne}>
                      • {c.recette_titre} — {[c.quantite, c.unite].filter(Boolean).join(' ') || 'quantité non précisée'}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.md },
  centre: { flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  enTete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm, flexWrap: 'wrap', gap: theme.spacing.xs },
  titre: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.accent },
  boutonAjouter: { backgroundColor: theme.colors.accent, borderRadius: theme.radii.md, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm },
  boutonAjouterTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background, fontSize: 12 },
  recettesZone: { marginBottom: theme.spacing.sm },
  recettesTitre: { fontFamily: theme.fontBodyBold, color: theme.colors.textMuted, fontSize: 12, marginBottom: theme.spacing.xs },
  recettesListe: { gap: theme.spacing.xs },
  recetteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
    maxWidth: 200,
  },
  recetteChipTextes: { flexShrink: 1 },
  recetteChipTexte: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 13 },
  recetteChipHeure: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 10 },
  recetteChipSupprimer: { color: theme.colors.warning, fontSize: 14, paddingHorizontal: 2 },
  suggestionsZone: { gap: theme.spacing.xs, marginBottom: theme.spacing.sm },
  carteSuggestion: {
    backgroundColor: theme.colors.selection,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  suggestionTexte: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 13 },
  suggestionBoutons: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.sm },
  suggestionBoutonIgnorer: { paddingVertical: 6, paddingHorizontal: theme.spacing.sm },
  suggestionBoutonIgnorerTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  suggestionBoutonFusionner: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.sm,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
    minWidth: 80,
    alignItems: 'center',
  },
  suggestionBoutonFusionnerTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background, fontSize: 13 },
  ligneAjout: { marginBottom: theme.spacing.sm },
  champ: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
  },
  liste: { gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  vide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.lg },
  videTermine: { alignItems: 'center', gap: theme.spacing.md },
  boutonSupprimerListe: {
    borderColor: theme.colors.warning,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    minWidth: 160,
    alignItems: 'center',
  },
  boutonSupprimerListeTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.warning },
  barreCoches: { alignItems: 'flex-end', marginBottom: theme.spacing.sm },
  lienCoches: { fontFamily: theme.fontBody, color: theme.colors.accent, fontSize: 13, textDecorationLine: 'underline' },
  carteArticle: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  ligneToucher: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  checkbox: { width: 20, height: 20, borderRadius: theme.radii.sm, borderWidth: 2, borderColor: theme.colors.border },
  label: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text, flexShrink: 1 },
  labelCoche: { color: theme.colors.textMuted, textDecorationLine: 'line-through' },
  supprimerArticle: { color: theme.colors.warning, fontSize: 16, paddingHorizontal: theme.spacing.xs },
  boutonDetail: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm, marginTop: -theme.spacing.xs },
  boutonDetailTexte: { fontFamily: theme.fontBody, color: theme.colors.accent, fontSize: 12 },
  detailRecettes: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: 2,
  },
  detailLigne: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
}));
