-- =============================================================================
-- MON STOCK — migration 20261023000130 : pas de déduction de stock pour les ventes antérieures à la
-- connexion du compte (audit 2026-10-22 : I-02).
--
-- Avant : à la première synchronisation (lancée par le cron sans attendre l'assistant), les ventes
-- des 90 derniers jours des annonces associées par SKU décrémentaient le stock — alors que le stock
-- saisi par le vendeur au moment de la connexion les reflète déjà (double déduction).
-- Après (règle métier unique, côté base) : une commande dont placed_at est ANTÉRIEURE à
-- channel_connections.sales_stock_cutoff_at (première connexion, migration 20261023000100) est
-- importée normalement (ventes, analyses, associations) mais ne crée AUCUN mouvement de stock :
--   - ingest_external_order : pas de déduction à la création ; renvoie history_items et
--     inventory_skipped_reason = 'before_connection' ;
--   - apply_pending_sales_for_sku : ne déduit jamais ces lignes non plus.
-- Une annulation / un remboursement ultérieur d'une telle commande ne recrédite rien (aucune ligne
-- n'a été déduite). Idempotence inchangée (une commande déjà créée n'est jamais redéduite).
-- Corps repris de 20261010000300 (ingest_external_order) et 20261008005000
-- (apply_pending_sales_for_sku) ; seules les lignes marquées « I-02 » changent. search_path
-- public, pg_temp (cohérent avec 20261023000300). Signatures et droits inchangés.
-- Retour arrière : supabase/ops/rollback/20261023000130_ingest_sales_cutoff_down.sql
-- =============================================================================

do $pre$
begin
  if to_regprocedure('public.ingest_external_order(uuid, uuid, uuid, public.channel_provider, jsonb, jsonb)') is null
     or to_regprocedure('public.apply_pending_sales_for_sku(uuid)') is null then
    raise exception 'Contrôle préalable 20261023000130 : fonctions ingest_external_order / apply_pending_sales_for_sku absentes.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'channel_connections' and column_name = 'sales_stock_cutoff_at') then
    raise exception 'Contrôle préalable 20261023000130 : colonne channel_connections.sales_stock_cutoff_at absente (appliquer 20261023000100 d''abord).';
  end if;
end
$pre$;

