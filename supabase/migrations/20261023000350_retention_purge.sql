-- =============================================================================
-- MON STOCK — migration 20261023000350 : fonction de purge / rétention paramétrée
-- (audit 2026-10-22 : D-10).
--
-- public.purge_retention(...) — service_role uniquement, JAMAIS planifiée par cette migration :
-- la planification (pg_cron) et les durées définitives se décident avec le titulaire
-- (procédure : docs/MIGRATIONS.md, § « Rétention et purge »).
--
--   - p_dry_run (défaut TRUE) : compte ce qui SERAIT purgé, ne supprime rien.
--   - Chaque durée est en jours ; NULL = catégorie ignorée. Minimum 7 jours (garde-fou contre une
--     purge accidentelle de données récentes) sauf p_oauth_states_grace_hours (en heures, >= 1).
--   - Catégories et défauts :
--       sync_runs (terminés, hors dernier run de chaque source ; sync_errors en cascade) ... 90 j
--       webhook_events (traités / ignorés / doublons / en échec ; jamais « received ») ..... 90 j
--       oauth_states expirés (délai de grâce en heures) ................................. 24 h
--       cron.job_run_details (si pg_cron présent et droits suffisants) .................. 30 j
--       supplier_price_history / supplier_stock_history .................. NULL (décision titulaire)
--       alerts résolues .................................................. NULL (décision titulaire)
--       orders.buyer_username anonymisé (mis à NULL) après N jours ......... NULL (décision titulaire)
--   - Conseiller IA (conversations, cartes, actions, ai_usage_events) : NON couvert ici, voir
--     advisor_purge_expired() (migration 20261023000530) pour ne pas avoir deux règles concurrentes.
--   - Renvoie un jsonb : { dry_run, executed_at, counts: { categorie: n, ... }, skipped: [...] }.
--
-- Données existantes : aucune modifiée par la migration elle-même (création de fonction seulement).
-- Retour arrière : supabase/ops/rollback/20261023000350_retention_purge_down.sql
-- =============================================================================

do $pre$
begin
  if to_regclass('public.sync_runs') is null or to_regclass('public.webhook_events') is null
     or to_regclass('public.oauth_states') is null then
    raise exception 'Contrôle préalable 20261023000350 : tables attendues absentes.';
  end if;
end
$pre$;

