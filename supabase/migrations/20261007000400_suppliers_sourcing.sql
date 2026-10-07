-- =============================================================================
-- MON STOCK — migration 0004 : fournisseurs et SOURCING ENGINE
-- Modèle : PRODUCT (normalisé) ↔ OFFERS ↔ SUPPLIER ↔ SOURCE
-- Chaque offre conserve sa provenance (source_type, source_url, horodatages)
-- et son historique de prix / stock. Rien n'est écrasé silencieusement.
-- =============================================================================

create type public.source_type as enum (
  'PUBLIC_WEB',        -- page publique (crawler autorisé, robots.txt respecté)
  'API',               -- API officielle du fournisseur
  'CSV',               -- fichier / flux CSV
  'XML',               -- flux XML
  'JSON',              -- flux JSON
  'SUPPLIER_ACCOUNT',  -- compte fournisseur connecté par le vendeur (accès autorisé)
  'MANUAL',            -- saisie manuelle
  'PARTNER_FEED'       -- fournisseur partenaire (feed/SFTP/EDI)
);
create type public.sync_frequency as enum ('manual', 'hourly', 'every_6_hours', 'daily');
create type public.source_status as enum ('not_connected', 'active', 'paused', 'error');
create type public.feed_format as enum ('csv', 'xml', 'json');
create type public.tax_type as enum ('ht', 'ttc', 'unknown');
create type public.stock_status as enum ('in_stock', 'low', 'out_of_stock', 'unknown');
create type public.offer_status as enum ('active', 'expired', 'suspicious', 'rejected');
create type public.match_status as enum ('suggested', 'confirmed', 'rejected');
create type public.purchase_order_status as enum ('draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled');

-- -----------------------------------------------------------------------------
-- Fournisseurs
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  company text,
  country char(2),
  website text,
  email text,
  phone text,
  contact_name text,
  notes text,
  payment_terms text,
  average_lead_time_days integer check (average_lead_time_days is null or average_lead_time_days >= 0),
  default_moq integer check (default_moq is null or default_moq >= 1),
  minimum_order_value numeric(12, 2) check (minimum_order_value is null or minimum_order_value >= 0),
  currency char(3) not null default 'EUR',
  -- Score interne : NULL tant que les données sont insuffisantes (jamais inventé)
  internal_score numeric(5, 2) check (internal_score is null or internal_score between 0 and 100),
  score_breakdown jsonb,
  score_computed_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index suppliers_org_idx on public.suppliers (organization_id);
create index suppliers_name_trgm_idx on public.suppliers using gin (public.normalize_text(name) gin_trgm_ops);

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

