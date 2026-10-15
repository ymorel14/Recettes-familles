import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, Text, FlatList, Image, Pressable, Platform, type LayoutChangeEvent } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes, useLargeurContenu } from '../theme/theme';
import { extraireMessageErreur } from '@apps-famille/famille';
import { obtenirSouvenir, type Media, type SouvenirDetaille } from '../services/souvenirs';
import { ICONES_MEDIA, useAdresses } from '../components/medias';
import { Chargement, MessageVide } from '../components/ui';
import { formaterDateSouvenir } from '../utils/dates';

const ESPACE = 4;
const LARGEUR_MAX = 1200;

// Nombre de colonnes selon la largeur : 2 sur un petit téléphone, 3 sur un
// grand, 4 à 6 sur tablette et ordinateur (comme l'app Photos d'un iPad).
function colonnesPour(largeur: number): number {
  if (largeur < 380) return 2;
  if (largeur < 600) return 3;
  if (largeur < 900) return 4;
  if (largeur < 1100) return 5;
  return 6;
}

function resume(medias: Media[]): string {
  const photos = medias.filter((m) => m.type === 'photo').length;
  const videos = medias.filter((m) => m.type === 'video').length;
  const autres = medias.length - photos - videos;
  return [
    photos ? `${photos} photo${photos > 1 ? 's' : ''}` : null,
    videos ? `${videos} vidéo${videos > 1 ? 's' : ''}` : null,
    autres ? `${autres} autre${autres > 1 ? 's' : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// L'album d'un souvenir : toutes ses photos en grandes vignettes carrées.
// Toucher une vignette ouvre la visionneuse plein écran (Diaporama), où l'on
// passe d'une photo à l'autre en glissant.
export default function GalerieScreen({ route, navigation }: any) {
  const { souvenirId } = route.params;
  // Largeur réellement disponible : mesurée (sur le web, l'app vit dans
  // une colonne centrale plus étroite que la fenêtre), estimée en attendant.
  const estimation = useLargeurContenu().width;
  const [mesure, setMesure] = useState<number | null>(null);
  const largeur = Math.min(mesure ?? estimation, LARGEUR_MAX);
  const surMesure = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== mesure) setMesure(w);
  };
  const colonnes = colonnesPour(largeur);
  const cote = Math.floor((largeur - ESPACE * (colonnes + 1)) / colonnes);
  const [souvenir, setSouvenir] = useState<SouvenirDetaille | null | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setSouvenir(await obtenirSouvenir(souvenirId));
    } catch (e) {
      setErreur(extraireMessageErreur(e, "Impossible de charger l'album."));
      setSouvenir((s) => s ?? null);
    }
  }, [souvenirId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: souvenir?.titre ?? 'Album' });
  }, [navigation, souvenir?.titre]);

  const medias = souvenir?.medias ?? [];
  const adresses = useAdresses(medias.filter((m) => m.type === 'photo').map((m) => m.chemin));

  if (souvenir === undefined) return <Chargement />;
  if (!souvenir || medias.length === 0) {
    return (
      <View style={styles.flex}>
        <MessageVide titre="Aucune photo" texte={erreur ?? 'Ce souvenir n’a pas encore de photos.'} />
      </View>
    );
  }

  const commentairesPar = new Map<string, number>();
  souvenir.commentaires.forEach((c) => {
    if (c.media_id) commentairesPar.set(c.media_id, (commentairesPar.get(c.media_id) ?? 0) + 1);
  });
  const date = formaterDateSouvenir(souvenir.date_debut, souvenir.date_fin, souvenir.precision_date);

  return (
    <View style={styles.flex} onLayout={surMesure}>
      <FlatList
        key={colonnes}
        data={medias}
        keyExtractor={(m) => m.id}
        numColumns={colonnes}
        style={styles.flex}
        contentContainerStyle={[styles.grille, { width: largeur }]}
        columnWrapperStyle={colonnes > 1 ? { gap: ESPACE } : undefined}
        ListHeaderComponent={
          <View style={styles.entete}>
            <Text style={styles.titre} numberOfLines={2}>
              {souvenir.titre}
            </Text>
            <Text style={styles.sousTitre}>{[date, resume(medias)].filter(Boolean).join(' · ')}</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const uri = adresses[item.chemin];
          const nb = commentairesPar.get(item.id) ?? 0;
          return (
            <Pressable
              onPress={() => navigation.navigate('Diaporama', { souvenirId, index })}
              style={({ pressed, hovered }: any) => [
                styles.case,
                { width: cote, height: cote },
                (pressed || hovered) && styles.caseActive,
              ]}
              accessibilityRole="imagebutton"
              accessibilityLabel={item.legende ?? `${item.type === 'photo' ? 'Photo' : 'Média'} ${index + 1} sur ${medias.length}`}
            >
              {item.type === 'photo' ? (
                uri ? (
                  <Image source={{ uri }} style={styles.image} resizeMode="cover" />
                ) : (
                  <View style={[styles.image, styles.attente]} />
                )
              ) : (
                <View style={[styles.image, styles.substitut]}>
                  <Ionicons name={ICONES_MEDIA[item.type]} size={Math.min(48, cote / 3)} color={theme.colors.accent} />
                  {item.legende ? (
                    <Text style={styles.substitutTexte} numberOfLines={2}>
                      {item.legende}
                    </Text>
                  ) : null}
                </View>
              )}
              {item.type === 'video' && (
                <View style={styles.pastilleVideo}>
                  <Ionicons name="play" size={14} color="#FFFFFF" />
                </View>
              )}
              {item.id === souvenir.couverture_id && (
                <View style={styles.pastilleCouverture}>
                  <Ionicons name="star" size={12} color="#FFFFFF" />
                </View>
              )}
              {nb > 0 && (
                <View style={styles.pastilleCommentaires}>
                  <Ionicons name="chatbubble" size={11} color="#FFFFFF" />
                  <Text style={styles.pastilleTexte}>{nb}</Text>
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const pastille = {
  position: 'absolute' as const,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  borderRadius: 12,
  minWidth: 24,
  height: 24,
  paddingHorizontal: 6,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  gap: 3,
};

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  grille: {
    alignSelf: 'center',
    padding: ESPACE,
    gap: ESPACE,
    paddingBottom: theme.spacing.xl * 2,
  },
  entete: { paddingHorizontal: theme.spacing.sm, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.md, gap: 2 },
  titre: { fontFamily: theme.fontTitle, fontSize: 24, color: theme.colors.text },
  sousTitre: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  case: {
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transitionDuration: '150ms' } as any) : {}),
  },
  caseActive: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  image: { width: '100%', height: '100%' },
  attente: { backgroundColor: theme.colors.surface },
  substitut: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
  },
  substitutTexte: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.textMuted, textAlign: 'center' },
  pastilleVideo: { ...pastille, top: 6, left: 6 },
  pastilleCouverture: { ...pastille, top: 6, right: 6 },
  pastilleCommentaires: { ...pastille, bottom: 6, right: 6 },
  pastilleTexte: { fontFamily: theme.fontBodyBold, fontSize: 11, color: '#FFFFFF' },
}));
