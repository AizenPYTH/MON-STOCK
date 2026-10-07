-- =============================================================================
-- MON STOCK — migration 0002 : catalogue (PRODUCT → VARIANT → SKU) et stock
-- =============================================================================

create type public.movement_type as enum (
  'initial',        -- stock initial saisi à la création
  'receipt',        -- réception fournisseur
  'sale',           -- vente (canal)
  'return',         -- retour client
  'cancellation',   -- annulation de vente (recrédite)
  'adjustment',     -- ajustement manuel (inventaire, casse, perte)
  'transfer_in',
  'transfer_out',
  'correction'      -- correction de synchronisation
);

create type public.price_kind as enum ('cost', 'sale');
create type public.product_condition as enum ('new', 'refurbished', 'used', 'unknown');

-- -----------------------------------------------------------------------------
-- Produits
-- -----------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 300),
  brand text,
  category text,
  description text,
  image_url text,
  -- identifiants normalisés (alimentés par ProductNormalizer)
  brand_normalized text,
  model_normalized text,
  attributes jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_org_idx on public.products (organization_id);
create index products_org_name_trgm_idx on public.products using gin (public.normalize_text(name) gin_trgm_ops);
create index products_org_brand_idx on public.products (organization_id, brand);
create index products_org_category_idx on public.products (organization_id, category);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Variantes
-- -----------------------------------------------------------------------------
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 300),
  -- attributs structurés : {"storage":"128GB","color":"Black","grade":"A","condition":"refurbished"}
  attributes jsonb not null default '{}'::jsonb,
  condition public.product_condition not null default 'unknown',
  grade text,
  ean text,
  mpn text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_variants_product_idx on public.product_variants (product_id);
create index product_variants_org_idx on public.product_variants (organization_id);
create index product_variants_ean_idx on public.product_variants (organization_id, ean) where ean is not null;

create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- SKU : l'unité de stock. Toute annonce marketplace pointe vers un SKU.
-- -----------------------------------------------------------------------------
create table public.skus (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 64),
  barcode text,
  -- Un coût NULL signifie « coût inconnu » : on ne l'invente jamais (≠ 0).
  cost_price numeric(12, 2) check (cost_price is null or cost_price >= 0),
  sale_price numeric(12, 2) check (sale_price is null or sale_price >= 0),
  currency char(3) not null default 'EUR',
  location text,
  reorder_point integer not null default 0 check (reorder_point >= 0),
  safety_stock integer not null default 0 check (safety_stock >= 0),
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  default_supplier_id uuid, -- FK ajoutée après création de suppliers
  weight_grams integer check (weight_grams is null or weight_grams >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index skus_org_code_uidx on public.skus (organization_id, upper(code));
create index skus_org_idx on public.skus (organization_id);
create index skus_product_idx on public.skus (product_id);
create index skus_variant_idx on public.skus (variant_id);
create index skus_barcode_idx on public.skus (organization_id, barcode) where barcode is not null;
create index skus_code_trgm_idx on public.skus using gin (upper(code) gin_trgm_ops);

create trigger skus_set_updated_at
  before update on public.skus
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Stock (une ligne par SKU). Disponible = en main − réservé.
-- -----------------------------------------------------------------------------
create table public.inventory (
  sku_id uuid primary key references public.skus (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  quantity_on_hand integer not null default 0,
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0),
  quantity_available integer generated always as (quantity_on_hand - quantity_reserved) stored,
  last_movement_at timestamptz,
  last_sale_at timestamptz,
  updated_at timestamptz not null default now()
);

create index inventory_org_idx on public.inventory (organization_id);
create index inventory_org_available_idx on public.inventory (organization_id, quantity_available);

-- Création automatique de la ligne de stock à la création du SKU.
create or replace function public.create_inventory_for_sku()
returns trigger
language plpgsql
as $$
begin
  insert into public.inventory (sku_id, organization_id)
  values (new.id, new.organization_id)
  on conflict (sku_id) do nothing;
  return new;
end;
$$;

create trigger skus_create_inventory
  after insert on public.skus
  for each row execute function public.create_inventory_for_sku();

-- -----------------------------------------------------------------------------
-- Mouvements de stock : journal immuable
-- -----------------------------------------------------------------------------
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sku_id uuid not null references public.skus (id) on delete cascade,
  type public.movement_type not null,
  -- quantité signée : +réception, −vente
  quantity integer not null check (quantity <> 0),
  quantity_after integer not null,
  channel text,                 -- 'ebay', 'amazon', 'shopify', 'manual'...
  reference_type text,          -- 'order_item', 'purchase_order_item', 'manual'...
  reference_id uuid,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index inventory_movements_sku_idx on public.inventory_movements (sku_id, occurred_at desc);
create index inventory_movements_org_idx on public.inventory_movements (organization_id, occurred_at desc);
create index inventory_movements_ref_idx on public.inventory_movements (reference_type, reference_id);

-- -----------------------------------------------------------------------------
-- Historique des prix (coût et vente)
-- -----------------------------------------------------------------------------
create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sku_id uuid not null references public.skus (id) on delete cascade,
  kind public.price_kind not null,
  price numeric(12, 2) not null check (price >= 0),
  currency char(3) not null default 'EUR',
  source text not null default 'manual',
  recorded_at timestamptz not null default now()
);

