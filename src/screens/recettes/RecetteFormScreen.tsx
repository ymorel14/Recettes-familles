import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import SelecteurCategories from '../../components/SelecteurCategories';
import {
  creerRecette,
  formulaireVide,
  nouvelIngredientBrouillon,
  nouvelleEtapeBrouillon,
} from '../../services/recettes';
import type { RecetteFormulaire } from '../../services/recettes';

// Formulaire de création d'une recette (cahier des charges §4) : titre,
// photo, catégories, parts, ingrédients, étapes — avec insertion de rappels
// de quantité dans les étapes (§8).
export default function RecetteFormScreen({ navigation }: any) {
  const { foyer, session } = useAuth();
  const [form, setForm] = useState<RecetteFormulaire>(formulaireVide());
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const choisirPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const resultat = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!resultat.canceled && resultat.assets[0]) {
      setForm((f) => ({ ...f, photoUriLocale: resultat.assets[0].uri }));
    }
  };

  const majIngredient = (clefId: string, champ: 'libelle' | 'quantite' | 'unite', valeur: string) => {
    setForm((f) => ({
      ...f,
      ingredients: f.ingredients.map((i) => (i.clefId === clefId ? { ...i, [champ]: valeur } : i)),
    }));
  };

  const supprimerIngredient = (clefId: string) => {
    setForm((f) => ({ ...f, ingredients: f.ingredients.filter((i) => i.clefId !== clefId) }));
  };

  const majEtape = (clefId: string, texte: string) => {
    setForm((f) => ({ ...f, etapes: f.etapes.map((e) => (e.clefId === clefId ? { ...e, texte } : e)) }));
  };

  const supprimerEtape = (clefId: string) => {
    setForm((f) => ({ ...f, etapes: f.etapes.filter((e) => e.clefId !== clefId) }));
  };

  const inserer_rappel_quantite = (etapeClefId: string, ingredientClefId: string) => {
    setForm((f) => ({
      ...f,
      etapes: f.etapes.map((e) =>
        e.clefId === etapeClefId
          ? { ...e, texte: `${e.texte}${e.texte.endsWith(' ') || !e.texte ? '' : ' '}{{ingredient:${ingredientClefId}}} ` }
          : e
      ),
    }));
  };

  const enregistrer = async () => {
    if (!foyer || !session) return;
    if (!form.titre.trim()) {
      setErreur('Le titre de la recette est obligatoire.');
      return;
    }
    setErreur(null);
    setEnregistrement(true);
    try {
      await creerRecette(foyer.id, session.user.id, form);
      navigation.goBack();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible d’enregistrer la recette.');
    } finally {
      setEnregistrement(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenu}>
      <Text style={styles.label}>Photo</Text>
      <Pressable style={styles.photoZone} onPress={choisirPhoto}>
        {form.photoUriLocale ? (
          <Image source={{ uri: form.photoUriLocale }} style={styles.photo} />
        ) : (
          <Text style={styles.photoTexte}>Ajouter une photo</Text>
        )}
      </Pressable>

      <Text style={styles.label}>Titre</Text>
      <TextInput
        style={styles.champ}
        placeholder="Ex. Tarte aux pommes de grand-mère"
        placeholderTextColor={theme.colors.textMuted}
        value={form.titre}
        onChangeText={(v) => setForm((f) => ({ ...f, titre: v }))}
      />

      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Text style={styles.label}>Parts</Text>
          <TextInput
            style={styles.champ}
            keyboardType="number-pad"
            value={String(form.partsDefaut)}
            onChangeText={(v) => setForm((f) => ({ ...f, partsDefaut: Number(v) || 1 }))}
          />
        </View>
        <View style={styles.colonne}>
          <Text style={styles.label}>Préparation (min)</Text>
          <TextInput
            style={styles.champ}
            keyboardType="number-pad"
            value={form.tempsPreparationMinutes ? String(form.tempsPreparationMinutes) : ''}
            onChangeText={(v) => setForm((f) => ({ ...f, tempsPreparationMinutes: v ? Number(v) : null }))}
          />
        </View>
        <View style={styles.colonne}>
          <Text style={styles.label}>Cuisson (min)</Text>
          <TextInput
            style={styles.champ}
            keyboardType="number-pad"
            value={form.tempsCuissonMinutes ? String(form.tempsCuissonMinutes) : ''}
            onChangeText={(v) => setForm((f) => ({ ...f, tempsCuissonMinutes: v ? Number(v) : null }))}
          />
        </View>
      </View>

      <Text style={styles.label}>Catégories</Text>
      <SelecteurCategories
        selection={form.nomsCategories}
        onChange={(nomsCategories) => setForm((f) => ({ ...f, nomsCategories }))}
      />

      <Text style={styles.label}>Ingrédients</Text>
      {form.ingredients.map((ingredient) => (
        <View key={ingredient.clefId} style={styles.ligneIngredient}>
          <TextInput
            style={[styles.champ, styles.champQuantite]}
            placeholder="Qté"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="numeric"
            value={ingredient.quantite}
            onChangeText={(v) => majIngredient(ingredient.clefId, 'quantite', v)}
          />
          <TextInput
            style={[styles.champ, styles.champUnite]}
            placeholder="unité"
            placeholderTextColor={theme.colors.textMuted}
            value={ingredient.unite}
            onChangeText={(v) => majIngredient(ingredient.clefId, 'unite', v)}
          />
          <TextInput
            style={[styles.champ, styles.champLibelle]}
            placeholder="Ingrédient"
            placeholderTextColor={theme.colors.textMuted}
            value={ingredient.libelle}
            onChangeText={(v) => majIngredient(ingredient.clefId, 'libelle', v)}
          />
          <Pressable onPress={() => supprimerIngredient(ingredient.clefId)}>
            <Text style={styles.supprimer}>✕</Text>
          </Pressable>
        </View>
      ))}
      <Pressable
        style={styles.boutonAjouter}
        onPress={() => setForm((f) => ({ ...f, ingredients: [...f.ingredients, nouvelIngredientBrouillon()] }))}
      >
        <Text style={styles.boutonAjouterTexte}>+ Ajouter un ingrédient</Text>
      </Pressable>

      <Text style={styles.label}>Étapes</Text>
      <Text style={styles.aide}>
        Touchez un ingrédient sous une étape pour y insérer un rappel de sa quantité.
      </Text>
      {form.etapes.map((etape, index) => (
        <View key={etape.clefId} style={styles.blocEtape}>
          <View style={styles.enteteEtape}>
            <Text style={styles.numeroEtape}>Étape {index + 1}</Text>
            <Pressable onPress={() => supprimerEtape(etape.clefId)}>
              <Text style={styles.supprimer}>✕</Text>
            </Pressable>
          </View>
          <TextInput
            style={[styles.champ, styles.champEtape]}
            placeholder="Ex. Mélanger la farine et les œufs."
            placeholderTextColor={theme.colors.textMuted}
            multiline
            value={etape.texte}
            onChangeText={(v) => majEtape(etape.clefId, v)}
          />
          <View style={styles.chipsIngredients}>
            {form.ingredients
              .filter((i) => i.libelle.trim())
              .map((i) => (
                <Pressable
                  key={i.clefId}
                  style={styles.chipIngredient}
                  onPress={() => inserer_rappel_quantite(etape.clefId, i.clefId)}
                >
                  <Text style={styles.chipIngredientTexte}>+ {i.libelle}</Text>
                </Pressable>
              ))}
          </View>
        </View>
      ))}
      <Pressable
        style={styles.boutonAjouter}
        onPress={() => setForm((f) => ({ ...f, etapes: [...f.etapes, nouvelleEtapeBrouillon()] }))}
      >
        <Text style={styles.boutonAjouterTexte}>+ Ajouter une étape</Text>
      </Pressable>

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      <Pressable style={styles.boutonPrincipal} onPress={enregistrer} disabled={enregistrement}>
        {enregistrement ? (
          <ActivityIndicator color={theme.colors.background} />
        ) : (
          <Text style={styles.boutonPrincipalTexte}>Enregistrer la recette</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm },
  label: {
    fontFamily: theme.fontBodyBold,
    color: theme.colors.text,
    fontSize: 14,
    marginTop: theme.spacing.sm,
  },
  aide: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  champ: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
  },
  photoZone: {
    height: 160,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  photoTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted },
  ligne: { flexDirection: 'row', gap: theme.spacing.sm },
  colonne: { flex: 1 },
  ligneIngredient: { flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'center' },
  champQuantite: { flex: 2 },
  champUnite: { flex: 2 },
  champLibelle: { flex: 5 },
  champEtape: { minHeight: 70, textAlignVertical: 'top' },
  supprimer: { color: theme.colors.warning, fontSize: 16, paddingHorizontal: theme.spacing.xs },
  boutonAjouter: { paddingVertical: theme.spacing.xs },
  boutonAjouterTexte: { fontFamily: theme.fontBody, color: theme.colors.accent },
  blocEtape: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  enteteEtape: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numeroEtape: { fontFamily: theme.fontBodyBold, color: theme.colors.textMuted, fontSize: 12 },
  chipsIngredients: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  chipIngredient: {
    backgroundColor: theme.colors.selection,
    borderRadius: theme.radii.sm,
    paddingVertical: 3,
    paddingHorizontal: theme.spacing.sm,
  },
  chipIngredientTexte: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 12 },
  erreur: { fontFamily: theme.fontBody, color: theme.colors.warning },
  boutonPrincipal: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  boutonPrincipalTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.background },
});
