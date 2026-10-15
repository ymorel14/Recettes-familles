import { supabase } from './supabase';

// Tâches de la maison et argent de poche virtuel (schéma "quotidien",
// supabase/migrations/20261008110000_quotidien_taches_argent.sql).
// Tout reste dans le foyer : la base ne montre ces données qu'à ses membres.
// Argent de poche en POINTS, affiché avec l'équivalent en euros entre
// parenthèses ; aucun argent réel.

export type Recurrence = 'aucune' | 'quotidienne' | 'hebdomadaire';

export type Tache = {
  id: string;
  libelle: string;
  points: number;
  recurrence: Recurrence;
  jours: number[]; // 1 = lundi … 7 = dimanche
  personnes: string[]; // famille.personnes, à tour de rôle ; vide = « qui veut »
  date_debut: string;
  active: boolean;
};

export type TacheDuJour = {
  id: string;
  libelle: string;
  points: number;
  recurrence: Recurrence;
  pour: string | null;
  pour_prenom: string | null;
  candidats: string[];
  realisation: { id: string; etat: 'faite' | 'validee'; personne_id: string | null; prenom: string | null } | null;
};

export type Tirelire = {
  personne_id: string;
  hebdomadaire: number;
  jour_versement: number;
  objectif_libelle: string | null;
  objectif_points: number | null;
};

export type Mouvement = {
  id: string;
  personne_id: string;
  points: number;
  libelle: string;
  origine: 'tache' | 'hebdo' | 'depense' | 'bonus';
  cree_le: string;
};

// ---------------------------------------------------------------------------
// Points et euros
// ---------------------------------------------------------------------------

