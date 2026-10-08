# Sourcing : pipeline de comparaison et découverte de sources

Objectif produit : « Google + Idealo + Kayak de l'achat B2B ». On cherche un produit, on interroge
de nombreuses sources pertinentes (y compris des sources que l'utilisateur n'a pas encore
enregistrées), on normalise, on rejette les mauvaises offres, on compare et on met en avant les
meilleures opportunités d'achat **avec leurs explications**.

Règles absolues (rappel) :

- rien n'est inventé : une donnée inconnue reste `null` et s'affiche « Non communiqué » ;
- aucun contournement de connexion, CAPTCHA, anti-bot ou paywall ;
- robots.txt et limites de débit respectés ;
- une source qui exige un compte est étiquetée **« Compte requis »** ;
- distinction stricte **DOCUMENTÉ ≠ VÉRIFIÉ ≠ CONNECTÉ ≠ OFFRE DISPONIBLE** (voir plus bas).

> **Limite de l'environnement de développement** : le réseau sortant y est bloqué (tous les hôtes
> externes répondent 403). Tout ce qui suit a été construit d'après les formats **documentés** et
> testé **uniquement sur des fixtures** (documents construits à la main). Aucun résultat réel
> (API Brave, sites fournisseurs) n'a été observé : ne jamais présenter ces tests comme des
> résultats en conditions réelles.

## 1. Pipeline

```
SourceRegistry → SourceAdapter → Search → RawOffer → Normalizer → ProductMatcher
      → OfferValidator → OfferScorer → OpportunityEngine → UI
```

| Étape | Rôle | Fichier(s) |
|---|---|---|
| **SourceRegistry** | Liste des adaptateurs disponibles, catalogue des sources documentées | `src/integrations/sourcing/registry.ts`, `src/integrations/sourcing/catalog.ts` |
| **SourceAdapter** | Contrat d'un adaptateur (search / fetchCatalog / testConnection), un dossier par source | `src/integrations/sourcing/core.ts`, `src/integrations/sourcing/<clé>/` (`shopify-storefront`, `woocommerce-store`, `jsonld-public`, `google-merchant-feed`) |
| **Search** (requête) | Analyse de la requête, reformulations, orchestration de la recherche en direct | `src/domain/sourcing/query-parser.ts`, **`src/domain/sourcing/query-expansion.ts`**, `src/services/sourcing/live-search.ts`, `src/services/sourcing/search.ts` |
| **RawOffer** | Offre brute + provenance (adaptateur, méthode, horodatage) | `src/domain/sourcing/types.ts` (`RawOffer`), `src/integrations/sourcing/core.ts` (`TracedRawOffer`) |
| **Normalizer** | Texte → marque, modèle, stockage, couleur, état, grade, EAN, MPN | `src/domain/sourcing/normalizer.ts`, `src/domain/sourcing/dictionaries.ts` |
| **ProductMatcher** | Offre ↔ SKU de l'organisation (confiance 0–1) | `src/domain/sourcing/matching.ts`, `src/services/sourcing/matching-service.ts` |
| **OfferValidator** | (a) à l'ingestion : anomalies de données ; (b) **sur les résultats de recherche** : bonne offre pour la requête ? | (a) `src/domain/sourcing/validation.ts`, `src/services/sourcing/offer-storage.ts` ; (b) **`src/domain/sourcing/offer-filter.ts`** |
| **OfferScorer** | Score transparent, classement multicritère, niveau de confiance de la donnée | `src/domain/sourcing/scoring.ts`, **`src/domain/sourcing/ranking.ts`**, **`src/domain/sourcing/confidence.ts`** |
| **OpportunityEngine** | Podium, coût d'achat réel (MOQ), économies, prix habituel, opportunités | `src/domain/sourcing/opportunities.ts`, **`src/domain/sourcing/price-insights.ts`**, **`src/domain/sourcing/ranking.ts`** (podium) |
| **UI** | Recherche, cartes d'offres, traçabilité, sources interrogées | `src/app/(app)/sourcing/page.tsx`, `src/features/sourcing/components/*` |
| **Découverte** (en amont du registre) | Trouver des fournisseurs inconnus de l'organisation | **`src/services/sourcing/discovery/`** (`web-search-providers.ts`, `candidate-analyzer.ts`, `discovery-service.ts`) |

Les modules en gras sont décrits ci-dessous.

### 1.1 Reformulation de la requête — `query-expansion.ts`

