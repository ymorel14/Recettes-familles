import React from 'react';
import { ScrollView, Text, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { alerte } from '../utils/alerte';
import { ouvrirDansCourses } from '../services/listesCourses';

// La liste de courses a quitté Recettes pour l'app Courses (plusieurs
// listes, rayons, partage, mode magasin). Cet écran (bouton panier de
// l'onglet Recettes) y mène, et garde la sélection de plusieurs recettes.
export default function ListeDeCoursesScreen({ navigation }: any) {
  const ouvrir = async () => {
    if (!(await ouvrirDansCourses())) {
      alerte('App Courses introuvable', 'Installez l’app Courses de la famille sur ce téléphone, ou ouvrez le site des apps de la famille.');
    }
  };
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <View style={styles.carte}>
        <Ionicons name="cart-outline" size={44} color={theme.colors.accent} />
        <Text style={styles.titre}>La liste de courses a déménagé</Text>
        <Text style={styles.texte}>
          Elle est maintenant dans l’app Courses : plusieurs listes, rangement par rayon, partage avec qui vous voulez
          et mode magasin. « Ajouter à la liste de courses » sur une recette y envoie toujours les ingrédients.
        </Text>
        <Pressable style={styles.boutonPrincipal} onPress={ouvrir} accessibilityRole="button">
          <Text style={styles.boutonPrincipalTexte}>Ouvrir Courses</Text>
        </Pressable>
        <Pressable style={styles.boutonSecondaire} onPress={() => navigation.navigate('SelectionRecettes')} accessibilityRole="button">
          <Text style={styles.boutonSecondaireTexte}>Ajouter plusieurs recettes</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md },
  carte: {
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.accent, textAlign: 'center' },
  texte: { fontFamily: theme.fontBody, fontSize: 17, color: theme.colors.text, textAlign: 'center', lineHeight: 24 },
  boutonPrincipal: { alignSelf: 'stretch', backgroundColor: theme.colors.accent, borderRadius: theme.radii.md, paddingVertical: theme.spacing.md, alignItems: 'center' },
  boutonPrincipalTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.background },
  boutonSecondaire: { alignSelf: 'stretch', borderColor: theme.colors.accent, borderWidth: 1, borderRadius: theme.radii.md, paddingVertical: theme.spacing.md, alignItems: 'center' },
  boutonSecondaireTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.accent },
}));
