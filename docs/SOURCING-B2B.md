# Sourcing B2B — audit, plan et état (12 octobre 2026)

Mission : transformer le sourcing en agrégateur B2B (grossistes européens, fichiers et flux autorisés,
comparaison du coût rendu, radar d'opportunités) **sans architecture parallèle** au code existant.

## 1. Audit (phase 1)

### 1.1 Ce qui existe déjà (réutilisé)

| Brique | Où | État |
| --- | --- | --- |
| Modèle d'offre | `sourcing_offers` (+ `sourcing_products`, historiques prix / stock par déclencheur) | complet pour prix, devise, HT/TTC, stock, MOQ, port, délai, pays, URL, ancienneté, anomalies, confiance, ligne brute |
| Import de fichiers | `src/services/sourcing/catalog-import.ts`, `feed-parsers.ts`, `xlsx.ts`, `feed-ingestion.ts` ; routes `/sourcing/import/preview` et `/sourcing/import` ; écran `sourcing-import.tsx` | CSV (`;` `,` tab `\|`), XLSX (sans exécution de formule), XML, JSON ; UTF-8 et Windows-1252 ; virgule décimale ; mapping proposé puis confirmé ; garde-fou qualité (quarantaine) |
| Adaptateurs de source | `src/integrations/sourcing/*` (contrat `SourceAdapter`, registre) | 8 adaptateurs (JSON-LD, Shopify, WooCommerce, Google Merchant, sitemap, BigBuy, Ingram Micro, eBay Browse), testés sur fixtures |
| Rapprochement | `src/domain/sourcing/matching.ts`, `matching-service.ts` | EAN → MPN → code → attributs → texte ; confirmation automatique des seuls identifiants exacts ; raisons affichées |
| Coût rendu / marge | `src/domain/sourcing/radar.ts` | TVA normale / marge / franchise, TVA récupérable, commission, paiement, port, emballage, retours, droits hors UE ; coût inconnu jamais compté 0 |
| Radar | `src/services/radar/radar.ts`, écrans `radar/*` | meilleur prix, baisse, réassort < 14 j, offres sauvegardées |
| Synchronisation | `sync.ts`, `sync-runs.ts`, `crawler/*` ; cron Supabase `monstock-sourcing` toutes les 6 h (vérifié : actif, dernier passage réussi) | verrou « une synchro en cours par source », historique `sync_runs` / `sync_errors`, robots.txt, politesse par hôte |
| Sécurité | RLS par organisation, garde « même organisation », secrets chiffrés AES-256-GCM, protection SSRF (`http.ts`) | solide, avec les écarts ci-dessous |

### 1.2 État réel des données (base MON-STOCK, 12/10/2026)

- 3 sources, toutes `PUBLIC_WEB` / `sitemap-jsonld`, **en fréquence « manuel »** :
  - Brico-phone (pièces détachées) ;
  - un site de pièces détachées tchèque ;
  - Refreshed Apples.
- 132 offres actives, vues pour la dernière fois le 10/10.
- 0 correspondance produit confirmée.
- Ces 3 sources utilisent l'adaptateur `sitemap-jsonld`, qui fonctionne **en recherche directe** (pas de catalogue à parcourir) : leurs offres se mettent à jour quand un utilisateur cherche un produit, pas par le cron. Les planifier n'a pas de sens (constaté en production le 13/10, voir 3.6).

### 1.3 Défauts trouvés et vérifiés dans le code

1. **Rattachement erroné possible.** La clé produit normalisée n'inclut ni l'EAN ni le MPN. Deux offres mal lues (marque et modèle inconnus) partagent donc la clé `-|-|-|-|unknown|-`. Une fois cette clé reliée à un SKU, chaque nouvelle offre portant la même clé hérite du SKU (`offer-storage.ts`, `sku_id: existing?.sku_id ?? product.skuId`).
2. **Frais de port non convertis.** Le radar ajoute les frais de port dans leur devise d'origine à un prix déjà converti en euros.
3. **SSRF sur robots.txt.** `crawler/robots.ts` utilise `fetch` avec `redirect: "follow"` sans vérifier les adresses privées. Le reste du code passe par `fetchText`, qui fait cette vérification.
4. **Import toujours en « catalogue complet ».** Après chaque import, toutes les offres de la source absentes du fichier passent en « expirée ». Un fichier partiel fait donc disparaître le reste du catalogue.
5. **Pas d'historique d'import.** Ni nom de fichier, ni empreinte, ni compteurs nouvelles / mises à jour / inchangées, ni écran. Réimporter le même fichier réécrit chaque ligne.
6. **Mapping non mémorisé par fournisseur.** Seulement 10 champs sont réglables depuis le mobile, et aucun indice de confiance n'accompagne les propositions.
7. **EAN non vérifié à l'import.** La clé de contrôle n'est pas contrôlée.
8. **Synchronisation peu robuste.** Pas de reprise progressive (backoff), pas de prochaine exécution, pas de compteur d'échecs, pas d'alerte en cas d'échecs répétés. Une source en erreur reste replanifiée sans délai. Les sources par compte (API) ne sont jamais planifiées.
9. **Plusieurs scores qui se recoupent.** `scoring.ts`, `ranking.ts` et le score du radar ne distinguent pas compétitivité de l'offre, fiabilité de la source et confiance des données.

### 1.4 Fournisseurs (recherche du 12/10/2026)

Les pages officielles n'ont **pas pu être ouvertes** depuis l'environnement de travail (DNS / proxy bloqués). Les informations ci-dessous viennent des **extraits indexés** des sites officiels : elles sont à confirmer à l'ouverture du compte. Aucun accès n'a été testé avec de vrais identifiants.

| Fournisseur | Accès annoncé | Verdict | Intégration MON STOCK |
| --- | --- | --- | --- |
| **ThePhoneHub** (BE) | « CSV live » par partenaire + API REST (`GET /v1/stock`, webhooks), sur demande à hello@thephonehub.eu | compte et accord commercial, puis flux | **flux distant autorisé** (CSV) dès réception du lien ; API à brancher quand la documentation sera fournie (non publique) |
| **DistriHUB** (LT, opéré par Varle) | XML / API / JSON / CSV / EDI ; prix et stock dans le flux après validation du compte (1 à 2 semaines) ; minimum de commande de 300 € ; l'EAN sert de référence | compte pro, puis flux | **flux distant autorisé** (CSV / XML) ; surtout du neuf |
| **Foxway** (EE) | stocklist en ligne, exports Excel (lots, enchères) ; minimum de commande de 2 000 € ; grades Brand New / A+ / A / B / C+ / C | compte pro, puis Excel ; API à négocier | **import de fichier** (XLSX) avec mapping mémorisé |
| **Mobile Depot Europe** | listes « en un clic », abonnement par e-mail, format non confirmé | fichier ou e-mail | **import de fichier** (XLSX / CSV) ; le PDF n'est pas traité (voir limites) |
| **SmartChoice** (EE) | page `/stock` visible après inscription gratuite ; aucun export trouvé | portail seulement | **import de fichier** si un export est obtenu, sinon saisie |
| **Refreshed Apples** (NL) | Google Sheet « live » envoyé par e-mail ou WhatsApp ; MOQ de 20 | accord nécessaire | source existante conservée (page publique, robots.txt vérifié) ; **flux distant autorisé** pour l'export CSV du Google Sheet avec accord écrit |
| **Utopya** (FR) | la FAQ indique : pas d'export ni d'API ; les CGV (article 14) interdisent tout accès automatisé, clause pénale de 50 000 € | aucun accès automatisé | **fournisseur manuel uniquement**. L'activation de sa page publique est **désactivée** dans la bibliothèque |

Autres grossistes candidats, **à contacter** (aucun accès vérifié) :

| Grossiste | Pays | Accès annoncé |
| --- | --- | --- |
| Mobilax | FR | portail pro |
| Ueephone | antenne FR | portail |
| B2B Mobile Wholesalers | UK | listes par e-mail |
| Merkandi | PL | place de marché |
| B-Stock | — | manifestes par lot ; les CGU interdisent les robots |
| gsmExchange | IE | bourse payante |

Les questions précises à poser à chaque fournisseur figurent dans l'annuaire (fiche → « Demander un accès »).

## 2. Plan (phase 2)

Principe : on **étend** les tables et services existants ; aucune table concurrente.

### 2.1 Migration `20261013000100_sourcing_b2b.sql` (additive, retour arrière fourni)

- `sourcing_import_jobs` : un import =
  - fournisseur, source, flux ;
  - fichier (nom, empreinte SHA-256, taille, format, feuille) ;
  - mode `partial` | `snapshot` ;
  - mapping utilisé ;
  - compteurs (lues, valides, nouvelles, mises à jour, inchangées, doublons, rejetées, non reconnues, expirées) ;
  - statut, utilisateur, lien vers `sync_runs`.
- `sourcing_import_issues` : lignes ignorées et leur raison (500 au maximum par import).
- `sourcing_mapping_profiles` : mapping mémorisé par fournisseur et signature d'en-têtes.
- `sourcing_offers` + colonnes facultatives :
  - `order_multiple`, `vat_regime`, `ship_from_country`, `warranty_months`, `available_from`, `supplier_updated_at` ;
  - `last_import_job_id`.
- `supplier_sources` + `next_run_at`, `consecutive_failures`, `last_failure_at`.
- `supplier_feed_secrets` : identifiants d'un flux distant, chiffrés, accessibles au seul serveur.
- RLS : lecture par les membres de l'organisation ; écriture par le seul serveur, après contrôle du rôle ; gardes « même organisation ».

### 2.2 Services

| Phase | Fichiers | Changement |
| --- | --- | --- |
| 3 | `catalog-import.ts`, `feed-ingestion.ts`, `offer-storage.ts`, `feed-parsers.ts` | mode partiel par défaut et catalogue complet explicite ; empreinte (fichier identique déjà importé → aucun réimport sans confirmation) ; compteurs nouvelles / mises à jour / inchangées ; problèmes ligne par ligne ; mapping mémorisé ; contrôle de la clé EAN ; nouveaux champs ; en-têtes FR / EN / DE ; confiance de chaque proposition de mapping |
| 4 | `remote-feeds.ts` (nouveau, au-dessus de `supplier_feeds` + `fetchText`) | flux CSV / XML / JSON distant autorisé (attestation obligatoire, SSRF, taille bornée, en-tête d'authentification chiffré) : ThePhoneHub, DistriHUB, Google Sheet de Refreshed Apples ; profils d'intégration par fournisseur dans l'annuaire (+ ThePhoneHub, DistriHUB, SmartChoice) ; Utopya bloqué |
| 5 | `domain/sourcing/assessment.ts` (nouveau), `radar.ts` | trois appréciations séparées (compétitivité de l'offre / fiabilité de la source / confiance des données) et verdict expliqué ; scénarios de quantité (MOQ, ×2, tout le stock) avec capital et marge totale ; conversion des frais de port ; pays d'expédition pour les droits |
| 5 | `sync-runs.ts`, `feed-ingestion.ts`, `crawler-manager.ts` | `next_run_at` avec backoff exponentiel (15 min → 24 h), compteur d'échecs, alerte « synchronisation en échec » à partir de 3 échecs, synchronisation manuelle par source, fréquence réglable |
| 5 | `offer-storage.ts`, `robots.ts` | correction des défauts 1 et 3 |

### 2.3 Routes (Edge Function `api`)

| Route | Droit requis |
| --- | --- |
| `GET /sourcing/sources` | membre |
| `POST /sourcing/sources/sync` | écriture |
| `POST /sourcing/sources/schedule` | admin |
| `GET /sourcing/imports`, `GET /sourcing/imports/detail` | membre |
| `POST /sourcing/feeds/preview`, `POST /sourcing/feeds` | écriture + attestation |
| `GET /radar/offer` (appréciation + scénarios) | membre |

### 2.4 Écrans mobiles

- **Sources** : statut connecté / à configurer / import manuel / en cours / erreur / désactivée, nombre d'offres, dernier succès, prochain passage, « Synchroniser maintenant », fréquence.
- **Import** : mode, champs étendus, mapping mémorisé, fichier déjà importé, bilan détaillé.
- **Historique des imports** et détail des lignes ignorées.
- **Flux distant autorisé.**
- **Radar** : appréciations et scénarios dans le détail d'une offre.

### 2.5 Tests

- Unitaires :
  - formats, séparateurs, encodages, virgule décimale ;
  - EAN invalide ;
  - doublons ;
  - mode partiel ou catalogue complet ;
  - réimport identique ;
  - appréciation et scénarios ;
  - backoff ;
  - SSRF robots.txt ;
  - non-héritage de SKU.
- Intégration (PostgreSQL local, 30 migrations) : RLS et isolation des nouvelles tables, écritures interdites au client.
- Mobile : assistant d'import, historique, sources.

### 2.6 Hors périmètre, avec la raison

- **Extraction de PDF** : aucune bibliothèque fiable dans le bundle Edge. Un PDF n'est jamais « parfait » : il faut demander au fournisseur une liste en XLSX ou CSV.
- **XLS ancien format (BIFF)** : refusé avec un message, faute de lecteur sûr ; demander du XLSX ou du CSV.
- **API ThePhoneHub et DistriHUB** : aucune documentation publique. Le connecteur API sera écrit sur leur documentation réelle ; aucune réponse n'est simulée.
- **Aucun achat, aucune commande, aucune publication.** Le radar ne fait que recommander.

## 3. État d'avancement (12/10/2026)

### 3.1 Livré (branche `claude/laughing-bardeen-bdn16j`)

| Lot | Contenu |
| --- | --- |
| Import générique | modes partiel / catalogue complet ; empreinte SHA-256 (fichier identique → `skipped_duplicate`, réimport sur confirmation) ; compteurs nouvelles / mises à jour / inchangées / ignorées ; 500 incidents par import avec extrait ; mapping mémorisé par fournisseur + signature d'en-têtes ; confiance `high` / `medium` ; EAN contrôlé (clé) ; 7 champs nouveaux ; en-têtes FR / EN / DE |
| Flux distant autorisé | `remote-feeds.ts` : HTTPS public, SSRF (redirections revalidées), 20 Mo, 30 s, attestation horodatée obligatoire, en-tête ou identifiant chiffrés AES-256-GCM dans `supplier_feed_secrets` |
| Sources | `source-sync.ts`, `source-health.ts`, `domain/sourcing/schedule.ts` : statut réel, `next_run_at`, backoff 15 min → 24 h, alerte après 3 échecs, synchronisation manuelle (délai 2 min), fréquence réglable par un admin |
| Appréciation | `domain/sourcing/assessment.ts` : compétitivité / fiabilité de la source / confiance des données (null = données insuffisantes), verdict expliqué, scénarios de quantité (MOQ, multiple, ×2, tout le stock) |
| Défauts 1 à 9 | corrigés (rattachement SKU limité aux fiches identifiées, port converti, robots.txt via `fetchText`, mode partiel par défaut, historique, mapping, EAN, robustesse, trois notes séparées) |
| Fournisseurs | fiches B2B (`data/b2b-profiles.ts`) pour 7 grossistes ; ThePhoneHub, DistriHUB, SmartChoice ajoutés à l'annuaire ; Utopya bloqué (CGV art. 14) |
| Mobile | « Mes sources », « Ajouter un flux autorisé », historique et détail des imports, assistant d'import enrichi, radar (3 notes, verdict, scénarios, offres concurrentes), fiche B2B dans l'annuaire, raison du blocage dans la bibliothèque |

`sourcing_import_issues.id` est un uuid (et non un entier) : les matrices de sécurité détectent les fuites par identifiant, et un entier court produisait de faux positifs.

### 3.2 Vérifié, et comment

| Vérification | Résultat |
| --- | --- |
| Tests unitaires serveur (Vitest) | 100 fichiers, 942 tests réussis |
| Tests d'intégration (PostgreSQL 16 local, toutes les migrations) | 24 fichiers, 167 tests réussis, dont `sourcing-b2b.test.ts` (6) et les matrices de sécurité générées, qui couvrent les 4 nouvelles tables |
| Tests mobiles (Jest) | 26 fichiers, 167 tests réussis, dont `sourcing-b2b.test.tsx` (9) |
| Migration | appliquée, retirée par le script de retour arrière, réappliquée, rejouée (idempotente) **en local uniquement** |
| typecheck, lint, bundle Edge | OK (0 erreur de lint) |

Toutes les réponses fournisseurs des tests sont **simulées** (fetch factice, base en mémoire ou locale). Aucun fournisseur n'a été contacté.

### 3.3 Connecteurs : ce qui est réellement prouvé

- **Prouvé sur données réelles (avant cette mission)** : les 3 sources publiques `sitemap-jsonld` (Brico-phone, pièces détachées CZ, Refreshed Apples) — 132 offres réelles vues le 10/10.
- **Prouvé avec des fichiers d'essai, pas avec un vrai fichier fournisseur** : import CSV / XLSX / XML / JSON (encodages, séparateurs, virgule décimale, formules jamais exécutées).
- **Testé seulement avec des mocks** : flux distant autorisé (ThePhoneHub, DistriHUB, Google Sheet Refreshed Apples), synchronisation planifiée, backoff, alertes.
- **Pas de connecteur API** : ThePhoneHub et DistriHUB n'ont pas de documentation publique ; rien n'est simulé à leur place.

### 3.4 Activation par fournisseur

| Fournisseur | Ce qu'il faut obtenir | Dans l'application |
| --- | --- | --- |
| ThePhoneHub | compte partenaire, puis lien CSV (ou jeton) | Mes sources → Ajouter un flux autorisé (CSV, en-tête si jeton) → tester → colonnes → attester → Synchroniser maintenant |
| DistriHUB | compte acheteur validé (1–2 semaines), URL du flux CSV / XML smartphones | idem (CSV ou XML) |
| Refreshed Apples | accord écrit + lien d'export CSV du Google Sheet (`…/export?format=csv`) | idem ; la source publique existante reste active |
| Foxway | compte revendeur, export Excel de la stocklist | Mes sources → Importer un fichier ; mapping mémorisé dès le 2ᵉ import |
| Mobile Depot Europe | liste en XLSX ou CSV (pas PDF) | Importer un fichier |
| SmartChoice | export CSV / XLSX demandé au fournisseur | Importer un fichier ; à défaut saisie |
| Utopya | contrat d'API officiel (exception de l'article 14) | aucune synchronisation ; saisie ou fichier fourni par Utopya |

Les questions à poser figurent dans chaque fiche de l'annuaire et dans l'e-mail de demande d'accès (FR).

### 3.5 Variables d'environnement

Aucune nouvelle variable. Utilisées : `TOKEN_ENCRYPTION_KEY` (déjà en place, chiffrement des identifiants de flux) et `SOURCING_USER_AGENT` (facultative, valeur par défaut). Les identifiants fournisseurs se saisissent dans l'application ; ils ne sont ni dans le code, ni dans Git, ni dans les journaux.

### 3.6 Déploiement en production (13/10/2026, autorisé par l'utilisateur)

| Étape | Résultat vérifié |
| --- | --- |
| Migration `20261013000100` sur MON-STOCK | appliquée par blocs (l'outil d'application dépassait 60 s), enregistrée dans `schema_migrations` ; contrôlé : 4 tables avec RLS, 3 politiques de lecture, aucun privilège client sur les secrets ni en écriture, 5 gardes « même organisation », 7 + 3 colonnes, 4 index ; 132 offres et 3 sources intactes |
| Edge Function `api` | version 40 (commit `1346ec8`) puis version 41 (correctif ci-dessous) ; `/health` 200, nouvelles routes 401 sans connexion |
| Build TestFlight | build 14 (commit `1346ec8`) terminé et envoyé ; build 15 avec le correctif |
| 3 sources publiques en quotidien | **annulé** : premier passage réel → « Aucune URL configurée » sur les 3 (adaptateur de recherche directe, rien à parcourir). Garde-fous vérifiés en réel : aucune offre touchée, nouvel essai programmé à +15 min, aucune alerte avant 3 échecs. Sources remises en manuel, compteurs remis à zéro |

Correctif : nouveau type de source `live_search` (page publique sans catalogue ni URL) — jamais planifiée, jamais comptée en échec, synchronisation et fréquence refusées avec une explication ; section « Recherche en direct » dans « Mes sources ». Test de non-régression reprenant la configuration réelle (les tests précédents simulaient le crawler, ce qui masquait le problème).

### 3.7 Limites

- Informations fournisseurs tirées d'extraits de recherche, non vérifiées avec un compte.
- PDF et XLS (BIFF) non pris en charge.
- Régime de TVA et pays d'expédition : seulement s'ils figurent dans le fichier ; jamais déduits.
- Fiabilité de la source plafonnée tant qu'aucune commande n'a été reçue de ce fournisseur.
- Comparaison d'offres limitée aux offres rattachées au même article ; aucun rattachement sur la seule ressemblance du nom.
