-- =============================================================================
-- MON STOCK — commandes marketplace : écriture réservée au serveur
--
-- Les commandes et leurs lignes proviennent exclusivement du moteur de synchronisation
-- (client service_role). Un utilisateur authentifié pouvait jusqu'ici :
--   * appeler ingest_external_order avec une commande inventée (vente fictive → stock négatif) ;
--   * insérer orders / order_items via l'API puis appeler apply_pending_sales_for_sku.
-- L'application n'en a jamais besoin : on retire ces droits. La lecture reste ouverte aux membres
-- (RLS), et l'association annonce ↔ SKU continue de passer par map_listing_to_sku (security definer).
-- =============================================================================

revoke execute on function public.ingest_external_order(uuid, uuid, uuid, public.channel_provider, jsonb, jsonb) from authenticated;
grant execute on function public.ingest_external_order(uuid, uuid, uuid, public.channel_provider, jsonb, jsonb) to service_role;

drop policy if exists orders_insert on public.orders;
drop policy if exists orders_update on public.orders;
drop policy if exists order_items_insert on public.order_items;
drop policy if exists order_items_update on public.order_items;

revoke insert, update, delete on table public.orders from authenticated;
revoke insert, update, delete on table public.order_items from authenticated;
