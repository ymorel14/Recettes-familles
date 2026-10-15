import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Linking,
  Platform,
  StyleSheet,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme/theme';
import { obtenirSouvenir, type Media, type SouvenirDetaille } from '../services/souvenirs';
import { ICONES_MEDIA, useAdresses } from '../components/medias';

const LIBELLES: Record<Media['type'], string> = {
  photo: 'Photo',
  video: 'Vidéo',
  audio: 'Enregistrement',
  document: 'Document',
};

// Visionneuse plein écran, sur fond noir, comme l'app Photos : on glisse
// d'une photo à l'autre (flèches et touches ← → sur ordinateur, Échap pour
// fermer). Toucher la photo masque ou affiche les boutons. Sur iPhone et
// iPad, on peut zoomer en pinçant. Le bouton « bulle » ouvre l'écran Média
// de la photo (légende, couverture, commentaires).
export default function DiaporamaScreen({ route, navigation }: any) {
  const { souvenirId, index: indexInitial = 0 } = route.params;
  // Taille réellement disponible : mesurée, car sur le web l'app vit dans
  // une colonne centrale plus étroite que la fenêtre. La liste n'est
  // affichée qu'une fois la mesure connue, pour tomber pile sur la bonne
  // photo.
  const fenetre = useWindowDimensions();
  const [taille, setTaille] = useState<{ width: number; height: number } | null>(null);
  const width = taille?.width ?? fenetre.width;
  const height = taille?.height ?? fenetre.height;
  const surMesure = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    const h = Math.round(e.nativeEvent.layout.height);
    if (w > 0 && h > 0 && (w !== taille?.width || h !== taille?.height)) setTaille({ width: w, height: h });
  };
  const marges = useSafeAreaInsets();
  const [souvenir, setSouvenir] = useState<SouvenirDetaille | null | undefined>(undefined);
  const [index, setIndex] = useState<number>(indexInitial);
  const [interfaceVisible, setInterfaceVisible] = useState(true);
  const liste = useRef<FlatList<Media>>(null);

  const charger = useCallback(async () => {
    try {
      setSouvenir(await obtenirSouvenir(souvenirId));
    } catch {
      setSouvenir((s) => s ?? null);
    }
  }, [souvenirId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const medias = souvenir?.medias ?? [];
  const adresses = useAdresses(medias.map((m) => m.chemin));
  const dernier = Math.max(0, medias.length - 1);
  const courant: Media | undefined = medias[Math.min(index, dernier)];

  const fermer = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  const aller = useCallback(
    (i: number) => {
      if (i < 0 || i > dernier) return;
      setIndex(i);
      liste.current?.scrollToOffset({ offset: i * width, animated: true });
    },
    [dernier, width]
  );

  // Une photo supprimée depuis l'écran Média : rester dans les bornes.
  useEffect(() => {
    if (medias.length && index > dernier) setIndex(dernier);
  }, [medias.length, index, dernier]);

  // Rotation de l'écran ou fenêtre redimensionnée : rester sur la même photo.
  useEffect(() => {
    liste.current?.scrollToOffset({ offset: index * width, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  // Clavier sur ordinateur.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') aller(index + 1);
      else if (e.key === 'ArrowLeft') aller(index - 1);
      else if (e.key === 'Escape') fermer();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [aller, fermer, index]);

  const defilement = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index && i >= 0 && i <= dernier) setIndex(i);
  };

  const basculerInterface = () => setInterfaceVisible((v) => !v);

  const nbCommentaires = courant ? (souvenir?.commentaires ?? []).filter((c) => c.media_id === courant.id).length : 0;
  const grandEcran = width >= 700 || Platform.OS === 'web';

  const rendrePage = ({ item }: { item: Media }) => {
    const uri = adresses[item.chemin];
    if (item.type !== 'photo') {
      return (
        <View style={[styles.page, { width, height }]}>
          <Pressable
            onPress={() => uri && Linking.openURL(uri)}
            style={styles.fichier}
            accessibilityRole="button"
            accessibilityLabel={`Ouvrir : ${item.legende ?? LIBELLES[item.type]}`}
          >
            <Ionicons name={item.type === 'video' ? 'play-circle-outline' : ICONES_MEDIA[item.type]} size={88} color="#FFFFFF" />
            <Text style={styles.fichierTexte}>{item.legende ?? LIBELLES[item.type]}</Text>
            <Text style={styles.fichierAide}>Toucher pour ouvrir</Text>
          </Pressable>
        </View>
      );
    }
    const image = uri ? (
      <Pressable onPress={basculerInterface} style={{ width, height }} accessibilityLabel={item.legende ?? 'Photo'}>
        <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
      </Pressable>
    ) : null;
    // Zoom au pincement : géré nativement par ScrollView sur iOS seulement.
    if (Platform.OS === 'ios') {
      return (
        <ScrollView
          style={{ width, height }}
          contentContainerStyle={{ width, height }}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {image}
        </ScrollView>
      );
    }
    return <View style={[styles.page, { width, height }]}>{image}</View>;
  };

  return (
    <View style={styles.fond} onLayout={surMesure}>
      <StatusBar hidden={!interfaceVisible} style="light" />
      {!taille ? null : souvenir && medias.length > 0 ? (
        <FlatList
          ref={liste}
          data={medias}
          keyExtractor={(m) => m.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(indexInitial, dernier)}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onScroll={defilement}
          scrollEventThrottle={32}
          windowSize={5}
          initialNumToRender={3}
          renderItem={rendrePage}
        />
      ) : (
        <Pressable style={styles.centre} onPress={fermer}>
          <Text style={styles.fichierAide}>{souvenir === undefined ? 'Chargement…' : 'Aucune photo.'}</Text>
        </Pressable>
      )}

      {interfaceVisible && (
        <>
          <View style={[styles.barreHaut, { paddingTop: marges.top + 8 }]} pointerEvents="box-none">
            <Pressable onPress={fermer} style={styles.rond} accessibilityRole="button" accessibilityLabel="Fermer">
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </Pressable>
            {medias.length > 1 && (
              <Text style={styles.compteur}>
                {Math.min(index, dernier) + 1} / {medias.length}
              </Text>
            )}
            {courant ? (
              <Pressable
                onPress={() => navigation.navigate('Media', { souvenirId, index: Math.min(index, dernier) })}
                style={styles.rond}
                accessibilityRole="button"
                accessibilityLabel={`Légende et commentaires${nbCommentaires ? ` (${nbCommentaires})` : ''}`}
              >
                <Ionicons name={nbCommentaires ? 'chatbubble' : 'chatbubble-outline'} size={22} color="#FFFFFF" />
                {nbCommentaires > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeTexte}>{nbCommentaires}</Text>
                  </View>
                )}
              </Pressable>
            ) : (
              <View style={styles.rond} />
            )}
          </View>

          {grandEcran && index > 0 && (
            <Pressable onPress={() => aller(index - 1)} style={[styles.fleche, { left: 16 }]} accessibilityRole="button" accessibilityLabel="Photo précédente">
              <Ionicons name="chevron-back" size={30} color="#FFFFFF" />
            </Pressable>
          )}
          {grandEcran && index < dernier && (
            <Pressable onPress={() => aller(index + 1)} style={[styles.fleche, { right: 16 }]} accessibilityRole="button" accessibilityLabel="Photo suivante">
              <Ionicons name="chevron-forward" size={30} color="#FFFFFF" />
            </Pressable>
          )}

          {courant?.legende ? (
            <View style={[styles.barreBas, { paddingBottom: marges.bottom + 16 }]} pointerEvents="none">
              <Text style={styles.legende}>{courant.legende}</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: '#000000' },
  page: { alignItems: 'center', justifyContent: 'center' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fichier: { alignItems: 'center', gap: 8, padding: 24 },
  fichierTexte: { fontFamily: theme.fontBodyBold, fontSize: 18, color: '#FFFFFF', textAlign: 'center' },
  fichierAide: { fontFamily: theme.fontBody, fontSize: 14, color: '#CCCCCC' },
  barreHaut: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  rond: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compteur: { fontFamily: theme.fontBodyBold, fontSize: 16, color: '#FFFFFF' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTexte: { fontFamily: theme.fontBodyBold, fontSize: 11, color: '#000000' },
  fleche: {
    position: 'absolute',
    top: '50%',
    marginTop: -26,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barreBas: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  legende: { fontFamily: theme.fontManuscrit, fontSize: 17, color: '#FFFFFF', textAlign: 'center' },
});
