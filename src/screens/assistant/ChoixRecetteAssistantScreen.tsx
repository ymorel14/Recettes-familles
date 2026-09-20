import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Image, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import { listerRecettes } from '../../services/recettes';
import type { RecetteComplete } from '../../types/models';

// Onglet "Assistant" : choisir quelle recette dérouler pas-à-pas (§8).
export default function ChoixRecetteAssistantScreen({ navigation }: any) {
  const { foyer } = useAuth();
  const [recettes, setRecettes] = useState<RecetteComplete[]>([]);
  const [chargement, setChargement] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!foyer) return;
      listerRecettes(foyer.id)
        .then(setRecettes)
        .finally(() => setChargement(false));
    }, [foyer])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.titre}>Cuisiner pas à pas</Text>
      <Text style={styles.sousTitre}>Choisissez une recette à préparer.</Text>
      {chargement ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.lg }} />
      ) : (
        <FlatList
          data={recettes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.liste}
          ListEmptyComponent={<Text style={styles.vide}>Ajoutez d'abord une recette dans l'onglet Recettes.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.carte}
              onPress={() => navigation.navigate('AssistantRecette', { recetteId: item.id })}
            >
              {item.photo_url && <Image source={{ uri: item.photo_url }} style={styles.miniature} />}
              <Text style={styles.carteTitre}>{item.titre}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.md },
  titre: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.accent },
  sousTitre: { fontFamily: theme.fontBody, color: theme.colors.textMuted, marginBottom: theme.spacing.sm },
  liste: { gap: theme.spacing.sm },
  vide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.lg },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  miniature: { width: 48, height: 48, borderRadius: theme.radii.sm },
  carteTitre: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 16 },
});
