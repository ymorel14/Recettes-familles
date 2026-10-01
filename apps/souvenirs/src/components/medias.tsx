import React, { useEffect, useMemo, useState } from 'react';
import { Image, Text, View, type ImageStyle, type StyleProp } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { adressesSignees, type TypeMedia } from '../services/souvenirs';

// Adresses signées des fichiers à afficher (espace privé "souvenirs-medias").
// Renvoie un dictionnaire chemin → adresse, rempli dès que la base répond.
export function useAdresses(chemins: (string | null | undefined)[]): Record<string, string> {
  const cle = useMemo(() => Array.from(new Set(chemins.filter(Boolean) as string[])).sort().join('|'), [chemins]);
  const [adresses, setAdresses] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!cle) return;
    let actif = true;
    adressesSignees(cle.split('|'))
      .then((a) => actif && setAdresses((avant) => ({ ...avant, ...a })))
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [cle]);

  return adresses;
}

export const ICONES_MEDIA: Record<TypeMedia, keyof typeof Ionicons.glyphMap> = {
  photo: 'image-outline',
  video: 'videocam-outline',
  audio: 'mic-outline',
  document: 'document-text-outline',
};

// Vignette d'un média : la photo elle-même, ou une icône pour une vidéo, un
// son ou un document (ils s'ouvrent dans le lecteur de l'appareil).
export function Vignette({
  uri,
  type = 'photo',
  style,
  libelle,
}: {
  uri: string | null | undefined;
  type?: TypeMedia;
  style?: StyleProp<ImageStyle>;
  libelle?: string | null;
}) {
  if (type === 'photo' && uri) {
    return <Image source={{ uri }} style={[styles.image, style]} accessibilityLabel={libelle ?? 'Photo'} />;
  }
  return (
    <View style={[styles.image, styles.substitut, style as any]} accessibilityLabel={libelle ?? undefined}>
      <Ionicons name={type === 'photo' ? 'image-outline' : ICONES_MEDIA[type]} size={28} color={theme.colors.accent} />
      {type !== 'photo' && libelle ? (
        <Text style={styles.substitutTexte} numberOfLines={2}>
          {libelle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  image: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.md },
  substitut: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  substitutTexte: { fontFamily: theme.fontBody, fontSize: 11, color: theme.colors.textMuted, textAlign: 'center' },
}));
