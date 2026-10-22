-- Retour arrière MANUEL de 20261023000210_sourcing_import_jobs_resumable.sql.
-- Les imports en cours (status = 'running') perdent leurs lots non traités : terminez-les ou
-- marquez-les « failed » AVANT d'exécuter ce script. L'historique des imports est conservé.
-- À n'exécuter qu'après décision explicite (le code applicatif correspondant doit être retiré avant).
update public.sourcing_import_jobs
  set status = 'failed', finished_at = now(), message = left(coalesce(message || ' ', '') || 'Import interrompu par un retour arrière de la base.', 2000)
  where status = 'running';

drop function if exists public.sourcing_prepare_catalog_import(uuid, uuid, text, text, text, text, text, text, jsonb, jsonb);
drop table if exists public.sourcing_import_chunks;
drop index if exists public.sourcing_import_jobs_running_idx;
alter table public.sourcing_import_jobs
  drop constraint if exists sourcing_import_jobs_progress_check,
  drop column if exists params,
  drop column if exists attempts,
  drop column if exists heartbeat_at,
  drop column if exists lease_expires_at,
  drop column if exists lease_owner,
  drop column if exists chunks_done,
  drop column if exists chunks_total,
  drop column if exists rows_processed,
  drop column if exists rows_total;
