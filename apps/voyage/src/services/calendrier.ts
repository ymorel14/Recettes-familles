import { supabase } from './supabase';

// Calendrier commun des disponibilités (table voyage.disponibilites). La
// lecture passe par la fonction voyage.calendrier(), qui masque le motif
// d'une période privée à tous sauf à la personne concernée (et à son foyer
// pour un enfant sans compte).

export type EtatDispo = 'disponible' | 'peut_etre' | 'indisponible';

export type PeriodeDispo = {
  id: string;
  personne_id: string;
  prenom: string;
  foyer_id: string | null;
  date_debut: string;
  date_fin: string;
  etat: EtatDispo;
  motif: string | null;
  prive: boolean;
  modifiable: boolean;
};

export const ETATS: { id: EtatDispo; libelle: string }[] = [
  { id: 'disponible', libelle: 'Disponible' },
  { id: 'peut_etre', libelle: 'Peut-être' },
  { id: 'indisponible', libelle: 'Indisponible' },
];

export async function lireCalendrier(debut: string, fin: string, familleId: string): Promise<PeriodeDispo[]> {
  const { data, error } = await supabase.rpc('calendrier', { debut, fin, id_famille: familleId });
  if (error) throw error;
  return (data ?? []) as PeriodeDispo[];
}

export type FormulaireDispo = {
  personne_id: string;
  date_debut: string;
  date_fin: string;
  etat: EtatDispo;
  motif: string | null;
  prive: boolean;
};

export async function ajouterDispo(f: FormulaireDispo): Promise<void> {
  const { error } = await supabase.from('disponibilites').insert(f);
  if (error) throw error;
}

export async function modifierDispo(id: string, f: FormulaireDispo): Promise<void> {
  const { error } = await supabase.from('disponibilites').update(f).eq('id', id);
  if (error) throw error;
}

export async function supprimerDispo(id: string): Promise<void> {
  const { error } = await supabase.from('disponibilites').delete().eq('id', id);
  if (error) throw error;
}

// "AAAA-MM-JJ" d'une date locale.
export function versIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// État dominant d'une journée pour une personne, parmi ses périodes : une
// indisponibilité l'emporte sur un peut-être, qui l'emporte sur un disponible.
export function etatDuJour(periodes: PeriodeDispo[], personneId: string, jourIso: string): EtatDispo | null {
  let resultat: EtatDispo | null = null;
  for (const p of periodes) {
    if (p.personne_id !== personneId || jourIso < p.date_debut || jourIso > p.date_fin) continue;
    if (p.etat === 'indisponible') return 'indisponible';
    if (p.etat === 'peut_etre') resultat = 'peut_etre';
    else if (resultat === null) resultat = 'disponible';
  }
  return resultat;
}
