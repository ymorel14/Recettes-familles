import { supabase } from './supabase';
import type { Categorie } from '../types/models';

function normaliser(nom: string): string {
  return nom
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Catégories globales à l'application, partagées par tous les foyers
// (décision utilisateur — voir cahier des charges §4/§11).

export async function rechercherCategories(texte: string): Promise<Categorie[]> {
  let requete = supabase.from('categories').select('*').order('nom', { ascending: true });
  if (texte.trim()) {
    requete = requete.ilike('nom_normalise', `%${normaliser(texte)}%`);
  }
  const { data, error } = await requete.limit(20);
  if (error) throw error;
  return data ?? [];
}

// Retourne la catégorie existante correspondant au nom (comparaison
// insensible à la casse et aux accents), ou la crée si elle n'existe pas
// encore — pour éviter les doublons proches par l'orthographe.
export async function trouverOuCreerCategorie(nom: string): Promise<Categorie> {
  const nomPropre = nom.trim();
  if (!nomPropre) {
    throw new Error('Le nom de la catégorie est vide.');
  }

  const { data: existante } = await supabase
    .from('categories')
    .select('*')
    .eq('nom_normalise', normaliser(nomPropre))
    .maybeSingle();

  if (existante) return existante;

  const { data: creee, error } = await supabase
    .from('categories')
    .insert({ nom: nomPropre })
    .select()
    .single();

  if (error) {
    // Cas rare : créée entre-temps par un autre membre (contrainte unique).
    const { data: retrouvee } = await supabase
      .from('categories')
      .select('*')
      .eq('nom_normalise', normaliser(nomPropre))
      .maybeSingle();
    if (retrouvee) return retrouvee;
    throw error;
  }

  return creee;
}
