-- Retour arrière MANUEL de 20261023000300_secdef_hardening.sql (Q-17, D-17).
-- À n'exécuter qu'après décision explicite. Effets :
--   - search_path des fonctions SECURITY DEFINER CONSERVÉ (voir plus bas) ;
--   - apply_inventory_movement : date libre de nouveau (corps de 20261008005000) ;
--   - adjust_reserved_quantity : corps d'origine, EXECUTE rendu à authenticated ;
--   - le journal inventory_reservation_events est SUPPRIMÉ (exportez-le avant si besoin :
--     copy (select * from public.inventory_reservation_events) to stdout with csv header).

-- search_path : NON rétabli volontairement. `public, pg_temp` est sans effet fonctionnel (toutes les
-- références sont qualifiées) et d'autres migrations (ex. 20261023000120 / 0130) posent la même
-- valeur sur certaines de ces fonctions : revenir à `public` les dégraderait aussi.

create or replace function public.adjust_reserved_quantity(p_organization_id uuid, p_sku_id uuid, p_delta integer)
returns public.inventory
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.inventory;
begin
  if not public.is_service_role() and not public.can_write_org(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.inventory
    set quantity_reserved = greatest(0, quantity_reserved + p_delta),
        updated_at = now()
    where sku_id = p_sku_id and organization_id = p_organization_id
  returning * into v_inv;

  if v_inv.sku_id is null then
    raise exception 'SKU_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_inv;
end;
$$;
revoke all on function public.adjust_reserved_quantity(uuid, uuid, integer) from public, anon;
grant execute on function public.adjust_reserved_quantity(uuid, uuid, integer) to authenticated, service_role;

drop table if exists public.inventory_reservation_events;

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
set search_path = public, pg_temp
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
  if p_type in ('sale', 'cancellation')
     and not public.is_service_role()
     and coalesce(current_setting('mon_stock.trusted_movement', true), '') <> 'on' then
    raise exception 'FORBIDDEN' using errcode = '42501',
      detail = 'MOVEMENT_TYPE_RESTRICTED: ' || p_type::text;
  end if;
  if p_quantity is null or p_quantity = 0 then
    raise exception 'MOVEMENT_QUANTITY_ZERO' using errcode = '22023';
  end if;
  if abs(p_quantity::bigint) > 1000000 then
    raise exception 'MOVEMENT_QUANTITY_TOO_LARGE' using errcode = '22023';
  end if;
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
$$;
revoke all on function public.apply_inventory_movement(uuid, uuid, public.movement_type, integer, text, uuid, text, text, timestamptz) from public, anon;
grant execute on function public.apply_inventory_movement(uuid, uuid, public.movement_type, integer, text, uuid, text, text, timestamptz) to authenticated, service_role;
