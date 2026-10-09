-- =============================================================================
-- MON STOCK — migration 20261008005000 : mouvements de vente réservés aux appelants de confiance
-- -----------------------------------------------------------------------------
-- 1. apply_inventory_movement : les types 'sale' et 'cancellation' sont exemptés de la règle
--    anti-négatif (une vente marketplace reflète la réalité). Mais la fonction est exposée à
--    tout rédacteur via PostgREST : `rpc/apply_inventory_movement` avec p_type='sale' et
--    p_quantity=-500 rendait n'importe quel stock négatif sans commande associée.
--    Ces deux types sont désormais réservés :
--      * au service_role (serveur, synchronisation) ;
--      * aux fonctions SECURITY DEFINER internes qui les créent depuis une commande
--        (ingest_external_order, apply_pending_sales_for_sku), qui positionnent le drapeau
--        transactionnel `mon_stock.trusted_movement` juste avant l'appel et le retirent après.
--    Un client ne peut pas positionner ce drapeau : pg_catalog.set_config n'est pas exposé
--    par PostgREST et chaque requête REST est sa propre transaction.
-- 2. Lien de l'alerte « stock négatif » : le code SKU est encodé comme par encodeURIComponent
--    (un code « A/B?#% » produisait un lien cassé). Helper immuable url_encode_path_segment ;
--    les alertes ouvertes existantes sont corrigées.
-- Les corps de ingest_external_order (20261008003000) et apply_pending_sales_for_sku
-- (20261008002000) sont repris À L'IDENTIQUE (pg_get_functiondef), seuls les set_config
-- autour de l'appel à apply_inventory_movement sont ajoutés. Toute redéfinition future de ces
-- fonctions doit conserver ces lignes (testé : tests/integration/stock-trusted-movements.test.ts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper : encodage d'un segment de chemin d'URL, identique à encodeURIComponent
-- (caractères non réservés A-Z a-z 0-9 - _ . ! ~ * ' ( ) conservés, le reste en %XX UTF-8).
-- -----------------------------------------------------------------------------
create or replace function public.url_encode_path_segment(p_value text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select coalesce(string_agg(
    case
      when t.ch ~ '^[A-Za-z0-9_.!~*''()-]$' then t.ch
      else upper(regexp_replace(encode(convert_to(t.ch, 'UTF8'), 'hex'), '(..)', '%\1', 'g'))
    end, '' order by t.ord), '')
  from regexp_split_to_table(p_value, '') with ordinality as t(ch, ord)
$$;

revoke execute on function public.url_encode_path_segment(text) from public, anon;
grant execute on function public.url_encode_path_segment(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1. apply_inventory_movement v3
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_inventory_movement(p_organization_id uuid, p_sku_id uuid, p_type movement_type, p_quantity integer, p_reference_type text DEFAULT NULL::text, p_reference_id uuid DEFAULT NULL::uuid, p_channel text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS inventory_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inv public.inventory;
  v_after integer;
  v_mv public.inventory_movements;
  v_code text;
begin
  if not public.is_service_role() and not public.can_write_org(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  -- Ventes et annulations : réservées au serveur (service_role) et aux fonctions internes
  -- qui les créent à partir d'une commande (ingest_external_order, apply_pending_sales_for_sku).
  -- Elles sont exemptées de la règle anti-négatif : appelées directement via PostgREST par un
  -- simple rédacteur, elles permettraient de rendre n'importe quel stock négatif.
  -- Le drapeau est local à la transaction (set_config(..., true)) et n'est pas positionnable
  -- par un client : pg_catalog.set_config n'est pas exposé par PostgREST.
  if p_type in ('sale', 'cancellation')
     and not public.is_service_role()
     and coalesce(current_setting('mon_stock.trusted_movement', true), '') <> 'on' then
    raise exception 'FORBIDDEN' using errcode = '42501',
      detail = 'MOVEMENT_TYPE_RESTRICTED: ' || p_type::text;
  end if;
  if p_quantity is null or p_quantity = 0 then
    raise exception 'MOVEMENT_QUANTITY_ZERO' using errcode = '22023';
  end if;
  -- Borne de bon sens : aucun mouvement unitaire ne dépasse 1 000 000 d'unités
  -- (protège aussi contre le dépassement de capacité de l'entier de stock).
  if abs(p_quantity::bigint) > 1000000 then
    raise exception 'MOVEMENT_QUANTITY_TOO_LARGE' using errcode = '22023';
  end if;
  -- Cohérence du signe : une réception ne retire jamais, une vente n'ajoute jamais.
  if (p_type in ('initial', 'receipt', 'return', 'transfer_in', 'cancellation') and p_quantity < 0)
     or (p_type in ('sale', 'transfer_out') and p_quantity > 0) then
    raise exception 'MOVEMENT_SIGN_INVALID' using errcode = '22023';
  end if;

  select * into v_inv
  from public.inventory
  where sku_id = p_sku_id and organization_id = p_organization_id
  for update;

  if v_inv.sku_id is null then
    raise exception 'SKU_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_inv.quantity_on_hand::bigint + p_quantity > 1000000000 then
    raise exception 'STOCK_QUANTITY_TOO_LARGE' using errcode = '22023';
  end if;
  v_after := v_inv.quantity_on_hand + p_quantity;

  -- Les mouvements manuels (ajustement, correction, transfert, réception) ne peuvent pas
  -- rendre le stock négatif. Les ventes marketplace, elles, reflètent la réalité : on
  -- autorise le négatif (alerte « stock négatif » ci-dessous) plutôt que de rejeter une vente réelle.
  if v_after < 0 and p_quantity < 0 and p_type in ('adjustment', 'correction', 'transfer_out', 'initial', 'receipt') then
    raise exception 'INSUFFICIENT_STOCK' using errcode = '23514';
  end if;

  update public.inventory
    set quantity_on_hand = v_after,
        last_movement_at = greatest(coalesce(last_movement_at, p_occurred_at), p_occurred_at),
        last_sale_at = case when p_type = 'sale'
                            then greatest(coalesce(last_sale_at, p_occurred_at), p_occurred_at)
                            else last_sale_at end,
        updated_at = now()
    where sku_id = p_sku_id;

  insert into public.inventory_movements (
    organization_id, sku_id, type, quantity, quantity_after, channel,
    reference_type, reference_id, note, created_by, occurred_at
  ) values (
    p_organization_id, p_sku_id, p_type, p_quantity, v_after, p_channel,
    p_reference_type, p_reference_id, p_note, auth.uid(), p_occurred_at
  )
  returning * into v_mv;

  -- Alerte « stock négatif » : ouverte au passage sous zéro, résolue au retour à zéro ou plus.
  if v_after < 0 and v_inv.quantity_on_hand >= 0 then
    select code into v_code from public.skus where id = p_sku_id;
    insert into public.alerts (organization_id, type, severity, title, message, entity_type, entity_id, dedupe_key, action_href)
    values (
      p_organization_id, 'negative_stock', 'critical',
      'Stock négatif : ' || coalesce(v_code, ''),
      'Une vente a été déduite au-delà du stock connu (stock : ' || v_after || '). Vérifiez le stock physique puis corrigez-le par un mouvement.',
      'sku', p_sku_id, 'negative_stock:' || p_sku_id::text,
      '/stock/' || public.url_encode_path_segment(coalesce(v_code, ''))
    )
    on conflict (organization_id, dedupe_key) where status <> 'resolved' do nothing;
  elsif v_after >= 0 and v_inv.quantity_on_hand < 0 then
    update public.alerts
      set status = 'resolved', resolved_at = now()
      where organization_id = p_organization_id
        and dedupe_key = 'negative_stock:' || p_sku_id::text
        and status <> 'resolved';
  end if;

  return v_mv;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 2. Appelants internes de confiance : drapeau transactionnel autour de l'appel.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingest_external_order(p_organization_id uuid, p_sales_channel_id uuid, p_connection_id uuid, p_provider channel_provider, p_order jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_external_id text := nullif(btrim(coalesce(p_order ->> 'external_order_id', '')), '');
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

  if v_status in ('cancelled', 'refunded') then
    -- Annulation / remboursement : on recrédite ce qui avait été déduit, une seule fois.
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
    'movements', v_movements
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_pending_sales_for_sku(p_sku_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

-- Privilèges inchangés (create or replace conserve les ACL ; réaffirmés par sûreté).
revoke execute on function public.apply_inventory_movement(uuid, uuid, public.movement_type, integer, text, uuid, text, text, timestamptz) from public, anon;
grant execute on function public.apply_inventory_movement(uuid, uuid, public.movement_type, integer, text, uuid, text, text, timestamptz) to authenticated, service_role;
revoke execute on function public.ingest_external_order(uuid, uuid, uuid, public.channel_provider, jsonb, jsonb) from public, anon;
grant execute on function public.ingest_external_order(uuid, uuid, uuid, public.channel_provider, jsonb, jsonb) to authenticated, service_role;
revoke execute on function public.apply_pending_sales_for_sku(uuid) from public, anon;
grant execute on function public.apply_pending_sales_for_sku(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Alertes « stock négatif » encore ouvertes : lien recalculé avec le code encodé.
-- -----------------------------------------------------------------------------
update public.alerts a
  set action_href = '/stock/' || public.url_encode_path_segment(s.code)
  from public.skus s
  where a.type = 'negative_stock'
    and a.status <> 'resolved'
    and a.entity_type = 'sku'
    and s.id = a.entity_id
    and s.organization_id = a.organization_id
    and a.action_href is distinct from '/stock/' || public.url_encode_path_segment(s.code);
