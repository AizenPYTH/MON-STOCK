-- =============================================================================
-- MON STOCK — migration 0009 : index sur les clés étrangères fréquemment jointes
-- (audit de performance : jointures listings ↔ connexions, offres ↔ sources/flux, etc.)
-- =============================================================================
create index if not exists channel_listings_connection_idx on public.channel_listings (connection_id) where connection_id is not null;
create index if not exists orders_connection_idx on public.orders (connection_id) where connection_id is not null;
create index if not exists order_items_listing_idx on public.order_items (channel_listing_id) where channel_listing_id is not null;
create index if not exists mapping_suggestions_sku_idx on public.mapping_suggestions (sku_id);
create index if not exists webhook_events_connection_idx on public.webhook_events (connection_id) where connection_id is not null;
create index if not exists supplier_feeds_supplier_idx on public.supplier_feeds (supplier_id);
create index if not exists supplier_connections_supplier_idx on public.supplier_connections (supplier_id);
create index if not exists sourcing_offers_source_idx on public.sourcing_offers (source_id);
create index if not exists sourcing_offers_feed_idx on public.sourcing_offers (feed_id) where feed_id is not null;
create index if not exists product_matches_sku_idx on public.product_matches (sku_id);
create index if not exists sourcing_alerts_sku_idx on public.sourcing_alerts (sku_id) where sku_id is not null;
create index if not exists sourcing_alert_events_offer_idx on public.sourcing_alert_events (offer_id);
create index if not exists purchase_order_items_offer_idx on public.purchase_order_items (offer_id) where offer_id is not null;
create index if not exists replenishment_recommendations_supplier_idx on public.replenishment_recommendations (supplier_id) where supplier_id is not null;
create index if not exists replenishment_recommendations_po_idx on public.replenishment_recommendations (purchase_order_id) where purchase_order_id is not null;