create or replace function public.purge_retention(
  p_dry_run boolean default true,
  p_sync_runs_days integer default 90,
  p_webhook_events_days integer default 90,
  p_oauth_states_grace_hours integer default 24,
  p_cron_run_details_days integer default 30,
  p_supplier_history_days integer default null,
  p_resolved_alerts_days integer default null,
  p_buyer_username_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dry boolean := coalesce(p_dry_run, true);
  v_counts jsonb := '{}'::jsonb;
  v_skipped text[] := '{}';
  v_n bigint;
  v_n2 bigint;
  v_days integer;
begin
  -- Garde-fous sur les paramètres.
  foreach v_days in array array[p_sync_runs_days, p_webhook_events_days, p_cron_run_details_days,
                                p_supplier_history_days, p_resolved_alerts_days, p_buyer_username_days] loop
    if v_days is not null and v_days < 7 then
      raise exception 'Durée de conservation trop courte (% jours) : 7 jours minimum.', v_days using errcode = '22023';
    end if;
  end loop;
  if p_oauth_states_grace_hours is not null and p_oauth_states_grace_hours < 1 then
    raise exception 'Délai de grâce des états OAuth trop court : 1 heure minimum.' using errcode = '22023';
  end if;

  -- sync_runs terminés (le dernier run de chaque source est toujours conservé) ; sync_errors en cascade.
  if p_sync_runs_days is not null then
    create temporary table if not exists pg_temp.purge_sync_runs (id uuid primary key) on commit drop;
    truncate pg_temp.purge_sync_runs;
    insert into pg_temp.purge_sync_runs (id)
    select r.id
    from public.sync_runs r
    where r.status <> 'running'
      and coalesce(r.finished_at, r.started_at) < now() - make_interval(days => p_sync_runs_days)
      and r.id not in (
        select distinct on (coalesce(x.source_ref::text, x.organization_id::text || ':' || x.source_kind)) x.id
        from public.sync_runs x
        order by coalesce(x.source_ref::text, x.organization_id::text || ':' || x.source_kind), x.started_at desc
      );
    select count(*) into v_n from pg_temp.purge_sync_runs;
    select count(*) into v_n2 from public.sync_errors e where e.sync_run_id in (select id from pg_temp.purge_sync_runs);
    if not v_dry then
      delete from public.sync_runs where id in (select id from pg_temp.purge_sync_runs);
    end if;
    v_counts := v_counts || jsonb_build_object('sync_runs', v_n, 'sync_errors', v_n2);
  end if;

  if p_webhook_events_days is not null then
    if v_dry then
      select count(*) into v_n from public.webhook_events
      where status in ('processed', 'ignored', 'duplicate', 'failed') and received_at < now() - make_interval(days => p_webhook_events_days);
    else
      delete from public.webhook_events
      where status in ('processed', 'ignored', 'duplicate', 'failed') and received_at < now() - make_interval(days => p_webhook_events_days);
      get diagnostics v_n = row_count;
    end if;
    v_counts := v_counts || jsonb_build_object('webhook_events', v_n);
  end if;

  if p_oauth_states_grace_hours is not null then
    if v_dry then
      select count(*) into v_n from public.oauth_states where expires_at < now() - make_interval(hours => p_oauth_states_grace_hours);
    else
      delete from public.oauth_states where expires_at < now() - make_interval(hours => p_oauth_states_grace_hours);
      get diagnostics v_n = row_count;
    end if;
    v_counts := v_counts || jsonb_build_object('oauth_states', v_n);
  end if;

  if p_cron_run_details_days is not null then
    if to_regclass('cron.job_run_details') is null then
      v_skipped := v_skipped || 'cron.job_run_details (pg_cron absent)'::text;
    else
      begin
        if v_dry then
          execute 'select count(*) from cron.job_run_details where end_time < now() - make_interval(days => $1)' into v_n using p_cron_run_details_days;
        else
          execute 'delete from cron.job_run_details where end_time < now() - make_interval(days => $1)' using p_cron_run_details_days;
          get diagnostics v_n = row_count;
        end if;
        v_counts := v_counts || jsonb_build_object('cron_job_run_details', v_n);
      exception when insufficient_privilege then
        v_skipped := v_skipped || 'cron.job_run_details (droits insuffisants)'::text;
      end;
    end if;
  end if;

  if p_supplier_history_days is not null then
    if v_dry then
      select count(*) into v_n from public.supplier_price_history where recorded_at < now() - make_interval(days => p_supplier_history_days);
      select count(*) into v_n2 from public.supplier_stock_history where recorded_at < now() - make_interval(days => p_supplier_history_days);
    else
      delete from public.supplier_price_history where recorded_at < now() - make_interval(days => p_supplier_history_days);
      get diagnostics v_n = row_count;
      delete from public.supplier_stock_history where recorded_at < now() - make_interval(days => p_supplier_history_days);
      get diagnostics v_n2 = row_count;
    end if;
    v_counts := v_counts || jsonb_build_object('supplier_price_history', v_n, 'supplier_stock_history', v_n2);
  end if;

  if p_resolved_alerts_days is not null then
    if v_dry then
      select count(*) into v_n from public.alerts where status = 'resolved' and coalesce(resolved_at, updated_at) < now() - make_interval(days => p_resolved_alerts_days);
    else
      delete from public.alerts where status = 'resolved' and coalesce(resolved_at, updated_at) < now() - make_interval(days => p_resolved_alerts_days);
      get diagnostics v_n = row_count;
    end if;
    v_counts := v_counts || jsonb_build_object('alerts_resolved', v_n);
  end if;

  if p_buyer_username_days is not null then
    if v_dry then
      select count(*) into v_n from public.orders where buyer_username is not null and placed_at < now() - make_interval(days => p_buyer_username_days);
    else
      update public.orders set buyer_username = null
      where buyer_username is not null and placed_at < now() - make_interval(days => p_buyer_username_days);
      get diagnostics v_n = row_count;
    end if;
    v_counts := v_counts || jsonb_build_object('orders_buyer_username_anonymized', v_n);
  end if;

  return jsonb_build_object('dry_run', v_dry, 'executed_at', now(), 'counts', v_counts, 'skipped', to_jsonb(v_skipped));
end;
$$;

revoke all on function public.purge_retention(boolean, integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.purge_retention(boolean, integer, integer, integer, integer, integer, integer, integer) to service_role;

comment on function public.purge_retention(boolean, integer, integer, integer, integer, integer, integer, integer) is
  'D-10 : purge paramétrée (simulation par défaut). Non planifiée : voir docs/MIGRATIONS.md.';
