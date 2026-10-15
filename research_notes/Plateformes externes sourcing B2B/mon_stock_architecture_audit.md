# MON STOCK — current sourcing architecture and integration points for an external multi-supplier B2B platform (code audit, read-only)

Method: read-only reading of the repository at /home/user/MON-STOCK (no file modified, no migration run, no network or DB call). Every "Source" below is a repo-relative file path with line numbers (L…), as of 2026-10-15.

## 1. Source library: entries, adapters, activation, attestation, probe/library checks — how a new source type/adapter is registered

### Takeaway
There are two registries. (a) The **adapter registry** (`SOURCE_ADAPTERS`) is the only way to add a new kind of connector: one folder per adapter plus one line in `registry.ts`. (b) The **source library** (`SOURCE_LIBRARY`) is a static list of pre-vetted public shops. Its `adapter` field is a closed union of 4 public adapters. A library entry can only be activated once its live check is "ok" and the user has given an attestation. A multi-supplier B2B platform with an API key does not fit the library as it stands: the library only handles public or eBay sources, and activation hard-codes `source_type` to `API` or `PUBLIC_WEB`.

### Cited Findings
- The adapter contract: one adapter = an independent folder `src/integrations/sourcing/<key>/` with `crawler.ts`, `parser.ts`, `mapper.ts` and `index.ts`. `index.ts` exports a `SourceAdapter` that is registered in `../registry.ts`. Absolute rules: official API/feeds or a seller-connected account (credentials encrypted server-side), no circumvention, missing field → null, provenance kept — [src/integrations/sourcing/core.ts L1-L18](src/integrations/sourcing/core.ts)
- Registration is one array: `SOURCE_ADAPTERS = [jsonLdPublicAdapter, shopifyStorefrontAdapter, wooCommerceStoreAdapter, googleMerchantFeedAdapter, bigbuyAdapter, ingramMicroAdapter, ebayBrowseAdapter, sitemapJsonLdAdapter]`. "An adapter absent from this array is never offered in the UI". All adapters are `verification: "fixtures"` only — [src/integrations/sourcing/registry.ts L12-L20](src/integrations/sourcing/registry.ts)
- Helper filters: `listPublicAdapters()` (access === "public") and `listAccountAdapters()` (access === "account"). `listAdapterHtmlParsers()` exposes HTML parsers to the generic crawler — [src/integrations/sourcing/registry.ts L30-L47](src/integrations/sourcing/registry.ts)
- The supplier-connector registry is **derived automatically** from account adapters: `SUPPLIER_CONNECTORS = listAccountAdapters().map(toDescriptor)`. So a new `access: "account"` adapter automatically becomes a connector — [src/integrations/suppliers/core.ts L110-L118](src/integrations/suppliers/core.ts)
- `LibrarySource.adapter` is typed `"shopify-storefront" | "woocommerce-store" | "sitemap-jsonld" | "ebay-browse"`. `access` is `"public_json" | "public_html" | "official_api"`. Optional `blocked` = automated access forbidden by the supplier's terms (never checked, never activatable) — [src/services/sourcing/source-library.ts L33-L57](src/services/sourcing/source-library.ts)
- The library holds about 30 entries (eBay FR plus Shopify/WooCommerce/sitemap shops). Utopya is marked `blocked`: its terms (art. 14) forbid automated access unless there is a written API contract — [src/services/sourcing/source-library.ts L61-L528](src/services/sourcing/source-library.ts)
- `checkLibrarySource`: robots.txt check (if the adapter has `urlsForQuery`), then a real `adapter.search(probeQuery)`. Status `ok | robots_disallowed | no_products | http_error | unreachable | not_configured`. eBay without server keys gives `not_configured` — [src/services/sourcing/source-library.ts L550-L578](src/services/sourcing/source-library.ts)
- `checkLibrarySourceDetect` falls back to the other public adapters (shopify → woocommerce → sitemap) when the declared one fails. It is skipped for `official_api` — [src/services/sourcing/source-library.ts L585-L596](src/services/sourcing/source-library.ts)
- `runLibraryChecks` runs sequentially (one host at a time), skips `blocked`, and upserts the evidence into `sourcing_library_checks` (status, http_status, product_count, sample…) — [src/services/sourcing/source-library.ts L599-L628](src/services/sourcing/source-library.ts). Called by the cron route `POST /cron/library-checks` — [server/edge/api.ts L282-L283](server/edge/api.ts)
- Activation requires the last check to be "ok". It then creates a `suppliers` row and a `supplier_sources` row with `source_type: s.access === "official_api" ? "API" : "PUBLIC_WEB"`, `automated_access_confirmed: true`, the attestation text in `access_conditions`, `sync_frequency: "manual"` and `config: { adapter, library_key }`. One supplier is created per library entry — [src/services/sourcing/source-library.ts L689-L754](src/services/sourcing/source-library.ts)
- The attestation text records the terms URL, the user's email or id, and an ISO timestamp — [src/services/sourcing/source-library.ts L689-L694](src/services/sourcing/source-library.ts)

### Inferences
- Adding ONE generic "external platform" adapter = a new folder plus one line in `registry.ts`. With `access: "account"`, it automatically appears as a supplier connector (credential fields, test, catalog sync) with no other registry change.
- The source library is the wrong integration point for a credentialed B2B platform. It would need the `adapter` union widened, and `activateLibrarySourceFor` would need to handle `SUPPLIER_ACCOUNT` plus a `supplier_connections` row. The existing connector path already does both.

### Gaps
- I did not read the library check table migration in full (supabase/migrations/20261009000300_sourcing_library_checks.sql, 35 lines) beyond its `create table` line.

## 2. Connectors and import methods: adapter interface (search vs catalog crawl) and server-side credential storage

### Takeaway
`SourceAdapter` has a mandatory `search()`, an optional cursor-paginated `fetchCatalog()` that returns `AdapterCatalogPage { offers, nextCursor, incomplete? }`, and `testConnection()`. Credentials are AES-256-GCM encrypted (key `TOKEN_ENCRYPTION_KEY`) and stored in two service-role-only tables:
- `supplier_connection_secrets`: account adapters, via `supplier_connections`.
- `supplier_feed_secrets`: remote feed URLs, with header or Basic auth.

There are therefore already TWO generic ingestion paths: "remote feed" (URL + mapping + optional auth header) and "supplier connection" (account adapter + API key).

