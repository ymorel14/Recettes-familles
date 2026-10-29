import { supabase } from './supabase';
import { trouverOuCreerCategorie } from './categories';
import { appelerAssistant } from '../../../services/assistant';
import type { RecetteComplete } from '../types/models';

// Classement des recettes (retours de test R-4 et R-13) : propositions de
// l'assistant (route `recette-categories`, ~0,0005 $ par recette), puis
// enregistrement de ce que la personne a validé. On ne touche qu'aux
// recettes de son foyer (règles RLS).

export type Proposition = { recetteId: string; categories: string[]; nouvelles: string[] };

const PAR_APPEL = 25;

// Propose 1 à 3 catégories par recette, 25 recettes par appel.
export async function proposerCategories(
  recettes: RecetteComplete[],
  options: { creation?: boolean; surProgression?: (faites: number, total: number) => void } = {}
): Promise<Proposition[]> {
  const propositions: Proposition[] = [];
  for (let i = 0; i < recettes.length; i += PAR_APPEL) {
    const lot = recettes.slice(i, i + PAR_APPEL);
    options.surProgression?.(i, recettes.length);
    const r = await appelerAssistant<{ recettes: { id: string; categories: string[]; nouvelles: string[] }[] }>(
      'recette-categories',
      {
        creation: options.creation !== false,
        recettes: lot.map((x) => ({ id: x.id, titre: x.titre, ingredients: x.ingredients.map((ing) => ing.libelle) })),
      },
      { delaiMs: 90000 }
    );
    r.recettes.forEach((p) => propositions.push({ recetteId: p.id, categories: p.categories, nouvelles: p.nouvelles }));
  }
  options.surProgression?.(recettes.length, recettes.length);
  return propositions;
}

async function idsCategories(noms: string[]): Promise<string[]> {
  const categories = await Promise.all(noms.map((n) => trouverOuCreerCategorie(n)));
  return Array.from(new Set(categories.map((c) => c.id)));
}

// Ajoute des catégories à des recettes (celles qu'elles ont déjà restent).
export async function ajouterCategories(recetteIds: string[], noms: string[]): Promise<void> {
  if (!recetteIds.length || !noms.length) return;
  const ids = await idsCategories(noms);
  const { error } = await supabase.from('recette_categories').upsert(
    recetteIds.flatMap((recette_id) => ids.map((categorie_id) => ({ recette_id, categorie_id }))),
    { onConflict: 'recette_id,categorie_id', ignoreDuplicates: true }
  );
  if (error) throw error;
}

// Retire des catégories de recettes.
export async function retirerCategories(recetteIds: string[], categorieIds: string[]): Promise<void> {
  if (!recetteIds.length || !categorieIds.length) return;
  const { error } = await supabase
    .from('recette_categories')
    .delete()
    .in('recette_id', recetteIds)
    .in('categorie_id', categorieIds);
  if (error) throw error;
}

// Remplace toutes les catégories de recettes : les nouvelles d'abord, puis
// on retire les autres (une recette n'est jamais sans catégorie).
export async function remplacerCategories(recetteIds: string[], noms: string[]): Promise<void> {
  if (!recetteIds.length || !noms.length) return;
  const ids = await idsCategories(noms);
  await ajouterCategories(recetteIds, noms);
  const { error } = await supabase
    .from('recette_categories')
    .delete()
    .in('recette_id', recetteIds)
    .not('categorie_id', 'in', `(${ids.join(',')})`);
  if (error) throw error;
}

// Catégories proposées pour UNE recette en cours de saisie (import web sans
// catégorie, R-4) : pré-remplies dans le formulaire, modifiables avant
// d'enregistrer. Liste vide si l'assistant n'est pas disponible.
export async function proposerPourFormulaire(titre: string, ingredients: string[]): Promise<string[]> {
  if (!titre.trim()) return [];
  try {
    const r = await appelerAssistant<{ recettes: { id: string; categories: string[] }[] }>('recette-categories', {
      recettes: [{ id: 'r', titre, ingredients }],
    });
    return r.recettes[0]?.categories ?? [];
  } catch {
    return [];
  }
}
