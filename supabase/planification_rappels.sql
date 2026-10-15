-- =========================================================================
-- Quotidien — planifier les rappels de la veille (à exécuter UNE fois dans
-- Dashboard > SQL Editor, après avoir déployé la fonction rappels-veille).
--
-- Ce n'est pas une migration : la planification est propre à ce projet
-- Supabase (son adresse et sa clé publique « anon », déjà présente dans
-- apps/*/eas.json).
--
-- Heure : les planifications Supabase sont en heure UTC. « 0 16 * * * »
-- = 18 h à Paris en été, 17 h en hiver.
--
-- Pour arrêter : select cron.unschedule('quotidien-rappels-veille');
-- Pour voir les derniers passages :
--   select * from cron.job_run_details order by start_time desc limit 10;
-- =========================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'quotidien-rappels-veille',
  '0 16 * * *',
  $$
  select net.http_post(
    url := 'https://uarsrjugpqyextaqpsyy.supabase.co/functions/v1/rappels-veille',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhcnNyanVncHF5ZXh0YXFwc3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNjkxNDgsImV4cCI6MjEwMzY0NTE0OH0.aS9RhXoh5ansrVMbXJSDDXxoJwkiPkSM-ylfY5-x5Fo'
    ),
    body := '{}'::jsonb
  );
  $$
);
