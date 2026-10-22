-- =============================================================================
-- MON STOCK — migration 20261023000300 : durcissement des fonctions SECURITY DEFINER
-- (audit 2026-10-22 : Q-17, D-17).
--
-- Revue ligne à ligne des 12 fonctions SECURITY DEFINER exécutables par `authenticated`
-- (détail : docs/MIGRATIONS.md, § « Revue des fonctions SECURITY DEFINER »). Corrections :
--
--   1. search_path : `public` → `public, pg_temp` sur toutes les fonctions SECURITY DEFINER du
--      schéma public qui fixaient `public` seul. Sans `pg_temp` explicite, le schéma temporaire de
--      la session est parcouru EN PREMIER pour les tables ; toutes les références étant qualifiées
--      (`public.xxx`), il n'y a pas de faille exploitable aujourd'hui : défense en profondeur.
--      Aucun corps de fonction n'est modifié par ce point.
--   2. apply_inventory_movement (D-17) : pour un appel CLIENT (ni service_role, ni fonction interne
--      de confiance), p_occurred_at est borné : pas plus de 10 min dans le futur (dérive d'horloge
--      tolérée puis ramenée à now()), pas plus de 7 jours dans le passé (MOVEMENT_DATE_OUT_OF_RANGE).
--      Le web et l'application mobile envoient toujours « maintenant » : aucun changement visible.
--      Le serveur (service_role, ex. jeu de démonstration antidaté) et les ventes appliquées a
--      posteriori (drapeau transactionnel mon_stock.trusted_movement) ne sont pas bornés.
--      p_occurred_at NULL vaut désormais now() (avant : violation NOT NULL).
--   3. adjust_reserved_quantity (D-17) : aucune utilisation par le web, le mobile ou le serveur
--      (recherche dans src/, apps/mobile/src/, server/) → EXECUTE retiré à `authenticated`
--      (service_role conservé) ; delta NULL/0/hors bornes refusé (RESERVATION_DELTA_INVALID ;
--      avant : un delta NULL remettait la réserve à 0) ; verrou de la ligne de stock ; réserve
--      plafonnée comme le stock (1 000 000 000) ; chaque changement est JOURNALISÉ dans la
--      nouvelle table inventory_reservation_events (lecture : membres ; écriture : la fonction).
--
-- Signatures, types de retour et comportements attendus par le code applicatif inchangés.
-- Non destructive : aucune donnée existante n'est modifiée.
-- Retour arrière : supabase/ops/rollback/20261023000300_secdef_hardening_down.sql
-- =============================================================================

-- 0. Contrôles préalables -------------------------------------------------------------------
do $pre$
declare
  v_missing text[] := '{}';
  v_sig text;
begin
  foreach v_sig in array array[
    'public.apply_inventory_movement(uuid, uuid, public.movement_type, integer, text, uuid, text, text, timestamptz)',
    'public.adjust_reserved_quantity(uuid, uuid, integer)',
    'public.accept_invitation(text)',
    'public.apply_pending_sales_for_sku(uuid)',
    'public.can_write_org(uuid)',
    'public.create_organization_with_owner(text, text, boolean)',
    'public.create_sku(uuid, jsonb, jsonb, uuid, jsonb, integer)',
    'public.is_org_admin(uuid)',
    'public.is_org_member(uuid)',
    'public.map_listing_to_sku(uuid, uuid, text)',
    'public.org_role_of(uuid)',
    'public.receive_purchase_order_items(uuid, jsonb)'
  ] loop
    if to_regprocedure(v_sig) is null then
      v_missing := v_missing || v_sig;
    end if;
  end loop;
  if array_length(v_missing, 1) is not null then
    raise exception 'Contrôle préalable 20261023000300 : fonctions attendues absentes : %', array_to_string(v_missing, ', ');
  end if;
  if to_regclass('public.inventory') is null or to_regclass('public.skus') is null then
    raise exception 'Contrôle préalable 20261023000300 : tables inventory / skus absentes.';
  end if;
end
$pre$;

-- 1. search_path explicite (public, pg_temp) ---------------------------------------------------
-- Liste fermée (même liste dans le script de retour arrière). Une fonction absente est ignorée.
do $sp$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.accept_invitation(text)',
    'public.apply_pending_sales_for_sku(uuid)',
    'public.can_write_org(uuid)',
    'public.create_sku(uuid, jsonb, jsonb, uuid, jsonb, integer)',
    'public.is_org_admin(uuid)',
    'public.is_org_member(uuid)',
    'public.map_listing_to_sku(uuid, uuid, text)',
    'public.org_role_of(uuid)',
    'public.receive_purchase_order_items(uuid, jsonb)',
    'public.ingest_external_order(uuid, uuid, uuid, public.channel_provider, jsonb, jsonb)',
    'public.store_refreshed_access_token(uuid, text, timestamptz, text)',
    'public.clear_current_org_on_member_delete()',
    'public.enforce_profile_current_org()',
    'public.handle_auth_user_email_change()',
    'public.handle_new_auth_user()',
    'public.protect_last_owner()',
    'public.purchase_order_items_after_write()'
  ] loop
    if to_regprocedure(v_sig) is not null then
      execute format('alter function %s set search_path = public, pg_temp', to_regprocedure(v_sig));
    end if;
  end loop;
end
$sp$;

-- 2. Journal des changements de réserve ---------------------------------------------------------
create table if not exists public.inventory_reservation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sku_id uuid not null references public.skus (id) on delete cascade,
  delta integer not null,
  reserved_before integer not null,
  reserved_after integer not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_reservation_events_org_idx on public.inventory_reservation_events (organization_id, created_at desc);
