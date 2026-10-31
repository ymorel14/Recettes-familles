import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { theme, creerStylesThemes } from '../../theme/theme';
import { importerDepuisUrl, resultatVersFormulaire } from '../../services/importWeb';
import { nouvellePhotoBrouillonLocale } from '../../services/recettes';
import ZoneClavier from '../../components/ZoneClavier';
import { ChargementAssistant, MessageAssistant } from '../../../../composants/assistant';
import { useAppelAssistant } from '../../../../composants/useAppelAssistant';
import { estLienVideo, recetteLueVersFormulaire, type RecetteLueLien } from '../../../../services/recetteAssistant';
import type { ResultatImportWeb } from '../../services/importWeb';
import type { RecetteFormulaire } from '../../services/recettes';
import { proposerPourFormulaire } from '../../services/classement';

// Import d'une recette depuis une page web (cahier des charges §6, feuille
// de route §8 — Phase 3) : l'utilisateur colle une URL, l'app récupère les
// données structurées de la page (voir supabase/functions/importer-recette)
// puis ouvre le formulaire de recette pré-rempli — à vérifier et corriger
// avant enregistrement, comme pour le scan (§5). Un site sans données
// structurées "Recipe" ne renvoie que le titre et la photo : le reste se
// complète à la main, sans que ce soit un échec (repli assumé, §6/§11).
//
// App Famille (spécification § 4.1.2 et § 4.1.3) : si la page n'a pas de
// fiche recette structurée, l'assistant lit son texte ; une vidéo YouTube,
// TikTok ou Instagram est lue par sa description (jamais téléchargée). Si
// la vidéo ne donne pas la recette par écrit, on peut coller la description
// ou les sous-titres.
export default function ImportWebScreen({ navigation, route }: any) {
  // Adresse déjà connue (lien donné à l'assistant depuis le bouton ⊕).
  const [url, setUrl] = useState<string>(route?.params?.url ?? '');
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const assistant = useAppelAssistant();
  // Ce que la lecture classique a trouvé (titre, photo) quand la page n'a
  // pas de fiche recette : « Remplir à la main » repart de là.
  const [repli, setRepli] = useState<ResultatImportWeb | null>(null);
  const [collage, setCollage] = useState(false);
  const [texteColle, setTexteColle] = useState('');

  // Télécharge la photo de la page pour qu'elle suive le circuit d'une photo
  // prise sur l'appareil (recadrage, hébergement à l'enregistrement).
  const avecPhoto = async (formulaire: RecetteFormulaire, image: string | null): Promise<RecetteFormulaire> => {
    if (!image) return formulaire;
    try {
      const destination = `${FileSystem.cacheDirectory}import-${Date.now()}.jpg`;
      const telechargement = await FileSystem.downloadAsync(image, destination);
      return { ...formulaire, photos: [nouvellePhotoBrouillonLocale(telechargement.uri)] };
    } catch {
      return formulaire;
    }
  };

  const lireAvecAssistant = async (corps: { lien: string; texte?: string }) => {
    setErreur(null);
    const r = await assistant.lancer<RecetteLueLien>('recette-lien', () => corps, 90000);
    if (!r) {
      setCollage(true);
      return;
    }
    const { formulaire, verification } = recetteLueVersFormulaire(r, null, { source: 'web', sourceUrl: r.lien ?? corps.lien });
    navigation.replace('CreationRecette', { formulaireInitial: await avecPhoto(formulaire, r.image), assistant: verification });
  };

  const remplirALaMain = async () => {
    const urlNettoyee = url.trim();
    const base = repli ?? { titre: '', image: null, parts: null, tempsPreparationMinutes: null, tempsCuissonMinutes: null, ingredients: [], etapes: [], notes: null, repli: true };
    navigation.replace('CreationRecette', { formulaireInitial: await avecPhoto(resultatVersFormulaire(base, urlNettoyee), base.image) });
  };

  const importer = async () => {
    const urlNettoyee = url.trim();
    if (!urlNettoyee) {
      setErreur("Collez d'abord l'adresse (URL) de la recette.");
      return;
    }
    setErreur(null);
    setCollage(false);
    setRepli(null);
    if (estLienVideo(urlNettoyee)) {
      await lireAvecAssistant({ lien: urlNettoyee });
      return;
    }
    setChargement(true);
    try {
      const resultat = await importerDepuisUrl(urlNettoyee);
      if (resultat.repli) {
        // Pas de fiche recette structurée : l'assistant lit le texte de la page.
        setRepli(resultat);
        setChargement(false);
        await lireAvecAssistant({ lien: urlNettoyee });
        return;
      }
      let formulaire = resultatVersFormulaire(resultat, urlNettoyee);
      // Pas de catégorie dans la page : l'assistant en propose (R-4), à
      // vérifier dans le formulaire avant d'enregistrer.
      if (formulaire.nomsCategories.length === 0) {
        const proposees = await proposerPourFormulaire(
          formulaire.titre,
          formulaire.ingredients.map((i) => i.libelle).filter(Boolean)
        );
        if (proposees.length) formulaire = { ...formulaire, nomsCategories: proposees };
      }

      if (resultat.image) {
        // Téléchargée ici plutôt que référencée telle quelle : elle passe
        // ainsi par le même circuit qu'une photo prise sur l'appareil
        // (recadrage possible, puis hébergement sur notre propre stockage
        // à l'enregistrement) — voir RecetteFormScreen / recettes.ts.
        try {
          const destination = `${FileSystem.cacheDirectory}import-${Date.now()}.jpg`;
          const telechargement = await FileSystem.downloadAsync(resultat.image, destination);
          formulaire = { ...formulaire, photos: [nouvellePhotoBrouillonLocale(telechargement.uri)] };
        } catch {
          // Photo non récupérable (site protégé, format inattendu…) — la
          // recette s'importe quand même, sans photo, à ajouter à la main.
        }
      }

      navigation.replace('CreationRecette', { formulaireInitial: formulaire });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible d'importer cette recette.");
    } finally {
      setChargement(false);
    }
  };

  return (
    <ZoneClavier>
    <ScrollView style={styles.container} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Adresse (URL) de la recette</Text>
      <Text style={styles.aide}>
        Collez le lien d'une recette trouvée sur un site, ou partagé depuis une autre application. L'application
        récupère le titre, la photo, les ingrédients et les étapes quand le site les décrit de façon standard —
        sinon une fiche est ouverte avec ce qui a pu être trouvé, à compléter comme pour le scan.
      </Text>
      <TextInput
        style={styles.champ}
        placeholder="https://..."
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={url}
        onChangeText={setUrl}
      />

      <Text style={styles.aide}>
        Vidéo YouTube, TikTok ou Instagram : l’assistant lit sa description (la vidéo n’est jamais téléchargée).
      </Text>

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {assistant.lecture ? (
        <ChargementAssistant
          couleur={theme.colors.accent}
          etapes={['J’ouvre la page…', 'Je cherche la recette…', 'Je range les ingrédients…', 'Presque fini…']}
          onAnnuler={assistant.annuler}
        />
      ) : (
        <Pressable style={styles.boutonPrincipal} onPress={importer} disabled={chargement}>
          {chargement ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.boutonPrincipalTexte}>Importer la recette</Text>
          )}
        </Pressable>
      )}

      {assistant.message && !assistant.lecture ? (
        <MessageAssistant message={assistant.message.texte} pause={assistant.message.pause} onRemplirALaMain={remplirALaMain} />
      ) : null}

      {collage && !assistant.lecture ? (
        <View style={styles.collage}>
          <Text style={styles.label}>Coller le texte de la recette</Text>
          <Text style={styles.aide}>
            Copiez la description de la vidéo (« …plus »), ses sous-titres ou le texte de la recette, puis collez-le ici.
          </Text>
          <TextInput
            style={[styles.champ, styles.champTexte]}
            multiline
            value={texteColle}
            onChangeText={setTexteColle}
            placeholder="Ingrédients, étapes…"
            placeholderTextColor={theme.colors.textMuted}
          />
          <Pressable
            style={[styles.boutonPrincipal, !texteColle.trim() && { opacity: 0.5 }]}
            disabled={!texteColle.trim()}
            onPress={() => lireAvecAssistant({ lien: url.trim(), texte: texteColle.trim() })}
          >
            <Text style={styles.boutonPrincipalTexte}>✦ Lire ce texte</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Sauvegarde d'une autre application de recettes (fichier .rtk). */}
      <View style={styles.autreSource}>
        <Text style={styles.label}>Depuis My Recipe Box</Text>
        <Text style={styles.aide}>Importez toutes les recettes d'une sauvegarde My Recipe Box (fichier .rtk), photos comprises.</Text>
        <Pressable style={styles.boutonSecondaire} onPress={() => navigation.navigate('ImportMyRecipeBox')}>
          <Text style={styles.boutonSecondaireTexte}>Importer un fichier .rtk</Text>
        </Pressable>
      </View>
    </ScrollView>
    </ZoneClavier>
  );
}

const styles = creerStylesThemes(() => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm },
  label: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 15 },
  aide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  champ: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
  },
  erreur: { fontFamily: theme.fontBody, color: theme.colors.warning },
  collage: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
  champTexte: { minHeight: 160, textAlignVertical: 'top' },
  boutonPrincipal: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  boutonPrincipalTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.background },
  autreSource: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  boutonSecondaire: {
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  boutonSecondaireTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent },
}));