`expandQuery(parsed, { max = 6, maxDiscovery = 3 })` produit une liste courte, dédupliquée et
priorisée. Chaque élément porte un `purpose` (`identifier`, `exact`, `condition`, `b2b_intent`,
`liquidation`) et un `useFor` (`adapter_search` = requête envoyée aux adaptateurs enregistrés ;
`discovery` = requête envoyée à l'API de recherche web).

Exemple « iPhone 13 128 Go Grade A » :

1. `Apple iPhone 13 128GB Grade A` (exact, EN)
2. `iPhone 13 128 Go Grade A` (exact, FR)
3. `Apple iPhone 13 128GB refurbished` (condition, EN)
4. `iPhone 13 128 Go reconditionné` (condition, FR)
5. `iPhone 13 grossiste reconditionné` (b2b_intent → discovery)
6. `Apple iPhone 13 wholesale refurbished B2B` (b2b_intent → discovery)

Un EAN / MPN connu donne une requête « identifiant » en tête. Au moins 2 places sont réservées
à la découverte quand elle est possible ; les intentions B2B (grossiste, wholesale, B2B, lot,
déstockage, surplus, liquidation) sont choisies par catégorie (smartphone, tablette, ordinateur,
console, audio, montre, électroménager, autre).

### 1.2 Filtre des résultats — `offer-filter.ts`

`filterOffers(criteria, offers, { now })` → `{ kept, rejected, referenceMedian, rejectionCounts }`,
chaque décision avec une raison en français. Rejets : modèle différent (iPhone 13 ≠ 13 Pro / mini),
marque ou stockage différents, grade inférieur, état différent **si explicitement demandé**,
accessoire / pièce détachée / appareil HS, « pour pièces », verrouillé iCloud, « bloqué », boîte vide,
offre expirée ou rejetée, anomalie suspecte, donnée de plus de 30 jours, prix > 250 % de la médiane
du résultat, prix < 40 % de la médiane chez un fournisseur **non vérifié**. Conservé avec avertissement :
grade / état / stockage / modèle non communiqués (« grade non communiqué »), couleur différente,
prix < 40 % chez un fournisseur vérifié (« prix anormalement bas, à vérifier »).

Les mots ambigus (« écran », « batterie », « câble »…) ne déclenchent un rejet que s'ils précèdent
la mention du produit : « Écran pour iPhone 13 » est une pièce, « iPhone 13 – batterie 89 % » un téléphone.
La médiane de référence n'est calculée que sur les offres ayant passé les autres contrôles et
seulement à partir de 3 prix.

### 1.3 Classement et podium — `ranking.ts`

`rankOpportunities(offers, { requestedQuantity, currentUnitCost })` : score composite /100 détaillé
(prix 30, état/grade 15, MOQ réalisable 15, fiabilité fournisseur 15, délai 10, stock 5,
fraîcheur 5, complétude 5), une donnée inconnue valant 0 et étant listée. Le prix est comparé sur
le coût rendu si toutes les offres en ont un, sinon sur le prix unitaire (indiqué dans `priceBasisNote`).

Coût d'achat pour N unités : `unités = max(N, MOQ, unités imposées par le minimum de commande)` ;
`coût total = unités × coût rendu (+ port par commande)` ; surplus et capital immobilisé signalés ;
économie vs coût actuel et bénéfice estimé seulement si les deux termes sont connus.

Podium : 🥇 Meilleure opportunité (bénéfice estimé le plus élevé, MOQ réalisable en priorité ;
à défaut de marge connue, meilleur score global), 🥈 Meilleur rapport qualité / prix (prix pondéré
par la qualité), 🥉 Fournisseur le plus fiable (score fournisseur + fraîcheur + stock communiqué) ;
plus « Prix le plus bas », « Livraison la plus rapide », « MOQ le plus faible ». Aucune récompense
sur une donnée inconnue : « non attribué : données insuffisantes (…) ». Les trois places du podium
vont à trois offres distinctes (option `distinctPodium`).

### 1.4 Confiance de la donnée — `confidence.ts`

| Niveau | Condition (par priorité) |
|---|---|
| 🔴 Offre expirée | statut expiré / rejeté, date d'expiration passée, ou vue il y a > 30 jours |
| 🟡 Donnée ancienne | vue il y a > 48 h, ou date inconnue |
| 🟠 Stock incertain | stock non communiqué, confiance stock < 0,6, ou source découverte non validée |
| 🟢 Vérifié récemment | vue ≤ 24 h, confiance prix ≥ 0,9, statut actif |
| ⚪ À confirmer | sinon (entre 24 et 48 h, confiance prix < 0,9 ou inconnue, offre suspecte) |

`formatLastChecked(date)` → « Dernière vérification : il y a 12 minutes ».

### 1.5 Prix habituel — `price-insights.ts`

`computePriceInsights(points, currentPrice)` (par offre, ou par produit via `mergeHistories`) :
fourchette habituelle P25–P75 **uniquement** avec au moins 5 relevés sur au moins 14 jours
(sinon « Historique insuffisant »), tendance hausse / baisse / stable, meilleur prix observé et sa
date, « 🔥 Opportunité détectée — prix inférieur de 12 % au prix habituel observé (270–290 €) »
(prix sous P25 et ≥ 5 % sous la médiane), et « ⚠️ Prix anormalement bas » au-delà de 35 % sous
la médiane — dans ce cas l'opportunité n'est **pas** annoncée tant que l'offre n'est pas vérifiée.

## 2. Découverte de sources

But : proposer des fournisseurs B2B que l'utilisateur ne connaît pas, **sans jamais les interroger
automatiquement avant validation**.

```
ParsedQuery → expandQuery (useFor « discovery », ≤ 6 requêtes)
  → API de recherche web officielle (Brave Search API) — cache 24 h par requête, 1 appel / 1,1 s
  → tri : exclusions explicites, indices B2B, un candidat par domaine enregistrable
  → dédoublonnage contre les fournisseurs / sources de l'organisation (domaine enregistrable)
  → sonde : robots.txt (interdit → aucune requête), puis UNE page publique (anti-SSRF)
  → enregistrement : fournisseur + source PUBLIC_WEB « not_connected », non attestée
  → DiscoveryReport { enabled, provider, queries, candidates[{domain, name, type, platform,
       access, priceVisibility, robots, status: new | already_known | rejected | skipped, reason}] }
```

Fichiers :

- `web-search-providers.ts` — configuration zod (`SOURCING_DISCOVERY_PROVIDER`, `BRAVE_SEARCH_API_KEY`),
  fournisseur Brave (GET `https://api.search.brave.com/res/v1/web/search?q=…&count=20&country=fr`,
  en-têtes `X-Subscription-Token` et `Accept: application/json`, lecture de `web.results[].{url,title,description}`),
  exécution bornée `runDiscoverySearches` (6 requêtes max, cache mémoire 24 h, arrêt sur clé refusée / quota).
- `candidate-analyzer.ts` — exclusions (Amazon, eBay, Back Market grand public — `pro.backmarket.*` reste
  admis —, Cdiscount, Fnac, Leboncoin, Google, Facebook, YouTube, Wikipédia, Idealo, LeDénicheur, médias,
  sites de fabricants…), classification (grossiste, distributeur, reconditionneur, déstockage / liquidation,
  broker, marketplace B2B) avec confiance et indices, sonde d'une page : Shopify (`cdn.shopify.com`, forme
  `/products.json`), WooCommerce (`/wp-json/wc/store`, extension), JSON-LD `Product`, mur de connexion,
  « connectez-vous pour voir les prix » → « Prix après connexion », CAPTCHA / défi anti-bot → « Compte requis /
  protégé » ; adaptateur suggéré (`shopify-storefront`, `woocommerce-store`, `jsonld-public`) **seulement**
  pour un accès public.
