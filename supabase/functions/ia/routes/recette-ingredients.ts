import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { CONSIGNE } from '../../_partage/consignes/recette-ingredients.ts';

// Lien étapes → ingrédients d'une recette (retour de test R-12, option 4).
// L'app l'enregistre dans `recettes.etapes.ingredients_cites` (migration
// 20261027110000) et le mode assistant l'affiche sous chaque étape ; le
// repérage par mots (ingredientsCites.ts) reste le secours.
// Haiku 5.5, ~0,001 $ par recette.
const Schema = z.object({
  etapes: z.array(z.object({ id: z.string(), ingredients: z.array(z.string()) })),
});

export const recetteIngredients: Route = async (corps, ctx) => {
  const ingredients = (Array.isArray(corps?.ingredients) ? corps.ingredients : [])
    .slice(0, 80)
    .map((i: any) => ({ id: String(i?.id ?? '').slice(0, 64), libelle: String(i?.libelle ?? '').trim().slice(0, 120) }))
    .filter((i: any) => i.id && i.libelle);
  const etapes = (Array.isArray(corps?.etapes) ? corps.etapes : [])
    .slice(0, 60)
    .map((e: any) => ({ id: String(e?.id ?? '').slice(0, 64), texte: String(e?.texte ?? '').trim().slice(0, 1500) }))
    .filter((e: any) => e.id && e.texte);
  if (!ingredients.length || !etapes.length) throw new ErreurIA('entree', 'Recette sans ingrédients ou sans étapes.');

  // Identifiants courts pour le modèle (i1, i2… / e1, e2…), retraduits ensuite.
  const idsIng = new Map(ingredients.map((i: any, n: number) => [`i${n + 1}`, i.id]));
  const idsEtape = new Map(etapes.map((e: any, n: number) => [`e${n + 1}`, e.id]));
  const texte = [
    'Ingrédients :',
    ...ingredients.map((i: any, n: number) => `i${n + 1} : ${i.libelle}`),
    '',
    'Étapes :',
    ...etapes.map((e: any, n: number) => `e${n + 1} : ${e.texte}`),
  ].join('\n');
  const r = await ctx.extraire({
    modele: 'claude-haiku-5-5',
    consigne: CONSIGNE,
    contenu: texte,
    schema: Schema,
    maxTokens: 40 * etapes.length + 200,
  });
  return {
    etapes: r.brouillon.etapes
      .filter((e) => idsEtape.has(e.id))
      .map((e) => ({
        id: idsEtape.get(e.id) as string,
        ingredients: [...new Set(e.ingredients.map((i) => idsIng.get(i)).filter(Boolean))] as string[],
      })),
  };
};
