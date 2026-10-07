-- =============================================================================
-- MON STOCK — migration 0003 : canaux de vente, connexions, annonces, commandes
-- =============================================================================

create type public.channel_provider as enum ('ebay', 'amazon', 'shopify', 'woocommerce', 'manual');
create type public.connection_status as enum ('pending', 'connected', 'expired', 'error', 'disconnected');
create type public.listing_status as enum ('active', 'ended', 'unsold', 'unknown');
create type public.mapping_status as enum ('unmapped', 'suggested', 'mapped', 'ignored');
create type public.order_status as enum ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded', 'unknown');
create type public.sync_trigger as enum ('manual', 'scheduled', 'webhook', 'initial');
create type public.sync_status as enum ('running', 'success', 'partial', 'failed');
create type public.webhook_status as enum ('received', 'processed', 'ignored', 'failed', 'duplicate');

-- -----------------------------------------------------------------------------
-- Canaux de vente (un par compte marketplace, + un canal 'manual' par défaut)
-- -----------------------------------------------------------------------------
create table public.sales_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider public.channel_provider not null,
  name text not null,
  currency char(3) not null default 'EUR',
  -- Frais : NULL = inconnu (affiché « Coût inconnu », jamais supposé à 0)
  fee_percent numeric(6, 3) check (fee_percent is null or fee_percent between 0 and 100),
  payment_fee_percent numeric(6, 3) check (payment_fee_percent is null or payment_fee_percent between 0 and 100),
  payment_fee_fixed numeric(10, 2) check (payment_fee_fixed is null or payment_fee_fixed >= 0),
  default_shipping_cost numeric(10, 2) check (default_shipping_cost is null or default_shipping_cost >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sales_channels_org_idx on public.sales_channels (organization_id);
create unique index sales_channels_one_manual_per_org on public.sales_channels (organization_id) where provider = 'manual';

create trigger sales_channels_set_updated_at
  before update on public.sales_channels
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Connexions OAuth (état public, sans secret)
-- -----------------------------------------------------------------------------
create table public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sales_channel_id uuid not null unique references public.sales_channels (id) on delete cascade,
  provider public.channel_provider not null,
  status public.connection_status not null default 'pending',
  environment text not null default 'production' check (environment in ('production', 'sandbox')),
  external_account_id text,
  external_username text,
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  last_orders_cursor timestamptz,      -- borne de la dernière récupération de commandes
  last_error text,
  auto_sync boolean not null default true,
  sync_interval_minutes integer not null default 60 check (sync_interval_minutes >= 15),
  push_inventory boolean not null default false, -- envoi des quantités vers le canal (opt-in)
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index channel_connections_org_idx on public.channel_connections (organization_id);
create index channel_connections_sync_due_idx on public.channel_connections (status, auto_sync, last_sync_at);

create trigger channel_connections_set_updated_at
  before update on public.channel_connections
  for each row execute function public.set_updated_at();

-- Secrets : chiffrés applicativement (AES-256-GCM, clé TOKEN_ENCRYPTION_KEY).
-- Aucune policy RLS : inaccessible aux clients, uniquement service_role.
create table public.channel_connection_secrets (
  connection_id uuid primary key references public.channel_connections (id) on delete cascade,
  access_token_enc text,
  refresh_token_enc text,
  key_version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- États OAuth anti-CSRF (service_role uniquement)
create table public.oauth_states (
  state text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider public.channel_provider not null,
  created_by uuid references auth.users (id) on delete cascade,
  redirect_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);

-- -----------------------------------------------------------------------------
-- Annonces (listings) et MAPPING vers les SKU internes
-- Une ligne = une annonce (ou une variation d'annonce) sur un canal.
-- sku_id est le mapping ProductMapping : internal_sku ↔ external_listing_id.
-- -----------------------------------------------------------------------------
create table public.channel_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sales_channel_id uuid not null references public.sales_channels (id) on delete cascade,
  connection_id uuid references public.channel_connections (id) on delete set null,
  provider public.channel_provider not null,
  external_listing_id text not null,
  external_variation_id text not null default '',
  external_sku text,
  external_product_id text,          -- ASIN, Shopify product id, eBay ePID...
  title text not null default '',
  price numeric(12, 2),
  currency char(3),
  quantity_listed integer,
  quantity_available integer,
  quantity_sold integer,
  status public.listing_status not null default 'unknown',
  listing_url text,
  image_url text,
  variation_attributes jsonb not null default '{}'::jsonb,
  -- mapping
  sku_id uuid references public.skus (id) on delete set null,
  mapping_status public.mapping_status not null default 'unmapped',
  mapping_source text,               -- 'auto_sku_match' | 'manual' | 'suggestion_accepted'
  mapped_at timestamptz,
  mapped_by uuid references auth.users (id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_channel_id, external_listing_id, external_variation_id)
);

create index channel_listings_org_idx on public.channel_listings (organization_id);
create index channel_listings_sku_idx on public.channel_listings (sku_id) where sku_id is not null;
create index channel_listings_unmapped_idx on public.channel_listings (organization_id, mapping_status) where mapping_status in ('unmapped', 'suggested');
create index channel_listings_external_sku_idx on public.channel_listings (organization_id, upper(external_sku)) where external_sku is not null;
create index channel_listings_title_trgm_idx on public.channel_listings using gin (public.normalize_text(title) gin_trgm_ops);

create trigger channel_listings_set_updated_at
  before update on public.channel_listings
  for each row execute function public.set_updated_at();

-- Suggestions de mapping (nécessitent validation humaine)
create table public.mapping_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  listing_id uuid not null references public.channel_listings (id) on delete cascade,
  sku_id uuid not null references public.skus (id) on delete cascade,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  method text not null,              -- 'sku_exact' | 'ean' | 'attributes' | 'title_similarity'
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, sku_id)
);

