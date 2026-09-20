// Types correspondant au schéma Postgres (supabase/setup.sql), schéma "recettes".

export type Foyer = {
  id: string;
  nom: string;
  cree_par: string;
  cree_le: string;
};

export type FoyerMembre = {
  foyer_id: string;
  utilisateur_id: string;
  role: 'membre' | 'administrateur';
  rejoint_le: string;
};

export type Invitation = {
  id: string;
  foyer_id: string;
  code: string;
  creee_par: string;
  creee_le: string;
};

export type Categorie = {
  id: string;
  nom: string;
  nom_normalise: string;
  cree_le: string;
};

export type Recette = {
  id: string;
  foyer_id: string;
  titre: string;
  photo_url: string | null;
  parts_defaut: number;
  temps_preparation_minutes: number | null;
  temps_cuisson_minutes: number | null;
  notes: string | null;
  source: 'manuelle' | 'scan' | 'web';
  source_url: string | null;
  cree_par: string;
  cree_le: string;
  maj_le: string;
};

export type Ingredient = {
  id: string;
  recette_id: string;
  libelle: string;
  quantite: number | null;
  unite: string | null;
  ordre: number;
};

export type Etape = {
  id: string;
  recette_id: string;
  ordre: number;
  texte: string;
};

export type RecetteComplete = Recette & {
  ingredients: Ingredient[];
  etapes: Etape[];
  categories: Categorie[];
};

export type ListeCourses = {
  id: string;
  foyer_id: string;
  nom: string;
  cree_le: string;
};

export type ArticleListeCourses = {
  id: string;
  liste_id: string;
  libelle: string;
  quantite: number | null;
  unite: string | null;
  coche: boolean;
  ordre: number;
};
