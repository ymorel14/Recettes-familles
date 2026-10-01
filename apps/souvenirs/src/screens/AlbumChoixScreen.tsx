import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { useFamilleDonnees } from '../contexts/FamilleDonneesContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  ajouterAuxAlbums,
  listerSouvenirs,
  obtenirAlbum,
  peutAjouterALAlbum,
  type Album,
  type CarteSouvenir,
} from '../services/souvenirs';
import { Champ } from '../components/formulaire';
import { Bouton, Chargement, MessageVide } from '../components/ui';
import { formaterDateSouvenir } from '../utils/dates';

function normaliser(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Choisir des souvenirs existants à verser dans un album. Dans un album
// "famille" dont on n'est pas le gestionnaire, seuls ses propres souvenirs
// sont proposés (règle de la base).
export default function AlbumChoixScreen({ route, navigation }: any) {
  const albumId: string = route.params.albumId;
  const { session, famille, foyer } = useAuth();
  const { categorie, lignePrenoms } = useFamilleDonnees();
  const moi = session?.user.id;
  const [album, setAlbum] = useState<Album | null>(null);
  const [deja, setDeja] = useState<Set<string>>(new Set());
  const [souvenirs, setSouvenirs] = useState<CarteSouvenir[] | null>(null);
  const [filtre, setFiltre] = useState('');
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!famille) return;
    Promise.all([obtenirAlbum(albumId), listerSouvenirs(famille.id)])
      .then(([r, liste]) => {
        setAlbum(r?.album ?? null);
        setDeja(new Set((r?.souvenirs ?? []).map((s) => s.id)));
        setSouvenirs(liste);
      })
      .catch((e) => {
        setErreur(extraireMessageErreur(e, 'Impossible de charger les souvenirs.'));
        setSouvenirs([]);
      });
  }, [albumId, famille?.id]);

  const proposes = useMemo(() => {
    if (!album || !souvenirs) return [];
    const f = normaliser(filtre.trim());
    return souvenirs.filter(
      (s) =>
        !deja.has(s.id) &&
        peutAjouterALAlbum(album, s.cree_par, moi, foyer?.id) &&
        (!f ||
          normaliser([s.titre, s.lieu, s.pays, ...s.etiquettes, ...s.autres_personnes, categorie(s.categorie).libelle].join(' ')).includes(f))
    );
  }, [album, souvenirs, deja, filtre, moi, foyer?.id, categorie]);

  const basculer = (id: string) =>
    setChoisis((avant) => {
      const n = new Set(avant);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const valider = async () => {
    if (!moi || choisis.size === 0) return;
    setEnCours(true);
    setErreur(null);
    try {
      await ajouterAuxAlbums([albumId], Array.from(choisis), moi);
      navigation.goBack();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Ajout impossible.'));
      setEnCours(false);
    }
  };

  if (!souvenirs) return <Chargement />;

  return (
    <View style={styles.flex}>
      <FlatList
        contentContainerStyle={styles.contenu}
        data={proposes}
        keyExtractor={(s) => s.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.entete}>
            {album ? <Text style={styles.titre}>Ajouter à « {album.titre} »</Text> : null}
            <Champ value={filtre} onChangeText={setFiltre} placeholder="Filtrer (ex. moto, Bretagne, 2015)" accessibilityLabel="Filtrer" />
            {erreur && <Text style={styles.erreur}>{erreur}</Text>}
          </View>
        }
        ListEmptyComponent={<MessageVide titre="Aucun souvenir à ajouter" texte={filtre ? 'Essayez un autre mot.' : undefined} />}
        renderItem={({ item }) => {
          const coche = choisis.has(item.id);
          const prenoms = lignePrenoms(item.personnes, item.autres_personnes);
          return (
            <Pressable
              onPress={() => basculer(item.id)}
              style={[styles.ligne, coche && styles.ligneCochee]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: coche }}
            >
              <Ionicons name={coche ? 'checkbox' : 'square-outline'} size={24} color={coche ? theme.colors.accent : theme.colors.textMuted} />
              <View style={styles.textes}>
                <Text style={styles.ligneTitre}>{item.titre}</Text>
                <Text style={styles.ligneDetail}>
                  {formaterDateSouvenir(item.date_debut, item.date_fin, item.precision_date)}
                  {prenoms ? ` · ${prenoms}` : ''}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
      <View style={styles.pied}>
        <Bouton
          titre={choisis.size ? `Ajouter ${choisis.size} souvenir${choisis.size > 1 ? 's' : ''}` : 'Choisissez des souvenirs'}
          onPress={valider}
          enCours={enCours}
          desactive={choisis.size === 0}
        />
      </View>
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.xs, paddingBottom: theme.spacing.xl },
  entete: { gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  titre: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 56,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  ligneCochee: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentTransparent },
  textes: { flex: 1, gap: 2, paddingVertical: 6 },
  ligneTitre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  ligneDetail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  pied: {
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
