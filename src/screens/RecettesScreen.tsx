import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, Image, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { listerRecettes } from '../services/recettes';
import { supabase } from '../services/supabase';
import type { RecetteComplete } from '../types/models';

// Écran "Recettes" — liste réelle du foyer, recherche et filtre par
// catégorie (cahier des charges §4).
export default function RecettesScreen({ navigation }: any) {
  const { foyer } = useAuth();
  const [recettes, setRecettes] = useState<RecetteComplete[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [categorieActive, setCategorieActive] = useState<string | null>(null);

  const charger = useCallback(() => {
    if (!foyer) return;
    listerRecettes(foyer.id)
      .then(setRecettes)
      .finally(() => setChargement(false));
  }, [foyer]);

  // Recharge à chaque retour sur l'écran (ex. après création d'une recette).
  useFocusEffect(charger);

  // Synchronisation temps réel entre appareils du foyer (§9).
  useEffect(() => {
    if (!foyer) return;
    const canal = supabase
      .channel(`recettes-foyer-${foyer.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'recettes', table: 'recettes', filter: `foyer_id=eq.${foyer.id}` },
        () => charger()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [foyer, charger]);

  const categories = useMemo(() => {
    const toutes = new Map<string, string>();
    recettes.forEach((r) => r.categories.forEach((c) => toutes.set(c.id, c.nom)));
    return Array.from(toutes.entries()).map(([id, nom]) => ({ id, nom }));
  }, [recettes]);

  const recettesFiltrees = recettes.filter((r) => {
    const correspondRecherche = r.titre.toLowerCase().includes(recherche.trim().toLowerCase());
    const correspondCategorie = !categorieActive || r.categories.some((c) => c.id === categorieActive);
    return correspondRecherche && correspondCategorie;
  });

  return (
    <View style={styles.container}>
      <View style={styles.enTete}>
        <Text style={styles.titre}>Nos recettes</Text>
        <Pressable style={styles.boutonAjouter} onPress={() => navigation.navigate('CreationRecette')}>
          <Text style={styles.boutonAjouterTexte}>+ Ajouter</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.recherche}
        placeholder="Rechercher une recette..."
        placeholderTextColor={theme.colors.textMuted}
        value={recherche}
        onChangeText={setRecherche}
      />

      {categories.length > 0 && (
        <FlatList
          horizontal
          data={categories}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtres}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.filtre, categorieActive === item.id && styles.filtreActif]}
              onPress={() => setCategorieActive(categorieActive === item.id ? null : item.id)}
            >
              <Text
                style={[styles.filtreTexte, categorieActive === item.id && styles.filtreTexteActif]}
              >
                {item.nom}
              </Text>
            </Pressable>
          )}
        />
      )}

      {chargement ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.lg }} />
      ) : (
        <FlatList
          data={recettesFiltrees}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.liste}
          ListEmptyComponent={<Text style={styles.vide}>Aucune recette pour l'instant.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.carte}
              onPress={() => navigation.navigate('DetailRecette', { recetteId: item.id })}
            >
              {item.photo_url && <Image source={{ uri: item.photo_url }} style={styles.miniature} />}
              <View style={styles.carteTexte}>
                <Text style={styles.carteTitre}>{item.titre}</Text>
                <Text style={styles.carteCategorie}>
                  {item.categories.map((c) => c.nom).join(', ') || 'Sans catégorie'}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.md },
  enTete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm },
  titre: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.accent },
  boutonAjouter: { backgroundColor: theme.colors.accent, borderRadius: theme.radii.md, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm },
  boutonAjouterTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
  recherche: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    marginBottom: theme.spacing.sm,
  },
  filtres: { gap: theme.spacing.xs, paddingBottom: theme.spacing.sm },
  filtre: {
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
  },
  filtreActif: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  filtreTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  filtreTexteActif: { color: theme.colors.background, fontFamily: theme.fontBodyBold },
  liste: { gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  vide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.lg },
  carte: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
  },
  miniature: { width: 72, height: 72 },
  carteTexte: { flex: 1, padding: theme.spacing.sm, justifyContent: 'center' },
  carteTitre: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  carteCategorie: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
});
