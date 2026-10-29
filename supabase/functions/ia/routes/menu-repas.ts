import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { aujourdHuiParis, texteRecu } from '../../_partage/contexte.ts';
import { CONSIGNE } from '../../_partage/consignes/menu-repas.ts';

// Menu complet d'un repas de famille (refonte Événements § 5.6, § 10.4) :
// « L'assistant propose un menu complet » (création du repas) et « Équilibrer
// le menu », « Quantités pour 17 » (page du repas). Haiku 5.5, sans recherche
// web, ~0,001 $. Aucun nom de personne n'est envoyé : seulement l'occasion, le
// nombre d'invités, la saison et les intitulés des plats déjà prévus.
const CATEGORIES = ['aperitif', 'entree', 'plat', 'accompagnement', 'fromage', 'dessert', 'boissons'];
const OCCASIONS = ['repas', 'noel', 'nouvel_an', 'paques', 'anniversaire'];
const LIBELLES_OCCASION: Record<string, string> = {
  repas: 'repas de famille',
  noel: 'Noël',
  nouvel_an: 'Nouvel an',
  paques: 'Pâques',
  anniversaire: 'anniversaire',
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const Schema = z.object({
  plats: z.array(z.object({ titre: z.string(), categorie: z.string(), quantite: z.string().nullable() })),
  question: z.string().nullable(),
});

function saison(iso: string | null): string {
  if (!iso) return 'saison inconnue';
  const m = Number(iso.slice(5, 7));
  if (m === 12 || m <= 2) return 'hiver';
  if (m <= 5) return 'printemps';
  if (m <= 8) return 'été';
  return 'automne';
}

export const menuRepas: Route = async (corps, ctx) => {
  const occasion = OCCASIONS.includes(corps?.occasion) ? (corps.occasion as string) : 'repas';
  const n = Number(corps?.nb_invites);
  const nbInvites = Number.isFinite(n) && n >= 2 && n <= 80 ? Math.round(n) : null;
  if (!nbInvites) throw new ErreurIA('entree', 'Indiquez d’abord qui participe : l’assistant adapte le menu au nombre d’invités.');
  const date = typeof corps?.date === 'string' && DATE.test(corps.date) ? corps.date : null;
  const quantites = corps?.quantites === true;
  const moment = corps?.moment === 'dejeuner' ? 'midi' : corps?.moment === 'diner' ? 'soir' : null;
  const existants: { titre: string; categorie: string }[] = Array.isArray(corps?.plats)
    ? corps.plats
        .filter((p: any) => p && typeof p.titre === 'string' && p.titre.trim())
        .slice(0, 30)
        .map((p: any) => ({ titre: p.titre.trim().slice(0, 80), categorie: CATEGORIES.includes(p.categorie) ? p.categorie : 'autre' }))
    : [];
  const precisions = texteRecu(corps, 'precisions', 200);

  const contenu = [
    aujourdHuiParis(),
    `Occasion : ${LIBELLES_OCCASION[occasion]}`,
    `Invités : ${nbInvites}`,
    `Saison : ${saison(date)}${moment ? `, repas du ${moment}` : ''}`,
    `Quantités demandées : ${quantites ? 'oui' : 'non'}`,
    existants.length
      ? `Plats déjà prévus :\n${existants.map((p) => `- ${p.titre} (${p.categorie})`).join('\n')}`
      : 'Plats déjà prévus : aucun',
    precisions ? `Précisions de l’organisateur : « ${precisions} »` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const r = await ctx.extraire({
    modele: 'claude-haiku-5-5',
    consigne: CONSIGNE,
    contenu,
    schema: Schema,
    maxTokens: 1500,
  });

  // --- Contrôles : catégories connues, pas de doublon avec l'existant ---------
  const pris = new Set(existants.map((p) => p.titre.toLowerCase()));
  const vus = new Set<string>();
  const plats = r.brouillon.plats
    .filter((p) => p.titre.trim() && CATEGORIES.includes(p.categorie))
    .map((p) => ({
      titre: p.titre.trim().charAt(0).toUpperCase() + p.titre.trim().slice(1),
      categorie: p.categorie,
      quantite: quantites ? p.quantite?.trim().slice(0, 120) || null : null,
    }))
    .filter((p) => {
      const cle = p.titre.toLowerCase();
      if (pris.has(cle) || vus.has(cle)) return false;
      vus.add(cle);
      return true;
    })
    .slice(0, 10);

  return { plats, question: r.brouillon.question?.trim() || null };
};
