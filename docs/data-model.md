# Modèle de données — MON STOCK

Toutes les tables vivent dans le schéma `public` de PostgreSQL (Supabase) et portent `organization_id` : la **Row Level Security** garantit qu'un utilisateur ne voit que les organisations dont il est membre (`organization_members`). Les migrations sont dans `supabase/migrations/` et s'appliquent dans l'ordre.

## Correspondance avec le cahier des charges

| Concept demandé | Table(s) réelle(s) | Remarques |
| --- | --- | --- |
| users | `auth.users` (Supabase Auth) + `user_profiles` | profil public créé par trigger à l'inscription |
| organizations / organization_members | `organizations`, `organization_members`, `organization_invitations` | rôles `owner`, `admin`, `member`, `viewer` |
| products / product_variants / skus | `products` → `product_variants` → `skus` | création atomique via `create_sku()` |
| inventory / inventory_movements | `inventory` (1 ligne par SKU, `quantity_available` = en main − réservé), `inventory_movements` (journal immuable) | modification uniquement via `apply_inventory_movement()` |
| sales_channels / channel_connections | `sales_channels` (frais par canal), `channel_connections` (état OAuth sans secret), `channel_connection_secrets` (tokens chiffrés, service_role uniquement), `oauth_states` | |
| channel_listings + **ProductMapping** | `channel_listings` (`sku_id`, `mapping_status`, `mapping_source`, `mapped_at`, `external_listing_id`, `external_sku`, `external_product_id`, `last_synced_at`) + `mapping_suggestions` | le mapping EST la ligne d'annonce ; les suggestions exigent une validation |
| orders / order_items | `orders` (unique `(organization_id, provider, external_order_id)`), `order_items` (unique par ligne externe, `inventory_applied`) | ingestion idempotente via `ingest_external_order()` |
| suppliers | `suppliers` | score interne `NULL` tant que les données manquent |
| supplier_products / supplier_offers | `sourcing_offers` (table centrale) + vue `supplier_offers` (offres rattachées à un SKU) | un produit fournisseur n'existe pas sans offre : le catalogue fournisseur est l'ensemble de ses offres |
| supplier_sources / supplier_feeds / supplier_connections | `supplier_sources`, `supplier_feeds`, `supplier_connections` + `supplier_connection_secrets` | types de source : PUBLIC_WEB, API, CSV, XML, JSON, SUPPLIER_ACCOUNT, MANUAL, PARTNER_FEED |
| sourcing_products / product_matches | `sourcing_products` (identité normalisée, `normalized_key`), `product_matches` | |
| supplier_price_history / supplier_stock_history | idem, alimentées par trigger à chaque changement de prix / stock d'une offre | jamais écrasées |
| sourcing_searches / sourcing_alerts | `sourcing_searches`, `sourcing_alerts`, `sourcing_alert_events` | |
| purchase_orders / purchase_order_items | idem ; réception via `receive_purchase_order_items()` → mouvements `receipt` | |
| price_history | `price_history` (coût et prix de vente des SKU, trigger) | |
| sync_runs / sync_errors | idem (`started_at`, `finished_at`, `status`, `trigger`, `records_processed`, `error_count`, `stats`) | |
| replenishment_recommendations | idem (snapshot expliqué) | |
| alerts | `alerts` (événementielles : sync échouée, token expiré, annonces non associées…) ; les ruptures sont calculées à la volée | |
| webhook_events | idem (unique `(provider, event_id)`, `payload_hash`, `signature_valid`) | |
| fx_rates | taux BCE (table globale, lecture authentifiée) | |

## Vues analytiques (`security_invoker`)

- `v_sku_sales_stats` : unités vendues 7/30/90 j, fenêtres précédentes, CA 30 j, prix de vente moyen 30 j, première/dernière vente.
- `v_stock_overview` : une ligne par SKU avec produit, variante, stock, statistiques de vente, valeur de stock, marge unitaire, meilleur prix fournisseur, nombre d'annonces actives.
- `v_daily_sales` : CA / commandes / unités par jour **civil Europe/Paris** et par devise (le CA n'est jamais additionné entre devises ; les autres devises sont affichées à part, non converties).
- `sku_rotation(org, sku_ids?, days=30)` : rotation = unités vendues / stock moyen, stock moyen reconstitué depuis le journal des mouvements (« Pas assez de données » si fenêtre < 7 j ou stock moyen ≤ 0).
- `v_unmapped_listings` : annonces actives sans SKU (+ nombre de suggestions en attente).

## Fonctions transactionnelles (`security definer`, vérifient l'appartenance à l'organisation)

| Fonction | Rôle |
| --- | --- |
| `create_organization_with_owner(name, slug, is_demo)` | organisation + propriétaire + canal `manual` |
| `accept_invitation(token)` | rejoint une organisation (email vérifié) |
| `create_sku(org, variant, sku, product_id?, product?, initial_quantity)` | produit → variante → SKU + mouvement initial |
| `apply_inventory_movement(...)` | seule porte d'entrée pour modifier le stock (verrou ligne, `quantity_after`) |
| `adjust_reserved_quantity(...)` | réservations |
| `ingest_external_order(...)` | idempotence commande, déduction unique du stock, annulation → recrédit unique |
| `map_listing_to_sku(listing, sku, source)` | association annonce ↔ SKU ; rattache les lignes passées sans toucher au stock |
| `apply_pending_sales_for_sku(sku)` | applique explicitement les ventes passées non déduites |
| `receive_purchase_order_items(po, receipts)` | réception → mouvements `receipt` ; refusée si brouillon / annulée / déjà reçue ; sur-réception plafonnée ; `expected_received` (quantité déjà reçue vue par l'utilisateur) refuse un double envoi (`PURCHASE_ORDER_STALE`) ; coût de référence fixé seulement s'il était inconnu et dans la devise du SKU |

## Règles métier stock / achats (migration 20261008002000)

- Stock : disponible = en main − réservé. Seules les ventes réelles (`sale`) peuvent rendre le stock négatif ; ajustements, corrections, transferts sortants et réceptions sont refusés (`INSUFFICIENT_STOCK`). Passage sous zéro → alerte `negative_stock` ouverte, résolue automatiquement au retour ≥ 0. Mouvement ≤ 1 000 000 unités, stock ≤ 1 milliard.
- Suppression : l'archivage est le modèle. Un produit / une variante / un SKU ayant des mouvements, ventes ou lignes d'achat ne peut pas être supprimé par un client (`SKU_HAS_HISTORY`).
- Commandes fournisseurs : total toujours dérivé des lignes (NULL si coût inconnu ou ligne dans une autre devise) ; transitions client `draft→sent|cancelled`, `sent→draft|confirmed|cancelled`, `confirmed|partially_received→cancelled` ; `partially_received` / `received` uniquement via la réception ; lignes figées après confirmation ; seule une commande brouillon (ou annulée sans réception) est supprimable.

## Règles de sécurité

- RLS activée sur toutes les tables ; politiques générées par `__apply_org_policies` (migration 0007) puis restreintes : journal de mouvements immuable, stock non modifiable directement, commandes non supprimables, historiques immuables, runs de synchronisation écrits par le serveur.
- `channel_connection_secrets`, `supplier_connection_secrets`, `oauth_states` : RLS sans policy + `revoke` → accessibles uniquement avec la clé `service_role` côté serveur, et chiffrés applicativement (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`).
- Les fonctions sensibles sont retirées du rôle `anon`.
