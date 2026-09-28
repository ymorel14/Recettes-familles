-- =========================================================================
-- Migration 3 — Correctif CadeauCommun : créer une liste
--
-- Symptôme : "new row violates row-level security policy for table listes"
-- en créant sa liste. À la création, l'app relit la liste qu'elle vient
-- d'insérer (pour ouvrir son écran). La règle "Voir les listes" passe par la
-- fonction wishlist.peut_voir_liste(), qui ne voit pas encore la ligne en
-- cours d'insertion : la relecture était refusée, et l'insertion annulée.
--
-- Correctif : une règle de lecture directe, sans fonction, pour les listes
-- que l'on a soi-même créées. Elle ne donne aucun accès nouveau (le créateur
-- d'une liste la voyait déjà via peut_voir_liste).
-- =========================================================================

begin;

drop policy if exists "Voir les listes que j'ai créées" on wishlist.listes;
create policy "Voir les listes que j'ai créées" on wishlist.listes
  for select using (cree_par = auth.uid());

notify pgrst, 'reload schema';

commit;
