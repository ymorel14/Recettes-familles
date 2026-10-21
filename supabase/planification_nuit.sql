-- =========================================================================
-- App Famille — planifier le traitement de nuit de l'assistant (à exécuter
-- UNE fois dans Dashboard > SQL Editor, après la migration
-- 20261021100000_famille_nuit.sql et le déploiement de la fonction ia-nuit).
--
-- Ce n'est pas une migration : la planification est propre à ce projet
-- Supabase (son adresse et sa clé publique « anon », déjà présente dans
-- apps/*/eas.json et dans planification_rappels.sql).
--
-- Deux tâches :
--   1. famille-preparer-nuit : vers 2 h (heure de Paris en hiver, 3 h en
--      été), prépare les faits du jour de chaque personne venue sur
--      l'accueil cette semaine (sous son identité, règles RLS), et une fois
--      par semaine l'historique d'achats de chaque foyer ;
--   2. famille-ia-nuit : toutes les 15 minutes jusqu'au matin, envoie ce
--      travail à l'API Batches (moitié prix) et relève les réponses. Sans
--      travail en attente, l'appel ne coûte rien.
--
-- Pour essayer tout de suite (en journée) : exécuter
--   select famille.preparer_travaux_nuit();
-- (réponse attendue : {"resumes": n, "habituels": m}, n > 0 si quelqu'un a
-- ouvert l'accueil de l'app Famille cette semaine et n'a pas encore de
-- résumé aujourd'hui), puis Dashboard > Edge Functions > ia-nuit > Test,
-- deux fois à quelques minutes d'intervalle (envoi, puis relevé).
--
-- Heures en UTC. Pour arrêter :
--   select cron.unschedule('famille-preparer-nuit');
--   select cron.unschedule('famille-ia-nuit');
-- Derniers passages :
--   select * from cron.job_run_details order by start_time desc limit 20;
-- Travail de la nuit :
--   select nature, statut, count(*) from famille.ia_travaux
--   where jour = (now() at time zone 'Europe/Paris')::date group by 1, 2;
-- =========================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'famille-preparer-nuit',
  '0 1 * * *',
  $$ select famille.preparer_travaux_nuit(); $$
);

select cron.schedule(
  'famille-ia-nuit',
  '5-59/15 1-6 * * *',
  $$
  select net.http_post(
    url := 'https://uarsrjugpqyextaqpsyy.supabase.co/functions/v1/ia-nuit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhcnNyanVncHF5ZXh0YXFwc3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNjkxNDgsImV4cCI6MjEwMzY0NTE0OH0.aS9RhXoh5ansrVMbXJSDDXxoJwkiPkSM-ylfY5-x5Fo'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
