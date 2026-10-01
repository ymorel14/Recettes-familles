import { supabase } from './supabase';
import { formaterPlage } from './personnes';

// Accès aux données de VoyageCommun (schéma "voyage",
// supabase/migrations/20260929100000_voyage.sql). Qui voit quoi est garanti
// par la base (règles RLS) : un voyage "en amoureux" ou "à quelques-uns"
// n'est jamais renvoyé à une personne non invitée.

export type Periode = 'printemps' | 'ete' | 'automne' | 'toussaint' | 'noel' | 'hiver' | 'autre';
export type TypeSejour = 'weekend' | 'court_sejour' | 'vacances' | 'etranger' | 'autre';
export type Participation = 'famille' | 'amoureux' | 'selection';
export type StatutVoyage = 'idee' | 'organisation' | 'confirme' | 'termine' | 'annule';
export type ModeTransport = 'voiture' | 'train' | 'avion' | 'bateau' | 'bus' | 'mixte';
export type Repartition = 'par_personne' | 'par_adulte' | 'par_foyer';
export type ReponseInvite = 'invite' | 'partant' | 'peut_etre' | 'decline';
// Un « voyage » peut être un vrai voyage ou un repas de famille.
export type NatureVoyage = 'voyage' | 'repas';

export type Voyage = {
  id: string;
  famille_id: string;
  titre: string;
  description: string | null;
  destination: string | null;
  pays: string | null;
  type_sejour: TypeSejour;
  periode: Periode;
  annee: number | null;
  participation: Participation;
  statut: StatutVoyage;
  date_debut: string | null;
  date_fin: string | null;
  nb_nuits: number | null;
  mode_transport: ModeTransport | null;
  repartition: Repartition;
  image: string | null;
  nature: NatureVoyage;
  foyer_hote: string | null;
  cree_par: string;
  cree_le: string;
};

export type Participant = {
  voyage_id: string;
  personne_id: string;
  role: 'organisateur' | 'participant';
  reponse: ReponseInvite;
};

export type VoyageAvecParticipants = Voyage & { participants: Participant[] };

export const PERIODES: { id: Periode; libelle: string }[] = [
  { id: 'printemps', libelle: 'Printemps' },
  { id: 'ete', libelle: 'Été' },
  { id: 'automne', libelle: 'Automne' },
  { id: 'toussaint', libelle: 'Toussaint' },
  { id: 'noel', libelle: 'Noël' },
  { id: 'hiver', libelle: 'Hiver' },
  { id: 'autre', libelle: 'Autre période' },
];

export const TYPES_SEJOUR: { id: TypeSejour; libelle: string; nuitsParDefaut: number | null }[] = [
  { id: 'weekend', libelle: 'Week-end', nuitsParDefaut: 2 },
  { id: 'court_sejour', libelle: 'Court séjour', nuitsParDefaut: 4 },
  { id: 'vacances', libelle: 'Vacances', nuitsParDefaut: 7 },
  { id: 'etranger', libelle: 'À l’étranger', nuitsParDefaut: 7 },
  { id: 'autre', libelle: 'Autre', nuitsParDefaut: null },
];

export const PARTICIPATIONS: { id: Participation; libelle: string; aide: string }[] = [
  { id: 'famille', libelle: 'Toute la famille', aide: 'Tout le monde est invité, enfants compris.' },
  { id: 'amoureux', libelle: 'En amoureux', aide: 'Vous deux seulement : invisible pour les autres.' },
  { id: 'selection', libelle: 'Quelques personnes', aide: 'Vous choisissez les invités ; visible d’eux seuls.' },
];

// Partage des frais communs (hébergement, forfaits, divers). Par défaut :
// par personne, enfants gratuits (moins de 18 ans).
export const REPARTITIONS: { id: Repartition; libelle: string }[] = [
  { id: 'par_adulte', libelle: 'Par personne, enfants gratuits' },
  { id: 'par_personne', libelle: 'Par personne, enfants compris' },
  { id: 'par_foyer', libelle: 'Par foyer' },
];
export const REPARTITION_PAR_DEFAUT: Repartition = 'par_adulte';
export { AGE_ADULTE } from './budget';

