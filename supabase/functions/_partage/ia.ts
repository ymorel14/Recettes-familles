// Socle de l'assistant (spécification V1, chantier B, § 3) : tout ce qui est
// commun aux fonctions d'IA de l'app Famille.
//
// Règles qui ne se discutent pas (§ 1) :
//   1. La surprise est garantie par la base, jamais par l'IA : toutes les
//      lectures passent par le client AU JETON DE L'UTILISATEUR (ctx.client),
//      donc par les règles RLS. La clé service_role (ctx.admin) ne sert qu'à
//      enregistrer la consommation et lire le plafond.
//   2. L'IA propose, l'humain enregistre : les routes renvoient un BROUILLON,
//      jamais d'écriture en base.
//   3. Les appels partent du serveur : la clé ANTHROPIC_API_KEY ne quitte
//      jamais les secrets Supabase.
//   4. Chaque appel est compté dans famille.ia_usage ; au-delà du plafond du
//      foyer, l'assistant fait une pause polie.
//
// Utilisation (voir supabase/functions/ia/index.ts) :
//   servirIA({ essai: async (corps, ctx) => { const r = await ctx.extraire({...}); return r.brouillon; } })

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.135.0/helpers/zod';
import { z } from 'npm:zod@4.6.7';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export { z };

export type Modele = 'claude-haiku-5-5' | 'claude-sonnet-5-5';
export type Effort = 'low' | 'medium' | 'high';

// --- Erreurs : toujours un message lisible, jamais technique (§ 5.3) -------

export type CodeErreur =
  | 'non_connecte'
  | 'sans_foyer'
  | 'plafond'
  | 'refus'
  | 'illisible'
  | 'entree'
  | 'route'
  | 'configuration'
  | 'indisponible';

const STATUTS: Record<CodeErreur, number> = {
  non_connecte: 401,
  sans_foyer: 403,
  plafond: 429,
  refus: 422,
  illisible: 422,
  entree: 400,
  route: 404,
  configuration: 500,
  indisponible: 503,
};

export class ErreurIA extends Error {
  constructor(public code: CodeErreur, message: string) {
    super(message);
  }
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function moisSuivant(): string {
  const parisMaintenant = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  return MOIS[(parisMaintenant.getMonth() + 1) % 12];
}

// --- Tarifs et calcul du coût (§ 3.3) ---------------------------------------

type Tarif = {
  entree: number;
  sortie: number;
  cache_ecriture: number;
  cache_lecture: number;
  seuil_long: number | null;
  entree_long: number | null;
  sortie_long: number | null;
  cache_ecriture_long: number | null;
  cache_lecture_long: number | null;
  remise_differe: number;
  recherche_web_par_mille: number;
};

// Valeurs de secours (octobre 2026), si famille.ia_tarifs est illisible.
const TARIFS_SECOURS: Record<string, Tarif> = {
  'claude-haiku-5-5': {
    entree: 0.1, sortie: 0.5, cache_ecriture: 0.125, cache_lecture: 0.01,
    seuil_long: 100000, entree_long: 0.5, sortie_long: 2.5, cache_ecriture_long: 0.625, cache_lecture_long: 0.05,
    remise_differe: 0.5, recherche_web_par_mille: 10,
  },
  'claude-sonnet-5-5': {
    entree: 2, sortie: 10, cache_ecriture: 2.5, cache_lecture: 0.1,
    seuil_long: null, entree_long: null, sortie_long: null, cache_ecriture_long: null, cache_lecture_long: null,
    remise_differe: 0.5, recherche_web_par_mille: 10,
  },
};

let tarifsEnMemoire: { lus: number; tarifs: Record<string, Tarif> } | null = null;

async function tarifs(admin: SupabaseClient<any, any, any>): Promise<Record<string, Tarif>> {
  if (tarifsEnMemoire && Date.now() - tarifsEnMemoire.lus < 10 * 60 * 1000) return tarifsEnMemoire.tarifs;
  const { data } = await admin.schema('famille').from('ia_tarifs').select('*');
  const lus: Record<string, Tarif> = { ...TARIFS_SECOURS };
  for (const t of (data as any[]) ?? []) {
    lus[t.modele] = Object.fromEntries(
      Object.entries(t).map(([k, v]) => [k, v === null || k === 'modele' || k === 'maj_le' ? v : Number(v)])
    ) as Tarif;
  }
  tarifsEnMemoire = { lus: Date.now(), tarifs: lus };
  return lus;
}

export type Consommation = {
  tokens_entree: number;
  tokens_sortie: number;
  tokens_cache_lus: number;
  tokens_cache_ecrits: number;
  recherches_web: number;
};

export function consommationDe(usage: any): Consommation {
  return {
    tokens_entree: usage?.input_tokens ?? 0,
    tokens_sortie: usage?.output_tokens ?? 0,
    tokens_cache_lus: usage?.cache_read_input_tokens ?? 0,
    tokens_cache_ecrits: usage?.cache_creation_input_tokens ?? 0,
    recherches_web: usage?.server_tool_use?.web_search_requests ?? 0,
  };
}

export function coutUsd(t: Tarif, c: Consommation, differe = false): number {
  const totalEntree = c.tokens_entree + c.tokens_cache_lus + c.tokens_cache_ecrits;
  const long = t.seuil_long != null && totalEntree > t.seuil_long;
  const prix = (normal: number, longue: number | null) => (long && longue != null ? longue : normal);
  const tokens =
    c.tokens_entree * prix(t.entree, t.entree_long) +
    c.tokens_sortie * prix(t.sortie, t.sortie_long) +
    c.tokens_cache_lus * prix(t.cache_lecture, t.cache_lecture_long) +
    c.tokens_cache_ecrits * prix(t.cache_ecriture, t.cache_ecriture_long);
  const dollarsTokens = (tokens / 1_000_000) * (differe ? t.remise_differe : 1);
  return dollarsTokens + (c.recherches_web * t.recherche_web_par_mille) / 1000;
}

// --- Contexte d'un appel ------------------------------------------------------

export type OptionsExtraction<T> = {
  modele: Modele;
  // Consigne STABLE (mise en cache) : rien de variable dedans (date, heure,
  // identifiants), sinon le cache ne sert jamais (§ 3.4).
  consigne: string;
  // Contexte stable supplémentaire, mis en cache lui aussi (ex. la recette
  // en cours pour l'assistant en cuisine).
  contexteStable?: string;
  contenu: string | Anthropic.ContentBlockParam[];
  schema: z.ZodType<T>;
  effort?: Effort;
  maxTokens?: number;
  outils?: any[]; // ex. outil de recherche web (brouillon de voyage)
};

export type ResultatExtraction<T> = {
  brouillon: T;
  modele: string;
  consommation: Consommation;
  coutUsd: number;
};

export type Contexte = {
  fonction: string;
  utilisateurId: string;
  foyerId: string;
  // Client au jeton de l'utilisateur : TOUTES les lectures de données.
  client: SupabaseClient<any, any, any>;
  // Client service_role : consommation et plafond uniquement.
  admin: SupabaseClient<any, any, any>;
  extraire: <T>(options: OptionsExtraction<T>) => Promise<ResultatExtraction<T>>;
  enregistrer: (modele: string, consommation: Consommation, differe?: boolean) => Promise<number>;
};

export type Route = (corps: any, ctx: Contexte) => Promise<unknown>;

let anthropic: Anthropic | null = null;
function clientAnthropic(): Anthropic {
  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    throw new ErreurIA('configuration', 'L’assistant n’est pas encore configuré sur ce projet (clé ANTHROPIC_API_KEY absente).');
  }
  anthropic ??= new Anthropic(); // lit ANTHROPIC_API_KEY
  return anthropic;
}

