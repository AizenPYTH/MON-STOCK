-- =============================================================================
-- MON STOCK — migration 20261023000330 : traçabilité de l'attestation d'accès des sources
-- (audit 2026-10-22 : D-09).
--
-- Avant : access_conditions / automated_access_confirmed modifiables par tout rédacteur via
-- PostgREST, sans auteur, sans date, sans historique.
-- Après :
--   1. supplier_sources.access_attested_by / access_attested_at : POSÉES PAR TRIGGER à chaque
--      création ou changement de l'attestation (auteur = utilisateur connecté, NULL pour le
--      serveur) ; toute valeur fournie par un client est ignorée.
--   2. Journal supplier_source_attestations (qui, quand, quoi, par quel chemin) : lecture par les
--      membres, écriture par trigger uniquement.
--   3. UPDATE client des colonnes d'attestation RETIRÉ (droits par colonne) : access_conditions,
--      automated_access_confirmed, access_attested_by, access_attested_at et, si présentes
--      (migration 20261023000200), access_reviewed_by, access_reviewed_at, terms_url, terms_status.
--      Toutes les autres colonnes restent modifiables comme avant (RLS inchangée).
--      L'INSERT reste permis (création d'une source avec son attestation, auteur posé par trigger).
--   4. RPC attest_supplier_source_access(p_source_id, p_access_conditions, p_automated_access_confirmed) :
--      seul chemin client pour changer l'attestation d'une source existante (rédacteur de
--      l'organisation ; texte obligatoire pour attester ; 2 000 caractères max).
--
-- Code applicatif adapté : src/features/suppliers/discovered-actions.ts (validation d'une source
-- découverte) appelle la RPC au lieu d'un UPDATE direct. Les autres chemins écrivent l'attestation
-- à l'INSERT (inchangés) ou via service_role (non concernés par les droits par colonne).
-- ATTENTION aux migrations futures : une colonne AJOUTÉE à supplier_sources n'est plus modifiable
-- par authenticated sans `grant update (colonne) on public.supplier_sources to authenticated`.
--
-- Données existantes : aucune modifiée. Les 55 sources de production gardent access_attested_*
-- à NULL (attestation antérieure, auteur inconnu) jusqu'à leur prochaine attestation.
-- Retour arrière : supabase/ops/rollback/20261023000330_supplier_source_attestation_down.sql
-- =============================================================================

-- 0. Contrôles préalables
do $pre$
begin
  if to_regclass('public.supplier_sources') is null then
    raise exception 'Contrôle préalable 20261023000330 : table supplier_sources absente.';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'supplier_sources'
        and column_name in ('access_conditions', 'automated_access_confirmed')) <> 2 then
    raise exception 'Contrôle préalable 20261023000330 : colonnes access_conditions / automated_access_confirmed absentes.';
  end if;
end
$pre$;

-- 1. Colonnes posées par trigger -------------------------------------------------------------
alter table public.supplier_sources
  add column if not exists access_attested_by uuid references auth.users (id) on delete set null,
  add column if not exists access_attested_at timestamptz;

comment on column public.supplier_sources.access_attested_by is 'Auteur de la dernière attestation d''accès (trigger ; NULL = serveur ou attestation antérieure au 23/10/2026).';
comment on column public.supplier_sources.access_attested_at is 'Date de la dernière attestation d''accès (trigger).';

-- 2. Journal --------------------------------------------------------------------------------
create table if not exists public.supplier_source_attestations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_id uuid not null references public.supplier_sources (id) on delete cascade,
  automated_access_confirmed boolean not null,
  access_conditions text,
  attested_by uuid references auth.users (id) on delete set null,
  attested_at timestamptz not null default now(),
  origin text not null check (origin in ('insert', 'rpc', 'update'))
);
create index if not exists supplier_source_attestations_source_idx on public.supplier_source_attestations (source_id, attested_at desc);
create index if not exists supplier_source_attestations_org_idx on public.supplier_source_attestations (organization_id, attested_at desc);

alter table public.supplier_source_attestations enable row level security;
drop policy if exists supplier_source_attestations_select on public.supplier_source_attestations;
create policy supplier_source_attestations_select on public.supplier_source_attestations
  for select to authenticated using (public.is_org_member(organization_id));

revoke all on public.supplier_source_attestations from anon;
revoke insert, update, delete, truncate, references, trigger on public.supplier_source_attestations from authenticated;
grant select on public.supplier_source_attestations to authenticated;
grant all on public.supplier_source_attestations to service_role;

select public.install_same_org_guards('public.supplier_source_attestations'::regclass);

