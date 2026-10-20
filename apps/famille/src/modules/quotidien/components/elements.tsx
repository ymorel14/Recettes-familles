import React from 'react';
import { Text, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';

// Éléments communs aux écrans de Quotidien.

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
