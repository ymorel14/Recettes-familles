import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, FlatList } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { rechercherCategories } from '../services/categories';
import type { Categorie } from '../types/models';

type Props = {
  selection: string[]; // noms de catégories choisis (créés à la validation si besoin)
  onChange: (selection: string[]) => void;
};

// Sélecteur multi-catégories avec recherche/autocomplétion sur la liste
// globale existante, pour limiter les doublons proches par l'orthographe
// (cahier des charges §4/§11 — catégories uniques, partagées par tous les foyers).
export default function SelecteurCategories({ selection, onChange }: Props) {
  const [texte, setTexte] = useState('');
  const [suggestions, setSuggestions] = useState<Categorie[]>([]);

  useEffect(() => {
    let annule = false;
    rechercherCategories(texte).then((resultats) => {
      if (!annule) setSuggestions(resultats);
    });
    return () => {
      annule = true;
    };
  }, [texte]);

  const ajouter = (nom: string) => {
    const nomPropre = nom.trim();
    if (!nomPropre || selection.some((s) => s.toLowerCase() === nomPropre.toLowerCase())) return;
    onChange([...selection, nomPropre]);
    setTexte('');
  };

  const retirer = (nom: string) => {
    onChange(selection.filter((s) => s !== nom));
  };

  const correspondanceExacte = suggestions.some((s) => s.nom.toLowerCase() === texte.trim().toLowerCase());

  return (
    <View>
      <View style={styles.puces}>
        {selection.map((nom) => (
          <Pressable key={nom} style={styles.puce} onPress={() => retirer(nom)}>
            <Text style={styles.puceTexte}>{nom} ✕</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.champ}
        placeholder="Ajouter une catégorie (ex. Desserts)"
        placeholderTextColor={theme.colors.textMuted}
        value={texte}
        onChangeText={setTexte}
        onSubmitEditing={() => ajouter(texte)}
      />
      {texte.trim().length > 0 && (
        <View style={styles.suggestions}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable style={styles.suggestion} onPress={() => ajouter(item.nom)}>
                <Text style={styles.suggestionTexte}>{item.nom}</Text>
              </Pressable>
            )}
            ListFooterComponent={
              !correspondanceExacte ? (
                <Pressable style={styles.suggestion} onPress={() => ajouter(texte)}>
                  <Text style={styles.suggestionNouvelle}>Créer « {texte.trim()} »</Text>
                </Pressable>
              ) : null
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  puces: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  puce: {
    backgroundColor: theme.colors.selection,
    borderRadius: theme.radii.sm,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
  },
  puceTexte: {
    fontFamily: theme.fontBody,
    color: theme.colors.text,
    fontSize: 13,
  },
  champ: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
  },
  suggestions: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: theme.radii.md,
    borderBottomRightRadius: theme.radii.md,
    maxHeight: 160,
  },
  suggestion: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  suggestionTexte: {
    fontFamily: theme.fontBody,
    color: theme.colors.text,
  },
  suggestionNouvelle: {
    fontFamily: theme.fontBody,
    color: theme.colors.accent,
    fontStyle: 'italic',
  },
}));
