import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { alerte } from '../../utils/alerte';
import * as ImagePicker from 'expo-image-picker';
import { theme, creerStylesThemes } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import { obtenirRecette } from '../../services/recettes';
import { definirMonPrenom, obtenirMonPrenom } from '../../services/profils';
import {
  LIBELLES_DIFFICULTE,
  LIBELLES_TEMPS,
  LIBELLES_VERDICT,
  creerEssai,
  essaiVersFormulaire,
  essaiVide,
  mettreAJourEssai,
  nouveauPoint,
  nouvelleReponse,
  obtenirEssai,
  supprimerEssai,
  type EssaiFormulaire,
  type PointBrouillon,
  type ReponseBrouillon,
} from '../../services/essais';
import { extraireMessageErreur } from '../../services/famille';
import type { DifficulteRessentie, RecetteComplete, TempsRessenti, Verdict } from '../../types/models';
import ZoneClavier from '../../components/ZoneClavier';
import ChampExtensible from '../../components/ChampExtensible';

// Saisie (ou modification) d'un essai de recette : ce qui s'est passé en
// cuisine (difficulté, temps, soucis et leurs solutions, rattachables à une
// étape), puis — éventuellement plus tard — le verdict après dégustation.
// Paramètres : recetteId, essaiId (modification), depuisAssistant.
export default function EssaiFormScreen({ route, navigation }: any) {
  const { recetteId, essaiId, depuisAssistant } = route.params as {
    recetteId: string;
    essaiId?: string;
    depuisAssistant?: boolean;
  };
  const { session, foyer } = useAuth();
  const [recette, setRecette] = useState<RecetteComplete | null>(null);
  const [form, setForm] = useState<EssaiFormulaire>(essaiVide());
  const [prenomEnregistre, setPrenomEnregistre] = useState<string | null>(null);
  const [prenom, setPrenom] = useState('');
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    Promise.all([
      obtenirRecette(recetteId),
      essaiId ? obtenirEssai(essaiId) : Promise.resolve(null),
      obtenirMonPrenom(session.user.id).catch(() => null),
    ])
      .then(([r, essai, p]) => {
        setRecette(r);
        if (essai) setForm(essaiVersFormulaire(essai));
        setPrenomEnregistre(p);
      })
      .catch((e) => setErreur(extraireMessageErreur(e, 'Chargement impossible.')))
      .finally(() => setChargement(false));
  }, [recetteId, essaiId, session]);

  const majPoint = (clefId: string, changements: Partial<PointBrouillon>) =>
    setForm((f) => ({
      ...f,
      points: f.points.map((p) => (p.clefId === clefId ? { ...p, ...changements } : p)),
    }));

  const majReponse = (clefPoint: string, clefReponse: string, changements: Partial<ReponseBrouillon>) =>
    setForm((f) => ({
      ...f,
      points: f.points.map((p) =>
        p.clefId === clefPoint
          ? { ...p, reponses: p.reponses.map((r) => (r.clefId === clefReponse ? { ...r, ...changements } : r)) }
          : p
      ),
    }));

  const ajouterReponse = (clefPoint: string) =>
    setForm((f) => ({
      ...f,
      points: f.points.map((p) => (p.clefId === clefPoint ? { ...p, reponses: [...p.reponses, nouvelleReponse()] } : p)),
    }));

  const retirerReponse = (clefPoint: string, clefReponse: string) =>
    setForm((f) => ({
      ...f,
      points: f.points.map((p) =>
        p.clefId === clefPoint ? { ...p, reponses: p.reponses.filter((r) => r.clefId !== clefReponse) } : p
      ),
    }));

  const retirerPoint = (clefId: string) =>
    setForm((f) => ({ ...f, points: f.points.filter((p) => p.clefId !== clefId) }));

  const choisirPhoto = () => {
    const depuis = async (source: 'camera' | 'galerie') => {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const resultat =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (!resultat.canceled && resultat.assets[0]) {
        setForm((f) => ({ ...f, photoLocale: resultat.assets[0].uri }));
      }
    };
    if (Platform.OS === 'web') {
      depuis('galerie');
      return;
    }
    alerte('Photo du résultat', undefined, [
      { text: 'Prendre une photo', onPress: () => depuis('camera') },
      { text: 'Choisir dans la galerie', onPress: () => depuis('galerie') },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const enregistrer = async () => {
    if (!session || !foyer || !recette) return;
    setErreur(null);
    if (!prenomEnregistre && !prenom.trim()) {
      setErreur('Indiquez votre prénom : il sera affiché avec votre essai.');
      return;
    }
    setEnCours(true);
    try {
      if (!prenomEnregistre) {
        await definirMonPrenom(session.user.id, prenom);
        setPrenomEnregistre(prenom.trim());
      }
      if (essaiId) {
        await mettreAJourEssai(essaiId, form);
      } else {
        await creerEssai(recette.id, foyer.id, form);
      }
      navigation.navigate('DetailRecette', { recetteId: recette.id });
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Enregistrement impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  const demanderSuppression = () => {
    if (!essaiId) return;
    alerte('Supprimer cet essai ?', 'Votre retour sera retiré de la recette.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerEssai(essaiId);
            navigation.goBack();
          } catch (e) {
            alerte('Échec', extraireMessageErreur(e, 'Veuillez réessayer.'));
          }
        },
      },
    ]);
  };

  if (chargement) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (!recette) {
    return (
      <View style={styles.centre}>
        <Text style={styles.erreur}>{erreur ?? 'Recette introuvable.'}</Text>
      </View>
    );
  }

  const photoAffichee = form.photoLocale ?? form.photoUrl;

  return (
    <ZoneClavier style={styles.flex}>
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        <Text style={styles.titreRecette}>{recette.titre}</Text>
        <Text style={styles.aide}>
          {depuisAssistant
            ? 'Bravo ! Racontez comment ça s’est passé, tant que c’est frais. Vous pourrez donner votre verdict après avoir goûté.'
            : 'Racontez comment ça s’est passé : vos soucis, vos astuces, votre verdict. Tout est facultatif.'}
        </Text>

        {!prenomEnregistre && (
          <View style={styles.bloc}>
            <Text style={styles.titreBloc}>Votre prénom</Text>
            <Text style={styles.aide}>Affiché avec votre essai (modifiable ensuite dans le Profil).</Text>
            <TextInput
              style={styles.champ}
              placeholder="Prénom ou surnom"
              placeholderTextColor={theme.colors.textMuted}
              value={prenom}
              onChangeText={setPrenom}
            />
          </View>
        )}

        <View style={styles.bloc}>
          <Text style={styles.titreBloc}>Après dégustation</Text>
          <View style={styles.puces}>
            {([4, 3, 2, 1] as Verdict[]).map((v) => (
              <Pressable
                key={v}
                style={[styles.puce, form.verdict === v && styles.puceActive]}
                onPress={() => setForm((f) => ({ ...f, verdict: f.verdict === v ? null : v }))}
              >
                <Text style={[styles.puceTexte, form.verdict === v && styles.puceTexteActive]}>
                  {'★'.repeat(v)} {LIBELLES_VERDICT[v]}
                </Text>
              </Pressable>
            ))}
          </View>
          {form.verdict == null && <Text style={styles.aide}>Pas encore goûtée ? Revenez plus tard.</Text>}
        </View>

        <View style={styles.bloc}>
          <Text style={styles.titreBloc}>En cuisine</Text>
          <View style={styles.puces}>
            {(Object.keys(LIBELLES_DIFFICULTE) as DifficulteRessentie[]).map((d) => (
              <Pressable
                key={d}
                style={[styles.puce, form.difficulte === d && styles.puceActive]}
                onPress={() => setForm((f) => ({ ...f, difficulte: f.difficulte === d ? null : d }))}
              >
                <Text style={[styles.puceTexte, form.difficulte === d && styles.puceTexteActive]}>
                  {LIBELLES_DIFFICULTE[d]}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.puces}>
            {(Object.keys(LIBELLES_TEMPS) as TempsRessenti[]).map((t) => (
              <Pressable
                key={t}
                style={[styles.puce, form.temps === t && styles.puceActive]}
                onPress={() => setForm((f) => ({ ...f, temps: f.temps === t ? null : t }))}
              >
                <Text style={[styles.puceTexte, form.temps === t && styles.puceTexteActive]}>
                  {LIBELLES_TEMPS[t]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.bloc}>
          <Text style={styles.titreBloc}>Soucis et astuces</Text>
          <Text style={styles.aide}>
            Pour chaque souci rencontré, ajoutez autant d’astuces que vous voulez : ce qui l’a réglé, ou ce que
            vous avez changé.
          </Text>
          {form.points.map((point, index) => (
            <View key={point.clefId} style={styles.point}>
              <View style={styles.pointEnTete}>
                <Text style={styles.pointNumero}>Souci {index + 1}</Text>
                <Pressable hitSlop={8} onPress={() => retirerPoint(point.clefId)}>
                  <Text style={styles.retirer}>✕</Text>
                </Pressable>
              </View>
              <ChampExtensible hauteurMin={44}
                style={styles.champ}
                placeholder="⚠️ Souci rencontré (ex. la pâte collait)"
                placeholderTextColor={theme.colors.textMuted}
                value={point.souci}
                onChangeText={(t) => majPoint(point.clefId, { souci: t })}
              />
              {point.reponses.map((reponse, iReponse) => (
                <View key={reponse.clefId} style={styles.reponse}>
                  <View style={styles.pointEnTete}>
                    <View style={styles.puces}>
                      {(
                        [
                          ['solution', '💡 Solution'],
                          ['changement', '✏️ Changement'],
                        ] as const
                      ).map(([nature, libelle]) => (
                        <Pressable
                          key={nature}
                          style={[styles.puce, reponse.nature === nature && styles.puceActive]}
                          onPress={() => majReponse(point.clefId, reponse.clefId, { nature })}
                        >
                          <Text style={[styles.puceTexte, reponse.nature === nature && styles.puceTexteActive]}>
                            {libelle}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    {point.reponses.length > 1 && (
                      <Pressable hitSlop={8} onPress={() => retirerReponse(point.clefId, reponse.clefId)}>
                        <Text style={styles.retirer}>✕</Text>
                      </Pressable>
                    )}
                  </View>
                  <ChampExtensible hauteurMin={44}
                    style={styles.champ}
                    placeholder={
                      reponse.nature === 'solution'
                        ? iReponse === 0
                          ? 'Ex. fariner le plan de travail'
                          : 'Une autre astuce ?'
                        : 'Ex. crème fraîche au lieu du mascarpone'
                    }
                    placeholderTextColor={theme.colors.textMuted}
                    value={reponse.texte}
                    onChangeText={(t) => majReponse(point.clefId, reponse.clefId, { texte: t })}
                  />
                </View>
              ))}
              <Pressable onPress={() => ajouterReponse(point.clefId)} hitSlop={6}>
                <Text style={styles.lienAjout}>+ Ajouter une autre astuce à ce souci</Text>
              </Pressable>
            </View>
          ))}
          <Pressable
            style={styles.boutonContour}
            onPress={() => setForm((f) => ({ ...f, points: [...f.points, nouveauPoint()] }))}
          >
            <Text style={styles.boutonContourTexte}>+ Ajouter un autre souci</Text>
          </Pressable>
        </View>

        <View style={styles.bloc}>
          <Text style={styles.titreBloc}>Commentaire</Text>
          <ChampExtensible hauteurMin={80}
            style={styles.champ}
            placeholder="Un mot pour la famille…"
            placeholderTextColor={theme.colors.textMuted}
            value={form.commentaire}
            onChangeText={(t) => setForm((f) => ({ ...f, commentaire: t }))}
          />
        </View>

        <View style={styles.bloc}>
          <Text style={styles.titreBloc}>Photo du résultat</Text>
          {photoAffichee ? (
            <>
              <Image source={{ uri: photoAffichee }} style={styles.photo} />
              <Pressable onPress={() => setForm((f) => ({ ...f, photoLocale: null, photoUrl: null }))}>
                <Text style={styles.lien}>Retirer la photo</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.boutonContour} onPress={choisirPhoto}>
              <Text style={styles.boutonContourTexte}>Ajouter une photo</Text>
            </Pressable>
          )}
        </View>

        {erreur && <Text style={styles.erreur}>{erreur}</Text>}

        <Pressable style={[styles.bouton, enCours && styles.inactif]} onPress={enregistrer} disabled={enCours}>
          {enCours ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.boutonTexte}>{essaiId ? 'Enregistrer' : 'Partager mon essai'}</Text>
          )}
        </Pressable>

        {essaiId && (
          <Pressable onPress={demanderSuppression}>
            <Text style={[styles.lien, styles.lienDanger]}>Supprimer cet essai</Text>
          </Pressable>
        )}
      </ScrollView>
    </ZoneClavier>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  centre: { flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  titreRecette: { fontFamily: theme.fontTitle, fontSize: 22, color: theme.colors.accent, textAlign: 'center' },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, color: theme.colors.warning, textAlign: 'center' },
  bloc: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  titreBloc: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.text },
  sousTitre: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.textMuted },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: {
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
  },
  puceActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  puceTexteActive: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
  champ: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 15,
  },
  champLong: { minHeight: 80, textAlignVertical: 'top' },
  point: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  pointEnTete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reponse: {
    borderLeftColor: theme.colors.accent,
    borderLeftWidth: 2,
    paddingLeft: theme.spacing.sm,
    marginLeft: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  lienAjout: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.accent, marginLeft: theme.spacing.sm },
  pointNumero: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.accent },
  retirer: { color: theme.colors.warning, fontSize: 16 },
  apercuEtape: { fontFamily: theme.fontBody, fontSize: 12, fontStyle: 'italic', color: theme.colors.textMuted },
  photo: { width: '100%', height: 180, borderRadius: theme.radii.md },
  bouton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  inactif: { opacity: 0.5 },
  boutonTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.background },
  boutonContour: {
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  boutonContourTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  lien: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  lienDanger: { color: theme.colors.warning },
}));
