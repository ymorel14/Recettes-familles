import { supabase } from './supabase';
import { formaterDate, MOIS } from './personnes';

// Tâches de la maison, tâches d'enfant et argent de poche virtuel (schéma
// "quotidien", migrations 20261008110000_quotidien_taches_argent.sql et, pour
// la refonte, 20261028100000_quotidien_taches_enfants.sql et
// 20261028110000_quotidien_semaine_bilans.sql).
// Tout reste dans le foyer : la base ne montre ces données qu'à ses membres.
// Argent de poche : l'unité interne est le CENTIME (« points » dans les
// colonnes), un montant fixe par semaine versé après le bilan du dimanche ;
// aucun argent réel. Les anciennes fonctions en points (formaterPoints,
// eurosEnPoints) restent pour les écrans pas encore refaits.

export type Recurrence = 'aucune' | 'quotidienne' | 'hebdomadaire' | 'annuelle';

// Place sur le calendrier (migration 20261019100000_quotidien_taches_calendrier) :
// sans date, à une date, sur une période, ou à faire avant une date.
export type Planif = 'libre' | 'le' | 'entre' | 'avant';

// Refonte Quotidien : une tâche est de la maison (adultes, rappels), obligatoire
// (jours précis, à chaque fois) ou un coup de main (N fois par semaine).
export type TypeTache = 'maison' | 'obligatoire' | 'coup_de_main';

export type Domaine = { id: string; nom: string; icone: string | null };

export type Tache = {
  id: string;
  // Foyer propriétaire. Une tâche peut être confiée à une personne d'un autre
  // foyer de la famille (migration 20261020120000) : ce foyer la voit et la
  // coche, mais ne la modifie pas.
  foyer_id?: string;
  libelle: string;
  points: number;
  recurrence: Recurrence;
  jours: number[]; // 1 = lundi … 7 = dimanche
  personnes: string[]; // famille.personnes, à tour de rôle ; vide = « qui veut »
  date_debut: string;
  active: boolean;
  domaine_id: string | null;
  planif: Planif;
  periode_debut: string | null;
  periode_fin: string | null;
  type: TypeTache;
  fois_par_semaine: number | null; // coup de main : 1 à 14
  max_un_par_jour: boolean;
  validation_parent: boolean;
  attribution: 'tour' | 'chacun'; // 'tour' : ancien « à tour de rôle »
  intervalle_annees: number; // avec recurrence 'annuelle' : revient tous les N ans
  rappel_jours: number | null; // prévenir 0, 1, 7 ou 30 jours avant ; null = jamais
};

export type TacheDuJour = {
  id: string;
  libelle: string;
  points: number;
  recurrence: Recurrence;
  type?: TypeTache;
  attribution?: 'tour' | 'chacun';
  intervalle_annees?: number;
  rappel_jours?: number | null;
  // Début de l'occurrence suivante (tâche qui revient), sinon null.
  suivante?: string | null;
  pour: string | null;
  pour_prenom: string | null;
  candidats: string[];
  domaine_id: string | null;
  domaine: string | null;
  domaine_icone: string | null;
  planif: Planif;
  // Occurrence en cours (tâche datée).
  debut: string | null;
  fin: string | null;
  en_retard: boolean;
  realisation: { id: string; etat: 'faite' | 'validee'; personne_id: string | null; prenom: string | null } | null;
  // Tâche d'un autre foyer confiée à une personne de mon foyer.
  foyer_id?: string;
  confiee?: boolean;
  foyer_nom?: string | null;
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

// Centimes → « 5,00 € » ; avec signe : « +5,00 € », « −2,50 € ».
export function formaterCentimes(centimes: number, signe = false): string {
  const prefixe = signe ? (centimes > 0 ? '+' : centimes < 0 ? '−' : '') : centimes < 0 ? '−' : '';
  return `${prefixe}${formaterEuros(Math.abs(centimes) / 100)}`;
}

// « 4,50 » ou « 4,5 € » → centimes (null si invalide ou nul).
export function eurosEnCentimes(texte: string): number | null {
  const v = Number(texte.trim().replace(',', '.').replace(/\s|€/g, ''));
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100);
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
  return Number(data) || 100;
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
    .select(
      'id, foyer_id, libelle, points, recurrence, jours, personnes, date_debut, active, domaine_id, planif, periode_debut, periode_fin, type, fois_par_semaine, max_un_par_jour, validation_parent, attribution, intervalle_annees, rappel_jours'
    )
    .order('libelle');
  if (error) throw error;
  return (data as Tache[]) ?? [];
}

