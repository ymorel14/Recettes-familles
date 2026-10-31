// Fonction Edge « ia-nuit » : traitement de nuit de l'assistant, à moitié
// prix (API Batches d'Anthropic), spécification V1 § 3.4.
//
//   - résumé du matin de chaque personne venue sur l'accueil cette semaine
//     (§ 4.6.2) → famille.resumes_matin ;
//   - une fois par semaine et par foyer, affinage des habituels de Courses
//     (§ 4.2.2) → courses.previsions_ia.
//
// Le travail est PRÉPARÉ dans la base par famille.preparer_travaux_nuit()
// (pg_cron, vers 2 h) : les faits y sont calculés sous l'identité de chaque
// personne, avec ses règles RLS, puis rangés dans famille.ia_travaux. Cette
// fonction ne lit QUE ces faits déjà filtrés, jamais les tables des modules
// (§ 5.6) ; la clé service_role sert à lire ce travail, à écrire les
// résultats et à compter la consommation.
//
// Chaque appel (planification : supabase/planification_nuit.sql, toutes
// les 15 minutes de 2 h à 8 h environ) :
//   1. relève les lots terminés (souvent en quelques minutes, 24 h au plus)
//      et enregistre résumés, prévisions et consommation (differe = true) ;
//   2. envoie le travail en attente dans un nouveau lot, sauf pour les
//      foyers au plafond du mois.
// Relancer la fonction ne refait rien en double : sans travail en attente
// ni lot en cours, elle ne coûte rien.
//
// Déploiement (une fois) : supabase functions deploy ia-nuit
// (même secret ANTHROPIC_API_KEY que la fonction « ia »).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.135.0/helpers/zod';
import { clientAnthropic, consommationDe, enregistrerConsommation } from '../_partage/ia.ts';
import {
  CONSIGNE_HABITUELS_NUIT,
  CONSIGNE_RESUME_MATIN,
  MODELE_NUIT,
  SchemaHabituels,
  SchemaResume,
  contenuHabituels,
  contenuResume,
  faitsValides,
  historiqueValide,
  jourParis,
  lignesPrevisions,
  phrasesAvecCibles,
} from '../_partage/nuit.ts';

type Travail = {
  id: string;
  nature: 'resume-matin' | 'habituels';
  foyer_id: string;
  utilisateur_id: string | null;
  jour: string;
  entree: unknown;
};

type Bilan = { lotsReleves: number; resultats: number; echecs: number; envoyes: number; plafond: number; lot: string | null };

const FORMAT_RESUME = zodOutputFormat(SchemaResume as any);
const FORMAT_HABITUELS = zodOutputFormat(SchemaHabituels as any);

function json(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });
}

// Paramètres d'une requête du lot : consigne stable en premier (mise en
// cache), puis les faits du jour.
function parametres(t: Travail): any {
  const resume = t.nature === 'resume-matin';
  const contenu = resume
    ? contenuResume(faitsValides(t.entree), t.jour)
    : contenuHabituels(historiqueValide(t.entree), t.jour);
  // Le format est sérialisé en JSON (la fonction de lecture n'est pas envoyée).
  const { parse: _parse, ...format } = (resume ? FORMAT_RESUME : FORMAT_HABITUELS) as any;
  return {
    model: MODELE_NUIT,
    max_tokens: resume ? 1200 : 4000,
    system: [{ type: 'text', text: resume ? CONSIGNE_RESUME_MATIN : CONSIGNE_HABITUELS_NUIT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: contenu }],
    output_config: { format, effort: 'low' },
  };
}

async function marquer(admin: SupabaseClient<any, any, any>, ids: string[], champs: Record<string, unknown>) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await admin.schema('famille').from('ia_travaux').update(champs).in('id', ids.slice(i, i + 200));
    if (error) console.error('[ia-nuit] ia_travaux', error.message);
  }
}

// --- 1. Relever les lots terminés --------------------------------------------

