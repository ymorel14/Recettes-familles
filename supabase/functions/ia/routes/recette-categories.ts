import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { CONSIGNE } from '../../_partage/consignes/recette-categories.ts';
import { categoriesRecettes } from '../../_partage/recette.ts';

// Classement automatique des recettes (retour de test R-4) : import My
// Recipe Box, vignette « À classer », sélection de plusieurs recettes. L'app
// envoie 25 recettes au plus par appel (titre et ingrédients seulement) ;
// l'assistant propose, la personne valide sur l'écran de revue.
// Haiku 5.5, ~0,0005 $ par recette.
const Schema = z.object({
  recettes: z.array(
    z.object({
      id: z.string(),
      categories: z.array(z.string()),
      nouvelles: z.array(z.string()),
    })
  ),
});

function recettesRecues(corps: any) {
  const recettes = Array.isArray(corps?.recettes) ? corps.recettes : [];
  return recettes
    .slice(0, 25)
    .map((r: any) => ({
      id: String(r?.id ?? '').slice(0, 64),
      titre: String(r?.titre ?? '').trim().slice(0, 150),
      ingredients: (Array.isArray(r?.ingredients) ? r.ingredients : [])
        .slice(0, 40)
        .map((i: any) => String(i ?? '').trim().slice(0, 80))
        .filter(Boolean),
    }))
    .filter((r: any) => r.id && r.titre);
}

export const recetteCategories: Route = async (corps, ctx) => {
  const recettes = recettesRecues(corps);
  if (!recettes.length) throw new ErreurIA('entree', 'Aucune recette à classer.');
  const creationAutorisee = corps?.creation !== false;
  const existantes = await categoriesRecettes(ctx.client);
  const texte = [
    `Catégories existantes : ${existantes.join(', ') || 'aucune'}.`,
    creationAutorisee ? 'Création de nouvelles catégories : autorisée si aucune ne convient.' : 'Création de nouvelles catégories : INTERDITE, uniquement les existantes.',
    '',
    ...recettes.map((r: any) => `Recette ${r.id} : ${r.titre}\nIngrédients : ${r.ingredients.join(' ; ') || 'non renseignés'}`),
  ].join('\n');
  const r = await ctx.extraire({
    modele: 'claude-haiku-5-5',
    consigne: CONSIGNE,
    contenu: texte,
    schema: Schema,
    maxTokens: 120 * recettes.length + 200,
  });
  // Noms des catégories existantes, sans tenir compte des majuscules : on
  // reprend l'orthographe de l'app.
  const parNom = new Map(existantes.map((c) => [c.toLocaleLowerCase('fr'), c]));
  const recus = new Set(recettes.map((x: any) => x.id));
  return {
    recettes: r.brouillon.recettes
      .filter((x) => recus.has(x.id))
      .map((x) => {
        const categories = [...new Set(
          x.categories
            .map((c) => c.trim())
            .filter(Boolean)
            .map((c) => parNom.get(c.toLocaleLowerCase('fr')) ?? (creationAutorisee ? c : ''))
            .filter(Boolean)
        )].slice(0, 3);
        return {
          id: x.id,
          categories,
          nouvelles: categories.filter((c) => !parNom.has(c.toLocaleLowerCase('fr'))),
        };
      })
      .filter((x) => x.categories.length > 0),
  };
};
