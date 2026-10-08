# Recherches de référence du sourcing

Généré par `npm run sourcing:test-searches` le 2026-10-08T16:39:29.329Z — base `postgresql://postgres:***@localhost:5432/mon_stock_sourcing`, organisation « TEST — recherches sourcing » (`8651dccf-bd36-4c7f-b99b-508b0fe341a6`, créée par ce script).

Pipeline réel : `executeLiveSearch` (adaptateurs du registre, robots.txt, budget de 8 s par source, ≤ 2 reformulations) → normalisation / validation (`rawOfferToPipelineOffer`) → filtre de pertinence (`filterOffers`) → déduplication → classement (`rankOpportunities`). **Aucune offre n'est enregistrée** par ce script.

## 1. Sources configurées (conditions réelles)

0 source(s) configurée(s) pour l'organisation de test. Aucune source n'est configurée pour cette organisation : **aucune requête réseau n'a été émise** et aucune offre réelle n'a été trouvée (réseau sortant de toute façon bloqué dans l'environnement de développement — hôtes externes en 403).

### 1. « iPhone 13 128 Go Grade A »

- Requête analysée : marque apple · modèle iphone 13 · stockage 128GB · grade A (type structured)
- Reformulations envoyées à chaque source (≤ 2) : « Apple iPhone 13 128GB Grade A », « iPhone 13 128 Go Grade A »
- Sources : 0 candidate(s), 0 interrogée(s)
- Offres trouvées : 0 · conservées : 0 (0 après déduplication) · écartées : 0
- Meilleure offre : **Aucune offre**

### 2. « iPhone 13 Pro 256 Go Grade A »

- Requête analysée : marque apple · modèle iphone 13 pro · stockage 256GB · grade A (type structured)
- Reformulations envoyées à chaque source (≤ 2) : « Apple iPhone 13 Pro 256GB Grade A », « iPhone 13 Pro 256 Go Grade A »
- Sources : 0 candidate(s), 0 interrogée(s)
- Offres trouvées : 0 · conservées : 0 (0 après déduplication) · écartées : 0
- Meilleure offre : **Aucune offre**

### 3. « iPhone 14 128 Go Grade A »

- Requête analysée : marque apple · modèle iphone 14 · stockage 128GB · grade A (type structured)
- Reformulations envoyées à chaque source (≤ 2) : « Apple iPhone 14 128GB Grade A », « iPhone 14 128 Go Grade A »
- Sources : 0 candidate(s), 0 interrogée(s)
- Offres trouvées : 0 · conservées : 0 (0 après déduplication) · écartées : 0
- Meilleure offre : **Aucune offre**

### 4. « Samsung Galaxy S22 128 Go Grade A »

- Requête analysée : marque samsung · modèle galaxy s22 · stockage 128GB · grade A (type structured)
- Reformulations envoyées à chaque source (≤ 2) : « Samsung Galaxy S22 128GB Grade A », « Galaxy S22 128 Go Grade A »
- Sources : 0 candidate(s), 0 interrogée(s)
- Offres trouvées : 0 · conservées : 0 (0 après déduplication) · écartées : 0
- Meilleure offre : **Aucune offre**

### 5. « Samsung Galaxy S23 256 Go Grade A »

- Requête analysée : marque samsung · modèle galaxy s23 · stockage 256GB · grade A (type structured)
- Reformulations envoyées à chaque source (≤ 2) : « Samsung Galaxy S23 256GB Grade A », « Galaxy S23 256 Go Grade A »
- Sources : 0 candidate(s), 0 interrogée(s)
- Offres trouvées : 0 · conservées : 0 (0 après déduplication) · écartées : 0
- Meilleure offre : **Aucune offre**

## 2. FIXTURES — pas des offres réelles

> Documents construits à la main d'après les formats documentés (`tests/fixtures/sourcing/<adaptateur>/`), servis par un fetch simulé (aucun réseau), robots.txt non applicable, fournisseurs fictifs. Le serveur simulé renvoie le **même document quelle que soit la requête** (sauf les adaptateurs qui filtrent localement : flux Google Merchant, BigBuy) : les offres hors sujet sont donc écartées par le filtre de pertinence — c'est ce que cette section démontre. Ces prix ne sont **pas** des offres réelles.

### 1. « iPhone 13 128 Go Grade A »

- Requête analysée : marque apple · modèle iphone 13 · stockage 128GB · grade A (type structured)
- Reformulations envoyées à chaque source (≤ 2) : « Apple iPhone 13 128GB Grade A », « iPhone 13 128 Go Grade A »
- Sources : 6 candidate(s), 6 interrogée(s)
  - FIXTURE jsonld-public (jsonld-public) : interrogée — 2 offre(s), 2 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE shopify-storefront (shopify-storefront) : interrogée — 2 offre(s), 6 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE woocommerce-store (woocommerce-store) : interrogée — 2 offre(s), 2 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE google-merchant-feed (google-merchant-feed) : interrogée — 1 offre(s), 2 requête(s) — 1 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE bigbuy (bigbuy) : interrogée — 1 offre(s), 4 requête(s) — 1 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE ingram-micro (ingram-micro) : interrogée — 1 offre(s), 5 requête(s) — 1 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
- Offres trouvées : 9 · conservées : 7 (7 après déduplication) · écartées : 2
- Raisons des rejets : Accessoire (1), Stockage différent (1)
  - « Coque iPhone 13 » (FIXTURE woocommerce-store) : Accessoire détecté dans le titre (« coque ») : ce n'est pas le produit recherché
  - « Apple iPhone 13 256GB Bleu » (FIXTURE jsonld-public) : Stockage différent : 256GB au lieu de 128GB
- Meilleure offre : « Apple iPhone 13 128GB Noir » — prix 199,50 € · MOQ Non communiqué · disponibilité 17 unité(s) · source FIXTURE bigbuy (Fournisseur fictif (bigbuy)) · fraîcheur : récupérée à l'instant · score 68/100
  - Pourquoi : Meilleur prix du résultat ; Neuf ; MOQ non communiqué ; Fiabilité fournisseur inconnue

### 2. « iPhone 13 Pro 256 Go Grade A »

- Requête analysée : marque apple · modèle iphone 13 pro · stockage 256GB · grade A (type structured)
- Reformulations envoyées à chaque source (≤ 2) : « Apple iPhone 13 Pro 256GB Grade A », « iPhone 13 Pro 256 Go Grade A »
- Sources : 6 candidate(s), 6 interrogée(s)
  - FIXTURE jsonld-public (jsonld-public) : interrogée — 2 offre(s), 2 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE shopify-storefront (shopify-storefront) : interrogée — 2 offre(s), 6 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE woocommerce-store (woocommerce-store) : interrogée — 2 offre(s), 2 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE google-merchant-feed (google-merchant-feed) : interrogée — 0 offre(s), 2 requête(s) — 0 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE bigbuy (bigbuy) : interrogée — 0 offre(s), 0 requête(s) — 0 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE ingram-micro (ingram-micro) : interrogée — 1 offre(s), 4 requête(s) — 1 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
- Offres trouvées : 7 · conservées : 0 (0 après déduplication) · écartées : 7
- Raisons des rejets : Modèle différent (7), Stockage différent (5), Accessoire (1)
  - « Apple iPhone 13 128 Go Noir reconditionné » (FIXTURE woocommerce-store) : Modèle différent : iPhone 13 au lieu de iPhone 13 Pro ; Stockage différent : 128GB au lieu de 256GB
  - « Coque iPhone 13 » (FIXTURE woocommerce-store) : Accessoire détecté dans le titre (« coque ») : ce n'est pas le produit recherché ; Modèle différent : iPhone 13 au lieu de iPhone 13 Pro
  - « Apple iPhone 13 128GB Noir reconditionné Grade A » (FIXTURE jsonld-public) : Modèle différent : iPhone 13 au lieu de iPhone 13 Pro ; Stockage différent : 128GB au lieu de 256GB
  - « Apple iPhone 13 256GB Bleu » (FIXTURE jsonld-public) : Modèle différent : iPhone 13 au lieu de iPhone 13 Pro
  - « APPLE IPHONE 13 128GB BLACK » (FIXTURE ingram-micro) : Modèle différent : iPhone 13 au lieu de iPhone 13 Pro ; Stockage différent : 128GB au lieu de 256GB
  - « iPhone 13 128 Go reconditionné Noir » (FIXTURE shopify-storefront) : Modèle différent : iPhone 13 au lieu de iPhone 13 Pro ; Stockage différent : 128GB au lieu de 256GB
  - « iPhone 13 128 Go reconditionné Bleu » (FIXTURE shopify-storefront) : Modèle différent : iPhone 13 au lieu de iPhone 13 Pro ; Stockage différent : 128GB au lieu de 256GB
- Meilleure offre : **Aucune offre**

### 3. « iPhone 14 128 Go Grade A »

- Requête analysée : marque apple · modèle iphone 14 · stockage 128GB · grade A (type structured)
- Reformulations envoyées à chaque source (≤ 2) : « Apple iPhone 14 128GB Grade A », « iPhone 14 128 Go Grade A »
- Sources : 6 candidate(s), 6 interrogée(s)
  - FIXTURE jsonld-public (jsonld-public) : interrogée — 2 offre(s), 2 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE shopify-storefront (shopify-storefront) : interrogée — 2 offre(s), 6 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE woocommerce-store (woocommerce-store) : interrogée — 2 offre(s), 2 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE google-merchant-feed (google-merchant-feed) : interrogée — 0 offre(s), 2 requête(s) — 0 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE bigbuy (bigbuy) : interrogée — 0 offre(s), 0 requête(s) — 0 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE ingram-micro (ingram-micro) : interrogée — 1 offre(s), 4 requête(s) — 1 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
- Offres trouvées : 7 · conservées : 0 (0 après déduplication) · écartées : 7
- Raisons des rejets : Modèle différent (7), Accessoire (1), Stockage différent (1)
  - « Apple iPhone 13 128 Go Noir reconditionné » (FIXTURE woocommerce-store) : Modèle différent : iPhone 13 au lieu de iPhone 14
  - « Coque iPhone 13 » (FIXTURE woocommerce-store) : Accessoire détecté dans le titre (« coque ») : ce n'est pas le produit recherché ; Modèle différent : iPhone 13 au lieu de iPhone 14
  - « Apple iPhone 13 128GB Noir reconditionné Grade A » (FIXTURE jsonld-public) : Modèle différent : iPhone 13 au lieu de iPhone 14
  - « Apple iPhone 13 256GB Bleu » (FIXTURE jsonld-public) : Modèle différent : iPhone 13 au lieu de iPhone 14 ; Stockage différent : 256GB au lieu de 128GB
  - « APPLE IPHONE 13 128GB BLACK » (FIXTURE ingram-micro) : Modèle différent : iPhone 13 au lieu de iPhone 14
  - « iPhone 13 128 Go reconditionné Noir » (FIXTURE shopify-storefront) : Modèle différent : iPhone 13 au lieu de iPhone 14
  - « iPhone 13 128 Go reconditionné Bleu » (FIXTURE shopify-storefront) : Modèle différent : iPhone 13 au lieu de iPhone 14
- Meilleure offre : **Aucune offre**

### 4. « Samsung Galaxy S22 128 Go Grade A »

- Requête analysée : marque samsung · modèle galaxy s22 · stockage 128GB · grade A (type structured)
- Reformulations envoyées à chaque source (≤ 2) : « Samsung Galaxy S22 128GB Grade A », « Galaxy S22 128 Go Grade A »
- Sources : 6 candidate(s), 6 interrogée(s)
  - FIXTURE jsonld-public (jsonld-public) : interrogée — 2 offre(s), 2 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE shopify-storefront (shopify-storefront) : interrogée — 2 offre(s), 6 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE woocommerce-store (woocommerce-store) : interrogée — 2 offre(s), 2 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE google-merchant-feed (google-merchant-feed) : interrogée — 0 offre(s), 2 requête(s) — 0 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE bigbuy (bigbuy) : interrogée — 0 offre(s), 0 requête(s) — 0 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE ingram-micro (ingram-micro) : interrogée — 1 offre(s), 4 requête(s) — 1 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
- Offres trouvées : 7 · conservées : 0 (0 après déduplication) · écartées : 7
- Raisons des rejets : Marque différente (7), Modèle différent (7), Accessoire (1), Stockage différent (1)
  - « Apple iPhone 13 128 Go Noir reconditionné » (FIXTURE woocommerce-store) : Marque différente : apple au lieu de samsung ; Modèle différent : iPhone 13 au lieu de Galaxy S22
  - « Coque iPhone 13 » (FIXTURE woocommerce-store) : Accessoire détecté dans le titre (« coque ») : ce n'est pas le produit recherché ; Marque différente : apple au lieu de samsung ; Modèle différent : iPhone 13 au lieu de Galaxy S22
  - « Apple iPhone 13 128GB Noir reconditionné Grade A » (FIXTURE jsonld-public) : Marque différente : apple au lieu de samsung ; Modèle différent : iPhone 13 au lieu de Galaxy S22
  - « Apple iPhone 13 256GB Bleu » (FIXTURE jsonld-public) : Marque différente : apple au lieu de samsung ; Modèle différent : iPhone 13 au lieu de Galaxy S22 ; Stockage différent : 256GB au lieu de 128GB
  - « APPLE IPHONE 13 128GB BLACK » (FIXTURE ingram-micro) : Marque différente : apple au lieu de samsung ; Modèle différent : iPhone 13 au lieu de Galaxy S22
  - « iPhone 13 128 Go reconditionné Noir » (FIXTURE shopify-storefront) : Marque différente : apple au lieu de samsung ; Modèle différent : iPhone 13 au lieu de Galaxy S22
  - « iPhone 13 128 Go reconditionné Bleu » (FIXTURE shopify-storefront) : Marque différente : apple au lieu de samsung ; Modèle différent : iPhone 13 au lieu de Galaxy S22
- Meilleure offre : **Aucune offre**

### 5. « Samsung Galaxy S23 256 Go Grade A »

- Requête analysée : marque samsung · modèle galaxy s23 · stockage 256GB · grade A (type structured)
- Reformulations envoyées à chaque source (≤ 2) : « Samsung Galaxy S23 256GB Grade A », « Galaxy S23 256 Go Grade A »
- Sources : 6 candidate(s), 6 interrogée(s)
  - FIXTURE jsonld-public (jsonld-public) : interrogée — 2 offre(s), 2 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE shopify-storefront (shopify-storefront) : interrogée — 2 offre(s), 6 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE woocommerce-store (woocommerce-store) : interrogée — 2 offre(s), 2 requête(s) — 2 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE google-merchant-feed (google-merchant-feed) : interrogée — 1 offre(s), 2 requête(s) — 1 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE bigbuy (bigbuy) : interrogée — 1 offre(s), 0 requête(s) — 1 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
  - FIXTURE ingram-micro (ingram-micro) : interrogée — 1 offre(s), 4 requête(s) — 1 offre(s) trouvée(s), 0 enregistrée(s), 0 rejetée(s) · 2 reformulations.
- Offres trouvées : 9 · conservées : 2 (2 après déduplication) · écartées : 7
- Raisons des rejets : Marque différente (7), Modèle différent (7), Stockage différent (5), Accessoire (1)
  - « Apple iPhone 13 128 Go Noir reconditionné » (FIXTURE woocommerce-store) : Marque différente : apple au lieu de samsung ; Modèle différent : iPhone 13 au lieu de Galaxy S23 ; Stockage différent : 128GB au lieu de 256GB
  - « Coque iPhone 13 » (FIXTURE woocommerce-store) : Accessoire détecté dans le titre (« coque ») : ce n'est pas le produit recherché ; Marque différente : apple au lieu de samsung ; Modèle différent : iPhone 13 au lieu de Galaxy S23
  - « Apple iPhone 13 128GB Noir reconditionné Grade A » (FIXTURE jsonld-public) : Marque différente : apple au lieu de samsung ; Modèle différent : iPhone 13 au lieu de Galaxy S23 ; Stockage différent : 128GB au lieu de 256GB
  - « Apple iPhone 13 256GB Bleu » (FIXTURE jsonld-public) : Marque différente : apple au lieu de samsung ; Modèle différent : iPhone 13 au lieu de Galaxy S23
  - « APPLE IPHONE 13 128GB BLACK » (FIXTURE ingram-micro) : Marque différente : apple au lieu de samsung ; Modèle différent : iPhone 13 au lieu de Galaxy S23 ; Stockage différent : 128GB au lieu de 256GB
  - « iPhone 13 128 Go reconditionné Noir » (FIXTURE shopify-storefront) : Marque différente : apple au lieu de samsung ; Modèle différent : iPhone 13 au lieu de Galaxy S23 ; Stockage différent : 128GB au lieu de 256GB
  - « iPhone 13 128 Go reconditionné Bleu » (FIXTURE shopify-storefront) : Marque différente : apple au lieu de samsung ; Modèle différent : iPhone 13 au lieu de Galaxy S23 ; Stockage différent : 128GB au lieu de 256GB
- Meilleure offre : « Samsung Galaxy S23 256GB Noir » — prix 410,00 € · MOQ Non communiqué · disponibilité rupture de stock · source FIXTURE bigbuy (Fournisseur fictif (bigbuy)) · fraîcheur : récupérée à l'instant · score 63/100
  - Pourquoi : Rupture de stock annoncée par la source : classée après les offres disponibles ; Meilleur prix du résultat ; Neuf ; MOQ non communiqué
