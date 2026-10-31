import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { contenuAvecFichiers, fichiersRecus } from '../../_partage/images.ts';
import { CONSIGNE } from '../../_partage/consignes/objet-photo.ts';

// Photo d'un objet → fiche d'une envie (spécification § 4.4.2). Sonnet 5.5,
// ~0,02 $. Pas de recherche web en V1.
const Schema = z.object({
  est_un_objet: z.boolean(),
  nom: z.string(),
  marque: z.string().nullable(),
  categorie: z.string().nullable(),
  prix_estime: z.number().nullable(),
  description: z.string().nullable(),
  mots_cles: z.string(),
  a_verifier: z.array(z.string()),
});

export const objetPhoto: Route = async (corps, ctx) => {
  const fichiers = fichiersRecus(corps, { max: 1 });
  const r = await ctx.extraire({
    modele: 'claude-sonnet-5-5',
    consigne: CONSIGNE,
    contenu: contenuAvecFichiers(fichiers, 'Quel est cet objet ?'),
    schema: Schema,
    maxTokens: 800,
  });
  const b = r.brouillon;
  if (!b.est_un_objet || !b.nom.trim()) {
    throw new ErreurIA('illisible', 'Je n’ai pas reconnu d’objet sur cette photo. Essayez de plus près, ou remplissez à la main.');
  }
  const prix = b.prix_estime != null && b.prix_estime > 0 ? Math.round(b.prix_estime * 100) / 100 : null;
  return { ...b, nom: b.nom.trim(), prix_estime: prix, mots_cles: b.mots_cles.trim() || b.nom.trim() };
};