export function formaterEuros(montant: number): string {
  return `${montant.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

// « 235 points (23,50 €) » ; avec signe : « +20 points (2,00 €) », « −45 points (4,50 €) ».
export function formaterPoints(points: number, parEuro: number, signe = false): string {
  const n = Math.abs(points);
  const prefixe = signe ? (points > 0 ? '+' : points < 0 ? '−' : '') : points < 0 ? '−' : '';
  return `${prefixe}${n.toLocaleString('fr-FR')} ${n <= 1 ? 'point' : 'points'} (${formaterEuros(n / parEuro)})`;
}

// "4,50" (euros) → points selon le taux du foyer (null si invalide).
export function eurosEnPoints(texte: string, parEuro: number): number | null {
  const v = Number(texte.trim().replace(',', '.').replace(/\s|€/g, ''));
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * parEuro);
}

export async function pointsParEuro(): Promise<number> {
  const { data, error } = await supabase.rpc('points_par_euro');
  if (error) throw error;
  return Number(data) || 10;
}

export async function definirPointsParEuro(n: number): Promise<void> {
  const { error } = await supabase.rpc('definir_points_par_euro', { n });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Tâches
// ---------------------------------------------------------------------------

export async function tachesDuJour(jour: string): Promise<TacheDuJour[]> {
  const { data, error } = await supabase.rpc('taches_du_jour', { jour });
  if (error) throw error;
  return (data as TacheDuJour[]) ?? [];
}

export async function listerTaches(): Promise<Tache[]> {
  const { data, error } = await supabase
    .from('taches')
    .select('id, libelle, points, recurrence, jours, personnes, date_debut, active')
    .order('libelle');
  if (error) throw error;
  return (data as Tache[]) ?? [];
}

export type TacheSaisie = Pick<Tache, 'libelle' | 'points' | 'recurrence' | 'jours' | 'personnes'>;

export async function creerTache(foyerId: string, t: TacheSaisie): Promise<void> {
  const { error } = await supabase.from('taches').insert({ ...t, foyer_id: foyerId, libelle: t.libelle.trim() });
  if (error) throw error;
}

export async function modifierTache(id: string, t: Partial<TacheSaisie> & { active?: boolean }): Promise<void> {
  const { error } = await supabase.from('taches').update(t).eq('id', id);
  if (error) throw error;
}

export async function supprimerTache(id: string): Promise<void> {
  const { error } = await supabase.from('taches').delete().eq('id', id);
  if (error) throw error;
}

export async function marquerFaite(idTache: string, jour: string, idPersonne: string): Promise<void> {
  const { error } = await supabase.rpc('marquer_faite', { id_tache: idTache, jour, id_personne: idPersonne });
  if (error) throw error;
}

export async function annulerRealisation(id: string): Promise<void> {
  const { error } = await supabase.rpc('annuler_realisation', { id_realisation: id });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Tirelires
// ---------------------------------------------------------------------------

export async function verserArgentDePoche(): Promise<number> {
  const { data, error } = await supabase.rpc('verser_argent_de_poche');
  if (error) throw error;
  return Number(data) || 0;
}

export async function listerTirelires(): Promise<Tirelire[]> {
  const { data, error } = await supabase
    .from('tirelires')
    .select('personne_id, hebdomadaire, jour_versement, objectif_libelle, objectif_points');
  if (error) throw error;
  return (data as Tirelire[]) ?? [];
}

export async function definirTirelire(
  idPersonne: string,
  r: { hebdomadaire: number; jour: number; objectif: string | null; objectifPoints: number | null }
): Promise<void> {
  const { error } = await supabase.rpc('definir_tirelire', {
    id_personne: idPersonne,
    points_semaine: r.hebdomadaire,
    jour: r.jour,
    objectif: r.objectif,
    points_objectif: r.objectifPoints,
  });
  if (error) throw error;
}

// Soldes par personne (en points).
export async function soldes(): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('soldes');
  if (error) throw error;
  const m = new Map<string, number>();
  ((data as any[]) ?? []).forEach((l) => m.set(l.personne_id, Number(l.solde)));
  return m;
}

export async function listerMouvements(idPersonne: string, nombre = 30): Promise<Mouvement[]> {
  const { data, error } = await supabase
    .from('mouvements')
    .select('id, personne_id, points, libelle, origine, cree_le')
    .eq('personne_id', idPersonne)
    .order('cree_le', { ascending: false })
    .limit(nombre);
  if (error) throw error;
  return (data as Mouvement[]) ?? [];
}

// Dépense (points négatifs) ou bonus (positifs).
export async function ajouterMouvement(idPersonne: string, points: number, libelle: string): Promise<void> {
  const { error } = await supabase.rpc('ajouter_mouvement', { id_personne: idPersonne, nb_points: points, texte: libelle });
  if (error) throw error;
}

export async function retirerMouvement(id: string): Promise<void> {
  const { error } = await supabase.rpc('retirer_mouvement', { id_mouvement: id });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Validation par un parent
// ---------------------------------------------------------------------------

export async function validerRealisation(id: string): Promise<void> {
  const { error } = await supabase.rpc('valider_realisation', { id_realisation: id });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Espace enfant (lien personnel, sans compte)
// ---------------------------------------------------------------------------

export async function creerAccesEnfant(idPersonne: string): Promise<string> {
  const { data, error } = await supabase.rpc('creer_acces_enfant', { id_personne: idPersonne });
  if (error) throw error;
  return data as string;
}

export async function lienAccesEnfant(idPersonne: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('lien_acces_enfant', { id_personne: idPersonne });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function retirerAccesEnfant(idPersonne: string): Promise<void> {
  const { error } = await supabase.rpc('retirer_acces_enfant', { id_personne: idPersonne });
  if (error) throw error;
}

export type VueEnfant = {
  prenom: string | null;
  points_par_euro: number;
  taches: TacheDuJour[];
  solde: number;
  hebdomadaire: number | null;
  objectif_libelle: string | null;
  objectif_points: number | null;
  mouvements: { id: string; points: number; libelle: string; cree_le: string }[];
};

export async function vueEnfant(jeton: string): Promise<VueEnfant> {
  const { data, error } = await supabase.rpc('vue_enfant', { jeton_enfant: jeton });
  if (error) throw error;
  const v = data as VueEnfant;
  return { ...v, solde: Number(v.solde) || 0 };
}

export async function marquerFaiteEnfant(jeton: string, idTache: string): Promise<void> {
  const { error } = await supabase.rpc('marquer_faite_enfant', { jeton_enfant: jeton, id_tache: idTache });
  if (error) throw error;
}

export async function annulerFaiteEnfant(jeton: string, idTache: string): Promise<void> {
  const { error } = await supabase.rpc('annuler_faite_enfant', { jeton_enfant: jeton, id_tache: idTache });
  if (error) throw error;
}
