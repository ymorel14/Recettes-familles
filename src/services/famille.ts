import { schemaFamille } from './supabase';
import type { CodeInvitation, TypeCodeInvitation } from '../types/models';

// Compte famille (schéma "famille", commun à toutes les apps) : parcours de
// première connexion, codes d'invitation, plusieurs familles par utilisateur.
// Un seul code, le code famille : après l'avoir saisi, on choisit un foyer
// existant de la famille ou on crée le sien — ou, si l'on a déjà un foyer,
// c'est tout le foyer qui rejoint la nouvelle famille.
// Toutes les écritures passent par des fonctions Postgres
// (supabase/migrations/20260928140000_socle_famille.sql) qui vérifient les
// règles : un seul foyer par utilisateur, un foyer peut appartenir à
// plusieurs familles, 24 h de validité des codes, famille active commune à
// toutes les apps.

// Les erreurs Supabase (PostgrestError) ne sont pas toujours des Error JS
// "classiques" : on extrait le message de façon robuste.
export function extraireMessageErreur(e: unknown, messageParDefaut: string): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as any).message === 'string') {
    return (e as any).message;
  }
  if (e instanceof Error) return e.message;
  return messageParDefaut;
}

export type ResultatCode = {
  type: TypeCodeInvitation;
  famille_id: string;
  foyer_id: string | null;
};

// Utilise un code d'invitation, quel que soit son type (détecté côté base) :
// code famille → rejoint la famille (avec tout son foyer si l'on en a un) ;
// code foyer → rejoint le foyer et ses familles. La famille du code devient
// la famille active.
export async function rejoindreAvecCode(code: string): Promise<ResultatCode> {
  const { data, error } = await schemaFamille().rpc('rejoindre_avec_code', { code_saisi: code.trim() });
  if (error) throw error;
  return data as ResultatCode;
}

// Crée une famille (première ou supplémentaire). Si l'on a déjà un foyer, il
// y est rattaché. La nouvelle famille devient la famille active.
export async function creerFamille(nom: string): Promise<string> {
  const { data, error } = await schemaFamille().rpc('creer_famille', { nom_famille: nom.trim() });
  if (error) throw error;
  return data as string;
}

export async function creerFoyer(nom: string): Promise<string> {
  const { data, error } = await schemaFamille().rpc('creer_foyer', { nom_foyer: nom.trim() });
  if (error) throw error;
  return data as string;
}

// Foyer existant de la famille, proposé au nouvel arrivant après le code
// famille (fonction foyers_a_rejoindre).
export type FoyerARejoindre = {
  id: string;
  nom: string;
  createur: string | null;
  nb_membres: number;
};

export async function listerFoyersARejoindre(): Promise<FoyerARejoindre[]> {
  const { data, error } = await schemaFamille().rpc('foyers_a_rejoindre');
  if (error) throw error;
  return (data as FoyerARejoindre[] | null) ?? [];
}

// Rejoint un foyer existant de sa famille.
export async function choisirFoyer(idFoyer: string): Promise<string> {
  const { data, error } = await schemaFamille().rpc('choisir_foyer', { id_foyer: idFoyer });
  if (error) throw error;
  return data as string;
}

// Renvoie le code en cours de validité (ou en crée un nouveau). Code
// famille : tout membre de la famille. (Le type "foyer" n'est plus utilisé
// par l'application : on rejoint un foyer en le choisissant dans la liste.)
export async function obtenirCodeInvitation(type: TypeCodeInvitation): Promise<CodeInvitation> {
  const { data, error } = await schemaFamille().rpc('obtenir_code_invitation', { type_code: type });
  if (error) throw error;
  return data as CodeInvitation;
}

// "valable jusqu'à demain 15:42" / "valable jusqu'à 23:10"
export function formaterExpiration(expireLe: string): string {
  const date = new Date(expireLe);
  const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const aujourdHui = new Date();
  const memeJour = date.toDateString() === aujourdHui.toDateString();
  return memeJour ? `valable jusqu'à ${heure}` : `valable jusqu'à demain ${heure}`;
}

// ---------------------------------------------------------------------------
// Plusieurs familles par utilisateur
// ---------------------------------------------------------------------------

export type FamilleResume = {
  id: string;
  nom: string;
  active: boolean;
};

// Mes familles, dans l'ordre où je les ai rejointes, la famille active marquée.
export async function listerMesFamilles(): Promise<FamilleResume[]> {
  const { data, error } = await schemaFamille().rpc('lister_mes_familles');
  if (error) throw error;
  return (data as FamilleResume[] | null) ?? [];
}

// Change la famille active, pour toutes les apps de la famille.
export async function choisirFamilleActive(idFamille: string): Promise<void> {
  const { error } = await schemaFamille().rpc('choisir_famille_active', { id_famille: idFamille });
  if (error) throw error;
}

// Quitte une famille (avec tout son foyer). Impossible pour sa seule famille.
// Si c'était la famille active, l'autre devient active automatiquement.
export async function quitterFamille(idFamille: string): Promise<void> {
  const { error } = await schemaFamille().rpc('quitter_famille', { id_famille: idFamille });
  if (error) throw error;
}

// Foyers de la famille active (le sien compris) : la base laisse lire les
// recettes de toutes ses familles, c'est l'app qui n'affiche que celles de
// la famille active.
export async function listerFoyersFamilleActive(): Promise<string[]> {
  const { data, error } = await schemaFamille().rpc('foyers_famille_active');
  if (error) throw error;
  return ((data as string[] | null) ?? []).filter(Boolean);
}
