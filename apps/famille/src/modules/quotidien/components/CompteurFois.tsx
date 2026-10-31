import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';

// Compteur « − N + » (coups de main : nombre de fois par semaine).
export default function CompteurFois({
  valeur,
  onChange,
  min = 1,
  max = 14,
  libelle,
}: {
  valeur: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  libelle: string;
}) {
  return (
    <View style={styles.ligne} accessibilityRole="adjustable" accessibilityLabel={`${libelle} : ${valeur}`}>
      <Pressable
        onPress={() => onChange(Math.max(min, valeur - 1))}
        disabled={valeur <= min}
        accessibilityRole="button"
        accessibilityLabel={`Moins, ${libelle}`}
        style={[styles.bouton, valeur <= min && styles.inactif]}
      >
        <Text style={styles.signe}>−</Text>
      </Pressable>
      <Text style={styles.valeur}>{valeur}</Text>
      <Pressable
        onPress={() => onChange(Math.min(max, valeur + 1))}
        disabled={valeur >= max}
        accessibilityRole="button"
        accessibilityLabel={`Plus, ${libelle}`}
        style={[styles.bouton, valeur >= max && styles.inactif]}
      >
        <Text style={styles.signe}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  bouton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactif: { opacity: 0.35 },
  signe: { fontFamily: theme.fontBodyBold, fontSize: 24, color: theme.colors.accent, lineHeight: 28 },
  valeur: { minWidth: 32, textAlign: 'center', fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.text },
}));
