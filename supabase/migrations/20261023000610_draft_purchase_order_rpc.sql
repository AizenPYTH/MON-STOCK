-- =============================================================================
-- MON STOCK — migration 20261023000610 : brouillon de commande fournisseur ATOMIQUE
-- (audit 2026-10-22 : M-16).
--
-- Avant : l'application mobile créait l'en-tête puis la ligne en deux requêtes, avec une
-- suppression compensatoire : une coupure réseau entre les deux laissait un brouillon vide.
-- Après : create_draft_purchase_order crée l'en-tête (statut draft) et sa ligne dans UNE
-- transaction. SECURITY INVOKER : la RLS, les triggers d'intégrité (organisation des références,
-- statut, total) et les droits du rôle (rédacteur) s'appliquent exactement comme avant.
-- Données existantes : aucune modifiée. Retour arrière :
-- supabase/ops/rollback/20261023000610_draft_purchase_order_rpc_down.sql
-- =============================================================================

create or replace function public.create_draft_purchase_order(
  p_organization_id uuid,
  p_supplier_id uuid,
  p_currency text,
  p_sku_id uuid,
  p_offer_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_po uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100000 then
    raise exception 'PURCHASE_ORDER_QUANTITY_INVALID' using errcode = '22023';
  end if;

  insert into public.purchase_orders (organization_id, supplier_id, currency, status, created_by, notes)
  values (p_organization_id, p_supplier_id, coalesce(nullif(btrim(p_currency), ''), 'EUR'), 'draft', auth.uid(), left(p_notes, 2000))
  returning id into v_po;

  insert into public.purchase_order_items (organization_id, purchase_order_id, sku_id, offer_id, quantity_ordered, unit_cost, currency)
  values (p_organization_id, v_po, p_sku_id, p_offer_id, p_quantity, p_unit_cost, coalesce(nullif(btrim(p_currency), ''), 'EUR'));

  return v_po;
end;
$$;

revoke all on function public.create_draft_purchase_order(uuid, uuid, text, uuid, uuid, integer, numeric, text) from public, anon;
grant execute on function public.create_draft_purchase_order(uuid, uuid, text, uuid, uuid, integer, numeric, text) to authenticated, service_role;

comment on function public.create_draft_purchase_order(uuid, uuid, text, uuid, uuid, integer, numeric, text) is
  'M-16 : brouillon de commande fournisseur (en-tête + ligne) en une transaction, sous les droits de l''appelant (RLS).';