### Cited Findings
- `RetrievalMethod = public_html | public_json | public_feed | official_api | supplier_account | manual`. `AccessLevel = public | account`. `AdapterCapabilities { search, catalog, stockQuantity }` — [src/integrations/sourcing/core.ts L23-L57](src/integrations/sourcing/core.ts)
- `AdapterSourceConfig { baseUrl, settings, defaultCurrency, defaultTaxType, defaultCountry }`. `AdapterRunContext` carries `credentials?: Record<string,string>` ("decrypted credentials, account adapters only"), fetchImpl, minDelayMs, timeoutMs, disallowedUrls, resolver, now — [src/integrations/sourcing/core.ts L59-L86](src/integrations/sourcing/core.ts)
- `AdapterCatalogPage { offers, method, requests, nextCursor, incomplete? }`: `incomplete` means that even at the end of the catalog the collection is NOT complete, so no offer is declared absent — [src/integrations/sourcing/core.ts L106-L116](src/integrations/sourcing/core.ts)
- `SourceAdapter` fields: key, label, description, method, access, capabilities, credentialFields, configFields, `urlsForQuery?`, `urlsForCatalog?`, `search()` (mandatory), `fetchCatalog?(config, cursor, ctx)`, `testConnection()`, `htmlParser?`, `searchBudgetMs?`, `verification` — [src/integrations/sourcing/core.ts L118-L146](src/integrations/sourcing/core.ts)
- Adapter metadata observed:
  - bigbuy: `official_api`, `account`, catalog + stock, credential `api_key` — [src/integrations/sourcing/bigbuy/index.ts L133-L140](src/integrations/sourcing/bigbuy/index.ts)
  - ingram-micro: `official_api`, `account`, catalog + stock — [src/integrations/sourcing/ingram-micro/index.ts L103-L110](src/integrations/sourcing/ingram-micro/index.ts)
  - ebay-browse: `official_api` but `access: "public"` (server app keys), `catalog: false` — [src/integrations/sourcing/ebay-browse/index.ts L149-L156](src/integrations/sourcing/ebay-browse/index.ts)
  - google-merchant-feed: `public_feed`, `public`, catalog paged by 1000 from a cached feed (10 min TTL, 50 MB max) — [src/integrations/sourcing/google-merchant-feed/index.ts L48-L56](src/integrations/sourcing/google-merchant-feed/index.ts), [src/integrations/sourcing/google-merchant-feed/crawler.ts L9-L14](src/integrations/sourcing/google-merchant-feed/crawler.ts)
  - shopify-storefront, woocommerce-store, sitemap-jsonld, jsonld-public: all `public` with catalog: true — [src/integrations/sourcing/*/index.ts](src/integrations/sourcing/)
- BigBuy reads `ctx.credentials.api_key`. With no text-search API, its "search" filters a local index built from the first catalog pages (10 min cache, flagged truncated) — [src/integrations/sourcing/bigbuy/index.ts L1-L13, L47-L55](src/integrations/sourcing/bigbuy/index.ts)
- Connections service:
  - `createSupplierConnection` inserts `supplier_connections` with the admin client ("RLS forbids user insert") and status pending, then `storeConnectionCredentials` → `supplier_connection_secrets.credentials_enc = encryptSecret(JSON.stringify(credentials))`.
  - `loadConnectionCredentials` decrypts server-side.

  — [src/services/sourcing/supplier-connectors.ts L35-L61](src/services/sourcing/supplier-connectors.ts)
- `ensureConnectionSource` lazily creates a `supplier_sources` row with `source_type: "SUPPLIER_ACCOUNT"`, `config: { adapter: descriptor.key, ...connConfig }`, `sync_frequency: "manual"` — [src/services/sourcing/supplier-connectors.ts L79-L104](src/services/sourcing/supplier-connectors.ts)
- `syncSupplierConnection`: decrypt credentials → `startSyncRun(sourceKind "supplier_connection")` → loop `fetchCatalog` pages (max 20, hard cap 200) → `storeOffer` for each offer with `withProvenance` → `expireUnseenOffers` if `stored > 0 && !truncated` → `finishSyncRun`, then update the connection and source status. Host politeness is 500 ms through `HostScheduler` — [src/services/sourcing/supplier-connectors.ts L23-L24, L106-L109, L141-L219](src/services/sourcing/supplier-connectors.ts)
- Connections are created only through the Next.js server action `createSupplierConnection(...)` in [src/features/suppliers/actions.ts L427](src/features/suppliers/actions.ts). Test and sync actions are at L444-L466 of the same file. I found no supplier-connection creation route in the Edge Function `api` (only eBay channel connections) — [server/edge/api.ts L1-L48, L140-L186](server/edge/api.ts)
- `SupplierAPIConnector` / `ConnectorDescriptor` wrap an adapter plus a credentials session: `connect`, `testConnection`, `fetchCatalog`, `fetchOffers`, `getAccountInfo` (always null) — [src/integrations/suppliers/core.ts L31-L94](src/integrations/suppliers/core.ts)
- `PARTNER_FEED` is only a documented placeholder: interface `PartnerFeedTransport { kind: "sftp"|"edi"|"https"; fetchLatest() }`, `PARTNER_FEED_STATUS.implemented = false`. It is meant to reuse the CSV/XML/JSON parsers, with transport credentials in `supplier_connection_secrets` — [src/integrations/suppliers/partner-feed.ts L1-L18](src/integrations/suppliers/partner-feed.ts)
- Remote feed ("flux distant autorisé"):
  - Input: HTTPS public URL only (private/internal hosts refused), format csv/xml/json, `auth` = `none | header{name,value} | basic{username,password}`, plus mapping, defaults and `rootPath`.
  - `mode: partial|snapshot` (default snapshot), `frequency: manual|hourly|every_6_hours|daily` (default daily — no weekly).
  - `attest: true` is mandatory. The mapping must include a reference (or EAN), a title and a price.

  — [src/services/sourcing/remote-feeds.ts L17-L63](src/services/sourcing/remote-feeds.ts)
- `createRemoteFeed` creates (or reuses by name) the supplier. It then creates `supplier_sources` with `source_type: CSV|XML|JSON`, `config: { kind: "remote_feed", mode }` and the attestation text, and a `supplier_feeds` row (url, format, field_mapping, options {mode, root_path}, sync_frequency). The auth is encrypted into `supplier_feed_secrets` — [src/services/sourcing/remote-feeds.ts L124-L178](src/services/sourcing/remote-feeds.ts)
- Feed auth: `feedAuthSchema` with forbidden headers (host, cookie, content-length, transfer-encoding, connection, user-agent). `loadFeedAuthHeaders` decrypts `supplier_feed_secrets.credentials_enc` server-side only — [src/services/sourcing/feed-secrets.ts L1-L37](src/services/sourcing/feed-secrets.ts)
- These are exposed to mobile as `POST /api/sourcing/feeds/preview` and `POST /api/sourcing/feeds` — [server/edge/api.ts L25-L26](server/edge/api.ts). The mobile client calls them — [apps/mobile/src/data/sourcing-b2b.ts L58-L66](apps/mobile/src/data/sourcing-b2b.ts)
- Catalogue file import (CSV/XLSX/XML/JSON, max 15 MB):
  - Creates or reuses the supplier and a `supplier_sources` row with `config.kind = "catalog_file_import"`, plus a URL-less `supplier_feeds` row.
  - SHA-256 duplicate-file guard via `sourcing_import_jobs`.
  - Then `ingestFeed(... content, mode default "partial")`, and the mapping is remembered per (supplier, header signature).

  — [src/services/sourcing/catalog-import.ts L30-L70, L285-L398](src/services/sourcing/catalog-import.ts)
- Feed parsers:
  - CSV with an auto-detected delimiter.
  - XML through fast-xml-parser with namespace prefixes removed, and JSON with `root_path` or the first array auto-detected. Objects are flattened to dotted paths.
  - Max 50 000 rows parsed. The mapping value is a column/path or `{const}`.

  — [src/services/sourcing/feed-parsers.ts L12-L36, L94-L140](src/services/sourcing/feed-parsers.ts)
- Every adapter HTTP call goes through `fetchText`. It applies `assertPublicHttpUrl` + `assertResolvesToPublicAddress` (SSRF guard, also re-checked on redirect), with a default max size of 20 MB — [src/services/sourcing/http.ts L33, L77-L101, L171-L194](src/services/sourcing/http.ts), [src/integrations/sourcing/shared.ts L45-L89](src/integrations/sourcing/shared.ts)

### Inferences
- "Search" vs "catalog crawl": live search calls `search()` per user query, while scheduled sync calls `fetchCatalog()` pages. A platform that offers only bulk export fits `fetchCatalog`. Its `search()` can follow the BigBuy and Google Merchant pattern: filter a cached index.
- A REST API that returns ONE JSON document (or one CSV/XML export URL) authenticated by an API key in a header can already be ingested by the remote-feed path with **zero code**: `auth.kind = "header"` (e.g. `X-Api-Key`) plus `rootPath` plus a column mapping. Limits: no pagination (one URL), at most 20 MB per response, 5 000 rows processed per run, no OAuth token exchange, and no query-param secret. Putting a secret in the URL would also store it in clear text in `supplier_feeds.url`.
- A paginated or OAuth API needs a new `access: "account"` adapter (BigBuy and Ingram Micro are the templates), which reuses `syncSupplierConnection`.

### Gaps
- I did not read ingram-micro's OAuth token logic in detail (client_credentials POST at L67) nor live-search's account branch beyond L198-L263.
- I did not verify whether a mobile UI exists for creating supplier connections. The Edge `api` route list shows none.

## 3. Database tables (sourcing_offers, supplier_sources, suppliers, supplier_connections, supplier_price_history, sync_runs, import jobs/issues, normalized products)

### Takeaway
`sourcing_offers` is the central table. It is unique on `(organization_id, source_id, external_offer_id)` and has exactly ONE NOT NULL `supplier_id` per row. Price and stock history is written by SQL triggers. Sources, feeds, connections, secrets, import jobs and the running-lock all hang off `supplier_sources`.

### Cited Findings
- Enum `source_type`: `PUBLIC_WEB, API, CSV, XML, JSON, SUPPLIER_ACCOUNT, MANUAL, PARTNER_FEED`. Other enums: `sync_frequency` (manual, hourly, every_6_hours, daily), `tax_type` (ht, ttc, unknown), `stock_status` (in_stock, low, out_of_stock, unknown), `offer_status` (active, expired, suspicious, rejected) — [supabase/migrations/20261007000400_suppliers_sourcing.sql L8-L25](supabase/migrations/20261007000400_suppliers_sourcing.sql)
- `suppliers`: org-scoped, with name, country, website, currency (default EUR), internal_score (NULL if insufficient data), is_archived — [same file L30-L53](supabase/migrations/20261007000400_suppliers_sourcing.sql)
- `supplier_sources`: organization_id, supplier_id (NOT NULL), name, source_type, base_url, country, default_currency, default_tax_type, access_conditions, automated_access_confirmed, robots_*, crawl_delay_seconds, sync_frequency, status, config jsonb, last_sync_at/last_successful_sync_at/last_error. There is also a unique MANUAL source per supplier — [same file L69-L99](supabase/migrations/20261007000400_suppliers_sourcing.sql)
- `supplier_feeds` (url NULL = manual file, format, field_mapping, options, sync_frequency, last_record_count) — [same file L106-L125](supabase/migrations/20261007000400_suppliers_sourcing.sql). `supplier_connections` (connector_key, status, external_account_id, config "never a secret here") — [L135-L149](supabase/migrations/20261007000400_suppliers_sourcing.sql). `supplier_connection_secrets` (connection_id PK, credentials_enc, key_version) — [L158-L163](supabase/migrations/20261007000400_suppliers_sourcing.sql)
- `sourcing_products` (normalized identity), unique `(organization_id, normalized_key)` — [same file L168-L188](supabase/migrations/20261007000400_suppliers_sourcing.sql)
- `sourcing_offers` columns:
  - Keys: organization_id, supplier_id NOT NULL, source_id NOT NULL, feed_id, source_type, external_product_id, external_offer_id NOT NULL.
  - Product: title_original, normalized_product_id, sku_id, brand/model/storage/color/condition/grade/ean/mpn.
  - Price: original_price NOT NULL / original_currency NOT NULL, normalized_price/normalized_currency/fx_rate/fx_rate_date, tax_type, vat_rate.
  - Stock and delivery: moq, minimum_order_value, available_quantity, stock_status, shipping_cost/shipping_currency, delivery_min/max_days, country, source_url.
  - Quality and lifecycle: confidence jsonb, anomalies[], status, first_seen_at/last_seen_at/last_price_at/last_stock_at/expired_at, raw jsonb.
  - **UNIQUE (organization_id, source_id, external_offer_id)**.

  — [same file L202-L255](supabase/migrations/20261007000400_suppliers_sourcing.sql)
- Indexes on supplier_id, normalized_product_id, sku_id, (org, ean), (org, upper(mpn)), title trigram, (org, brand, model), (org, normalized_price), (org, last_seen_at desc) — [same file L257-L266](supabase/migrations/20261007000400_suppliers_sourcing.sql)
- `supplier_price_history` and `supplier_stock_history` are filled by the trigger `record_offer_history`. On INSERT it writes price history always, and stock history only if quantity is not null or status is not unknown. On UPDATE it writes only when price/currency/tax_type (resp. quantity/stock_status) change. `offer_before_update` bumps last_price_at/last_stock_at — [same file L308-L390](supabase/migrations/20261007000400_suppliers_sourcing.sql)
- B2B migration (applied):
  - `sourcing_import_jobs` (origin file|remote_feed, file_sha256, mode partial|snapshot, counters, status…) and `sourcing_import_issues`.
  - `sourcing_mapping_profiles`, unique (org, supplier, header_signature).
  - Extra offer columns: order_multiple, vat_regime, ship_from_country, warranty_months, available_from, supplier_updated_at, last_import_job_id.
  - Source columns: next_run_at, consecutive_failures, last_failure_at.
  - `supplier_feed_secrets` (feed_id PK, organization_id, credentials_enc).

  — [supabase/migrations/20261013000100_sourcing_b2b.sql L15-L113](supabase/migrations/20261013000100_sourcing_b2b.sql)
- `sync_runs` has a unique partial index `sync_runs_one_running_per_source_uidx on (source_ref) where status = 'running'` (the per-source lock) — [supabase/migrations/20261007000300_channels_orders.sql L251-L254](supabase/migrations/20261007000300_channels_orders.sql)
- `src/db/database.types.ts` ALREADY contains the pending weekly columns: supplier_sources `schedule_weekday, schedule_hour_utc, collect_cursor, collection_started_at, last_full_collection_at, last_collection_stats, directory_key`, offers `missing_since, missed_collections`, and the RPC `sourcing_close_full_collection` — [src/db/database.types.ts L941, L1183, L1499](src/db/database.types.ts)

### Inferences
- The types are ahead of the applied schema: TypeScript compiles, but weekly-collection queries would fail at runtime on a DB without the pending migration. Any new code must not depend on those columns unless that migration is applied.
- The unique key is per **source**. If one platform equals one source, `external_offer_id` must be unique across all of the platform's sellers (e.g. the platform's listing/offer id, or `sellerId:sku`). Otherwise two sellers' offers for the same SKU would overwrite each other through the upsert.

### Gaps
- I did not read `product_matches` (L395-L413) in depth, nor the `fx_rates` table definition (L472).

## 4. Weekly collection (weekly-collection.ts, weekly-schedule.ts, crawler-manager.ts, sync-runs.ts): locks, complete vs partial, expiry after 2 complete collections; pending migration

### Takeaway
The weekly sliced collection is restricted to `source_type = 'PUBLIC_WEB'` sources whose adapter is `access: "public"` with `fetchCatalog`. Account connectors and remote feeds are NOT covered. They use the separate scheduler `runScheduledSources` (hourly/6h/daily, weekly allowed by `setSourceSchedule`), whose expiry is **immediate** (`expireUnseenOffers` after one complete run), not "2 complete collections". The 2-collection rule exists only in the pending (unapplied) SQL function `sourcing_close_full_collection`.

### Cited Findings
- Header comment of weekly-collection:
  - The cron runs every 15 min; at most 5 due sources per pass, of which at most 2 are sitemap sources.
  - Lock via the unique "one running run per source" index; cursor saved after each page.
  - End of catalog: "complete" only with no error, which calls `sourcing_close_full_collection` ("an offer only expires after 2 complete collections without it"); otherwise "incomplete" and nothing is declared absent.
  - 3 consecutive failed pages → "failed". "Stock is never inferred from an absence".

  — [src/services/sourcing/weekly-collection.ts L18-L35](src/services/sourcing/weekly-collection.ts)
- Budget constants: 100 s per pass, 5 sources, 2 sitemaps, page margin 25 s, abort after 3 failures, store concurrency 4 — [src/services/sourcing/weekly-collection.ts L38-L47](src/services/sourcing/weekly-collection.ts)
- Selection filter: `.eq("source_type", "PUBLIC_WEB").eq("automated_access_confirmed", true).neq("status","paused")` (+ `sync_frequency = 'weekly'` unless forced). `catalogAdapter()` requires `adapter.access === "public" && capabilities.catalog && fetchCatalog` — [src/services/sourcing/weekly-collection.ts L107-L122](src/services/sourcing/weekly-collection.ts)
- One source per host per pass. Sitemap sources are capped — [src/services/sourcing/weekly-collection.ts L133-L146](src/services/sourcing/weekly-collection.ts)
- Lock: `startSyncRun` throws on 23505 → "locked". A start is claimed conditionally with `.is("collection_started_at", null)` — [src/services/sourcing/weekly-collection.ts L168-L193](src/services/sourcing/weekly-collection.ts), [src/services/sourcing/sync-runs.ts L43-L54](src/services/sourcing/sync-runs.ts)
- Stale "running" runs older than 5 min are marked failed before a new start — [src/services/sourcing/sync-runs.ts L28-L41](src/services/sourcing/sync-runs.ts)
- Weekly storage context hard-codes `sourceType: "PUBLIC_WEB"` and `supplierId: source.supplier_id` — [src/services/sourcing/weekly-collection.ts L198-L208](src/services/sourcing/weekly-collection.ts)
- Robots check before collecting. Delay = max(MIN_DELAY_SECONDS, robots crawl-delay, source.crawl_delay_seconds) — [src/services/sourcing/weekly-collection.ts L212-L220](src/services/sourcing/weekly-collection.ts)
- Within a page, offers are de-duplicated by `externalOfferId` and resumed at `pageOffset` if the budget runs out — [src/services/sourcing/weekly-collection.ts L237-L275](src/services/sourcing/weekly-collection.ts)
- End-of-catalog verdict: `incomplete` if `c.incomplete`, any requestErrors, consecutiveFailures > 0, stored = 0, or volume < 50 % of the previous complete collection's `seen`. Otherwise `complete` — [src/domain/sourcing/weekly-schedule.ts L129-L143](src/domain/sourcing/weekly-schedule.ts)
- Schedule: ISO weekday plus UTC hour, a stable default slot (days 1–7, 1–5 h UTC) hashed from the source id, at most 3 attempts per slot with 1 h between retries — [src/domain/sourcing/weekly-schedule.ts L1-L16, L81-L127](src/domain/sourcing/weekly-schedule.ts)
- The pending migration header reads "PROJET À VALIDER : NON APPLIQUÉ". It:
  - adds the enum value `weekly`, the schedule/cursor/stats columns, offer columns `missing_since` and `missed_collections`, and the index;
  - defines `sourcing_close_full_collection(p_source_id, p_started_at)`: reset offers seen during the collection, +1 `missed_collections` for unseen ones, `status='expired'` when `missed_collections >= 2` ("stock_status unchanged: never a false out-of-stock"), and sets `last_full_collection_at`;
  - executes for service_role only.

  — [supabase/pending/20261014000100_sourcing_weekly_collection.sql L1-L107](supabase/pending/20261014000100_sourcing_weekly_collection.sql)
- The pending cron schedule `*/15 * * * *` calls `call_monstock_cron('sourcing-weekly')` and must run AFTER the migration and route deploy — [supabase/pending/schedule-weekly-collection.sql L1-L5](supabase/pending/schedule-weekly-collection.sql). The route `POST /cron/sourcing-weekly` already exists in the Edge API — [server/edge/api.ts L303](server/edge/api.ts)
- The generic scheduler `runScheduledSources` handles all due non-manual sources. Kinds: `public_web` (crawl), `remote_feed` (`ingestFeed` with the mode read from feed options), `connection` (`syncSupplierConnection`). Skipped: file_import, manual, live_search, and `public_web` with `weekly` (left to weekly-collection) — [src/services/sourcing/source-sync.ts L88-L113, L147-L173](src/services/sourcing/source-sync.ts)
- `kindOf()`: `config.kind === "catalog_file_import"` → file_import; `PUBLIC_WEB` → public_web or live_search; a source with a `supplier_connections` row → connection; with a URL feed → remote_feed — [src/services/sourcing/source-sync.ts L52-L68](src/services/sourcing/source-sync.ts)
- `sourceScheduleSchema.frequency` accepts `"weekly"` for any kind except file/manual — [src/services/sourcing/source-sync.ts L175-L194](src/services/sourcing/source-sync.ts)
- `FREQUENCY_MS.weekly = 7 days` already exists in code — [src/services/sourcing/sync-runs.ts L88-L101](src/services/sourcing/sync-runs.ts)
- The cron entry point `runSourcingSync` runs ECB FX refresh → `runScheduledSources` → alerts — [src/services/sourcing/sync.ts L18-L49](src/services/sourcing/sync.ts). It is exposed at `POST /cron/sourcing` — [server/edge/api.ts L281](server/edge/api.ts)
- The one-shot crawler (`runSourceCrawl`) is PUBLIC_WEB only and expires unseen offers "UNIQUELY after a complete pass with no error" via `expireUnseenOffers` (immediate) — [src/services/sourcing/crawler/crawler-manager.ts L44, L107-L109](src/services/sourcing/crawler/crawler-manager.ts)
- `expireUnseenOffers` sets `status='expired'` for active/suspicious offers of the source with `last_seen_at < since` (never deletes) — [src/services/sourcing/offer-storage.ts L522-L537](src/services/sourcing/offer-storage.ts)
- Feed snapshot expiry: `if (mode === "snapshot" && stored > 0 && !truncated) expireUnseenOffers` — [src/services/sourcing/feed-ingestion.ts L250-L252](src/services/sourcing/feed-ingestion.ts). Connection expiry: `if (stored > 0 && !truncated)` — [src/services/sourcing/supplier-connectors.ts L201](src/services/sourcing/supplier-connectors.ts)
- `runDueFeeds` calls `ingestFeed` WITHOUT `mode`, so it would default to snapshot even for "partial" feeds — [src/services/sourcing/feed-ingestion.ts L278-L285](src/services/sourcing/feed-ingestion.ts). I found no caller of `runDueFeeds` outside its own file; the active path is `runScheduledSources`, which passes the mode.

### Inferences
- **Two different expiry rules coexist**: immediate expiry (one complete run) for remote feeds, account connectors and the one-shot crawler, and the 2-collection rule (pending) for weekly PUBLIC_WEB. A new external-platform connector that goes through `syncSupplierConnection` or `ingestFeed` inherits the immediate rule. Under that rule one bad but "successful" export can expire a whole platform. The guard is the feed path's import-quality quarantine (§5); the connection path has none.
- To give a platform connector the weekly 2-collection rule and slice/resume behavior, `weekly-collection.ts` would need its filter widened (`source_type IN (PUBLIC_WEB, SUPPLIER_ACCOUNT, …)`, account adapters allowed, credentials loaded, robots check skipped for official APIs), and the pending migration would need to be applied first.
- The connection sync's `syncSupplierConnection` runs at most 20 pages in a single invocation, with no cursor persistence. A large platform catalog would hit "CATALOG_TRUNCATED" every time and never expire anything, and each run would re-read the same first pages. The weekly cursor mechanism fixes that, but only for PUBLIC_WEB.

### Gaps
- I did not read `src/services/sourcing/source-health.ts` (recordSourceOutcome / backoff) or `src/domain/sourcing/schedule.ts` (isScheduleDue, nextRunAt) beyond the signatures at L32-L70.
- I did not verify whether the rollback file `supabase/ops/rollback/20261014000100_sourcing_weekly_collection_down.sql` exists.

## 5. Normalisation (brand/model/storage/condition/grade), currency conversion (ECB, fx_rate), tax_type HT/TTC

### Takeaway
`storeOffer` always runs `normalizeProduct(title, hints)`. Explicit hints (brand, model, storage, color, grade, condition, EAN, MPN) passed by the parser override inference. Prices keep the original amount and currency. The conversion uses daily ECB cross rates and stays null if a rate is missing. `tax_type` comes from the offer, else from the source default, else "unknown"; it is never guessed.

### Cited Findings
- The normalizer is deterministic: accents/case neutralized, storage unified (128 Go → 128GB), FR/EN colours, grades, condition (new / refurbished / used). Unknown → null, and inferences are listed in `inferred` — [src/domain/sourcing/normalizer.ts L1-L9](src/domain/sourcing/normalizer.ts)
- `ProductHints {brand, model, storage, color, grade, condition, ean, mpn}`. `NormalizedProduct` includes `normalizedKey`, `confidence`, `eanValid` — [src/domain/sourcing/normalizer.ts L14-L48](src/domain/sourcing/normalizer.ts)
- `normalizedKey = brand|model|storage|color|condition|grade` (with `-` for unknown). `isIdentifyingProduct` = brand && model && storage — [src/domain/sourcing/normalizer.ts L185-L191](src/domain/sourcing/normalizer.ts)
- `storeOffer` calls `normalizeProduct(raw.title, {brand, model, storage, color, grade, condition, ean, mpn})` — [src/services/sourcing/offer-storage.ts L384](src/services/sourcing/offer-storage.ts)
- Currency = `raw.currency ?? ctx.defaultCurrency`. Invalid offer or missing currency → rejected (existing offer marked `suspicious`) — [src/services/sourcing/offer-storage.ts L382, L402-L415](src/services/sourcing/offer-storage.ts)
- FX: `getFxRate(currency, org currency)`. `normalized_price = effectivePrice * rate` rounded to 4 decimals. `fx_rate`/`fx_rate_date` are stored, and they are null if the rate is unavailable (`fxUnavailable`) — [src/services/sourcing/offer-storage.ts L417-L419, L457-L462](src/services/sourcing/offer-storage.ts)
- `FxRateService`: ECB daily XML, stored in the global `fx_rates` table (service_role), 1 h memory cache, EUR cross rates; "no rate is ever invented" — [src/services/sourcing/fx-rates.ts L6-L72](src/services/sourcing/fx-rates.ts)
- Tax: `taxType = raw.taxType if not unknown, else ctx.defaultTaxType ?? "unknown"`. A confidence `tax` score is stored (1 if explicit, 0.7 if source default, 0 if unknown) — [src/services/sourcing/offer-storage.ts L425, L434](src/services/sourcing/offer-storage.ts)
- The feed mapper `toTaxType` recognizes ht/excl/net/ex-vat → "ht" and ttc/incl/gross/inc-vat → "ttc", else "unknown". The source default applies only when no tax column is mapped — [src/services/sourcing/feed-parsers.ts L176-L182, L313-L315](src/services/sourcing/feed-parsers.ts) (relative lines 37-42 and 174-175 in the excerpt read from L140 onward)
- Validation (`validateOffer`) uses the previous price and the 30-day price history from `supplier_price_history` (same currency) to flag anomalies — [src/services/sourcing/offer-storage.ts L394-L405](src/services/sourcing/offer-storage.ts)
- Feed import quality gate (before any write): duplicates in the file are skipped, and `assessImportQuality` can **quarantine** the whole import (nothing written, previous catalogue kept) based on valid/invalid ratios, previous record count and price ratios — [src/services/sourcing/feed-ingestion.ts L180-L205](src/services/sourcing/feed-ingestion.ts)

### Inferences
- A platform connector only needs to fill `RawOffer` fields well (taxType, currency, condition, grade, ean, mpn). Normalization, FX and tax handling come for free from `storeOffer`.
- The quarantine gate exists only in `ingestFeed`. A connector going through `syncSupplierConnection` bypasses it.

### Gaps
- I did not read `src/domain/sourcing/validation.ts` (thresholds) or `src/domain/sourcing/import-quality.ts` (quarantine thresholds) in detail.

## 6. Price and stock history; storeOffer; how unknown stock is kept unknown

### Takeaway
`storeOffer` (an upsert on the unique key) is the single write path used by every ingestion route (feeds, file import, connections, crawler, weekly, live search). History is written by triggers only when values change. Unknown stock stays "unknown" (no quantity → no inferred status), and absence never sets out_of_stock.

### Cited Findings
- `StorageContext { supabase, organizationId, organizationCurrency, supplierId, sourceId, sourceType, feedId?, defaultCurrency?, defaultTaxType?, defaultCountry?, suggestMatches?, createdBy?, now?, importJobId? }`. The supplier is fixed per context, not per offer — [src/services/sourcing/offer-storage.ts L304-L321](src/services/sourcing/offer-storage.ts)
- `stockStatusOf`: an explicit raw status wins; quantity null → `raw.stockStatus ?? "unknown"`; otherwise >0 → in_stock and 0 → out_of_stock — [src/services/sourcing/offer-storage.ts L337-L341](src/services/sourcing/offer-storage.ts)
- `last_stock_at` is set on creation only if quantity is not null or status is not unknown. Stock confidence = 0.9 (quantity), 0.6 (status only), 0 (unknown) — [src/services/sourcing/offer-storage.ts L430, L489-L493](src/services/sourcing/offer-storage.ts)
- Upsert `onConflict: "organization_id,source_id,external_offer_id"`, with `expired_at: null` and `last_seen_at: now` (so a reappearing offer is revived as active) — [src/services/sourcing/offer-storage.ts L478-L479, L495](src/services/sourcing/offer-storage.ts)
- The `raw` column receives `raw.raw`. Adapters wrap it with `withProvenance` → `{ provenance: {adapter, method, retrieved_at, request_url, source_url}, payload (≤ 8000 chars JSON) }` — [src/services/sourcing/adapter-runtime.ts L301-L334](src/services/sourcing/adapter-runtime.ts). Feed rows store the original row as `raw: row` — [src/services/sourcing/feed-parsers.ts ~L356](src/services/sourcing/feed-parsers.ts)
- Feed mapping of stock: a mapped stock_status column → `toStockStatus`, else derived from quantity, else "unknown" — [src/services/sourcing/feed-parsers.ts ~L328](src/services/sourcing/feed-parsers.ts) (relative line 189 of the excerpt read from L140 onward)
- Triggers write history only on change; INSERT stock history only when stock is known — [supabase/migrations/20261007000400_suppliers_sourcing.sql L351-L390](supabase/migrations/20261007000400_suppliers_sourcing.sql)
- The pending close function explicitly leaves `stock_status` unchanged on expiry — [supabase/pending/20261014000100_sourcing_weekly_collection.sql L48-L53](supabase/pending/20261014000100_sourcing_weekly_collection.sql)

### Inferences
- Nuance: on UPDATE the upsert writes `stock_status` from the current payload. If a platform stops sending stock for an offer that previously had it, the stored status is overwritten to "unknown". This is honest, but it creates a stock-history row. A platform connector should map stock consistently.

### Gaps
- None material for this question.

## 7. Deal analysis (deal-analysis.ts, simple-search.ts computeDeals / isMarketplaceSource) and radar

### Takeaway
Deal analysis compares each offer to **equivalent** offers in two pools. Marketplace listings need at least 3 comparables. Other suppliers' wholesale prices need at least 2, **and an offer's own supplier_id is excluded** from that pool. Marketplace status comes from `source.config.adapter === "ebay-browse" || source.config.kind === "marketplace"`. The radar classifies price origin by `source_type`.

### Cited Findings
- `DealOfferInput` includes `supplierId`, price in org currency, taxType, shippingCost, moq, supplierCountry, stockStatus, availableQuantity, lastSeenAt, `marketplace`, `publicPrice` — [src/domain/sourcing/deal-analysis.ts L266-L293](src/domain/sourcing/deal-analysis.ts)
- Market pools: `marketPrices` = equivalents with `marketplace`; `supplierPrices` = equivalents with `!c.marketplace && c.supplierId !== offer.supplierId` (outliers trimmed, median) — [src/domain/sourcing/deal-analysis.ts L387-L403](src/domain/sourcing/deal-analysis.ts). Thresholds `MIN_MARKETPLACE_COMPARABLES = 3`, `MIN_SUPPLIER_COMPARABLES = 2` — [L354-L355](src/domain/sourcing/deal-analysis.ts)
- Uncertainties are added for: unknown HT/TTC, unknown stock, out of stock, converted currency, a stale price, and a marketplace listing ("warranty and invoice to check") — [src/domain/sourcing/deal-analysis.ts L370-L381](src/domain/sourcing/deal-analysis.ts)
- "very_good" requires margin ≥ 20 %, discount ≥ 20 %, a reliable offer (in stock, not stale/unknown freshness) and a known tax type. The score rewards freshness, known tax and known stock — [src/domain/sourcing/deal-analysis.ts L441-L458](src/domain/sourcing/deal-analysis.ts)
- `isMarketplaceSource(config)` returns `c.adapter === "ebay-browse" || c.kind === "marketplace"` — [src/services/sourcing/simple-search.ts L130-L134](src/services/sourcing/simple-search.ts)
- `computeDeals` buckets offers by `comparableBucket(signature)`. It builds `DealComparable` with `supplierId: r.supplier_id` and `marketplace: isMarketplaceSource(r.source?.config)`; `publicPrice` = `source_type === "PUBLIC_WEB"` — [src/services/sourcing/simple-search.ts L162-L215](src/services/sourcing/simple-search.ts)
- Simple supplier search groups results by `supplier_id` (`groupBySupplier`) and sorts by converted price — [src/services/sourcing/simple-search.ts L60-L125](src/services/sourcing/simple-search.ts)
- Search-result dedupe: "one single offer per (supplier, normalized product), keeping the cheapest" — [src/domain/sourcing/dedupe.ts L1-L20](src/domain/sourcing/dedupe.ts)
- Radar `priceOriginOf`: `API` → "verified_live", `PUBLIC_WEB` → "observed_public", `MANUAL` → "manual_entry", `catalog_file_import` → "catalog_import", `CSV/XML/JSON/PARTNER_FEED/SUPPLIER_ACCOUNT` → "supplier_communicated" — [src/services/radar/radar.ts L19-L27](src/services/radar/radar.ts)
- Radar freshness: `FRESH_DAYS = 2`, `STALE_DAYS = 7` — [src/domain/sourcing/radar.ts L138-L150](src/domain/sourcing/radar.ts)
- The radar uses `supplier.internal_score`, `source.consecutive_failures` and received purchase orders per `supplier_id` as reliability signals — [src/services/radar/radar.ts L107-L151, L208-L230](src/services/radar/radar.ts)

### Inferences
- If one platform = one `suppliers` row, the "other suppliers" pool **ignores all other sellers on the same platform** (same supplier_id). Platform-internal competition then never forms a market price. Supplier-level dedupe also collapses different sellers' identical products into one result, and supplier-level reliability scores mix sellers.
- With `STALE_DAYS = 7`, an offer refreshed only by a weekly job will drift to "stale" just before each refresh (a day 7+ age). That lowers deal levels ("very_good" requires a non-stale offer).
- `config.kind = "marketplace"` is an existing switch. Setting it on a platform source makes its offers count as resale-market comparables (≥3 needed) instead of supplier prices. That suits a C2C or reseller marketplace, not a B2B wholesale platform.

### Gaps
- I did not read `comparableBucket` / `isEquivalent` (L193-L254, L478-L483) in detail, nor `src/domain/sourcing/ranking.ts`.

## 8. Reference matching: offer-linking (SKU matching), normalized_product_id, EAN/MPN

### Takeaway
Every stored offer gets a `normalized_product_id` (`sourcing_products` row keyed by `normalizedKey`). It is auto-linked to an internal SKU on an exact EAN or MPN match (`autoConfirmExact: true`). Otherwise the match is a suggestion that the user confirms.

### Cited Findings
- `getOrCreateSourcingProduct` selects or inserts `sourcing_products` by `(organization_id, normalized_key)` and is race-safe (re-reads after a failed insert) — [src/services/sourcing/offer-storage.ts L348-L376](src/services/sourcing/offer-storage.ts)
- `sku_id` is inherited from the normalized product only if `isIdentifyingProduct(normalized)` (brand+model+storage). A previous `sku_id` is kept — [src/services/sourcing/offer-storage.ts L447-L448](src/services/sourcing/offer-storage.ts)
- After the upsert, `suggestMatchesForOffer(..., { autoConfirmExact: true })` runs if there is no `sku_id` — [src/services/sourcing/offer-storage.ts L501-L509](src/services/sourcing/offer-storage.ts)
- Candidates are loaded by EAN (variant.ean or sku.barcode), MPN (ilike), supplierSku (`external_product_id`), brand and text — [src/services/sourcing/matching-service.ts L45-L61, L102-L106](src/services/sourcing/matching-service.ts). Auto-confirm happens only if `m.autoConfirmable && !offer.sku_id` — [L116](src/services/sourcing/matching-service.ts)
- `external_product_id = raw.externalProductId ?? raw.supplierSku` — [src/services/sourcing/offer-storage.ts L443](src/services/sourcing/offer-storage.ts)
- Manual confirm/reject goes through `product_matches` (RLS, writer role) and closes other suggestions — [src/services/sourcing/offer-linking.ts L8-L69](src/services/sourcing/offer-linking.ts)

### Inferences
- EAN/GTIN and MPN are the strongest join keys. A platform export carrying GTIN/MPN gets automatic SKU linking and cross-supplier comparability; a title-only export relies on the normalizer.

### Gaps
- I did not read `src/domain/sourcing/matching.ts` (`matchOfferToSkus`, autoConfirmable rules).

## 9. Security: RLS / organization isolation, server-only secrets, Edge Function `api`, cron secret, env, crypto, no keys in the mobile app

### Takeaway
All sourcing tables are org-scoped under RLS. Writes to sync logs, connections, import jobs and secrets are server-only (service role). Secret tables have RLS with no policy and privileges revoked. Secrets are AES-256-GCM with `TOKEN_ENCRYPTION_KEY` (Edge env or Supabase Vault). Cron routes need `Bearer CRON_SECRET` (constant-time compare). The mobile app only holds public Supabase URL/anon/publishable keys.

### Cited Findings
- Generic org policies are applied to suppliers, supplier_sources, supplier_feeds, supplier_connections, sourcing_products, sourcing_offers, price/stock history, product_matches, sync_runs, sync_errors… — [supabase/migrations/20261007000700_rls.sql L29-L37](supabase/migrations/20261007000700_rls.sql)
- Insert/update/delete policies are dropped on sync_runs/sync_errors ("written by the server") and on supplier_connections insert ("server-side creation only") — [supabase/migrations/20261007000700_rls.sql L68-L76](supabase/migrations/20261007000700_rls.sql)
- `supplier_connection_secrets`: RLS enabled, no policy, `revoke all from anon, authenticated` — [supabase/migrations/20261007000700_rls.sql L130-L134](supabase/migrations/20261007000700_rls.sql), [supabase/migrations/20261008001000_security_privileges.sql L50](supabase/migrations/20261008001000_security_privileges.sql)
- `supplier_feed_secrets`: RLS, `revoke all`. Import jobs/issues/mapping profiles are select-only for org members, with writes revoked. Same-org guards are installed on these tables and on `sourcing_offers` — [supabase/migrations/20261013000100_sourcing_b2b.sql L115-L142](supabase/migrations/20261013000100_sourcing_b2b.sql)
- Crypto: AES-256-GCM, format `v1:iv:ciphertext:tag`, key from `TOKEN_ENCRYPTION_KEY` (32-byte base64 or SHA-256-derived) — [src/lib/crypto.ts L1-L35](src/lib/crypto.ts)
- Server env: `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY` (min 32), `CRON_SECRET` (min 16, optional), `SOURCING_USER_AGENT`, eBay keys — [src/lib/env.ts L15-L26](src/lib/env.ts)
- Edge secrets come from function env or the Supabase Vault (`server_runtime_secrets()`, service_role only). `TOKEN_ENCRYPTION_KEY` and `CRON_SECRET` are generated inside the DB — [supabase/migrations/20261009000400_server_runtime_secrets.sql L1-L25](supabase/migrations/20261009000400_server_runtime_secrets.sql)
- `authorizeCron`: 503 if CRON_SECRET is missing or shorter than 16; SHA-256 + `timingSafeEqual` compare — [src/lib/cron-auth.ts L1-L27](src/lib/cron-auth.ts)
- Edge `api` routes: `/cron/*` (sourcing, sourcing-weekly, library-checks, collect-source, …) and the user routes `/sourcing/feeds`, `/sourcing/import`, `/sourcing/sources/sync|schedule` — [server/edge/api.ts L11-L48, L277-L339](server/edge/api.ts)
- `syncSourceNow` reads the source under the user session ("RLS guarantees membership") and enforces a 2-min cooldown and the lock — [src/services/sourcing/source-sync.ts L122-L144](src/services/sourcing/source-sync.ts)
- Mobile: only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` / `PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL` and app flags are used. `apps/mobile/src/lib/supabase.ts` states "no service_role key exists on mobile" — [apps/mobile/src/lib/supabase.ts L12](apps/mobile/src/lib/supabase.ts); grep of `EXPO_PUBLIC_*` across apps/mobile.
- SSRF guard on every outbound fetch (public HTTPS, resolved address must be public, re-checked on redirects) — [src/services/sourcing/http.ts L77-L101, L171-L194](src/services/sourcing/http.ts)

### Inferences
- A platform API key should be stored exactly like BigBuy's (`supplier_connection_secrets`) or like a feed header (`supplier_feed_secrets`). Both are already server-only, so no new secret table is needed. Mobile must only send the key once to an Edge route that encrypts it. That route exists for feeds (`POST /sourcing/feeds`) but not for supplier connections (Next.js server action only).

### Gaps
- I did not read the `same_org_references` guard function body (L79-L144) or the full `api.ts` request/role checks for `/sourcing/feeds`.

## 10. Minimal set of changes for ONE generic "external platform" connector; which existing importer could ingest with zero/minimal code

### Takeaway
**Zero code today:** a platform that exposes a single CSV/XML/JSON export URL (optionally behind an API-key header or Basic auth) can be plugged in through the existing **remote feed**. The feed handles mapping UI, attestation, encrypted auth, scheduled ingestion, quarantine, history and deal analysis. A **Google Merchant-format** feed also works through the `google-merchant-feed` adapter, but only publicly (no auth), so the remote feed is the generic choice.

**Minimal code** (paginated REST API or OAuth): one new `access: "account"` adapter, registered in `registry.ts`, reusing `syncSupplierConnection`. Plus an Edge route to create the connection from mobile, and a decision on multi-seller → supplier mapping.

### Cited Findings
- The remote feed supports csv/xml/json, an HTTPS URL, `auth: none|header|basic`, `rootPath`, a mapping onto `RAW_OFFER_FIELDS`, defaults (currency/taxType/country), `mode` and frequency. It is exposed on Edge — [src/services/sourcing/remote-feeds.ts L42-L63](src/services/sourcing/remote-feeds.ts), [server/edge/api.ts L25-L26](server/edge/api.ts)
- Mappable fields: external_offer_id, title, price, currency, tax_type, moq, minimum_order_value, available_quantity, stock_status, shipping_cost, delivery_days/min/max, country, url, ean, mpn, brand, model, storage, color, grade, condition, supplier_sku, order_multiple, vat_regime, ship_from_country, warranty_months, available_from, supplier_updated_at. **There is no seller/supplier-name field** — [src/domain/sourcing/types.ts L54-L85](src/domain/sourcing/types.ts)
- Ingestion caps: 5 000 rows per run (`MAX_ROWS_PER_RUN`, truncated → no expiry), 50 000 rows parsed, 20 MB per fetch — [src/services/sourcing/feed-ingestion.ts L15, L175-L179](src/services/sourcing/feed-ingestion.ts), [src/services/sourcing/feed-parsers.ts L36](src/services/sourcing/feed-parsers.ts), [src/services/sourcing/http.ts L33](src/services/sourcing/http.ts)
- The remote-feed frequency enum lacks "weekly" at creation time (manual/hourly/every_6_hours/daily), but `setSourceSchedule` accepts weekly afterwards — [src/services/sourcing/remote-feeds.ts L58](src/services/sourcing/remote-feeds.ts), [src/services/sourcing/source-sync.ts L175-L178](src/services/sourcing/source-sync.ts)
- `PARTNER_FEED` source_type exists in the enum, schemas, labels and radar, but no code creates or ingests it (`implemented: false`) — [src/integrations/suppliers/partner-feed.ts L15-L18](src/integrations/suppliers/partner-feed.ts), [src/features/sourcing/schemas.ts L9](src/features/sourcing/schemas.ts), [src/services/radar/radar.ts L25](src/services/radar/radar.ts)
- Templates for an account API adapter: BigBuy (API key, page cursor `String(page+1)`, stock merge) and Ingram Micro (OAuth client credentials) — [src/integrations/sourcing/bigbuy/index.ts L133-L172](src/integrations/sourcing/bigbuy/index.ts), [src/integrations/sourcing/ingram-micro/index.ts L60-L157](src/integrations/sourcing/ingram-micro/index.ts)
- `syncSupplierConnection` already handles credentials, pages, storeOffer, expiry, sync_runs and status — [src/services/sourcing/supplier-connectors.ts L141-L219](src/services/sourcing/supplier-connectors.ts). It is scheduled by `runScheduledSources` when a connection row exists — [src/services/sourcing/source-sync.ts L105-L110](src/services/sourcing/source-sync.ts)
- Live search includes `SUPPLIER_ACCOUNT` sources and loads connection credentials for account adapters — [src/services/sourcing/live-search.ts L31, L198-L263, L541](src/services/sourcing/live-search.ts)

### Inferences
- **Option A — zero code (feed export):**
  - Use `POST /sourcing/feeds` with the platform's export URL, an `X-Api-Key`-style header, the mapping (offer id = platform offer id or `seller:sku`), `mode: "snapshot"` and daily frequency.
  - What it reuses: quarantine, history, FX, normalization, matching, deal analysis, and the radar label "supplier_communicated".
  - Limits:
    - one supplier for the whole platform;
    - immediate expiry rule;
    - 5 000 rows per run, and the expiry is skipped when the feed is truncated;
    - no pagination or OAuth.
- **Option B — minimal code (API connector):**
  1. Add `src/integrations/sourcing/<platform>/` with `access: "account"`, `credentialFields` (api_key…), `configFields` (api_base, filters), `fetchCatalog` (page cursor), `search` (API search or cached index), `testConnection`, then add it to `SOURCE_ADAPTERS`. The connector, credential storage, scheduled sync and live search follow automatically.
  2. Add an Edge route such as `POST /sourcing/connections` that wraps `createSupplierConnection` + `testSupplierConnection`, so mobile can connect without the web app.
  3. Optionally set `config.kind` to tag the source.
- **Option C — make it weekly with the 2-collection rule:** apply the pending migration, then widen `weekly-collection.ts`. Concretely: allow `SUPPLIER_ACCOUNT` sources and account adapters, load credentials, skip robots for `official_api`, and replace the hard-coded `sourceType: "PUBLIC_WEB"` (L204) with the row's `source_type`. This is also the fix for the 20-page truncation in `syncSupplierConnection`.
- A generic "JSON API with pagination via a configurable next-link / page param" could be written as ONE reusable account adapter that reuses `parseFeedContent` / `mapRow` (the same mapping as feeds) inside `fetchCatalog`. That one adapter would cover many platforms. This is an inference; no such adapter exists yet.

### Gaps
- I did not verify the Next.js web app's deploy status. Task notes in the session say "routes deferred: web not deployed", which means the connection server actions may be unusable in production. This is not verified in code.

## 11. Risks of breaking existing behaviour (expiry rules, dedupe, supplier_id per offer for multi-seller platforms)

### Takeaway
The main structural risk is that `supplier_id` is fixed per source/`StorageContext`, while the deal analysis, dedupe, grouping and radar all reason per `supplier_id`. Mapping a multi-seller platform to one supplier distorts comparisons. Mapping each seller to its own supplier requires either one source per seller or a code change so `storeOffer` can resolve a supplier per offer. Expiry and freshness rules also differ by path.

### Cited Findings
- `supplier_id` comes from `ctx.supplierId` for every offer of a run (connections: `connection.supplier_id`; feeds: `feed.supplier_id`; weekly: `source.supplier_id`) — [src/services/sourcing/offer-storage.ts L439](src/services/sourcing/offer-storage.ts), [src/services/sourcing/supplier-connectors.ts L158](src/services/sourcing/supplier-connectors.ts), [src/services/sourcing/feed-ingestion.ts L159-L173](src/services/sourcing/feed-ingestion.ts), [src/services/sourcing/weekly-collection.ts L198-L208](src/services/sourcing/weekly-collection.ts)
- `supplier_sources.supplier_id` and `sourcing_offers.supplier_id` are both NOT NULL foreign keys — [supabase/migrations/20261007000400_suppliers_sourcing.sql L72, L205](supabase/migrations/20261007000400_suppliers_sourcing.sql)
- The same-supplier exclusion in the deal market pool — [src/domain/sourcing/deal-analysis.ts L390](src/domain/sourcing/deal-analysis.ts). Dedupe per (supplier, product) — [src/domain/sourcing/dedupe.ts L1-L5](src/domain/sourcing/dedupe.ts). Grouping by supplier — [src/services/sourcing/simple-search.ts L85-L105](src/services/sourcing/simple-search.ts)
- Expiry paths:
  - immediate on feed snapshot — [src/services/sourcing/feed-ingestion.ts L252](src/services/sourcing/feed-ingestion.ts);
  - immediate on connection sync — [src/services/sourcing/supplier-connectors.ts L201](src/services/sourcing/supplier-connectors.ts);
  - immediate on a full crawl — [src/services/sourcing/crawler/crawler-manager.ts L109](src/services/sourcing/crawler/crawler-manager.ts);
  - after 2 complete collections for weekly, pending — [supabase/pending/20261014000100_sourcing_weekly_collection.sql L87-L91](supabase/pending/20261014000100_sourcing_weekly_collection.sql).
- `expireUnseenOffers` is scoped by `source_id`, so offers of other sources are never touched — [src/services/sourcing/offer-storage.ts L523-L531](src/services/sourcing/offer-storage.ts)
- The per-source lock uses `sync_runs.source_ref`. Connections use `connection.id` as `sourceRef`, while weekly and crawl use `source.id` — [src/services/sourcing/supplier-connectors.ts L154](src/services/sourcing/supplier-connectors.ts), [src/services/sourcing/weekly-collection.ts L170](src/services/sourcing/weekly-collection.ts)
- `kindOf()` routes a source with a `supplier_connections` row to "connection" before checking for URL feeds. A `PUBLIC_WEB` source is always crawl or live search — [src/services/sourcing/source-sync.ts L52-L60](src/services/sourcing/source-sync.ts)
- Within-file duplicates are detected by `rowIdentity` and skipped — [src/services/sourcing/feed-ingestion.ts L182-L190](src/services/sourcing/feed-ingestion.ts). Within-page duplicates are dropped by `externalOfferId` in weekly — [src/services/sourcing/weekly-collection.ts L238](src/services/sourcing/weekly-collection.ts). The connection sync does NOT de-duplicate within a page — [src/services/sourcing/supplier-connectors.ts L184-L197](src/services/sourcing/supplier-connectors.ts)

### Inferences
- **Multi-seller mapping options:**
  - (1) **One supplier per platform** (zero schema change). Simple, but platform-internal sellers are never compared against each other. Seller identity survives only in `raw`/title. Search dedupe collapses identical products from different sellers. Supplier scores and PO history are blurred.
  - (2) **One supplier per seller**, resolved per offer. This needs a new `RawOffer` field (e.g. `sellerName`/`sellerExternalId`) and a `StorageContext` hook (e.g. `resolveSupplierId(offer)` that upserts `suppliers` by a platform-scoped key). `source_id` and the unique key stay per platform.
    - Wrinkle: the same-org guard and per-source expiry keep working.
    - Wrinkle: `supplier_sources.supplier_id` would still point to one "platform" supplier, so source-level UI and health would show the platform, not the seller.
  - (3) **One source per seller**. No code change, but N sources, N sync runs and N API calls against one host. This conflicts with host politeness and with the per-source lock (one run per source, not per host).
- If an external platform is added through `syncSupplierConnection` and its catalog exceeds 20 pages, every run is truncated, so offers never expire. If it returns a transient empty-but-200 page, `stored > 0` still gates expiry, but a partially empty export could expire most offers immediately. The feed path's quarantine mitigates this; the connection path has no quarantine.
- Using the same `external_offer_id` for two sellers of the same SKU within one source would make them overwrite each other through the upsert. The id must include the seller.
- Tagging the platform source `config.kind = "marketplace"` changes its offers from "supplier prices" to "marketplace comparables" for every other offer of the org. This side effect affects existing deal levels.
- Radar `STALE_DAYS = 7` versus a weekly refresh cadence may downgrade weekly-refreshed offers just before each refresh.

### Gaps
- I did not check whether any UI or logic keys off `supplier_sources.supplier_id` to show offers (it likely uses `sourcing_offers.supplier_id`); this was not verified.
- I did not check tests (`tests/unit/weekly-collection.test.ts`, `sourcing-remote-feeds.test.ts`, `sourcing-feeds.test.ts`) for regressions a change would trigger; I only noted their names.
