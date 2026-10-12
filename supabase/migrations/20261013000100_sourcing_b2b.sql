-- =============================================================================
-- Sourcing B2B (13 octobre 2026) : historique des imports, mapping mémorisé par fournisseur,
-- champs d'offre complémentaires, état de planification des sources, secrets des flux distants.
--
-- Additif : aucune donnée existante n'est modifiée ni supprimée.
-- Retour arrière manuel : supabase/ops/rollback/20261013000100_sourcing_b2b_down.sql
--
-- Accès :
--   - lecture : membres de l'organisation (RLS) ;
--   - écriture : serveur uniquement (service_role), après contrôle du rôle par l'API ;
--   - secrets des flux : jamais lisibles par un client (aucune politique, privilèges retirés).
-- =============================================================================

-- 1. Imports de fichiers / flux ------------------------------------------------
create table if not exists public.sourcing_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  source_id uuid references public.supplier_sources (id) on delete set null,
  feed_id uuid references public.supplier_feeds (id) on delete set null,
  sync_run_id uuid references public.sync_runs (id) on delete set null,
  origin text not null default 'file' check (origin in ('file', 'remote_feed')),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  file_sha256 text check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  file_size integer check (file_size is null or file_size >= 0),
  format text not null check (format in ('csv', 'xlsx', 'xml', 'json')),
  sheet text check (sheet is null or char_length(sheet) <= 100),
  -- partial : seules les lignes du fichier sont créées / mises à jour ;
  -- snapshot : catalogue complet, les offres absentes sont marquées « expirées » (jamais supprimées)
  mode text not null default 'partial' check (mode in ('partial', 'snapshot')),
  mapping jsonb not null default '{}'::jsonb,
  defaults jsonb not null default '{}'::jsonb,
  status text not null default 'running' check (status in ('running', 'completed', 'partial', 'failed', 'quarantined', 'skipped_duplicate')),
  rows_read integer not null default 0,
  rows_valid integer not null default 0,
  offers_created integer not null default 0,
  offers_updated integer not null default 0,
  offers_unchanged integer not null default 0,
  duplicates integer not null default 0,
  rows_invalid integer not null default 0,
  offers_rejected integer not null default 0,
  products_unrecognized integer not null default 0,
  offers_expired integer not null default 0,
  truncated boolean not null default false,
  message text check (message is null or char_length(message) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists sourcing_import_jobs_org_started_idx on public.sourcing_import_jobs (organization_id, started_at desc);
create index if not exists sourcing_import_jobs_source_hash_idx on public.sourcing_import_jobs (source_id, file_sha256) where file_sha256 is not null;

create table if not exists public.sourcing_import_issues (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null references public.sourcing_import_jobs (id) on delete cascade,
  line integer,
  kind text not null check (kind in ('invalid', 'duplicate', 'rejected', 'unrecognized', 'warning')),
  reference text check (reference is null or char_length(reference) <= 200),
  message text not null check (char_length(message) <= 1000),
  -- extrait de la ligne d'origine (borné), pour comprendre sans rouvrir le fichier
  excerpt jsonb
);

create index if not exists sourcing_import_issues_job_idx on public.sourcing_import_issues (job_id, line);

-- 2. Mapping mémorisé par fournisseur et signature d'en-têtes ------------------
create table if not exists public.sourcing_mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  -- SHA-256 des en-têtes normalisés (triés) : un même modèle de fichier retrouve son mapping
  header_signature text not null check (header_signature ~ '^[0-9a-f]{64}$'),
  columns text[] not null default '{}',
  mapping jsonb not null,
  defaults jsonb not null default '{}'::jsonb,
  use_count integer not null default 1,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, supplier_id, header_signature)
);

drop trigger if exists set_updated_at on public.sourcing_mapping_profiles;
create trigger set_updated_at before update on public.sourcing_mapping_profiles for each row execute function public.set_updated_at();

-- 3. Offres : champs complémentaires (tous facultatifs, rien n'est déduit) -----
alter table public.sourcing_offers
  add column if not exists order_multiple integer check (order_multiple is null or order_multiple > 0),
  add column if not exists vat_regime text check (vat_regime is null or vat_regime in ('normal', 'margin', 'reverse_charge', 'exempt', 'unknown')),
  add column if not exists ship_from_country char(2) check (ship_from_country is null or ship_from_country ~ '^[A-Z]{2}$'),
  add column if not exists warranty_months integer check (warranty_months is null or warranty_months between 0 and 120),
  add column if not exists available_from date,
  add column if not exists supplier_updated_at timestamptz,
  add column if not exists last_import_job_id uuid references public.sourcing_import_jobs (id) on delete set null;

-- 4. Sources : planification et échecs -----------------------------------------
alter table public.supplier_sources
  add column if not exists next_run_at timestamptz,
  add column if not exists consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  add column if not exists last_failure_at timestamptz;

create index if not exists supplier_sources_next_run_idx on public.supplier_sources (next_run_at) where sync_frequency <> 'manual';

-- 5. Identifiants des flux distants (chiffrés AES-256-GCM, serveur uniquement) --
create table if not exists public.supplier_feed_secrets (
  feed_id uuid primary key references public.supplier_feeds (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  credentials_enc text not null,
  key_version smallint not null default 1,
  updated_at timestamptz not null default now()
);

-- 6. RLS et privilèges ---------------------------------------------------------
alter table public.sourcing_import_jobs enable row level security;
alter table public.sourcing_import_issues enable row level security;
alter table public.sourcing_mapping_profiles enable row level security;
alter table public.supplier_feed_secrets enable row level security;

drop policy if exists sourcing_import_jobs_select on public.sourcing_import_jobs;
create policy sourcing_import_jobs_select on public.sourcing_import_jobs for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists sourcing_import_issues_select on public.sourcing_import_issues;
create policy sourcing_import_issues_select on public.sourcing_import_issues for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists sourcing_mapping_profiles_select on public.sourcing_mapping_profiles;
create policy sourcing_mapping_profiles_select on public.sourcing_mapping_profiles for select to authenticated using (public.is_org_member(organization_id));

-- écritures réservées au serveur
revoke insert, update, delete, truncate on public.sourcing_import_jobs from anon, authenticated;
revoke insert, update, delete, truncate on public.sourcing_import_issues from anon, authenticated;
revoke insert, update, delete, truncate on public.sourcing_mapping_profiles from anon, authenticated;
revoke all on public.supplier_feed_secrets from anon, authenticated;
revoke select on public.sourcing_import_jobs from anon;
revoke select on public.sourcing_import_issues from anon;
revoke select on public.sourcing_mapping_profiles from anon;

-- garde « même organisation » (références fournisseur / source / flux / import)
select public.install_same_org_guards('public.sourcing_import_jobs'::regclass);
select public.install_same_org_guards('public.sourcing_import_issues'::regclass);
select public.install_same_org_guards('public.sourcing_mapping_profiles'::regclass);
select public.install_same_org_guards('public.supplier_feed_secrets'::regclass);
select public.install_same_org_guards('public.sourcing_offers'::regclass);
