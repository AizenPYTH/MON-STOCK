-- =============================================================================
-- MON STOCK — migration 20261008002100 : vues analytiques honnêtes
--
--  1. Devises : un chiffre d'affaires n'est jamais additionné entre devises.
--       * v_sku_sales_stats.revenue_30d / avg_sale_price_30d : uniquement les lignes
--         vendues dans la devise du SKU ; les unités vendues dans une autre devise sont
--         exposées à part (foreign_currency_units_30d) pour être signalées.
--       * v_daily_sales : une ligne par (organisation, jour, devise).
--  2. Fuseau horaire : les séries quotidiennes sont découpées en jours civils
--     Europe/Paris (MON STOCK cible des vendeurs français) — « aujourd'hui » commence à
--     minuit heure de Paris, pas à minuit UTC. Les fenêtres glissantes (7 / 30 / 90 j)
--     restent des durées (now() − intervalle), indépendantes du fuseau.
--  3. v_stock_overview : colonnes channel_providers / supplier_ids pour filtrer la liste
--     de stock côté base (au lieu d'énormes listes d'identifiants dans l'URL PostgREST).
--  4. sku_rotation : rotation du stock sur 30 jours = unités vendues / stock moyen,
--     stock moyen reconstitué exactement à partir du journal des mouvements.
-- =============================================================================

create or replace view public.v_sku_sales_stats
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
  -- Chiffre d'affaires et prix moyen : lignes dans la devise du SKU, au prix connu.
  coalesce(sum(coalesce(oi.total, oi.unit_price * oi.quantity)) filter (
    where o.placed_at >= now() - interval '30 days'
      and coalesce(oi.currency, o.currency) = s.currency
  ), 0)::numeric(14, 2) as revenue_30d,
  (sum(coalesce(oi.total, oi.unit_price * oi.quantity)) filter (
    where o.placed_at >= now() - interval '30 days'
      and coalesce(oi.currency, o.currency) = s.currency
      and coalesce(oi.total, oi.unit_price) is not null
  ) / nullif(sum(oi.quantity) filter (
    where o.placed_at >= now() - interval '30 days'
      and coalesce(oi.currency, o.currency) = s.currency
      and coalesce(oi.total, oi.unit_price) is not null
  ), 0))::numeric(12, 2) as avg_sale_price_30d,
  max(o.placed_at) as last_sale_at,
  min(o.placed_at) as first_sale_at,
  coalesce(sum(oi.quantity) filter (
    where o.placed_at >= now() - interval '30 days'
      and coalesce(oi.currency, o.currency) <> s.currency
  ), 0)::integer as foreign_currency_units_30d
from public.skus s
left join public.order_items oi on oi.sku_id = s.id
left join public.orders o on o.id = oi.order_id and o.status not in ('cancelled', 'refunded')
group by s.id, s.organization_id, s.currency;

create or replace view public.v_stock_overview
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
  (select count(*) from public.sourcing_offers o where o.sku_id = s.id and o.status = 'active')::integer as supplier_offers_count,
  -- Canaux où le SKU est associé à une annonce (filtre « Canal » de la liste de stock).
  array(select distinct cl.provider::text from public.channel_listings cl where cl.sku_id = s.id order by 1) as channel_providers,
  -- Fournisseurs liés : offres associées au SKU + fournisseur par défaut (filtre « Fournisseur »).
  array(
    select x.id from (
      select so.supplier_id as id from public.sourcing_offers so where so.sku_id = s.id
      union
      select s.default_supplier_id where s.default_supplier_id is not null
    ) x order by 1
  ) as supplier_ids,
  st.foreign_currency_units_30d,
  p.is_archived as product_archived
from public.skus s
join public.products p on p.id = s.product_id
join public.product_variants v on v.id = s.variant_id
join public.inventory i on i.sku_id = s.id
left join public.v_sku_sales_stats st on st.sku_id = s.id;

-- Chiffre d'affaires quotidien : jours civils Europe/Paris, une ligne par devise.
create or replace view public.v_daily_sales
with (security_invoker = true)
as
select
  o.organization_id,
  (o.placed_at at time zone 'Europe/Paris')::date as day,
  count(distinct o.id)::integer as orders_count,
  coalesce(sum(oi.quantity), 0)::integer as units,
  coalesce(sum(coalesce(oi.total, oi.unit_price * oi.quantity)), 0)::numeric(14, 2) as revenue,
  o.currency
from public.orders o
left join public.order_items oi on oi.order_id = o.id
where o.status not in ('cancelled', 'refunded')
group by o.organization_id, (o.placed_at at time zone 'Europe/Paris')::date, o.currency;

-- -----------------------------------------------------------------------------
-- Rotation du stock (30 jours) — SECURITY INVOKER : la RLS de l'appelant s'applique.
--
-- Fenêtre [a, now] avec a = max(now − 30 j, création du SKU).
-- Le stock à l'instant t vaut S_now − Σ (mouvements postérieurs à t), donc
--   ∫ stock dt = S_now · T − Σ_{mouvements m dans ]a, now]} q_m · (t_m − a)
--   stock moyen = S_now − Σ q_m · (t_m − a) / T
-- Unités vendues = lignes de commandes non annulées/remboursées passées dans la fenêtre.
-- Aucune estimation : si la fenêtre est trop courte ou le stock moyen nul, l'appelant
-- affiche « Pas assez de données ».
-- -----------------------------------------------------------------------------
create or replace function public.sku_rotation(
  p_organization_id uuid,
  p_sku_ids uuid[] default null,
  p_days integer default 30
)
returns table (
  sku_id uuid,
  window_start timestamptz,
  window_days numeric,
  avg_on_hand numeric,
  units_sold integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with k as (
    select s.id,
           greatest(now() - make_interval(days => greatest(1, least(p_days, 365))), s.created_at) as a,
           i.quantity_on_hand as on_hand
    from public.skus s
    join public.inventory i on i.sku_id = s.id
    where s.organization_id = p_organization_id
      and (p_sku_ids is null or s.id = any (p_sku_ids))
  ),
  mv as (
    select m.sku_id,
           sum(m.quantity::numeric * extract(epoch from (least(m.occurred_at, now()) - k.a))) as weighted
    from public.inventory_movements m
    join k on k.id = m.sku_id
    where m.occurred_at > k.a
    group by m.sku_id
  ),
  sold as (
    select oi.sku_id, sum(oi.quantity)::integer as units
    from public.order_items oi
    join k on k.id = oi.sku_id
    join public.orders o on o.id = oi.order_id
    where o.status not in ('cancelled', 'refunded')
      and o.placed_at > k.a
    group by oi.sku_id
  )
  select k.id,
         k.a,
         round((extract(epoch from (now() - k.a)) / 86400)::numeric, 2),
         case when extract(epoch from (now() - k.a)) <= 0 then null
              else round(k.on_hand - coalesce(mv.weighted, 0) / extract(epoch from (now() - k.a))::numeric, 4)
         end,
         coalesce(sold.units, 0)
  from k
  left join mv on mv.sku_id = k.id
  left join sold on sold.sku_id = k.id
$$;

revoke execute on function public.sku_rotation(uuid, uuid[], integer) from public, anon;
grant execute on function public.sku_rotation(uuid, uuid[], integer) to authenticated, service_role;
