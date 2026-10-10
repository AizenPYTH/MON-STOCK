-- =============================================================================
-- Annuaire de fournisseurs (src/services/sourcing/supplier-directory.ts) : résultat des
-- vérifications RÉELLES faites depuis le serveur (site joignable, robots.txt, plateforme
-- e-commerce détectée). Données de plateforme : lisibles par les utilisateurs connectés,
-- écrites uniquement par le serveur (service_role). Aucune donnée d'organisation.
-- =============================================================================

create table if not exists public.supplier_directory_checks (
  key text primary key check (char_length(key) between 1 and 80),
  checked_at timestamptz not null default now(),
  url text,
  final_url text,
  reachable boolean not null,
  http_status integer,
  robots_found boolean,
  -- robots.txt interdit tout le site aux robots (« Disallow: / » pour *)
  robots_disallow_all boolean,
  sitemap_found boolean,
  platform text check (platform is null or platform in ('shopify', 'woocommerce', 'magento', 'prestashop', 'shopware', 'other')),
  message text,
  duration_ms integer
);

alter table public.supplier_directory_checks enable row level security;

drop policy if exists supplier_directory_checks_read on public.supplier_directory_checks;
create policy supplier_directory_checks_read on public.supplier_directory_checks
  for select to authenticated using (true);

revoke all on public.supplier_directory_checks from anon, authenticated;
grant select on public.supplier_directory_checks to authenticated;
grant all on public.supplier_directory_checks to service_role;

-- down (manuel) : drop table public.supplier_directory_checks;
