-- =============================================================================
-- MON STOCK — planification des tâches serveur (pg_cron → Edge Function `api`).
-- À exécuter une fois par projet (SQL editor), en remplaçant <PROJECT_REF>.
-- Le secret CRON_SECRET est lu dans Supabase Vault AU MOMENT de chaque exécution :
-- il n'apparaît ni dans ce fichier ni dans cron.job.
-- =============================================================================
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.call_monstock_cron(p_path text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/api/cron/' || p_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$$;
revoke all on function public.call_monstock_cron(text) from public, anon, authenticated;

-- Synchronisation eBay des connexions dues (intervalle propre à chaque connexion).
select cron.schedule('monstock-ebay-sync', '*/15 * * * *', $$select public.call_monstock_cron('sync')$$);
-- Moteur de sourcing : taux de change, flux échus, crawls, alertes.
select cron.schedule('monstock-sourcing', '7 */6 * * *', $$select public.call_monstock_cron('sourcing')$$);
-- Vérification réelle de la bibliothèque de sources (robots.txt + produits avec prix).
select cron.schedule('monstock-library-checks', '23 4 * * *', $$select public.call_monstock_cron('library-checks')$$);
select cron.schedule('monstock-directory-checks', '41 5 * * *', $$select public.call_monstock_cron('directory-checks')$$);
