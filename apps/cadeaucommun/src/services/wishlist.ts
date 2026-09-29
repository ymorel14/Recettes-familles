import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Platform } from 'react-native';
import { supabase, schemaFamille } from './supabase';

// Espace de stockage des photos de cadeaux (migration 5).
const BUCKET_PHOTOS_CADEAUX = 'cadeaux-photos';

// Accès aux données de CadeauCommun (schéma "wishlist"). La surprise est
// garantie par la base elle-même (règles RLS de
// supabase/migrations/20260928150000_wishlist.sql) :
//  - le destinataire d'une liste ne reçoit jamais les idées cachées, ni les
//    réservations, ni l'état "réservé" ;
//  - un donateur ne lit que SES réservations ; l'état des autres souhaits
//    (nombre d'unités réservées, sans les noms) vient de etat_reservations ;
//  - pot commun (migration 7) : chacun ne lit que SA participation ; la somme
//    réunie vient de etat_pots, refusée au destinataire.

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
  date_evenement: string; // AAAA-MM-JJ : la vraie date (anniversaire…)
  // Jour où les cadeaux sont offerts (repas de famille…) ; null = le jour même.
  date_remise: string | null;
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
  // estime : prix indicatif ; budget : montant maximum à dépenser.
  type_prix: TypePrix;
  taille: string | null;
  priorite: 1 | 2 | 3;
  quantite: number;
  secret: boolean;
  // Cadeau financé à plusieurs : on y participe au lieu de le réserver ;
  // prix = montant à réunir (facultatif).
  pot_commun: boolean;
  cree_par: string;
  cree_le: string;
  supprime_le: string | null;
};

export type TypePrix = 'estime' | 'budget';

export type EtatReservation = {
  souhait_id: string;
  quantite: number;
  nb_reserves: number;
  reserve_par_moi: boolean;
};

// Pot commun d'un cadeau, vu par un donateur : la somme réunie et MA
// participation (null si je n'ai pas participé). Jamais les autres montants.
export type EtatPot = {
  souhait_id: string;
  total: number;
  ma_participation: number | null;
};

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