create index price_history_sku_idx on public.price_history (sku_id, kind, recorded_at desc);

create or replace function public.record_sku_price_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.cost_price is not null then
      insert into public.price_history (organization_id, sku_id, kind, price, currency)
      values (new.organization_id, new.id, 'cost', new.cost_price, new.currency);
    end if;
    if new.sale_price is not null then
      insert into public.price_history (organization_id, sku_id, kind, price, currency)
      values (new.organization_id, new.id, 'sale', new.sale_price, new.currency);
    end if;
  else
    if new.cost_price is distinct from old.cost_price and new.cost_price is not null then
      insert into public.price_history (organization_id, sku_id, kind, price, currency)
      values (new.organization_id, new.id, 'cost', new.cost_price, new.currency);
    end if;
    if new.sale_price is distinct from old.sale_price and new.sale_price is not null then
      insert into public.price_history (organization_id, sku_id, kind, price, currency)
      values (new.organization_id, new.id, 'sale', new.sale_price, new.currency);
    end if;
  end if;
  return new;
end;
$$;

create trigger skus_record_price_history
  after insert or update of cost_price, sale_price on public.skus
  for each row execute function public.record_sku_price_history();

-- -----------------------------------------------------------------------------
-- apply_inventory_movement : seule porte d'entrée pour modifier le stock.
-- Verrouille la ligne de stock, insère le mouvement, met à jour le stock.
-- -----------------------------------------------------------------------------
create or replace function public.apply_inventory_movement(
  p_organization_id uuid,
  p_sku_id uuid,
  p_type public.movement_type,
  p_quantity integer,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_channel text default null,
  p_note text default null,
  p_occurred_at timestamptz default now()
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.inventory;
  v_after integer;
  v_mv public.inventory_movements;
begin
  if not public.is_service_role() and not public.can_write_org(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_quantity = 0 then
    raise exception 'MOVEMENT_QUANTITY_ZERO' using errcode = '22023';
  end if;

  select * into v_inv
  from public.inventory
  where sku_id = p_sku_id and organization_id = p_organization_id
  for update;

  if v_inv.sku_id is null then
    raise exception 'SKU_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_after := v_inv.quantity_on_hand + p_quantity;

  -- Les ajustements et réceptions manuels ne peuvent pas rendre le stock négatif.
  -- Les ventes marketplace, elles, reflètent la réalité : on autorise le négatif
  -- (signalé ensuite comme incohérence) plutôt que de rejeter une vente réelle.
  if v_after < 0 and p_type in ('adjustment', 'transfer_out', 'initial', 'receipt') then
    raise exception 'INSUFFICIENT_STOCK' using errcode = '23514';
  end if;

  update public.inventory
    set quantity_on_hand = v_after,
        last_movement_at = greatest(coalesce(last_movement_at, p_occurred_at), p_occurred_at),
        last_sale_at = case when p_type = 'sale'
                            then greatest(coalesce(last_sale_at, p_occurred_at), p_occurred_at)
                            else last_sale_at end,
        updated_at = now()
    where sku_id = p_sku_id;

  insert into public.inventory_movements (
    organization_id, sku_id, type, quantity, quantity_after, channel,
    reference_type, reference_id, note, created_by, occurred_at
  ) values (
    p_organization_id, p_sku_id, p_type, p_quantity, v_after, p_channel,
    p_reference_type, p_reference_id, p_note, auth.uid(), p_occurred_at
  )
  returning * into v_mv;

  return v_mv;
end;
$$;

-- Réservation (ex. commande payée non expédiée) — réversible.
create or replace function public.adjust_reserved_quantity(
  p_organization_id uuid,
  p_sku_id uuid,
  p_delta integer
)
returns public.inventory
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.inventory;
begin
  if not public.is_service_role() and not public.can_write_org(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.inventory
    set quantity_reserved = greatest(0, quantity_reserved + p_delta),
        updated_at = now()
    where sku_id = p_sku_id and organization_id = p_organization_id
  returning * into v_inv;

  if v_inv.sku_id is null then
    raise exception 'SKU_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_inv;
end;
$$;