export type TacheSaisie = Pick<
  Tache,
  'libelle' | 'points' | 'recurrence' | 'jours' | 'personnes' | 'domaine_id' | 'planif' | 'periode_debut' | 'periode_fin'
> &
  Partial<Pick<Tache, 'type' | 'fois_par_semaine' | 'max_un_par_jour' | 'validation_parent' | 'attribution' | 'date_debut' | 'intervalle_annees' | 'rappel_jours'>>;

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
// Calendrier des tâches datées
// ---------------------------------------------------------------------------

export type OccurrenceTache = {
  tache_id: string;
  libelle: string;
  points: number;
  recurrence: Recurrence;
  planif: Exclude<Planif, 'libre'>;
  debut: string;
  fin: string;
  domaine_id: string | null;
  domaine: string | null;
  domaine_icone: string | null;
  pour: string | null;
  candidats: string[];
  fait_le: string | null;
  fait_par: string | null;
  en_retard: boolean;
  intervalle_annees?: number;
  rappel_jours?: number | null;
  suivante?: string | null;
  foyer_id?: string;
  confiee?: boolean;
  foyer_nom?: string | null;
};

// Occurrences qui touchent [du, au], plus les tâches en retard.
export async function tachesCalendrier(du: string, au: string): Promise<OccurrenceTache[]> {
  const { data, error } = await supabase.rpc('taches_calendrier', { du, au });
  if (error) throw error;
  return (data as OccurrenceTache[]) ?? [];
}

// "2026-03-15" → "15 mars" (sans l'année, pour une tâche de chaque année).
function jourMois(iso: string): string {
  const [, m, j] = iso.split('-').map(Number);
  return `${j === 1 ? '1er' : j} ${MOIS[m - 1]}`;
}

// « Le 15 mars 2027 », « Du 1er au 15 avril », « Avant le 30 mai · chaque année »…
export function libellePlanif(t: {
  planif: Planif;
  recurrence: Recurrence;
  debut: string | null;
  fin: string | null;
  intervalle_annees?: number | null;
}): string {
  if (t.planif === 'libre' || !t.debut || !t.fin) return '';
  const annuelle = t.recurrence === 'annuelle';
  const date = (iso: string) => (annuelle ? jourMois(iso) : formaterDate(iso).replace(/^1 /, '1er '));
  let texte: string;
  if (t.planif === 'le') texte = `Le ${date(t.debut)}`;
  else if (t.planif === 'avant') texte = `Avant le ${date(t.fin)}`;
  else {
    const [a1, m1] = t.debut.split('-');
    const [a2, m2] = t.fin.split('-');
    const j1 = Number(t.debut.slice(8)) === 1 ? '1er' : String(Number(t.debut.slice(8)));
    texte =
      a1 === a2 && m1 === m2 ? `Du ${j1} au ${date(t.fin)}` : `Du ${date(t.debut)} au ${date(t.fin)}`;
  }
  if (!annuelle) return texte;
  const n = t.intervalle_annees ?? 1;
  return `${texte} · ${n > 1 ? `tous les ${n} ans` : 'chaque année'}`;
}

// ---------------------------------------------------------------------------
// Domaines (Potager, Entretien maison, Voiture…)
// ---------------------------------------------------------------------------

export const SUGGESTIONS_DOMAINES: { nom: string; icone: string }[] = [
  { nom: 'Potager', icone: 'leaf-outline' },
  { nom: 'Jardin', icone: 'flower-outline' },
  { nom: 'Entretien maison', icone: 'home-outline' },
  { nom: 'Ménage', icone: 'sparkles-outline' },
  { nom: 'Voiture', icone: 'car-outline' },
  { nom: 'Bricolage', icone: 'hammer-outline' },
  { nom: 'Papiers', icone: 'document-text-outline' },
  { nom: 'Animaux', icone: 'paw-outline' },
];

export const ICONE_DOMAINE_PAR_DEFAUT = 'pricetag-outline';

// Icône proposée d'après le nom (« potager » → feuille).
export function iconePourDomaine(nom: string): string {
  const n = nom.trim().toLowerCase();
  return SUGGESTIONS_DOMAINES.find((s) => s.nom.toLowerCase() === n)?.icone ?? ICONE_DOMAINE_PAR_DEFAUT;
}

export async function listerDomaines(): Promise<Domaine[]> {
  const { data, error } = await supabase.from('domaines').select('id, nom, icone').order('nom');
  if (error) throw error;
  return (data as Domaine[]) ?? [];
}

