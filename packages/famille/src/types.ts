// Types du compte famille (schéma Postgres "famille", commun à toutes les
// apps de la famille : supabase/migrations/20260928140000_socle_famille.sql).

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
