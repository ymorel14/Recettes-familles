-- =========================================================================
-- App Famille — envoyer les nouveautés sur les téléphones (à exécuter UNE
-- fois dans Dashboard > SQL Editor, après la migration
-- 20261021120000_famille_notifications_modules.sql et le déploiement de la
-- fonction envoyer-notifications).
--
-- Ce n'est pas une migration : la planification est propre à ce projet
-- Supabase (son adresse et sa clé publique « anon », déjà présente dans
-- apps/*/eas.json et planification_rappels.sql).
--
-- Chaque minute. Sans nouveauté à envoyer, l'appel ne fait rien.
--
-- Pour arrêter : select cron.unschedule('famille-envoyer-notifications');
-- Derniers passages :
--   select * from cron.job_run_details order by start_time desc limit 10;
-- =========================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'famille-envoyer-notifications',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://uarsrjugpqyextaqpsyy.supabase.co/functions/v1/envoyer-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhcnNyanVncHF5ZXh0YXFwc3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNjkxNDgsImV4cCI6MjEwMzY0NTE0OH0.aS9RhXoh5ansrVMbXJSDDXxoJwkiPkSM-ylfY5-x5Fo'
    ),
    body := '{}'::jsonb
  );
  $$
);