- `discovery-service.ts` (server-only) — `discoverSources(ctx, parsedQuery)`, client ADMIN toujours
  filtré par `organization_id` (le contrôle du rôle de l'utilisateur incombe à l'appelant).

Ce qui est enregistré pour un nouveau candidat :

- `suppliers` : nom (titre de page ou domaine), site web (origine), note « Découvert automatiquement — à valider » ;
- `supplier_sources` : `source_type = PUBLIC_WEB`, `status = 'not_connected'`,
  `automated_access_confirmed = FALSE`, `robots_allowed` / `robots_checked_at` / `crawl_delay_seconds`
  selon la sonde, et `config = { discovered: true, discovered_at, discovered_via, discovery_query,
  supplier_type, supplier_type_confidence, platform, suggested_adapter, access: "public" | "account" |
  "protected" | "unknown" (page non sondée : jamais présumée publique), access_label, price_visibility, robots_allowed, robots_status, sample_url, probe_signals, probe_error,
  validation: "pending" }`.

Aucun changement de schéma n'a été nécessaire.

### Garde-fous juridiques

- **Aucune attestation automatique** des conditions d'utilisation : `automated_access_confirmed` reste
  `FALSE`, et la clé `config.adapter` n'est pas renseignée (seulement `suggested_adapter`). La source
  apparaît « Découverte — à valider » ; elle n'est interrogée en direct qu'après validation explicite
  par l'utilisateur dans l'interface (attestation après lecture des CGU).
