// Types correspondant au schéma Postgres : schéma "recettes" (supabase/setup.sql)
// et, pour le compte famille, schéma "famille" commun à toutes les apps
// (supabase/migrations/20260928140000_socle_famille.sql).

// Une famille regroupe plusieurs foyers. Un utilisateur vit dans un seul
// foyer ; un foyer peut appartenir à plusieurs familles (famille.famille_foyers).
export type Famille = {
  id: string;
  nom: string;
  cree_par: string | null;
  cree_le: string;
};

export type Foyer = {
  id: string;
  nom: string;
  cree_par: string;
  // Famille d'origine du foyer (informatif) ; appartenance réelle :
  // famille.famille_foyers.
  famille_id: string | null;
  cree_le: string;
};

export type FoyerMembre = {
  foyer_id: string;
  utilisateur_id: string;
  role: 'membre' | 'administrateur';
  rejoint_le: string;
};

export type TypeCodeInvitation = 'famille' | 'foyer';

// Code "famille" : famille_id renseigné, foyer_id vide.
// Code "foyer" : foyer_id renseigné. Valable 24 h.
export type Invitation = {
  id: string;
  type: TypeCodeInvitation;
  famille_id: string | null;
  foyer_id: string | null;
  code: string;
  creee_par: string;
  creee_le: string;
  expire_le: string;
};

// Réponse de la fonction obtenir_code_invitation.
export type CodeInvitation = {
  code: string;
  expire_le: string;
};

// Groupe de catégories (niveau au-dessus des catégories : Desserts,
// Plats principaux…). La liste vit dans la table recettes.groupes_categories :
// un groupe ajouté dans Supabase apparaît dans l'application sans la modifier.
export type IdGroupeCategorie = string;

export type GroupeCategorie = {
  id: IdGroupeCategorie;
  nom: string;
  description: string;
  ordre: number;
};

export type Categorie = {
  id: string;
  nom: string;
  nom_normalise: string;
  // Groupe de la catégorie ; null = "À classer".
  groupe_id: IdGroupeCategorie | null;
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
  // Note personnelle de 1 à 4 étoiles (null = pas encore notée).
  note: number | null;
  source: 'manuelle' | 'scan' | 'web';
  source_url: string | null;
  cree_par: string;
  cree_le: string;
  maj_le: string;
};

// Élément d'une recette (ex. "Génoise au chocolat", "Crème chantilly" pour
// une forêt noire ; "La pâte", "La garniture" pour une quiche) : regroupe
// des ingrédients et des étapes. Facultatif.
export type ElementRecette = {
  id: string;
  recette_id: string;
  nom: string;
  ordre: number;
};

export type Ingredient = {
  id: string;
  recette_id: string;
  libelle: string;
  quantite: number | null;
  unite: string | null;
  ordre: number;
  element_id?: string | null;
};

export type Etape = {
  id: string;
  recette_id: string;
  ordre: number;
  texte: string;
  // Lien optionnel vers une autre recette du foyer (sous-recette, ex. une
  // pâte brisée utilisée dans une tarte) — voir `RecetteLiee` ci-dessous
  // pour le titre résolu, inclus quand la recette a été chargée via
  // `obtenirRecette`/`listerRecettes`.
  recette_liee_id: string | null;
  element_id?: string | null;
  // Titre de la recette liée, résolu par la jointure Supabase au chargement
  // (voir SELECTION_RECETTE_COMPLETE) — absent tant que l'étape n'a pas été
  // chargée via `obtenirRecette`/`listerRecettes` ; null si aucun lien.
  recette_liee?: RecetteLiee | null;
};

// Titre (et rien d'autre) de la recette liée à une étape, résolu au moment
// du chargement (§8/§4) — juste de quoi afficher un lien, pas la recette
// entière : celle-ci n'est chargée que si l'utilisateur l'ouvre.
export type RecetteLiee = {
  id: string;
  titre: string;
};

// Une photo d'une recette, parmi plusieurs possibles (§4). La première
// (ordre 0) sert aussi de vignette de couverture, recopiée dans
// `recettes.photo_url` pour les écrans qui n'affichent que la couverture.
export type PhotoRecette = {
  id: string;
  recette_id: string;
  url: string;
  ordre: number;
  cree_le: string;
};

