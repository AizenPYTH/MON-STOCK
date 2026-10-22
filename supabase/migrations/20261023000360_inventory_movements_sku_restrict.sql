-- =============================================================================
-- MON STOCK — migration 20261023000360 : le journal de stock ne disparaît plus avec un SKU
-- (audit 2026-10-22 : D-21).
--
-- Avant : inventory_movements.sku_id → skus ON DELETE CASCADE : supprimer un SKU (ou son produit /
-- sa variante) en service_role effaçait silencieusement son journal « immuable ». Côté client,
-- la suppression était déjà bloquée par guard_catalog_delete (SKU_HAS_HISTORY).
-- Après : ON DELETE RESTRICT. Supprimer un SKU qui a des mouvements échoue (23503), quel que soit
-- le rôle ; il faut l'archiver (is_active = false), comme le demande déjà l'application.
--
-- Vérifié avant de choisir RESTRICT (code au 23/10/2026) :
--   - aucun code (web, mobile, Edge, scripts) ne supprime un SKU, une variante ou un produit en
--     service_role ; les suppressions client passent par guard_catalog_delete ;
--   - la suppression d'une ORGANISATION (auto-tests serveur e2e-check.ts, delete_organization)
--     reste possible : le journal est supprimé par la cascade organizations → inventory_movements
--     avant le contrôle RESTRICT des SKU (même mécanisme que purchase_order_items.sku_id, déjà en
--     RESTRICT) — couvert par tests/integration/security-db-remediation.test.ts.
--
-- Impact production : remplacement d'une contrainte (verrou ACCESS EXCLUSIVE bref sur
-- inventory_movements et skus, validation de 4 412 lignes au 22/10/2026). Aucune donnée modifiée.
-- Retour arrière : supabase/ops/rollback/20261023000360_inventory_movements_sku_restrict_down.sql
-- =============================================================================

do $fk$
declare
  v_action "char";
begin
  select c.confdeltype into v_action
  from pg_constraint c
  where c.conrelid = 'public.inventory_movements'::regclass
    and c.conname = 'inventory_movements_sku_id_fkey'
    and c.contype = 'f';

  if v_action is null then
    raise exception 'Contrôle préalable 20261023000360 : contrainte inventory_movements_sku_id_fkey absente.';
  end if;
  if v_action = 'r' then
    raise notice 'D-21 : inventory_movements_sku_id_fkey est déjà en RESTRICT, rien à faire.';
    return;
  end if;
  if v_action <> 'c' then
    raise exception 'Contrôle préalable 20261023000360 : action ON DELETE inattendue (%) sur inventory_movements_sku_id_fkey.', v_action;
  end if;

  alter table public.inventory_movements
    drop constraint inventory_movements_sku_id_fkey,
    add constraint inventory_movements_sku_id_fkey
      foreign key (sku_id) references public.skus (id) on delete restrict;
end
$fk$;