- Uniquement des API de recherche **officielles** avec la clé de l'utilisateur ; aucun scraping de moteur.
- robots.txt lu avant toute page : interdiction → aucune requête (« robots.txt interdit ») ; robots.txt
  inaccessible → aucune requête (prudence) ; `Crawl-delay` respecté (au-delà de 10 s, sonde reportée).
- Une seule page publique par domaine, requête GET sans cookie ni session, taille et durée bornées,
  protection SSRF (résolution DNS vérifiée, redirections revalidées).
- CAPTCHA, défi anti-bot, 401 / 403 / 429 → « Compte requis / protégé », jamais contourné.
- Les sites exigeant un compte sont étiquetés « Compte requis » ; prix derrière connexion → « Prix après connexion ».

## 3. Les quatre niveaux de statut d'une source

| Niveau | Signification | Où |
|---|---|---|
| **DOCUMENTÉ** | La source est décrite (site, type, conditions d'accès lues dans la documentation publique) — rien n'a été interrogé | `docs/sourcing-sources.md`, `src/integrations/sourcing/catalog.ts` ; un candidat découvert est au mieux « documenté automatiquement » |
| **VÉRIFIÉ** | L'utilisateur a vérifié les conditions d'utilisation / robots.txt et attesté l'accès automatisé, ou l'adaptateur a été testé en réel (`verification: "live"`) | `supplier_sources.automated_access_confirmed = true`, `robots_allowed`, `SourceAdapter.verification` |
| **CONNECTÉ** | La source est configurée et interrogeable (adaptateur actif, identifiants pour un compte) | `supplier_sources.status = 'active'`, `config.adapter`, `supplier_connections` |
| **OFFRE DISPONIBLE** | Une offre a réellement été collectée, avec provenance et horodatage | `sourcing_offers` (statut, `last_seen_at`) ; niveau de confiance via `confidence.ts` |

Une source découverte n'est que « Découverte — à valider » : ni vérifiée, ni connectée, et aucune
offre n'en provient tant que l'utilisateur ne l'a pas validée.

## 4. Activer Brave Search

1. Créer une clé sur le tableau de bord de la Brave Search API (plan gratuit : 1 requête / seconde,
   quota mensuel limité — vérifier les conditions en vigueur).
2. Dans `.env.local` (serveur uniquement) :

   ```
   SOURCING_DISCOVERY_PROVIDER=brave
   BRAVE_SEARCH_API_KEY=<votre clé X-Subscription-Token>
   ```
3. Sans ces variables (ou `SOURCING_DISCOVERY_PROVIDER=none`), la découverte est désactivée et le
   rapport l'indique : « Découverte désactivée : aucune API de recherche configurée ».

Coût par recherche : au plus 6 appels API (en pratique 2 à 3 requêtes de découverte), mis en cache
24 h en mémoire du processus serveur ; au plus 10 candidats sondés (2 requêtes chacun : robots.txt + page).

## 5. Ce qui a été testé (fixtures uniquement)

| Fichier de test | Couverture |
|---|---|
| `tests/unit/sourcing-query-expansion.test.ts` | iPhone 13 / 13 Pro / 13 mini / 14, Galaxy S22 / S23 Ultra, Pixel 7, Redmi Note 12, iPad, EAN, MPN, texte libre, budget, déterminisme |
| `tests/unit/sourcing-offer-filter.test.ts` | modèle / stockage / grade / état, accessoires et pièces (positifs et faux positifs), expiration, anomalies, 30 jours, prix aberrants |
| `tests/unit/sourcing-ranking.test.ts` | plan d'achat (MOQ, minimum de commande, port), économies, score, départages, podium, « non attribué » |
| `tests/unit/sourcing-confidence.test.ts` | 5 niveaux, seuils exacts, formatage relatif français |
| `tests/unit/sourcing-price-insights.test.ts` | seuils de fiabilité, P25–P75, tendance, opportunité, prix anormalement bas, fusion multi-offres |
| `tests/unit/sourcing-discovery.test.ts` | configuration, réponse Brave construite d'après la documentation, requête et en-têtes, cache, bornes, exclusions, classification, détection de plateforme / connexion / CAPTCHA, robots.txt, anti-SSRF (résolveur public 93.184.216.34 simulé), service complet avec fournisseur et `fetch` simulés, payloads Supabase |

Non testé : appels réels à l'API Brave, pages réelles de fournisseurs, comportement des protections
anti-bot réelles, pertinence réelle des résultats de recherche. La liste des suffixes publics
(`registrableDomain`) est volontairement courte (pas de Public Suffix List complète).