export type RecetteComplete = Recette & {
  ingredients: Ingredient[];
  etapes: Etape[];
  categories: Categorie[];
  photos: PhotoRecette[];
  // Éléments de la recette, dans l'ordre (vide = recette d'un seul tenant).
  elements: ElementRecette[];
  // Foyer propriétaire (les recettes des autres foyers de la famille sont
  // visibles en lecture seule).
  foyer?: { id: string; nom: string } | null;
  // Verdicts des essais, pour la note moyenne (voir noteMoyenne).
  essais?: { verdict: number | null }[];
};

// ---------------------------------------------------------------------------
// "Nos essais" : retours d'expérience après avoir réalisé une recette.
// ---------------------------------------------------------------------------

export type Verdict = 1 | 2 | 3 | 4; // Bof, Correcte, Bonne, À refaire !
export type DifficulteRessentie = 'facile' | 'moyenne' | 'difficile';
export type TempsRessenti = 'comme_prevu' | 'plus_long' | 'plus_court';
export type NatureReponse = 'solution' | 'changement';

// Une astuce en réponse à un souci : solution trouvée ou changement apporté.
export type ReponsePoint = {
  id: string;
  point_id: string;
  texte: string;
  nature: NatureReponse;
  ordre: number;
};

// Un souci rencontré et ses astuces (plusieurs possibles). Souci seul ou
// astuces seules (sans souci) possibles. `etape_id` : rattachement à une
// étape, hérité des premiers essais (plus proposé dans le formulaire).
export type PointEssai = {
  id: string;
  essai_id: string;
  souci: string | null;
  etape_id: string | null;
  ordre: number;
  reponses: ReponsePoint[];
};

export type Essai = {
  id: string;
  recette_id: string;
  auteur_id: string;
  foyer_id: string;
  realise_le: string;
  verdict: Verdict | null; // null = pas encore goûtée
  difficulte: DifficulteRessentie | null;
  temps: TempsRessenti | null;
  commentaire: string | null;
  photo_url: string | null;
  cree_le: string;
  maj_le: string;
};

export type EssaiComplet = Essai & {
  points: PointEssai[];
  auteurPrenom: string | null;
  foyerNom: string | null;
};

// Fiche "Aide-mémoire" : une info culinaire transversale, pas liée à une
// recette précise (ex. "Températures à cœur des viandes", "Congélation") —
// à la différence du champ `notes` d'une recette.
export type NoteUtile = {
  id: string;
  foyer_id: string;
  titre: string;
  theme: string;
  contenu: string;
  cree_par: string;
  cree_le: string;
  maj_le: string;
};

// Congélateur (voir supabase/congelateur.sql et services/congelateur.ts).
export type Congelateur = {
  id: string;
  foyer_id: string;
  nom: string;
  cree_par: string;
  cree_le: string;
};

export type AlimentCongele = {
  id: string;
  congelateur_id: string;
  foyer_id: string;
  nom: string;
  type: string; // clé de TYPES_ALIMENTS (services/congelateur.ts)
  date_stockage: string; // AAAA-MM-JJ
  cree_par: string;
  cree_le: string;
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

// Une ligne = la part qu'une recette donnée a apportée à un article de la
// liste de courses (quantité déjà ramenée au nombre de parts choisi). Sert à
// afficher, pour un article, quelles recettes le citent et en quelle
// quantité, et à retirer proprement la contribution d'une seule recette
// (ex. ajoutée deux fois par erreur) sans toucher aux autres.
// `recette_id` est nul si la recette a depuis été supprimée : `recette_titre`
// (mémorisé au moment de l'ajout) reste alors la seule trace de sa provenance.
export type ContributionListeCourses = {
  id: string;
  liste_id: string;
  recette_id: string | null;
  recette_titre: string;
  // Partagé par toutes les lignes d'un même clic sur "Ajouter à la liste de
  // courses" — distinct de `recette_id` : si la même recette est ajoutée
  // deux fois, chaque ajout a son propre `ajout_id`, pour pouvoir retirer
  // seulement l'un des deux (voir `retirerAjoutDeListe`).
  ajout_id: string;
  libelle: string;
  quantite: number | null;
  unite: string | null;
  parts_utilisees: number;
  ajoute_le: string;
};
