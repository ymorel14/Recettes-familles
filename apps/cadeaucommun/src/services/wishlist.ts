import { supabase, schemaFamille } from './supabase';

// Accès aux données de CadeauCommun (schéma "wishlist"). La surprise est
// garantie par la base elle-même (règles RLS de
// supabase/migrations/20260928150000_wishlist.sql) :
//  - le destinataire d'une liste ne reçoit jamais les idées cachées, ni les
//    réservations, ni l'état "réservé" ;
//  - un donateur ne lit que SES réservations ; l'état des autres souhaits
//    (nombre d'unités réservées, sans les noms) vient de etat_reservations.

export type TypeEvenement =
  | 'noel'
  | 'anniversaire'
  | 'naissance'
  | 'mariage'
  | 'fete_des_meres'
  | 'fete_des_peres'
  | 'autre';

export const TYPES_EVENEMENT: { id: TypeEvenement; libelle: string }[] = [
  { id: 'noel', libelle: 'Noël' },
  { id: 'anniversaire', libelle: 'Anniversaire' },
  { id: 'naissance', libelle: 'Naissance' },
  { id: 'mariage', libelle: 'Mariage' },
  { id: 'fete_des_meres', libelle: 'Fête des mères' },
  { id: 'fete_des_peres', libelle: 'Fête des pères' },
  { id: 'autre', libelle: 'Autre' },
];

export type Evenement = {
  id: string;
  famille_id: string;
  type: TypeEvenement;
  titre: string;
  date_evenement: string; // AAAA-MM-JJ
  // Personne fêtée (anniversaire, naissance…) ; null = événement collectif (Noël).
  destinataire_id: string | null;
  cree_par: string;
};

// Types d'événement qui concernent une seule personne.
export function estEvenementPersonnel(type: TypeEvenement): boolean {
  return type !== 'noel' && type !== 'autre';
}

export type StatutListe = 'brouillon' | 'publiee' | 'archivee';

export type Liste = {
  id: string;
  evenement_id: string;
  destinataire_id: string;
  statut: StatutListe;
  cree_par: string;
};

export type Souhait = {
  id: string;
  liste_id: string;
  titre: string;
  description: string | null;
  lien: string | null;
  image: string | null;
  prix: number | null;
  taille: string | null;
  priorite: 1 | 2 | 3;
  quantite: number;
  secret: boolean;
  cree_par: string;
  cree_le: string;
  supprime_le: string | null;
};

export type EtatReservation = {
  souhait_id: string;
  quantite: number;
  nb_reserves: number;
  reserve_par_moi: boolean;
};

export type Personne = {
  id: string;
  utilisateur_id: string | null;
  foyer_id: string | null;
  prenom: string;
  date_naissance: string | null;
  gere_par: string | null;
};

// ---------------------------------------------------------------------------
// Personnes de la famille (schéma famille, commun aux apps)
// ---------------------------------------------------------------------------

