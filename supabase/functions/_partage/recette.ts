// Schéma commun d'une recette lue par l'assistant (photo, page web, vidéo) :
// même forme pour toutes les routes, mise en forme côté app par
// apps/famille/src/services/recetteAssistant.ts.
import { z, ErreurIA } from './ia.ts';

const Ingredient = z.object({
  quantite: z.number().nullable(),
  unite: z.string().nullable(),
  libelle: z.string(),
  a_verifier: z.boolean(),
});

const Element = z.object({
  nom: z.string().nullable(),
  variante_de: z.string().nullable(),
  ingredients: z.array(Ingredient),
  etapes: z.array(z.string()),
});

export const SchemaRecette = z.object({
  est_une_recette: z.boolean(),
  titre: z.string(),
  parts: z.number().nullable(),
  prepa_min: z.number().nullable(),
  cuisson_min: z.number().nullable(),
  elements: z.array(Element),
  categories: z.array(z.string()),
  notes: z.string().nullable(),
  a_verifier: z.array(z.string()),
});

export type RecetteLue = z.infer<typeof SchemaRecette>;

// Règles d'extraction communes, ajoutées à chaque consigne de recette.
export const REGLES_RECETTE = `- Recopie fidèlement. N'invente aucun ingrédient, aucune quantité, aucune étape.
- titre : le nom de la recette, sans « Recette de » ni le nom du site.
- parts : nombre de personnes ou de parts (entier), null si absent.
- prepa_min, cuisson_min : en minutes (« 1 h 15 » → 75), null si absent. Le repos ou la réfrigération ne comptent pas dans la cuisson : mets-les dans « notes ».
- elements : les parties de la recette (« La pâte », « La garniture »). Sans parties : UN seul élément avec nom null. Chaque ingrédient et chaque étape va dans son élément.
- variante_de : seulement pour une partie proposée « au choix » à la place d'une autre ; le nom de l'élément qu'elle remplace. Sinon null.
- ingredients : quantite en nombre décimal (« 1/2 » → 0.5), null si non chiffrée (« sel, poivre »). unite courte (g, kg, ml, cl, l, c. à soupe, c. à café, pincée, sachet…) ou null. libelle sans la quantité.
- etapes : une étape par action ou par paragraphe, dans l'ordre, sans numéro au début. Garde les températures et les durées.
- categories : 1 à 3 catégories prises de préférence dans la liste fournie (Entrée, Plat, Dessert…), sinon un nom court ; liste vide si tu ne sais pas.
- notes : astuces, conseils, temps de repos, ou ce qui n'entre nulle part ailleurs ; null sinon.
- a_verifier : les champs dont tu n'es pas sûr parmi titre, parts, prepa_min, cuisson_min, ingredients, etapes. Pour un ingrédient précis incertain, mets a_verifier: true sur l'ingrédient.
- Français, pas d'émoji.`;

const entier = (n: number | null, max: number) => (n == null || !Number.isFinite(n) || n <= 0 ? null : Math.min(max, Math.round(n)));

// Nettoie la recette lue ; lève « illisible » avec `messageAbsente` si ce
// n'est pas une recette.
export function normaliserRecette(b: RecetteLue, messageAbsente: string): RecetteLue {
  const elements = b.elements
    .map((e) => ({
      ...e,
      nom: e.nom?.trim() || null,
      ingredients: e.ingredients.filter((i) => i.libelle.trim()),
      etapes: e.etapes.map((t) => t.replace(/^\s*\d+\s*[.)-]\s*/, '').trim()).filter(Boolean),
    }))
    .filter((e) => e.ingredients.length || e.etapes.length);
  if (!b.est_une_recette || (!b.titre.trim() && !elements.length)) throw new ErreurIA('illisible', messageAbsente);
  return {
    ...b,
    titre: b.titre.trim(),
    parts: entier(b.parts, 100),
    prepa_min: entier(b.prepa_min, 2000),
    cuisson_min: entier(b.cuisson_min, 2000),
    elements,
    categories: b.categories.map((c) => c.trim()).filter(Boolean).slice(0, 3),
  };
}

// Catégories existantes (globales), pour que l'assistant les réutilise.
export async function categoriesRecettes(client: any): Promise<string[]> {
  const { data } = await client.schema('recettes').from('categories').select('nom').order('nom').limit(80);
  return ((data as any[]) ?? []).map((c) => String(c.nom)).filter(Boolean);
}
