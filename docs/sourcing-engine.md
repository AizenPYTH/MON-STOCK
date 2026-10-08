# Moteur de sourcing (SOURCING ENGINE)

Moteur de recherche B2B interne à MON STOCK : « Google / Kayak du sourcing ». Il compare les
offres fournisseurs **réellement collectées** (flux, pages publiques autorisées, saisie manuelle)
et n'invente jamais une donnée : inconnu → « Non communiqué », ancien → « Prix potentiellement
obsolète », aucune source → « Source non connectée », aucun résultat → « Aucune offre trouvée ».

## Architecture

```
src/domain/sourcing/            logique pure, testée (vitest), sans réseau ni base
  dictionaries.ts               marques, motifs de modèles, couleurs, grades, états, ISO 4217 (extensibles)
  normalizer.ts                 ProductNormalizer : texte → {brand, model, storage, color, condition, grade, ean, mpn}, clé normalisée
                                (iPad : taille / génération / année distinctes — « iPad Air 2022 » ≠ « ipad air 20 » ; MacBook : puce M1–M4 ;
                                Galaxy S22+ / Tab S8+ : « plus » conservé)
  search-pipeline.ts            filtre de pertinence + associations confirmées → dédup → rankOpportunities → économies (pur)
  price-history.ts              historique de prix par offre / fournisseur dans la devise de l'organisation (pur)
  query-parser.ts               requête utilisateur → critères structurés + EAN/MPN + tokens texte
  matching.ts                   ProductMatchingService : offre ↔ SKU, confiance 0–1, seuils 0,9 / 0,6
  scoring.ts                    OfferScoreService (/100 : prix 30, MOQ 20, délai 20, fournisseur 20, données 10), classements, score fournisseur
  validation.ts                 DataValidationService : anomalies (prix 0, prix aberrant, stock négatif, MOQ, devise, titre, URL)
  pricing.ts                    conversion devise (taux fourni), HT/TTC (TVA connue uniquement), prix comparable MOQ, fraîcheur, stats 30 j
  opportunities.ts              prix anormalement bas, baisse, retour en stock, stock en baisse (historique réel requis)
  types.ts                      RawOffer (sortie des parsers), champs mappables

src/services/sourcing/          côté serveur (clients Supabase, réseau)
  fx-rates.ts + ecb-parser.ts   taux BCE (EUR) → fx_rates ; getFxRate(from, to) par taux croisés, null si indisponible
  offer-storage.ts              OfferStorage : normalisation → validation → fx → sourcing_products → upsert sourcing_offers → suggestions de correspondance ; expiration des offres non revues
  feed-parsers.ts               CSV (csv-parse) / XML (fast-xml-parser) / JSON : parsing, mapping colonnes → RawOffer, prévisualisation, mapping suggéré
  feed-ingestion.ts             récupération (timeout, taille, User-Agent) ou fichier importé, sync_runs + sync_errors, flux échus
  crawler/robots.ts             robots.txt : groupe le plus spécifique, Allow/Disallow (motif le plus long, * et $), Crawl-delay
  crawler/source-crawler.ts     crawl borné : même hôte, pages max, délai ≥ max(2 s, Crawl-delay, config)
  crawler/crawler-manager.ts    planification des sources PUBLIC_WEB attestées, 1 requête à la fois par hôte, sync_runs
  crawler/parsers/              SourceParser (parse(html, url) → RawOffer[]), parser générique JSON-LD schema.org, registre (+ parsers HTML des adaptateurs)
  adapter-runtime.ts            config d'adaptateur depuis supplier_sources, enveloppe de provenance (raw.provenance), planificateur par hôte
  live-search.ts                PIPELINE DE RECHERCHE EN DIRECT : sources connectées → adaptateurs → OfferStorage → rapport par source, cache 10 min, sync_runs
  live-search.types.ts          LiveSourceReport / LiveSearchSummary (consommés par l'interface)
  matching-service.ts           candidats SKU bornés, enregistrement des suggestions, confirmation auto des identifiants exacts seulement
  offer-query.ts                requête d'offres par étapes : EAN/MPN → attributs normalisés → texte (ilike, index pg_trgm) → filtres
  search.ts                     SourcingSearchService : prix normalisé/comparable, coût rendu, marge potentielle, fraîcheur, score, agrégats, sources
  alerts.ts                     évaluation des alertes → sourcing_alert_events (unique alerte/offre/type)
  supplier-connectors.ts        connexions + secrets chiffrés (service_role), testSupplierConnection, syncSupplierConnection (catalogue borné → OfferStorage → sync_runs)
  sync.ts                       runSourcingSync : fx → flux échus → crawls échus → alertes

src/integrations/sourcing/      ADAPTATEURS DE SOURCE : core.ts (contrat SourceAdapter), registry.ts (SOURCE_ADAPTERS), shared.ts (HTTP tracé, filtrage par requête), un dossier par source
src/integrations/suppliers/     connecteurs « compte » dérivés des adaptateurs access=account (SUPPLIER_CONNECTORS), note PARTNER_FEED
src/app/api/cron/sourcing       cron protégé par `Authorization: Bearer ${CRON_SECRET}` (vercel.json : toutes les 6 h)
src/features/suppliers, src/features/sourcing   schémas zod, requêtes, Server Actions, composants ; pages sous src/app/(app)/suppliers et /sourcing
```