export type Energie = 'gazole' | 'sp95' | 'sp98' | 'e85' | 'gpl' | 'electrique';

// Véhicule mémorisé par un foyer (migration 20260929110000_voyage_vehicules.sql),
// proposé à chaque nouveau trajet ; ses valeurs sont recopiées dans le trajet.
export type Vehicule = {
  id: string;
  foyer_id: string;
  nom: string;
  energie: Energie;
  consommation: number; // L/100 km, ou kWh/100 km en électrique
  places: number | null;
};

export const STATUTS: { id: StatutVoyage; libelle: string }[] = [
  { id: 'idee', libelle: 'Idée' },
  { id: 'organisation', libelle: 'En organisation' },
  { id: 'confirme', libelle: 'Confirmé' },
  { id: 'termine', libelle: 'Terminé' },
  { id: 'annule', libelle: 'Annulé' },
];

// Étapes du parcours d'un voyage (écran Voyage), dans l'ordre du cahier des
// charges. Elles se rempliront au fil des phases 1 et 2.
export type IdEtape = 'invites' | 'dates' | 'hebergement' | 'transport' | 'activites' | 'programme' | 'budget' | 'menu' | 'listes';
export const ETAPES: { id: IdEtape; libelle: string; icone: string; aide: string }[] = [
  { id: 'invites', libelle: 'Invités', icone: 'people-outline', aide: 'Qui vient, qui organise' },
  { id: 'dates', libelle: 'Dates', icone: 'calendar-outline', aide: 'Sondage et créneaux communs' },
  { id: 'hebergement', libelle: 'Hébergement', icone: 'home-outline', aide: 'Propositions et avis' },
  { id: 'transport', libelle: 'Transport', icone: 'car-outline', aide: 'Un trajet par foyer' },
  { id: 'activites', libelle: 'Activités', icone: 'ticket-outline', aide: 'Visites, parcs, restaurants' },
  { id: 'programme', libelle: 'Programme', icone: 'list-outline', aide: 'Jour par jour' },
  { id: 'menu', libelle: 'Menu', icone: 'restaurant-outline', aide: 'Les repas, de l’apéro au dessert, et qui fait quoi' },
  { id: 'listes', libelle: 'Listes de cadeaux', icone: 'gift-outline', aide: 'Relier les listes de CadeauCommun' },
  { id: 'budget', libelle: 'Budget', icone: 'wallet-outline', aide: 'Total et qui paie combien' },
];

// Étapes affichées selon la nature : un repas n'a ni hébergement, ni
// activités, ni programme, ni budget ; il a un menu et des listes de cadeaux.
export function etapesPour(nature: NatureVoyage) {
  const ids: IdEtape[] =
    nature === 'repas'
      ? ['invites', 'dates', 'menu', 'listes', 'transport']
      : ['invites', 'dates', 'hebergement', 'transport', 'activites', 'programme', 'budget'];
  return ids.map((id) => ETAPES.find((e) => e.id === id)!);
}

export function libelle<T extends string>(liste: { id: T; libelle: string }[], id: T | null | undefined): string {
  return liste.find((e) => e.id === id)?.libelle ?? '';
}

// "du 7 au 14 août 2027" si les dates sont fixées, sinon "Été 2027".
export function libelleQuand(v: Pick<Voyage, 'date_debut' | 'date_fin' | 'periode' | 'annee'>): string {
  if (v.date_debut && v.date_fin) return formaterPlage(v.date_debut, v.date_fin);
  const p = libelle(PERIODES, v.periode);
  return v.annee ? `${p} ${v.annee}` : p;
}

