import { supabase } from './supabase';
import type { NoteUtile } from '../types/models';

// Service "Aide-mémoire" (voir supabase/setup.sql, table `notes_utiles`) :
// des fiches pratiques transversales (températures à cœur des viandes,
// congélation, conversions...), à part des recettes — retour utilisateur :
// une info qui ne dépend pas d'une recette précise n'a pas sa place dans le
// champ "notes" d'une recette, dupliquée partout où elle serait utile.

export async function listerNotesUtiles(foyerId: string): Promise<NoteUtile[]> {
  const { data, error } = await supabase
    .from('notes_utiles')
    .select('*')
    .eq('foyer_id', foyerId)
    .order('titre', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function obtenirNoteUtile(id: string): Promise<NoteUtile> {
  const { data, error } = await supabase.from('notes_utiles').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export type NoteUtileFormulaire = { titre: string; theme: string; contenu: string };

export async function creerNoteUtile(
  foyerId: string,
  utilisateurId: string,
  form: NoteUtileFormulaire
): Promise<string> {
  const { data, error } = await supabase
    .from('notes_utiles')
    .insert({
      foyer_id: foyerId,
      titre: form.titre.trim(),
      theme: form.theme.trim(),
      contenu: form.contenu.trim(),
      cree_par: utilisateurId,
    })
    .select()
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function mettreAJourNoteUtile(id: string, form: NoteUtileFormulaire): Promise<void> {
  const { error } = await supabase
    .from('notes_utiles')
    .update({
      titre: form.titre.trim(),
      theme: form.theme.trim(),
      contenu: form.contenu.trim(),
      maj_le: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function supprimerNoteUtile(id: string): Promise<void> {
  const { error } = await supabase.from('notes_utiles').delete().eq('id', id);
  if (error) throw error;
}

// Thèmes déjà utilisés dans le foyer, triés par nombre de fiches décroissant
// (les plus courants en premier) — sert à proposer des suggestions au lieu
// d'une liste fixe à configurer à l'avance (retour utilisateur : "je verrai
// à en ajouter au fur et à mesure des besoins").
export function themesUtilises(notes: NoteUtile[]): string[] {
  const compte = new Map<string, number>();
  notes.forEach((n) => {
    const theme = n.theme.trim();
    if (!theme) return;
    compte.set(theme, (compte.get(theme) ?? 0) + 1);
  });
  return Array.from(compte.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
    .map(([theme]) => theme);
}
