import { ErreurIA, type Route } from '../../_partage/ia.ts';
import { lirePage } from '../../_partage/page.ts';
import { plateformeVideo, texteVideo } from '../../_partage/video.ts';
import { texteRecu } from '../../_partage/contexte.ts';
import { categoriesRecettes, normaliserRecette, SchemaRecette } from '../../_partage/recette.ts';
import { CONSIGNE } from '../../_partage/consignes/recette-lien.ts';

// Recette depuis un lien (spécification § 4.1.2 et § 4.1.3) :
//   - page web SANS fiche recette structurée (l'app essaie d'abord
//     importer-recette, gratuit ; elle n'appelle cette route que s'il échoue) ;
//   - vidéo YouTube, TikTok ou Instagram : texte public seulement ;
//   - « texte » : description ou sous-titres collés par la personne.
// Sonnet 5.5, ~0,02 à 0,035 $.
const MESSAGE_VIDEO = 'Cette vidéo ne donne pas la recette par écrit. Collez la description ou les sous-titres.';
const MESSAGE_PAGE = 'Pas de recette sur cette page.';
const MAX_TEXTE = 30000;

export const recetteLien: Route = async (corps, ctx) => {
  const lien = typeof corps?.lien === 'string' ? corps.lien.trim() : '';
  const colle = texteRecu(corps, 'texte', MAX_TEXTE);
  const plateforme = lien ? plateformeVideo(lien) : null;
  if (!lien && !colle) throw new ErreurIA('entree', 'Collez l’adresse de la recette ou de la vidéo.');

  let source: 'web' | 'video' = plateforme ? 'video' : 'web';
  let url = lien || null;
  let image: string | null = null;
  let titre: string | null = null;
  let texte = colle;

  if (!colle) {
    if (plateforme) {
      const v = await texteVideo(lien);
      if (!v || v.texte.trim().length < 60) throw new ErreurIA('illisible', MESSAGE_VIDEO);
      ({ url, image, titre, texte } = v);
    } else {
      const page = await lirePage(lien, { maxTexte: MAX_TEXTE });
      if (!page) throw new ErreurIA('illisible', 'Je n’ai pas pu ouvrir cette page. Vérifiez l’adresse, ou saisissez la recette à la main.');
      ({ url, image, titre, texte } = page);
      if (texte.length < 150) throw new ErreurIA('illisible', MESSAGE_PAGE);
    }
  } else if (!plateforme && !lien) {
    source = 'web';
  }

  const categories = await categoriesRecettes(ctx.client);
  const contenu = [
    url ? `Adresse : ${url}` : '',
    titre ? `Titre : ${titre}` : '',
    colle ? 'Texte collé par la personne (description ou sous-titres) :' : source === 'video' ? 'Description de la vidéo :' : 'Texte de la page :',
    texte,
    '',
    `Catégories existantes : ${categories.join(', ') || 'aucune'}.`,
  ]
    .filter((x) => x !== '')
    .join('\n');
  const r = await ctx.extraire({ modele: 'claude-sonnet-5-5', consigne: CONSIGNE, contenu, schema: SchemaRecette, maxTokens: 6000 });
  const recette = normaliserRecette(r.brouillon, source === 'video' ? MESSAGE_VIDEO : MESSAGE_PAGE);
  return { ...recette, image, lien: url, source };
};