alter table public.skus
  add constraint skus_default_supplier_fk
  foreign key (default_supplier_id) references public.suppliers (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Sources fournisseur : d'où viennent les offres
-- -----------------------------------------------------------------------------
create table public.supplier_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  name text not null,
  source_type public.source_type not null,
  base_url text,
  country char(2),
  default_currency char(3),
  default_tax_type public.tax_type not null default 'unknown',
  -- Conditions d'accès documentées par l'utilisateur (CGU, autorisation...)
  access_conditions text,
  -- L'utilisateur atteste avoir vérifié que l'accès automatisé est autorisé.
  automated_access_confirmed boolean not null default false,
  robots_checked_at timestamptz,
  robots_allowed boolean,
  crawl_delay_seconds integer,
  sync_frequency public.sync_frequency not null default 'manual',
  status public.source_status not null default 'not_connected',
  -- Configuration du parser (identifiant du parser, URLs produit, options)
  config jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index supplier_sources_org_idx on public.supplier_sources (organization_id);
create index supplier_sources_supplier_idx on public.supplier_sources (supplier_id);
create unique index supplier_sources_one_manual_per_supplier on public.supplier_sources (supplier_id) where source_type = 'MANUAL';

create trigger supplier_sources_set_updated_at
  before update on public.supplier_sources
  for each row execute function public.set_updated_at();

-- Flux (CSV / XML / JSON) rattachés à une source
create table public.supplier_feeds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  source_id uuid not null references public.supplier_sources (id) on delete cascade,
  type text not null default 'catalog' check (type in ('catalog', 'price', 'stock')),
  url text,                                   -- NULL = import manuel de fichier
  format public.feed_format not null,
  -- mapping des colonnes/chemins du flux vers le modèle d'offre
  field_mapping jsonb not null default '{}'::jsonb,
  options jsonb not null default '{}'::jsonb, -- délimiteur, encodage, chemin racine XML/JSON...
  sync_frequency public.sync_frequency not null default 'manual',
  status public.source_status not null default 'not_connected',
  last_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  last_record_count integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index supplier_feeds_org_idx on public.supplier_feeds (organization_id);
create index supplier_feeds_source_idx on public.supplier_feeds (source_id);

create trigger supplier_feeds_set_updated_at
  before update on public.supplier_feeds
  for each row execute function public.set_updated_at();

-- Comptes / API fournisseurs connectés par le vendeur (accès autorisé)
create table public.supplier_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  source_id uuid references public.supplier_sources (id) on delete set null,
  connector_key text not null,                -- identifiant du SupplierAPIConnector
  status public.connection_status not null default 'pending',
  external_account_id text,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  config jsonb not null default '{}'::jsonb,  -- jamais de secret ici
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index supplier_connections_org_idx on public.supplier_connections (organization_id);

create trigger supplier_connections_set_updated_at
  before update on public.supplier_connections
  for each row execute function public.set_updated_at();

-- Secrets des connexions fournisseurs : service_role uniquement, chiffrés.
create table public.supplier_connection_secrets (
  connection_id uuid primary key references public.supplier_connections (id) on delete cascade,
  credentials_enc text,
  key_version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Produits normalisés du sourcing (identité produit, indépendante des offres)
-- -----------------------------------------------------------------------------
create table public.sourcing_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  normalized_key text not null,       -- ex: apple|iphone 13|128gb|black|refurbished|a
  brand text,
  model text,
  storage text,
  color text,
  condition public.product_condition not null default 'unknown',
  grade text,
  variant text,
  ean text,
  mpn text,
  upc text,
  gtin text,
  title_display text not null,
  sku_id uuid references public.skus (id) on delete set null, -- lien confirmé vers le SKU interne
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, normalized_key)
);

create index sourcing_products_sku_idx on public.sourcing_products (sku_id) where sku_id is not null;
create index sourcing_products_ean_idx on public.sourcing_products (organization_id, ean) where ean is not null;
create index sourcing_products_title_trgm_idx on public.sourcing_products using gin (public.normalize_text(title_display) gin_trgm_ops);

create trigger sourcing_products_set_updated_at
  before update on public.sourcing_products
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Offres de sourcing : LA table centrale du moteur
-- -----------------------------------------------------------------------------
create table public.sourcing_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  source_id uuid not null references public.supplier_sources (id) on delete cascade,
  feed_id uuid references public.supplier_feeds (id) on delete set null,
  source_type public.source_type not null,
  external_product_id text,
  external_offer_id text not null,
  title_original text not null check (char_length(title_original) > 0),
  normalized_product_id uuid references public.sourcing_products (id) on delete set null,
  sku_id uuid references public.skus (id) on delete set null,
  -- attributs normalisés (dérivés du titre / des colonnes du flux)
  brand text,
  model text,
  storage text,
  color text,
  condition public.product_condition not null default 'unknown',
  grade text,
  ean text,
  mpn text,
  -- prix : l'original est toujours conservé
  original_price numeric(12, 4) not null check (original_price >= 0),
  original_currency char(3) not null,
  normalized_price numeric(12, 4),
  normalized_currency char(3),
  fx_rate numeric(14, 6),
  fx_rate_date date,
  tax_type public.tax_type not null default 'unknown',
  vat_rate numeric(5, 2),
  moq integer check (moq is null or moq >= 1),
  minimum_order_value numeric(12, 2),
  available_quantity integer check (available_quantity is null or available_quantity >= 0),
  stock_status public.stock_status not null default 'unknown',
  shipping_cost numeric(12, 2) check (shipping_cost is null or shipping_cost >= 0),
  shipping_currency char(3),
  delivery_min_days integer check (delivery_min_days is null or delivery_min_days >= 0),
  delivery_max_days integer check (delivery_max_days is null or delivery_max_days >= 0),
  country char(2),
  source_url text,
  -- confiance par donnée (0–1) : {"product":0.98,"price":1,"stock":0.8,"grade":0.7}
  confidence jsonb not null default '{}'::jsonb,
  anomalies text[] not null default '{}',
  status public.offer_status not null default 'active',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_price_at timestamptz not null default now(),
  last_stock_at timestamptz,
  expired_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_id, external_offer_id)
);

