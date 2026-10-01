import { supabase } from './supabase';
import { versIso, type EtatDispo } from './calendrier';
import type { Periode } from './voyage';

// Sondage de dates d'un voyage (tables voyage.propositions_dates et
// voyage.votes_dates) et suggestions de créneaux tirées du calendrier commun.

export type ReponseVote = 'oui' | 'si_besoin' | 'non';

export type Vote = { proposition_id: string; personne_id: string; reponse: ReponseVote };

export type PropositionDates = {
  id: string;
  voyage_id: string;
  date_debut: string;
  date_fin: string;
  propose_par: string;
  votes: Vote[];
};

export const REPONSES_VOTE: { id: ReponseVote; libelle: string }[] = [
  { id: 'oui', libelle: 'Oui' },
  { id: 'si_besoin', libelle: 'Si besoin' },
  { id: 'non', libelle: 'Non' },
];

export async function listerPropositions(voyageId: string): Promise<PropositionDates[]> {
  const { data, error } = await supabase
    .from('propositions_dates')
    .select('id, voyage_id, date_debut, date_fin, propose_par, votes:votes_dates(proposition_id, personne_id, reponse)')
    .eq('voyage_id', voyageId)
    .order('date_debut');
  if (error) throw error;
  return (data ?? []) as PropositionDates[];
}

export async function proposerDates(voyageId: string, debut: string, fin: string): Promise<void> {
  const { error } = await supabase.from('propositions_dates').insert({ voyage_id: voyageId, date_debut: debut, date_fin: fin });
  if (error) {
    if ((error as any).code === '23505') throw new Error('Ces dates sont déjà proposées.');
    throw error;
  }
}

export async function retirerProposition(id: string): Promise<void> {
  const { error } = await supabase.from('propositions_dates').delete().eq('id', id);
  if (error) throw error;
}

export async function voter(propositionId: string, personneId: string, reponse: ReponseVote): Promise<void> {
  const { error } = await supabase
    .from('votes_dates')
    .upsert({ proposition_id: propositionId, personne_id: personneId, reponse, maj_le: new Date().toISOString() }, {
      onConflict: 'proposition_id,personne_id',
    });
  if (error) throw error;
}

// Retenir une proposition : fixe les dates du voyage (réservé aux organisateurs).
export async function validerDates(propositionId: string): Promise<void> {
  const { error } = await supabase.rpc('valider_dates', { id_proposition: propositionId });
  if (error) throw error;
}

export type DispoParticipant = {
  personne_id: string;
  prenom: string;
  date_debut: string;
  date_fin: string;
  etat: EtatDispo;
  motif: string | null;
};

export async function disponibilitesParticipants(voyageId: string, debut: string, fin: string): Promise<DispoParticipant[]> {
  const { data, error } = await supabase.rpc('disponibilites_participants', { id_voyage: voyageId, debut, fin });
  if (error) throw error;
  return (data ?? []) as DispoParticipant[];
}

// ---------------------------------------------------------------------------
// Suggestions de créneaux
// ---------------------------------------------------------------------------

function jour(a: number, m: number, j: number): Date {
  return new Date(a, m - 1, j);
}

function ajouterJours(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// Fenêtre de recherche d'une période ("été 2027" → 1er juillet – 31 août).
export function fenetrePeriode(periode: Periode, annee: number | null, aujourdHui = new Date()): { debut: Date; fin: Date } {
  const a = annee ?? aujourdHui.getFullYear();
  const fenetres: Record<Periode, [Date, Date]> = {
    printemps: [jour(a, 3, 20), jour(a, 6, 20)],
    ete: [jour(a, 7, 1), jour(a, 8, 31)],
    automne: [jour(a, 9, 22), jour(a, 12, 15)],
    toussaint: [jour(a, 10, 15), jour(a, 11, 8)],
    noel: [jour(a, 12, 18), jour(a + 1, 1, 4)],
    hiver: [jour(a, 1, 5), jour(a, 3, 15)],
    autre: [aujourdHui, ajouterJours(aujourdHui, 180)],
  };
  const [debut, fin] = fenetres[periode];
  // Jamais dans le passé.
  const demain = ajouterJours(new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), aujourdHui.getDate()), 1);
  return { debut: debut < demain ? demain : debut, fin };
}

export type Suggestion = {
  date_debut: string;
  date_fin: string;
  libres: number; // personnes sans aucune indisponibilité sur le créneau
  total: number;
  indisponibles: string[]; // prénoms
  incertains: string[]; // prénoms avec un "peut-être"
};

// Meilleurs créneaux de `nuits` nuits dans la fenêtre : le plus de personnes
// libres, puis le moins de "peut-être", puis le plus tôt. Les week-ends de
// 1 à 3 nuits partent un vendredi ou un samedi ; les créneaux retenus ne se
// chevauchent pas.
export function suggererCreneaux(
  personnes: { id: string; prenom: string }[],
  dispos: DispoParticipant[],
  fenetre: { debut: Date; fin: Date },
  nuits: number,
  combien = 3
): Suggestion[] {
  // nuits = 0 : un repas, sur une seule journée (tous les jours sont
  // candidats, les week-ends passent devant à égalité).
  const n = Math.max(0, nuits);
  const candidats: Suggestion[] = [];
  const weekEnd = n >= 1 && n <= 3;
  for (let d = fenetre.debut; ajouterJours(d, n) <= fenetre.fin; d = ajouterJours(d, 1)) {
    if (weekEnd && d.getDay() !== 5 && d.getDay() !== 6) continue;
    const debutIso = versIso(d);
    const finIso = versIso(ajouterJours(d, n));
    const indisponibles: string[] = [];
    const incertains: string[] = [];
    for (const p of personnes) {
      const siennes = dispos.filter((x) => x.personne_id === p.id && x.date_fin >= debutIso && x.date_debut <= finIso);
      if (siennes.some((x) => x.etat === 'indisponible')) indisponibles.push(p.prenom);
      else if (siennes.some((x) => x.etat === 'peut_etre')) incertains.push(p.prenom);
    }
    candidats.push({
      date_debut: debutIso,
      date_fin: finIso,
      libres: personnes.length - indisponibles.length,
      total: personnes.length,
      indisponibles,
      incertains,
    });
  }
  const finDeSemaine = (iso: string) => {
    const j = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))).getDay();
    return j === 0 || j === 6 ? 0 : 1;
  };
  candidats.sort(
    (a, b) =>
      b.libres - a.libres ||
      a.incertains.length - b.incertains.length ||
      (n === 0 ? finDeSemaine(a.date_debut) - finDeSemaine(b.date_debut) : 0) ||
      a.date_debut.localeCompare(b.date_debut)
  );
  const retenus: Suggestion[] = [];
  for (const c of candidats) {
    if (retenus.length >= combien) break;
    if (retenus.some((r) => c.date_debut <= r.date_fin && c.date_fin >= r.date_debut)) continue;
    retenus.push(c);
  }
  return retenus.sort((a, b) => a.date_debut.localeCompare(b.date_debut));
}
