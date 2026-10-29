import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { aujourdHuiParis, texteRecu } from '../../_partage/contexte.ts';
import { CONSIGNE } from '../../_partage/consignes/evenement-suggestion.ts';

// Panneau assistant de la page d'un événement (refonte Événements § 8.1) :
// « Compléter le programme », « Idées pour un jour de pluie », « Réduire le
// budget » (voyage) ; « Équilibrer le menu », « Quantités pour N », « Idées de
// dessert » (repas). Haiku 5.5, sans recherche web, ~0,001 $. Seuls des
// intitulés et des nombres sont envoyés : aucun nom de personne, aucune adresse.
const SUGGESTIONS: Record<string, string[]> = {
  voyage: ['programme', 'pluie', 'budget'],
  repas: ['equilibrer', 'quantites', 'dessert'],
};
const CATEGORIES = ['aperitif', 'entree', 'plat', 'accompagnement', 'fromage', 'dessert', 'boissons'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const Schema = z.object({
  reponse: z.string(),
  ajouts: z.array(
    z.object({ type: z.string(), titre: z.string(), detail: z.string().nullable(), categorie: z.string().nullable() })
  ),
});

const liste = (v: unknown, max: number, longueur: number): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, max).map((x: string) => x.trim().slice(0, longueur)) : [];

export const evenementSuggestion: Route = async (corps, ctx) => {
  const nature = corps?.nature === 'repas' ? 'repas' : 'voyage';
  const suggestion = String(corps?.suggestion ?? '');
  if (!SUGGESTIONS[nature].includes(suggestion)) throw new ErreurIA('entree', 'Cette suggestion n’existe pas.');

  const titre = texteRecu(corps, 'titre', 120);
  const destination = texteRecu(corps, 'destination', 120);
  const debut = typeof corps?.date_debut === 'string' && DATE.test(corps.date_debut) ? corps.date_debut : null;
  const fin = typeof corps?.date_fin === 'string' && DATE.test(corps.date_fin) ? corps.date_fin : null;
  const n = Number(corps?.nb_personnes);
  const nbPersonnes = Number.isFinite(n) && n >= 1 && n <= 80 ? Math.round(n) : null;
  const budget = Number(corps?.budget_total);
  const activites = liste(corps?.activites, 30, 80);
  const logement = texteRecu(corps, 'logement', 80);
  const plats: { titre: string; categorie: string }[] = Array.isArray(corps?.plats)
    ? corps.plats
        .filter((p: any) => p && typeof p.titre === 'string' && p.titre.trim())
        .slice(0, 40)
        .map((p: any) => ({ titre: p.titre.trim().slice(0, 80), categorie: CATEGORIES.includes(p.categorie) ? p.categorie : 'autre' }))
    : [];
  if (suggestion === 'quantites' && !plats.length) {
    throw new ErreurIA('entree', 'Aucun plat n’est encore prévu : ajoutez d’abord quelques plats au menu.');
  }

  const contenu = [
    aujourdHuiParis(),
    `Nature : ${nature === 'repas' ? 'repas de famille' : 'voyage'}`,
    `Suggestion demandée : ${suggestion}`,
    titre ? `Titre : ${titre}` : '',
    destination ? `${nature === 'repas' ? 'Lieu' : 'Destination'} : ${destination}` : '',
    debut ? `Dates : du ${debut} au ${fin ?? debut}` : 'Dates : pas encore fixées',
    nbPersonnes ? `Personnes : ${nbPersonnes}` : 'Personnes : nombre inconnu',
    nature === 'voyage' && logement ? `Logement retenu : ${logement}` : '',
    nature === 'voyage' ? (activites.length ? `Activités déjà proposées :\n${activites.map((a) => `- ${a}`).join('\n')}` : 'Activités déjà proposées : aucune') : '',
    nature === 'voyage' && Number.isFinite(budget) && budget > 0 ? `Budget estimé pour le groupe : ${Math.round(budget)} €` : '',
    nature === 'repas' ? (plats.length ? `Menu prévu :\n${plats.map((p) => `- ${p.titre} (${p.categorie})`).join('\n')}` : 'Menu prévu : vide') : '',
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

  // --- Contrôles : seulement ce que la suggestion permet ----------------------
  const dejaLa = new Set([...activites, ...plats.map((p) => p.titre)].map((t) => t.toLowerCase()));
  const vus = new Set<string>();
  const type = nature === 'repas' ? 'plat' : 'activite';
  const permis = suggestion !== 'budget' && suggestion !== 'quantites';
  const ajouts = (permis ? r.brouillon.ajouts : [])
    .filter((a) => a.type === type && a.titre.trim())
    .map((a) => ({
      type,
      titre: a.titre.trim().charAt(0).toUpperCase() + a.titre.trim().slice(1, 100),
      detail: a.detail?.trim().slice(0, 160) || null,
      categorie:
        nature === 'repas' ? (suggestion === 'dessert' ? 'dessert' : CATEGORIES.includes(a.categorie ?? '') ? (a.categorie as string) : 'plat') : null,
    }))
    .filter((a) => {
      const cle = a.titre.toLowerCase();
      if (dejaLa.has(cle) || vus.has(cle)) return false;
      vus.add(cle);
      return true;
    })
    .slice(0, suggestion === 'pluie' || suggestion === 'dessert' ? 3 : 4);

  return { suggestion, reponse: r.brouillon.reponse.trim().slice(0, 900), ajouts };
};
