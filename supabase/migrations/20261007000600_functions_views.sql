-- =============================================================================
-- MON STOCK — migration 0006 : fonctions transactionnelles et vues analytiques
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Résolution d'un SKU pour une ligne de commande :
--   1. mapping existant de l'annonce (channel_listings.sku_id)
--   2. correspondance exacte du SKU externe avec un code SKU interne
-- -----------------------------------------------------------------------------
create or replace function public.resolve_sku_for_line(
  p_organization_id uuid,
  p_sales_channel_id uuid,
  p_external_listing_id text,
  p_external_variation_id text,
  p_external_sku text
)
returns table (sku_id uuid, channel_listing_id uuid)
language plpgsql
stable
as $$
declare
  v_listing public.channel_listings;
  v_sku uuid;
begin
  if p_external_listing_id is not null then
    select * into v_listing
    from public.channel_listings l
    where l.sales_channel_id = p_sales_channel_id
      and l.external_listing_id = p_external_listing_id
      and l.external_variation_id = coalesce(p_external_variation_id, '')
    limit 1;
  end if;

  if v_listing.id is not null and v_listing.sku_id is not null and v_listing.mapping_status = 'mapped' then
    sku_id := v_listing.sku_id;
    channel_listing_id := v_listing.id;
    return next;
    return;
  end if;

  if p_external_sku is not null and char_length(p_external_sku) > 0 then
    select s.id into v_sku
    from public.skus s
    where s.organization_id = p_organization_id
      and upper(s.code) = upper(p_external_sku)
    limit 1;
  end if;

  sku_id := v_sku;
  channel_listing_id := v_listing.id;
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- ingest_external_order : idempotent sur (organization, provider, external_order_id)
--   * nouvelle commande → création + lignes + mouvements 'sale' pour les SKU résolus
--   * commande connue → mise à jour du statut ; annulation → mouvements inverses
--   * jamais de double décrément : inventory_applied protège chaque ligne
-- p_order : {external_order_id, order_number, status, payment_status, fulfillment_status,
--            buyer_username, currency, subtotal, shipping_total, tax_total, fee_total, total,
--            placed_at, external_modified_at, payload_hash}
-- p_items : [{external_line_item_id, external_listing_id, external_variation_id, external_sku,
--             title, quantity, unit_price, currency, total}]
-- -----------------------------------------------------------------------------
create or replace function public.ingest_external_order(
  p_organization_id uuid,
  p_sales_channel_id uuid,
  p_connection_id uuid,
  p_provider public.channel_provider,
  p_order jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.orders;
  v_order_id uuid;
  v_created boolean := false;
  v_status public.order_status;
  v_item jsonb;
  v_line public.order_items;
  v_res record;
  v_items_mapped integer := 0;
  v_items_unmapped integer := 0;
  v_movements integer := 0;
  v_status_changed boolean := false;
begin
  if not public.is_service_role() and not public.can_write_org(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_status := coalesce((p_order ->> 'status')::public.order_status, 'unknown');

  select * into v_existing
  from public.orders o
  where o.organization_id = p_organization_id
    and o.provider = p_provider
    and o.external_order_id = p_order ->> 'external_order_id'
  for update;

  if v_existing.id is null then
    insert into public.orders (
      organization_id, sales_channel_id, connection_id, provider, external_order_id, order_number,
      status, payment_status, fulfillment_status, buyer_username, currency,
      subtotal, shipping_total, tax_total, fee_total, total,
      placed_at, external_modified_at, payload_hash
    ) values (
      p_organization_id, p_sales_channel_id, p_connection_id, p_provider,
      p_order ->> 'external_order_id', p_order ->> 'order_number',
      v_status, p_order ->> 'payment_status', p_order ->> 'fulfillment_status',
      p_order ->> 'buyer_username', coalesce(p_order ->> 'currency', 'EUR'),
      (p_order ->> 'subtotal')::numeric, (p_order ->> 'shipping_total')::numeric,
      (p_order ->> 'tax_total')::numeric, (p_order ->> 'fee_total')::numeric, (p_order ->> 'total')::numeric,
      coalesce((p_order ->> 'placed_at')::timestamptz, now()),
      (p_order ->> 'external_modified_at')::timestamptz,
      p_order ->> 'payload_hash'
    )
    returning id into v_order_id;
    v_created := true;

    for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
      select * into v_res from public.resolve_sku_for_line(
        p_organization_id, p_sales_channel_id,
        v_item ->> 'external_listing_id', v_item ->> 'external_variation_id', v_item ->> 'external_sku'
      );

      insert into public.order_items (
        organization_id, order_id, external_line_item_id, external_listing_id, external_variation_id,
        external_sku, channel_listing_id, sku_id, title, quantity, unit_price, currency, total
      ) values (
        p_organization_id, v_order_id, v_item ->> 'external_line_item_id', v_item ->> 'external_listing_id',
        coalesce(v_item ->> 'external_variation_id', ''), v_item ->> 'external_sku',
        v_res.channel_listing_id, v_res.sku_id, coalesce(v_item ->> 'title', ''),
        greatest(1, coalesce((v_item ->> 'quantity')::integer, 1)),
        (v_item ->> 'unit_price')::numeric, v_item ->> 'currency', (v_item ->> 'total')::numeric
      )
      returning * into v_line;

      if v_line.sku_id is not null then
        v_items_mapped := v_items_mapped + 1;
      else
        v_items_unmapped := v_items_unmapped + 1;
      end if;
    end loop;
  else
    v_order_id := v_existing.id;
    v_status_changed := v_existing.status is distinct from v_status;
    update public.orders
      set status = v_status,
          payment_status = coalesce(p_order ->> 'payment_status', payment_status),
          fulfillment_status = coalesce(p_order ->> 'fulfillment_status', fulfillment_status),
          total = coalesce((p_order ->> 'total')::numeric, total),
          external_modified_at = coalesce((p_order ->> 'external_modified_at')::timestamptz, external_modified_at),
          payload_hash = coalesce(p_order ->> 'payload_hash', payload_hash)
      where id = v_order_id;
  end if;

  -- Application du stock : une seule fois par ligne, uniquement si la commande n'est pas annulée.
  if v_status not in ('cancelled', 'refunded') then
    for v_line in
      select * from public.order_items oi
      where oi.order_id = v_order_id and oi.sku_id is not null and oi.inventory_applied = false
      for update
    loop
      perform public.apply_inventory_movement(
        p_organization_id, v_line.sku_id, 'sale', -v_line.quantity,
        'order_item', v_line.id, p_provider::text,
        'Vente ' || p_provider::text || ' ' || coalesce(p_order ->> 'order_number', p_order ->> 'external_order_id'),
        coalesce((p_order ->> 'placed_at')::timestamptz, now())
      );
      update public.order_items set inventory_applied = true where id = v_line.id;
      v_movements := v_movements + 1;
    end loop;

    update public.orders
      set inventory_applied = exists (select 1 from public.order_items where order_id = v_order_id and inventory_applied),
          inventory_applied_at = coalesce(inventory_applied_at, case when v_movements > 0 then now() end)
      where id = v_order_id;
  else
    -- Annulation / remboursement : on recrédite ce qui avait été déduit, une seule fois.
    for v_line in
      select * from public.order_items oi
      where oi.order_id = v_order_id and oi.sku_id is not null and oi.inventory_applied = true
      for update
    loop
      perform public.apply_inventory_movement(
        p_organization_id, v_line.sku_id, 'cancellation', v_line.quantity,
        'order_item', v_line.id, p_provider::text,
        'Annulation ' || p_provider::text || ' ' || coalesce(p_order ->> 'order_number', p_order ->> 'external_order_id'),
        now()
      );
      update public.order_items set inventory_applied = false where id = v_line.id;
      v_movements := v_movements + 1;
    end loop;

    update public.orders
      set cancelled_at = coalesce(cancelled_at, now()),
          inventory_applied = false
      where id = v_order_id;
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'created', v_created,
    'status_changed', v_status_changed,
    'items_mapped', v_items_mapped,
    'items_unmapped', v_items_unmapped,
    'movements', v_movements
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- map_listing_to_sku : associe une annonce à un SKU interne.
-- Les lignes de commandes passées sans SKU sont rattachées (pour les statistiques)
-- mais le stock n'est PAS modifié rétroactivement (action explicite séparée).
-- -----------------------------------------------------------------------------
create or replace function public.map_listing_to_sku(
  p_listing_id uuid,
  p_sku_id uuid,
  p_source text default 'manual'
)
returns public.channel_listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.channel_listings;
  v_sku public.skus;
begin
  select * into v_listing from public.channel_listings where id = p_listing_id for update;
  if v_listing.id is null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.is_service_role() and not public.can_write_org(v_listing.organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_sku_id is null then
    update public.channel_listings
      set sku_id = null, mapping_status = 'unmapped', mapping_source = null, mapped_at = null, mapped_by = null
      where id = p_listing_id
      returning * into v_listing;
    return v_listing;
  end if;

  select * into v_sku from public.skus where id = p_sku_id;
  if v_sku.id is null or v_sku.organization_id <> v_listing.organization_id then
    raise exception 'SKU_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.channel_listings
    set sku_id = p_sku_id,
        mapping_status = 'mapped',
        mapping_source = p_source,
        mapped_at = now(),
        mapped_by = auth.uid()
    where id = p_listing_id
    returning * into v_listing;

  update public.mapping_suggestions
    set status = case when sku_id = p_sku_id then 'accepted' else 'rejected' end,
        decided_by = auth.uid(), decided_at = now()
    where listing_id = p_listing_id and status = 'pending';

  update public.order_items oi
    set sku_id = p_sku_id, channel_listing_id = v_listing.id
    where oi.organization_id = v_listing.organization_id
      and oi.sku_id is null
      and oi.external_listing_id = v_listing.external_listing_id
      and oi.external_variation_id = v_listing.external_variation_id
      and exists (select 1 from public.orders o where o.id = oi.order_id and o.sales_channel_id = v_listing.sales_channel_id);

  return v_listing;
end;
$$;

-- Applique au stock les ventes passées d'un SKU non encore déduites (action explicite).
create or replace function public.apply_pending_sales_for_sku(p_sku_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sku public.skus;
  v_line record;
  v_count integer := 0;
begin
  select * into v_sku from public.skus where id = p_sku_id;
  if v_sku.id is null then
    raise exception 'SKU_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.is_service_role() and not public.can_write_org(v_sku.organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  for v_line in
    select oi.*, o.provider, o.placed_at, o.order_number, o.external_order_id
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.sku_id = p_sku_id and oi.inventory_applied = false
      and o.status not in ('cancelled', 'refunded')
    for update of oi
  loop
    perform public.apply_inventory_movement(
      v_sku.organization_id, p_sku_id, 'sale', -v_line.quantity,
      'order_item', v_line.id, v_line.provider::text,
      'Vente ' || v_line.provider::text || ' ' || coalesce(v_line.order_number, v_line.external_order_id) || ' (appliquée a posteriori)',
      v_line.placed_at
    );
    update public.order_items set inventory_applied = true where id = v_line.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Réception d'une commande fournisseur → mouvements 'receipt'
-- -----------------------------------------------------------------------------
create or replace function public.receive_purchase_order_items(
  p_purchase_order_id uuid,
  p_receipts jsonb  -- [{item_id, quantity}]
)
returns public.purchase_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po public.purchase_orders;
  v_r jsonb;
  v_item public.purchase_order_items;
  v_qty integer;
  v_all_received boolean;
  v_any_received boolean;
begin
  select * into v_po from public.purchase_orders where id = p_purchase_order_id for update;
  if v_po.id is null then
    raise exception 'PURCHASE_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.is_service_role() and not public.can_write_org(v_po.organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_po.status = 'cancelled' then
    raise exception 'PURCHASE_ORDER_CANCELLED' using errcode = '22023';
  end if;

  for v_r in select * from jsonb_array_elements(coalesce(p_receipts, '[]'::jsonb)) loop
    v_qty := coalesce((v_r ->> 'quantity')::integer, 0);
    if v_qty <= 0 then continue; end if;

    select * into v_item from public.purchase_order_items
      where id = (v_r ->> 'item_id')::uuid and purchase_order_id = p_purchase_order_id
      for update;
    if v_item.id is null then
      raise exception 'PURCHASE_ORDER_ITEM_NOT_FOUND' using errcode = 'P0002';
    end if;

    v_qty := least(v_qty, v_item.quantity_ordered - v_item.quantity_received);
    if v_qty <= 0 then continue; end if;

    perform public.apply_inventory_movement(
      v_po.organization_id, v_item.sku_id, 'receipt', v_qty,
      'purchase_order_item', v_item.id, null,
      'Réception commande fournisseur ' || coalesce(v_po.reference, left(v_po.id::text, 8)),
      now()
    );

    update public.purchase_order_items
      set quantity_received = quantity_received + v_qty
      where id = v_item.id;

    -- Le coût unitaire reçu devient le coût de référence du SKU s'il était inconnu.
    if v_item.unit_cost is not null then
      update public.skus set cost_price = v_item.unit_cost
        where id = v_item.sku_id and cost_price is null;
    end if;
  end loop;

  select bool_and(quantity_received >= quantity_ordered), bool_or(quantity_received > 0)
    into v_all_received, v_any_received
  from public.purchase_order_items where purchase_order_id = p_purchase_order_id;

  update public.purchase_orders
    set status = case when coalesce(v_all_received, false) then 'received'
                      when coalesce(v_any_received, false) then 'partially_received'
                      else status end,
        received_at = case when coalesce(v_all_received, false) then now() else received_at end
    where id = p_purchase_order_id
    returning * into v_po;

  return v_po;
end;
$$;

-- -----------------------------------------------------------------------------
-- Vues analytiques (security_invoker : la RLS des tables sous-jacentes s'applique)
-- -----------------------------------------------------------------------------

-- Statistiques de vente par SKU (7 / 30 / 90 jours) à partir des commandes non annulées.
create view public.v_sku_sales_stats
with (security_invoker = true)
as
select
  s.id as sku_id,
  s.organization_id,
  coalesce(sum(oi.quantity) filter (where o.placed_at >= now() - interval '7 days'), 0)::integer as units_7d,
  coalesce(sum(oi.quantity) filter (where o.placed_at >= now() - interval '30 days'), 0)::integer as units_30d,
  coalesce(sum(oi.quantity) filter (where o.placed_at >= now() - interval '90 days'), 0)::integer as units_90d,
  coalesce(sum(oi.quantity) filter (where o.placed_at >= now() - interval '14 days' and o.placed_at < now() - interval '7 days'), 0)::integer as units_prev_7d,
  coalesce(sum(oi.quantity) filter (where o.placed_at >= now() - interval '60 days' and o.placed_at < now() - interval '30 days'), 0)::integer as units_prev_30d,
  coalesce(sum(coalesce(oi.total, oi.unit_price * oi.quantity)) filter (where o.placed_at >= now() - interval '30 days'), 0)::numeric(14, 2) as revenue_30d,
  (sum(coalesce(oi.total, oi.unit_price * oi.quantity)) filter (where o.placed_at >= now() - interval '30 days')
    / nullif(sum(oi.quantity) filter (where o.placed_at >= now() - interval '30 days' and oi.unit_price is not null), 0))::numeric(12, 2) as avg_sale_price_30d,
  max(o.placed_at) as last_sale_at,
  min(o.placed_at) as first_sale_at
from public.skus s
left join public.order_items oi on oi.sku_id = s.id
left join public.orders o on o.id = oi.order_id and o.status not in ('cancelled', 'refunded')
group by s.id, s.organization_id;

-- Vue « ligne de stock » : tout ce qu'affiche la page /stock, sans N+1.
create view public.v_stock_overview
with (security_invoker = true)
as
select
  s.id as sku_id,
  s.organization_id,
  s.code,
  s.barcode,
  s.cost_price,
  s.sale_price,
  s.currency,
  s.location,
  s.reorder_point,
  s.safety_stock,
  s.lead_time_days,
  s.default_supplier_id,
  s.is_active,
  p.id as product_id,
  p.name as product_name,
  p.brand,
  p.category,
  p.image_url,
  v.id as variant_id,
  v.name as variant_name,
  v.condition,
  v.grade,
  i.quantity_on_hand,
  i.quantity_reserved,
  i.quantity_available,
  i.last_sale_at,
  i.last_movement_at,
  st.units_7d,
  st.units_30d,
  st.units_90d,
  st.units_prev_7d,
  st.units_prev_30d,
  st.revenue_30d,
  st.avg_sale_price_30d,
  st.first_sale_at,
  (s.cost_price * i.quantity_on_hand)::numeric(14, 2) as stock_value,
  (s.sale_price - s.cost_price)::numeric(12, 2) as unit_margin,
  (select count(*) from public.channel_listings cl where cl.sku_id = s.id and cl.status = 'active')::integer as active_listings_count,
  (select min(o.normalized_price) from public.sourcing_offers o where o.sku_id = s.id and o.status = 'active') as best_supplier_price,
  (select count(*) from public.sourcing_offers o where o.sku_id = s.id and o.status = 'active')::integer as supplier_offers_count
from public.skus s
join public.products p on p.id = s.product_id
join public.product_variants v on v.id = s.variant_id
join public.inventory i on i.sku_id = s.id
left join public.v_sku_sales_stats st on st.sku_id = s.id;

-- Chiffre d'affaires quotidien (30 derniers jours) pour le dashboard
create view public.v_daily_sales
with (security_invoker = true)
as
select
  o.organization_id,
  date_trunc('day', o.placed_at)::date as day,
  count(distinct o.id)::integer as orders_count,
  coalesce(sum(oi.quantity), 0)::integer as units,
  coalesce(sum(coalesce(oi.total, oi.unit_price * oi.quantity)), 0)::numeric(14, 2) as revenue
from public.orders o
left join public.order_items oi on oi.order_id = o.id
where o.status not in ('cancelled', 'refunded')
group by o.organization_id, date_trunc('day', o.placed_at)::date;

-- Annonces non associées (interface « Listings non associés »)
create view public.v_unmapped_listings
with (security_invoker = true)
as
select
  l.*,
  sc.name as channel_name,
  (select count(*) from public.mapping_suggestions ms where ms.listing_id = l.id and ms.status = 'pending')::integer as pending_suggestions
from public.channel_listings l
join public.sales_channels sc on sc.id = l.sales_channel_id
where l.mapping_status in ('unmapped', 'suggested') and l.status = 'active';

-- -----------------------------------------------------------------------------
-- create_organization_with_owner (v2) : ajoute le canal de vente 'manual' par défaut
-- -----------------------------------------------------------------------------
create or replace function public.create_organization_with_owner(
  p_name text,
  p_slug text,
  p_is_demo boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  insert into public.organizations (name, slug, is_demo, created_by)
  values (p_name, p_slug, p_is_demo, v_user)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_user, 'owner');

  insert into public.sales_channels (organization_id, provider, name, currency)
  values (v_org, 'manual', 'Ventes manuelles', 'EUR');

  update public.user_profiles
    set current_organization_id = v_org
    where user_id = v_user;

  return v_org;
end;
$$;
