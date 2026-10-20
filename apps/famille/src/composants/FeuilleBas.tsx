import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arrondis, couleurs, creerStyles, espaces, margePage, polices, LARGEUR_MAX_WEB } from '../theme/theme';
import { Icone } from './ui';

// Feuille du bas (charte § 6) : poignée, titre, contenu ; fond assombri qui
// la ferme quand on le touche, croix en haut à droite.
export function FeuilleBas({
  visible,
  titre,
  onFermer,
  children,
}: {
  visible: boolean;
  titre: string;
  onFermer: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onFermer} statusBarTranslucent>
      <View style={styles.racine}>
        <Pressable style={styles.voile} onPress={onFermer} accessibilityLabel="Fermer" accessibilityRole="button" />
        <View style={[styles.feuille, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.poignee} />
          <View style={styles.entete}>
            <Text style={styles.titre} accessibilityRole="header">
              {titre}
            </Text>
            <Pressable onPress={onFermer} accessibilityRole="button" accessibilityLabel="Fermer" hitSlop={8} style={styles.croix}>
              <Icone nom="close" taille={22} couleur={couleurs.encre} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = creerStyles(() => ({
  racine: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  voile: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: couleurs.voile },
  feuille: {
    width: '100%',
    maxWidth: LARGEUR_MAX_WEB,
    maxHeight: '88%',
    backgroundColor: couleurs.surface,
    borderTopLeftRadius: arrondis.feuille,
    borderTopRightRadius: arrondis.feuille,
    paddingTop: espaces.s,
  },
  poignee: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: couleurs.ligne, marginBottom: espaces.s },
  entete: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: margePage, paddingVertical: espaces.s },
  titre: { flex: 1, fontFamily: polices.titre, fontSize: 24, color: couleurs.encre },
  croix: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.segment,
  },
  contenu: { paddingHorizontal: margePage, paddingTop: espaces.s, gap: espaces.m },
}));
