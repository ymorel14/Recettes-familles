import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';

// Accueil de l'app : les listes de courses du foyer.
// Phase 0 (squelette) : écran d'attente. Les listes, articles, rayons,
// partage et mode magasin arrivent en Phase 1 avec le schéma `courses`
// (voir le document « Cahier des charges — Courses »).
export default function ListesScreen() {
  const { foyer } = useAuth();
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <View style={styles.carte}>
        <Ionicons name="cart-outline" size={48} color={theme.colors.accent} />
        <Text style={styles.titre}>Bientôt vos listes de courses</Text>
        <Text style={styles.texte}>
          Ici apparaîtront les listes du foyer {foyer?.nom ?? ''} : supermarché, marché, bricolage… rangées par rayon,
          partagées avec qui vous voulez, et qui se vident au fur et à mesure que le caddie se remplit.
        </Text>
        <Text style={styles.aide}>
          En attendant, la liste de courses reste dans l'app Recettes familiales, onglet « Courses ».
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl },
  carte: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 22, color: theme.colors.text, textAlign: 'center' },
  texte: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text, textAlign: 'center', lineHeight: 22 },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
}));
