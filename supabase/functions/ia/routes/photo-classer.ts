import { z, type Route } from '../../_partage/ia.ts';
import { contenuAvecFichiers, fichiersRecus } from '../../_partage/images.ts';
import { CONSIGNE } from '../../_partage/consignes/photo-classer.ts';

// ⊕ avec une photo, première étape (spécification § 4.6.1) : Haiku dit de
// quoi il s'agit, sur une image réduite (512 px), puis l'app ouvre l'écran
// qui sait la lire (recette, planning, objet, lettre). ~0,0003 $.
const Schema = z.object({
  type: z.string().describe('Une valeur parmi : recette, planning, lettre, objet, autre'),
  explication: z.string(),
});

const TYPES = ['recette', 'planning', 'lettre', 'objet', 'autre'];

export const photoClasser: Route = async (corps, ctx) => {
  const fichiers = fichiersRecus(corps, { max: 1 });
  const r = await ctx.extraire({
    modele: 'claude-haiku-5-5',
    consigne: CONSIGNE,
    contenu: contenuAvecFichiers(fichiers, 'De quoi s’agit-il ?'),
    schema: Schema,
    maxTokens: 300,
  });
  const type = String(r.brouillon.type).toLowerCase().trim();
  return { type: TYPES.includes(type) ? type : 'autre', explication: r.brouillon.explication };
};