create index sourcing_offers_org_status_idx on public.sourcing_offers (organization_id, status);
create index sourcing_offers_supplier_idx on public.sourcing_offers (supplier_id);
create index sourcing_offers_product_idx on public.sourcing_offers (normalized_product_id) where normalized_product_id is not null;
create index sourcing_offers_sku_idx on public.sourcing_offers (sku_id) where sku_id is not null;
create index sourcing_offers_ean_idx on public.sourcing_offers (organization_id, ean) where ean is not null;
create index sourcing_offers_mpn_idx on public.sourcing_offers (organization_id, upper(mpn)) where mpn is not null;
create index sourcing_offers_title_trgm_idx on public.sourcing_offers using gin (public.normalize_text(title_original) gin_trgm_ops);
create index sourcing_offers_brand_model_idx on public.sourcing_offers (organization_id, brand, model);
create index sourcing_offers_price_idx on public.sourcing_offers (organization_id, normalized_price);
create index sourcing_offers_last_seen_idx on public.sourcing_offers (organization_id, last_seen_at desc);

create trigger sourcing_offers_set_updated_at
  before update on public.sourcing_offers
  for each row execute function public.set_updated_at();

-- Vue de compatibilité : « offres fournisseurs » associées à un SKU interne.
create view public.supplier_offers
with (security_invoker = true)
as
select
  o.id,
  o.organization_id,
  o.supplier_id,
  o.sku_id,
  o.source_id,
  o.source_type,
  o.title_original,
  o.original_price,
  o.original_currency,
  o.normalized_price,
  o.normalized_currency,
  o.tax_type,
  o.moq,
  o.minimum_order_value,
  o.available_quantity,
  o.stock_status,
  o.shipping_cost,
  o.delivery_min_days,
  o.delivery_max_days,
  o.country,
  o.source_url,
  o.status,
  o.last_seen_at,
  o.last_price_at,
  o.last_stock_at
from public.sourcing_offers o
where o.sku_id is not null;

-- -----------------------------------------------------------------------------
-- Historique prix / stock des offres (alimenté par trigger, jamais écrasé)
-- -----------------------------------------------------------------------------
create table public.supplier_price_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  offer_id uuid not null references public.sourcing_offers (id) on delete cascade,
  original_price numeric(12, 4) not null,
  original_currency char(3) not null,
  normalized_price numeric(12, 4),
  normalized_currency char(3),
  tax_type public.tax_type not null,
  recorded_at timestamptz not null default now()
);

create index supplier_price_history_offer_idx on public.supplier_price_history (offer_id, recorded_at desc);

create table public.supplier_stock_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  offer_id uuid not null references public.sourcing_offers (id) on delete cascade,
  available_quantity integer,
  stock_status public.stock_status not null,
  recorded_at timestamptz not null default now()
);

create index supplier_stock_history_offer_idx on public.supplier_stock_history (offer_id, recorded_at desc);

create or replace function public.record_offer_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.supplier_price_history (organization_id, offer_id, original_price, original_currency, normalized_price, normalized_currency, tax_type, recorded_at)
    values (new.organization_id, new.id, new.original_price, new.original_currency, new.normalized_price, new.normalized_currency, new.tax_type, new.last_price_at);
    if new.available_quantity is not null or new.stock_status <> 'unknown' then
      insert into public.supplier_stock_history (organization_id, offer_id, available_quantity, stock_status, recorded_at)
      values (new.organization_id, new.id, new.available_quantity, new.stock_status, coalesce(new.last_stock_at, now()));
    end if;
    return new;
  end if;

  if new.original_price is distinct from old.original_price
     or new.original_currency is distinct from old.original_currency
     or new.tax_type is distinct from old.tax_type then
    new.last_price_at := now();
    insert into public.supplier_price_history (organization_id, offer_id, original_price, original_currency, normalized_price, normalized_currency, tax_type, recorded_at)
    values (new.organization_id, new.id, new.original_price, new.original_currency, new.normalized_price, new.normalized_currency, new.tax_type, new.last_price_at);
  end if;

  if new.available_quantity is distinct from old.available_quantity
     or new.stock_status is distinct from old.stock_status then
    new.last_stock_at := now();
    insert into public.supplier_stock_history (organization_id, offer_id, available_quantity, stock_status, recorded_at)
    values (new.organization_id, new.id, new.available_quantity, new.stock_status, new.last_stock_at);
  end if;

  return new;
