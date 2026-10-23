-- =============================================================================
-- MON STOCK — migration 20261023000810 : supervision des tâches planifiées (audit D-06, S-17, Q-07)
-- -----------------------------------------------------------------------------
-- Avant : pg_net est asynchrone ; cron.job_run_details dit « succeeded » dès que la requête HTTP
-- vers l'Edge est MISE EN FILE, même si l'Edge répond 546 / 503. Les réponses ne restent que ~6 h
-- dans net._http_response et personne n'est alerté. Une connexion eBay pouvait rester 16 h sans
-- synchronisation réussie sans aucun signal (D-01).
--
-- Après :
--   1. ops_supervision_events : journal de supervision (plateforme, pas de données client) :
--        - 'cron_http_failure' : copie des réponses NON 2xx (ou délai, ou erreur réseau) de
--          net._http_response, conservée 30 jours (au lieu de ~6 h) ;
--        - 'sync_stale' : connexion de vente active sans synchronisation RÉUSSIE depuis plus de
--          2 h (ou 2 × son intervalle de synchronisation s'il est plus long).
--      RLS active, aucune politique, aucun droit client.
--   2. ops_supervise() : exécute les deux contrôles, crée ou met à jour une alerte 'sync_stale' dans
--      la table `alerts` existante (organisation de la connexion, déduplication par connexion) et
--      résout ces alertes quand la connexion se synchronise de nouveau. Idempotente.
--   3. Planification toutes les 15 min (tâche 'monstock-supervision') UNIQUEMENT si pg_cron est
--      installé (même approche que 20261023000700) ; sans pg_cron (PostgreSQL local, CI) : NOTICE.
--      Aucun appel HTTP, aucun secret : la tâche ne lit que la base.
--
-- Non destructive et idempotente. Aucune donnée existante modifiée (hors création d'alertes).
-- Retour arrière : supabase/ops/rollback/20261023000810_ops_supervision_down.sql
-- =============================================================================

create table if not exists public.ops_supervision_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('cron_http_failure', 'sync_stale')),
  -- identifiant de la source : id de net._http_response, ou id de la connexion
  source_ref text not null check (length(source_ref) between 1 and 100),
  organization_id uuid references public.organizations (id) on delete cascade,
  status_code integer,
  message text check (message is null or length(message) <= 1000),
  details jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrences integer not null default 1 check (occurrences >= 1),
  resolved_at timestamptz,
  unique (kind, source_ref)
);

comment on table public.ops_supervision_events is 'MON STOCK : supervision des tâches planifiées (D-06) : réponses HTTP non 2xx de pg_net et connexions sans synchronisation réussie. Écrit par ops_supervise() uniquement.';

create index if not exists ops_supervision_events_open_idx on public.ops_supervision_events (kind, last_seen_at desc) where resolved_at is null;
create index if not exists ops_supervision_events_seen_idx on public.ops_supervision_events (last_seen_at);

alter table public.ops_supervision_events enable row level security;
-- Garde-fou commun : organisation de la ligne = organisation des objets référencés (idempotent).
select public.install_same_org_guards('public.ops_supervision_events'::regclass);
revoke all on public.ops_supervision_events from public, anon, authenticated;

create or replace function public.ops_supervise(p_stale_after interval default interval '2 hours')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_http integer := 0;
  v_stale integer := 0;
  v_resolved integer := 0;
  v_net boolean := to_regclass('net._http_response') is not null;
