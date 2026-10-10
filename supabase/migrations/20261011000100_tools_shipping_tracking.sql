-- =============================================================================
-- « Mes outils » : grilles de frais de port saisies par l'utilisateur et suivi de colis.
--
-- shipping_rate_cards : tarifs saisis par l'organisation (aucun tarif fourni par MON STOCK).
-- tracked_parcels     : colis suivis. Le statut, les événements et la date de livraison estimée
--                       ne sont écrits QUE par le serveur (réponse d'une API de suivi) : les
--                       utilisateurs ne peuvent modifier que le libellé, le transporteur choisi,
--                       la commande associée et l'archivage (privilèges par colonne).
-- RLS : lecture membres, écriture rédacteurs ; gardes « même organisation » installées.
-- Réversible : drop table (aucune donnée existante modifiée).
-- =============================================================================

create table if not exists public.shipping_rate_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  carrier text not null check (char_length(btrim(carrier)) between 1 and 80),
  service text not null default '' check (char_length(service) <= 80),
  from_countries text[] not null default '{}' check (array_length(from_countries, 1) is null or array_length(from_countries, 1) <= 60),
  to_countries text[] not null default '{}' check (array_length(to_countries, 1) is null or array_length(to_countries, 1) <= 250),
  -- tranches [{ "maxWeightKg": 1, "price": "7.35" }] (prix en texte décimal exact)
  bands jsonb not null check (jsonb_typeof(bands) = 'array' and jsonb_array_length(bands) between 1 and 40),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  max_length_cm numeric(6, 1) check (max_length_cm is null or max_length_cm > 0),
  max_dimensions_sum_cm numeric(6, 1) check (max_dimensions_sum_cm is null or max_dimensions_sum_cm > 0),
  volumetric_divisor integer check (volumetric_divisor is null or volumetric_divisor between 1000 and 10000),
  transit_days_min smallint check (transit_days_min is null or transit_days_min between 0 and 90),
  transit_days_max smallint check (transit_days_max is null or transit_days_max between 0 and 90),
  tracking boolean,
  delivery_mode text check (delivery_mode is null or char_length(delivery_mode) <= 80),
  notes text check (notes is null or char_length(notes) <= 300),
  verified_at date,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (transit_days_min is null or transit_days_max is null or transit_days_min <= transit_days_max),
  check (array_to_string(from_countries, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$' and array_to_string(to_countries, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$')
);

create index if not exists shipping_rate_cards_org_idx on public.shipping_rate_cards (organization_id, carrier);

drop trigger if exists shipping_rate_cards_set_updated_at on public.shipping_rate_cards;
create trigger shipping_rate_cards_set_updated_at before update on public.shipping_rate_cards
  for each row execute function public.set_updated_at();

alter table public.shipping_rate_cards enable row level security;

drop policy if exists shipping_rate_cards_select on public.shipping_rate_cards;
create policy shipping_rate_cards_select on public.shipping_rate_cards
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists shipping_rate_cards_insert on public.shipping_rate_cards;
create policy shipping_rate_cards_insert on public.shipping_rate_cards
  for insert to authenticated with check (public.can_write_org(organization_id));
drop policy if exists shipping_rate_cards_update on public.shipping_rate_cards;
create policy shipping_rate_cards_update on public.shipping_rate_cards
  for update to authenticated using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));
drop policy if exists shipping_rate_cards_delete on public.shipping_rate_cards;
create policy shipping_rate_cards_delete on public.shipping_rate_cards
  for delete to authenticated using (public.can_write_org(organization_id));

grant select, insert, update, delete on public.shipping_rate_cards to authenticated;

-- -----------------------------------------------------------------------------

