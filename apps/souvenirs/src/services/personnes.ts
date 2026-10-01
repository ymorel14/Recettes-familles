import { supabase, schemaFamille } from './supabase';

// Personnes de la famille (schéma "famille", commun aux apps) : membres avec
// compte et personnes sans compte (enfants, bébés) gérées par leur foyer.
// Même logique que dans CadeauCommun.

export type Personne = {
  id: string;
  utilisateur_id: string | null;
  foyer_id: string | null;
  // Nom à afficher : le prénom, ou à défaut "Quelqu’un de <foyer>" (jamais vide).
  prenom: string;
  // Faux quand la personne n'a pas encore saisi son prénom.
  prenom_renseigne: boolean;
  foyer_nom: string | null;
  date_naissance: string | null;
  gere_par: string | null;
};

const SELECTION_PERSONNE = 'id, utilisateur_id, foyer_id, prenom, date_naissance, gere_par, foyer:foyers(nom)';

function versPersonne(ligne: any): Personne {
  const prenom = (ligne.prenom ?? '').trim();
  const foyerNom = ligne.foyer?.nom ?? null;
  return {
    id: ligne.id,
    utilisateur_id: ligne.utilisateur_id,
    foyer_id: ligne.foyer_id,
    prenom: prenom || (foyerNom ? `Quelqu’un de ${foyerNom}` : 'Sans prénom'),
    prenom_renseigne: prenom.length > 0,
    foyer_nom: foyerNom,
    date_naissance: ligne.date_naissance,
    gere_par: ligne.gere_par,
  };
}

export async function listerPersonnes(foyers: string[]): Promise<Personne[]> {
  if (foyers.length === 0) return [];
  const { data, error } = await schemaFamille()
    .from('personnes')
    .select(SELECTION_PERSONNE)
    .in('foyer_id', foyers)
    .order('prenom');
  if (error) throw error;
  return (data ?? []).map(versPersonne);
}

// Personnes par identifiant (invités d'un voyage, qui peuvent venir d'autres
// foyers de la famille).
export async function listerPersonnesParIds(ids: string[]): Promise<Personne[]> {
  if (ids.length === 0) return [];
  const { data, error } = await schemaFamille().from('personnes').select(SELECTION_PERSONNE).in('id', ids);
  if (error) throw error;
  return (data ?? []).map(versPersonne);
}

// Âge en années révolues à une date "AAAA-MM-JJ" (null si naissance inconnue).
export function ageA(dateNaissance: string | null, dateIso: string): number | null {
  if (!dateNaissance) return null;
  const [an, mn, jn] = dateNaissance.split('-').map(Number);
  const [a, m, j] = dateIso.split('-').map(Number);
  let age = a - an;
  if (m < mn || (m === mn && j < jn)) age -= 1;
  return age;
}

// Personne sans compte (bébé, enfant, grand-parent) dans son foyer.
export async function ajouterPersonneSansCompte(
  foyerId: string,
  prenom: string,
  dateNaissance: string | null
): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const { error } = await schemaFamille()
    .from('personnes')
    .insert({
      foyer_id: foyerId,
      prenom: prenom.trim(),
      date_naissance: dateNaissance,
      gere_par: session.session?.user.id ?? null,
    });
  if (error) throw error;
}

// Retire une personne sans compte de son foyer (fiche créée par erreur, en
// double…). Ses disponibilités et participations sont supprimées avec elle.
export async function supprimerPersonne(id: string): Promise<void> {
  const { error } = await schemaFamille().from('personnes').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Dates (format "AAAA-MM-JJ" de la base)
// ---------------------------------------------------------------------------

export const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

// "2027-08-07" → "7 août 2027"
export function formaterDate(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number);
  if (!a || !m || !j) return iso;
  return `${j} ${MOIS[m - 1]} ${a}`;
}

// "2027-08-07", "2027-08-14" → "du 7 au 14 août 2027"
export function formaterPlage(debut: string, fin: string): string {
  const [a1, m1, j1] = debut.split('-').map(Number);
  const [a2, m2, j2] = fin.split('-').map(Number);
  if (a1 === a2 && m1 === m2) return `du ${j1} au ${j2} ${MOIS[m2 - 1]} ${a2}`;
  if (a1 === a2) return `du ${j1} ${MOIS[m1 - 1]} au ${j2} ${MOIS[m2 - 1]} ${a2}`;
  return `du ${formaterDate(debut)} au ${formaterDate(fin)}`;
}

// "25/12/2026" → "2026-12-25" (null si invalide)
export function lireDateSaisie(texte: string): string | null {
  const m = texte.trim().match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!m) return null;
  const j = Number(m[1]);
  const mo = Number(m[2]);
  const a = Number(m[3]);
  const d = new Date(a, mo - 1, j);
  if (d.getFullYear() !== a || d.getMonth() !== mo - 1 || d.getDate() !== j) return null;
  return `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}

// Jours restants avant la date (0 = aujourd'hui, négatif = passé).
export function joursAvant(iso: string): number {
  const [a, m, j] = iso.split('-').map(Number);
  const cible = new Date(a, m - 1, j).getTime();
  const aujourdHui = new Date();
  const debut = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), aujourdHui.getDate()).getTime();
  return Math.round((cible - debut) / 86400000);
}