CREATE OR REPLACE FUNCTION public.ingest_external_order(p_organization_id uuid, p_sales_channel_id uuid, p_connection_id uuid, p_provider channel_provider, p_order jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_was_shipped boolean;
  v_recredit boolean;
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
  v_external_id text := nullif(btrim(coalesce(p_order ->> 'external_order_id', '')), '');
  v_placed_at timestamptz := coalesce((p_order ->> 'placed_at')::timestamptz, now());
  v_cutoff timestamptz;
  v_history boolean := false;
  v_history_items integer := 0;
begin
  if not public.is_service_role() and not public.can_write_org(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_external_id is null then
    raise exception 'INVALID_ORDER: external_order_id manquant' using errcode = '22023';
  end if;
  -- Le canal (et la connexion) doivent appartenir à l'organisation : sinon une ligne de
  -- commande pourrait être résolue sur l'annonce (et le SKU) d'une autre organisation.
  if not exists (select 1 from public.sales_channels sc where sc.id = p_sales_channel_id and sc.organization_id = p_organization_id) then
    raise exception 'CHANNEL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_connection_id is not null and not exists (
    select 1 from public.channel_connections cc
    where cc.id = p_connection_id and cc.organization_id = p_organization_id and cc.sales_channel_id = p_sales_channel_id
  ) then
    raise exception 'CONNECTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_status := coalesce((p_order ->> 'status')::public.order_status, 'unknown');

  -- I-02 : vente passée AVANT la première connexion du compte → importée (analyse), jamais déduite.
  if p_connection_id is not null then
    select cc.sales_stock_cutoff_at into v_cutoff from public.channel_connections cc where cc.id = p_connection_id;
  end if;
  v_history := v_cutoff is not null and v_placed_at < v_cutoff;

  select * into v_existing
  from public.orders o
  where o.organization_id = p_organization_id
    and o.provider = p_provider
    and o.external_order_id = v_external_id
  for update;

  if v_existing.id is null then
    -- `on conflict do nothing` : si une ingestion concurrente insère la même commande, cette
    -- instruction attend sa validation puis n'insère rien (au lieu de lever 23505).
    insert into public.orders (
      organization_id, sales_channel_id, connection_id, provider, external_order_id, order_number,
      status, payment_status, fulfillment_status, buyer_username, currency,
      subtotal, shipping_total, tax_total, fee_total, total,
      placed_at, external_modified_at, payload_hash
    ) values (
      p_organization_id, p_sales_channel_id, p_connection_id, p_provider,
      v_external_id, p_order ->> 'order_number',
      v_status, p_order ->> 'payment_status', p_order ->> 'fulfillment_status',
      p_order ->> 'buyer_username', coalesce(p_order ->> 'currency', 'EUR'),
      (p_order ->> 'subtotal')::numeric, (p_order ->> 'shipping_total')::numeric,
      (p_order ->> 'tax_total')::numeric, (p_order ->> 'fee_total')::numeric, (p_order ->> 'total')::numeric,
      coalesce((p_order ->> 'placed_at')::timestamptz, now()),
      (p_order ->> 'external_modified_at')::timestamptz,
      p_order ->> 'payload_hash'
    )
    on conflict (organization_id, provider, external_order_id) do nothing
    returning id into v_order_id;

    if v_order_id is null then
      -- Créée entre-temps par une autre transaction (validée) : on la relit verrouillée.
      select * into v_existing
      from public.orders o
      where o.organization_id = p_organization_id
        and o.provider = p_provider
        and o.external_order_id = v_external_id
      for update;
    else
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
    end if;
  end if;

  if not v_created then
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

  -- Application du stock : une seule fois par ligne, uniquement à la création de la commande et si elle n'est pas annulée.
  -- Une ligne associée a posteriori (map_listing_to_sku) n'est JAMAIS déduite ici : c'est l'action explicite
  -- apply_pending_sales_for_sku qui s'en charge, après vérification du stock physique par l'utilisateur.
  if v_status in ('cancelled', 'refunded') then
    null;
  elsif v_created and v_history then
    -- Vente antérieure à la connexion : le stock saisi la reflète déjà. Aucun mouvement, ni ici ni
    -- plus tard par apply_pending_sales_for_sku (même règle).
    select count(*) into v_history_items from public.order_items where order_id = v_order_id and sku_id is not null;
  elsif v_created then
    for v_line in
      select * from public.order_items oi
      where oi.order_id = v_order_id and oi.sku_id is not null and oi.inventory_applied = false
      for update
    loop
      perform set_config('mon_stock.trusted_movement', 'on', true);
      perform public.apply_inventory_movement(
        p_organization_id, v_line.sku_id, 'sale', -v_line.quantity,
        'order_item', v_line.id, p_provider::text,
        'Vente ' || p_provider::text || ' ' || coalesce(p_order ->> 'order_number', v_external_id),
        coalesce((p_order ->> 'placed_at')::timestamptz, now())
      );
      perform set_config('mon_stock.trusted_movement', 'off', true);
      update public.order_items set inventory_applied = true where id = v_line.id;
      v_movements := v_movements + 1;
    end loop;

    update public.orders
      set inventory_applied = exists (select 1 from public.order_items where order_id = v_order_id and inventory_applied),
          inventory_applied_at = coalesce(inventory_applied_at, case when v_movements > 0 then now() end)
      where id = v_order_id;
  end if;

  -- Remboursement APRÈS expédition (colis perdu, article gardé par l'acheteur…) : l'article n'est pas
  -- forcément revenu → aucun recrédit automatique ; une alerte invite à enregistrer un « Retour client »
  -- si l'article revient. Annulation, ou remboursement avant expédition : recrédit (une seule fois).
  v_was_shipped := coalesce(v_existing.status in ('shipped', 'delivered'), false)
    or upper(coalesce(p_order ->> 'fulfillment_status', v_existing.fulfillment_status, '')) in ('FULFILLED', 'IN_PROGRESS', 'SHIPPED', 'DELIVERED');
  v_recredit := v_status = 'cancelled' or (v_status = 'refunded' and not v_was_shipped);

  if v_status = 'refunded' and v_was_shipped and exists (select 1 from public.order_items where order_id = v_order_id and sku_id is not null and inventory_applied) then
    insert into public.alerts (organization_id, type, severity, title, message, dedupe_key, entity_type, entity_id, action_href)
    values (
      p_organization_id, 'refund_after_shipment', 'warning',
      'Remboursement après expédition',
      'Commande ' || coalesce(p_order ->> 'order_number', v_external_id) || ' remboursée après expédition : le stock n''a pas été recrédité automatiquement. Si l''article vous est retourné, enregistrez un « Retour client » sur le SKU.',
      'refund_after_shipment:' || v_order_id::text, 'order', v_order_id, '/sales'
    )
    on conflict (organization_id, dedupe_key) where status <> 'resolved' do nothing;
  end if;

  if v_recredit then
    -- Annulation / remboursement avant expédition : on recrédite ce qui avait été déduit, une seule fois.
    for v_line in
      select * from public.order_items oi
      where oi.order_id = v_order_id and oi.sku_id is not null and oi.inventory_applied = true
      for update
    loop
      perform set_config('mon_stock.trusted_movement', 'on', true);
      perform public.apply_inventory_movement(
        p_organization_id, v_line.sku_id, 'cancellation', v_line.quantity,
        'order_item', v_line.id, p_provider::text,
        'Annulation ' || p_provider::text || ' ' || coalesce(p_order ->> 'order_number', v_external_id),
        now()
      );
      perform set_config('mon_stock.trusted_movement', 'off', true);
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
    'movements', v_movements,
    'history_items', v_history_items,
    'inventory_skipped_reason', case when v_history then 'before_connection' end
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.apply_pending_sales_for_sku(p_sku_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      -- I-02 : jamais de déduction pour une vente antérieure à la première connexion du compte.
      and not exists (
        select 1 from public.channel_connections cc
        where cc.id = o.connection_id and cc.sales_stock_cutoff_at is not null and o.placed_at < cc.sales_stock_cutoff_at
      )
    for update of oi
  loop
    perform set_config('mon_stock.trusted_movement', 'on', true);
    perform public.apply_inventory_movement(
      v_sku.organization_id, p_sku_id, 'sale', -v_line.quantity,
      'order_item', v_line.id, v_line.provider::text,
      'Vente ' || v_line.provider::text || ' ' || coalesce(v_line.order_number, v_line.external_order_id) || ' (appliquée a posteriori)',
      v_line.placed_at
    );
    perform set_config('mon_stock.trusted_movement', 'off', true);
    update public.order_items set inventory_applied = true where id = v_line.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;


-- Droits inchangés (réaffirmés) : ingestion réservée au serveur ; ventes en attente : utilisateurs et serveur.
revoke execute on function public.ingest_external_order(uuid, uuid, uuid, public.channel_provider, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_external_order(uuid, uuid, uuid, public.channel_provider, jsonb, jsonb) to service_role;
revoke execute on function public.apply_pending_sales_for_sku(uuid) from public, anon;
grant execute on function public.apply_pending_sales_for_sku(uuid) to authenticated, service_role;
