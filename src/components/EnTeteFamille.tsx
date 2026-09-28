import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';

// "Morel" → "Famille Morel" ; "Famille Morel" reste tel quel (évite
// "Famille Famille Morel" quand le nom saisi commence déjà par "Famille").
function libelleFamille(nom: string): string {
  return /^famille\b/i.test(nom.trim()) ? nom.trim() : `Famille ${nom.trim()}`;
}

// "Famille Morel · Maison de Lyon". Si le foyer porte le même nom que la
// famille (foyers créés avant l'arrivée des familles), un seul nom.
function useLibelleFamille(): string | null {
  const { famille, foyer } = useAuth();
  if (!famille && !foyer) return null;
  const morceaux: string[] = [];
  if (famille) morceaux.push(libelleFamille(famille.nom));
  if (foyer && (!famille || foyer.nom.trim().toLowerCase() !== famille.nom.trim().toLowerCase())) {
    morceaux.push(foyer.nom.trim());
  }
  return morceaux.join(' · ');
}

// Titre d'en-tête de chaque écran (voir AppNavigator), centré :
//  - avec `titre` : libellé manuscrit "Famille … · Foyer" au-dessus du titre ;
//  - sans `titre` (écrans qui affichent déjà leur titre dans leur contenu) :
//    libellé manuscrit seul, plus grand, sur deux lignes si besoin.
// Le texte rétrécit un peu plutôt que d'être tronqué quand la place manque.
export default function EnTeteFamille({ titre }: { titre?: string }) {
  const libelle = useLibelleFamille();

  return (
    <View style={styles.conteneur}>
      {libelle && (
        <Text
          style={[styles.manuscrit, !titre && styles.manuscritSeul]}
          numberOfLines={titre ? 1 : 2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          maxFontSizeMultiplier={1.15}
        >
          {libelle}
        </Text>
      )}
      {titre ? (
        <Text
          style={styles.titre}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          maxFontSizeMultiplier={1.15}
        >
          {titre}
        </Text>
      ) : null}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  conteneur: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  manuscrit: {
    fontFamily: theme.fontManuscrit,
    fontSize: 17,
    lineHeight: 19,
    color: theme.colors.textMuted,
    textAlign: 'center',
    // Très légère inclinaison, façon mot griffonné.
    transform: [{ rotate: '-1.5deg' }],
  },
  manuscritSeul: {
    fontSize: 22,
    lineHeight: 23,
  },
  titre: {
    fontFamily: theme.fontTitle,
    fontSize: 18,
    lineHeight: 22,
    color: theme.colors.accent,
    textAlign: 'center',
  },
}));
