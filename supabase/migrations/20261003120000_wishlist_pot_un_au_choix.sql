-- =========================================================================
-- Migration — CadeauCommun : pot commun sur un souhait "un au choix"
--
-- Un seul article sera offert parmi plusieurs modèles (téléphone…) : la
-- famille peut le financer ensemble avec un pot commun. Les modèles servent
-- alors d'indication ; on participe au pot, on ne réserve pas de modèle
-- (la réservation d'un pot commun reste refusée par
-- wishlist.refuser_reservation_pot).
--
-- Seul le mode "plusieurs à offrir" (chaque option se réserve séparément)
-- reste incompatible avec le pot commun.
--
-- Pré-requis : 20261003110000_wishlist_options.sql.
-- =========================================================================

begin;

alter table wishlist.souhaits drop constraint if exists souhaits_options_sans_pot;
alter table wishlist.souhaits
  add constraint souhaits_options_sans_pot check (not (pot_commun and mode_options = 'toutes'));

notify pgrst, 'reload schema';

commit;
