-- =============================================================================
-- MON STOCK — migration 20261023000320 : index des clés organization_id non indexées
-- (audit 2026-10-22 : D-16, conseiller Supabase « unindexed_foreign_keys »).
--
-- Sans index sur la colonne référençante, la suppression d'une organisation (ON DELETE CASCADE)
-- et les politiques RLS filtrant par organization_id parcourent la table entière. Concerne les
-- historiques (price_history, supplier_price_history, supplier_stock_history), sync_errors et
-- les autres tables signalées dont organization_id n'est couvert par aucun index en tête.
--
-- Impact production : tables de quelques milliers de lignes au plus (2 113 pour
-- supplier_price_history au 22/10/2026) → construction en une fraction de seconde. CREATE INDEX
-- (non CONCURRENTLY : une migration s'exécute dans une transaction) bloque brièvement les
-- écritures sur chaque table. Les 23 index « jamais utilisés » ne sont PAS supprimés (base jeune).
-- Additive et idempotente. Retour arrière : supabase/ops/rollback/20261023000320_org_fk_indexes_down.sql
-- =============================================================================

do $idx$
declare
  t text;
begin
  foreach t in array array[
    'price_history', 'supplier_price_history', 'supplier_stock_history', 'sync_errors',
    'purchase_order_items', 'mapping_suggestions', 'advisor_messages', 'oauth_states',
    'sourcing_import_issues', 'supplier_feed_secrets'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'D-16 : table public.% absente, ignorée', t;
      continue;
    end if;
    -- Contrôle préalable : la colonne existe.
    if not exists (select 1 from pg_attribute where attrelid = ('public.' || t)::regclass and attname = 'organization_id' and not attisdropped) then
      raise exception 'Contrôle préalable 20261023000320 : public.%.organization_id absente.', t;
    end if;
    execute format('create index if not exists %I on public.%I (organization_id)', t || '_org_fk_idx', t);
  end loop;
end
$idx$;
