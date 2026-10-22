-- Retour arrière MANUEL de 20261023000320_org_fk_indexes.sql (D-16). Sans effet sur les données.
drop index if exists public.price_history_org_fk_idx;
drop index if exists public.supplier_price_history_org_fk_idx;
drop index if exists public.supplier_stock_history_org_fk_idx;
drop index if exists public.sync_errors_org_fk_idx;
drop index if exists public.purchase_order_items_org_fk_idx;
drop index if exists public.mapping_suggestions_org_fk_idx;
drop index if exists public.advisor_messages_org_fk_idx;
drop index if exists public.oauth_states_org_fk_idx;
drop index if exists public.sourcing_import_issues_org_fk_idx;
drop index if exists public.supplier_feed_secrets_org_fk_idx;
