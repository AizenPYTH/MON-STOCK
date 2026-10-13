# Architecture de collecte hebdomadaire — MON STOCK

État au 13/10/2026. Proposition fondée sur l'audit du dépôt (branche `claude/laughing-bardeen-bdn16j`) et de la base de production `ccywsegdowikeirbsfae` (lecture seule). **Aucune modification n'a été faite pour cette étape.**

## 1. Ce qui existe déjà et sera réutilisé

| Besoin du cahier des charges | Existant | Fichiers / tables |
| --- | --- | --- |
| Registre des fournisseurs | `suppliers` + `supplier_sources` (méthode, pays, devise, HT/TTC, statut, fréquence, `next_run_at`, `consecutive_failures`, `last_successful_sync_at`, `last_error`) | migrations `20261007000400`, `20261013000100` |
| Annuaire de fournisseurs (hors compte) | 123 fiches JSON + vérification serveur quotidienne de joignabilité | `src/services/sourcing/data/supplier-directory.json`, table `supplier_directory_checks` (cron 05:41 UTC) |
| Bibliothèque de sources publiques | 14 sources, test de recherche réel quotidien avec prix relevés | `source-library.ts`, table `sourcing_library_checks` (cron 04:23 UTC) |
| Connecteurs individuels | adaptateurs `shopify-storefront`, `woocommerce-store`, `jsonld-public`, `sitemap-jsonld`, `google-merchant-feed`, `bigbuy` (API), `ingram-micro` (API), `ebay-browse` (API officielle) ; connecteur `partner-feed` ; flux distants CSV/XML/JSON ; import de fichier CSV/XLSX/XML/JSON | `src/integrations/sourcing/*`, `src/integrations/suppliers/*`, `remote-feeds.ts`, `catalog-import.ts` |
| Pagination / curseur | `fetchCatalog(config, cursor)` sur Shopify, WooCommerce, BigBuy, Ingram, Google Merchant | `src/integrations/sourcing/core.ts` |
| Politesse et légalité | robots.txt vérifié avant chaque collecte, une requête à la fois par hôte (`HostScheduler`), délai minimal, protection SSRF, taille et durée bornées, attestation des conditions d'utilisation avant activation | `crawler/robots.ts`, `adapter-runtime.ts`, `http.ts` |
| Secrets | identifiants chiffrés AES-256-GCM, lisibles par le seul serveur | `supplier_connection_secrets`, `supplier_feed_secrets`, `TOKEN_ENCRYPTION_KEY` |
| Exécutions et erreurs | `sync_runs` (verrou : une seule exécution `running` par source), `sync_errors`, `sourcing_import_jobs`, `sourcing_import_issues` | |
| Reprise après échec | backoff 15 min → 24 h, alerte après 3 échecs, une erreur n'efface aucune offre | `source-health.ts`, `domain/sourcing/schedule.ts` |
| Offres et historique | `sourcing_offers` (prix et devise d'origine, prix normalisé, taux BCE, HT/TTC, quantité, statut de stock, grade, port, source exacte, `last_seen_at`) ; historique par trigger `supplier_price_history`, `supplier_stock_history` (jamais écrasé) | `offer-storage.ts` |
| Correspondance produits | EAN → MPN → SKU fournisseur → attributs (marque, modèle, capacité, couleur, état, grade) → texte ; le texte n'est **jamais** confirmé automatiquement ; écran de validation | `domain/sourcing/matching.ts`, `product_matches`, `offer-linking.ts`, écran « Correspondances » |
| Alertes / baisses de prix | `sourcing_alerts` + `sourcing_alert_events` | `alerts.ts` |
| Interface | onglet « Fournisseurs » (recherche simple), « Mes sources », historique des imports, annuaire, radar, correspondances | `apps/mobile/src/app/(app)/…` |

## 2. Écarts constatés (à combler)

1. **Pas de fréquence hebdomadaire** : `sync_frequency` ∈ manuel / horaire / 6 h / quotidien. Il faut `weekly` + jour et heure configurables.
2. **Collecte longue impossible d'un seul tenant** : l'Edge Function est limitée (~150 s). Un catalogue de plusieurs milliers de produits doit être collecté **par tranches**, avec un curseur persistant repris au passage suivant du cron.
3. **Disparition trop rapide** : en mode « catalogue complet », une offre absente d'une seule collecte passe en « expirée ». Le cahier des charges demande une vérification suffisante : ne marquer « absente » qu'après **2 collectes complètes réussies** sans la voir, jamais après une collecte en erreur ou tronquée.
4. **Sources « recherche directe » (sitemap-jsonld)** : aujourd'hui interrogées uniquement à la recherche. Pour la collecte hebdomadaire il faut un mode catalogue : parcourir le plan du site par lots, en respectant robots.txt et le délai.
5. **Pas de vue « nouveautés / baisses depuis la dernière collecte »** ni de journal de collecte par fournisseur dans l'application.
6. **Annuaire et registre séparés** : l'annuaire (JSON) n'est pas relié aux sources. Il faut un identifiant d'annuaire sur `supplier_sources` (déjà partiellement présent via `config.library_key`).

## 3. Architecture proposée

### 3.1 Registre (sans nouvelle table)

`supplier_sources` reste le registre. Ajouts de colonnes :

- `schedule_weekday` (0–6), `schedule_hour_utc` (0–23) ;
- `directory_key` ;
- `collect_cursor jsonb` : curseur de reprise (page, URL du plan du site, horodatage de début de collecte) ;
- `last_full_collection_at` : dernière collecte **complète** ;
- `last_collection_stats jsonb` : produits trouvés, prix mis à jour, nouveaux, baisses.

Fréquence : ajout de `weekly` à la contrainte `sync_frequency`.

### 3.2 Collecte par tranches (résumable)

Chaque passage du cron (toutes les 15 min pendant la fenêtre de collecte) appelle `runScheduledSources` :

1. Une source dont l'échéance est atteinte démarre une collecte (`sync_runs` en `running`) et enregistre `collect_cursor = { startedAt, cursor: null }`.
2. Chaque passage traite au plus N pages (budget de 100 s), enregistre les offres, met à jour le curseur, libère le verrou.
3. Le dernier lot marque la collecte complète, applique la règle de disparition (2 collectes complètes), calcule les statistiques, programme la semaine suivante.
4. Une erreur garde le curseur. La reprise se fait au même endroit au passage suivant, avec backoff, sans toucher aux offres.

Limites : au plus 1 requête simultanée par hôte, délai ≥ `crawl-delay` de robots.txt (minimum 2 s), au plus 3 sources en parallèle par passage, plafond de pages par semaine et par source.

### 3.3 Connecteurs : ordre de préférence

1. API officielle documentée (eBay Browse, BigBuy, Ingram Micro — déjà écrits ; Mouser, TME, Farnell… à écrire selon leur documentation) ;
2. flux autorisé CSV/XML/JSON (déjà : « Ajouter un flux autorisé ») ;
3. export de catalogue (déjà : import de fichier avec mapping mémorisé) ;
4. lecture du catalogue public lorsque robots.txt et les conditions le permettent (Shopify `products.json`, WooCommerce Store API, JSON-LD) ;
5. navigation avec session : **non proposée** pour l'instant (comptes à créer par l'utilisateur, conditions à vérifier une par une, risque de contournement) ;
6. import manuel.

