import type { Route } from '../../_partage/ia.ts';
import { contenuAvecFichiers, fichiersRecus } from '../../_partage/images.ts';
import { categoriesRecettes, normaliserRecette, SchemaRecette } from '../../_partage/recette.ts';
import { CONSIGNE } from '../../_partage/consignes/recette-photo.ts';

// Photo d'une recette → brouillon de la fiche recette (spécification
// § 4.1.1). Sonnet 5.5, effort low, ~0,03 $. Rien n'est enregistré : l'app
// ouvre le formulaire pré-rempli.
export const recettePhoto: Route = async (corps, ctx) => {
  const fichiers = fichiersRecus(corps, { max: 3 });
  const categories = await categoriesRecettes(ctx.client);
  const texte = [
    fichiers.length > 1 ? `${fichiers.length} photos de la même recette, dans l'ordre.` : 'Une photo.',
    `Catégories existantes : ${categories.join(', ') || 'aucune'}.`,
  ].join('\n');
  const r = await ctx.extraire({
    modele: 'claude-sonnet-5-5',
    consigne: CONSIGNE,
    contenu: contenuAvecFichiers(fichiers, texte),
    schema: SchemaRecette,
    maxTokens: 6000,
  });
  return normaliserRecette(r.brouillon, 'Je n’ai pas trouvé de recette sur cette photo. Essayez avec plus de lumière, ou remplissez à la main.');
};
