import { supabase } from './supabase';
import type { CodeInvitation, TypeCodeInvitation } from '../types/models';

// Parcours de première connexion (famille puis foyer) et code d'invitation.
// Un seul code, le code famille : après l'avoir saisi, on choisit un foyer
// existant de la famille ou on crée le sien.
// Toutes les écritures passent par des fonctions Postgres (supabase/setup.sql,
// section "Familles") qui vérifient les règles : une seule famille et un seul
// foyer par utilisateur, 24 h de validité des codes.

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
// code famille → rejoint la famille ; code foyer → rejoint la famille ET le foyer.
export async function rejoindreAvecCode(code: string): Promise<ResultatCode> {
  const { data, error } = await supabase.rpc('rejoindre_avec_code', { code_saisi: code.trim() });
  if (error) throw error;
  return data as ResultatCode;
}

export async function creerFamille(nom: string): Promise<string> {
  const { data, error } = await supabase.rpc('creer_famille', { nom_famille: nom.trim() });
  if (error) throw error;
  return data as string;
}

export async function creerFoyer(nom: string): Promise<string> {
  const { data, error } = await supabase.rpc('creer_foyer', { nom_foyer: nom.trim() });
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
  const { data, error } = await supabase.rpc('foyers_a_rejoindre');
  if (error) throw error;
  return (data as FoyerARejoindre[] | null) ?? [];
}

// Rejoint un foyer existant de sa famille.
export async function choisirFoyer(idFoyer: string): Promise<string> {
  const { data, error } = await supabase.rpc('choisir_foyer', { id_foyer: idFoyer });
  if (error) throw error;
  return data as string;
}

// Renvoie le code en cours de validité (ou en crée un nouveau). Code
// famille : tout membre de la famille. (Le type "foyer" n'est plus utilisé
// par l'application : on rejoint un foyer en le choisissant dans la liste.)
export async function obtenirCodeInvitation(type: TypeCodeInvitation): Promise<CodeInvitation> {
  const { data, error } = await supabase.rpc('obtenir_code_invitation', { type_code: type });
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
