import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { aujourdHuiParis, texteRecu } from '../../_partage/contexte.ts';
import { CONSIGNE } from '../../_partage/consignes/idees-etape.ts';

// Idées par étape pendant la création d'un voyage (refonte Événements § 5.6) :
// 2 ou 3 idées de logement, de trajet ou d'activités d'après la destination,
// les dates, le nombre de personnes et les villes des foyers (villes seulement :
// jamais d'adresse ni de nom). Logement et activités : Sonnet 5.5 avec recherche
// web (3 au plus), liens vérifiés contre les résultats. Trajet : Haiku 5.5, sans
// recherche. Le résultat est un BROUILLON : l'app propose « + Ajouter ».
// ~0,05 $ (logement, activités), ~0,0008 $ (trajet).
const ETAPES = ['hebergement', 'trajet', 'activites'] as const;
type Etape = (typeof ETAPES)[number];
const MODES = ['voiture', 'moto', 'train', 'avion', 'bateau', 'bus', 'velo', 'autre'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const Schema = z.object({
  idees: z.array(
    z.object({
      nom: z.string(),
      detail: z.string(),
      lien: z.string().nullable(),
      prix: z.number().nullable(),
      mode: z.string().nullable(),
    })
  ),
});

// Même page : même hôte (sans « www. ») et même chemin, sans paramètres.
function cleUrl(u: string): string | null {
  try {
    const x = new URL(u.trim());
    if (!/^https?:$/.test(x.protocol)) return null;
    return `${x.hostname.replace(/^www\./, '').toLowerCase()}${x.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export const ideesEtape: Route = async (corps, ctx) => {
  const etape = corps?.etape as Etape;
  if (!ETAPES.includes(etape)) throw new ErreurIA('entree', 'Étape inconnue.');
  const destination = texteRecu(corps, 'destination', 120);
  if (destination.length < 2) {
    throw new ErreurIA('entree', 'Indiquez d’abord la destination : l’assistant proposera des idées sur place.');
  }
  const debut = typeof corps?.date_debut === 'string' && DATE.test(corps.date_debut) ? corps.date_debut : null;
  const fin = typeof corps?.date_fin === 'string' && DATE.test(corps.date_fin) ? corps.date_fin : null;
  const n = Number(corps?.nb_personnes);
  const nbPersonnes = Number.isFinite(n) && n >= 1 && n <= 60 ? Math.round(n) : null;
  const villes: string[] = Array.isArray(corps?.villes_foyers)
    ? [...new Set<string>(corps.villes_foyers.filter((v: unknown) => typeof v === 'string').map((v: string) => v.trim().slice(0, 80)).filter(Boolean))].slice(0, 6)
    : [];

  const contenu = [
    aujourdHuiParis(),
    `Étape : ${etape}`,
    `Destination : ${destination}`,
    debut ? `Dates : du ${debut} au ${fin ?? debut}` : 'Dates : pas encore connues',
    nbPersonnes ? `Personnes : ${nbPersonnes}` : 'Personnes : nombre inconnu',
    villes.length ? `Villes de départ des foyers : ${villes.join(', ')}` : 'Villes de départ : inconnues',
  ].join('\n');

  const avecRecherche = etape !== 'trajet';
  const r = await ctx.extraire({
    modele: avecRecherche ? 'claude-sonnet-5-5' : 'claude-haiku-5-5',
    consigne: CONSIGNE,
    contenu,
    schema: Schema,
    effort: 'low',
    maxTokens: avecRecherche ? 4000 : 1200,
    ...(avecRecherche
      ? {
          outils: [
            { type: 'web_search_20250305', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'FR', timezone: 'Europe/Paris' } },
          ],
        }
      : {}),
  });

  // --- Contrôles : rien d'inventé ---------------------------------------------
  const sources = new Set(r.urls.map(cleUrl).filter(Boolean) as string[]);
  const lienSur = (u: string | null) => {
    const cle = u ? cleUrl(u) : null;
    return avecRecherche && cle && sources.has(cle) ? u!.trim() : null;
  };
  const idees = r.brouillon.idees
    .filter((i) => i.nom.trim())
    .slice(0, 3)
    .map((i) => ({
      nom: i.nom.trim().slice(0, 120),
      detail: i.detail.trim().slice(0, 200),
      lien: lienSur(i.lien),
      prix: avecRecherche && i.prix != null && i.prix >= 0 && Number.isFinite(i.prix) ? Math.round(i.prix * 100) / 100 : null,
      mode: etape === 'trajet' ? (MODES.includes(i.mode ?? '') ? i.mode : 'autre') : null,
    }));

  return { etape, destination, idees };
};