// Voyages visibles (la base ne renvoie que ceux auxquels on a droit) de la
// famille active, avec leurs participants.
export async function listerVoyages(familleId: string): Promise<VoyageAvecParticipants[]> {
  const { data, error } = await supabase
    .from('voyages')
    .select('*, participants(voyage_id, personne_id, role, reponse)')
    .eq('famille_id', familleId)
    .order('cree_le', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VoyageAvecParticipants[];
}

export async function obtenirVoyage(id: string): Promise<VoyageAvecParticipants> {
  const { data, error } = await supabase
    .from('voyages')
    .select('*, participants(voyage_id, personne_id, role, reponse)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as VoyageAvecParticipants;
}

// Voyages en cours d'abord (idée, organisation, confirmé), puis terminés et
// annulés.
export function estActif(v: Pick<Voyage, 'statut'>): boolean {
  return v.statut === 'idee' || v.statut === 'organisation' || v.statut === 'confirme';
}

// Message lisible quand le schéma "voyage" n'existe pas encore dans la base
// (migration pas encore exécutée, ou schéma pas encore exposé à l'API).
export function messageErreurVoyage(e: any): string {
  const texte = String(e?.message ?? e ?? '');
  if (/schema|PGRST106|does not exist|relation/i.test(texte) || e?.code === 'PGRST106') {
    return 'La base n’est pas encore prête pour les voyages : exécuter la migration 20260929100000_voyage.sql puis ajouter « voyage » aux schémas exposés (voir supabase/migrations/LISEZMOI.md).';
  }
  return texte || 'Chargement impossible.';
}

// ---------------------------------------------------------------------------
// Création et invités (phase 1)
// ---------------------------------------------------------------------------

export type FormulaireVoyage = {
  famille_id: string;
  titre: string;
  destination: string | null;
  pays: string | null;
  periode: Periode;
  annee: number | null;
  type_sejour: TypeSejour;
  nb_nuits: number | null;
  participation: Participation;
  description: string | null;
  nature: NatureVoyage;
  foyer_hote: string | null;
};

// Crée le voyage puis invite les personnes choisies. La base ajoute d'elle-
// même le créateur (organisateur, partant) et, pour un voyage "toute la
// famille", toutes les personnes de la famille.
export async function creerVoyage(f: FormulaireVoyage, invites: string[]): Promise<string> {
  const { data, error } = await supabase
    .from('voyages')
    .insert({ ...f, repartition: REPARTITION_PAR_DEFAUT })
    .select('id')
    .single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  if (f.participation !== 'famille' && invites.length > 0) await inviter(id, invites);
  return id;
}

export async function modifierVoyage(id: string, champs: Partial<Omit<Voyage, 'id' | 'cree_par' | 'cree_le' | 'famille_id'>>) {
  const { error } = await supabase.from('voyages').update(champs).eq('id', id);
  if (error) throw error;
}

export async function supprimerVoyage(id: string): Promise<void> {
  const { error } = await supabase.from('voyages').delete().eq('id', id);
  if (error) throw error;
}

export async function inviter(voyageId: string, personnes: string[]): Promise<void> {
  if (personnes.length === 0) return;
  const { error } = await supabase
    .from('participants')
    .upsert(
      personnes.map((personne_id) => ({ voyage_id: voyageId, personne_id })),
      { onConflict: 'voyage_id,personne_id', ignoreDuplicates: true }
    );
  if (error) throw error;
}

export async function repondre(voyageId: string, personneId: string, reponse: ReponseInvite): Promise<void> {
  const { error } = await supabase
    .from('participants')
    .update({ reponse })
    .eq('voyage_id', voyageId)
    .eq('personne_id', personneId);
  if (error) throw error;
}

export async function changerRole(voyageId: string, personneId: string, role: Participant['role']): Promise<void> {
  const { error } = await supabase
    .from('participants')
    .update({ role })
    .eq('voyage_id', voyageId)
    .eq('personne_id', personneId);
  if (error) throw error;
}

export async function retirerParticipant(voyageId: string, personneId: string): Promise<void> {
  const { error } = await supabase
    .from('participants')
    .delete()
    .eq('voyage_id', voyageId)
    .eq('personne_id', personneId);
  if (error) throw error;
}

export const REPONSES: { id: ReponseInvite; libelle: string }[] = [
  { id: 'partant', libelle: 'Partant' },
  { id: 'peut_etre', libelle: 'Peut-être' },
  { id: 'decline', libelle: 'Je ne viens pas' },
];

// Personnes pour lesquelles l'utilisateur agit : lui-même, et les personnes
// sans compte de son foyer (enfants) — même règle que la base
// (voyage.mes_personnes).
export function mesPersonnes<T extends { utilisateur_id: string | null; foyer_id: string | null; gere_par?: string | null }>(
  personnes: T[],
  utilisateurId: string,
  foyerId: string | null
): T[] {
  return personnes.filter(
    (p) =>
      p.utilisateur_id === utilisateurId ||
      (p.utilisateur_id === null && (p.gere_par === utilisateurId || (foyerId !== null && p.foyer_id === foyerId)))
  );
}

// Suis-je organisateur ? (créateur, ou invité avec le rôle organisateur)
export function estOrganisateur(v: VoyageAvecParticipants, utilisateurId: string, maPersonneId: string | null): boolean {
  return (
    v.cree_par === utilisateurId ||
    v.participants.some((p) => p.role === 'organisateur' && p.personne_id === maPersonneId)
  );
}

// Année proposée pour une période : la prochaine occurrence (l'été prochain
// si l'été est passé, Noël de cette année jusqu'à fin décembre…).
export function anneeParDefaut(periode: Periode, aujourdHui = new Date()): number {
  const a = aujourdHui.getFullYear();
  const m = aujourdHui.getMonth() + 1; // 1..12
  const finPeriode: Record<Periode, number> = {
    printemps: 6,
    ete: 9,
    automne: 12,
    toussaint: 11,
    noel: 12,
    hiver: 3,
    autre: 12,
  };
  if (periode === 'hiver') return m <= 3 ? a : a + 1;
  return m <= finPeriode[periode] ? a : a + 1;
}

// ---------------------------------------------------------------------------
// Postes de budget divers (organisateurs)
// ---------------------------------------------------------------------------

export type CategoriePoste = 'repas' | 'courses' | 'assurance' | 'location' | 'souvenirs' | 'autre';
export type BasePoste = 'total' | 'par_personne' | 'par_personne_nuit' | 'par_nuit';

export type Poste = {
  id: string;
  voyage_id: string;
  libelle: string;
  categorie: CategoriePoste;
  montant: number;
  base: BasePoste;
};

export const CATEGORIES_POSTE: { id: CategoriePoste; libelle: string }[] = [
  { id: 'repas', libelle: 'Restaurants' },
  { id: 'courses', libelle: 'Courses' },
  { id: 'assurance', libelle: 'Assurance' },
  { id: 'location', libelle: 'Location' },
  { id: 'souvenirs', libelle: 'Souvenirs' },
  { id: 'autre', libelle: 'Autre' },
];

export const BASES_POSTE: { id: BasePoste; libelle: string }[] = [
  { id: 'total', libelle: 'Une fois' },
  { id: 'par_nuit', libelle: 'Par nuit' },
  { id: 'par_personne', libelle: 'Par personne' },
  { id: 'par_personne_nuit', libelle: 'Par personne et par nuit' },
];

export async function listerPostes(voyageId: string): Promise<Poste[]> {
  const { data, error } = await supabase.from('postes_budget').select('*').eq('voyage_id', voyageId).order('cree_le');
  if (error) throw error;
  return (data ?? []) as Poste[];
}

export async function enregistrerPoste(p: Omit<Poste, 'id'>, id?: string): Promise<void> {
  const { error } = id
    ? await supabase.from('postes_budget').update(p).eq('id', id)
    : await supabase.from('postes_budget').insert(p);
  if (error) throw error;
}

export async function supprimerPoste(id: string): Promise<void> {
  const { error } = await supabase.from('postes_budget').delete().eq('id', id);
  if (error) throw error;
}
