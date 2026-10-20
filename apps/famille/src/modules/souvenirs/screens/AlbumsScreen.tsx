import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import { listerAlbums, VISIBILITES_ALBUM, type Album } from '../services/souvenirs';
import { useAdresses, Vignette } from '../components/medias';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';

// "2005 – 2015", "2019", "" : période couverte par un album.
export function periodeAlbum(debut: string | null, fin: string | null): string {
  const a = debut?.slice(0, 4);
  const b = fin?.slice(0, 4);
  if (!a && !b) return '';
  if (!a || !b || a === b) return (a ?? b)!;
  return `${a} – ${b}`;
}

// Albums de la famille active : des collections de souvenirs (« Mes
// motos », « Les enfants que j'ai gardés », « Nos Noëls »).
export default function AlbumsScreen({ navigation }: any) {
  const { famille } = useAuth();
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const charger = useCallback(async () => {
    if (!famille) return;
    try {
      setAlbums(await listerAlbums(famille.id));
      setErreur(null);
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de charger les albums.'));
      setAlbums((a) => a ?? []);
    }
  }, [famille?.id]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const adresses = useAdresses((albums ?? []).map((a) => a.couverture));

  if (!albums) return <Chargement />;

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.contenu}
      data={albums}
      keyExtractor={(a) => a.id}
      refreshControl={
        <RefreshControl
          refreshing={rafraichissement}
          onRefresh={async () => {
            setRafraichissement(true);
            await charger();
            setRafraichissement(false);
          }}
          tintColor={theme.colors.accent}
        />
      }
      ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
      ListHeaderComponent={
        <View style={styles.entete}>
          <Bouton titre="+ Nouvel album" onPress={() => navigation.navigate('AlbumForm')} />
          {erreur && <Text style={styles.erreur}>{erreur}</Text>}
        </View>
      }
      ListEmptyComponent={
        <MessageVide
          titre="Aucun album pour l'instant"
          texte="Un album regroupe des souvenirs autour d'un fil : « Mes motos », « Les enfants que j'ai gardés », « Nos Noëls », « La maison de Bretagne »…"
        />
      }
      renderItem={({ item }) => {
        const periode = periodeAlbum(item.premiere_date, item.derniere_date);
        const visibilite = VISIBILITES_ALBUM.find((v) => v.id === item.visibilite);
        return (
          <Pressable
            onPress={() => navigation.navigate('Album', { id: item.id })}
            style={({ pressed }) => [styles.carte, pressed && styles.appuye]}
            accessibilityRole="button"
            accessibilityLabel={`${item.titre}, ${item.nb_souvenirs} souvenirs`}
          >
            {item.couverture && adresses[item.couverture] ? (
              <Vignette uri={adresses[item.couverture]} style={styles.couverture} libelle={item.titre} />
            ) : (
              <View style={[styles.couverture, styles.sansPhoto]}>
                <Ionicons name="albums-outline" size={34} color={theme.colors.accent} />
              </View>
            )}
            <View style={styles.textes}>
              <Text style={styles.titre} numberOfLines={2}>
                {item.titre}
              </Text>
              <Text style={styles.detail}>
                {item.nb_souvenirs} souvenir{item.nb_souvenirs > 1 ? 's' : ''}
                {periode ? ` · ${periode}` : ''}
              </Text>
              {item.description ? (
                <Text style={styles.description} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              {visibilite && item.visibilite !== 'famille' ? <Pastille texte={visibilite.titre} ton="neutre" /> : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl },
  entete: { gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  carte: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
  },
  appuye: { opacity: 0.7 },
  couverture: { width: 104, height: 104, borderRadius: theme.radii.md },
  sansPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.selectionTransparent,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  textes: { flex: 1, gap: 4, justifyContent: 'center' },
  titre: { fontFamily: theme.fontTitle, fontSize: 19, color: theme.colors.text },
  detail: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.textMuted },
  description: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