create table if not exists public.tracked_parcels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  tracking_number text not null check (tracking_number ~ '^[A-Z0-9]{8,40}$'),
  carrier_code text check (carrier_code is null or carrier_code in ('laposte', 'colissimo', 'chronopost', 'ups', 'dhl', 'dpd', 'gls', 'mondial_relay', 'colis_prive', 'relais_colis', 'fedex', 'amazon', 'other')),
  carrier_source text not null default 'auto' check (carrier_source in ('auto', 'manual')),
  label text not null default '' check (char_length(label) <= 120),
  order_id uuid references public.orders (id) on delete set null,
  destination_country char(2) check (destination_country is null or destination_country ~ '^[A-Z]{2}$'),
  -- écrit par le serveur uniquement
  provider text check (provider is null or provider in ('laposte', 'ship24')),
  status text not null default 'unknown' check (status in ('pending', 'info_received', 'in_transit', 'out_for_delivery', 'available_for_pickup', 'failed_attempt', 'exception', 'delivered', 'returned', 'expired', 'not_found', 'unknown')),
  status_detail text check (status_detail is null or char_length(status_detail) <= 500),
  carrier_label text check (carrier_label is null or char_length(carrier_label) <= 80),
  estimated_delivery text check (estimated_delivery is null or char_length(estimated_delivery) <= 40),
  delivered_at text check (delivered_at is null or char_length(delivered_at) <= 40),
  events jsonb not null default '[]'::jsonb check (jsonb_typeof(events) = 'array'),
  provider_url text check (provider_url is null or provider_url ~ '^https://'),
  last_checked_at timestamptz,
  next_check_at timestamptz default now(),
  check_count integer not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, tracking_number)
);

create index if not exists tracked_parcels_org_idx on public.tracked_parcels (organization_id, archived_at, created_at desc);
create index if not exists tracked_parcels_due_idx on public.tracked_parcels (next_check_at) where archived_at is null and next_check_at is not null;
create index if not exists tracked_parcels_order_idx on public.tracked_parcels (order_id) where order_id is not null;

drop trigger if exists tracked_parcels_set_updated_at on public.tracked_parcels;
create trigger tracked_parcels_set_updated_at before update on public.tracked_parcels
  for each row execute function public.set_updated_at();

alter table public.tracked_parcels enable row level security;

drop policy if exists tracked_parcels_select on public.tracked_parcels;
create policy tracked_parcels_select on public.tracked_parcels
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists tracked_parcels_insert on public.tracked_parcels;
create policy tracked_parcels_insert on public.tracked_parcels
  for insert to authenticated with check (public.can_write_org(organization_id));
drop policy if exists tracked_parcels_update on public.tracked_parcels;
create policy tracked_parcels_update on public.tracked_parcels
  for update to authenticated using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));
drop policy if exists tracked_parcels_delete on public.tracked_parcels;
create policy tracked_parcels_delete on public.tracked_parcels
  for delete to authenticated using (public.can_write_org(organization_id));

-- Privilèges par colonne : le statut et l'historique ne peuvent pas être écrits par l'application.
revoke all on public.tracked_parcels from authenticated, anon;
grant select, delete on public.tracked_parcels to authenticated;
grant insert (organization_id, tracking_number, carrier_code, carrier_source, label, order_id, destination_country) on public.tracked_parcels to authenticated;
grant update (carrier_code, carrier_source, label, order_id, destination_country, archived_at, next_check_at) on public.tracked_parcels to authenticated;

-- Un changement de transporteur relance le suivi (statut remis à « inconnu » par le serveur au
-- prochain passage) ; next_check_at ne peut qu'être avancé à « maintenant » par l'application.
create or replace function public.tracked_parcels_client_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_service_role() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.next_check_at is distinct from old.next_check_at and (new.next_check_at is null or new.next_check_at > now() + interval '1 minute') then
    raise exception 'PARCEL_NEXT_CHECK_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists tracked_parcels_client_guard on public.tracked_parcels;
create trigger tracked_parcels_client_guard before update on public.tracked_parcels
  for each row execute function public.tracked_parcels_client_guard();

revoke execute on function public.tracked_parcels_client_guard() from public, anon, authenticated;

select public.install_same_org_guards('public.shipping_rate_cards'::regclass);
select public.install_same_org_guards('public.tracked_parcels'::regclass);
