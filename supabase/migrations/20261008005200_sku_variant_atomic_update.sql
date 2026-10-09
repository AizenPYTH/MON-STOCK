-- =============================================================================
-- MON STOCK — migration 20261008005200 : mise à jour atomique SKU + variante (verrou optimiste)
-- -----------------------------------------------------------------------------
-- L'édition d'un SKU modifiait `skus` sous verrou optimiste, puis `product_variants` par une
-- lecture-modification-écriture NON protégée : deux éditions simultanées des attributs
-- (stockage, couleur…) ou de l'EAN s'écrasaient, et un échec sur la variante laissait le SKU
-- déjà modifié (écriture partielle).
--
-- update_sku_with_variant : les deux mises à jour dans UNE transaction, chacune conditionnée
-- par la version lue à l'ouverture du formulaire (updated_at) ; les attributs sont fusionnés
-- côté serveur à partir des seules clés soumises (valeur null = retrait de la clé), sans
-- relecture côté application. SECURITY INVOKER : la RLS (can_write_org) s'applique comme
-- pour une mise à jour directe — aucune capacité nouvelle n'est accordée.
-- =============================================================================

create or replace function public.update_sku_with_variant(
  p_organization_id uuid,
  p_sku_id uuid,
  p_sku jsonb,
  p_variant jsonb default '{}'::jsonb,
  p_expected_sku_updated_at timestamptz default null,
  p_expected_variant_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sku public.skus;
  v_variant public.product_variants;
  v_variant_in jsonb := coalesce(p_variant, '{}'::jsonb);
  v_attr jsonb;
  v_unset text[];
  v_set jsonb;
begin
  if not public.is_service_role() and not public.can_write_org(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_sku is null or jsonb_typeof(p_sku) <> 'object' or jsonb_typeof(v_variant_in) <> 'object' then
    raise exception 'SKU_UPDATE_INVALID' using errcode = '22023';
  end if;
  v_attr := coalesce(v_variant_in -> 'attributes', '{}'::jsonb);
  if jsonb_typeof(v_attr) <> 'object' then
    raise exception 'SKU_UPDATE_INVALID' using errcode = '22023';
  end if;

  -- 1. SKU : seules les clés présentes sont modifiées ; version attendue vérifiée dans le WHERE
  --    (en READ COMMITTED, une écriture concurrente validée entre-temps fait échouer la condition).
  update public.skus s set
    barcode = case when p_sku ? 'barcode' then p_sku ->> 'barcode' else s.barcode end,
    cost_price = case when p_sku ? 'cost_price' then (p_sku ->> 'cost_price')::numeric else s.cost_price end,
    sale_price = case when p_sku ? 'sale_price' then (p_sku ->> 'sale_price')::numeric else s.sale_price end,
    location = case when p_sku ? 'location' then p_sku ->> 'location' else s.location end,
    reorder_point = case when p_sku ? 'reorder_point' then coalesce((p_sku ->> 'reorder_point')::integer, 0) else s.reorder_point end,
    safety_stock = case when p_sku ? 'safety_stock' then coalesce((p_sku ->> 'safety_stock')::integer, 0) else s.safety_stock end,
    lead_time_days = case when p_sku ? 'lead_time_days' then (p_sku ->> 'lead_time_days')::integer else s.lead_time_days end,
    default_supplier_id = case when p_sku ? 'default_supplier_id' then (p_sku ->> 'default_supplier_id')::uuid else s.default_supplier_id end,
    is_active = case when p_sku ? 'is_active' and p_sku -> 'is_active' <> 'null'::jsonb then (p_sku ->> 'is_active')::boolean else s.is_active end
  where s.id = p_sku_id
    and s.organization_id = p_organization_id
    and (p_expected_sku_updated_at is null or s.updated_at = p_expected_sku_updated_at)
  returning * into v_sku;

  if v_sku.id is null then
    if exists (select 1 from public.skus where id = p_sku_id and organization_id = p_organization_id) then
      raise exception 'SKU_STALE' using errcode = '40001', detail = 'sku';
    end if;
    raise exception 'SKU_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 2. Variante : même principe ; les attributs sont fusionnés à partir des seules clés soumises.
  select coalesce(array_agg(e.key), '{}'::text[]) into v_unset from jsonb_each(v_attr) e where e.value = 'null'::jsonb;
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_set from jsonb_each(v_attr) e where e.value <> 'null'::jsonb;

  update public.product_variants v set
    name = case when nullif(btrim(coalesce(v_variant_in ->> 'name', '')), '') is not null then btrim(v_variant_in ->> 'name') else v.name end,
    condition = case when v_variant_in ? 'condition' and v_variant_in -> 'condition' <> 'null'::jsonb then (v_variant_in ->> 'condition')::public.product_condition else v.condition end,
    grade = case when v_variant_in ? 'grade' then v_variant_in ->> 'grade' else v.grade end,
    ean = case when v_variant_in ? 'ean' then v_variant_in ->> 'ean' else v.ean end,
    mpn = case when v_variant_in ? 'mpn' then v_variant_in ->> 'mpn' else v.mpn end,
    attributes = (coalesce(v.attributes, '{}'::jsonb) - v_unset) || v_set
  where v.id = v_sku.variant_id
    and v.organization_id = p_organization_id
    and (p_expected_variant_updated_at is null or v.updated_at = p_expected_variant_updated_at)
  returning * into v_variant;

  if v_variant.id is null then
    -- L'exception annule aussi la mise à jour du SKU (une seule transaction) : rien n'est écrit.
    raise exception 'SKU_STALE' using errcode = '40001', detail = 'variant';
  end if;

  return jsonb_build_object(
    'sku_id', v_sku.id,
    'code', v_sku.code,
    'variant_id', v_variant.id,
    'sku_updated_at', v_sku.updated_at,
    'variant_updated_at', v_variant.updated_at
  );
end;
$$;

revoke execute on function public.update_sku_with_variant(uuid, uuid, jsonb, jsonb, timestamptz, timestamptz) from public, anon;
grant execute on function public.update_sku_with_variant(uuid, uuid, jsonb, jsonb, timestamptz, timestamptz) to authenticated, service_role;
