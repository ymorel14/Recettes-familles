import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { theme, creerStylesThemes } from '../../theme/theme';
import { importerDepuisUrl, resultatVersFormulaire } from '../../services/importWeb';
import { nouvellePhotoBrouillonLocale } from '../../services/recettes';
import ZoneClavier from '../../components/ZoneClavier';

// Import d'une recette depuis une page web (cahier des charges §6, feuille
// de route §8 — Phase 3) : l'utilisateur colle une URL, l'app récupère les
// données structurées de la page (voir supabase/functions/importer-recette)
// puis ouvre le formulaire de recette pré-rempli — à vérifier et corriger
// avant enregistrement, comme pour le scan (§5). Un site sans données
// structurées "Recipe" ne renvoie que le titre et la photo : le reste se
// complète à la main, sans que ce soit un échec (repli assumé, §6/§11).
export default function ImportWebScreen({ navigation }: any) {
  const [url, setUrl] = useState('');
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const importer = async () => {
    const urlNettoyee = url.trim();
    if (!urlNettoyee) {
      setErreur("Collez d'abord l'adresse (URL) de la recette.");
      return;
    }
    setErreur(null);
    setChargement(true);
    try {
      const resultat = await importerDepuisUrl(urlNettoyee);
      let formulaire = resultatVersFormulaire(resultat, urlNettoyee);

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

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      <Pressable style={styles.boutonPrincipal} onPress={importer} disabled={chargement}>
        {chargement ? (
          <ActivityIndicator color={theme.colors.background} />
        ) : (
          <Text style={styles.boutonPrincipalTexte}>Importer la recette</Text>
        )}
      </Pressable>
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
  boutonPrincipal: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  boutonPrincipalTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.background },
}));
