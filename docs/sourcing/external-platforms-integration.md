# Plateformes externes de sourcing B2B — architecture d'intégration proposée

> **PROPOSITION — rien n'est implémenté.** Ce document décrit comment les candidats retenus pourraient entrer dans MON STOCK. Aucun code, aucune migration, aucune configuration n'a été modifié. Chaque chantier attend la **validation de l'utilisateur**, et la plupart attendent aussi un accès réel chez le fournisseur ([plan de test](external-platforms-test-plan.md)).

Étude du 15/10/2026. Base : audit du code en lecture seule ([mon_stock_architecture_audit.md](../../research_notes/Plateformes%20externes%20sourcing%20B2B/mon_stock_architecture_audit.md)) et [rapport de synthèse](../../reports/Plateformes%20externes%20sourcing%20B2B.md). Voir aussi : [étude détaillée](external-platforms-report.md), [comparatif](external-platforms-comparison.md), [architecture de collecte existante](collection-architecture.md), [migration hebdomadaire](weekly-collection-migration.md).

---

## En bref

| Voie | Code à écrire | Candidats | Statut |
|---|---|---|---|
| **A. Zéro code** : import de fichier ou flux distant | Aucun | Foxway (Excel), DistriHUB (flux filtré), ThePhoneHub (CSV), 2Service (liste e-mail) | Utilisable dès qu'un accès existe |
| **B. Un adaptateur « account » générique** pour API | Un dossier + une ligne de registre + une route Edge | Foneday (clé), API Foxway, ITscope ; Ingram existe déjà | Proposition |
| **C. Places de marché multi-vendeurs** | Champ vendeur + résolution du fournisseur par offre + migration | Callisto, Merkandi, gsmExchange (si un flux est un jour autorisé) | Proposition, à n'engager que si Callisto ouvre un flux |

---

## 1. Architecture actuelle (rappel)

### 1.1 Bibliothèque de sources et adaptateurs

| Élément | Rôle | Fichier |
|---|---|---|
| Contrat d'adaptateur | Un dossier par adaptateur (`crawler.ts`, `parser.ts`, `mapper.ts`, `index.ts`) ; `search()` obligatoire, `fetchCatalog()` paginé par curseur facultatif, `testConnection()` ; règles : API/flux officiels ou compte connecté, champ manquant → `null`, provenance gardée | [core.ts](../../src/integrations/sourcing/core.ts) |
| Registre | `SOURCE_ADAPTERS` : jsonld, shopify, woocommerce, google-merchant-feed, **bigbuy**, **ingram-micro**, ebay-browse, sitemap-jsonld. Un adaptateur absent du tableau n'apparaît jamais dans l'UI | [registry.ts](../../src/integrations/sourcing/registry.ts) |
| Connecteurs fournisseurs | `SUPPLIER_CONNECTORS = listAccountAdapters().map(toDescriptor)` : tout adaptateur `access: "account"` devient automatiquement un connecteur (identifiants, test, synchronisation) | [suppliers/core.ts](../../src/integrations/suppliers/core.ts) |
| Bibliothèque de sources | Liste figée de boutiques publiques vérifiées (≈ 30 entrées) ; activation après contrôle « ok » et attestation ; Utopya marqué `blocked` | [source-library.ts](../../src/services/sourcing/source-library.ts) |
| `PARTNER_FEED` | Simple emplacement réservé (SFTP / EDI / HTTPS), `implemented = false` | [partner-feed.ts](../../src/integrations/suppliers/partner-feed.ts) |

**La bibliothèque n'est pas le bon point d'entrée** pour une plateforme à identifiants : son type `adapter` est une union fermée de 4 adaptateurs publics, et l'activation force `source_type` à `API` ou `PUBLIC_WEB`. Les voies « connecteur » et « flux distant » font déjà le travail.

### 1.2 Voies d'ingestion existantes

