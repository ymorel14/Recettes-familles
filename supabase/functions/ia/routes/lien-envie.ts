import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { adresseAutorisee, lirePage } from '../../_partage/page.ts';
import { CONSIGNE } from '../../_partage/consignes/lien-envie.ts';

// Lien collé → fiche d'envie (spécification § 4.4.1). On lit d'abord la page
// (données structurées et balises og:) : si le nom et le prix y sont, PAS
// d'IA (gratuit). Sinon, le texte de la page part à Haiku 5.5 (~0,002 $).
const Schema = z.object({
  est_un_produit: z.boolean(),
  titre: z.string().nullable(),
  prix: z.number().nullable(),
  taille: z.string().nullable(),
  options: z.array(z.string()),
  description: z.string().nullable(),
  a_verifier: z.array(z.string()),
});

export type FicheEnvie = {
  lien: string;
  titre: string | null;
  prix: number | null;
  image: string | null;
  taille: string | null;
  options: string[];
  description: string | null;
  a_verifier: string[];
  source: 'page' | 'assistant';
};

// « Amazon.fr : Lego Technic 42151 : Jeux et Jouets » → « Lego Technic 42151 »
function titreNettoye(t: string | null): string | null {
  if (!t) return null;
  const propre = t
    .replace(/^(amazon\.[a-z.]+|fnac|decathlon|la redoute|etsy)\s*[:|–-]\s*/i, '')
    .replace(/\s*[:|–-]\s*(amazon\.[a-z.]+|fnac(\.com)?|decathlon|la redoute|etsy|jeux et jouets|livres?|high-tech).*$/i, '')
    .trim();
  return propre || t.trim();
}

export const lienEnvie: Route = async (corps, ctx) => {
  const lien = typeof corps?.lien === 'string' ? corps.lien.trim() : '';
  if (!adresseAutorisee(lien)) throw new ErreurIA('entree', 'Collez l’adresse complète de la page (https://…).');
  const page = await lirePage(lien);
  if (!page) {
    throw new ErreurIA('illisible', 'Je n’ai pas pu ouvrir cette page. Remplissez la fiche à la main.');
  }

  const titre = titreNettoye(page.titre);
  const prix = page.devise && !/eur|€/i.test(page.devise) ? null : page.prix;
  if (titre && prix != null) {
    const fiche: FicheEnvie = { lien: page.url, titre, prix, image: page.image, taille: null, options: [], description: page.description, a_verifier: [], source: 'page' };
    return fiche;
  }

  if (page.texte.length < 200) {
    // Page presque vide (souvent un contrôle anti-robot) : on garde ce qu'on a.
    return {
      lien: page.url,
      titre,
      prix,
      image: page.image,
      taille: null,
      options: [],
      description: null,
      a_verifier: ['titre', 'prix'],
      source: 'page',
    } satisfies FicheEnvie;
  }

  const r = await ctx.extraire({
    modele: 'claude-haiku-5-5',
    consigne: CONSIGNE,
    contenu: [
      `Adresse : ${page.url}`,
      titre ? `Titre de la page : ${titre}` : '',
      prix != null ? `Prix lu dans les balises : ${prix} €` : '',
      '',
      'Texte de la page :',
      page.texte,
    ]
      .filter(Boolean)
      .join('\n'),
    schema: Schema,
    maxTokens: 800,
  });
  const b = r.brouillon;
  if (!b.est_un_produit) {
    throw new ErreurIA('illisible', 'Cette page ne semble pas présenter un produit. Remplissez la fiche à la main.');
  }
  const fiche: FicheEnvie = {
    lien: page.url,
    titre: b.titre ?? titre,
    prix: b.prix ?? prix,
    image: page.image,
    taille: b.taille,
    options: b.options.slice(0, 6),
    description: b.description,
    a_verifier: b.a_verifier,
    source: 'assistant',
  };
  return fiche;
};
