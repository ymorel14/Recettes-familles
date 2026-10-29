-- App Famille, retour de test M-1 (27 octobre 2026) : l'aide-mémoire des
-- autres foyers de mes familles devient visible, en LECTURE SEULE, comme
-- les recettes. Change la ligne r07 du tableau des droits (« Aide-mémoire :
-- visible Chez nous ») : désormais visible Chez nous + lecture dans nos
-- familles.
--
-- AJOUT SEULEMENT : une nouvelle règle de lecture à côté de « Voir les
-- fiches pratiques de son foyer » (supabase/setup.sql), qui reste en place.
-- Créer, modifier et supprimer restent réservés à son foyer (règles
-- inchangées). L'app Cuisine actuelle ne lit que son foyer
-- (`.eq('foyer_id', …)`) : elle ne voit aucune différence.
--
-- Revenir en arrière : drop policy "Voir l'aide-mémoire de mes familles"
-- on recettes.notes_utiles;

begin;

drop policy if exists "Voir l'aide-mémoire de mes familles" on recettes.notes_utiles;
create policy "Voir l'aide-mémoire de mes familles" on recettes.notes_utiles
  for select using (foyer_id in (select famille.foyers_de_mes_familles()));

commit;
