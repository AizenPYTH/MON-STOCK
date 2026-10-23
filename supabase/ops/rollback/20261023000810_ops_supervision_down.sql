-- Retour arrière MANUEL de 20261023000810_ops_supervision.sql (D-06).
-- Retire la tâche planifiée (si pg_cron est présent), la fonction et le journal de supervision.
-- Les alertes « sync_stale » déjà créées restent (données visibles par les utilisateurs) ; pour les
-- clore aussi :
--   update public.alerts set status = 'resolved', resolved_at = now() where type = 'sync_stale' and status <> 'resolved';
do $rollback$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron absent : aucune tâche à retirer.';
    return;
  end if;
  -- Requête dynamique : cron.job n'existe que si pg_cron est installé.
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'monstock-supervision'$q$;
  end if;
end
$rollback$;
drop function if exists public.ops_supervise(interval);
drop table if exists public.ops_supervision_events;
