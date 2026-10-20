import React from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';

// Petits éléments d'interface communs aux écrans de CadeauCommun, aux
// couleurs du thème choisi (theme.colors.*).

export function Bouton({
  titre,
  onPress,
  variante = 'plein',
  enCours = false,
  desactive = false,
  style,
  accessibilityLabel,
}: {
  titre: string;
  onPress: () => void;
  variante?: 'plein' | 'contour' | 'pointille' | 'discret';
  enCours?: boolean;
  desactive?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const inactif = desactive || enCours;
  const styleVariante =
    variante === 'plein'
      ? styles.plein
      : variante === 'contour'
        ? styles.contour
        : variante === 'pointille'
          ? styles.pointille
          : styles.discret;
  const couleurTexte = variante === 'plein' ? theme.colors.background : theme.colors.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactif}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? titre}
      style={({ pressed }) => [styles.base, styleVariante, (pressed || inactif) && styles.appuye, style]}
    >
      {enCours ? (
        <ActivityIndicator color={couleurTexte} />
      ) : (
        <Text style={[styles.texte, { color: couleurTexte }, variante === 'discret' && styles.texteDiscret]}>{titre}</Text>
      )}
    </Pressable>
  );
}

export function Chargement() {
  return (
    <View style={styles.centre}>
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  );
}

export function MessageVide({ titre, texte }: { titre: string; texte?: string }) {
  return (
    <View style={styles.vide}>
      <Text style={styles.videTitre}>{titre}</Text>
      {texte ? <Text style={styles.videTexte}>{texte}</Text> : null}
    </View>
  );
}

// Pastille (compte à rebours, statut…).
export function Pastille({ texte, ton = 'accent' }: { texte: string; ton?: 'accent' | 'neutre' | 'succes' }) {
  return (
    <View style={[styles.pastille, ton === 'neutre' && styles.pastilleNeutre, ton === 'succes' && styles.pastilleSucces]}>
      <Text
        style={[
          styles.pastilleTexte,
          ton === 'neutre' && { color: theme.colors.textMuted },
          ton === 'succes' && { color: theme.colors.success },
        ]}
      >
        {texte}
      </Text>
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  base: {
    minHeight: 44,
    borderRadius: theme.radii.lg,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plein: { backgroundColor: theme.colors.accent },
  contour: { borderWidth: 1.5, borderColor: theme.colors.accent, backgroundColor: 'transparent' },
  pointille: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    backgroundColor: 'transparent',
  },
  discret: { backgroundColor: 'transparent', minHeight: 36 },
  appuye: { opacity: 0.6 },
  texte: { fontFamily: theme.fontBodyBold, fontSize: 15 },
  texteDiscret: { textDecorationLine: 'underline', fontFamily: theme.fontBody },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
  vide: { padding: theme.spacing.lg, alignItems: 'center', gap: theme.spacing.sm },
  videTitre: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text, textAlign: 'center' },
  videTexte: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted, textAlign: 'center' },
  pastille: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.accentTransparent,
  },
  pastilleNeutre: { backgroundColor: theme.colors.selectionTransparent, borderWidth: 1, borderColor: theme.colors.border },
  pastilleSucces: { backgroundColor: theme.colors.selectionTransparent },
  pastilleTexte: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.accent },
}));
