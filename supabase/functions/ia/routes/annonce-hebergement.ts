import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { lirePage } from '../../_partage/page.ts';
import { CONSIGNE } from '../../_partage/consignes/annonce-hebergement.ts';

// Annonce de location collée → fiche d'hébergement (spécification § 4.5.2).
// L'app appelle d'abord lire-annonce (gratuit) ; cette route seulement si
// la lecture est incomplète (prix, couchages ou chambres manquants).
// Sonnet 5.5, ~0,02 $.
const Schema = z.object({
  est_une_annonce: z.boolean(),
  nom: z.string().nullable(),
  ville: z.string().nullable(),
  adresse: z.string().nullable(),
  couchages: z.number().nullable(),
  chambres: z.number().nullable(),
  prix_total: z.number().nullable(),
  prix_nuit: z.number().nullable(),
  prix_semaine: z.number().nullable(),
  frais: z.number().nullable(),
  detail_frais: z.string().nullable(),
  description: z.string().nullable(),
  a_verifier: z.array(z.string()),
});

const entier = (n: number | null) => (n == null || !Number.isFinite(n) || n <= 0 ? null : Math.min(100, Math.round(n)));
const montant = (n: number | null) => (n == null || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 100) / 100);

export const annonceHebergement: Route = async (corps, ctx) => {
  const lien = typeof corps?.lien === 'string' ? corps.lien.trim() : '';
  if (!/^https?:\/\//i.test(lien)) throw new ErreurIA('entree', 'Collez le lien de l’annonce (https://…).');
  const page = await lirePage(lien, { maxOctets: 3_000_000, maxTexte: 30000 });
  if (!page || page.texte.length < 200) {
    throw new ErreurIA('illisible', 'Ce site ne laisse pas lire l’annonce. Remplissez la fiche à la main.');
  }
  const r = await ctx.extraire({
    modele: 'claude-sonnet-5-5',
    consigne: CONSIGNE,
    contenu: [`Adresse : ${page.url}`, page.titre ? `Titre : ${page.titre}` : '', '', 'Texte de la page :', page.texte].filter(Boolean).join('\n'),
    schema: Schema,
    maxTokens: 1500,
  });
  const b = r.brouillon;
  if (!b.est_une_annonce) {
    throw new ErreurIA('illisible', 'Cette page ne ressemble pas à une annonce de location. Remplissez la fiche à la main.');
  }
  return {
    ...b,
    nom: b.nom?.trim() || null,
    couchages: entier(b.couchages),
    chambres: entier(b.chambres),
    prix_total: montant(b.prix_total),
    prix_nuit: montant(b.prix_nuit),
    prix_semaine: montant(b.prix_semaine),
    frais: montant(b.frais),
    image: page.image,
  };
};
