-- Retour arrière MANUEL de 20261013000100_sourcing_b2b.sql (sourcing B2B).
-- Supprime l'historique des imports, les mappings mémorisés et les identifiants de flux distants,
-- ainsi que les colonnes ajoutées aux offres et aux sources. Les offres elles-mêmes sont conservées.
-- À n'exécuter qu'après décision explicite.
alter table public.sourcing_offers
  drop column if exists last_import_job_id,
  drop column if exists supplier_updated_at,
  drop column if exists available_from,
  drop column if exists warranty_months,
  drop column if exists ship_from_country,
  drop column if exists vat_regime,
  drop column if exists order_multiple;
select public.install_same_org_guards('public.sourcing_offers'::regclass);

drop index if exists public.supplier_sources_next_run_idx;
alter table public.supplier_sources
  drop column if exists last_failure_at,
  drop column if exists consecutive_failures,
  drop column if exists next_run_at;

drop table if exists public.supplier_feed_secrets;
drop table if exists public.sourcing_mapping_profiles;
drop table if exists public.sourcing_import_issues;
drop table if exists public.sourcing_import_jobs;
