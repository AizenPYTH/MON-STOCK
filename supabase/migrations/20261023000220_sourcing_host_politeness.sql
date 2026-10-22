-- =============================================================================
-- MON STOCK — migration 20261023000220 : politesse par hôte partagée (audit 2026-10-22 : I-16).
--
-- 1. sourcing_host_policies : par hôte (« https://www.exemple.fr ») — cache de robots.txt (règles
--    analysées, statut, date : relu au plus une fois par 24 h au lieu de chaque recherche) et date
--    à partir de laquelle une nouvelle requête vers cet hôte est permise.
-- 2. sourcing_reserve_host_slot : réserve atomiquement le prochain créneau d'un hôte, PARTAGÉ entre
--    utilisateurs, organisations et instances de la fonction serveur (verrou de ligne). Le délai
--    entre deux requêtes est le plus grand de notre délai minimal et du Crawl-delay de robots.txt.
--    Renvoie l'attente (ms) avant la requête, ou -1 si elle dépasse l'attente maximale acceptée
--    (aucun créneau n'est alors réservé).
--
-- Données techniques de plateforme (aucune donnée d'organisation) : serveur uniquement.
-- Additif et non destructif. Retour arrière manuel :
--   supabase/ops/rollback/20261023000220_sourcing_host_politeness_down.sql
-- =============================================================================

create table if not exists public.sourcing_host_policies (
  host text primary key check (char_length(host) between 1 and 255),
  robots_status text check (robots_status is null or robots_status in ('ok', 'missing', 'error')),
  robots_rules jsonb,
  robots_http_status integer,
  robots_error text check (robots_error is null or char_length(robots_error) <= 500),
  robots_fetched_at timestamptz,
  crawl_delay_seconds numeric check (crawl_delay_seconds is null or crawl_delay_seconds >= 0),
  next_allowed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sourcing_host_policies enable row level security;
revoke all on public.sourcing_host_policies from anon, authenticated;
grant all on public.sourcing_host_policies to service_role;

create or replace function public.sourcing_reserve_host_slot(p_host text, p_min_interval_ms integer, p_max_wait_ms integer)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_next timestamptz;
  v_now timestamptz := clock_timestamp();
  v_start timestamptz;
  v_wait_ms integer;
begin
  if p_host is null or char_length(p_host) = 0 or char_length(p_host) > 255 then
    raise exception 'Hôte invalide.' using errcode = '22023';
  end if;
  insert into public.sourcing_host_policies (host, next_allowed_at) values (lower(p_host), v_now) on conflict (host) do nothing;
  select next_allowed_at into v_next from public.sourcing_host_policies where host = lower(p_host) for update;
  v_start := greatest(v_next, v_now);
  v_wait_ms := ceil(extract(epoch from (v_start - v_now)) * 1000)::integer;
  if v_wait_ms > greatest(coalesce(p_max_wait_ms, 0), 0) then
    return -1;
  end if;
  update public.sourcing_host_policies
    set next_allowed_at = v_start + make_interval(secs => greatest(coalesce(p_min_interval_ms, 0), 0) / 1000.0), updated_at = v_now
    where host = lower(p_host);
  return v_wait_ms;
end;
$$;

revoke all on function public.sourcing_reserve_host_slot(text, integer, integer) from public, anon, authenticated;
grant execute on function public.sourcing_reserve_host_slot(text, integer, integer) to service_role;