end;
$$;

-- BEFORE pour pouvoir modifier last_price_at / last_stock_at
create trigger sourcing_offers_record_history
  before insert or update on public.sourcing_offers
  for each row execute function public.record_offer_history();

-- -----------------------------------------------------------------------------
-- Correspondances offre/produit ↔ SKU (suggestion → validation humaine)
-- -----------------------------------------------------------------------------
create table public.product_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  offer_id uuid references public.sourcing_offers (id) on delete cascade,
  sourcing_product_id uuid references public.sourcing_products (id) on delete cascade,
  sku_id uuid not null references public.skus (id) on delete cascade,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  method text not null,  -- 'ean' | 'mpn' | 'supplier_sku' | 'attributes' | 'text'
  reasons jsonb not null default '[]'::jsonb,
  status public.match_status not null default 'suggested',
  created_by uuid references auth.users (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (offer_id is not null or sourcing_product_id is not null)
);

create unique index product_matches_offer_sku_uidx on public.product_matches (offer_id, sku_id) where offer_id is not null;
create unique index product_matches_product_sku_uidx on public.product_matches (sourcing_product_id, sku_id) where sourcing_product_id is not null;
create index product_matches_org_status_idx on public.product_matches (organization_id, status);

-- -----------------------------------------------------------------------------
-- Recherches et alertes de sourcing
-- -----------------------------------------------------------------------------
create table public.sourcing_searches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  query_text text not null,
  parsed jsonb not null default '{}'::jsonb,
  filters jsonb not null default '{}'::jsonb,
  result_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index sourcing_searches_org_idx on public.sourcing_searches (organization_id, created_at desc);

create table public.sourcing_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  query_text text not null,
  parsed jsonb not null default '{}'::jsonb,
  -- critères : {"max_price":230,"min_quantity":10,"countries":["FR"],"max_moq":20,"grades":["A"]}
  criteria jsonb not null default '{}'::jsonb,
  sku_id uuid references public.skus (id) on delete set null,
  is_active boolean not null default true,
  last_checked_at timestamptz,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sourcing_alerts_org_idx on public.sourcing_alerts (organization_id, is_active);

create trigger sourcing_alerts_set_updated_at
  before update on public.sourcing_alerts
  for each row execute function public.set_updated_at();

create table public.sourcing_alert_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  alert_id uuid not null references public.sourcing_alerts (id) on delete cascade,
  offer_id uuid not null references public.sourcing_offers (id) on delete cascade,
  kind text not null check (kind in ('price_below_threshold', 'price_drop', 'new_stock', 'low_stock', 'new_offer')),
  message text not null,
  triggered_at timestamptz not null default now(),
  seen_at timestamptz,
  unique (alert_id, offer_id, kind)
);

create index sourcing_alert_events_org_idx on public.sourcing_alert_events (organization_id, triggered_at desc);

-- -----------------------------------------------------------------------------
-- Taux de change (source : BCE, référentiel public). Table globale.
-- -----------------------------------------------------------------------------
create table public.fx_rates (
  base_currency char(3) not null,
  quote_currency char(3) not null,
  rate numeric(14, 6) not null check (rate > 0),
  rate_date date not null,
  source text not null default 'ecb',
  fetched_at timestamptz not null default now(),
  primary key (base_currency, quote_currency, rate_date)
);

-- -----------------------------------------------------------------------------
-- Commandes fournisseurs
-- -----------------------------------------------------------------------------
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  reference text,
  status public.purchase_order_status not null default 'draft',
  currency char(3) not null default 'EUR',
  expected_at date,
  notes text,
  total numeric(12, 2),
  created_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchase_orders_org_idx on public.purchase_orders (organization_id, created_at desc);
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id);

create trigger purchase_orders_set_updated_at
  before update on public.purchase_orders
  for each row execute function public.set_updated_at();

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  sku_id uuid not null references public.skus (id) on delete restrict,
  offer_id uuid references public.sourcing_offers (id) on delete set null,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0 check (quantity_received >= 0),
  unit_cost numeric(12, 4),
  currency char(3),
  created_at timestamptz not null default now()
);

create index purchase_order_items_po_idx on public.purchase_order_items (purchase_order_id);
create index purchase_order_items_sku_idx on public.purchase_order_items (sku_id);