create index mapping_suggestions_listing_idx on public.mapping_suggestions (listing_id);

-- -----------------------------------------------------------------------------
-- Commandes (identifiant unique externe par canal : idempotence)
-- -----------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sales_channel_id uuid not null references public.sales_channels (id) on delete cascade,
  connection_id uuid references public.channel_connections (id) on delete set null,
  provider public.channel_provider not null,
  external_order_id text not null,
  order_number text,
  status public.order_status not null default 'unknown',
  payment_status text,
  fulfillment_status text,
  buyer_username text,
  currency char(3) not null default 'EUR',
  subtotal numeric(12, 2),
  shipping_total numeric(12, 2),
  tax_total numeric(12, 2),
  fee_total numeric(12, 2),
  total numeric(12, 2),
  placed_at timestamptz not null,
  external_modified_at timestamptz,
  payload_hash text,
  inventory_applied boolean not null default false,
  inventory_applied_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_order_id)
);

create index orders_org_placed_idx on public.orders (organization_id, placed_at desc);
create index orders_channel_idx on public.orders (sales_channel_id, placed_at desc);
create index orders_status_idx on public.orders (organization_id, status);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  external_line_item_id text not null,
  external_listing_id text,
  external_variation_id text not null default '',
  external_sku text,
  channel_listing_id uuid references public.channel_listings (id) on delete set null,
  sku_id uuid references public.skus (id) on delete set null,
  title text not null default '',
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2),
  currency char(3),
  total numeric(12, 2),
  inventory_applied boolean not null default false,
  created_at timestamptz not null default now(),
  unique (order_id, external_line_item_id)
);

create index order_items_org_idx on public.order_items (organization_id);
create index order_items_sku_idx on public.order_items (sku_id) where sku_id is not null;
create index order_items_order_idx on public.order_items (order_id);
create index order_items_unmapped_idx on public.order_items (organization_id) where sku_id is null;

-- -----------------------------------------------------------------------------
-- Synchronisations : chaque run est tracé, jamais supposé réussi
-- -----------------------------------------------------------------------------
create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_kind text not null check (source_kind in ('channel', 'supplier_feed', 'supplier_source', 'supplier_connection', 'sourcing_alerts', 'fx_rates')),
  source_ref uuid,                     -- connection_id / feed_id / source_id
  provider text not null,              -- 'ebay', 'csv', 'xml', 'public_web'...
  trigger public.sync_trigger not null,
  status public.sync_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  records_processed integer not null default 0,
  error_count integer not null default 0,
  stats jsonb not null default '{}'::jsonb,
  error_summary text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index sync_runs_org_idx on public.sync_runs (organization_id, started_at desc);
create index sync_runs_source_idx on public.sync_runs (source_ref, started_at desc);

create table public.sync_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sync_run_id uuid not null references public.sync_runs (id) on delete cascade,
  code text not null,
  message text not null,
  entity_type text,
  entity_ref text,
  details jsonb not null default '{}'::jsonb, -- jamais de secret
  created_at timestamptz not null default now()
);

create index sync_errors_run_idx on public.sync_errors (sync_run_id);

-- -----------------------------------------------------------------------------
-- Webhooks entrants (dédoublonnés sur provider + event_id)
-- -----------------------------------------------------------------------------
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  organization_id uuid references public.organizations (id) on delete set null,
  connection_id uuid references public.channel_connections (id) on delete set null,
  payload_hash text not null,
  payload jsonb,
  signature_valid boolean,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status public.webhook_status not null default 'received',
  error text,
  unique (provider, event_id)
);

create index webhook_events_org_idx on public.webhook_events (organization_id, received_at desc);
