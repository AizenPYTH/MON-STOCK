-- =============================================================================
-- MON STOCK — migration 20261023000210 : imports de catalogues et de flux reprenables
-- (audit 2026-10-22 : S-04, S-18).
--
-- 1. sourcing_import_jobs : état durable d'un import traité PAR LOTS (progression, bail de
--    traitement, tentatives). Un import n'est plus traité ligne à ligne dans une seule requête :
--    les lignes lues sont découpées en lots (sourcing_import_chunks) puis écrites en masse, lot
--    après lot, par la requête d'import, la reprise demandée par l'utilisateur ou la tâche
--    planifiée. Un lot terminé n'est jamais retraité ; un lot interrompu est rejoué sans doublon
--    (upsert sur la clé unique des offres). Un job dont le bail a expiré est repris ; un job
--    abandonné ou bloqué est clos « failed » : aucun job ne reste « running » indéfiniment.
-- 2. sourcing_import_chunks : lots de lignes déjà lues et validées (serveur uniquement, purgés à
--    la fin du job).
-- 3. sourcing_prepare_catalog_import : fournisseur → source « Import de catalogue » → flux, en UNE
--    transaction, recherche du fournisseur par égalité insensible à la casse (aucun joker) et
--    verrou consultatif contre deux imports simultanés (S-18). SECURITY INVOKER : la RLS de
--    l'utilisateur s'applique à chaque écriture.
--
-- Additif et non destructif. Retour arrière manuel :
--   supabase/ops/rollback/20261023000210_sourcing_import_jobs_resumable_down.sql
-- =============================================================================

-- 1. Jobs reprenables -----------------------------------------------------------
alter table public.sourcing_import_jobs
  add column if not exists rows_total integer,
  add column if not exists rows_processed integer not null default 0,
  add column if not exists chunks_total integer not null default 0,
  add column if not exists chunks_done integer not null default 0,
  add column if not exists lease_owner uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  -- prises en charge successives sans qu'aucun lot n'avance (remis à 0 à chaque lot terminé)
  add column if not exists attempts integer not null default 0,
  -- contexte d'exécution figé à la création (devises, journal, mode, contrôle qualité)
  add column if not exists params jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sourcing_import_jobs_progress_check') then
    alter table public.sourcing_import_jobs
      add constraint sourcing_import_jobs_progress_check check (rows_processed >= 0 and chunks_done >= 0 and chunks_total >= 0 and chunks_done <= chunks_total and attempts >= 0);
  end if;
end $$;

-- file des jobs à reprendre (bail expiré ou libre)
create index if not exists sourcing_import_jobs_running_idx on public.sourcing_import_jobs (lease_expires_at nulls first, started_at) where status = 'running';

-- 2. Lots de lignes ---------------------------------------------------------------
create table if not exists public.sourcing_import_chunks (
  job_id uuid not null references public.sourcing_import_jobs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  -- index (0-based) de la première ligne de données du lot dans le fichier
  first_index integer not null check (first_index >= 0),
  row_count integer not null check (row_count between 1 and 5000),
  rows jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  stats jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  primary key (job_id, chunk_index)
);

create index if not exists sourcing_import_chunks_pending_idx on public.sourcing_import_chunks (job_id, chunk_index) where status = 'pending';

alter table public.sourcing_import_chunks enable row level security;
-- aucune politique : contenu brut des fichiers, serveur uniquement
revoke all on public.sourcing_import_chunks from anon, authenticated;
grant all on public.sourcing_import_chunks to service_role;
select public.install_same_org_guards('public.sourcing_import_chunks'::regclass);

-- 3. Préparation transactionnelle d'un import de catalogue ----------------------
create or replace function public.sourcing_prepare_catalog_import(
  p_organization_id uuid,
  p_supplier_id uuid,
  p_supplier_name text,
  p_source_type text,
  p_currency text,
  p_tax_type text,
  p_country text,
  p_feed_format text,
  p_field_mapping jsonb,
  p_options jsonb
)
returns table (supplier_id uuid, supplier_name text, source_id uuid, feed_id uuid, supplier_created boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_supplier_name, ''));
  v_supplier_id uuid;
  v_supplier_name text;
  v_created boolean := false;
  v_source_id uuid;
  v_feed_id uuid;
