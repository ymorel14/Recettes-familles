import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase, BUCKET_PHOTOS_RECETTES } from './supabase';
import { trouverOuCreerCategorie } from './categories';
import type { RecetteComplete, Ingredient, Etape, Categorie } from '../types/models';

// clefId : identifiant local (côté formulaire, avant enregistrement) utilisé
// pour référencer un ingrédient dans le texte d'une étape via le jeton
// {{ingredient:<clefId>}} — résolu en "quantité + unité + libellé" au moment
// de l'affichage (rappel des quantités, cahier des charges §8).
export type IngredientBrouillon = { clefId: string; libelle: string; quantite: string; unite: string };
export type EtapeBrouillon = { clefId: string; texte: string };

export type RecetteFormulaire = {
  titre: string;
  photoUriLocale: string | null; // uri de l'appareil, à uploader
  photoUrlExistante: string | null; // url déjà en ligne (édition), inchangée
  partsDefaut: number;
  tempsPreparationMinutes: number | null;
  tempsCuissonMinutes: number | null;
  notes: string;
  nomsCategories: string[];
  ingredients: IngredientBrouillon[];
  etapes: EtapeBrouillon[];
};

function nouvelleClefLocale(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function nouvelIngredientBrouillon(): IngredientBrouillon {
  return { clefId: nouvelleClefLocale(), libelle: '', quantite: '', unite: '' };
}

export function nouvelleEtapeBrouillon(): EtapeBrouillon {
  return { clefId: nouvelleClefLocale(), texte: '' };
}

export function formulaireVide(): RecetteFormulaire {
  return {
    titre: '',
    photoUriLocale: null,
    photoUrlExistante: null,
    partsDefaut: 4,
    tempsPreparationMinutes: null,
    tempsCuissonMinutes: null,
    notes: '',
    nomsCategories: [],
    ingredients: [nouvelIngredientBrouillon()],
    etapes: [nouvelleEtapeBrouillon()],
  };
}

export async function listerRecettes(foyerId: string): Promise<RecetteComplete[]> {
  const { data, error } = await supabase
    .from('recettes')
    .select(
      'id, foyer_id, titre, photo_url, parts_defaut, temps_preparation_minutes, temps_cuisson_minutes, notes, source, source_url, cree_par, cree_le, maj_le, ingredients(*), etapes(*), recette_categories(categories(*))'
    )
    .eq('foyer_id', foyerId)
    .order('titre', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((ligne: any) => mettreEnForme(ligne));
}

export async function obtenirRecette(id: string): Promise<RecetteComplete> {
  const { data, error } = await supabase
    .from('recettes')
    .select(
      'id, foyer_id, titre, photo_url, parts_defaut, temps_preparation_minutes, temps_cuisson_minutes, notes, source, source_url, cree_par, cree_le, maj_le, ingredients(*), etapes(*), recette_categories(categories(*))'
    )
    .eq('id', id)
    .single();

  if (error) throw error;
  return mettreEnForme(data);
}

function mettreEnForme(ligne: any): RecetteComplete {
  return {
    ...ligne,
    ingredients: ((ligne.ingredients ?? []) as Ingredient[]).sort((a, b) => a.ordre - b.ordre),
    etapes: ((ligne.etapes ?? []) as Etape[]).sort((a, b) => a.ordre - b.ordre),
    categories: ((ligne.recette_categories ?? []) as unknown as { categories: Categorie }[]).map(
      (l) => l.categories
    ),
  };
}

async function televerserPhoto(uriLocale: string): Promise<string> {
  const extension = uriLocale.split('.').pop()?.toLowerCase() ?? 'jpg';
  const nomFichier = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;
  const base64 = await FileSystem.readAsStringAsync(uriLocale, { encoding: 'base64' });

  const { error } = await supabase.storage
    .from(BUCKET_PHOTOS_RECETTES)
    .upload(nomFichier, decode(base64), {
      contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET_PHOTOS_RECETTES).getPublicUrl(nomFichier);
  return data.publicUrl;
}

export async function creerRecette(foyerId: string, utilisateurId: string, form: RecetteFormulaire): Promise<string> {
  const photoUrl = form.photoUriLocale ? await televerserPhoto(form.photoUriLocale) : form.photoUrlExistante;

  const { data: recetteCreee, error: erreurRecette } = await supabase
    .from('recettes')
    .insert({
      foyer_id: foyerId,
      titre: form.titre.trim(),
      photo_url: photoUrl,
      parts_defaut: form.partsDefaut,
      temps_preparation_minutes: form.tempsPreparationMinutes,
      temps_cuisson_minutes: form.tempsCuissonMinutes,
      notes: form.notes.trim() || null,
      cree_par: utilisateurId,
    })
    .select()
    .single();
  if (erreurRecette) throw erreurRecette;

  const recetteId = recetteCreee.id as string;

  // Insertion des ingrédients un par un (plutôt qu'en lot) pour récupérer
  // l'id réel de chacun et pouvoir résoudre les jetons {{ingredient:clefId}}
  // saisis dans les étapes avant de les enregistrer.
  const correspondanceClefVersId = new Map<string, string>();
  const ingredientsValides = form.ingredients.filter((i) => i.libelle.trim());
  for (let index = 0; index < ingredientsValides.length; index += 1) {
    const brouillon = ingredientsValides[index];
    const { data: ingredientCree, error } = await supabase
      .from('ingredients')
      .insert({
        recette_id: recetteId,
        libelle: brouillon.libelle.trim(),
        quantite: brouillon.quantite.trim() ? Number(brouillon.quantite.replace(',', '.')) : null,
        unite: brouillon.unite.trim() || null,
        ordre: index,
      })
      .select()
      .single();
    if (error) throw error;
    correspondanceClefVersId.set(brouillon.clefId, ingredientCree.id as string);
  }

  const etapesValides = form.etapes.filter((e) => e.texte.trim());
  if (etapesValides.length > 0) {
    const { error } = await supabase.from('etapes').insert(
      etapesValides.map((e, index) => ({
        recette_id: recetteId,
        ordre: index,
        texte: resoudreClefsLocales(e.texte.trim(), correspondanceClefVersId),
      }))
    );
    if (error) throw error;
  }

  if (form.nomsCategories.length > 0) {
    const categories = await Promise.all(form.nomsCategories.map((nom) => trouverOuCreerCategorie(nom)));
    const { error } = await supabase
      .from('recette_categories')
      .insert(categories.map((c) => ({ recette_id: recetteId, categorie_id: c.id })));
    if (error) throw error;
  }

  return recetteId;
}

// Remplace {{ingredient:clefLocale}} par {{ingredient:idReel}} juste avant
// l'enregistrement des étapes (une fois les ingrédients réellement créés).
function resoudreClefsLocales(texte: string, correspondance: Map<string, string>): string {
  return texte.replace(/\{\{ingredient:([a-z0-9]+)\}\}/g, (jeton, clef) => {
    const idReel = correspondance.get(clef);
    return idReel ? `{{ingredient:${idReel}}}` : jeton;
  });
}

// Remplace {{ingredient:<id>}} par "quantité unité libellé", pour l'affichage
// (fiche recette, mode assistant) — avec un facteur d'échelle optionnel
// quand l'utilisateur ajuste le nombre de parts (§8).
export function resoudreEtapePourAffichage(
  texte: string,
  ingredients: Ingredient[],
  facteurEchelle = 1
): string {
  return texte.replace(/\{\{ingredient:([\w-]+)\}\}/g, (jeton, id) => {
    const ingredient = ingredients.find((i) => i.id === id);
    if (!ingredient) return jeton;
    if (ingredient.quantite == null) return ingredient.libelle;
    const quantiteAjustee = arrondirJoli(ingredient.quantite * facteurEchelle);
    return [quantiteAjustee, ingredient.unite, ingredient.libelle].filter(Boolean).join(' ');
  });
}

function arrondirJoli(valeur: number): string {
  const arrondi = Math.round(valeur * 100) / 100;
  return arrondi.toString().replace('.', ',');
}
