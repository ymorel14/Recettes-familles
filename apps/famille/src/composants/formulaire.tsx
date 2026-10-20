import React from 'react';
import { Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { Icone } from './ui';
import { styleChampAVerifier } from './assistant';
import { arrondis, couleurs, creerStyles, espaces, polices } from '../theme/theme';

// Petits éléments de formulaire de l'app Famille, pour les brouillons de
// l'assistant (planning, lettre au Père Noël…) : case à cocher et champ.

export function CaseACocher({
  cochee,
  onChange,
  libelle,
  style,
}: {
  cochee: boolean;
  onChange: (v: boolean) => void;
  libelle: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={() => onChange(!cochee)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: cochee }}
      accessibilityLabel={libelle}
      hitSlop={8}
      style={[styles.case, cochee && { backgroundColor: couleurs.succes, borderColor: couleurs.succes }, style]}
    >
      {cochee ? <Icone nom="checkmark" taille={18} couleur="#FFFFFF" /> : null}
    </Pressable>
  );
}

export function Champ({
  libelle,
  aVerifier,
  style,
  ...props
}: TextInputProps & { libelle?: string; aVerifier?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 4 }, style]}>
      {libelle ? <Text style={styles.libelle}>{libelle}</Text> : null}
      <TextInput
        placeholderTextColor={couleurs.encreDouce}
        accessibilityLabel={libelle}
        {...props}
        style={[styles.champ, aVerifier ? styleChampAVerifier() : null]}
      />
    </View>
  );
}

const styles = creerStyles(() => ({
  case: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: couleurs.ligne,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libelle: { fontFamily: polices.texteGras, fontSize: 13, color: couleurs.encreDouce },
  champ: {
    minHeight: 44,
    paddingHorizontal: espaces.m,
    borderRadius: arrondis.petit,
    borderWidth: 1.5,
    borderColor: couleurs.ligne,
    backgroundColor: couleurs.surface,
    fontFamily: polices.texte,
    fontSize: 15,
    color: couleurs.encre,
  },
}));
