import React from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';

// Éléments communs aux écrans de Quotidien.

// Phase 0 : rappelle que les écrans montrent des données fictives.
export function BandeauDemo() {
  return (
    <View style={styles.bandeau} accessibilityRole="text">
      <Ionicons name="construct-outline" size={16} color={theme.colors.textMuted} />
      <Text style={styles.bandeauTexte}>Démonstration : données fictives en attendant la suite.</Text>
    </View>
  );
}

export function TitreSection({ titre, detail }: { titre: string; detail?: string }) {
  return (
    <View style={styles.titreSection}>
      <Text style={styles.titreSectionTexte}>{titre}</Text>
      {detail ? <Text style={styles.titreSectionDetail}>{detail}</Text> : null}
    </View>
  );
}

export function Carte({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return <View style={[styles.carte, accent && styles.carteAccent]}>{children}</View>;
}

const styles = creerStylesThemes(() => ({
  bandeau: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
  },
  bandeauTexte: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  titreSection: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: theme.spacing.sm },
  titreSectionTexte: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  titreSectionDetail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: 4,
  },
  carteAccent: { borderColor: theme.colors.accent, borderWidth: 1.5 },
}));
