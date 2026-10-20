import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Photo d'un cadeau : une vignette qu'on touche pour la voir en grand, sur
// tout l'écran. On referme en touchant la photo, la croix ou le bouton retour.
export default function PhotoAgrandie({
  uri,
  style,
  libelle,
}: {
  uri: string;
  style?: StyleProp<ImageStyle>;
  libelle?: string;
}) {
  const [ouverte, setOuverte] = useState(false);
  const marges = useSafeAreaInsets();

  return (
    <>
      <Pressable
        onPress={() => setOuverte(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Agrandir la photo${libelle ? ` : ${libelle}` : ''}`}
        hitSlop={4}
      >
        <Image source={{ uri }} style={style} />
      </Pressable>
      <Modal visible={ouverte} transparent animationType="fade" onRequestClose={() => setOuverte(false)}>
        <View style={styles.fond}>
          <Pressable
            style={styles.zone}
            onPress={() => setOuverte(false)}
            accessibilityRole="button"
            accessibilityLabel="Fermer la photo"
          >
            <Image source={{ uri }} style={styles.photo} resizeMode="contain" accessibilityLabel={libelle} />
          </Pressable>
          <Pressable
            onPress={() => setOuverte(false)}
            style={[styles.fermer, { top: marges.top + 12 }]}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            hitSlop={12}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.92)' },
  zone: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  photo: { width: '100%', height: '100%' },
  fermer: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