function creerContexte(
  fonction: string,
  utilisateurId: string,
  foyerId: string,
  client: SupabaseClient<any, any, any>,
  admin: SupabaseClient<any, any, any>
): Contexte {
  const enregistrer = async (modele: string, c: Consommation, differe = false): Promise<number> => {
    const tarif = (await tarifs(admin))[modele] ?? TARIFS_SECOURS['claude-sonnet-5-5'];
    const cout = coutUsd(tarif, c, differe);
    const { error } = await admin
      .schema('famille')
      .from('ia_usage')
      .insert({ foyer_id: foyerId, utilisateur_id: utilisateurId, fonction, modele, differe, cout_usd: cout.toFixed(6), ...c });
    if (error) console.error('ia_usage : enregistrement impossible', error.message);
    return cout;
  };

  const extraire = async <T>(o: OptionsExtraction<T>): Promise<ResultatExtraction<T>> => {
    // Sortie structurée : le schéma part dans output_config.format ; on lit
    // nous-mêmes la réponse APRÈS avoir regardé stop_reason (une réponse
    // coupée par max_tokens n'est pas un JSON valide).
    const format = zodOutputFormat(o.schema as any);
    const systeme: any[] = [{ type: 'text', text: o.consigne, cache_control: { type: 'ephemeral' } }];
    if (o.contexteStable) systeme.push({ type: 'text', text: o.contexteStable, cache_control: { type: 'ephemeral' } });
    const parametres: any = {
      model: o.modele,
      max_tokens: o.maxTokens ?? 4000,
      system: systeme,
      messages: [{ role: 'user', content: o.contenu }],
      output_config: { format, effort: o.effort ?? 'low' },
      ...(o.outils ? { tools: o.outils } : {}),
    };

    const appeler = async (p: any): Promise<any> => {
      try {
        const api = clientAnthropic();
        // Sonnet 5.5 : repli côté serveur en cas de refus (§ 3.2). Haiku : non.
        if (o.modele === 'claude-sonnet-5-5') {
          return await api.beta.messages.create({ ...p, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
        }
        return await api.messages.create(p);
      } catch (e) {
        if (e instanceof ErreurIA) throw e;
        if (e instanceof Anthropic.APIError) {
          console.error('Anthropic', e.status, e.message);
          if (e.status === 400) throw new ErreurIA('entree', 'Je n’ai pas pu traiter cette demande. Essayez avec un autre contenu.');
          throw new ErreurIA('indisponible', 'L’assistant est momentanément indisponible. Réessayez dans un instant.');
        }
        console.error('Appel au modèle', e);
        throw new ErreurIA('indisponible', 'L’assistant est momentanément indisponible. Réessayez dans un instant.');
      }
    };

    let reponse = await appeler(parametres);
    let total = consommationDe(reponse.usage);
    // Trop long : UNE nouvelle tentative avec une limite plus haute (§ 3.1, 4).
    if (reponse.stop_reason === 'max_tokens') {
      await enregistrer(reponse.model ?? o.modele, total);
      reponse = await appeler({ ...parametres, max_tokens: Math.max(16000, parametres.max_tokens * 2) });
      total = consommationDe(reponse.usage);
    }
    const cout = await enregistrer(reponse.model ?? o.modele, total);

    // Toujours lire stop_reason avant le contenu.
    if (reponse.stop_reason === 'refusal') {
      throw new ErreurIA('refus', 'Je n’ai pas pu traiter ce contenu. Essayez avec un autre, ou remplissez à la main.');
    }
    const textes = ((reponse.content as any[]) ?? []).filter((b) => b.type === 'text');
    let brouillon: T;
    try {
      brouillon = (format as any).parse(textes[textes.length - 1]?.text ?? '') as T;
    } catch (e) {
      console.error('Réponse hors schéma', e);
      throw new ErreurIA('illisible', 'Je n’ai pas réussi à lire ce contenu. Remplissez à la main ou réessayez.');
    }
    return { brouillon, modele: reponse.model ?? o.modele, consommation: total, coutUsd: cout };
  };

  return { fonction, utilisateurId, foyerId, client, admin, extraire, enregistrer };
}

// --- Serveur ------------------------------------------------------------------

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function erreur(e: ErreurIA): Response {
  return json({ erreur: { code: e.code, message: e.message } }, STATUTS[e.code]);
}

// « /ia/recette-photo » → « recette-photo »
function nomDeRoute(url: string): string {
  const morceaux = new URL(url).pathname.split('/').filter(Boolean);
  const i = morceaux.lastIndexOf('ia');
  return (i >= 0 ? morceaux[i + 1] : morceaux[morceaux.length - 1]) ?? '';
}

export function servirIA(routes: Record<string, Route>): void {
  Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ erreur: { code: 'route', message: 'Méthode non prise en charge.' } }, 405);
    try {
      const fonction = nomDeRoute(req.url);
      const route = routes[fonction];
      if (!route) throw new ErreurIA('route', 'Cette fonction de l’assistant n’existe pas.');

      const url = Deno.env.get('SUPABASE_URL')!;
      const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
      const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const jeton = req.headers.get('Authorization') ?? '';

      // 1. L'utilisateur et son foyer, lus AVEC SON JETON (règles RLS).
      const client = createClient(url, anon, {
        global: { headers: { Authorization: jeton } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: lecture, error: erreurUtilisateur } = await client.auth.getUser();
      const utilisateur = lecture?.user;
      if (erreurUtilisateur || !utilisateur) throw new ErreurIA('non_connecte', 'Reconnectez-vous pour utiliser l’assistant.');

      const { data: membre } = await client
        .schema('famille')
        .from('foyer_membres')
        .select('foyer_id')
        .eq('utilisateur_id', utilisateur.id)
        .limit(1)
        .maybeSingle();
      if (!membre?.foyer_id) throw new ErreurIA('sans_foyer', 'L’assistant est réservé aux membres d’un foyer.');

      // 2. Plafond du foyer (§ 3.3).
      const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: etat, error: erreurEtat } = await admin.schema('famille').rpc('ia_etat_foyer', { id_foyer: membre.foyer_id });
      if (erreurEtat) {
        console.error('ia_etat_foyer', erreurEtat.message);
        throw new ErreurIA('configuration', 'L’assistant n’est pas encore installé sur ce projet (migration famille_ia).');
      }
      const ligne = (etat as any[])?.[0];
      if (ligne && Number(ligne.utilise_usd) >= Number(ligne.plafond_usd)) {
        throw new ErreurIA(
          'plafond',
          `L’assistant fait une pause jusqu’au 1er ${moisSuivant()}. Tout le reste de l’app fonctionne.`
        );
      }

      // 3. La route elle-même : renvoie un brouillon.
      let corps: any = {};
      try {
        corps = await req.json();
      } catch {
        corps = {};
      }
      const ctx = creerContexte(fonction, utilisateur.id, membre.foyer_id, client, admin);
      const resultat = await route(corps, ctx);
      return json({ resultat });
    } catch (e) {
      if (e instanceof ErreurIA) return erreur(e);
      console.error('Erreur inattendue', e);
      return erreur(new ErreurIA('indisponible', 'L’assistant est momentanément indisponible. Réessayez dans un instant.'));
    }
  });
}
