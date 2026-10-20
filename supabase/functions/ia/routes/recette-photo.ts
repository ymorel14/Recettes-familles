import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { contenuAvecFichiers, fichiersRecus } from '../../_partage/images.ts';
import { CONSIGNE } from '../../_partage/consignes/recette-photo.ts';

// Photo d'une recette → brouillon de la fiche recette (spécification
// § 4.1.1). Sonnet 5.5, effort low, ~0,03 $. Rien n'est enregistré : l'app
// ouvre le formulaire pré-rempli.
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

const Schema = z.object({
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

export type RecetteLue = z.infer<typeof Schema>;

const entier = (n: number | null, max: number) => (n == null || !Number.isFinite(n) || n <= 0 ? null : Math.min(max, Math.round(n)));

export const recettePhoto: Route = async (corps, ctx) => {
  const fichiers = fichiersRecus(corps, { max: 3 });
  const { data } = await ctx.client.schema('recettes').from('categories').select('nom').order('nom').limit(80);
  const categories = ((data as any[]) ?? []).map((c) => String(c.nom)).filter(Boolean);
  const texte = [
    fichiers.length > 1 ? `${fichiers.length} photos de la même recette, dans l'ordre.` : 'Une photo.',
    `Catégories existantes : ${categories.join(', ') || 'aucune'}.`,
  ].join('\n');
  const r = await ctx.extraire({
    modele: 'claude-sonnet-5-5',
    consigne: CONSIGNE,
    contenu: contenuAvecFichiers(fichiers, texte),
    schema: Schema,
    maxTokens: 6000,
  });
  const b = r.brouillon;
  const elements = b.elements
    .map((e) => ({
      ...e,
      nom: e.nom?.trim() || null,
      ingredients: e.ingredients.filter((i) => i.libelle.trim()),
      etapes: e.etapes.map((t) => t.replace(/^\s*\d+\s*[.)-]\s*/, '').trim()).filter(Boolean),
    }))
    .filter((e) => e.ingredients.length || e.etapes.length);
  if (!b.est_une_recette || (!b.titre.trim() && !elements.length)) {
    throw new ErreurIA('illisible', 'Je n’ai pas trouvé de recette sur cette photo. Essayez avec plus de lumière, ou remplissez à la main.');
  }
  return {
    ...b,
    titre: b.titre.trim(),
    parts: entier(b.parts, 100),
    prepa_min: entier(b.prepa_min, 2000),
    cuisson_min: entier(b.cuisson_min, 2000),
    elements,
    categories: b.categories.map((c) => c.trim()).filter(Boolean).slice(0, 3),
  };
};