export async function creerDomaine(foyerId: string, nom: string, icone: string | null = null): Promise<Domaine> {
  const propre = nom.trim();
  const { data, error } = await supabase
    .from('domaines')
    .insert({ foyer_id: foyerId, nom: propre, icone: icone ?? iconePourDomaine(propre) })
    .select('id, nom, icone')
    .single();
  if (error) {
    if ((error as any).code === '23505') throw new Error(`Le domaine « ${propre} » existe déjà.`);
    throw error;
  }
  return data as Domaine;
}

export async function modifierDomaine(id: string, nom: string, icone: string | null): Promise<void> {
  const { error } = await supabase.from('domaines').update({ nom: nom.trim(), icone }).eq('id', id);
  if (error) {
    if ((error as any).code === '23505') throw new Error(`Le domaine « ${nom.trim()} » existe déjà.`);
    throw error;
  }
}

// Les tâches du domaine restent, sans domaine.
export async function supprimerDomaine(id: string): Promise<void> {
  const { error } = await supabase.from('domaines').delete().eq('id', id);
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
  solde: number; // centimes
  hebdomadaire: number | null;
  montant_semaine?: number; // centimes
  semaine?: SemaineEnfant;
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

// Un coup de main : « J'en ai fait un » (à valider si un parent doit valider).
export async function marquerAideEnfant(jeton: string, idTache: string): Promise<void> {
  const { error } = await supabase.rpc('marquer_aide_enfant', { jeton_enfant: jeton, id_tache: idTache });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Semaine d'un enfant et bilan du dimanche (refonte Quotidien § 4)
// ---------------------------------------------------------------------------

export type EtatJour = 'fait' | 'attente' | 'a_faire' | 'a_venir' | 'non_prevu' | 'oublie';

export type StatutSemaine = 'complete' | 'incomplete' | 'a_surveiller' | 'en_bonne_voie';

export type ObligatoireSemaine = {
  id: string;
  libelle: string;
  validation_parent: boolean;
  jours: { date: string; etat: EtatJour; realisation_id: string | null }[]; // lundi → dimanche
};

export type CoupDeMainSemaine = {
  id: string;
  libelle: string;
  n: number; // réalisations validées cette semaine
  total: number;
  en_attente: number;
  max_un_par_jour: boolean;
  fait_aujourdhui: boolean;
  validation_parent: boolean;
};

export type RealisationEnAttente = {
  realisation_id: string;
  tache_id: string;
  libelle: string;
  type: TypeTache;
  date: string;
  cree_le: string;
};

export type SemaineEnfant = {
  personne_id: string;
  prenom: string | null;
  lundi: string;
  dimanche: string;
  aujourdhui: string;
  montant: number; // centimes
  statut: StatutSemaine;
  complete: boolean;
  obligatoires: ObligatoireSemaine[];
  coups_de_main: CoupDeMainSemaine[];
  en_attente: RealisationEnAttente[];
  obligatoires_prevues: number;
  obligatoires_faites: number;
  aides_prevues: number;
  aides_faites: number;
  oublies: number;
  reste_obligatoires_aujourdhui: number;
  reste_aides: number;
  manquant: string[]; // « Faire son lit : oublié mardi », « Sortir les poubelles : 0 sur 1 »
};

export type DecisionBilan = 'verse' | 'non_verse';

export type BilanEnfant = {
  personne_id: string;
  prenom: string | null;
  complete: boolean;
  montant_prevu: number; // centimes
  obligatoires_prevues: number;
  obligatoires_faites: number;
  aides_prevues: number;
  aides_faites: number;
  manquant: string[];
  decision: DecisionBilan | null;
  montant_verse: number | null;
  decide_le: string | null;
  annulable: boolean; // décidé il y a moins de 24 h
};

export type BilanSemaine = {
  lundi: string;
  dimanche: string;
  bilans: BilanEnfant[];
  en_attente: (RealisationEnAttente & { personne_id: string; prenom: string | null })[];
  a_verser: number; // centimes, semaines complètes pas encore décidées
};

// "2026-10-28" → "2026-10-26" (lundi de la semaine, calcul de dates pures).
export function lundiDe(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  const decalage = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - decalage);
  return d.toISOString().slice(0, 10);
}

export async function semaineEnfant(idPersonne: string, lundi?: string): Promise<SemaineEnfant> {
  const { data, error } = await supabase.rpc('semaine_enfant', { id_personne: idPersonne, lundi: lundi ?? null });
  if (error) throw error;
  return data as SemaineEnfant;
}

// Un parent ajoute un coup de main fait par l'enfant (validé tout de suite).
export async function marquerAide(idTache: string, idPersonne: string, jour: string): Promise<void> {
  const { error } = await supabase.rpc('marquer_aide', { id_tache: idTache, id_personne: idPersonne, jour });
  if (error) throw error;
}

export async function bilanSemaine(lundi: string): Promise<BilanSemaine> {
  const { data, error } = await supabase.rpc('bilan_semaine', { lundi });
  if (error) throw error;
  return data as BilanSemaine;
}

// decisions : { [personneId]: 'verse' | 'non_verse' } ; sans choix, une semaine
// complète est versée et une semaine incomplète ne l'est pas.
export async function validerBilan(lundi: string, decisions: Record<string, DecisionBilan> = {}): Promise<void> {
  const { error } = await supabase.rpc('valider_bilan', { lundi, decisions });
  if (error) throw error;
}

export async function annulerBilan(lundi: string): Promise<void> {
  const { error } = await supabase.rpc('annuler_bilan', { lundi });
  if (error) throw error;
}

// Tâches d'un enfant (obligatoires, coups de main, en pause) pour « Tâches de … ».
export async function tachesDeEnfant(idPersonne: string): Promise<Tache[]> {
  const toutes = await listerTaches();
  return toutes.filter((t) => t.type !== 'maison' && t.personnes.includes(idPersonne));
}

// Phrase d'état de la semaine (refonte § 4.3), ex. « Reste : 1 obligatoire aujourd'hui et 2 coups de main d'ici dimanche. »
export function resteDeLaSemaine(s: SemaineEnfant): string {
  const morceaux: string[] = [];
  if (s.reste_obligatoires_aujourdhui > 0) {
    morceaux.push(
      `${s.reste_obligatoires_aujourdhui} obligatoire${s.reste_obligatoires_aujourdhui > 1 ? 's' : ''} aujourd’hui`
    );
  }
  if (s.reste_aides > 0) {
    morceaux.push(`${s.reste_aides} coup${s.reste_aides > 1 ? 's' : ''} de main d’ici dimanche`);
  }
  return morceaux.length ? `Reste : ${morceaux.join(' et ')}.` : 'Tout est fait pour le moment.';
}


// ---------------------------------------------------------------------------
// Rappels automatiques : anniversaires (refonte Quotidien § 3.2)
// ---------------------------------------------------------------------------

export type Anniversaire = {
  personne_id: string;
  prenom: string;
  date: string; // jour de l'anniversaire cette année-là
  age: number;
  cle: string; // 'anniv:<personne_id>:<année>'
  moi: boolean; // c'est mon propre anniversaire
  fait: boolean; // « C'est fait » pour mon foyer
};

// Anniversaires entre deux dates, pour les personnes que je vois (masquages
// par famille respectés par la base).
export async function anniversaires(du: string, au: string): Promise<Anniversaire[]> {
  const { data, error } = await supabase.rpc('anniversaires', { du, au });
  if (error) throw error;
  return (data as Anniversaire[]) ?? [];
}

export async function rappelAutoFait(cle: string): Promise<void> {
  const { error } = await supabase.rpc('rappel_auto_fait', { cle_rappel: cle });
  if (error) throw error;
}

export async function rappelAutoAnnuler(cle: string): Promise<void> {
  const { error } = await supabase.rpc('rappel_auto_annuler', { cle_rappel: cle });
  if (error) throw error;
}

// Réglage « Anniversaires » (Moi > Notifications > Quotidien) : oui par défaut.
export async function lireReglageAnniversaires(): Promise<boolean> {
  const { data, error } = await supabase.from('reglages_quotidien').select('anniversaires').maybeSingle();
  if (error) throw error;
  return data?.anniversaires ?? true;
}

export async function definirReglageAnniversaires(actif: boolean): Promise<void> {
  const { error } = await supabase.from('reglages_quotidien').upsert({ anniversaires: actif, maj_le: new Date().toISOString() });
  if (error) throw error;
}

export const RAPPELS_AVANT: { valeur: number; libelle: string }[] = [
  { valeur: 0, libelle: 'Le jour même' },
  { valeur: 1, libelle: 'La veille' },
  { valeur: 7, libelle: '1 semaine avant' },
  { valeur: 30, libelle: '1 mois avant' },
];
