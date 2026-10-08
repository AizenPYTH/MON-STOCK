-- =============================================================================
-- MON STOCK — migration 20261008003000 : durcissement de la synchronisation eBay
-- -----------------------------------------------------------------------------
-- 1. ingest_external_order : deux ingestions CONCURRENTES d'une commande encore inconnue
--    (webhook + cron, deux runs qui se chevauchent) faisaient échouer la seconde sur la
--    contrainte unique (23505) : `select ... for update` ne verrouille rien tant que la
--    ligne n'existe pas. L'insertion passe désormais par `on conflict do nothing` puis
--    relit la ligne verrouillée : la seconde ingestion devient une mise à jour (aucune
--    erreur, aucun second mouvement de stock).
--    + vérification que le canal (et la connexion) appartiennent bien à l'organisation.
-- 2. store_refreshed_access_token : écriture « compare-and-set » d'un access token
--    rafraîchi. Deux rafraîchissements simultanés ou un rafraîchissement concurrent d'une
--    déconnexion / reconnexion ne peuvent plus ressusciter des secrets supprimés ni
--    écraser les tokens d'une nouvelle autorisation.
-- Le corps de ingest_external_order reprend celui de la migration 0006 (seules
-- l'insertion de la commande et la validation d'entrée changent).
-- =============================================================================

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
      perform public.apply_inventory_movement(
        p_organization_id, v_line.sku_id, 'sale', -v_line.quantity,
        'order_item', v_line.id, p_provider::text,
        'Vente ' || p_provider::text || ' ' || coalesce(p_order ->> 'order_number', v_external_id),
        coalesce((p_order ->> 'placed_at')::timestamptz, now())
      );
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
      perform public.apply_inventory_movement(
        p_organization_id, v_line.sku_id, 'cancellation', v_line.quantity,
        'order_item', v_line.id, p_provider::text,
        'Annulation ' || p_provider::text || ' ' || coalesce(p_order ->> 'order_number', v_external_id),
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
-- store_refreshed_access_token : persistance atomique (compare-and-set) d'un access
-- token rafraîchi. Retour :
--   'stored'       : token et date d'expiration enregistrés ensemble ;
--   'stale'        : le refresh token utilisé n'est plus celui en base (reconnexion
--                    entre-temps) ou un token plus récent est déjà enregistré → rien n'est écrit ;
--   'disconnected' : connexion déconnectée / secrets supprimés → rien n'est écrit.
-- Réservée au service_role (moteur de synchronisation).
-- -----------------------------------------------------------------------------
create or replace function public.store_refreshed_access_token(
  p_connection_id uuid,
  p_access_token_enc text,
  p_expires_at timestamptz,
  p_refresh_token_enc_used text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn public.channel_connections;
  v_secret public.channel_connection_secrets;
begin
  if not public.is_service_role() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_access_token_enc is null or p_expires_at is null then
    raise exception 'INVALID_TOKEN' using errcode = '22023';
  end if;

  -- Verrou sur la connexion : sérialise avec la déconnexion / reconnexion et les autres rafraîchissements.
  select * into v_conn from public.channel_connections where id = p_connection_id for update;
  if v_conn.id is null or v_conn.status = 'disconnected' then
    return 'disconnected';
  end if;

  select * into v_secret from public.channel_connection_secrets where connection_id = p_connection_id for update;
  if v_secret.connection_id is null or v_secret.refresh_token_enc is null then
    return 'disconnected';
  end if;
  if v_secret.refresh_token_enc is distinct from p_refresh_token_enc_used then
    return 'stale';
  end if;
  if v_conn.token_expires_at is not null and v_conn.token_expires_at > p_expires_at and v_secret.access_token_enc is not null then
    return 'stale';
  end if;

  update public.channel_connection_secrets
    set access_token_enc = p_access_token_enc, updated_at = now()
    where connection_id = p_connection_id;
  update public.channel_connections
    set token_expires_at = p_expires_at
    where id = p_connection_id;
  return 'stored';
end;
$$;

revoke all on function public.store_refreshed_access_token(uuid, text, timestamptz, text) from public;
revoke all on function public.store_refreshed_access_token(uuid, text, timestamptz, text) from anon, authenticated;
grant execute on function public.store_refreshed_access_token(uuid, text, timestamptz, text) to service_role;
