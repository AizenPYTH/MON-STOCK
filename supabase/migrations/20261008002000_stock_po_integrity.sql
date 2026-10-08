-- =============================================================================
-- MON STOCK — migration 20261008002000 : intégrité du stock et des commandes fournisseurs
--
--  1. apply_inventory_movement v2 : bornes de quantité, cohérence du signe par type,
--     « correction » manuelle soumise à la règle anti-négatif, alerte « stock négatif »
--     ouverte/résolue automatiquement.
--  2. Catalogue : un produit / une variante / un SKU ayant un historique (mouvements,
--     ventes, achats) ne peut pas être supprimé par un client — l'archivage est le modèle
--     de suppression. La cascade depuis l'organisation (propriétaire) reste possible.
--  3. Commandes fournisseurs :
--       * total toujours dérivé des lignes (NULL si un coût est inconnu ou si une ligne
--         n'est pas dans la devise de la commande) ;
--       * machine à états appliquée en base (un client ne peut pas marquer « reçue »
--         sans réceptionner, ni revenir en arrière) ;
--       * lignes figées dès la confirmation, quantity_received modifiable uniquement par
--         receive_purchase_order_items ;
--       * suppression limitée aux brouillons / commandes annulées sans réception.
--  4. receive_purchase_order_items v2 : refus des brouillons et des commandes déjà
--     reçues, contrôle optimiste (expected_received) contre le double envoi, coût de
--     référence mis à jour uniquement dans la devise du SKU.
--
-- Rôle « client » = current_user authenticated/anon (requête PostgREST directe).
-- Les fonctions SECURITY DEFINER et les cascades référentielles s'exécutent sous le
-- propriétaire des tables : elles ne sont pas concernées par les garde-fous « client ».
-- =============================================================================

create or replace function public.is_client_role()
returns boolean
language sql
stable
set search_path = public
as $$
  select current_user in ('authenticated', 'anon')
$$;

-- -----------------------------------------------------------------------------
-- 0. Journal des mouvements : ordre d'insertion exact.
--    now() est figé pour toute la transaction : plusieurs mouvements d'une même transaction
--    (vente puis annulation, réception multi-lignes) avaient le même created_at et un ordre
--    indéterminé. clock_timestamp() donne l'horodatage réel de chaque insertion.
-- -----------------------------------------------------------------------------
alter table public.inventory_movements alter column created_at set default clock_timestamp();

-- -----------------------------------------------------------------------------
-- 1. apply_inventory_movement v2
-- -----------------------------------------------------------------------------
create or replace function public.apply_inventory_movement(
  p_organization_id uuid,
  p_sku_id uuid,
  p_type public.movement_type,
  p_quantity integer,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_channel text default null,
  p_note text default null,
  p_occurred_at timestamptz default now()
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.inventory;
  v_after integer;
  v_mv public.inventory_movements;
  v_code text;
begin
  if not public.is_service_role() and not public.can_write_org(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
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
      '/stock/' || coalesce(v_code, '')
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
$$;

revoke execute on function public.apply_inventory_movement(uuid, uuid, public.movement_type, integer, text, uuid, text, text, timestamptz) from public, anon;

-- -----------------------------------------------------------------------------
-- 2. Suppression du catalogue : l'archivage est le modèle de suppression
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER : lecture sous la RLS de l'appelant (aucune fuite inter-organisations ;
-- le garde-fou n'est appelé que pour un SKU que l'appelant peut supprimer, donc lire).
create or replace function public.sku_has_history(p_sku_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (select 1 from public.inventory_movements where sku_id = p_sku_id)
      or exists (select 1 from public.order_items where sku_id = p_sku_id)
      or exists (select 1 from public.purchase_order_items where sku_id = p_sku_id)
$$;

revoke execute on function public.sku_has_history(uuid) from public, anon;

create or replace function public.guard_catalog_delete()
returns trigger
language plpgsql
as $$
begin
  if not public.is_client_role() then
    return old;
  end if;
  if tg_table_name = 'skus' then
    if public.sku_has_history(old.id) then
      raise exception 'SKU_HAS_HISTORY' using errcode = '23503',
        hint = 'Archivez le SKU : son historique (mouvements, ventes, achats) doit être conservé.';
    end if;
  elsif tg_table_name = 'product_variants' then
    if exists (select 1 from public.skus s where s.variant_id = old.id and public.sku_has_history(s.id)) then
      raise exception 'SKU_HAS_HISTORY' using errcode = '23503',
        hint = 'Archivez le produit : une de ses variantes a un historique.';
    end if;
  elsif tg_table_name = 'products' then
    if exists (select 1 from public.skus s where s.product_id = old.id and public.sku_has_history(s.id)) then
      raise exception 'SKU_HAS_HISTORY' using errcode = '23503',
        hint = 'Archivez le produit : un de ses SKU a un historique.';
    end if;
  end if;
  return old;
end;
$$;

create trigger skus_guard_delete before delete on public.skus
  for each row execute function public.guard_catalog_delete();
create trigger product_variants_guard_delete before delete on public.product_variants
  for each row execute function public.guard_catalog_delete();
create trigger products_guard_delete before delete on public.products
  for each row execute function public.guard_catalog_delete();

-- -----------------------------------------------------------------------------
-- 3. Commandes fournisseurs
-- -----------------------------------------------------------------------------

-- Total dérivé des lignes : NULL si aucune ligne, si un coût est inconnu ou si une ligne
-- n'est pas exprimée dans la devise de la commande (jamais de somme multi-devises).
-- SECURITY INVOKER : appelée par les triggers (RLS de l'appelant, ou propriétaire depuis
-- purchase_order_items_after_write) — jamais de lecture du total d'une autre organisation.
create or replace function public.purchase_order_computed_total(p_purchase_order_id uuid, p_currency text)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when count(*) = 0 then null
    when bool_or(i.unit_cost is null) then null
    when bool_or(coalesce(i.currency, p_currency) <> p_currency) then null
    when sum(i.unit_cost * i.quantity_ordered) >= 10000000000 then null
    else round(sum(i.unit_cost * i.quantity_ordered), 2)
  end
  from public.purchase_order_items i
  where i.purchase_order_id = p_purchase_order_id
$$;

revoke execute on function public.purchase_order_computed_total(uuid, text) from public, anon;

create or replace function public.purchase_orders_before_write()
returns trigger
language plpgsql
as $$
declare
  v_items integer;
begin
  if tg_op = 'INSERT' then
    if public.is_client_role() and new.status not in ('draft', 'sent') then
      raise exception 'PURCHASE_ORDER_INVALID_STATUS' using errcode = '22023';
    end if;
    new.total := null;
    if new.status = 'sent' and new.sent_at is null then
      new.sent_at := now();
    end if;
    return new;
  end if;

  -- UPDATE
  new.total := public.purchase_order_computed_total(new.id, new.currency);

  if new.status is distinct from old.status then
    if old.status in ('received', 'cancelled') then
      raise exception 'PURCHASE_ORDER_CLOSED' using errcode = '22023';
    end if;
    if public.is_client_role() then
      -- Transitions autorisées aux utilisateurs ; « partiellement reçue » / « reçue »
      -- ne s'obtiennent que par receive_purchase_order_items.
      if not (
        (old.status = 'draft' and new.status in ('sent', 'cancelled'))
        or (old.status = 'sent' and new.status in ('draft', 'confirmed', 'cancelled'))
        or (old.status = 'confirmed' and new.status = 'cancelled')
        or (old.status = 'partially_received' and new.status = 'cancelled')
      ) then
        raise exception 'PURCHASE_ORDER_INVALID_TRANSITION' using errcode = '22023',
          detail = old.status || ' → ' || new.status;
      end if;
    end if;
    if new.status = 'sent' then
      select count(*) into v_items from public.purchase_order_items where purchase_order_id = new.id;
      if v_items = 0 then
        raise exception 'PURCHASE_ORDER_EMPTY' using errcode = '22023';
      end if;
      new.sent_at := coalesce(new.sent_at, now());
    end if;
  end if;

  if public.is_client_role() and new.currency is distinct from old.currency and old.status <> 'draft' then
    raise exception 'PURCHASE_ORDER_LOCKED' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger purchase_orders_before_write
  before insert or update on public.purchase_orders
  for each row execute function public.purchase_orders_before_write();

create or replace function public.purchase_orders_guard_delete()
returns trigger
language plpgsql
as $$
begin
  if public.is_client_role() then
    if old.status not in ('draft', 'cancelled')
       or exists (select 1 from public.purchase_order_items where purchase_order_id = old.id and quantity_received > 0) then
      raise exception 'PURCHASE_ORDER_NOT_DELETABLE' using errcode = '23503',
        hint = 'Annulez la commande : une commande envoyée ou réceptionnée est conservée dans l''historique.';
    end if;
  end if;
  return old;
end;
$$;

create trigger purchase_orders_guard_delete
  before delete on public.purchase_orders
  for each row execute function public.purchase_orders_guard_delete();

create or replace function public.purchase_order_items_before_write()
returns trigger
language plpgsql
as $$
declare
  v_status public.purchase_order_status;
  v_row public.purchase_order_items;
begin
  if not public.is_client_role() then
    return coalesce(new, old);
  end if;
  v_row := case when tg_op = 'DELETE' then old else new end;
  -- Lecture sous la RLS de l'appelant : une commande d'une autre organisation est introuvable
  -- (l'appartenance des références est par ailleurs contrôlée par zz_same_org_guard).
  -- Les cascades s'exécutent sous le propriétaire et ne passent pas par ici.
  select status into v_status from public.purchase_orders
    where id = v_row.purchase_order_id and organization_id = v_row.organization_id;
  if v_status is null then
    raise exception 'PURCHASE_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if tg_op = 'UPDATE' then
    if new.quantity_received is distinct from old.quantity_received then
      raise exception 'PURCHASE_ORDER_RECEIPT_REQUIRED' using errcode = '42501',
        hint = 'Les quantités reçues ne se modifient que par une réception (mouvement de stock).';
    end if;
    if new.purchase_order_id is distinct from old.purchase_order_id or new.organization_id is distinct from old.organization_id then
      raise exception 'PURCHASE_ORDER_LOCKED' using errcode = '22023';
    end if;
  elsif tg_op = 'INSERT' then
    if new.quantity_received <> 0 then
      raise exception 'PURCHASE_ORDER_RECEIPT_REQUIRED' using errcode = '42501';
    end if;
  end if;

  -- Les lignes sont figées dès que la commande est confirmée (ou reçue / annulée).
  if v_status not in ('draft', 'sent') then
    raise exception 'PURCHASE_ORDER_LOCKED' using errcode = '22023',
      hint = 'Seule une commande en brouillon (ou envoyée, avant confirmation) peut être modifiée.';
  end if;
  if tg_op = 'DELETE' and old.quantity_received > 0 then
    raise exception 'PURCHASE_ORDER_LOCKED' using errcode = '22023';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger purchase_order_items_before_write
  before insert or update or delete on public.purchase_order_items
  for each row execute function public.purchase_order_items_before_write();

-- Recalcul du total de la commande à chaque modification de ses lignes.
create or replace function public.purchase_order_items_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po_id uuid;
begin
  v_po_id := case when tg_op = 'DELETE' then old.purchase_order_id else new.purchase_order_id end;
  update public.purchase_orders po
    set total = public.purchase_order_computed_total(po.id, po.currency)
    where po.id = v_po_id
      and po.total is distinct from public.purchase_order_computed_total(po.id, po.currency);
  return null;
end;
$$;

create trigger purchase_order_items_after_write
  after insert or update or delete on public.purchase_order_items
  for each row execute function public.purchase_order_items_after_write();

-- Réconciliation des totaux existants.
update public.purchase_orders po
  set total = public.purchase_order_computed_total(po.id, po.currency)
  where po.total is distinct from public.purchase_order_computed_total(po.id, po.currency);

-- -----------------------------------------------------------------------------
-- 4. receive_purchase_order_items v2
--    p_receipts : [{item_id, quantity, expected_received?}]
--    expected_received = quantité reçue affichée à l'utilisateur au moment de la saisie :
--    si elle a changé entretemps (double clic, second onglet, autre utilisateur),
--    la réception est refusée (PURCHASE_ORDER_STALE) au lieu d'être comptée deux fois.
-- -----------------------------------------------------------------------------
create or replace function public.receive_purchase_order_items(
  p_purchase_order_id uuid,
  p_receipts jsonb
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
  v_sku_currency text;
  v_qty integer;
  v_expected integer;
  v_all_received boolean;
  v_any_received boolean;
  v_applied integer := 0;
begin
  -- Verrou de la commande : deux réceptions concurrentes sont sérialisées.
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
  if v_po.status = 'received' then
    raise exception 'PURCHASE_ORDER_ALREADY_RECEIVED' using errcode = '22023';
  end if;
  if v_po.status = 'draft' then
    raise exception 'PURCHASE_ORDER_NOT_SENT' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_receipts, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_RECEIPTS' using errcode = '22023';
  end if;

  for v_r in select * from jsonb_array_elements(coalesce(p_receipts, '[]'::jsonb)) loop
    v_qty := coalesce((v_r ->> 'quantity')::integer, 0);
    if v_qty <= 0 then continue; end if;
    if v_qty > 1000000 then
      raise exception 'MOVEMENT_QUANTITY_TOO_LARGE' using errcode = '22023';
    end if;

    select * into v_item from public.purchase_order_items
      where id = (v_r ->> 'item_id')::uuid and purchase_order_id = p_purchase_order_id
      for update;
    if v_item.id is null then
      raise exception 'PURCHASE_ORDER_ITEM_NOT_FOUND' using errcode = 'P0002';
    end if;

    v_expected := (v_r ->> 'expected_received')::integer;
    if v_expected is not null and v_expected <> v_item.quantity_received then
      raise exception 'PURCHASE_ORDER_STALE' using errcode = '40001',
        detail = 'Quantité déjà reçue : ' || v_item.quantity_received || ' (attendu : ' || v_expected || ')';
    end if;

    -- Sur-réception : bornée au reste à recevoir.
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
    v_applied := v_applied + 1;

    -- Règle du coût de référence : le coût unitaire reçu devient le coût du SKU
    -- uniquement s'il était inconnu ET si la ligne est dans la devise du SKU
    -- (un coût en USD n'est jamais recopié tel quel dans un SKU en EUR).
    if v_item.unit_cost is not null then
      select currency into v_sku_currency from public.skus where id = v_item.sku_id;
      if coalesce(v_item.currency, v_po.currency) = v_sku_currency then
        update public.skus set cost_price = round(v_item.unit_cost, 2)
          where id = v_item.sku_id and cost_price is null;
      end if;
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

revoke execute on function public.receive_purchase_order_items(uuid, jsonb) from public, anon;