async function relever(admin: SupabaseClient<any, any, any>, bilan: Bilan) {
  const { data: lots, error } = await admin.schema('famille').from('ia_lots').select('id, anthropic_id, cree_le').eq('statut', 'en_cours');
  if (error) throw error;
  const api = clientAnthropic();

  for (const lot of (lots as any[]) ?? []) {
    const lotApi = await api.messages.batches.retrieve(lot.anthropic_id);
    if (lotApi.processing_status !== 'ended') {
      // Un lot dure 24 h au plus : au-delà, on l'abandonne.
      if (Date.now() - new Date(lot.cree_le).getTime() > 25 * 3600 * 1000) {
        await api.messages.batches.cancel(lot.anthropic_id).catch(() => {});
        await admin.schema('famille').from('ia_lots').update({ statut: 'echec', termine_le: new Date().toISOString() }).eq('id', lot.id);
        const { data: restants } = await admin.schema('famille').from('ia_travaux').select('id').eq('lot_id', lot.id).eq('statut', 'envoye');
        await marquer(admin, ((restants as any[]) ?? []).map((t) => t.id), { statut: 'echec', fini_le: new Date().toISOString() });
      }
      continue;
    }

    const { data: lignes } = await admin
      .schema('famille')
      .from('ia_travaux')
      .select('id, nature, foyer_id, utilisateur_id, jour, entree')
      .eq('lot_id', lot.id)
      .eq('statut', 'envoye');
    const travaux = new Map(((lignes as Travail[]) ?? []).map((t) => [t.id, t]));

    for await (const r of await api.messages.batches.results(lot.anthropic_id)) {
      const t = travaux.get(r.custom_id);
      if (!t) continue;
      travaux.delete(r.custom_id);
      const fini = new Date().toISOString();
      if (r.result.type !== 'succeeded') {
        bilan.echecs++;
        await marquer(admin, [t.id], { statut: 'echec', fini_le: fini });
        continue;
      }
      const message: any = r.result.message;
      await enregistrerConsommation(admin, {
        foyerId: t.foyer_id,
        utilisateurId: t.utilisateur_id,
        fonction: t.nature,
        modele: message.model ?? MODELE_NUIT,
        consommation: consommationDe(message.usage),
        differe: true,
      });
      // Toujours lire stop_reason avant le contenu (refus, réponse coupée).
      const textes = ((message.content as any[]) ?? []).filter((b) => b.type === 'text');
      let sortie: any = null;
      if (message.stop_reason === 'end_turn') {
        try {
          sortie = (t.nature === 'resume-matin' ? FORMAT_RESUME : FORMAT_HABITUELS).parse(textes[textes.length - 1]?.text ?? '');
        } catch (e) {
          console.error('[ia-nuit] réponse hors schéma', t.id, e);
        }
      }
      if (!sortie) {
        bilan.echecs++;
        await marquer(admin, [t.id], { statut: 'echec', fini_le: fini });
        continue;
      }

      let erreur: string | null = null;
      if (t.nature === 'resume-matin' && t.utilisateur_id) {
        const phrases = phrasesAvecCibles(sortie, faitsValides(t.entree));
        const { error: e } = await admin
          .schema('famille')
          .from('resumes_matin')
          .upsert({ utilisateur_id: t.utilisateur_id, jour: t.jour, phrases, differe: true }, { onConflict: 'utilisateur_id,jour' });
        erreur = e?.message ?? null;
      } else if (t.nature === 'habituels') {
        const nouvelles = lignesPrevisions(sortie, historiqueValide(t.entree), t.foyer_id, t.jour);
        const { error: e1 } = await admin.schema('courses').from('previsions_ia').delete().eq('foyer_id', t.foyer_id);
        const { error: e2 } = nouvelles.length
          ? await admin.schema('courses').from('previsions_ia').insert(nouvelles)
          : { error: null };
        erreur = e1?.message ?? e2?.message ?? null;
      }
      if (erreur) {
        console.error('[ia-nuit] écriture', t.id, erreur);
        bilan.echecs++;
        await marquer(admin, [t.id], { statut: 'echec', sortie, fini_le: fini });
      } else {
        bilan.resultats++;
        await marquer(admin, [t.id], { statut: 'fait', sortie, fini_le: fini });
      }
    }

    // Travail sans résultat dans le lot : en échec.
    await marquer(admin, [...travaux.keys()], { statut: 'echec', fini_le: new Date().toISOString() });
    await admin.schema('famille').from('ia_lots').update({ statut: 'termine', termine_le: new Date().toISOString() }).eq('id', lot.id);
    bilan.lotsReleves++;
  }
}

