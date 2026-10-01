import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Image,
  Pressable,
  Linking,
  KeyboardAvoidingView,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes, useLargeurContenu } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  definirCouverture,
  modifierLegende,
  obtenirSouvenir,
  peutModifierSouvenir,
  supprimerMedia,
  type Media,
  type SouvenirDetaille,
} from '../services/souvenirs';
import { ICONES_MEDIA, useAdresses } from '../components/medias';
import Commentaires from '../components/Commentaires';
import { Champ } from '../components/formulaire';
import { Bouton, Chargement, MessageVide } from '../components/ui';
import { alerte } from '../utils/alerte';

const LIBELLES: Record<Media['type'], string> = {
  photo: 'Photo',
  video: 'Vidéo',
  audio: 'Enregistrement',
  document: 'Document',
};

function duree(secondes: number | null): string | null {
  if (!secondes) return null;
  const m = Math.floor(secondes / 60);
  const s = Math.round(secondes % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Médias d'un souvenir en plein écran, balayage de l'un à l'autre. Sous le
// média : sa légende, « mettre en couverture », supprimer, et ses propres
// commentaires. Vidéos, sons et PDF s'ouvrent dans le lecteur de l'appareil.
export default function MediaScreen({ route, navigation }: any) {
  const { souvenirId, index: indexInitial = 0 } = route.params;
  const { session, foyer } = useAuth();
  const moi = session?.user.id;
  const { width, height } = useLargeurContenu();
  const hauteurVue = Math.round(Math.min(height * 0.55, width * 1.1));
  const [souvenir, setSouvenir] = useState<SouvenirDetaille | null | undefined>(undefined);
  const [index, setIndex] = useState<number>(indexInitial);
  const [legende, setLegende] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const liste = useRef<FlatList<Media>>(null);

  const charger = useCallback(async () => {
    try {
      setSouvenir(await obtenirSouvenir(souvenirId));
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de charger les médias.'));
      setSouvenir((s) => s ?? null);
    }
  }, [souvenirId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const medias = souvenir?.medias ?? [];
  const courant: Media | undefined = medias[Math.min(index, medias.length - 1)];
  const adresses = useAdresses(medias.map((m) => m.chemin));

  useEffect(() => {
    setLegende(courant?.legende ?? '');
    navigation.setOptions({ title: medias.length > 1 ? `${index + 1} sur ${medias.length}` : 'Média' });
  }, [courant?.id, courant?.legende, index, medias.length]);

  const aller = (i: number) => {
    if (i < 0 || i >= medias.length) return;
    setIndex(i);
    liste.current?.scrollToIndex({ index: i, animated: true });
  };

  const finDeDefilement = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index && i >= 0 && i < medias.length) setIndex(i);
  };

  if (souvenir === undefined) return <Chargement />;
  if (!souvenir || !courant) {
    return (
      <View style={styles.flex}>
        <MessageVide titre="Aucun média" texte={erreur ?? undefined} />
      </View>
    );
  }

  const modifiable = peutModifierSouvenir(souvenir, moi, foyer?.id);
  const proprietaire = courant.ajoute_par === moi;
  const peutEditer = modifiable || proprietaire;

  const executer = async (cle: string, action: () => Promise<unknown>, messageErreur: string) => {
    setErreur(null);
    setEnCours(cle);
    try {
      await action();
      await charger();
    } catch (e) {
      setErreur(extraireMessageErreur(e, messageErreur));
    } finally {
      setEnCours(null);
    }
  };

  const supprimer = () =>
    alerte(`Supprimer ce${courant.type === 'photo' ? 'tte photo' : ' média'} ?`, 'Il sera supprimé pour toute la famille.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          executer(
            'supprimer',
            async () => {
              await supprimerMedia(courant);
              if (medias.length <= 1) navigation.goBack();
              else setIndex(Math.max(0, index - 1));
            },
            'Suppression impossible.'
          ),
      },
    ]);

  const adresse = adresses[courant.chemin];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        <View style={[styles.vue, { height: hauteurVue }]}>
          <FlatList
            ref={liste}
            data={medias}
            keyExtractor={(m) => m.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.min(indexInitial, Math.max(0, medias.length - 1))}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={finDeDefilement}
            onScrollEndDrag={Platform.OS === 'web' ? finDeDefilement : undefined}
            renderItem={({ item }) => {
              const uri = adresses[item.chemin];
              return (
                <View style={{ width, height: hauteurVue, alignItems: 'center', justifyContent: 'center' }}>
                  {item.type === 'photo' ? (
                    uri ? (
                      <Image source={{ uri }} style={{ width, height: hauteurVue }} resizeMode="contain" accessibilityLabel={item.legende ?? 'Photo'} />
                    ) : null
                  ) : (
                    <Pressable
                      onPress={() => uri && Linking.openURL(uri)}
                      style={styles.fichier}
                      accessibilityRole="button"
                      accessibilityLabel={`Ouvrir : ${item.legende ?? LIBELLES[item.type]}`}
                    >
                      <Ionicons name={ICONES_MEDIA[item.type]} size={64} color="#FFFFFF" />
                      <Text style={styles.fichierTexte}>{item.legende ?? LIBELLES[item.type]}</Text>
                      <Text style={styles.fichierAide}>
                        {[duree(item.duree_secondes), 'Toucher pour ouvrir'].filter(Boolean).join(' · ')}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            }}
          />
          {index > 0 && (
            <Pressable onPress={() => aller(index - 1)} style={[styles.fleche, styles.flecheGauche]} accessibilityRole="button" accessibilityLabel="Précédent">
              <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
            </Pressable>
          )}
          {index < medias.length - 1 && (
            <Pressable onPress={() => aller(index + 1)} style={[styles.fleche, styles.flecheDroite]} accessibilityRole="button" accessibilityLabel="Suivant">
              <Ionicons name="chevron-forward" size={26} color="#FFFFFF" />
            </Pressable>
          )}
        </View>

        <View style={styles.infos}>
          {peutEditer ? (
            <>
              <Champ
                value={legende}
                onChangeText={setLegende}
                placeholder="Légende (qui, où, quoi…)"
                accessibilityLabel="Légende"
              />
              {legende.trim() !== (courant.legende ?? '') && (
                <Bouton
                  titre="Enregistrer la légende"
                  onPress={() => executer('legende', () => modifierLegende(courant.id, legende), 'Enregistrement impossible.')}
                  enCours={enCours === 'legende'}
                />
              )}
            </>
          ) : courant.legende ? (
            <Text style={styles.legende}>{courant.legende}</Text>
          ) : null}

          <View style={styles.actions}>
            {courant.type !== 'photo' && adresse ? (
              <Bouton variante="contour" titre="Ouvrir" onPress={() => Linking.openURL(adresse)} />
            ) : null}
            {modifiable && courant.type === 'photo' && souvenir.couverture_id !== courant.id ? (
              <Bouton
                variante="contour"
                titre="Mettre en couverture"
                onPress={() => executer('couverture', () => definirCouverture(souvenir.id, courant.id), 'Impossible de changer la couverture.')}
                enCours={enCours === 'couverture'}
              />
            ) : null}
            {modifiable && souvenir.couverture_id === courant.id ? <Text style={styles.aide}>★ Photo de couverture</Text> : null}
            {peutEditer ? (
              <Bouton variante="discret" titre="Supprimer" onPress={supprimer} enCours={enCours === 'supprimer'} />
            ) : null}
          </View>
          {erreur && <Text style={styles.erreur}>{erreur}</Text>}

          <Commentaires
            souvenirId={souvenir.id}
            mediaId={courant.id}
            commentaires={souvenir.commentaires}
            peutModerer={modifiable}
            onChange={charger}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { paddingBottom: theme.spacing.xl * 2 },
  vue: { backgroundColor: '#000000' },
  fichier: { alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.lg },
  fichierTexte: { fontFamily: theme.fontBodyBold, fontSize: 17, color: '#FFFFFF', textAlign: 'center' },
  fichierAide: { fontFamily: theme.fontBody, fontSize: 14, color: '#DDDDDD' },
  fleche: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flecheGauche: { left: 8 },
  flecheDroite: { right: 8 },
  infos: { padding: theme.spacing.md, gap: theme.spacing.sm },
  legende: { fontFamily: theme.fontManuscrit, fontSize: 17, color: theme.colors.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing.sm },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