comment on table public.supplier_source_attestations is
  'Historique des attestations d''accès automatisé des sources (D-09). Écrit par trigger uniquement.';

-- 3. Triggers -------------------------------------------------------------------------------
create or replace function public.supplier_sources_attestation_stamp()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.automated_access_confirmed or nullif(btrim(coalesce(new.access_conditions, '')), '') is not null then
      new.access_attested_by := auth.uid();
      new.access_attested_at := now();
    else
      new.access_attested_by := null;
      new.access_attested_at := null;
    end if;
  elsif new.automated_access_confirmed is distinct from old.automated_access_confirmed
        or new.access_conditions is distinct from old.access_conditions then
    new.access_attested_by := auth.uid();
    new.access_attested_at := now();
  else
    new.access_attested_by := old.access_attested_by;
    new.access_attested_at := old.access_attested_at;
  end if;
  return new;
end;
$$;

create or replace function public.supplier_sources_attestation_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.access_attested_at is null then
      return null;
    end if;
  elsif new.automated_access_confirmed is not distinct from old.automated_access_confirmed
        and new.access_conditions is not distinct from old.access_conditions then
    return null;
  end if;
  insert into public.supplier_source_attestations (organization_id, source_id, automated_access_confirmed, access_conditions, attested_by, attested_at, origin)
  values (
    new.organization_id, new.id, new.automated_access_confirmed, new.access_conditions,
    new.access_attested_by, coalesce(new.access_attested_at, now()),
    case
      when tg_op = 'INSERT' then 'insert'
      when coalesce(current_setting('mon_stock.attestation_origin', true), '') = 'rpc' then 'rpc'
      else 'update'
    end
  );
  return null;
end;
$$;

revoke all on function public.supplier_sources_attestation_stamp() from public, anon, authenticated;
revoke all on function public.supplier_sources_attestation_log() from public, anon, authenticated;

create or replace trigger supplier_sources_attestation_stamp
  before insert or update on public.supplier_sources
  for each row execute function public.supplier_sources_attestation_stamp();

create or replace trigger supplier_sources_attestation_log
  after insert or update on public.supplier_sources
  for each row execute function public.supplier_sources_attestation_log();

-- 4. Droits par colonne : l'attestation n'est plus modifiable directement par un client --------
do $grants$
declare
  v_protected text[] := array[
    'access_conditions', 'automated_access_confirmed', 'access_attested_by', 'access_attested_at',
    'access_reviewed_by', 'access_reviewed_at', 'terms_url', 'terms_status'
  ];
  v_cols text;
  v_prot text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
  from pg_attribute a
  where a.attrelid = 'public.supplier_sources'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname <> all (v_protected);
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_prot
  from pg_attribute a
  where a.attrelid = 'public.supplier_sources'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname = any (v_protected);

  execute 'revoke update on public.supplier_sources from authenticated';
  execute format('revoke update (%s) on public.supplier_sources from authenticated', v_prot);
  execute format('grant update (%s) on public.supplier_sources to authenticated', v_cols);
end
$grants$;

-- 5. RPC d'attestation ------------------------------------------------------------------------
create or replace function public.attest_supplier_source_access(
  p_source_id uuid,
  p_access_conditions text,
  p_automated_access_confirmed boolean default true
)
returns public.supplier_sources
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_src public.supplier_sources;
  v_text text := nullif(btrim(coalesce(p_access_conditions, '')), '');
begin
  if auth.uid() is null and not public.is_service_role() then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_src from public.supplier_sources where id = p_source_id for update;
  -- Source d'une autre organisation : « introuvable » (aucune divulgation d'existence).
  if v_src.id is null or (not public.is_service_role() and not public.is_org_member(v_src.organization_id)) then
    raise exception 'SOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.is_service_role() and not public.can_write_org(v_src.organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_automated_access_confirmed is null or char_length(coalesce(v_text, '')) > 2000 then
    raise exception 'ATTESTATION_INVALID' using errcode = '22023';
  end if;
  if p_automated_access_confirmed and v_text is null then
    raise exception 'ATTESTATION_TEXT_REQUIRED' using errcode = '22023';
  end if;

  perform set_config('mon_stock.attestation_origin', 'rpc', true);
  update public.supplier_sources
    set automated_access_confirmed = p_automated_access_confirmed,
        access_conditions = coalesce(v_text, v_src.access_conditions)
    where id = v_src.id
  returning * into v_src;
  perform set_config('mon_stock.attestation_origin', '', true);

  return v_src;
end;
$$;

revoke all on function public.attest_supplier_source_access(uuid, text, boolean) from public, anon;
grant execute on function public.attest_supplier_source_access(uuid, text, boolean) to authenticated, service_role;