begin
  if p_stale_after is null or p_stale_after < interval '15 minutes' then
    raise exception 'OPS_SUPERVISE_INTERVAL_INVALID' using errcode = '22023';
  end if;

  -- 1. Réponses HTTP en échec des appels pg_net (tâches planifiées → Edge Function). Requête
  --    dynamique : la table n'existe que si pg_net est installé.
  if v_net then
    execute $q$
      with failed as (
        select r.id, r.status_code, r.timed_out, r.error_msg, left(coalesce(r.content, ''), 500) as excerpt, r.created
        from net._http_response r
        where r.created > now() - interval '1 day'
          and (r.status_code is null or r.status_code not between 200 and 299 or coalesce(r.timed_out, false) or r.error_msg is not null)
      ), ins as (
        insert into public.ops_supervision_events (kind, source_ref, status_code, message, details, first_seen_at, last_seen_at)
        select 'cron_http_failure', f.id::text, f.status_code,
               left(coalesce(f.error_msg, case when coalesce(f.timed_out, false) then 'délai dépassé' end, 'HTTP ' || coalesce(f.status_code::text, '?')), 1000),
               jsonb_build_object('timed_out', coalesce(f.timed_out, false), 'excerpt', f.excerpt),
               f.created, f.created
        from failed f
        on conflict (kind, source_ref) do nothing
        returning 1
      )
      select count(*)::int from ins
    $q$ into v_http;
  end if;

  -- 2. Connexions actives sans synchronisation réussie récente.
  with stale as (
    select c.id, c.organization_id, c.provider, c.external_username, c.last_successful_sync_at
    from public.channel_connections c
    where c.status in ('connected', 'error')
      and c.auto_sync
      and coalesce(c.last_successful_sync_at, c.created_at) < now() - greatest(p_stale_after, make_interval(mins => 2 * greatest(coalesce(c.sync_interval_minutes, 0), 0)))
  ), ev as (
    insert into public.ops_supervision_events as e (kind, source_ref, organization_id, message, details)
    select 'sync_stale', s.id::text, s.organization_id, 'Aucune synchronisation réussie depuis ' || coalesce(to_char(s.last_successful_sync_at at time zone 'utc', 'YYYY-MM-DD HH24:MI "UTC"'), 'la connexion'),
           jsonb_build_object('provider', s.provider, 'last_successful_sync_at', s.last_successful_sync_at)
    from stale s
    on conflict (kind, source_ref) do update
      set last_seen_at = now(), occurrences = e.occurrences + 1, message = excluded.message, details = excluded.details,
          -- un nouvel épisode après résolution repart de zéro
          first_seen_at = case when e.resolved_at is not null then now() else e.first_seen_at end,
          resolved_at = null
    returning 1
  ), al as (
    insert into public.alerts as a (organization_id, type, severity, title, message, dedupe_key, entity_type, entity_id, action_href, status)
    select s.organization_id, 'sync_stale', 'warning',
           'Synchronisation ' || case s.provider::text when 'ebay' then 'eBay' else s.provider::text end || ' en retard',
           'Aucune synchronisation réussie ' || case when s.last_successful_sync_at is null then 'depuis la connexion du compte' else 'depuis le ' || to_char(s.last_successful_sync_at at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI') end
             || ' : les ventes et le stock peuvent ne pas être à jour. Consultez l''historique de synchronisation.',
           'sync_stale:' || s.id::text, 'channel_connection', s.id, '/settings/integrations', 'open'
    from stale s
    on conflict (organization_id, dedupe_key) where status <> 'resolved' do update
      set message = excluded.message, title = excluded.title
    returning 1
  )
  select (select count(*) from ev)::int into v_stale;

  -- 3. Résolution : connexion de nouveau synchronisée (ou plus active).
  with fresh as (
    select c.id
    from public.channel_connections c
    where not (
      c.status in ('connected', 'error')
      and c.auto_sync
      and coalesce(c.last_successful_sync_at, c.created_at) < now() - greatest(p_stale_after, make_interval(mins => 2 * greatest(coalesce(c.sync_interval_minutes, 0), 0)))
    )
  ), ev as (
    update public.ops_supervision_events e set resolved_at = now()
    where e.kind = 'sync_stale' and e.resolved_at is null and e.source_ref in (select f.id::text from fresh f)
    returning 1
  ), al as (
    update public.alerts a set status = 'resolved', resolved_at = now()
    where a.type = 'sync_stale' and a.status <> 'resolved' and a.entity_id in (select f.id from fresh f)
    returning 1
  )
  select (select count(*) from al)::int into v_resolved;

  -- 4. Rétention : 30 jours.
  delete from public.ops_supervision_events e where e.last_seen_at < now() - interval '30 days';

  return jsonb_build_object('pg_net', v_net, 'http_failures_recorded', v_http, 'stale_connections', v_stale, 'alerts_resolved', v_resolved);
end;
$$;

revoke all on function public.ops_supervise(interval) from public, anon, authenticated;
grant execute on function public.ops_supervise(interval) to service_role;

comment on function public.ops_supervise(interval) is 'MON STOCK : supervision (D-06) — copie des réponses pg_net non 2xx, alertes « synchronisation en retard » (migration 20261023000810).';

-- Planification : seulement si pg_cron est présent. cron.schedule avec un nom existant met la tâche à jour.
do $schedule$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'ops_supervise : pg_cron absent : tâche de supervision non planifiée sur cette base.';
    return;
  end if;
  perform cron.schedule('monstock-supervision', '*/15 * * * *', $cmd$select public.ops_supervise()$cmd$);
end
$schedule$;
