-- =========================================================================
-- Migration 6 — CadeauCommun : date de remise des cadeaux
--
-- Un anniversaire a deux dates : la vraie date (date_evenement) et le jour
-- où la famille offre les cadeaux, souvent autour d'un repas (date_remise).
-- Facultative : vide = les cadeaux sont offerts le jour même. L'app compte
-- les jours jusqu'à la date de remise quand elle existe.
-- =========================================================================

begin;

alter table wishlist.evenements
  add column if not exists date_remise date;

comment on column wishlist.evenements.date_remise is
  'Jour où les cadeaux sont offerts (repas de famille…). Vide : le jour de l''événement.';

notify pgrst, 'reload schema';

commit;
