import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, Text, ScrollView, FlatList, Pressable, Platform, KeyboardAvoidingView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { useFamilleDonnees } from '../contexts/FamilleDonneesContext';
import { extraireMessageErreur, prenomsDe } from '@apps-famille/famille';
import {
  ajouterAuxAlbums,
  albumsDuSouvenir,
  listerAlbums,
  peutAjouterALAlbum,
  ajouterMedia,
  ajouterPresence,
  obtenirSouvenir,
  peutModifierSouvenir,
  retirerPresence,
  VISIBILITES,
  type FichierLocal,
  type Album,
  type SouvenirDetaille,
} from '../services/souvenirs';
import { useAdresses, Vignette } from '../components/medias';
import Commentaires from '../components/Commentaires';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';
import { alerte } from '../utils/alerte';
import { choisirDansLaGalerie, choisirSonsOuDocuments, prendreUnePhoto } from '../utils/choixMedias';
import { ageSouvenir, formaterDateSouvenir } from '../utils/dates';

// Un souvenir : photos en bandeau, date, lieu, personnes (avec leur âge),
// récit, étiquettes et commentaires. Toute personne qui le voit peut ajouter
// des photos, dire « j'y étais » et commenter.
export default function SouvenirScreen({ route, navigation }: any) {
  const id: string = route.params.id;
  const { session, foyer, famille } = useAuth();
  const { categorie, personne, mesPersonnes, completer } = useFamilleDonnees();
  const moi = session?.user.id;
  const [souvenir, setSouvenir] = useState<SouvenirDetaille | null | undefined>(undefined);
  const [auteur, setAuteur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choixOuvert, setChoixOuvert] = useState(false);
  const [choixPresence, setChoixPresence] = useState(false);
  const [sesAlbums, setSesAlbums] = useState<{ id: string; titre: string }[]>([]);
  const [albumsDispo, setAlbumsDispo] = useState<Album[] | null>(null);

  const charger = useCallback(async () => {
    try {
      const [s, albums] = await Promise.all([obtenirSouvenir(id), albumsDuSouvenir(id).catch(() => [])]);
      setSouvenir(s);
      setSesAlbums(albums);
      if (s) {
        completer(s.personnes.map((p) => p.personne_id)).catch(() => {});
        if (s.cree_par && s.cree_par !== moi) {
          prenomsDe([s.cree_par])
            .then((m) => setAuteur(m.get(s.cree_par!) ?? null))
            .catch(() => {});
        }
      }
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de charger ce souvenir.'));
      setSouvenir((s) => s ?? null);
    }
  }, [id, moi, completer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const modifiable = souvenir ? peutModifierSouvenir(souvenir, moi, foyer?.id) : false;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: souvenir?.titre ?? 'Souvenir',
      headerRight: modifiable
        ? () => (
            <Pressable
              onPress={() => navigation.navigate('SouvenirForm', { id })}
              accessibilityRole="button"
              accessibilityLabel="Modifier le souvenir"
              style={{ paddingHorizontal: theme.spacing.sm, minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 15 }}>Modifier</Text>
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, souvenir?.titre, modifiable, id]);

  const adresses = useAdresses((souvenir?.medias ?? []).filter((m) => m.type === 'photo').map((m) => m.chemin));

  const envoyer = async (choix: () => Promise<FichierLocal[]>) => {
    if (!souvenir || !moi) return;
    setErreur(null);
    let fichiers: FichierLocal[];
    try {
      fichiers = await choix();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Choix impossible.'));
      return;
    }
    if (fichiers.length === 0) return;
    const debutOrdre = souvenir.medias.reduce((max, m) => Math.max(max, m.ordre), 0) + 1;
    const echecs: string[] = [];
    for (let i = 0; i < fichiers.length; i++) {
      setEnvoi(fichiers.length > 1 ? `Envoi ${i + 1} sur ${fichiers.length}…` : 'Envoi en cours…');
      try {
        await ajouterMedia(souvenir.id, moi, fichiers[i], debutOrdre + i);
      } catch (e) {
        echecs.push(extraireMessageErreur(e, 'Envoi impossible.'));
      }
    }
    setEnvoi(null);
    if (echecs.length) {
      setErreur(
        echecs.length === fichiers.length
          ? echecs[0]
          : `${echecs.length} fichier${echecs.length > 1 ? 's' : ''} sur ${fichiers.length} n'ont pas pu être envoyés : ${echecs[0]}`
      );
    }
    await charger();
  };

  // Choix de la source affiché sous le bouton (un menu natif Android ne
  // montre que trois boutons).
  const ajouterDesMedias = () => setChoixOuvert((o) => !o);

  // « J'y étais » : moi ou un enfant de mon foyer pas encore cité.
  const absents = souvenir
    ? mesPersonnes.filter((p) => !souvenir.personnes.some((sp) => sp.personne_id === p.id))
    : [];
  const ajouterPresent = async (personneId: string) => {
    setChoixPresence(false);
    try {
      await ajouterPresence(id, personneId);
      await charger();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de vous ajouter.'));
    }
  };
  const jyEtais = () => {
    if (absents.length === 1) ajouterPresent(absents[0].id);
    else setChoixPresence((o) => !o);
  };

  // Ranger le souvenir dans un album : la liste s'ouvre sous le bouton.
  const ouvrirAlbums = async () => {
    if (albumsDispo) {
      setAlbumsDispo(null);
      return;
    }
    if (!famille) return;
    try {
      setAlbumsDispo(await listerAlbums(famille.id));
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de charger les albums.'));
    }
  };
  const rangerDans = async (albumId: string) => {
    if (!moi) return;
    try {
      await ajouterAuxAlbums([albumId], [id], moi);
      setAlbumsDispo(null);
      await charger();
    } catch (e) {
      setErreur(extraireMessageErreur(e, "Impossible d'ajouter à cet album."));
    }
  };

  const meRetirer = (personneId: string, prenom: string) =>
    alerte(`Retirer ${prenom} de ce souvenir ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await retirerPresence(id, personneId);
            await charger();
          } catch (e) {
            setErreur(extraireMessageErreur(e, 'Impossible de retirer cette personne.'));
          }
        },
      },
    ]);

  if (souvenir === undefined) return <Chargement />;
  if (souvenir === null) {
    return (
      <View style={styles.flex}>
        <MessageVide titre="Souvenir introuvable" texte={erreur ?? 'Il a peut-être été supprimé, ou il ne vous est pas visible.'} />
      </View>
    );
  }

  const cat = categorie(souvenir.categorie);
  const visibilite = VISIBILITES.find((v) => v.id === souvenir.visibilite);
  const lieu = [souvenir.lieu, souvenir.pays].filter(Boolean).join(', ');
  const triees = [...souvenir.personnes].sort((a, b) => (a.role === b.role ? 0 : a.role === 'principal' ? -1 : 1));
  const nbCommentairesPhotos = souvenir.commentaires.filter((c) => c.media_id).length;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        {souvenir.medias.length > 0 ? (
          <FlatList
            horizontal
            data={souvenir.medias}
            keyExtractor={(m) => m.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bandeau}
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => navigation.navigate('Media', { souvenirId: souvenir.id, index })}
                accessibilityRole="imagebutton"
                accessibilityLabel={item.legende ?? `Média ${index + 1}`}
              >
                <Vignette
                  uri={adresses[item.chemin]}
                  type={item.type}
                  libelle={item.legende}
                  style={[styles.vignette, index === 0 && styles.vignettePremiere]}
                />
                {item.id === souvenir.couverture_id && (
                  <View style={styles.etoile}>
                    <Ionicons name="star" size={14} color={theme.colors.background} />
                  </View>
                )}
              </Pressable>
            )}
          />
        ) : null}

        <Bouton
          variante="pointille"
          titre={envoi ?? (souvenir.medias.length ? '+ Ajouter des photos' : '+ Ajouter les premières photos')}
          onPress={ajouterDesMedias}
          enCours={false}
          desactive={envoi !== null}
        />
        {choixOuvert && envoi === null && (
          <View style={styles.choixWeb}>
            <Bouton
              variante="contour"
              titre="Photos et vidéos"
              onPress={() => {
                setChoixOuvert(false);
                envoyer(choisirDansLaGalerie);
              }}
            />
            {Platform.OS !== 'web' && (
              <Bouton
                variante="contour"
                titre="Prendre une photo"
                onPress={() => {
                  setChoixOuvert(false);
                  envoyer(prendreUnePhoto);
                }}
              />
            )}
            <Bouton
              variante="contour"
              titre="Son ou document (PDF)"
              onPress={() => {
                setChoixOuvert(false);
                envoyer(choisirSonsOuDocuments);
              }}
            />
          </View>
        )}

        <View style={styles.entete}>
          <View style={styles.ligne}>
            <Ionicons name={cat.icone as any} size={18} color={theme.colors.accent} />
            <Text style={styles.categorie}>{cat.libelle}</Text>
            {visibilite && souvenir.visibilite !== 'famille' ? (
              <Pastille texte={visibilite.titre} ton="neutre" />
            ) : null}
          </View>
          <Text style={styles.titre}>{souvenir.titre}</Text>
          <Text style={styles.date}>{formaterDateSouvenir(souvenir.date_debut, souvenir.date_fin, souvenir.precision_date)}</Text>
          {lieu ? (
            <View style={styles.ligne}>
              <Ionicons name="location-outline" size={16} color={theme.colors.textMuted} />
              <Text style={styles.lieu}>{lieu}</Text>
            </View>
          ) : null}
        </View>

        {(triees.length > 0 || absents.length > 0 || souvenir.autres_personnes.length > 0) && (
          <View style={styles.personnes}>
            {triees.map((sp) => {
              const p = personne(sp.personne_id);
              const prenom = p?.prenom ?? '…';
              const age = ageSouvenir(p?.date_naissance ?? null, souvenir.date_debut, souvenir.precision_date);
              const retirable = modifiable || mesPersonnes.some((m) => m.id === sp.personne_id);
              return (
                <Pressable
                  key={sp.personne_id}
                  onLongPress={retirable ? () => meRetirer(sp.personne_id, prenom) : undefined}
                  style={[styles.personne, sp.role === 'principal' && styles.personnePrincipale]}
                  accessibilityLabel={`${prenom}${age ? `, ${age}` : ''}${sp.role === 'present' ? ', présent' : ''}`}
                  accessibilityHint={retirable ? 'Appui long pour retirer' : undefined}
                >
                  <Text style={[styles.personneTexte, sp.role === 'principal' && styles.personneTextePrincipal]}>
                    {prenom}
                    {age ? <Text style={styles.age}> · {age}</Text> : null}
                  </Text>
                </Pressable>
              );
            })}
            {souvenir.autres_personnes.map((nom) => (
              <View key={`autre-${nom}`} style={[styles.personne, styles.autre]} accessibilityLabel={`${nom}, hors famille`}>
                <Text style={styles.personneTexte}>{nom}</Text>
              </View>
            ))}
            {absents.length > 0 && (
              <Pressable onPress={jyEtais} style={[styles.personne, styles.jyEtais]} accessibilityRole="button">
                <Text style={styles.jyEtaisTexte}>+ J'y étais</Text>
              </Pressable>
            )}
          </View>
        )}
        {choixPresence && absents.length > 1 && (
          <View style={styles.presence}>
            <Text style={styles.aide}>Qui était là ?</Text>
            <View style={styles.personnes}>
              {absents.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => ajouterPresent(p.id)}
                  style={[styles.personne, styles.jyEtais]}
                  accessibilityRole="button"
                >
                  <Text style={styles.jyEtaisTexte}>{p.utilisateur_id === moi ? 'Moi' : p.prenom}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {souvenir.recit ? <Text style={styles.recit}>{souvenir.recit}</Text> : null}

        {souvenir.etiquettes.length > 0 && (
          <View style={styles.etiquettes}>
            {souvenir.etiquettes.map((e) => (
              <Text key={e} style={styles.etiquette}>
                #{e}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.albums}>
          <Ionicons name="albums-outline" size={16} color={theme.colors.textMuted} />
          {sesAlbums.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => navigation.navigate('Album', { id: a.id })}
              style={styles.album}
              accessibilityRole="link"
            >
              <Text style={styles.albumTexte}>{a.titre}</Text>
            </Pressable>
          ))}
          <Pressable onPress={ouvrirAlbums} hitSlop={8} accessibilityRole="button">
            <Text style={styles.lienAlbum}>{sesAlbums.length ? '+ Autre album' : '+ Ranger dans un album'}</Text>
          </Pressable>
        </View>
        {albumsDispo && (
          <View style={styles.presence}>
            {(() => {
              const possibles = albumsDispo.filter(
                (a) => !sesAlbums.some((x) => x.id === a.id) && peutAjouterALAlbum(a, souvenir.cree_par, moi, foyer?.id)
              );
              return possibles.length ? (
                <View style={styles.personnes}>
                  {possibles.map((a) => (
                    <Pressable key={a.id} onPress={() => rangerDans(a.id)} style={[styles.personne, styles.jyEtais]} accessibilityRole="button">
                      <Text style={styles.jyEtaisTexte}>{a.titre}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.aide}>Aucun album disponible.</Text>
              );
            })()}
            <Pressable onPress={() => navigation.navigate('AlbumForm')} hitSlop={8} accessibilityRole="button">
              <Text style={styles.lienAlbum}>Créer un album…</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.signature}>
          Ajouté par {souvenir.cree_par === moi ? 'vous' : auteur || 'un proche'}
          {souvenir.voyage_id ? ' · depuis VoyageCommun' : ''}
        </Text>

        {erreur && <Text style={styles.erreur}>{erreur}</Text>}

        <View style={styles.separateur} />
        {nbCommentairesPhotos > 0 && (
          <Text style={styles.aide}>
            {nbCommentairesPhotos} commentaire{nbCommentairesPhotos > 1 ? 's' : ''} sur les photos (touchez une photo pour les lire).
          </Text>
        )}
        <Commentaires
          souvenirId={souvenir.id}
          commentaires={souvenir.commentaires}
          peutModerer={modifiable}
          onChange={charger}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: theme.spacing.xl * 2 },
  bandeau: { gap: theme.spacing.sm },
  choixWeb: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, justifyContent: 'center' },
  vignette: { width: 150, height: 150 },
  vignettePremiere: { width: 220, height: 150 },
  etoile: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entete: { gap: 4 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  categorie: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  titre: { fontFamily: theme.fontTitle, fontSize: 28, color: theme.colors.text },
  date: { fontFamily: theme.fontManuscrit, fontSize: 18, color: theme.colors.text },
  lieu: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted },
  personnes: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  personne: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  personnePrincipale: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentTransparent },
  personneTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  personneTextePrincipal: { fontFamily: theme.fontBodyBold },
  age: { fontFamily: theme.fontBody, color: theme.colors.textMuted },
  jyEtais: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  presence: { gap: theme.spacing.xs },
  autre: { borderStyle: 'dashed' },
  albums: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing.xs },
  album: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.selectionTransparent,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  albumTexte: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.text },
  lienAlbum: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.accent },
  jyEtaisTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  recit: { fontFamily: theme.fontBody, fontSize: 17, color: theme.colors.text, lineHeight: 26 },
  etiquettes: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  etiquette: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.accent },
  signature: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  separateur: { height: 1, backgroundColor: theme.colors.border },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