// ---------------------------------------------------------------------------
// Personnes de la famille (schéma famille, commun aux apps)
// ---------------------------------------------------------------------------

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
  dateRemise: string | null;
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
      date_remise: e.dateRemise,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function modifierEvenement(
  id: string,
  e: { titre: string; date: string; dateRemise: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('evenements')
    .update({ titre: e.titre.trim(), date_evenement: e.date, date_remise: e.dateRemise })
    .eq('id', id);
  if (error) throw error;
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
  // Photo déjà en ligne (adresse) et/ou nouvelle photo choisie sur l'appareil.
  image: string | null;
  photoLocale: string | null;
  prix: string;
  typePrix: TypePrix;
  taille: string;
  priorite: 1 | 2 | 3;
  quantite: number;
  potCommun: boolean;
};

// Envoie une photo choisie sur l'appareil et renvoie son adresse publique
// (nom aléatoire, non listable : voir la migration 5).
export async function televerserPhoto(uriLocale: string): Promise<string> {
  let extension: string;
  let donnees: ArrayBuffer;
  if (Platform.OS === 'web') {
    const fichier = await (await fetch(uriLocale)).blob();
    extension = (fichier.type.split('/')[1] || 'jpeg').replace('jpeg', 'jpg');
    donnees = await fichier.arrayBuffer();
  } else {
    extension = uriLocale.split('.').pop()?.toLowerCase() ?? 'jpg';
    donnees = decode(await FileSystem.readAsStringAsync(uriLocale, { encoding: 'base64' }));
  }
  const nomFichier = `${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET_PHOTOS_CADEAUX).upload(nomFichier, donnees, {
    contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET_PHOTOS_CADEAUX).getPublicUrl(nomFichier).data.publicUrl;
}

async function lignePourBase(f: FormulaireSouhait) {
  const prix = f.prix.trim().replace(',', '.').replace(/\s|€/g, '');
  const image = f.photoLocale ? await televerserPhoto(f.photoLocale) : f.image;
  let lien = f.lien.trim();
  if (lien && !/^https?:\/\//i.test(lien)) lien = `https://${lien}`;
  return {
    titre: f.titre.trim(),
    description: f.description.trim() || null,
    lien: lien || null,
    image,
    type_prix: f.typePrix,
    prix: prix && !Number.isNaN(Number(prix)) ? Number(prix) : null,
    taille: f.taille.trim() || null,
    priorite: f.priorite,
    quantite: f.potCommun ? 1 : Math.max(1, Math.round(f.quantite)),
    pot_commun: f.potCommun,
  };
}

// `secret` : true pour une idée cachée d'un proche (la base l'impose de toute
// façon : un ajout par quelqu'un d'autre que le destinataire ou son
// gestionnaire est toujours secret).
export async function creerSouhait(listeId: string, auteurId: string, f: FormulaireSouhait, secret: boolean) {
  const { error } = await supabase
    .from('souhaits')
    .insert({ ...(await lignePourBase(f)), liste_id: listeId, cree_par: auteurId, secret });
  if (error) throw error;
}

export async function modifierSouhait(id: string, f: FormulaireSouhait) {
  const { error } = await supabase.from('souhaits').update(await lignePourBase(f)).eq('id', id);
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
    type_prix: TypePrix;
    image: string | null;
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
      'id, souhait_id, quantite, achete, note_privee, souhait:souhaits(id, titre, prix, type_prix, image, lien, secret, supprime_le, liste:listes(id, destinataire_id, evenement:evenements(*)))'
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
// Pots communs (un par cadeau)
// ---------------------------------------------------------------------------

// Somme réunie et ma participation pour chaque pot d'une liste (refusé au
// destinataire).
export async function etatPots(listeId: string): Promise<Map<string, EtatPot>> {
  const { data, error } = await supabase.rpc('etat_pots', { id_liste: listeId });
  if (error) throw error;
  const resultat = new Map<string, EtatPot>();
  ((data ?? []) as any[]).forEach((e) =>
    resultat.set(e.souhait_id, {
      souhait_id: e.souhait_id,
      total: Number(e.total ?? 0),
      ma_participation: e.ma_participation == null ? null : Number(e.ma_participation),
    })
  );
  return resultat;
}

// "25,50 €" → 25.5 (null si vide ou invalide)
export function lireMontant(texte: string): number | null {
  const propre = texte.trim().replace(',', '.').replace(/\s|€/g, '');
  if (!propre) return null;
  const n = Number(propre);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// Crée ou modifie ma participation à un pot (une seule par personne et par pot).
export async function participer(souhaitId: string, auteurId: string, montant: number) {
  const { data, error } = await supabase
    .from('participations')
    .update({ montant })
    .eq('souhait_id', souhaitId)
    .eq('participant', auteurId)
    .select('id');
  if (error) throw error;
  if (data && data.length > 0) return;
  const ajout = await supabase.from('participations').insert({ souhait_id: souhaitId, participant: auteurId, montant });
  if (ajout.error) throw ajout.error;
}

export async function retirerParticipation(souhaitId: string, auteurId: string) {
  const { error } = await supabase
    .from('participations')
    .delete()
    .eq('souhait_id', souhaitId)
    .eq('participant', auteurId);
  if (error) throw error;
}

export type MaParticipation = {
  id: string;
  souhait_id: string;
  montant: number;
  verse: boolean;
  souhait: MaReservation['souhait'];
};

// "À offrir" : mes participations aux pots communs.
export async function mesParticipations(): Promise<MaParticipation[]> {
  const { data, error } = await supabase
    .from('participations')
    .select(
      'id, souhait_id, montant, verse, souhait:souhaits(id, titre, prix, type_prix, image, lien, secret, supprime_le, liste:listes(id, destinataire_id, evenement:evenements(*)))'
    )
    .order('cree_le', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map((p) => ({ ...p, montant: Number(p.montant) }));
}

export async function marquerVerse(participationId: string, verse: boolean) {
  const { error } = await supabase.from('participations').update({ verse }).eq('id', participationId);
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

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// "2027-03-17" → "mercredi 17 mars 2027"
export function formaterDateLongue(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number);
  if (!a || !m || !j) return iso;
  return `${JOURS[new Date(a, m - 1, j).getDay()]} ${formaterDate(iso)}`;
}

// Date qui compte pour acheter : la remise des cadeaux si elle est fixée,
// sinon la date de l'événement. Sert au compte à rebours et au tri.
export function dateCle(e: Pick<Evenement, 'date_evenement' | 'date_remise'>): string {
  return e.date_remise ?? e.date_evenement;
}

// "15 mars 2027" ou "15 mars 2027 · cadeaux offerts le dimanche 21 mars 2027"
export function libelleDates(e: Pick<Evenement, 'date_evenement' | 'date_remise'>): string {
  if (!e.date_remise || e.date_remise === e.date_evenement) return formaterDate(e.date_evenement);
  return `${formaterDate(e.date_evenement)} · cadeaux offerts le ${formaterDateLongue(e.date_remise)}`;
}

// "2027-03-15" → "15/03/2027" (pour préremplir un champ de saisie)
export function versSaisie(iso: string | null): string {
  if (!iso) return '';
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
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

// "≈ 24 €" (prix estimé) ou "Budget : jusqu'à 50 €".
export function libellePrix(prix: number | null, typePrix: TypePrix | null | undefined): string | null {
  const montant = formaterPrix(prix);
  if (!montant) return null;
  return typePrix === 'budget' ? `Budget : jusqu’à ${montant}` : `≈ ${montant}`;
}

// Ma fiche personne (créée automatiquement quand je rejoins un foyer).
export async function obtenirMaPersonne(utilisateurId: string): Promise<Personne | null> {
  const { data, error } = await schemaFamille()
    .from('personnes')
    .select(SELECTION_PERSONNE)
    .eq('utilisateur_id', utilisateurId)
    .maybeSingle();
  if (error) throw error;
  return data ? versPersonne(data) : null;
}