## Pipeline d'une offre

```
Source (flux / page / saisie)
  → RawOffer (parser : feed-parsers.mapRow, jsonld-parser, formulaire manuel)
  → ProductNormalizer (titre + indices structurés → identité produit + normalized_key)
  → DataValidationService (anomalies ; prix 0 → prix précédent conservé + status « suspicious »)
  → FxRateService (normalized_price dans la devise de l'organisation, taux BCE daté ; sinon null)
  → sourcing_products (get-or-create par (organization_id, normalized_key))
  → sourcing_offers (upsert (organization_id, source_id, external_offer_id), last_seen_at, confidence par donnée, anomalies)
  → trigger SQL : supplier_price_history / supplier_stock_history (jamais écrits par l'application)
  → ProductMatchingService : suggestions product_matches ; auto-confirmation uniquement EAN / MPN / code exact
  → offres de la source non revues → status « expired » (jamais supprimées)
```

## Adaptateurs de source (`src/integrations/sourcing/<key>/`)

Chaque adaptateur est un dossier indépendant `{crawler,parser,mapper,index}.ts` :
`crawler.ts` (URLs / endpoints, constantes regroupées en tête de fichier), `parser.ts` (validation Zod
des payloads → structures typées, pur), `mapper.ts` (→ `RawOffer`, rien n'est deviné : absent → `null`),
`index.ts` (objet `SourceAdapter` : `key`, `method`, `access`, `capabilities`, `credentialFields`,
`configFields`, `urlsForQuery`, `urlsForCatalog`, `search`, `fetchCatalog`, `testConnection`, `verification`).
Il est enregistré dans `registry.ts` (`SOURCE_ADAPTERS`) ; un adaptateur absent du registre n'est jamais proposé.

| Clé | Méthode | Accès | search | catalog | quantité | Ce qui est lu | Vérification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `jsonld-public` | `public_html` | public (attestation + robots.txt) | oui (`search_url` avec `{query}`) | oui (`urls`) | non | JSON-LD schema.org Product/Offer/ItemList (nom, SKU, GTIN, MPN, marque, prix, devise, disponibilité, état) | fixtures uniquement |
| `shopify-storefront` | `public_json` | public (attestation + robots.txt) | oui (`search/suggest.json` → `products/{handle}.json`) | oui (`products.json?limit=250&page=N`) | seulement si `inventory_quantity` exposé | titre, vendor, SKU, barcode (si exposé), prix, `available`, options stockage/couleur ; devise et HT/TTC = réglages de la source ; état/grade déduits du titre + description (marqués `inferred`) | fixtures uniquement |
| `woocommerce-store` | `public_json` | public (attestation + robots.txt) | oui (`wc/store/v1/products?search=`) | oui (paginé) | `low_stock_remaining` seulement | nom, SKU, prix + devise (unités mineures), promo, `is_in_stock`, MOQ (`add_to_cart.minimum`), attributs marque/stockage/couleur ; HT/TTC = réglage de la source | fixtures uniquement |
| `google-merchant-feed` | `public_feed` | public | oui (filtrage local du flux, cache 10 min) | oui | `g:quantity` seulement | RSS 2.0 / Atom (g:) ou TSV/CSV : id, title, price « 229.00 EUR », sale_price, availability, gtin, mpn, brand, condition, link, shipping, item_group_id, color | fixtures uniquement |
| `bigbuy` | `official_api` | compte (clé API Bearer) | oui (index local des premières pages, signalé partiel) | oui (`products.json` + `productsinformation.json` + `productsstockavailable.json` + `manufacturers.json`) | oui | nom, SKU, EAN13, marque, `wholesalePrice` (HT, EUR), `taxRate`, stock par entrepôt, délais de préparation | implémenté d'après la documentation publique, fixtures uniquement |
| `ingram-micro` | `official_api` | compte (OAuth2 client credentials + IM-CustomerNumber / IM-CountryCode / IM-CorrelationID / IM-SenderID / Accept-Language) | oui (`GET /resellers/v6/catalog?keyword=` → `POST priceandavailability` ≤ 50) | oui (paginé) | oui (`totalAvailability`) | description, ingramPartNumber, vendorPartNumber (MPN), UPC, vendorName, `pricing.customerPrice` + `currencyCode` ; HT/TTC = réglage de la source | implémenté d'après la documentation publique, fixtures uniquement |

**Statut de vérification : « fixtures »** pour tous. Le réseau sortant est bloqué dans l'environnement de
développement : chaque adaptateur a été écrit d'après le format / la documentation publique de la
plateforme et testé sur des documents construits selon ce format (`tests/fixtures/sourcing/<key>/`).
Aucun n'a été exercé en conditions réelles depuis cet environnement ; les chemins d'endpoints des API
« compte » sont isolés dans `crawler.ts` pour être corrigés sans toucher au reste.

Configuration : `supplier_sources.config = { adapter: "<clé>", ...réglages, urls, parser, max_pages }`
(`base_url`, `default_currency`, `default_tax_type`, `country` de la source servent de valeurs par
défaut documentées par l'utilisateur, jamais devinées). Les comptes : `supplier_connections.connector_key`
= clé de l'adaptateur, identifiants chiffrés dans `supplier_connection_secrets`, et une source
`SUPPLIER_ACCOUNT` créée au premier besoin pour porter les offres.

Provenance : chaque offre enregistrée porte `sourcing_offers.source_url` et
`sourcing_offers.raw = { provenance: { adapter, method, retrieved_at, request_url, source_url }, payload }`
(payload = données brutes bornées de l'adaptateur), relu par `SearchOfferView.provenance`.

## Recherche en direct (pipeline)

`runLiveSearch(ctx, { rawQuery, parsed, skuId?, maxSources?, timeoutMs? })` (`services/sourcing/live-search.ts`) :

```
requête → sources de l'organisation (supplier_sources non en pause, types PUBLIC_WEB/API/JSON/XML/CSV/SUPPLIER_ACCOUNT
          + supplier_connections avec adaptateur « compte »)
  → par source : adaptateur ? capacité search ?
      pages / JSON publics : attestation (automated_access_confirmed) sinon « not_attested »,
                             robots.txt sur adapter.urlsForQuery sinon « robots_disallowed » (colonnes robots_* mises à jour)
      comptes : identifiants déchiffrés (loadConnectionCredentials) sinon « account_required »
      cache 10 min par (source, requête normalisée) → « cached » sans nouvelle requête
  → adapter.search avec budget (8 s par source), ≤ 10 sources en parallèle, 1 requête à la fois par hôte,
    ≥ 2 s entre deux requêtes vers un même hôte public (HostScheduler)
  → chaque RawOffer → enveloppe de provenance → OfferStorage (normalisation, validation, fx, upsert)
  → LiveSourceReport par source (ok / cached / no_search / not_attested / robots_disallowed / account_required / error / timeout / skipped,
    requêtes effectuées, durée, trouvées / enregistrées / rejetées) ; une ligne sync_runs par source réellement interrogée
    (source_kind supplier_source ou supplier_connection, trigger manual, stats.kind = "live_search") visible dans /settings/sync
```

Reformulations : `searchOffers` calcule `expandQuery(parsed)` et passe les requêtes `adapter_search`
(`LiveSearchInput.variants`). Chaque source reçoit **au plus 2 reformulations**
(`LIVE_SEARCH_MAX_VARIANTS_PER_SOURCE`, ex. « Apple iPhone 13 128GB Grade A » puis « iPhone 13 128 Go Grade A »),
séquentiellement et dans **le même budget de 8 s** : la 2ᵉ n'est tentée que s'il reste ≥ 1 s (ou ¼ du budget)
et jamais après un échec de la 1ʳᵉ ; robots.txt est vérifié sur les URLs de toutes les reformulations ;
les offres sont fusionnées par `externalOfferId`. `LiveSourceReport.queries` liste les requêtes réellement
envoyées (affichées dans « Sources interrogées »). Une source découverte non validée (`config.discovered`
sans attestation) n'est jamais chargée comme candidate.

`searchOffers(ctx, { query, skuCode, filters, live, discover })` :

```
expandQuery ──► découverte (en parallèle, délai propre 12 s, rôle écriture, si SOURCING_DISCOVERY_PROVIDER)
           └──► recherche en direct (≤ 2 reformulations / source, 8 s / source)
  → lecture en base (offres existantes + offres venant d'être enregistrées)
  → enrichissement (prix comparable, coût rendu, marge, fraîcheur, assessOfferConfidence)
  → runOfferPipeline (domain/sourcing/search-pipeline.ts) :
       filterOffers (+ associations SKU confirmées) → conservées / écartées avec raison
       → dedupeOffers → rankOpportunities (requestedQuantity = filtre qty, currentUnitCost = coût du SKU en mode ?sku=)
       → économie pour N unités (coût rendu si connu, sinon prix unitaire signalé) — offres réelles uniquement
  → tri : « best_offer » = ordre de rankOpportunities ; autres tris = classements historiques (scoring.ts)
  → prix habituel observé des offres de la page : UNE requête groupée sur supplier_price_history (90 j)
```

`SearchResult` expose en plus : `expandedQueries`, `rejected` (`count`, `groups` par raison, `offers` ≤ 100 avec
leurs raisons, `referenceMedian`), `podium` / `highlights` / `awardOffers` / `priceBasisNote`, `bestSavings`,
`currentUnitCost`, `skuTopOffers` (mode SKU), `discovery` (panneau). Chaque `SearchOfferView` porte `ranking`
(rang, score /100 détaillé, « pourquoi », distinctions, plan d'achat), `confidenceBadge`, `filterWarnings`,
`priceInsights`, `savings`. Une offre en rupture connue (statut ou quantité 0) est classée après les offres
disponibles et n'obtient pas le podium (la distinction factuelle « Prix le plus bas » reste possible).

Interface (`/sourcing`) : podium 🥇 🥈 🥉 + distinctions, « Pour N unités : jusqu'à X € d'économie potentielle »
(mode SKU), cartes avec rang, distinctions, badge de confiance (🟢 ⚪ 🟡 🟠 🔴 + « Dernière vérification : il y a … »),
« Pourquoi cette position », avertissements du filtre, « 🔥 Opportunité détectée » **uniquement** si l'historique est
fiable ; « n offres écartées » (liste dépliable, raison par offre) ; « Sources découvertes » ; « Découvertes — à valider » ;
« État des sources » (`services/sourcing/status-summary.ts`, calculé : catalogue, registre, sources attestées et actives,
avec prix, avec stock, compte requis, API / flux, utilisables immédiatement — chaque chiffre avec sa définition).
Fiche offre : badge de confiance, « Prix habituel observé » (offre et produit tous fournisseurs, sinon
« Historique insuffisant : … »), historique des prix par fournisseur. Fiche SKU : section « Trouver moins cher »
→ `/sourcing?sku=…&qty=<réappro recommandé ou 1>` ; en mode SKU, « Ton fournisseur actuel : X € » puis les meilleures
offres réelles « Y € ↓ Δ € » avec l'explication du classement, sinon un message simple.

`listLiveSearchableSources(ctx)` décrit pour l'interface l'interrogeabilité de chaque source (adaptateur,
méthode, accès, attestation, robots, connexion).

### Recherches de référence (`npm run sourcing:test-searches`)

`scripts/sourcing-test-searches.ts` (banc : `services/sourcing/test-searches.ts`) : organisation dédiée
« TEST — recherches sourcing » (créée si absente, `DATABASE_URL`, défaut base locale de test), sources configurées
par l'opérateur, `executeLiveSearch` avec adaptateurs et `fetch` réels, puis filtre et classement **en mémoire (aucune
offre insérée)**, pour 5 requêtes ; puis les mêmes requêtes sur les fixtures des adaptateurs (section
« FIXTURES — pas des offres réelles »). Résultat écrit dans `docs/sourcing-test-searches.md`.

## Recherche

1. `parseQuery` : EAN (8/13 chiffres) ou MPN → recherche exacte ; sinon marque/modèle/stockage/couleur/grade normalisés ; sinon tokens texte.
2. `findOffers` : étapes successives (identifiant → attributs → texte → filtres seuls), bornée à 500 offres, filtres SQL (prix max normalisé, MOQ, quantité, pays, délai, grade, état, TVA, fournisseur, type de source, disponibilité).
3. Enrichissement par offre : prix normalisé (devise org), prix comparable (HT si `tax_type` connu et TVA renseignée), prix comparable × MOQ / minimum de commande, coût rendu (`computeLandedCost`, « Coût final non déterminable » sans frais de port), marge potentielle (`computeMargin` avec le prix de vente du SKU ou sa moyenne 30 j, frais du canal principal), fraîcheur (> 48 h : « Donnée potentiellement obsolète », > 7 j : « Prix potentiellement obsolète »), score transparent.
4. Score /100 relatif au résultat : prix 30, MOQ 20, délai 20, fournisseur 20, qualité des données 10. Donnée inconnue = 0 point **et** listée (`unknownFactors`) ; couverture « Comparaison partielle » affichée.
5. Classements : prix le plus bas, meilleure offre, meilleure marge, livraison la plus rapide, MOQ le plus faible, meilleur fournisseur (inconnus en dernier).
6. Mode SKU (`/sourcing?sku=CODE`) : critères issus du SKU (marque, nom, attributs, EAN/MPN), offres déjà associées incluses, « Votre fournisseur actuel » = coût d'achat du SKU, économies par unité et pour N unités.

## Ajouter un adaptateur de source

1. Créer `src/integrations/sourcing/<key>/` avec `crawler.ts` (endpoints / gabarits d'URL, constantes en tête),
   `parser.ts` (schémas Zod du format officiel → types), `mapper.ts` (→ `RawOffer`, absent → `null`, état/grade
   uniquement via le normaliseur, marqués `inferred`), `index.ts` (objet `SourceAdapter`, `verification: "fixtures"`
   tant qu'il n'a pas été exercé en conditions réelles, description honnête des limites).
2. Respecter le contrat : `search` retourne toujours `requests` (URL, statut, durée, offres, erreur) et `truncated` ;
   `urlsForQuery` / `urlsForCatalog` listent les URLs à soumettre à robots.txt ; `testConnection` est sans effet de bord ;
   un adaptateur `access: "account"` déclare ses `credentialFields` et lit `ctx.credentials`.
3. L'enregistrer dans `src/integrations/sourcing/registry.ts` (`SOURCE_ADAPTERS`). Un adaptateur `access: "account"`
   devient automatiquement un connecteur (`SUPPLIER_CONNECTORS`) ; un `htmlParser` est exposé au crawler d'URLs.
4. Construire des fixtures d'après le format documenté dans `tests/fixtures/sourcing/<key>/` et un test
   `tests/unit/sourcing-adapter-<key>.test.ts` (search, catalogue, testConnection, fetch simulé via `fetchImpl` +
   `resolver` public) ; ajouter la ligne au tableau ci-dessus avec son statut de vérification.

## Format de mapping des flux (`supplier_feeds.field_mapping`)

```json
{
  "external_offer_id": "sku",
  "title": "Désignation",
  "price": "Prix HT",
  "currency": { "const": "EUR" },
  "tax_type": { "const": "ht" },
  "available_quantity": "Stock",
  "moq": "MOQ",
  "ean": "EAN",
  "delivery_days": "Délai",
  "url": "info.link"
}
```

- Clé = champ d'offre (`RAW_OFFER_FIELDS`), valeur = nom de colonne CSV ou chemin pointé XML/JSON (`a.b[0].c`), ou `{ "const": "…" }`.
- Obligatoires : `title`, `price` et un identifiant (`external_offer_id`, sinon `supplier_sku`, sinon `ean`). La devise vient de la colonne ou de la devise par défaut de la source.
- `options` : `delimiter`, `encoding`, `root_path` (XML/JSON, détection automatique sinon), `header_row`.
- Nombres : `1 234,56`, `1,234.56`, `229,90 €` acceptés. Délais : `3-5`, `5 à 7 jours`, `10`.
- Un prix à 0 ou illisible n'écrase jamais un prix existant.

## Règles légales et de prudence

- Pages publiques : l'utilisateur **atteste** que les conditions d'utilisation autorisent l'accès automatisé (`automated_access_confirmed`) ; `robots.txt` est lu et respecté (interdiction = refus, délai appliqué) ; User-Agent `SOURCING_USER_AGENT` identifiable ; aucun login, cookie, CAPTCHA, paywall ou protection anti-bot contournés ; adresses privées/locales refusées ; 1 requête à la fois par hôte, ≥ 2 s entre deux requêtes, nombre de pages borné.
- Comptes fournisseurs / API : connexions + secrets chiffrés AES-256-GCM (table service_role) ; connecteurs `bigbuy` et `ingram-micro` implémentés d'après la documentation publique des API officielles, **vérifiés sur fixtures uniquement** (non exercés en conditions réelles depuis l'environnement de développement) : l'interface et les descriptions le disent explicitement. Les identifiants ne servent qu'aux appels de l'API officielle ; aucune automatisation d'un espace client web.
- Recherche en direct : mêmes garde-fous (attestation, robots.txt, hôte public, délais, budget de temps) ; chaque interrogation est journalisée dans `sync_runs` et chaque offre conserve sa provenance (méthode, adaptateur, horodatage, URL de requête).
- Flux partenaires (SFTP/EDI) : non implémentés, note dans `integrations/suppliers/partner-feed.ts`.
- Données : rien n'est inventé ni supposé (coût inconnu ≠ 0, délai inconnu ≠ défaut, score fournisseur = null sans 3 commandes reçues).

## Exploitation

- Cron : `GET|POST /api/cron/sourcing` avec `Authorization: Bearer $CRON_SECRET` (503 si non configuré, 401 si invalide) → taux BCE, flux échus, crawls échus, alertes. Chaque flux / crawl / évaluation d'alertes écrit une ligne `sync_runs` (par organisation) et ses `sync_errors`.
- Depuis l'interface : « Synchroniser maintenant » (flux, page publique), « Importer le fichier » (flux sans URL), « Vérifier robots.txt », « Évaluer maintenant » (alertes).
- Tests : `npx vitest run tests/unit/sourcing-` (normaliseur dont années / générations `sourcing-normalizer-generations`, reformulations envoyées aux sources `sourcing-live-variants`, pipeline filtre → classement → économies `sourcing-search-pipeline`, validation des sources découvertes, état des sources, découverte pendant la recherche, historique de prix, actions sans exception `sourcing-actions-errors`, parseur de requête, matching, score, validation, prix/fraîcheur, opportunités, flux CSV/XML/JSON, JSON-LD, robots.txt, BCE, adaptateurs sur fixtures `sourcing-adapter-*`, orchestration de la recherche en direct `sourcing-live-search`, déduplication / provenance `sourcing-dedupe`) — aucun accès réseau.
