import { clientPourSchema } from './supabase';

// Planning lu par l'assistant (route ia/planning-photo, même forme que
// supabase/functions/ia/routes/planning-photo.ts) et création des séances
// datées une fois que la personne a validé (spécification § 4.3.1).

export type ActiviteLue = {
  nom: string;
  jour: number; // 1 = lundi … 7 = dimanche
  heure_debut: string; // HH:MM
  heure_fin: string | null;
  lieu: string | null;
  date_debut: string | null; // AAAA-MM-JJ
  date_fin: string | null;
};

export type SeanceLue = {
  date: string;
  heure_debut: string | null;
  heure_fin: string | null;
  lieu: string | null;
  adversaire: string | null;
  domicile: boolean | null;
  a_verifier: boolean;
};

export type PlanningLu = {
  titre: string | null;
  activites: ActiviteLue[];
  seances: SeanceLue[];
  a_verifier: string[];
  question: string | null;
};

// « 14:00 » + 2 h → « 16:00 » (sans dépasser 23:59).
export function ajouterHeures(heure: string, heures: number): string {
  const [h, m] = heure.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + heures * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function jourIso(date: string): number {
  const [a, m, j] = date.split('-').map(Number);
  const d = new Date(a, m - 1, j).getDay(); // 0 = dimanche
  return d === 0 ? 7 : d;
}

export type SeanceAAjouter = { date: string; heure_debut: string; heure_fin: string; lieu: string | null; note: string | null };

// Crée une activité « à dates précises » (matchs, tournois) et ses séances :
// les trajets aller et retour de chaque séance sont créés par la base,
// comme pour une activité de chaque semaine. Renvoie le nombre de séances.
export async function creerSeancesDatees(groupeId: string, nom: string, seances: SeanceAAjouter[]): Promise<number> {
  const parDate = new Map<string, SeanceAAjouter>();
  for (const s of [...seances].sort((a, b) => a.date.localeCompare(b.date))) if (!parDate.has(s.date)) parDate.set(s.date, s);
  const liste = [...parDate.values()];
  if (!liste.length) return 0;
  const lieux = new Set(liste.map((s) => s.lieu ?? ''));
  const q = clientPourSchema('quotidien');
  const { data, error } = await q
    .from('activites')
    .insert({
      groupe_id: groupeId,
      nom: nom.trim(),
      lieu: lieux.size === 1 ? liste[0].lieu : null,
      jour_semaine: jourIso(liste[0].date),
      heure_debut: liste[0].heure_debut,
      heure_fin: liste[0].heure_fin,
      date_debut: liste[0].date,
      date_fin: liste[liste.length - 1].date,
    })
    .select('id')
    .single();
  if (error) throw error;
  const { error: e2 } = await q.from('seances').insert(
    liste.map((s) => ({ activite_id: data.id, date: s.date, heure_debut: s.heure_debut, heure_fin: s.heure_fin, lieu: s.lieu, note: s.note }))
  );
  if (e2) {
    await q.from('activites').delete().eq('id', data.id);
    throw e2;
  }
  return liste.length;
}