begin
  if not public.is_service_role() and not public.can_write_org(p_organization_id) then
    raise exception 'Droits insuffisants pour importer un catalogue dans cette organisation.' using errcode = '42501';
  end if;
  if p_source_type not in ('CSV', 'XML', 'JSON') then
    raise exception 'Type de source invalide : %', p_source_type using errcode = '22023';
  end if;

  if p_supplier_id is not null then
    select s.id, s.name into v_supplier_id, v_supplier_name
      from public.suppliers s where s.id = p_supplier_id and s.organization_id = p_organization_id;
    if v_supplier_id is null then
      raise exception 'Fournisseur introuvable dans cette organisation.' using errcode = 'P0002';
    end if;
  else
    if char_length(v_name) < 2 or char_length(v_name) > 160 then
      raise exception 'Nom de fournisseur invalide.' using errcode = '22023';
    end if;
    -- deux imports simultanés du même nouveau fournisseur : un seul le crée
    perform pg_advisory_xact_lock(hashtextextended('sourcing-supplier:' || p_organization_id::text || ':' || lower(v_name), 0));
    -- égalité insensible à la casse : « A_B » ne retrouve jamais « AxB » (aucun joker)
    select s.id, s.name into v_supplier_id, v_supplier_name
      from public.suppliers s
      where s.organization_id = p_organization_id and lower(btrim(s.name)) = lower(v_name)
      order by s.created_at, s.id
      limit 1;
    if v_supplier_id is null then
      insert into public.suppliers (organization_id, name, currency, country)
        values (p_organization_id, v_name, upper(p_currency), nullif(upper(coalesce(p_country, '')), ''))
        returning id, name into v_supplier_id, v_supplier_name;
      v_created := true;
    end if;
  end if;

  -- une seule source « Import de catalogue » et un seul flux sans URL par fournisseur et format
  perform pg_advisory_xact_lock(hashtextextended('sourcing-catalog-import:' || v_supplier_id::text || ':' || p_source_type, 0));
  select ss.id into v_source_id
    from public.supplier_sources ss
    where ss.organization_id = p_organization_id and ss.supplier_id = v_supplier_id and ss.source_type::text = p_source_type
      and ss.config ->> 'kind' = 'catalog_file_import'
    order by ss.created_at, ss.id
    limit 1;
  if v_source_id is null then
    insert into public.supplier_sources (organization_id, supplier_id, name, source_type, default_currency, default_tax_type, country, automated_access_confirmed, access_conditions, sync_frequency, status, config)
      values (p_organization_id, v_supplier_id, left('Import de catalogue — ' || v_supplier_name, 200), p_source_type::public.source_type, upper(p_currency), p_tax_type::public.tax_type,
              nullif(upper(coalesce(p_country, '')), ''), true, 'Fichier transmis par le fournisseur et importé manuellement par l''utilisateur.', 'manual', 'not_connected', jsonb_build_object('kind', 'catalog_file_import'))
      returning id into v_source_id;
  else
    update public.supplier_sources set default_currency = upper(p_currency), default_tax_type = p_tax_type::public.tax_type
      where id = v_source_id and organization_id = p_organization_id;
  end if;

  select f.id into v_feed_id
    from public.supplier_feeds f
    where f.organization_id = p_organization_id and f.source_id = v_source_id and f.url is null
    order by f.created_at, f.id
    limit 1;
  if v_feed_id is null then
    insert into public.supplier_feeds (organization_id, supplier_id, source_id, type, url, status, format, field_mapping, options, sync_frequency)
      values (p_organization_id, v_supplier_id, v_source_id, 'catalog', null, 'not_connected', p_feed_format::public.feed_format, coalesce(p_field_mapping, '{}'::jsonb), coalesce(p_options, '{}'::jsonb), 'manual')
      returning id into v_feed_id;
  else
    update public.supplier_feeds set format = p_feed_format::public.feed_format, field_mapping = coalesce(p_field_mapping, '{}'::jsonb), options = coalesce(p_options, '{}'::jsonb), sync_frequency = 'manual'
      where id = v_feed_id and organization_id = p_organization_id;
  end if;

  return query select v_supplier_id, v_supplier_name, v_source_id, v_feed_id, v_created;
end;
$$;

revoke all on function public.sourcing_prepare_catalog_import(uuid, uuid, text, text, text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.sourcing_prepare_catalog_import(uuid, uuid, text, text, text, text, text, text, jsonb, jsonb) to authenticated, service_role;
