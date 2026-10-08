-- =============================================================================
-- MON STOCK — migration 20261008001200 : intégrité multi-tenant des références
-- -----------------------------------------------------------------------------
-- Constat [MAJEUR] : les clés étrangères entre tables métier sont simples (id) et ne
-- vérifient pas l'organisation. La RLS ne contrôle que l'organization_id de la ligne
-- écrite : un membre de l'organisation A pouvait créer, dans A, des lignes pointant
-- vers des objets de B (purchase_order_items.sku_id, orders.sales_channel_id,
-- channel_listings.sku_id, skus.default_supplier_id…). Conséquences : blocage de la
-- suppression des SKU/fournisseurs de B (ON DELETE RESTRICT), suppression en cascade
-- de données de A par B, et fonctions SECURITY DEFINER (ingest_external_order,
-- resolve_sku_for_line) qui suivent ces références hors du tenant.
--   Constat [MAJEUR] : organization_id était modifiable par UPDATE (un utilisateur
-- membre de deux organisations pouvait « déplacer » des lignes, laissant les lignes
-- dépendantes dans l'autre tenant).
-- Correctif : un trigger générique BEFORE INSERT/UPDATE, installé sur chaque table
-- portant organization_id, vérifie que chaque référence vers une autre table portant
-- organization_id appartient à la même organisation, et interdit le changement
-- d'organization_id (sauf passage à NULL par ON DELETE SET NULL).
-- Les tables ajoutées par de futures migrations doivent appeler
--   select public.install_same_org_guards('public.ma_table'::regclass);
-- (tests/integration/security-catalog.test.ts échoue sinon).
-- Idempotent : create or replace / drop trigger if exists.
-- =============================================================================

create or replace function public.enforce_same_org_references()
returns trigger
language plpgsql
-- SECURITY INVOKER volontaire : la recherche passe par la RLS de l'appelant. Pour un
-- client, une référence vers un autre tenant est donc introuvable ; pour service_role
-- et les fonctions SECURITY DEFINER, l'organisation est comparée explicitement.
set search_path = public
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_org uuid := (v_new ->> 'organization_id')::uuid;
  v_i integer := 0;
  v_col text;
  v_ref text;
  v_val text;
  v_ref_org uuid;
  v_found boolean;
begin
  if tg_op = 'UPDATE' and (v_old ->> 'organization_id') is distinct from (v_new ->> 'organization_id') then
    -- ON DELETE SET NULL (ex. webhook_events.organization_id) reste autorisé.
    if v_new ->> 'organization_id' is not null then
      raise exception 'ORGANIZATION_IMMUTABLE: %', tg_table_name using errcode = '42501';
    end if;
  end if;

  if v_org is null then
    return new;
  end if;

  while v_i < tg_nargs loop
    v_col := tg_argv[v_i];
    v_ref := tg_argv[v_i + 1];
    v_i := v_i + 2;
    v_val := v_new ->> v_col;
    if v_val is null then
      continue;
    end if;
    if tg_op = 'UPDATE' and v_val is not distinct from (v_old ->> v_col) then
      continue;
    end if;
    execute format('select true, organization_id from public.%I where id = $1', v_ref)
      into v_found, v_ref_org
      using v_val::uuid;
    if v_found is null or v_ref_org is distinct from v_org then
      raise exception 'CROSS_ORGANIZATION_REFERENCE: %.% → %', tg_table_name, v_col, v_ref using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

-- Installe (ou réinstalle) le garde-fou sur une table : énumère ses clés étrangères
-- mono-colonne vers des tables qui portent elles aussi organization_id.
create or replace function public.install_same_org_guards(p_table regclass)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_args text := '';
  v_name text;
  r record;
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = p_table and attname = 'organization_id' and not attisdropped
  ) then
    return;
  end if;

  for r in
    select a.attname as col, rc.relname as ref_table
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_class rc on rc.oid = c.confrelid
    join pg_namespace rn on rn.oid = rc.relnamespace
    where c.contype = 'f'
      and c.conrelid = p_table
      and array_length(c.conkey, 1) = 1
      and rn.nspname = 'public'
      and c.confrelid <> 'public.organizations'::regclass
      and exists (
        select 1 from pg_attribute x
        where x.attrelid = c.confrelid and x.attname = 'organization_id' and not x.attisdropped
      )
    order by a.attname
  loop
    v_args := v_args || format(', %L, %L', r.col, r.ref_table);
  end loop;

  select relname into v_name from pg_class where oid = p_table;
  execute format('drop trigger if exists zz_same_org_guard on %s', p_table);
  execute format(
    'create trigger zz_same_org_guard before insert or update on %s for each row execute function public.enforce_same_org_references(%s)',
    p_table, ltrim(v_args, ', ')
  );
end;
$$;

-- Installation sur toutes les tables actuelles du schéma public portant organization_id.
do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as t
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
      )
  loop
    perform public.install_same_org_guards(r.t);
  end loop;
end;
$$;

revoke execute on function public.enforce_same_org_references() from public, anon;
revoke execute on function public.install_same_org_guards(regclass) from public, anon, authenticated;
