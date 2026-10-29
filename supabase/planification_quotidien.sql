-- =========================================================================
-- App Famille — Quotidien : planifier les rappels du matin (à exécuter UNE
-- fois dans Dashboard > SQL Editor, après la migration
-- 20261028120000_quotidien_rappels_maison.sql).
--
-- Ce n'est pas une migration : la planification est propre à ce projet
-- Supabase. pg_cron est en UTC : la fonction est appelée à 05 h et à 06 h
-- UTC et ne fait quelque chose qu'à 7 h à Paris (heure d'été ou d'hiver).
--
-- Pour arrêter : select cron.unschedule('quotidien-rappels-du-jour');
-- Derniers passages :
--   select * from cron.job_run_details order by start_time desc limit 10;
-- Essai à la main (sans attendre 7 h) : select quotidien.creer_rappels_du_jour(true);
-- =========================================================================

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'quotidien-rappels-du-jour',
  '0 5,6 * * *',
  $$ select quotidien.creer_rappels_du_jour(); $$
);

-- -------------------------------------------------------------------------
-- Bilan du dimanche (19 h), relance du mardi (19 h), trajets sans personne
-- (18 h) : après la migration 20261028140000_quotidien_notifications.sql.
-- Appelés à deux heures UTC, ils ne font quelque chose qu'à la bonne heure
-- de Paris.
-- -------------------------------------------------------------------------

select cron.schedule('quotidien-bilans-dimanche', '0 17,18 * * 0', $$ select quotidien.bilans_du_dimanche(); $$);
select cron.schedule('quotidien-bilans-relance', '0 17,18 * * 2', $$ select quotidien.relancer_bilans(); $$);
select cron.schedule('quotidien-trajets-libres', '0 16,17 * * *', $$ select quotidien.alerter_trajets_libres(); $$);

-- Pour arrêter : select cron.unschedule('quotidien-bilans-dimanche');
--                select cron.unschedule('quotidien-bilans-relance');
--                select cron.unschedule('quotidien-trajets-libres');