create index if not exists inventory_reservation_events_sku_idx on public.inventory_reservation_events (sku_id, created_at desc);

alter table public.inventory_reservation_events enable row level security;
drop policy if exists inventory_reservation_events_select on public.inventory_reservation_events;
create policy inventory_reservation_events_select on public.inventory_reservation_events
  for select to authenticated using (public.is_org_member(organization_id));

revoke all on public.inventory_reservation_events from anon;
revoke insert, update, delete, truncate, references, trigger on public.inventory_reservation_events from authenticated;
grant select on public.inventory_reservation_events to authenticated;
grant all on public.inventory_reservation_events to service_role;

select public.install_same_org_guards('public.inventory_reservation_events'::regclass);

comment on table public.inventory_reservation_events is
  'Journal des changements de quantité réservée (adjust_reserved_quantity). Écrit uniquement par la fonction ; lecture : membres de l''organisation.';

-- 3. adjust_reserved_quantity : bornes, verrou, journal ; réservée au serveur ----------------------
create or replace function public.adjust_reserved_quantity(p_organization_id uuid, p_sku_id uuid, p_delta integer)
returns public.inventory
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.inventory;
  v_inv public.inventory;
  v_after bigint;
begin
  if not public.is_service_role() and not public.can_write_org(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 or abs(p_delta::bigint) > 1000000 then
    raise exception 'RESERVATION_DELTA_INVALID' using errcode = '22023';
  end if;

  select * into v_before
  from public.inventory
  where sku_id = p_sku_id and organization_id = p_organization_id
  for update;
  if v_before.sku_id is null then
    raise exception 'SKU_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Même règle qu'avant : la réserve ne descend jamais sous zéro (clamp).
  v_after := greatest(0, v_before.quantity_reserved::bigint + p_delta);
  if v_after > 1000000000 then
    raise exception 'STOCK_QUANTITY_TOO_LARGE' using errcode = '22023';
  end if;

  update public.inventory
    set quantity_reserved = v_after::integer,
        updated_at = now()
    where sku_id = p_sku_id and organization_id = p_organization_id
  returning * into v_inv;

  insert into public.inventory_reservation_events (organization_id, sku_id, delta, reserved_before, reserved_after, created_by)
  values (p_organization_id, p_sku_id, p_delta, v_before.quantity_reserved, v_inv.quantity_reserved, auth.uid());

  return v_inv;
end;
$$;

revoke all on function public.adjust_reserved_quantity(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.adjust_reserved_quantity(uuid, uuid, integer) to service_role;

-- 4. apply_inventory_movement : date bornée pour les appels clients --------------------------------
-- Corps identique à 20261008005000_trusted_sale_movements.sql, sauf v_occurred (bloc « D-17 »).
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
  v_trusted boolean;
  v_occurred timestamptz := coalesce(p_occurred_at, now());
begin
  if not public.is_service_role() and not public.can_write_org(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  v_trusted := public.is_service_role() or coalesce(current_setting('mon_stock.trusted_movement', true), '') = 'on';
  -- Ventes et annulations : réservées au serveur (service_role) et aux fonctions internes
  -- qui les créent à partir d'une commande (ingest_external_order, apply_pending_sales_for_sku).
  -- Elles sont exemptées de la règle anti-négatif : appelées directement via PostgREST par un
  -- simple rédacteur, elles permettraient de rendre n'importe quel stock négatif.
  -- Le drapeau est local à la transaction (set_config(..., true)) et n'est pas positionnable
  -- par un client : pg_catalog.set_config n'est pas exposé par PostgREST.
  if p_type in ('sale', 'cancellation') and not v_trusted then
    raise exception 'FORBIDDEN' using errcode = '42501',
      detail = 'MOVEMENT_TYPE_RESTRICTED: ' || p_type::text;
  end if;
  -- D-17 : un client ne peut ni antidater (au-delà de 7 jours) ni postdater un mouvement.
  -- Dérive d'horloge tolérée (10 min) puis ramenée à l'heure du serveur.
  if not v_trusted then
    if v_occurred > now() + interval '10 minutes' or v_occurred < now() - interval '7 days' then
      raise exception 'MOVEMENT_DATE_OUT_OF_RANGE' using errcode = '22023',
        detail = 'occurred_at=' || v_occurred::text;
    end if;
    v_occurred := least(v_occurred, now());
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
        last_movement_at = greatest(coalesce(last_movement_at, v_occurred), v_occurred),
        last_sale_at = case when p_type = 'sale'
                            then greatest(coalesce(last_sale_at, v_occurred), v_occurred)
                            else last_sale_at end,
        updated_at = now()
    where sku_id = p_sku_id;

  insert into public.inventory_movements (
    organization_id, sku_id, type, quantity, quantity_after, channel,
    reference_type, reference_id, note, created_by, occurred_at
  ) values (
    p_organization_id, p_sku_id, p_type, p_quantity, v_after, p_channel,
    p_reference_type, p_reference_id, p_note, auth.uid(), v_occurred
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
$$;

-- Privilèges inchangés (CREATE OR REPLACE conserve l'ACL) ; réaffirmés pour une base reconstruite.
revoke all on function public.apply_inventory_movement(uuid, uuid, public.movement_type, integer, text, uuid, text, text, timestamptz) from public, anon;
grant execute on function public.apply_inventory_movement(uuid, uuid, public.movement_type, integer, text, uuid, text, text, timestamptz) to authenticated, service_role;
