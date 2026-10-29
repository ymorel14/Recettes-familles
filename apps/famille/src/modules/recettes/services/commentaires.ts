import { supabase } from './supabase';
import { prenomsDe } from './profils';

// Commentaires d'une recette (retour de test R-7, migration
// 20261027120000_recettes_commentaires.sql) : mêmes droits de lecture que
// la recette, chacun modifie ou supprime les siens, l'auteur de la recette
// est prévenu dans Activité.

export type Commentaire = {
  id: string;
  recette_id: string;
  auteur_id: string;
  texte: string;
  cree_le: string;
  maj_le: string;
  auteurPrenom: string | null;
};

// Table absente (migration pas encore passée) : la section ne s'affiche pas.
export class CommentairesIndisponibles extends Error {}

const absente = (e: any) => /commentaires|PGRST205|42P01|does not exist/i.test(`${e?.code ?? ''} ${e?.message ?? ''}`);

export async function listerCommentaires(recetteId: string): Promise<Commentaire[]> {
  const { data, error } = await supabase
    .from('commentaires')
    .select('id, recette_id, auteur_id, texte, cree_le, maj_le')
    .eq('recette_id', recetteId)
    .order('cree_le', { ascending: true });
  if (error) throw absente(error) ? new CommentairesIndisponibles() : error;
  const lignes = (data ?? []) as Omit<Commentaire, 'auteurPrenom'>[];
  const prenoms = await prenomsDe([...new Set(lignes.map((l) => l.auteur_id))]).catch(() => new Map<string, string>());
  return lignes.map((l) => ({ ...l, auteurPrenom: prenoms.get(l.auteur_id) ?? null }));
}

export async function ajouterCommentaire(recetteId: string, texte: string): Promise<void> {
  const { error } = await supabase.from('commentaires').insert({ recette_id: recetteId, texte: texte.trim() });
  if (error) throw error;
}

export async function modifierCommentaire(id: string, texte: string): Promise<void> {
  const { error } = await supabase
    .from('commentaires')
    .update({ texte: texte.trim(), maj_le: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function supprimerCommentaire(id: string): Promise<void> {
  const { error } = await supabase.from('commentaires').delete().eq('id', id);
  if (error) throw error;
}
