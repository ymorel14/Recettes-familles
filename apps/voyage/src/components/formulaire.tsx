import React from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';

// Éléments de formulaire communs aux écrans de VoyageCommun (mêmes styles
// que les formulaires de CadeauCommun).

export function Libelle({ children, nativeID }: { children: React.ReactNode; nativeID?: string }) {
  return (
    <Text style={styles.libelle} nativeID={nativeID}>
      {children}
    </Text>
  );
}

export function Aide({ children }: { children: React.ReactNode }) {
  return <Text style={styles.aide}>{children}</Text>;
}

export function Erreur({ texte }: { texte: string | null }) {
  return texte ? <Text style={styles.erreur}>{texte}</Text> : null;
}

export function Champ(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={theme.colors.textMuted}
      {...props}
      style={[styles.champ, props.multiline && styles.champMultiligne, props.style]}
    />
  );
}

// Choix unique parmi des pastilles.
export function Puces<T extends string>({
  options,
  valeur,
  onChange,
}: {
  options: { id: T; libelle: string }[];
  valeur: T | null;
  onChange: (id: T) => void;
}) {
  return (
    <View style={styles.puces}>
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: actif }}
            style={[styles.puce, actif && styles.puceActive]}
          >
            <Text style={[styles.puceTexte, actif && styles.puceTexteActive]}>{o.libelle}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Case à cocher avec son libellé (et une ligne d'aide facultative).
export function CaseACocher({
  coche,
  onChange,
  libelle,
  aide,
}: {
  coche: boolean;
  onChange: (coche: boolean) => void;
  libelle: string;
  aide?: string;
}) {
  return (
    <Pressable
      onPress={() => onChange(!coche)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: coche }}
      accessibilityLabel={libelle}
      accessibilityHint={aide}
      style={styles.case}
    >
      <Ionicons
        name={coche ? 'checkbox' : 'square-outline'}
        size={24}
        color={coche ? theme.colors.accent : theme.colors.textMuted}
      />
      <View style={styles.caseTexte}>
        <Text style={styles.caseLibelle}>{libelle}</Text>
        {aide ? <Text style={styles.aide}>{aide}</Text> : null}
      </View>
    </Pressable>
  );
}

// Grande carte de choix (qui participe…).
export function CarteChoix({
  actif,
  onPress,
  titre,
  aide,
}: {
  actif: boolean;
  onPress: () => void;
  titre: string;
  aide?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={titre}
      accessibilityHint={aide}
      style={[styles.carte, actif && styles.carteActive]}
    >
      <Ionicons
        name={actif ? 'radio-button-on' : 'radio-button-off'}
        size={22}
        color={actif ? theme.colors.accent : theme.colors.textMuted}
      />
      <View style={styles.caseTexte}>
        <Text style={styles.caseLibelle}>{titre}</Text>
        {aide ? <Text style={styles.aide}>{aide}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = creerStylesThemes(() => ({
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text, marginTop: theme.spacing.sm },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
  champ: {
    minHeight: 44,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  champMultiligne: { minHeight: 80, paddingTop: theme.spacing.sm, textAlignVertical: 'top' },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  puceActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  puceTexteActive: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
  case: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 44 },
  caseTexte: { flex: 1, gap: 2 },
  caseLibelle: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  carteActive: { borderColor: theme.colors.accent, borderWidth: 2 },
}));
