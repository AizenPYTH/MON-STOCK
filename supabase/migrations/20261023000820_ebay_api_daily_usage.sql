-- =============================================================================
-- MON STOCK — migration 20261023000820 : compteur quotidien d'appels eBay par connexion (audit I-12).
--
-- Avant : aucun compteur des appels aux API eBay (Trading, REST). La limite quotidienne des appels
-- Trading est fixée PAR APPLICATION eBay (toutes connexions confondues) ; on ne voyait rien venir.
--
-- Après (simple, volontairement) :
--   1. ebay_api_usage_daily : une ligne par connexion et par jour UTC, nombre d'appels HTTP faits par
--      les synchronisations (compté par le moteur, enregistré en fin de run).
--   2. ebay_api_usage_add(p_connection_id, p_calls) : ajoute les appels du run au jour courant (UTC),
--      atomiquement (insert … on conflict do update), et renvoie { usage_date, calls, app_calls } :
--      total de la connexion et total de TOUTES les connexions pour le jour (quota de l'application).
--      Le serveur journalise et crée une alerte quand un seuil est approché (src/services/channels/ebay-api-usage.ts).
--   Lecture : membres de l'organisation (sous RLS) ; écriture : service_role seulement.
--
-- Non destructive et idempotente. Aucune donnée existante touchée.
-- Retour arrière : supabase/ops/rollback/20261023000820_ebay_api_daily_usage_down.sql
-- =============================================================================

create table if not exists public.ebay_api_usage_daily (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.channel_connections (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  usage_date date not null,
  calls integer not null default 0 check (calls >= 0),
  updated_at timestamptz not null default now(),
  unique (connection_id, usage_date)
);

comment on table public.ebay_api_usage_daily is 'MON STOCK : appels HTTP aux API eBay par connexion et par jour UTC (I-12). Écrit par ebay_api_usage_add (service_role).';

create index if not exists ebay_api_usage_daily_org_idx on public.ebay_api_usage_daily (organization_id, usage_date desc);
create index if not exists ebay_api_usage_daily_date_idx on public.ebay_api_usage_daily (usage_date);

alter table public.ebay_api_usage_daily enable row level security;
-- Garde-fou commun : organisation de la ligne = organisation des objets référencés (idempotent).
select public.install_same_org_guards('public.ebay_api_usage_daily'::regclass);
revoke all on public.ebay_api_usage_daily from public, anon, authenticated;
grant select on public.ebay_api_usage_daily to authenticated;

drop policy if exists ebay_api_usage_daily_select on public.ebay_api_usage_daily;
create policy ebay_api_usage_daily_select on public.ebay_api_usage_daily
  for select to authenticated
  using (public.is_org_member(organization_id));

create or replace function public.ebay_api_usage_add(p_connection_id uuid, p_calls integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_day date := (now() at time zone 'utc')::date;
  v_calls integer;
  v_app bigint;
begin
  if p_connection_id is null or p_calls is null or p_calls < 0 or p_calls > 1000000 then
    raise exception 'EBAY_API_USAGE_INVALID' using errcode = '22023';
  end if;
  select c.organization_id into v_org from public.channel_connections c where c.id = p_connection_id;
  if v_org is null then
    return jsonb_build_object('usage_date', v_day, 'calls', null, 'app_calls', null);
  end if;
  insert into public.ebay_api_usage_daily as u (connection_id, organization_id, usage_date, calls, updated_at)
    values (p_connection_id, v_org, v_day, p_calls, now())
    on conflict (connection_id, usage_date) do update set calls = u.calls + excluded.calls, updated_at = now()
    returning u.calls into v_calls;
  select coalesce(sum(u.calls), 0) into v_app from public.ebay_api_usage_daily u where u.usage_date = v_day;
  return jsonb_build_object('usage_date', v_day, 'calls', v_calls, 'app_calls', v_app);
end;
$$;

revoke all on function public.ebay_api_usage_add(uuid, integer) from public, anon, authenticated;
grant execute on function public.ebay_api_usage_add(uuid, integer) to service_role;

comment on function public.ebay_api_usage_add(uuid, integer) is 'MON STOCK : ajoute les appels eBay d''un run au compteur du jour UTC (I-12), service_role uniquement (migration 20261023000820).';
