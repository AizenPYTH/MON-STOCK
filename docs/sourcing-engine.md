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
  crawler/parsers/              SourceParser (parse(html, url) → RawOffer[]), parser générique JSON-LD schema.org, registre
  matching-service.ts           candidats SKU bornés, enregistrement des suggestions, confirmation auto des identifiants exacts seulement
  offer-query.ts                requête d'offres par étapes : EAN/MPN → attributs normalisés → texte (ilike, index pg_trgm) → filtres
  search.ts                     SourcingSearchService : prix normalisé/comparable, coût rendu, marge potentielle, fraîcheur, score, agrégats, sources
  alerts.ts                     évaluation des alertes → sourcing_alert_events (unique alerte/offre/type)
  supplier-connectors.ts        connexions + secrets chiffrés (service_role) ; registre vide → « Aucun connecteur disponible »
  sync.ts                       runSourcingSync : fx → flux échus → crawls échus → alertes

src/integrations/suppliers/     contrats SupplierAPIConnector, note PARTNER_FEED, dossiers de parsers par source (README)
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

## Recherche

1. `parseQuery` : EAN (8/13 chiffres) ou MPN → recherche exacte ; sinon marque/modèle/stockage/couleur/grade normalisés ; sinon tokens texte.
2. `findOffers` : étapes successives (identifiant → attributs → texte → filtres seuls), bornée à 500 offres, filtres SQL (prix max normalisé, MOQ, quantité, pays, délai, grade, état, TVA, fournisseur, type de source, disponibilité).
3. Enrichissement par offre : prix normalisé (devise org), prix comparable (HT si `tax_type` connu et TVA renseignée), prix comparable × MOQ / minimum de commande, coût rendu (`computeLandedCost`, « Coût final non déterminable » sans frais de port), marge potentielle (`computeMargin` avec le prix de vente du SKU ou sa moyenne 30 j, frais du canal principal), fraîcheur (> 48 h : « Donnée potentiellement obsolète », > 7 j : « Prix potentiellement obsolète »), score transparent.
4. Score /100 relatif au résultat : prix 30, MOQ 20, délai 20, fournisseur 20, qualité des données 10. Donnée inconnue = 0 point **et** listée (`unknownFactors`) ; couverture « Comparaison partielle » affichée.
5. Classements : prix le plus bas, meilleure offre, meilleure marge, livraison la plus rapide, MOQ le plus faible, meilleur fournisseur (inconnus en dernier).
6. Mode SKU (`/sourcing?sku=CODE`) : critères issus du SKU (marque, nom, attributs, EAN/MPN), offres déjà associées incluses, « Votre fournisseur actuel » = coût d'achat du SKU, économies par unité et pour N unités.

## Ajouter un parser de source publique

Voir `src/integrations/suppliers/sources/README.md`. En résumé : un dossier `sources/<key>/{parser,mapper,crawler}.ts`,
un objet `SourceParser` (`parse(html, url) → RawOffer[]`, pur, testé sur un HTML d'exemple), déclaré dans
`sources/registry.ts`. Le parser générique `jsonld` lit les blocs JSON-LD schema.org `Product`/`Offer`.

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
- Comptes fournisseurs / API : architecture en place (connexions, secrets chiffrés AES-256-GCM en table service_role), **aucun connecteur réel** : l'interface le dit explicitement.
- Flux partenaires (SFTP/EDI) : non implémentés, note dans `integrations/suppliers/partner-feed.ts`.
- Données : rien n'est inventé ni supposé (coût inconnu ≠ 0, délai inconnu ≠ défaut, score fournisseur = null sans 3 commandes reçues).

## Exploitation

- Cron : `GET|POST /api/cron/sourcing` avec `Authorization: Bearer $CRON_SECRET` (503 si non configuré, 401 si invalide) → taux BCE, flux échus, crawls échus, alertes. Chaque flux / crawl / évaluation d'alertes écrit une ligne `sync_runs` (par organisation) et ses `sync_errors`.
- Depuis l'interface : « Synchroniser maintenant » (flux, page publique), « Importer le fichier » (flux sans URL), « Vérifier robots.txt », « Évaluer maintenant » (alertes).
- Tests : `npx vitest run tests/unit/sourcing-` (normaliseur, parseur de requête, matching, score, validation, prix/fraîcheur, opportunités, flux CSV/XML/JSON, JSON-LD, robots.txt, BCE) — aucun accès réseau.
