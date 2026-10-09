-- =============================================================================
-- MON STOCK — migration 20261008005100 : une commande fournisseur client naît en brouillon
-- -----------------------------------------------------------------------------
-- Le garde-fou PURCHASE_ORDER_EMPTY et la machine à états ne s'appliquaient qu'aux mises à
-- jour : un INSERT client avec status = 'sent' (et aucune ligne) était accepté, et l'insertion
-- de lignes dans une commande non brouillon est ensuite refusée — commande vide « envoyée ».
-- Les clients (authenticated) ne peuvent plus créer qu'un brouillon ; le reste passe par
-- l'UPDATE contrôlé. Le service_role et les fonctions internes ne sont pas concernés.
-- Corps repris de 20261008002000 (pg_get_functiondef) ; seule la branche INSERT change.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purchase_orders_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_items integer;
begin
  if tg_op = 'INSERT' then
    -- Une commande créée par un client naît TOUJOURS en brouillon : elle n'a encore aucune
    -- ligne, et le passage à « envoyée » (contrôle PURCHASE_ORDER_EMPTY, sent_at) se fait par
    -- une mise à jour soumise à la machine à états. Accepter 'sent' (ou plus) à l'insertion
    -- contournait ce contrôle. Le serveur (service_role : démo, imports) reste libre.
    -- Seulement si l'appelant peut écrire dans l'organisation cible : sinon (lecteur, autre
    -- organisation) on laisse la RLS refuser l'insertion avec son erreur de droits habituelle —
    -- un trigger BEFORE s'exécute avant le WITH CHECK et masquerait ce refus.
    if public.is_client_role() and public.can_write_org(new.organization_id) then
      if new.status <> 'draft' then
        raise exception 'PURCHASE_ORDER_INVALID_STATUS' using errcode = '22023',
          detail = 'Une commande fournisseur est créée en brouillon (statut reçu : ' || new.status || ').';
      end if;
      -- Horodatages d'étapes : jamais fournis par le client sur un brouillon.
      new.sent_at := null;
      new.received_at := null;
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
$function$;
