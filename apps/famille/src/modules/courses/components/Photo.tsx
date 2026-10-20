import React, { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAdressesPhotos } from '../services/photos';

// Photos des produits : vignette dans les listes (touchée : en grand), grande
// photo dans la fiche d'un article.

export function Vignette({ chemin, taille = 44, legende }: { chemin: string | null | undefined; taille?: number; legende?: string }) {
  const url = useAdressesPhotos([chemin]).get(chemin ?? '');
  const [grande, setGrande] = useState(false);
  if (!chemin) return null;
  return (
    <>
      <Pressable
        onPress={() => setGrande(true)}
        hitSlop={4}
        accessibilityRole="imagebutton"
        accessibilityLabel={legende ? `Photo de ${legende}, voir en grand` : 'Voir la photo en grand'}
        style={[styles.vignette, { width: taille, height: taille }]}
      >
        {url ? (
          <Image source={{ uri: url }} style={{ width: taille, height: taille }} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={Math.round(taille * 0.45)} color={theme.colors.textMuted} />
        )}
      </Pressable>
      <PhotoAgrandie url={grande ? url ?? null : null} legende={legende} onFermer={() => setGrande(false)} />
    </>
  );
}

export function PhotoAgrandie({ url, legende, onFermer }: { url: string | null; legende?: string; onFermer: () => void }) {
  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onFermer}>
      <Pressable style={styles.fond} onPress={onFermer} accessibilityRole="button" accessibilityLabel="Fermer la photo">
        {url && <Image source={{ uri: url }} style={styles.agrandie} resizeMode="contain" />}
        {legende ? <Text style={styles.legende}>{legende}</Text> : null}
      </Pressable>
    </Modal>
  );
}

export function GrandePhoto({ chemin, legende }: { chemin: string | null | undefined; legende?: string }) {
  const url = useAdressesPhotos([chemin]).get(chemin ?? '');
  const [grande, setGrande] = useState(false);
  if (!chemin) return null;
  return (
    <>
      <Pressable style={styles.grande} onPress={() => url && setGrande(true)} accessibilityLabel={legende ? `Photo : ${legende}` : 'Photo'}>
        {url ? <Image source={{ uri: url }} style={styles.grandeImage} resizeMode="contain" /> : <ActivityIndicator color={theme.colors.accent} />}
      </Pressable>
      <PhotoAgrandie url={grande ? url ?? null : null} legende={legende} onFermer={() => setGrande(false)} />
    </>
  );
}

const styles = creerStylesThemes(() => ({
  vignette: {
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grande: {
    width: '100%',
    height: 220,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grandeImage: { width: '100%', height: '100%' },
  fond: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.md },
  agrandie: { width: '100%', height: '80%' },
  legende: { marginTop: theme.spacing.md, fontFamily: theme.fontBodyBold, fontSize: 18, color: '#FFFFFF' },
}));
