import { clientPourSchema } from './supabase';
import { appelerAssistant } from './assistant';

// Brouillon de voyage (spécification § 4.5.1) : « Organise-nous un week-end
// en Bretagne en novembre ». L'assistant (route voyage-brouillon, recherche
// web) propose dates, hébergements (liens réels), activités, programme et
// budget. L'organisateur coche ce qu'il garde ; à la création du voyage,
// chaque élément devient une proposition ORDINAIRE (sondage de dates,
// hébergement, activité) créée par les règles existantes, que la famille
// vote comme les autres, avec la mention « Proposé par l'assistant »
// (table voyage.proposes_assistant).

export type DatesProposees = { debut: string; fin: string; raison: string | null };
export type HebergementPropose = {
  nom: string;
  type: string;
  lien: string;
  ville: string | null;
  capacite: number | null;
  nb_chambres: number | null;
  prix_total: number | null;
  prix_nuit: number | null;
  description: string | null;
};
export type ActiviteProposee = {
  titre: string;
  categorie: string;
  description: string | null;
  lien: string | null;
  prix_adulte: number | null;
  prix_enfant: number | null;
};

export type BrouillonVoyage = {
  titre: string;
  destination: string | null;
  pays: string | null;
  type_sejour: string;
  periode: string;
  annee: number | null;
  nb_nuits: number | null;
  dates: DatesProposees[];
  hebergements: HebergementPropose[];
  activites: ActiviteProposee[];
  programme: string[];
  budget: { min: number | null; max: number | null; detail: string | null };
  question: string | null;
  ecartes: { dates: number; hebergements: number };
};

export function demanderBrouillon(demande: string, personnes: string[], signal?: AbortSignal): Promise<BrouillonVoyage> {
  return appelerAssistant<BrouillonVoyage>(
    'voyage-brouillon',
    { demande, ...(personnes.length ? { personnes } : {}) },
    { signal, delaiMs: 150000 }
  );
}

// « Programme indicatif » et « Budget estimé », pour le mot aux invités.
export function texteProgrammeEtBudget(b: BrouillonVoyage): string {
  const morceaux: string[] = [];
  if (b.programme.length) morceaux.push(`Programme indicatif :\n${b.programme.map((l) => `• ${l}`).join('\n')}`);
  const { min, max, detail } = b.budget;
  if (min != null || max != null) {
    const fourchette =
      min != null && max != null && min !== max ? `entre ${min} et ${max} €` : `environ ${max ?? min} €`;
    morceaux.push(`Budget estimé pour le groupe : ${fourchette}${detail ? ` (${detail})` : ''}.`);
  }
  return morceaux.length ? `✦ Proposé par l’assistant\n${morceaux.join('\n\n')}` : '';
}

// Crée les propositions retenues dans le voyage tout juste créé et les
// marque « Proposé par l'assistant ». Une proposition refusée par la base
// (dates déjà proposées…) n'empêche pas les autres. Renvoie le nombre créé.
export async function creerPropositions(
  voyageId: string,
  choix: { dates: DatesProposees[]; hebergements: HebergementPropose[]; activites: ActiviteProposee[] }
): Promise<number> {
  const voyage = clientPourSchema('voyage');
  const marques: { objet_id: string; voyage_id: string; nature: string }[] = [];

  for (const d of choix.dates) {
    const { data } = await voyage
      .from('propositions_dates')
      .insert({ voyage_id: voyageId, date_debut: d.debut, date_fin: d.fin })
      .select('id')
      .single();
    if (data) marques.push({ objet_id: (data as any).id, voyage_id: voyageId, nature: 'dates' });
  }
  for (const h of choix.hebergements) {
    const { data } = await voyage
      .from('hebergements')
      .insert({
        voyage_id: voyageId,
        nom: h.nom,
        type: h.type,
        lien: h.lien,
        ville: h.ville,
        capacite: h.capacite,
        nb_chambres: h.nb_chambres,
        prix_total: h.prix_total,
        prix_nuit: h.prix_total != null ? null : h.prix_nuit,
        description: h.description,
      })
      .select('id')
      .single();
    if (data) marques.push({ objet_id: (data as any).id, voyage_id: voyageId, nature: 'hebergement' });
  }
  for (const a of choix.activites) {
    const { data } = await voyage
      .from('activites')
      .insert({
        voyage_id: voyageId,
        titre: a.titre,
        categorie: a.categorie,
        description: a.description,
        lien: a.lien,
        prix_adulte: a.prix_adulte,
        prix_enfant: a.prix_enfant,
      })
      .select('id')
      .single();
    if (data) marques.push({ objet_id: (data as any).id, voyage_id: voyageId, nature: 'activite' });
  }
  if (marques.length) await voyage.from('proposes_assistant').insert(marques);
  return marques.length;
}

// Identifiants des propositions faites par l'assistant dans ce voyage
// (vide sans la migration 20261021110000_voyage_propositions_assistant.sql).
export async function proposesParAssistant(voyageId: string): Promise<Set<string>> {
  const { data, error } = await clientPourSchema('voyage').from('proposes_assistant').select('objet_id').eq('voyage_id', voyageId);
  if (error) return new Set();
  return new Set(((data ?? []) as any[]).map((d) => d.objet_id as string));
}
