-- =============================================================================
-- Audit du 10 octobre 2026 : durcissement + offres enregistrées (radar) + quotas IA.
--
-- 1. Fonctions de déclencheur SECURITY DEFINER : plus d'exécution directe via l'API
--    (elles restent appelées par leurs déclencheurs ; le privilège EXECUTE n'est vérifié
--    qu'à la création du déclencheur).
-- 2. search_path figé sur les fonctions qui n'en avaient pas (avertissement Supabase 0011).
-- 3. sourcing_saved_offers : offres mises de côté pour comparaison (radar d'opportunités).
-- 4. ai_usage_events : journal minimal des appels IA (quotas par utilisateur / organisation).
--
-- Réversible : voir le bloc « down » commenté en fin de fichier. Aucune donnée supprimée.
-- =============================================================================

-- 1 ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end
$$;

-- 2 ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'set_updated_at', 'normalize_text', 'is_service_role', 'create_inventory_for_sku',
        'offer_before_update', 'record_sku_price_history', 'record_offer_history',
        'resolve_sku_for_line', 'normalize_invitation', 'guard_catalog_delete',
        'purchase_orders_guard_delete', 'purchase_order_items_before_write', 'purchase_orders_before_write'
      )
      and p.proconfig is null
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end
$$;

-- 3 ---------------------------------------------------------------------------
create table if not exists public.sourcing_saved_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  offer_id uuid not null references public.sourcing_offers (id) on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  -- prix et devise au moment de l'enregistrement (pour comparer plus tard, jamais modifiés)
  price_at_save numeric(14, 2),
  currency_at_save text check (currency_at_save is null or currency_at_save ~ '^[A-Z]{3}$'),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, offer_id)
);

create index if not exists sourcing_saved_offers_org_idx on public.sourcing_saved_offers (organization_id, created_at desc);

alter table public.sourcing_saved_offers enable row level security;

drop policy if exists sourcing_saved_offers_select on public.sourcing_saved_offers;
create policy sourcing_saved_offers_select on public.sourcing_saved_offers
  for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists sourcing_saved_offers_insert on public.sourcing_saved_offers;
create policy sourcing_saved_offers_insert on public.sourcing_saved_offers
  for insert to authenticated
  with check (
    public.can_write_org(organization_id)
    and exists (select 1 from public.sourcing_offers o where o.id = offer_id and o.organization_id = sourcing_saved_offers.organization_id)
  );

drop policy if exists sourcing_saved_offers_update on public.sourcing_saved_offers;
create policy sourcing_saved_offers_update on public.sourcing_saved_offers
  for update to authenticated
  using (public.can_write_org(organization_id))
  with check (public.can_write_org(organization_id));

drop policy if exists sourcing_saved_offers_delete on public.sourcing_saved_offers;
create policy sourcing_saved_offers_delete on public.sourcing_saved_offers
  for delete to authenticated using (public.can_write_org(organization_id));

-- Le prix relevé à l'enregistrement est figé (l'organisation est protégée par le garde-fou générique).
create or replace function public.sourcing_saved_offers_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.price_at_save is distinct from old.price_at_save or new.currency_at_save is distinct from old.currency_at_save then
    raise exception 'SAVED_OFFER_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists sourcing_saved_offers_guard on public.sourcing_saved_offers;
create trigger sourcing_saved_offers_guard before update on public.sourcing_saved_offers
  for each row execute function public.sourcing_saved_offers_guard();

grant select, insert, update, delete on public.sourcing_saved_offers to authenticated;

-- 4 ---------------------------------------------------------------------------
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('assistant', 'product_draft')),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_idx on public.ai_usage_events (user_id, created_at desc);
create index if not exists ai_usage_events_org_idx on public.ai_usage_events (organization_id, created_at desc);

alter table public.ai_usage_events enable row level security;

drop policy if exists ai_usage_events_select on public.ai_usage_events;
create policy ai_usage_events_select on public.ai_usage_events
  for select to authenticated
  using (user_id = auth.uid() or public.is_org_admin(organization_id));

drop policy if exists ai_usage_events_insert on public.ai_usage_events;
create policy ai_usage_events_insert on public.ai_usage_events
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_org_member(organization_id) and created_at >= now() - interval '1 minute');

grant select, insert on public.ai_usage_events to authenticated;

-- down (manuel) :
--   drop table public.ai_usage_events; drop table public.sourcing_saved_offers;
--   drop function public.sourcing_saved_offers_guard();
--   grant execute on function <fonctions de déclencheur> to authenticated;
--   alter function <fonction> reset search_path;

-- Garde-fou « même organisation » sur les clés étrangères métier (comme toutes les tables à organization_id).
select public.install_same_org_guards('public.sourcing_saved_offers'::regclass);
select public.install_same_org_guards('public.ai_usage_events'::regclass);
