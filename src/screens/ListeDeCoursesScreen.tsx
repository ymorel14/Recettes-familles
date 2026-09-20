import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import {
  obtenirOuCreerListeActive,
  listerArticles,
  basculerArticle,
  ajouterArticleManuel,
  supprimerArticle,
} from '../services/listesCourses';
import type { ArticleListeCourses, ListeCourses } from '../types/models';

// Écran "Liste de courses" — agrégation multi-recettes, partagée et
// synchronisée en temps réel entre les membres du foyer (§7, §9).
export default function ListeDeCoursesScreen({ navigation }: any) {
  const { foyer } = useAuth();
  const [liste, setListe] = useState<ListeCourses | null>(null);
  const [articles, setArticles] = useState<ArticleListeCourses[]>([]);
  const [chargement, setChargement] = useState(true);
  const [nouvelArticle, setNouvelArticle] = useState('');

  const charger = useCallback(async () => {
    if (!foyer) return;
    const listeActive = await obtenirOuCreerListeActive(foyer.id);
    setListe(listeActive);
    setArticles(await listerArticles(listeActive.id));
    setChargement(false);
  }, [foyer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  // Synchronisation temps réel : les cases cochées par un autre membre du
  // foyer, ou un nouvel article ajouté, apparaissent sans recharger (§9).
  useEffect(() => {
    if (!liste) return;
    const canal = supabase
      .channel(`liste-courses-${liste.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'recettes', table: 'liste_courses_articles', filter: `liste_id=eq.${liste.id}` },
        () => listerArticles(liste.id).then(setArticles)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [liste]);

  const toggle = async (article: ArticleListeCourses) => {
    setArticles((prev) => prev.map((a) => (a.id === article.id ? { ...a, coche: !a.coche } : a)));
    await basculerArticle(article.id, !article.coche);
  };

  const ajouter = async () => {
    if (!liste || !nouvelArticle.trim()) return;
    await ajouterArticleManuel(liste.id, nouvelArticle);
    setNouvelArticle('');
    setArticles(await listerArticles(liste.id));
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

      <FlatList
        data={articles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.liste}
        ListEmptyComponent={<Text style={styles.vide}>Liste vide pour l'instant.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.ligne} onPress={() => toggle(item)} onLongPress={() => supprimerArticle(item.id).then(charger)}>
            <View style={[styles.checkbox, item.coche && { backgroundColor: theme.colors.success }]} />
            <Text style={[styles.label, item.coche && styles.labelCoche]}>
              {[item.quantite, item.unite, item.libelle].filter(Boolean).join(' ')}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.md },
  centre: { flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  enTete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm, flexWrap: 'wrap', gap: theme.spacing.xs },
  titre: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.accent },
  boutonAjouter: { backgroundColor: theme.colors.accent, borderRadius: theme.radii.md, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm },
  boutonAjouterTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background, fontSize: 12 },
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
  liste: { gap: theme.spacing.sm },
  vide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.lg },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  checkbox: { width: 20, height: 20, borderRadius: theme.radii.sm, borderWidth: 2, borderColor: theme.colors.border },
  label: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text },
  labelCoche: { color: theme.colors.textMuted, textDecorationLine: 'line-through' },
});
