-- =============================================================================
-- MON STOCK — migration 20261009000200 : création atomique d'un produit à plusieurs variantes
-- -----------------------------------------------------------------------------
-- Le formulaire mobile crée un produit et N variantes (capacité, couleur, grade, état) avec
-- leur SKU, prix et stock initial. Appeler create_sku N fois depuis le téléphone laisserait un
-- produit partiel si la 3e variante échoue (code SKU déjà pris, réseau coupé…).
--
-- create_product_with_skus : UNE transaction qui appelle create_sku pour chaque variante
-- (aucune nouvelle règle de stock : contrôle des droits, unicité du code, mouvement « initial »
-- et historique restent ceux de create_sku / apply_inventory_movement). La première variante
-- crée le produit ; les suivantes s'y rattachent. Avec p_product_id, ajoute des variantes à un
-- produit existant. SECURITY INVOKER : aucune capacité nouvelle (create_sku vérifie can_write_org).
--
-- p_product : {"name","brand","category","description","image_url","model"}
-- p_items   : [{"variant":{...create_sku p_variant},"sku":{...create_sku p_sku},"initial_quantity":n}, …] (1 à 50)
-- =============================================================================

create or replace function public.create_product_with_skus(
  p_organization_id uuid,
  p_items jsonb,
  p_product jsonb default null,
  p_product_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_product uuid := p_product_id;
  v_item jsonb;
  v_res jsonb;
  v_skus jsonb := '[]'::jsonb;
  v_model text;
  v_codes text[];
begin
  if not public.is_service_role() and not public.can_write_org(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'VARIANTS_REQUIRED' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'VARIANTS_TOO_MANY' using errcode = '22023';
  end if;
  if v_product is null and (p_product is null or nullif(btrim(coalesce(p_product ->> 'name', '')), '') is null) then
    raise exception 'PRODUCT_NAME_REQUIRED' using errcode = '22023';
  end if;

  -- Deux variantes du même envoi avec le même code : refus explicite (avant toute écriture).
  select array_agg(upper(btrim(e -> 'sku' ->> 'code'))) into v_codes from jsonb_array_elements(p_items) e;
  if (select count(*) from unnest(v_codes) c) <> (select count(distinct c) from unnest(v_codes) c) then
    raise exception 'SKU_CODE_DUPLICATE_IN_REQUEST' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_res := public.create_sku(
      p_organization_id,
      coalesce(v_item -> 'variant', '{}'::jsonb),
      coalesce(v_item -> 'sku', '{}'::jsonb),
      v_product,
      case when v_product is null then p_product else null end,
      coalesce((v_item ->> 'initial_quantity')::integer, 0)
    );
    v_product := (v_res ->> 'product_id')::uuid;
    v_skus := v_skus || jsonb_build_array(jsonb_build_object('sku_id', v_res ->> 'sku_id', 'variant_id', v_res ->> 'variant_id', 'code', btrim(v_item -> 'sku' ->> 'code')));
  end loop;

  -- Modèle (« iPhone 13 ») : conservé dans les attributs du produit et normalisé pour le
  -- rapprochement sourcing / annonces. Uniquement à la création (p_product_id absent).
  v_model := nullif(btrim(coalesce(p_product ->> 'model', '')), '');
  if p_product_id is null and v_model is not null then
    update public.products
      set attributes = coalesce(attributes, '{}'::jsonb) || jsonb_build_object('model', v_model),
          model_normalized = public.normalize_text(v_model)
      where id = v_product and organization_id = p_organization_id;
  end if;

  return jsonb_build_object('product_id', v_product, 'skus', v_skus);
end;
$$;

revoke execute on function public.create_product_with_skus(uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.create_product_with_skus(uuid, jsonb, jsonb, uuid) to authenticated, service_role;
