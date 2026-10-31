import React, { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icone } from '../composants/ui';
import { ResultatsRecherche, ouvrirResultat } from '../composants/ResultatsRecherche';
import { arrondis, couleurs, creerStyles, espaces, margePage, polices } from '../theme/theme';

// Recherche globale (retour de test P-2), ouverte par la loupe de l'accueil :
// recettes, courses, tâches, objets, envies, voyages, souvenirs et
// aide-mémoire, sans assistant.
export default function RechercheScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [texte, setTexte] = useState('');
  return (
    <View style={[styles.racine, { paddingTop: insets.top + espaces.s }]}>
      <View style={styles.barre}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Retour" hitSlop={8} style={styles.retour}>
          <Icone nom="arrow-back" taille={24} couleur={couleurs.encre} />
        </Pressable>
        <View style={styles.champCadre}>
          <Icone nom="search-outline" taille={20} couleur={couleurs.encreDouce} />
          <TextInput
            value={texte}
            onChangeText={setTexte}
            placeholder="Rechercher dans toute l’app"
            placeholderTextColor={couleurs.encreDouce}
            style={styles.champ}
            autoFocus
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Rechercher dans toute l’app"
          />
          {texte ? (
            <Pressable onPress={() => setTexte('')} accessibilityRole="button" accessibilityLabel="Effacer" hitSlop={8}>
              <Icone nom="close-circle" taille={20} couleur={couleurs.encreDouce} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        <ResultatsRecherche texte={texte} onOuvrir={ouvrirResultat} />
      </ScrollView>
    </View>
  );
}

const styles = creerStyles(() => ({
  racine: { flex: 1, backgroundColor: couleurs.fond },
  barre: { flexDirection: 'row', alignItems: 'center', gap: espaces.s, paddingHorizontal: margePage, paddingBottom: espaces.s },
  retour: { width: 40, height: 44, justifyContent: 'center' },
  champCadre: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    minHeight: 48,
    paddingHorizontal: espaces.m,
    borderRadius: arrondis.champ,
    borderWidth: 1.5,
    borderColor: couleurs.ligne,
    backgroundColor: couleurs.surface,
  },
  champ: { flex: 1, fontFamily: polices.texte, fontSize: 16, color: couleurs.encre, paddingVertical: 10 },
  contenu: { padding: margePage, paddingBottom: 120, gap: espaces.m },
}));
