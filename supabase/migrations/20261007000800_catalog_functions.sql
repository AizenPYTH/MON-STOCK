-- =============================================================================
-- MON STOCK — migration 0008 : création atomique produit → variante → SKU
-- =============================================================================

-- p_product : {"name","brand","category","description","image_url"} (ignoré si p_product_id fourni)
-- p_variant : {"name","condition","grade","ean","mpn","attributes":{...}}
-- p_sku     : {"code","barcode","cost_price","sale_price","currency","location","reorder_point","safety_stock","lead_time_days","default_supplier_id"}
create or replace function public.create_sku(
  p_organization_id uuid,
  p_variant jsonb,
  p_sku jsonb,
  p_product_id uuid default null,
  p_product jsonb default null,
  p_initial_quantity integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product uuid := p_product_id;
  v_variant uuid;
  v_sku uuid;
  v_code text := trim(p_sku ->> 'code');
begin
  if not public.is_service_role() and not public.can_write_org(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_code is null or v_code = '' then
    raise exception 'SKU_CODE_REQUIRED' using errcode = '22023';
  end if;
  if exists (select 1 from public.skus where organization_id = p_organization_id and upper(code) = upper(v_code)) then
    raise exception 'SKU_CODE_EXISTS' using errcode = '23505';
  end if;

  if v_product is null then
    insert into public.products (organization_id, name, brand, category, description, image_url, brand_normalized)
    values (
      p_organization_id,
      p_product ->> 'name',
      nullif(p_product ->> 'brand', ''),
      nullif(p_product ->> 'category', ''),
      nullif(p_product ->> 'description', ''),
      nullif(p_product ->> 'image_url', ''),
      public.normalize_text(nullif(p_product ->> 'brand', ''))
    )
    returning id into v_product;
  else
    if not exists (select 1 from public.products where id = v_product and organization_id = p_organization_id) then
      raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  insert into public.product_variants (organization_id, product_id, name, condition, grade, ean, mpn, attributes)
  values (
    p_organization_id, v_product,
    coalesce(nullif(p_variant ->> 'name', ''), 'Standard'),
    coalesce((p_variant ->> 'condition')::public.product_condition, 'unknown'),
    nullif(p_variant ->> 'grade', ''),
    nullif(p_variant ->> 'ean', ''),
    nullif(p_variant ->> 'mpn', ''),
    coalesce(p_variant -> 'attributes', '{}'::jsonb)
  )
  returning id into v_variant;

  insert into public.skus (
    organization_id, product_id, variant_id, code, barcode, cost_price, sale_price, currency, location,
    reorder_point, safety_stock, lead_time_days, default_supplier_id
  ) values (
    p_organization_id, v_product, v_variant, v_code,
    nullif(p_sku ->> 'barcode', ''),
    (p_sku ->> 'cost_price')::numeric,
    (p_sku ->> 'sale_price')::numeric,
    coalesce(nullif(p_sku ->> 'currency', ''), 'EUR'),
    nullif(p_sku ->> 'location', ''),
    coalesce((p_sku ->> 'reorder_point')::integer, 0),
    coalesce((p_sku ->> 'safety_stock')::integer, 0),
    (p_sku ->> 'lead_time_days')::integer,
    (p_sku ->> 'default_supplier_id')::uuid
  )
  returning id into v_sku;

  if coalesce(p_initial_quantity, 0) > 0 then
    perform public.apply_inventory_movement(p_organization_id, v_sku, 'initial', p_initial_quantity, 'manual', null, null, 'Stock initial', now());
  end if;

  return jsonb_build_object('product_id', v_product, 'variant_id', v_variant, 'sku_id', v_sku);
end;
$$;

revoke execute on function public.create_sku(uuid, jsonb, jsonb, uuid, jsonb, integer) from anon;