Un connecteur = un adaptateur testé sur fixtures **et** déclaré « opérationnel » seulement après une collecte réelle réussie (`sourcing_library_checks` / `sync_runs`).

### 3.4 Données

- Pas de nouvelle table d'offres : `sourcing_offers` + historiques existants.
- `sourcing_offers` reçoit `missing_since` et `missed_collections` pour la règle de disparition.
- Exécutions : `sync_runs.stats` enrichi (pages, produits, prix modifiés, nouveaux, baisses ≥ 10 %).

### 3.5 Interface (écrans existants)

- **Fournisseurs** (onglet) : recherche simple (fait) + filtre par catégorie.
- **Mes sources** : liste filtrable (catégorie, pays, méthode, statut), fiche fournisseur, dernière collecte, bouton « Collecter maintenant », erreurs.
- **Nouveautés de la semaine** : nouvelles offres, baisses importantes, offres moins chères par produit.
- **Correspondances** : écran existant pour valider les rapprochements ambigus.

### 3.6 Sécurité et conformité

- Activation d'une source publique seulement après attestation de l'utilisateur ; Utopya et tout site dont les CGU interdisent l'automatisation restent bloqués.
- Aucune création de compte, aucun devis, aucune commande automatisés. Les étapes humaines (inscription, envoi d'un Kbis, demande de flux) deviennent des **tâches** affichées dans l'application.
- Aucun contournement de CAPTCHA, MFA, anti-robot (HTTP 403) ni paywall : un 403 marque la source « à consulter manuellement ».
