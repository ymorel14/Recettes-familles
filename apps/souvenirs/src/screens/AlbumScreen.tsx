import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { useFamilleDonnees } from '../contexts/FamilleDonneesContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  obtenirAlbum,
  peutModifierAlbum,
  retirerDeLAlbum,
  VISIBILITES_ALBUM,
  type Album,
  type CarteSouvenir as Carte,
} from '../services/souvenirs';
import CarteSouvenir from '../components/CarteSouvenir';
import { useAdresses } from '../components/medias';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';
import { alerte } from '../utils/alerte';
import { periodeAlbum } from './AlbumsScreen';

// Un album : ses souvenirs du plus ancien au plus récent (on lit un album
// dans l'ordre de la vie : la première moto, puis la suivante…).
export default function AlbumScreen({ route, navigation }: any) {
  const id: string = route.params.id;
  const { session, foyer } = useAuth();
  const { categorie, lignePrenoms, completer } = useFamilleDonnees();
  const moi = session?.user.id;
  const [album, setAlbum] = useState<Album | null | undefined>(undefined);
  const [souvenirs, setSouvenirs] = useState<Carte[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await obtenirAlbum(id);
      setAlbum(r?.album ?? null);
      setSouvenirs(r?.souvenirs ?? []);
      if (r) completer(r.souvenirs.flatMap((s) => s.personnes.map((p) => p.personne_id))).catch(() => {});
    } catch (e) {
      setErreur(extraireMessageErreur(e, "Impossible de charger l'album."));
      setAlbum((a) => a ?? null);
    }
  }, [id, completer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const gerable = album ? peutModifierAlbum(album, moi, foyer?.id) : false;
  // Album "famille" : chacun peut y verser ses propres souvenirs.
  const ouvert = album ? gerable || album.visibilite === 'famille' : false;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: album?.titre ?? 'Album',
      headerRight: gerable
        ? () => (
            <Pressable
              onPress={() => navigation.navigate('AlbumForm', { id })}
              accessibilityRole="button"
              accessibilityLabel="Modifier l'album"
              style={{ paddingHorizontal: theme.spacing.sm, minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 15 }}>Modifier</Text>
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, album?.titre, gerable, id]);

  const adresses = useAdresses(souvenirs.map((s) => s.couverture));

  const retirer = (s: Carte) =>
    alerte(`Retirer « ${s.titre} » de l'album ?`, 'Le souvenir lui-même est conservé.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await retirerDeLAlbum(id, s.id);
            await charger();
          } catch (e) {
            setErreur(extraireMessageErreur(e, 'Impossible de retirer ce souvenir.'));
          }
        },
      },
    ]);

  if (album === undefined) return <Chargement />;
  if (album === null) {
    return (
      <View style={styles.flex}>
        <MessageVide titre="Album introuvable" texte={erreur ?? 'Il a peut-être été supprimé.'} />
      </View>
    );
  }

  const fin = souvenirs.reduce<string | null>((max, s) => {
    const d = s.date_fin ?? s.date_debut;
    return d && (!max || d > max) ? d : max;
  }, null);
  const periode = periodeAlbum(souvenirs.find((s) => s.date_debut)?.date_debut ?? null, fin);
  const visibilite = VISIBILITES_ALBUM.find((v) => v.id === album.visibilite);

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.contenu}
      data={souvenirs}
      keyExtractor={(s) => s.id}
      ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
      ListHeaderComponent={
        <View style={styles.entete}>
          <Text style={styles.titre}>{album.titre}</Text>
          <Text style={styles.detail}>
            {souvenirs.length} souvenir{souvenirs.length > 1 ? 's' : ''}
            {periode ? ` · ${periode}` : ''}
          </Text>
          {visibilite && album.visibilite !== 'famille' ? <Pastille texte={visibilite.titre} ton="neutre" /> : null}
          {album.description ? <Text style={styles.description}>{album.description}</Text> : null}
          {ouvert && (
            <View style={styles.actions}>
              <Bouton
                titre="+ Nouveau souvenir"
                onPress={() => navigation.navigate('SouvenirForm', { albumId: id })}
                style={styles.action}
              />
              <Bouton
                variante="contour"
                titre="Ajouter des souvenirs"
                onPress={() => navigation.navigate('AlbumChoix', { albumId: id })}
                accessibilityLabel="Ajouter des souvenirs existants à l'album"
              />
            </View>
          )}
          {erreur && <Text style={styles.erreur}>{erreur}</Text>}
        </View>
      }
      ListEmptyComponent={
        <MessageVide titre="Album vide" texte="Ajoutez un nouveau souvenir, ou choisissez parmi ceux de la famille." />
      }
      renderItem={({ item }) => {
        const retirable = gerable || (item.cree_par === moi && album.visibilite === 'famille');
        return (
          <View>
            <CarteSouvenir
              titre={item.titre}
              categorie={categorie(item.categorie)}
              dateDebut={item.date_debut}
              dateFin={item.date_fin}
              precision={item.precision_date}
              lieu={item.lieu}
              prenoms={lignePrenoms(item.personnes, item.autres_personnes)}
              adresseCouverture={item.couverture ? adresses[item.couverture] : null}
              nbMedias={item.nb_medias}
              onPress={() => navigation.navigate('Souvenir', { id: item.id })}
            />
            {retirable && (
              <Pressable
                onPress={() => retirer(item)}
                hitSlop={8}
                style={styles.retirer}
                accessibilityRole="button"
                accessibilityLabel={`Retirer ${item.titre} de l'album`}
              >
                <Text style={styles.lien}>Retirer de l'album</Text>
              </Pressable>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl },
  entete: { gap: theme.spacing.xs, marginBottom: theme.spacing.md },
  titre: { fontFamily: theme.fontTitle, fontSize: 28, color: theme.colors.text },
  detail: { fontFamily: theme.fontManuscrit, fontSize: 17, color: theme.colors.accent },
  description: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text, lineHeight: 23 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  action: { flexGrow: 1 },
  retirer: { alignSelf: 'flex-end', paddingTop: 4, paddingRight: 4 },
  lien: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, textDecorationLine: 'underline' },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