// --- 2. Envoyer le travail en attente ----------------------------------------

async function envoyer(admin: SupabaseClient<any, any, any>, bilan: Bilan) {
  const depuis = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const { data, error } = await admin
    .schema('famille')
    .from('ia_travaux')
    .select('id, nature, foyer_id, utilisateur_id, jour, entree')
    .eq('statut', 'a_envoyer')
    .gte('cree_le', depuis)
    .limit(5000);
  if (error) throw error;
  let travaux = (data as Travail[]) ?? [];
  if (!travaux.length) return;

  // Un résumé préparé pour un autre jour ne sert plus à rien : on ne
  // l'envoie pas.
  const jour = jourParis();
  const perimes = travaux.filter((t) => t.nature === 'resume-matin' && t.jour !== jour).map((t) => t.id);
  if (perimes.length) await marquer(admin, perimes, { statut: 'echec', fini_le: new Date().toISOString() });
  travaux = travaux.filter((t) => !perimes.includes(t.id));
  if (!travaux.length) return;

  // Plafond du foyer (§ 3.3) : rien n'est envoyé pour un foyer en pause.
  const plafonnes = new Set<string>();
  for (const foyer of new Set(travaux.map((t) => t.foyer_id))) {
    const { data: etat } = await admin.schema('famille').rpc('ia_etat_foyer', { id_foyer: foyer });
    const ligne = (etat as any[])?.[0];
    if (ligne && Number(ligne.utilise_usd) >= Number(ligne.plafond_usd)) plafonnes.add(foyer);
  }
  const auPlafond = travaux.filter((t) => plafonnes.has(t.foyer_id)).map((t) => t.id);
  if (auPlafond.length) {
    await marquer(admin, auPlafond, { statut: 'plafond', fini_le: new Date().toISOString() });
    bilan.plafond += auPlafond.length;
  }
  travaux = travaux.filter((t) => !plafonnes.has(t.foyer_id));
  if (!travaux.length) return;

  // On « réserve » le travail avant l'envoi : deux appels simultanés
  // n'enverront pas deux fois la même chose.
  const reserves = new Set<string>();
  for (let i = 0; i < travaux.length; i += 200) {
    const { data: lus } = await admin
      .schema('famille')
      .from('ia_travaux')
      .update({ statut: 'envoye' })
      .in('id', travaux.slice(i, i + 200).map((t) => t.id))
      .eq('statut', 'a_envoyer')
      .select('id');
    ((lus as any[]) ?? []).forEach((l) => reserves.add(l.id));
  }
  travaux = travaux.filter((t) => reserves.has(t.id));
  if (!travaux.length) return;

  try {
    const lotApi = await clientAnthropic().messages.batches.create({
      requests: travaux.map((t) => ({ custom_id: t.id, params: parametres(t) })),
    });
    const { data: lot, error: erreurLot } = await admin
      .schema('famille')
      .from('ia_lots')
      .insert({ anthropic_id: lotApi.id, nb_requetes: travaux.length })
      .select('id')
      .single();
    if (erreurLot) throw erreurLot;
    await marquer(admin, travaux.map((t) => t.id), { lot_id: (lot as any).id });
    bilan.envoyes += travaux.length;
    bilan.lot = lotApi.id;
  } catch (e) {
    // Rien n'est parti : le travail repart au prochain passage.
    await marquer(admin, travaux.map((t) => t.id), { statut: 'a_envoyer', lot_id: null });
    throw e;
  }
}

Deno.serve(async (_req: Request) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bilan: Bilan = { lotsReleves: 0, resultats: 0, echecs: 0, envoyes: 0, plafond: 0, lot: null };
  try {
    if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ erreur: 'Clé ANTHROPIC_API_KEY absente.' }, 500);
    await relever(admin, bilan);
    await envoyer(admin, bilan);
    console.log('[ia-nuit]', JSON.stringify(bilan));
    return json(bilan);
  } catch (e) {
    console.error('[ia-nuit]', e);
    return json({ erreur: e instanceof Error ? e.message : String(e), bilan }, 500);
  }
});
