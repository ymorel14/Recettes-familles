import React from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';

// Éléments de formulaire des inventaires (mêmes styles que les tâches).

export function Champ({
  libelle,
  aide,
  ...props
}: TextInputProps & { libelle: string; aide?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.libelle}>{libelle}</Text>
      <TextInput
        style={[styles.champ, props.multiline && styles.multiligne]}
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel={libelle}
        {...props}
      />
      {aide ? <Text style={styles.aide}>{aide}</Text> : null}
    </View>
  );
}

export function Puce({
  texte,
  actif = false,
  onPress,
  icone,
  role = 'radio',
}: {
  texte: string;
  actif?: boolean;
  onPress: () => void;
  icone?: keyof typeof Ionicons.glyphMap;
  role?: 'radio' | 'checkbox' | 'button';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.puce, actif && styles.puceActive]}
      accessibilityRole={role}
      accessibilityState={role === 'button' ? undefined : role === 'radio' ? { selected: actif } : { checked: actif }}
    >
      {icone && <Ionicons name={icone} size={16} color={actif ? theme.colors.background : theme.colors.accent} />}
      <Text style={[styles.puceTexte, actif && { color: theme.colors.background }]}>{texte}</Text>
    </Pressable>
  );
}

export function Puces({ children }: { children: React.ReactNode }) {
  return <View style={styles.puces}>{children}</View>;
}

// Champ de recherche avec loupe et bouton pour effacer.
export function Recherche({
  valeur,
  onChange,
  placeholder,
}: {
  valeur: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.recherche}>
      <Ionicons name="search-outline" size={20} color={theme.colors.textMuted} />
      <TextInput
        style={styles.rechercheChamp}
        value={valeur}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        returnKeyType="search"
      />
      {valeur ? (
        <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
          <Ionicons name="close-circle" size={20} color={theme.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export const stylesFormulaire = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: theme.spacing.sm },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  texte: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  titre: { fontFamily: theme.fontTitle, fontSize: 24, color: theme.colors.text },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  nom: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  alerte: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.warning },
}));

const styles = creerStylesThemes(() => ({
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: theme.spacing.sm },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
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
  multiligne: { minHeight: 80, paddingTop: theme.spacing.xs, textAlignVertical: 'top' },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: {
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  puceActive: { backgroundColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  recherche: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: 46,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: theme.spacing.sm,
  },
  rechercheChamp: { flex: 1, minHeight: 44, color: theme.colors.text, fontFamily: theme.fontBody, fontSize: 16 },
}));
