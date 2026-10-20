import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, StyleSheet, Pressable, ScrollView } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { normaliserTexte } from '../utils/texte';
import type { RecetteLiee } from '../types/models';
import ZoneClavier from './ZoneClavier';

type Props = {
  // null = modale fermée.
  visible: boolean;
  recettes: RecetteLiee[];
  lienActuel: RecetteLiee | null;
  onFermer: () => void;
  onChoisir: (recette: RecetteLiee | null) => void;
};

// Modale de sélection d'une "sous-recette" à lier à une étape (ex. l'étape
// "faire une pâte brisée" pointe vers la recette de la pâte brisée — cahier
// des charges §8/§4). Recherche simple par titre, et option pour retirer un
// lien déjà posé.
export default function SelecteurRecetteLieeModal({ visible, recettes, lienActuel, onFermer, onChoisir }: Props) {
  const [recherche, setRecherche] = useState('');

  const recettesFiltrees = useMemo(() => {
    const texte = normaliserTexte(recherche.trim());
    if (!texte) return recettes;
    return recettes.filter((r) => normaliserTexte(r.titre).includes(texte));
  }, [recettes, recherche]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onFermer}>
      <ZoneClavier sansEnTete>
      <View style={styles.fond}>
        <View style={styles.carte}>
          <Text style={styles.titre}>Lier à une recette</Text>
          <Text style={styles.aide}>
            Utile quand une étape s'appuie sur une autre recette (ex. « faire une pâte brisée »).
          </Text>
          <TextInput
            style={styles.champRecherche}
            placeholder="Rechercher une recette…"
            placeholderTextColor={theme.colors.textMuted}
            value={recherche}
            onChangeText={setRecherche}
          />
          <ScrollView style={styles.liste}>
            {lienActuel && (
              <Pressable
                style={styles.ligneRetirer}
                onPress={() => {
                  onChoisir(null);
                  setRecherche('');
                }}
              >
                <Text style={styles.ligneRetirerTexte}>✕ Retirer le lien vers « {lienActuel.titre} »</Text>
              </Pressable>
            )}
            {recettesFiltrees.length === 0 ? (
              <Text style={styles.videTexte}>Aucune recette ne correspond.</Text>
            ) : (
              recettesFiltrees.map((r) => (
                <Pressable
                  key={r.id}
                  style={styles.ligne}
                  onPress={() => {
                    onChoisir(r);
                    setRecherche('');
                  }}
                >
                  <Text style={styles.ligneTexte}>{r.titre}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
          <Pressable style={styles.boutonFermer} onPress={onFermer}>
            <Text style={styles.boutonFermerTexte}>Annuler</Text>
          </Pressable>
        </View>
      </View>
      </ZoneClavier>
    </Modal>
  );
}

const styles = creerStylesThemes(() => ({
  fond: {
    flex: 1,
    backgroundColor: theme.colors.voileFort,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  carte: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radii.md,
    borderColor: theme.colors.border,
    borderWidth: 1,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    width: '100%',
    maxHeight: '80%',
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.accent },
  aide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  champRecherche: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
  },
  liste: { maxHeight: 320 },
  ligne: {
    paddingVertical: theme.spacing.sm,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
  },
  ligneTexte: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 15 },
  ligneRetirer: {
    paddingVertical: theme.spacing.sm,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
  },
  ligneRetirerTexte: { fontFamily: theme.fontBody, color: theme.colors.warning, fontSize: 14 },
  videTexte: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
    fontSize: 13,
    paddingVertical: theme.spacing.sm,
  },
  boutonFermer: { alignSelf: 'flex-end', paddingTop: theme.spacing.xs },
  boutonFermerTexte: { fontFamily: theme.fontBody, color: theme.colors.accent },
}));