| Voie | Entrée | Sécurité | Limites | Fichier |
|---|---|---|---|---|
| **Import de fichier** | CSV, XLSX, XML, JSON ≤ 15 Mo ; mapping mémorisé par (fournisseur, signature d'en-tête) ; anti-doublon SHA-256 ; mode `partial` par défaut | Session utilisateur | Manuel | [catalog-import.ts](../../src/services/sourcing/catalog-import.ts) |
| **Flux distant autorisé** | URL HTTPS publique ; CSV/XML/JSON ; `auth` = none / en-tête / Basic ; `rootPath` ; mapping ; `mode` snapshot ou partial ; fréquence manual / hourly / every_6_hours / daily ; **attestation obligatoire** | Auth chiffrée dans `supplier_feed_secrets` ; en-têtes interdits (host, cookie…) | 5 000 lignes / exécution, 50 000 analysées, 20 Mo par réponse ; pas de pagination ni d'OAuth | [remote-feeds.ts](../../src/services/sourcing/remote-feeds.ts), [feed-secrets.ts](../../src/services/sourcing/feed-secrets.ts), [feed-ingestion.ts](../../src/services/sourcing/feed-ingestion.ts) |
| **Connexion « account »** | Adaptateur à identifiants ; `syncSupplierConnection` : déchiffrement → pages `fetchCatalog` (20 max, plafond 200) → `storeOffer` → expiration → `finishSyncRun` | Identifiants chiffrés dans `supplier_connection_secrets` | 20 pages, pas de curseur persistant, pas de quarantaine, pas de dédoublonnage dans la page | [supplier-connectors.ts](../../src/services/sourcing/supplier-connectors.ts) |
| **Collecte hebdomadaire** | Sources `PUBLIC_WEB` à adaptateur public ; tranches, curseur, verrou, reprise | — | **Migration non appliquée** | [weekly-collection.ts](../../src/services/sourcing/weekly-collection.ts) |

Exposition mobile : `POST /api/sourcing/feeds/preview`, `POST /api/sourcing/feeds`, `/sourcing/import`, `/sourcing/sources/sync|schedule` existent dans l'Edge Function ([api.ts](../../server/edge/api.ts)). **La création d'une connexion « account » n'existe que comme action serveur Next.js** ([actions.ts](../../src/features/suppliers/actions.ts)), sans route Edge.

### 1.3 `storeOffer`, historique, stock

- `storeOffer` est le **seul chemin d'écriture** (flux, fichiers, connexions, crawler, collecte hebdomadaire, recherche en direct). Upsert sur `UNIQUE (organization_id, source_id, external_offer_id)` ([offer-storage.ts](../../src/services/sourcing/offer-storage.ts), [migration](../../supabase/migrations/20261007000400_suppliers_sourcing.sql)).
- `StorageContext` porte **un `supplierId` fixe pour toute l'exécution** ; `sourcing_offers.supplier_id` est NOT NULL.
- Historique prix et stock écrit par le trigger `record_offer_history`, seulement quand la valeur change.
- Stock inconnu reste inconnu ; une absence ne crée jamais de rupture. Une offre qui réapparaît est réactivée.
- Provenance : `withProvenance` → `{adapter, method, retrieved_at, request_url, source_url}` + payload ≤ 8 000 caractères ([adapter-runtime.ts](../../src/services/sourcing/adapter-runtime.ts)).

### 1.4 Collecte hebdomadaire et expiration

| Chemin | Règle d'expiration | Fichier |
|---|---|---|
| Flux distant (snapshot) | **Immédiate** après une exécution complète non tronquée | [feed-ingestion.ts](../../src/services/sourcing/feed-ingestion.ts) (L250-L252) |
| Connexion « account » | **Immédiate** si `stored > 0 && !truncated` | [supplier-connectors.ts](../../src/services/sourcing/supplier-connectors.ts) (L201) |
| Crawler ponctuel | **Immédiate** après passage complet sans erreur | [crawler-manager.ts](../../src/services/sourcing/crawler/crawler-manager.ts) |
| Collecte hebdomadaire `PUBLIC_WEB` | Après **2 collectes complètes** sans l'offre (`sourcing_close_full_collection`) | [migration en attente](../../supabase/pending/20261014000100_sourcing_weekly_collection.sql) — **non appliquée** |

`src/db/database.types.ts` contient déjà les colonnes de la migration en attente : du code qui s'en servirait compilerait mais échouerait à l'exécution tant que la migration n'est pas appliquée.

### 1.5 Normalisation, devises, TVA

- `normalizeProduct(title, hints)` : marque, modèle, capacité, couleur, état, grade ; les indices explicites du parseur priment ; inconnu → `null` ([normalizer.ts](../../src/domain/sourcing/normalizer.ts)).
- Devise : `raw.currency ?? ctx.defaultCurrency` ; sans devise → rejet. Conversion BCE quotidienne ; `fx_rate` reste `null` si le taux manque, jamais inventé ([fx-rates.ts](../../src/services/sourcing/fx-rates.ts)).
- `tax_type` : offre, sinon défaut de la source, sinon `unknown` ; jamais deviné. Colonne `vat_regime` disponible ([migration B2B](../../supabase/migrations/20261013000100_sourcing_b2b.sql)).
- Quarantaine qualité (`assessImportQuality`) **sur la voie flux seulement** ([feed-ingestion.ts](../../src/services/sourcing/feed-ingestion.ts), [import-quality.ts](../../src/domain/sourcing/import-quality.ts)).

### 1.6 Analyse des bonnes affaires et radar

- Deux groupes de comparables : annonces de place de marché (≥ 3) et prix des **autres** fournisseurs (≥ 2), où `c.supplierId !== offer.supplierId` ([deal-analysis.ts](../../src/domain/sourcing/deal-analysis.ts) L387-L403).
- Une source est « place de marché » si `config.adapter === "ebay-browse" || config.kind === "marketplace"` ([simple-search.ts](../../src/services/sourcing/simple-search.ts) L130-L134).
- Dédoublonnage : une offre par (fournisseur, produit normalisé) ([dedupe.ts](../../src/domain/sourcing/dedupe.ts)).
- Radar : origine du prix par `source_type` (`CSV/XML/JSON/SUPPLIER_ACCOUNT` → « communiqué par le fournisseur »), fraîcheur `FRESH_DAYS = 2`, `STALE_DAYS = 7`, fiabilité par `supplier_id` ([radar.ts services](../../src/services/radar/radar.ts), [radar.ts domaine](../../src/domain/sourcing/radar.ts)).

### 1.7 Rapprochement EAN / MPN

- Chaque offre reçoit un `normalized_product_id` ; lien automatique à un SKU interne sur **EAN ou MPN exact** (`autoConfirmExact: true`), sinon suggestion à confirmer ([matching-service.ts](../../src/services/sourcing/matching-service.ts), [offer-linking.ts](../../src/services/sourcing/offer-linking.ts)).
- Une source qui fournit l'EAN obtient le rapprochement automatique ; une source à titres seuls dépend du normaliseur.

### 1.8 Sécurité

| Point | État | Fichier |
|---|---|---|
| Isolation | RLS par organisation sur toutes les tables de sourcing ; écritures de journaux, connexions, imports et secrets réservées au serveur | [rls.sql](../../supabase/migrations/20261007000700_rls.sql) |
| Secrets | AES-256-GCM (`TOKEN_ENCRYPTION_KEY`), tables `supplier_connection_secrets` et `supplier_feed_secrets` sans politique RLS, privilèges révoqués | [crypto.ts](../../src/lib/crypto.ts), [migration B2B](../../supabase/migrations/20261013000100_sourcing_b2b.sql) |
| Cron | `Bearer CRON_SECRET`, comparaison en temps constant | [cron-auth.ts](../../src/lib/cron-auth.ts) |
| SSRF | HTTPS public, adresse résolue publique, revérifiée à chaque redirection | [http.ts](../../src/services/sourcing/http.ts) |
| Mobile | Aucune clé serveur : URL Supabase, clé anon / publishable, URL d'API seulement | [supabase.ts mobile](../../apps/mobile/src/lib/supabase.ts) |

---

## 2. Voie A — zéro code : import de fichier ou flux distant

### 2.1 Correspondance candidats → voie

| Candidat | Voie | Réglages proposés | Prérequis |
|---|---|---|---|
| **Foxway** (stocklist Excel) | Import de fichier | Mode `partial` tant que l'export n'est pas garanti complet ; défaut `tax_type = ht` (prix HT CONFIRMÉ) ; `vat_regime` mappé si une colonne « VAT Margin » existe ; identifiant d'offre stable exigé | Compte revendeur ; vérifier la stabilité des identifiants d'un export à l'autre ([b2b-profiles.ts](../../src/services/sourcing/data/b2b-profiles.ts)) |
| **Foxway** (feuilles « take-all ») | Import de fichier | Marquer ces lignes comme **lots** (grade mixte) : elles ne doivent pas entrer en comparaison unitaire | Idem |
| **DistriHUB** | Flux distant | Flux **filtré** (smartphones / Apple) **sous 5 000 lignes** ; `auth = header` ; `mode = snapshot` seulement après un test complet ; mapping EAN → `ean` | Compte acheteur vérifié ; identité confirmée |
| **ThePhoneHub** (CSV Live Link) | Flux distant | `auth = header` si un jeton par partenaire est fourni ; sinon vérifier que le lien n'est pas public | Contact commercial |
| **2Service** (liste par e-mail) | Import de fichier | Mode `partial` | Compte dealer |
| **Callisto** (si un export est autorisé) | Import de fichier | **Un fichier par vendeur** tant que la voie C n'existe pas (voir §4) | Autorisation écrite de Callisto |

Ce que la voie A réutilise sans changement : quarantaine qualité, historique, devises, normalisation, rapprochement, analyse des bonnes affaires, étiquette radar « communiqué par le fournisseur ».

### 2.2 Points d'attention (constatés dans le code)

| Point | Effet | Proposition |
|---|---|---|
| **Jeton dans l'URL** (`?key=…`) | Stocké en clair dans `supplier_feeds.url` | Exiger l'en-tête ; **proposer** un refus des URL contenant `key`, `token`, `apikey`, `secret` en paramètre dans la validation de [remote-feeds.ts](../../src/services/sourcing/remote-feeds.ts) |
| **5 000 lignes / exécution** | Au-delà, exécution tronquée et **plus aucune expiration** | Demander un flux filtré ; à défaut, plusieurs flux par catégorie |
| **Expiration immédiate** en snapshot | Un export partiel « réussi » peut expirer tout un catalogue ; la quarantaine limite ce risque | Rester en `partial` jusqu'à ce que le test J0 / J+1 / J+7 montre un export stable |
| **Fréquence `weekly`** absente à la création d'un flux | Seulement réglable après coup via `setSourceSchedule` ([source-sync.ts](../../src/services/sourcing/source-sync.ts)) | Créer en `daily`, puis ajuster |
| **`runDueFeeds`** appelle `ingestFeed` sans `mode` | Défaut snapshot ; aucun appelant trouvé hors du fichier, le chemin actif (`runScheduledSources`) passe le mode | Aucun effet aujourd'hui ; à corriger si la fonction est réutilisée |

---

## 3. Voie B — un adaptateur « account » générique et réutilisable

### 3.1 Principe

Un **seul** adaptateur `access: "account"` pour les API REST JSON paginées, qui réutilise le mapping des flux (`parseFeedContent` / `mapRow` de [feed-parsers.ts](../../src/services/sourcing/feed-parsers.ts)) à l'intérieur de `fetchCatalog`. Un même code servirait plusieurs fournisseurs, configurés et non programmés. C'est une inférence de l'audit : **cet adaptateur n'existe pas**.

### 3.2 Ce qu'il faudrait ajouter, et où (proposition)

| # | Ajout | Emplacement | Détail |
|---|---|---|---|
| 1 | Dossier d'adaptateur générique | `src/integrations/sourcing/generic-account-api/` (`crawler.ts`, `parser.ts`, `mapper.ts`, `index.ts`) | `credentialFields` : clé API (ou client_id / secret OAuth) ; `configFields` : URL de base, nom de l'en-tête d'auth, paramètre de page ou chemin du lien « suivant », `rootPath`, mapping ; `fetchCatalog` paginé ; `search` = filtre d'un index en cache (modèle BigBuy) ; `testConnection` |
| 2 | Enregistrement | Une ligne dans `SOURCE_ADAPTERS` ([registry.ts](../../src/integrations/sourcing/registry.ts)) | Le connecteur, le stockage des identifiants, la synchronisation planifiée et la recherche en direct suivent automatiquement |
| 3 | Route Edge de création de connexion | `POST /sourcing/connections` dans [api.ts](../../server/edge/api.ts), qui enveloppe `createSupplierConnection` + `testSupplierConnection` | Permet de brancher Foneday ou une API Foxway **depuis le mobile** ; la clé est envoyée une fois puis chiffrée côté serveur. Seul chantier recommandé dès maintenant ([rapport](external-platforms-report.md#6-conclusion--huit-réponses-pour-décider), point 8) |
| 4 | Quarantaine sur la voie « account » | [supplier-connectors.ts](../../src/services/sourcing/supplier-connectors.ts) | Réutiliser `assessImportQuality` avant toute expiration |
| 5 | Dédoublonnage dans la page | Idem | Par `externalOfferId`, comme la collecte hebdomadaire |
| 6 | Curseur persistant ou collecte hebdomadaire élargie | [weekly-collection.ts](../../src/services/sourcing/weekly-collection.ts) | Après application de la migration en attente : accepter `SUPPLIER_ACCOUNT` et les adaptateurs « account », charger les identifiants, sauter robots.txt pour `official_api`, remplacer le `sourceType: "PUBLIC_WEB"` codé en dur (L204). Corrige aussi la troncature à 20 pages |

### 3.3 Application aux candidats

| Candidat | Adaptateur | Ce qui manque avant d'écrire le code | Contraintes connues |
|---|---|---|---|
| **Foneday** | Générique (clé API en en-tête) | Endpoints, format, limites de débit, champs (EAN, qualité OLED / Incell), CGU d'usage dans un logiciel tiers | API par clé client CONFIRMÉE en pratique, non documentée |
| **Foxway (API)** | Générique, ou voie A si l'API est un export unique | Existence réelle, documentation, authentification, fréquence autorisée | « Need a customized API? » CONFIRMÉ ; formats ANNONCÉS par un tiers |
| **ITscope** | Générique ou dédié (XML / JSON, « Company Key ») | Comptes distributeurs approuvés ; cumul Essential + API | **5 000 appels / mois** (≈ 166 / jour) : synchronisation en différé seulement, **pas de recherche en direct** |
| **Ingram Micro** | **Existe** ([ingram-micro](../../src/integrations/sourcing/ingram-micro/index.ts)) | Compte Ingram actif et approbation API | En-tête `IM-CountryCode`, OAuth, v6 |
| **MobileSentrix EU** | Aucun pour l'instant | Partenariat (API gérée par RepairDesk et MyRepairApp) | Continuer la lecture publique actuelle |

---

## 4. Voie C — places de marché multi-vendeurs

### 4.1 Le problème « un fournisseur par source »

Branchée comme **un seul fournisseur**, une place de marché (Callisto, Merkandi, gsmExchange) ou un agrégateur de distributeurs (ITscope, Stock in the Channel) :

| Conséquence | Mécanisme | Fichier |
|---|---|---|
| Aucune comparaison entre ses propres vendeurs | Le groupe « autres fournisseurs » exclut le même `supplier_id` | [deal-analysis.ts](../../src/domain/sourcing/deal-analysis.ts) L390 |
| Deux vendeurs du même produit fusionnés dans la recherche | Une offre par (fournisseur, produit) | [dedupe.ts](../../src/domain/sourcing/dedupe.ts) |
| Deux vendeurs du même SKU qui s'écrasent | Upsert sur (organisation, source, `external_offer_id`) si l'identifiant n'inclut pas le vendeur | [offer-storage.ts](../../src/services/sourcing/offer-storage.ts) |
| Scores de fiabilité et historique de commandes mélangés | Radar calculé par `supplier_id` | [radar.ts](../../src/services/radar/radar.ts) |
| `config.kind = "marketplace"` n'est **pas** une solution | Les offres basculeraient dans le groupe « prix de place de marché » de toute l'organisation, ce qui fausse les niveaux | [simple-search.ts](../../src/services/sourcing/simple-search.ts) |

Foxway, Foneday, ThePhoneHub et probablement DistriHUB (s'il vend en son nom) ne posent pas ce problème.

### 4.2 Options

| Option | Changement | Avantages | Inconvénients |
|---|---|---|---|
| 1. Un fournisseur par plateforme | Aucun | Simple | Défauts du §4.1 |
| 2. **Un fournisseur par vendeur, résolu offre par offre** (proposée) | Champ vendeur + résolution du fournisseur + migration | Comparaisons justes, source et expiration inchangées | Code et migration |
| 3. Une source par vendeur | Aucun code | Immédiat | N sources, N exécutions et N appels vers un même hôte : contraire à la politesse par hôte et au verrou par source |

### 4.3 Conception proposée (option 2)

1. **Champ vendeur dans `RawOffer`** : `sellerExternalId` et `sellerName`, ajoutés à `RAW_OFFER_FIELDS` ([types.ts](../../src/domain/sourcing/types.ts)) pour être mappables dans les flux et les fichiers. Aujourd'hui il n'existe **aucun** champ vendeur.
2. **`resolveSupplierId(offer)` dans `StorageContext`** ([offer-storage.ts](../../src/services/sourcing/offer-storage.ts)) : trouve ou crée la ligne `suppliers` du vendeur à partir d'une clé propre à la plateforme (`<plateforme>:<id vendeur>`). Sans vendeur, on garde le `supplierId` du contexte.
3. **Migration à écrire** (proposition) : une référence externe sur `suppliers` (par ex. `external_ref` + unicité par organisation) pour retrouver un vendeur sans doublon. À vérifier sur une base de test avant toute application.
4. **`external_offer_id = <id vendeur>:<id offre>`** pour éviter tout écrasement.
5. **Inchangés** : `source_id` et la clé d'unicité restent ceux de la plateforme ; l'expiration reste par source ; `supplier_sources.supplier_id` continue de pointer vers la plateforme (l'écran source montrera la plateforme, pas le vendeur).
6. **Pas de `config.kind = "marketplace"`** sur une plateforme B2B de gros.

À n'engager **que si Callisto (ou une autre place de marché) autorise par écrit un export ou un flux**.

### 4.4 Alignement des règles d'expiration

| Problème | Proposition |
|---|---|
| Deux règles coexistent (immédiate / 2 collectes) | Après application de la migration hebdomadaire, appliquer la règle des **2 collectes complètes** aux flux distants et aux connexions « account », en généralisant `sourcing_close_full_collection` |
| Connexion « account » sans quarantaine | Voir §3.2, ligne 4 |
| Radar : « ancienne » après 7 jours | Pour une source hebdomadaire, soit synchroniser au moins tous les 6 jours, soit rendre le seuil dépendant de la fréquence déclarée de la source |

### 4.5 Limites de volume

| Limite | Valeur | Impact | Proposition |
|---|---|---|---|
| Flux distant | 5 000 lignes / exécution, 50 000 analysées, 20 Mo | DistriHUB annonce 1 M de références | Flux filtré exigé |
| Connexion « account » | 20 pages par synchronisation, sans curseur | Gros catalogue toujours tronqué, jamais expiré | Curseur persistant (§3.2, ligne 6) |
| Quota ITscope | 5 000 appels / mois | La recherche en direct l'épuiserait | Synchronisation différée seulement |

---

## 5. Secrets et droits sur les données

### 5.1 Clés côté serveur uniquement

- Toute clé de plateforme se stocke comme celles de BigBuy (`supplier_connection_secrets`) ou comme un en-tête de flux (`supplier_feed_secrets`) : **aucune nouvelle table de secrets** n'est nécessaire.
- Le mobile n'envoie la clé **qu'une fois**, à une route Edge qui la chiffre. Elle n'est jamais renvoyée au client ni journalisée.
- Jamais de jeton dans une URL (§2.2).

### 5.2 Vérifications de droits avant tout stockage

| Vérification | Avant quoi | Où la tracer (proposition) |
|---|---|---|
| CGU lues : stockage autorisé, durée de conservation, fréquence de synchronisation, affichage dans un logiciel tiers | Activation de la source | Attestation existante (`access_conditions`, obligatoire sur les flux) + URL des CGU + date |
| **Autorisation écrite** du fournisseur quand les CGU ne disent rien (Foxway, Callisto, Merkandi, Foneday, DistriHUB) | Toute synchronisation automatique | Référence de l'e-mail ou du contrat dans `access_conditions` |
| Interdiction explicite (B-Stock, Liquidity Services, Utopya) | — | `blocked` dans la bibliothèque (déjà le cas pour Utopya) ; aucune voie automatisée |
| Licence des données de revente (eBay : copies « as necessary », pas de mélange affiché avec du non-eBay ; Keepa : redistribution inconnue) | Ajout d'une source de prix de marché | Cache court et agrégats plutôt qu'historique durable, à confirmer sur le texte de licence actuel |
| Données de vendeurs particuliers (RGPD) | Toute source C2C | Hors périmètre de cette étude |

---

## 6. Ordre de mise en œuvre proposé (si validé)

| Étape | Condition de départ | Contenu |
|---|---|---|
| 0 | Validation de l'utilisateur | Rien n'est fait avant |
| 1 | Accès Foxway obtenu | Import de l'export Excel dans une **organisation de test** (voie A) ; mesures du [plan de test](external-platforms-test-plan.md) |
| 2 | Échantillon DistriHUB / ThePhoneHub | Flux distant filtré, en `partial`, organisation de test |
| 3 | Clé Foneday ou API Foxway documentée | Route Edge `POST /sourcing/connections`, puis adaptateur générique (voie B) |
| 4 | Migration hebdomadaire appliquée | Alignement des règles d'expiration ; quarantaine et curseur sur la voie « account » |
| 5 | Callisto autorise un export ou un flux | Voie C (champ vendeur, résolution du fournisseur, migration) |
