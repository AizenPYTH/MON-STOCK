-- Retour arrière MANUEL de 20261023000230_sourcing_cron_batches.sql : retire les deux tâches
-- ajoutées (les tâches historiques restent). Les imports en cours ne sont alors repris que par le
-- passage /cron/sourcing (toutes les 6 h) ou par l'utilisateur (POST /sourcing/imports/resume).
do $rollback$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'monstock-library-checks-rotation') then
    perform cron.unschedule('monstock-library-checks-rotation');
  end if;
  if exists (select 1 from cron.job where jobname = 'monstock-sourcing-imports') then
    perform cron.unschedule('monstock-sourcing-imports');
  end if;
end
$rollback$;
