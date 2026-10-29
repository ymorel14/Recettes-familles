-- App Famille, retour de test R-12 (27 octobre 2026) : l'assistant relie
-- chaque étape d'une recette aux ingrédients qu'elle utilise (« salez » →
-- sel, « les épices » → cumin, paprika…), une fois, et l'app garde ce lien
-- pour le mode assistant (route `recette-ingredients` de la fonction Edge
-- `ia`).
--
-- Contenu : {"texte": "<texte de l'étape au moment du lien>",
--            "libelles": ["Sel", "Poivre", …]}
-- Le lien ne vaut que tant que le texte de l'étape n'a pas changé ; on garde
-- les LIBELLÉS (et non les identifiants) parce que les ingrédients sont
-- réenregistrés à chaque modification de la recette.
--
-- AJOUT SEULEMENT : une colonne facultative (vide par défaut). Mêmes règles
-- RLS que l'étape (lecture par la famille, écriture par le foyer). L'app
-- Cuisine actuelle l'ignore ; ses enregistrements ne l'effacent pas.

begin;

alter table recettes.etapes add column if not exists ingredients_cites jsonb;

comment on column recettes.etapes.ingredients_cites is
  'Ingrédients utilisés par l''étape, reliés par l''assistant (app Famille) : {"texte": …, "libelles": […]}. Valable tant que le texte de l''étape n''a pas changé.';

commit;
