import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Image, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import { listerRecettes } from '../../services/recettes';
import type { RecetteComplete } from '../../types/models';
import { listerProgressions, formaterAnciennete, type ProgressionAssistant } from '../../services/progressionAssistant';

function libelleEnCours(p: ProgressionAssistant): string {
  const n = p.etapesCochees.length;
  return `En cours · ${n} étape${n > 1 ? 's' : ''} faite${n > 1 ? 's' : ''} · ${formaterAnciennete(p.majLe)}`;
}

// Onglet "Assistant" : choisir quelle recette dérouler pas-à-pas (§8).
export default function ChoixRecetteAssistantScreen({ navigation }: any) {
  const { foyer } = useAuth();
  const [recettes, setRecettes] = useState<RecetteComplete[]>([]);
  const [chargement, setChargement] = useState(true);
  // Recettes commencées et pas terminées sur cet appareil (reprise).
  const [enCours, setEnCours] = useState<Map<string, ProgressionAssistant>>(new Map());

  useFocusEffect(
    useCallback(() => {
      if (!foyer) return;
      listerRecettes(foyer.id)
        .then(setRecettes)
        .finally(() => setChargement(false));
      listerProgressions().then((liste) => setEnCours(new Map(liste.map((p) => [p.recetteId, p]))));
    }, [foyer])
  );

  // Recettes en cours d'abord (la plus récente en tête), puis les autres.
  const recettesTriees = [...recettes].sort((a, b) => {
    const pa = enCours.get(a.id)?.majLe ?? 0;
    const pb = enCours.get(b.id)?.majLe ?? 0;
    return pb - pa;
  });

  return (
    <View style={styles.container}>
      <Text style={styles.titre}>Cuisiner pas à pas</Text>
      <Text style={styles.sousTitre}>Choisissez une recette à préparer.</Text>
      {chargement ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.lg }} />
      ) : (
        <FlatList
          data={recettesTriees}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.liste}
          ListEmptyComponent={<Text style={styles.vide}>Ajoutez d'abord une recette dans l'onglet Recettes.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.carte}
              onPress={() => navigation.navigate('AssistantRecette', { recetteId: item.id })}
            >
              {item.photo_url && <Image source={{ uri: item.photo_url }} style={styles.miniature} />}
              <View style={styles.carteTextes}>
                <Text style={styles.carteTitre}>{item.titre}</Text>
                {enCours.has(item.id) && (
                  <Text style={styles.carteEnCours}>{libelleEnCours(enCours.get(item.id)!)}</Text>
                )}
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
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
  carteTextes: { flex: 1, gap: 2 },
  carteTitre: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 16 },
  carteEnCours: { fontFamily: theme.fontBody, color: theme.colors.accent, fontSize: 13 },
}));
