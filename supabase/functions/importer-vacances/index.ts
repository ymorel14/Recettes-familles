// Fonction Edge Supabase : importer le calendrier officiel des vacances
// scolaires (zones A, B, C et Corse) dans quotidien.vacances_scolaires,
// pour que l'app Quotidien ne crée pas de séances pendant les vacances.
//
// Source : API ouverte de l'Éducation nationale (jeu de données
// « fr-en-calendrier-scolaire », data.education.gouv.fr). Importe l'année
// scolaire en cours et la suivante ; relancer sans risque (mise à jour).
//
// Période retenue : du jour où les cours s'arrêtent au jour qui précède la
// reprise (dates de Paris).
//
// Déploiement (une fois) : supabase functions deploy importer-vacances
// Lancement : une fois par an (ou dès qu'un nouveau calendrier paraît),
// depuis Dashboard > Edge Functions > importer-vacances > « Test », ou par
// l'app connectée (POST avec la session). SUPABASE_URL et
// SUPABASE_SERVICE_ROLE_KEY sont fournies automatiquement par Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';

const API =
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Ligne = { zone: 'A' | 'B' | 'C' | 'Corse'; libelle: string; debut: string; fin: string };

// "Zone A" → "A", "Corse" → "Corse", le reste (outre-mer…) ignoré.
function lireZone(texte: unknown): Ligne['zone'] | null {
  const t = String(texte ?? '').trim();
  const m = t.match(/^Zone\s+([ABC])$/i);
  if (m) return m[1].toUpperCase() as Ligne['zone'];
  return /^corse$/i.test(t) ? 'Corse' : null;
}

// Date ISO de l'API (minuit de Paris en UTC) → "AAAA-MM-JJ" à Paris.
function dateParis(iso: string, decalageJours = 0): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + decalageJours);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

function anneesScolaires(): string[] {
  const auj = new Date();
  const debut = auj.getMonth() >= 7 ? auj.getFullYear() : auj.getFullYear() - 1;
  return [`${debut}-${debut + 1}`, `${debut + 1}-${debut + 2}`];
}

async function lireAnnee(annee: string): Promise<Ligne[]> {
  const lignes: Ligne[] = [];
  for (let decalage = 0; decalage < 1000; decalage += 100) {
    const url = `${API}?where=${encodeURIComponent(`annee_scolaire="${annee}"`)}&limit=100&offset=${decalage}`;
    const reponse = await fetch(url);
    if (!reponse.ok) throw new Error(`API Éducation nationale : ${reponse.status}`);
    const json = await reponse.json();
    const resultats: any[] = json.results ?? [];
    for (const r of resultats) {
      // Les dates « Enseignants » (pré-rentrée) ne concernent pas les élèves.
      if (/enseignant/i.test(String(r.population ?? ''))) continue;
      const zone = lireZone(r.zones);
      if (!zone || !r.start_date || !r.end_date) continue;
      const debut = dateParis(r.start_date);
      const fin = dateParis(r.end_date, -1);
      if (fin < debut) continue;
      lignes.push({ zone, libelle: String(r.description ?? 'Vacances'), debut, fin });
    }
    if (resultats.length < 100) break;
  }
  // Une ligne par académie : on garde une seule période par zone et par date de début.
  const uniques = new Map<string, Ligne>();
  for (const l of lignes) {
    const cle = `${l.zone}|${l.debut}`;
    const deja = uniques.get(cle);
    if (!deja || l.fin > deja.fin) uniques.set(cle, l);
  }
  return [...uniques.values()];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'quotidien' },
    });
    const annees = anneesScolaires();
    const lignes = (await Promise.all(annees.map(lireAnnee))).flat();
    if (lignes.length) {
      const { error } = await admin.from('vacances_scolaires').upsert(lignes, { onConflict: 'zone,debut' });
      if (error) throw error;
    }
    return new Response(JSON.stringify({ annees, periodes: lignes.length }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[importer-vacances]', e);
    return new Response(JSON.stringify({ erreur: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