export async function listerPersonnes(foyers: string[]): Promise<Personne[]> {
  if (foyers.length === 0) return [];
  const { data, error } = await schemaFamille()
    .from('personnes')
    .select('id, utilisateur_id, foyer_id, prenom, date_naissance, gere_par')
    .in('foyer_id', foyers)
    .order('prenom');
  if (error) throw error;
  return (data ?? []) as Personne[];
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
// double…). Ses listes sont supprimées avec elle.
export async function supprimerPersonne(id: string): Promise<void> {
  const { error } = await schemaFamille().from('personnes').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

export async function listerEvenements(familleId: string): Promise<Evenement[]> {
  const { data, error } = await supabase
    .from('evenements')
    .select('*')
    .eq('famille_id', familleId)
    .order('date_evenement', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Evenement[];
}

export async function obtenirEvenement(id: string): Promise<Evenement> {
  const { data, error } = await supabase.from('evenements').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Evenement;
}

export async function creerEvenement(e: {
  familleId: string;
  type: TypeEvenement;
  titre: string;
  date: string;
  auteurId: string;
  destinataireId: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('evenements')
    .insert({
      famille_id: e.familleId,
      type: e.type,
      titre: e.titre.trim(),
      date_evenement: e.date,
      cree_par: e.auteurId,
      destinataire_id: e.destinataireId,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function supprimerEvenement(id: string): Promise<void> {
  const { error } = await supabase.from('evenements').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Listes
// ---------------------------------------------------------------------------

export async function listerListesEvenement(evenementId: string): Promise<Liste[]> {
  const { data, error } = await supabase.from('listes').select('*').eq('evenement_id', evenementId);
  if (error) throw error;
  return (data ?? []) as Liste[];
}

export async function obtenirListe(id: string): Promise<Liste & { evenement: Evenement }> {
  const { data, error } = await supabase.from('listes').select('*, evenement:evenements(*)').eq('id', id).single();
  if (error) throw error;
  return data as any;
}

// Listes dont je suis le destinataire (ma personne), avec leur événement.
export async function mesListes(maPersonneId: string): Promise<(Liste & { evenement: Evenement })[]> {
  const { data, error } = await supabase
    .from('listes')
    .select('*, evenement:evenements(*)')
    .eq('destinataire_id', maPersonneId);
  if (error) throw error;
  return ((data ?? []) as any[]).sort((a, b) =>
    (a.evenement?.date_evenement ?? '').localeCompare(b.evenement?.date_evenement ?? '')
  );
}

export async function creerListe(
  evenementId: string,
  destinataireId: string,
  auteurId: string,
  statut: StatutListe = 'brouillon'
): Promise<string> {
  const { data, error } = await supabase
    .from('listes')
    .insert({ evenement_id: evenementId, destinataire_id: destinataireId, statut, cree_par: auteurId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function changerStatutListe(id: string, statut: StatutListe): Promise<void> {
  const { error } = await supabase.from('listes').update({ statut }).eq('id', id);
  if (error) throw error;
}

// Ce que l'utilisateur peut faire sur une liste : destinataire (aucune
// information de réservation), gestionnaire (remplit la liste d'un enfant
// sans compte) ou simple donateur.
export async function droitsSurListe(id: string): Promise<{ estDestinataire: boolean; peutGerer: boolean }> {
  const [destinataire, gerer] = await Promise.all([
    supabase.rpc('est_destinataire', { id_liste: id }),
    supabase.rpc('peut_gerer_liste', { id_liste: id }),
  ]);
  if (destinataire.error) throw destinataire.error;
  if (gerer.error) throw gerer.error;
  return { estDestinataire: !!destinataire.data, peutGerer: !!gerer.data };
}

// ---------------------------------------------------------------------------
// Souhaits et idées cachées
// ---------------------------------------------------------------------------

export async function listerSouhaits(listeId: string): Promise<Souhait[]> {
  const { data, error } = await supabase
    .from('souhaits')
    .select('*')
    .eq('liste_id', listeId)
    .order('priorite', { ascending: false })
    .order('cree_le', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Souhait[];
}

export async function obtenirSouhait(id: string): Promise<Souhait> {
  const { data, error } = await supabase.from('souhaits').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Souhait;
}

export type FormulaireSouhait = {
  titre: string;
  description: string;
  lien: string;
  prix: string;
  taille: string;
  priorite: 1 | 2 | 3;
  quantite: number;
};

function lignePourBase(f: FormulaireSouhait) {
  const prix = f.prix.trim().replace(',', '.');
  return {
    titre: f.titre.trim(),
    description: f.description.trim() || null,
    lien: f.lien.trim() || null,
    prix: prix && !Number.isNaN(Number(prix)) ? Number(prix) : null,
    taille: f.taille.trim() || null,
    priorite: f.priorite,
    quantite: Math.max(1, Math.round(f.quantite)),
  };
}

// `secret` : true pour une idée cachée d'un proche (la base l'impose de toute
// façon : un ajout par quelqu'un d'autre que le destinataire ou son
// gestionnaire est toujours secret).
export async function creerSouhait(listeId: string, auteurId: string, f: FormulaireSouhait, secret: boolean) {
  const { error } = await supabase
    .from('souhaits')
    .insert({ ...lignePourBase(f), liste_id: listeId, cree_par: auteurId, secret });
  if (error) throw error;
}

export async function modifierSouhait(id: string, f: FormulaireSouhait) {
  const { error } = await supabase.from('souhaits').update(lignePourBase(f)).eq('id', id);
  if (error) throw error;
}

// Le destinataire retire un souhait : supprimé pour de bon si personne ne
// l'avait réservé, sinon masqué pour lui et gardé pour le donateur.
export async function retirerSouhait(id: string) {
  const { error } = await supabase.rpc('retirer_souhait', { id_souhait: id });
  if (error) throw error;
}

// L'auteur d'une idée cachée la supprime.
export async function supprimerIdee(id: string) {
  const { error } = await supabase.from('souhaits').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Réservations
// ---------------------------------------------------------------------------

// État anonyme des réservations d'une liste (refusé au destinataire).
export async function etatReservations(listeId: string): Promise<Map<string, EtatReservation>> {
  const { data, error } = await supabase.rpc('etat_reservations', { id_liste: listeId });
  if (error) throw error;
  const resultat = new Map<string, EtatReservation>();
  ((data ?? []) as EtatReservation[]).forEach((e) => resultat.set(e.souhait_id, e));
  return resultat;
}

export async function reserver(souhaitId: string, auteurId: string, quantite = 1) {
  const { error } = await supabase.from('reservations').insert({ souhait_id: souhaitId, reserve_par: auteurId, quantite });
  if (error) throw error;
}

export async function annulerReservation(souhaitId: string, auteurId: string) {
  const { error } = await supabase
    .from('reservations')
    .delete()
    .eq('souhait_id', souhaitId)
    .eq('reserve_par', auteurId);
  if (error) throw error;
}

export type MaReservation = {
  id: string;
  souhait_id: string;
  quantite: number;
  achete: boolean;
  note_privee: string | null;
  souhait: {
    id: string;
    titre: string;
    prix: number | null;
    lien: string | null;
    secret: boolean;
    supprime_le: string | null;
    liste: {
      id: string;
      destinataire_id: string;
      evenement: Evenement | null;
    } | null;
  } | null;
};

// "À offrir" : tout ce que j'ai réservé, avec la liste et l'événement.
export async function mesReservations(): Promise<MaReservation[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select(
      'id, souhait_id, quantite, achete, note_privee, souhait:souhaits(id, titre, prix, lien, secret, supprime_le, liste:listes(id, destinataire_id, evenement:evenements(*)))'
    )
    .order('cree_le', { ascending: true });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function marquerAchete(reservationId: string, achete: boolean) {
  const { error } = await supabase.from('reservations').update({ achete }).eq('id', reservationId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// "2026-12-25" → "25 décembre 2026"
export function formaterDate(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number);
  if (!a || !m || !j) return iso;
  return `${j} ${MOIS[m - 1]} ${a}`;
}

// Jours restants avant la date (0 = aujourd'hui, négatif = passé).
export function joursAvant(iso: string): number {
  const [a, m, j] = iso.split('-').map(Number);
  const cible = new Date(a, m - 1, j).getTime();
  const aujourdHui = new Date();
  const debut = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), aujourdHui.getDate()).getTime();
  return Math.round((cible - debut) / 86400000);
}

export function libelleCompteARebours(iso: string): string {
  const n = joursAvant(iso);
  if (n === 0) return "Aujourd'hui";
  if (n === 1) return 'Demain';
  if (n > 0) return `J-${n}`;
  return 'Passé';
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

// Prochain anniversaire d'une date de naissance "AAAA-MM-JJ", au format
// JJ/MM/AAAA (aujourd'hui compris).
export function prochainAnniversaire(dateNaissance: string): string | null {
  const [, m, j] = dateNaissance.split('-').map(Number);
  if (!m || !j) return null;
  const aujourdHui = new Date();
  const debut = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), aujourdHui.getDate());
  let annee = aujourdHui.getFullYear();
  if (new Date(annee, m - 1, j) < debut) annee += 1;
  return `${String(j).padStart(2, '0')}/${String(m).padStart(2, '0')}/${annee}`;
}

export function formaterPrix(prix: number | null): string | null {
  if (prix == null) return null;
  return `${prix.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

// Ma fiche personne (créée automatiquement quand je rejoins un foyer).
export async function obtenirMaPersonne(utilisateurId: string): Promise<Personne | null> {
  const { data, error } = await schemaFamille()
    .from('personnes')
    .select('id, utilisateur_id, foyer_id, prenom, date_naissance, gere_par')
    .eq('utilisateur_id', utilisateurId)
    .maybeSingle();
  if (error) throw error;
  return (data as Personne | null) ?? null;
}
