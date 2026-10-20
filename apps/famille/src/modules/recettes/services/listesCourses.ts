import { Linking, Platform } from 'react-native';
// Code commun chargé par son chemin direct (et non « @apps-famille/courses ») :
// sous Windows, Metro ne trouvait pas ce paquet pour le site web.
import { ouvrirModule } from '../../../navigation/navigationRef';
import { envoyerRecettes, type RecetteEnvoyee } from '../../../../../../packages/courses/src';
import { supabase } from './supabase';
import { appliquerVariantes, etatSurprise } from './recettes';
import type { RecetteComplete } from '../types/models';

// La liste de courses vit désormais dans l'app Courses (schéma "courses",
// voir apps/courses et supabase/migrations/20261017120000_courses_recettes.sql).
// Recettes y envoie les ingrédients : mêmes règles qu'avant (quantités
// ramenées au nombre de parts, version choisie d'une recette à variantes,
// produits identiques fusionnés, détail par recette pour pouvoir en retirer
// une), code commun dans packages/courses.

const courses = () => supabase.schema('courses');

export type ListeCourses = { id: string; nom: string; icone: string; principale: boolean; foyer_id: string };

// Listes où l'on peut envoyer des ingrédients : celles de mon foyer (la
// principale « Courses » d'abord, créée si besoin), puis celles qu'on m'a
// partagées.
export async function listerListesCourses(foyerId: string): Promise<ListeCourses[]> {
  const { error: erreurPrincipale } = await courses().rpc('assurer_liste_principale', { id_foyer: foyerId });
  if (erreurPrincipale) throw erreurPrincipale;
  const { data, error } = await courses()
    .from('listes')
    .select('id, nom, icone, principale, foyer_id')
    .order('principale', { ascending: false })
    .order('cree_le', { ascending: true });
  if (error) throw error;
  const listes = (data ?? []) as ListeCourses[];
  return [...listes.filter((l) => l.foyer_id === foyerId), ...listes.filter((l) => l.foyer_id !== foyerId)];
}

export type SelectionRecette = { recette: RecetteComplete; partsSouhaitees: number };

// Envoie des recettes (chacune à son nombre de parts) dans une liste de
// Courses. Renvoie le nombre de nouveaux articles et d'articles complétés.
export async function ajouterRecettesALaListe(
  listeId: string,
  selections: SelectionRecette[]
): Promise<{ nouveaux: number; completes: number }> {
  const recettes: RecetteEnvoyee[] = selections.map(({ recette: brute, partsSouhaitees }) => {
    // Recette à variantes : seuls les ingrédients de la version choisie.
    const recette = appliquerVariantes(brute);
    const facteur = partsSouhaitees / (recette.parts_defaut || 1);
    return {
      recetteId: recette.id,
      // Liste partagée : une recette surprise cachée au foyer n'y apparaît
      // pas sous son vrai nom.
      recetteTitre: etatSurprise(recette)?.portee === 'moi' ? 'Recette surprise' : recette.titre,
      parts: partsSouhaitees,
      ingredients: recette.ingredients.map((ing) => ({
        libelle: ing.libelle,
        quantite: ing.quantite != null ? ing.quantite * facteur : null,
        unite: ing.unite,
      })),
    };
  });
  const { data } = await supabase.auth.getUser();
  return envoyerRecettes(courses(), listeId, recettes, data.user?.id ?? null);
}

// Ouvre la liste dans le module Courses de l'app Famille.
export async function ouvrirDansCourses(listeId?: string): Promise<boolean> {
  if (listeId) ouvrirModule('courses', 'Liste', { listeId });
  else ouvrirModule('courses');
  return true;
}
