-- =============================================================================
-- MON STOCK — migration 0005 : alertes et recommandations de réapprovisionnement
-- =============================================================================

create type public.alert_severity as enum ('info', 'warning', 'critical');
create type public.alert_status as enum ('open', 'acknowledged', 'resolved');
create type public.recommendation_status as enum ('open', 'ordered', 'dismissed');

-- Alertes « événementielles » (sync échouée, token expiré, stock négatif...).
-- Les alertes de rupture sont calculées à la volée (jamais périmées).
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type text not null,                     -- 'sync_failed' | 'connection_expired' | 'unmapped_listings' | 'negative_stock' | 'sourcing_opportunity'
  severity public.alert_severity not null default 'warning',
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  dedupe_key text not null,
  action_href text,
  status public.alert_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index alerts_open_dedupe_uidx on public.alerts (organization_id, dedupe_key) where status <> 'resolved';
create index alerts_org_status_idx on public.alerts (organization_id, status, created_at desc);

create trigger alerts_set_updated_at
  before update on public.alerts
  for each row execute function public.set_updated_at();

-- Snapshots de recommandations (chaque calcul est tracé et expliqué)
create table public.replenishment_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sku_id uuid not null references public.skus (id) on delete cascade,
  computed_at timestamptz not null default now(),
  current_stock integer not null,
  daily_velocity numeric(10, 4),
  days_of_cover numeric(10, 2),
  lead_time_days integer,
  safety_stock integer not null default 0,
  target_quantity integer,
  recommended_quantity integer,
  supplier_id uuid references public.suppliers (id) on delete set null,
  offer_id uuid references public.sourcing_offers (id) on delete set null,
  explanation text not null,
  inputs jsonb not null default '{}'::jsonb,
  status public.recommendation_status not null default 'open',
  purchase_order_id uuid references public.purchase_orders (id) on delete set null,
  created_at timestamptz not null default now()
);

create index replenishment_recommendations_org_idx on public.replenishment_recommendations (organization_id, status, computed_at desc);
create index replenishment_recommendations_sku_idx on public.replenishment_recommendations (sku_id, computed_at desc);
