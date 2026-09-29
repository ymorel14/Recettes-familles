import React from 'react';
import { View, Text } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { formaterPrix } from '../services/wishlist';

// Somme réunie dans un pot commun, avec une barre de progression quand un
// montant à réunir est indiqué. Jamais montrée au destinataire.
export default function JaugePot({ total, objectif, compact = false }: { total: number; objectif: number | null; compact?: boolean }) {
  const aObjectif = objectif != null && objectif > 0;
  const part = aObjectif ? Math.min(1, total / objectif!) : 0;
  const atteint = aObjectif && total >= objectif!;
  const libelle = aObjectif
    ? `${formaterPrix(total)} réunis sur ${formaterPrix(objectif)}`
    : total > 0
      ? `${formaterPrix(total)} réunis`
      : 'Personne n’a encore participé';

  return (
    <View style={styles.bloc} accessible accessibilityLabel={`Pot commun : ${libelle}`}>
      <Text style={[compact ? styles.texteCompact : styles.texte, atteint && styles.atteint]}>
        {libelle}
        {atteint ? ' · objectif atteint' : ''}
      </Text>
      {aObjectif && (
        <View style={styles.rail}>
          <View style={[styles.remplissage, { width: `${Math.round(part * 100)}%` }, atteint && styles.remplissageAtteint]} />
        </View>
      )}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  bloc: { gap: 6 },
  texte: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  texteCompact: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  atteint: { color: theme.colors.success },
  rail: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  remplissage: { height: '100%', backgroundColor: theme.colors.accent },
  remplissageAtteint: { backgroundColor: theme.colors.success },
}));
