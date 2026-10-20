import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Categorie, GroupeCategorie, IdGroupeCategorie } from '../types/models';

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

// Groupes de catégories, dans l'ordre d'affichage. La référence est la table
// recettes.groupes_categories (voir listerGroupes) : cette liste ne sert que
// de secours si la base est injoignable.
export const GROUPES_CATEGORIES: GroupeCategorie[] = [
  {
    id: 'aperitifs-entrees',
    nom: 'Apéritifs & Entrées',
    description: 'Tartinables, feuilletés, verrines, soupes chaudes ou froides',
    ordre: 1,
  },
  { id: 'plats-principaux', nom: 'Plats principaux', description: '', ordre: 2 },
  { id: 'salades', nom: 'Salades', description: '', ordre: 3 },
  { id: 'tartes-quiches', nom: 'Tartes & Quiches', description: '', ordre: 4 },
  { id: 'desserts', nom: 'Desserts', description: '', ordre: 5 },
  { id: 'gateaux-patisseries', nom: 'Gâteaux & Pâtisseries', description: '', ordre: 6 },
  { id: 'boissons-smoothies', nom: 'Boissons & Smoothies', description: '', ordre: 7 },
];

// Groupes lus dans la base (ordre, puis nom). Un groupe ajouté dans
// Supabase (table recettes.groupes_categories) apparaît ainsi directement.
export async function listerGroupes(): Promise<GroupeCategorie[]> {
  const { data, error } = await supabase
    .from('groupes_categories')
    .select('id, nom, description, ordre')
    .order('ordre', { ascending: true })
    .order('nom', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((g: any) => ({
    id: g.id,
    nom: g.nom,
    description: g.description ?? '',
    ordre: g.ordre ?? 0,
  }));
}

// Liste des groupes pour les écrans : part de la liste de secours, puis se
// met à jour avec celle de la base (rechargée à chaque appel de `recharger`).
let groupesEnCache: GroupeCategorie[] = GROUPES_CATEGORIES;

export function useGroupesCategories() {
  const [groupes, setGroupes] = useState<GroupeCategorie[]>(groupesEnCache);
  const recharger = useCallback(() => {
    listerGroupes()
      .then((liste) => {
        if (liste.length > 0) {
          groupesEnCache = liste;
          setGroupes(liste);
        }
      })
      .catch(() => {
        // Base injoignable : on garde la dernière liste connue.
      });
  }, []);
  useEffect(recharger, [recharger]);
  return { groupes, recharger };
}

// Pseudo-groupe des catégories sans groupe (voir l'écran d'accueil).
export const ID_A_CLASSER = 'a-classer';
export const NOM_A_CLASSER = 'À classer';

export type IdGroupeAffiche = IdGroupeCategorie | typeof ID_A_CLASSER;

export function groupeDeCategorie(categorie: Categorie): IdGroupeAffiche {
  return categorie.groupe_id ?? ID_A_CLASSER;
}

export function nomDuGroupe(id: IdGroupeAffiche): string {
  if (id === ID_A_CLASSER) return NOM_A_CLASSER;
  return groupesEnCache.find((g) => g.id === id)?.nom ?? NOM_A_CLASSER;
}

// Range une catégorie dans un groupe. La liste des catégories étant commune
// à tous les foyers, ce classement vaut pour tout le monde.
export async function classerCategorie(categorieId: string, groupeId: IdGroupeCategorie): Promise<void> {
  const { error } = await supabase.from('categories').update({ groupe_id: groupeId }).eq('id', categorieId);
  if (error) throw error;
}
