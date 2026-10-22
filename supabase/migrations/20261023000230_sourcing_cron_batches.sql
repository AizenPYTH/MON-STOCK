-- =============================================================================
-- MON STOCK — migration 20261023000230 : tâches planifiées des traitements par lots du sourcing
-- (audit 2026-10-22 : S-02 / I-06, S-04).
--
--   * monstock-library-checks-rotation : passages supplémentaires de /cron/library-checks (toutes
--     les 3 h). Chaque passage ne vérifie qu'un LOT borné, les sources les moins récemment
--     vérifiées d'abord : la bibliothèque entière est revue en moins de 24 h. La tâche
--     quotidienne existante (monstock-library-checks) est conservée telle quelle.
--   * monstock-sourcing-imports : reprise des imports de catalogues et de flux traités par lots
--     (/cron/sourcing-imports, toutes les 5 min, budget borné ; sans import en cours, la route ne
--     fait qu'une lecture).
--
-- Appelle public.call_monstock_cron (créée par l'ops historique ou la migration 20261023000700),
-- résolue au moment de chaque exécution. Sans pg_cron (base locale de test) : aucun effet.
-- N'ajoute que deux tâches NOUVELLES (noms dédiés) ; ne modifie aucune tâche existante.
-- Retour arrière : supabase/ops/rollback/20261023000230_sourcing_cron_batches_down.sql
-- =============================================================================
do $migration$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'sourcing_cron_batches : pg_cron absent : migration sans effet sur cette base.';
    return;
  end if;
  perform cron.schedule('monstock-library-checks-rotation', '53 1-22/3 * * *', $cmd$select public.call_monstock_cron('library-checks')$cmd$);
  perform cron.schedule('monstock-sourcing-imports', '*/5 * * * *', $cmd$select public.call_monstock_cron('sourcing-imports')$cmd$);
end
$migration$;
