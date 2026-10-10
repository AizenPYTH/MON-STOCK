# MON STOCK — Application mobile Android / iOS

Ce document contient :
1. l'audit du dépôt réel avant la transition ;
2. l'architecture retenue et le plan de migration ;
3. l'état réel de l'application mobile (ce qui fonctionne, ce qui a été testé, ce qui reste).

> Règle de lecture : « testé » signifie qu'un test automatisé ou une commande a été exécuté ici et
> a réussi. Rien n'a été installé sur un téléphone ou un simulateur dans cet environnement
> (pas de SDK Android, pas de macOS, réseau sortant limité au registre npm).

---

## 1. Audit du dépôt (9 octobre 2026, branche `claude/laughing-bardeen-bdn16j`)

État Git au démarrage : arbre propre, branche synchronisée avec `origin`, dernier commit `8b823c5`.

### 1.1 Framework et versions (lus dans `package.json` / `node_modules`)

| Élément | Version réelle |
| --- | --- |
| Next.js (App Router, `proxy.ts`, Server Actions) | 16.4.0 |
| React / React DOM | 19.3.0 |
| TypeScript | 5.x, `strict` + `noUncheckedIndexedAccess` |
| Tailwind CSS | 4 |
| Supabase | `@supabase/supabase-js` 2.117, `@supabase/ssr` 0.12 (session en cookies) |
| Zod | 4.6 |
| Tests | Vitest 5 (unitaires + intégration sur PostgreSQL 16 local), Playwright 1.56 |
| Node | ≥ 22 |

### 1.2 Inventaire

| Zone | Contenu réel |
| --- | --- |
| `src/app` | 38 pages, 6 route handlers (`/api/cron/{sync,sourcing}`, `/api/integrations/ebay/{connect,callback}`, `/api/webhooks/ebay`, `/auth/callback`) |
| Server Actions | 10 fichiers `"use server"`, 66 actions (stock, achats, sourcing, intégrations, organisations, auth, démo) |
| `src/components` + `src/features/*/components` | 70 composants `.tsx` (DOM + Tailwind) |
| `src/domain` | 22 modules métier purs (inventaire, marge, réappro, normalisation / matching / classement / confiance du sourcing) |
| `src/features/*/queries.ts`, `*.pure.ts` | requêtes serveur par fonctionnalité + 8 modules de calcul purs (analytics) |
| `src/services` | moteur de sync eBay, sourcing (recherche en direct, crawler, découverte, flux, alertes, FX) |
| `src/integrations` | connecteurs eBay (OAuth, Fulfillment, Trading, webhooks), 6 adaptateurs de sourcing, contrats fournisseurs |
| `supabase/migrations` | 19 migrations (≈ 4 350 lignes) : 39 tables, 5 vues, 112 fonctions, 106 politiques RLS |
| Auth | Supabase Auth email + mot de passe, PKCE, cookies via `@supabase/ssr`, `proxy.ts` rafraîchit la session, DAL `src/features/auth/dal.ts` (`getOrgContext`) |
| Organisation courante | `user_profiles.current_organization_id` ; rôle `owner/admin/member/viewer` |
| Tâches planifiées | `vercel.json` : `/api/cron/sync` (30 min), `/api/cron/sourcing` (6 h), protégées par `CRON_SECRET` |
| Tests | 73 fichiers unitaires (648 tests), 18 fichiers d'intégration (142 tests), 1 spec e2e (21 tests) |
| Scripts | `db-local-reset.sh`, `generate-db-types.sh`, `run-sync.ts`, `seed-demo.ts`, `verify-sources.ts`, `sourcing-test-searches.ts` |
| Variables | `.env.example` : Supabase (URL, anon, service_role), `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, eBay (5), sourcing (3) |

### 1.3 Où vivent les règles métier

Constat principal : **les règles critiques sont appliquées par PostgreSQL**, pas par l'interface.

- **Mouvements de stock** : `apply_inventory_movement` (verrous, signe, stock négatif interdit hors ventes).
- **Réceptions fournisseurs** : `receive_purchase_order_items` (idempotente, plafonnée au reste à recevoir).
- **Commandes fournisseurs** : machine à états et totaux par triggers.
- **Isolation** : RLS sur toutes les tables, plus des garde-fous « même organisation » sur toutes les clés étrangères.
- **Ventes externes** : réservées au serveur (`service_role`).

Les Server Actions ne font que valider (Zod), appeler ces fonctions et traduire les erreurs.

### 1.4 Réutilisable tel quel / web uniquement

| Catégorie | Fichiers | Utilisation mobile |
| --- | --- | --- |
| Règles en base (RLS, RPC, triggers) | `supabase/migrations/*` | **Inchangées**, s'appliquent au mobile via le JWT de l'utilisateur |
| Domaine pur | `src/domain/**`, `src/features/*/*.pure.ts` | Partageable (TypeScript sans dépendance) |
| Types de base | `src/db/database.types.ts`, `src/db/types.ts` | Partageable (types seuls) |
| Schémas Zod | `src/features/{stock,auth,analytics,…}/schemas.ts` | Partageable |
| Formatage, libellés | `src/lib/format.ts`, `src/features/sourcing/labels.ts` | Partageable |
| Messages d'erreur SQL | `src/lib/errors.ts` (dépendait du logger serveur) | **Extrait** dans `src/lib/db-error-messages.ts` et `src/features/stock/db-error-messages.ts` (purs) |
| Requêtes serveur | `src/features/*/queries.ts`, `src/services/**` | Réutilisées **côté serveur** par l'API mobile |
| Secrets / privilèges | client `service_role`, tokens eBay, chiffrement, crawler, découverte | **Restent côté serveur** |
| Web uniquement | `src/app/**` (pages), `src/components/**`, `features/*/components`, Server Actions (FormData, `redirect`, `revalidatePath`), `proxy.ts`, cookies `@supabase/ssr`, `next.config.ts` | Non partagés : l'interface mobile est réécrite en React Native |

---

## 2. Architecture retenue

```
MON-STOCK/                      (dépôt existant, inchangé à la racine)
├── src/                        application Next.js + backend (inchangés)
│   ├── domain/ …               ← modules purs partagés avec le mobile
│   └── app/api/mobile/v1/      ← NOUVEAU : API JSON pour le mobile (Bearer JWT)
├── supabase/migrations/        inchangées
└── apps/
    └── mobile/                 ← NOUVEAU : application Expo (Android + iOS)
```

### Pourquoi pas un monorepo npm workspaces

Expo SDK 57 impose `react@19.2.3` et `react-native@0.86.3`, alors que Next.js 16.4 utilise
`react@19.3.0`. Avec des workspaces npm, ces deux versions de React seraient hissées et
mélangées, et une double copie de React fait planter React Native à l'exécution.

L'application mobile est donc un **projet npm séparé** dans `apps/mobile`, avec son propre
`package.json`, son propre `node_modules` et son propre lockfile. Elle importe le code
partagé directement depuis `src/` :
- alias `@/*` identique au web ;
- Metro limité à `src/` (en lecture) ;
- Zod résolu dans `apps/mobile/node_modules`.

Rien n'est déplacé : pas de refactor massif. Le test `tests/unit/shared-boundary.test.ts`
garantit que tout module importé par le mobile reste pur, c'est-à-dire sans `server-only`,
`next/*`, `node:*`, client Supabase serveur, services ni Server Actions.

### Accès aux données : API d'abord, RLS toujours

| Flux | Chemin | Sécurité |
| --- | --- | --- |
| Connexion, inscription, mot de passe oublié, renouvellement de session | Mobile → **Supabase Auth** directement (clé anon publique) | Session persistée chiffrée par le système (Keychain / Keystore via `expo-secure-store`) |
| Lectures et actions métier | Mobile → **`/api/mobile/v1/*`** (Next.js) avec `Authorization: Bearer <access_token>` | Le serveur valide le JWT, vérifie l'appartenance et le rôle, puis interroge Supabase **avec le JWT de l'utilisateur** : la RLS s'applique |
| Traitements privilégiés (synchronisation eBay, recherche de sourcing en direct, découverte) | API → services existants (côté serveur) | `service_role`, tokens eBay et clés restent sur le serveur |

Ce choix réutilise les requêtes et services existants :
- `listStock`, `getSkuDetail`, `getDashboardData`, `listOrders` ;
- `searchOffers` (pipeline complet de sourcing) ;
- `runChannelSync`, recommandations…

Ainsi, le web et le mobile affichent les mêmes chiffres, calculés par le même code.

L'organisation active du mobile est envoyée dans l'en-tête `X-Organization-Id`. Le serveur vérifie
que l'utilisateur en est membre, sans modifier l'organisation active du web.

## 3. Plan de migration (ordre de travail)

1. Extraire les modules purs nécessaires, puis ajouter le test de frontière.
2. Créer l'API mobile `/api/mobile/v1`, avec authentification Bearer et en-tête d'organisation.
   Passe d'abord le proxy (`proxy.ts` laisse passer `/api/mobile`, l'authentification est faite
   dans la route), puis ajoute les tests.
3. Créer l'application Expo : démarrage, configuration, authentification, session sécurisée,
   deep links et sélection d'organisation.
4. Construire les écrans, dans l'ordre fixé :
   - tableau de bord ;
   - stock, recherche et fiche SKU ;
   - mouvements ;
   - commandes fournisseurs et réceptions ;
   - ventes ;
   - sourcing ;
   - eBay ;
   - intelligence et paramètres.
5. Tests mobiles, exports Android et iOS, recherche de secrets dans les bundles, documentation.

---

## 4. État réel de l'application mobile (10 octobre 2026)

### 4.1 Ce qui a changé par rapport au plan

- **Serveur déployé en Supabase Edge Function (`api`)** — l'application web Next.js n'étant pas
  déployée, les traitements qui exigent des secrets ou du réseau sortant (recherche fournisseurs,
  OAuth et synchronisation eBay, notifications eBay, tâches planifiées) tournent dans une Edge
  Function construite à partir des MÊMES modules `src/` que le web (`scripts/build-edge.mjs`).
  Voir [docs/SERVER.md](SERVER.md). Les lectures et écritures courantes du mobile restent
  directes sous RLS (session de l'utilisateur, jamais de `service_role`).
- **Le design « MON STOCK — Design complet »** est appliqué sur données réelles (badge DÉMO non repris).
- **Plateforme cible de la bêta : iOS uniquement** (TestFlight).

### 4.2 Fonctionnalités réellement opérationnelles (code et tests)

| Domaine | Opérationnel | Source / exécution |
| --- | --- | --- |
| Authentification | Connexion, inscription, mot de passe oublié, déconnexion locale, liens `monstock://auth/callback` (PKCE) | Supabase Auth |
| Organisations | Organisation active par appareil, création, rôles (lecture seule / rédacteur / administrateur) | RLS |
| **Création de produit** | Marque, modèle, nom (déduit si vide), catégorie ; 1 à 50 variantes : capacité, couleur, grade A/B/C, état, SKU (suggéré, modifiable), prix d'achat, prix de vente cible, quantité initiale ; erreurs par champ ; confirmation ; une seule transaction | `create_product_with_skus` → `create_sku` (mouvement « Stock initial ») |
| Édition | Produit (nom, marque, modèle, catégorie, description — verrou optimiste) ; variante (prix, capacité, couleur, grade, état, emplacement, seuil, EAN — `update_sku_with_variant`) ; ajout de variantes | Fonctions SQL existantes |
| Stock | Catalogue, filtres, recherche, fiche produit / variante, stepper, ajustement avec motif, historique | `v_stock_overview`, `apply_inventory_movement` |
| **Sourcing en direct** | Recherche libre (« iPhone 13 128 Go grade B »…) exécutée par le serveur sur les sources activées ; rapport par source ; offres : fournisseur, lien direct, prix + devise + HT/TTC, port, MOQ, disponibilité, état/grade, dernière vérification, coût rendu et marge (si connus) ; classes « disponibilité vérifiée » / « offre publiée » / « prix indicatif » | Edge Function → moteur de sourcing existant |
| **Sources fournisseurs** | Bibliothèque vérifiée chaque jour en direct (robots.txt + produits avec prix, exemples affichés) ; activation après attestation des CGU | `sourcing_library_checks`, `supplier_sources` |
| **eBay** | Connexion OAuth (page officielle eBay dans une session système), finalisation liée à l'utilisateur, première synchronisation, « Synchroniser maintenant », dernière synchro réussie, dernier passage, erreurs, reconnexion ; annonces → association à un SKU ; déduction des ventes en attente | Edge Function (tokens chiffrés côté serveur) + `map_listing_to_sku`, `apply_pending_sales_for_sku` |
| Ventes | Commandes par jour, à expédier, annonces eBay | `orders`, `channel_listings` |
| Intelligence | Aujourd'hui / Analyse 7-30-90 j | vues analytiques |
| **Produit à la voix (IA)** | « Dites ou écrivez le produit » : dictée iOS en français, phrase comprise par Claude (marque, modèle, variantes, prix d'achat/vente, quantités, ambiguïtés signalées) → formulaire pré-rempli, création après vérification | Edge Function `/ai/product-draft` (clé `ANTHROPIC_API_KEY` serveur) |
| **Assistant (IA)** | Intelligence → « Demandez à l'assistant » : questions écrites ou dictées (« quel est le produit que j'ai le plus vendu ? ») ; réponses calculées sur les vraies ventes / commandes / stock / annonces eBay, données consultées affichées | Edge Function `/ai/assistant` (lecture seule sous la session de l'utilisateur) |
| Commande fournisseur | Brouillon depuis la comparaison | `purchase_orders` |

### 4.2 bis Correctif TestFlight build 4

- **« Voir » une offre fermait l'application** : l'écran de comparaison affichait « vérifiée il y a
  … » avec `Intl.RelativeTimeFormat`, absent du moteur JavaScript d'iOS (Hermes) → exception →
  fermeture. Remplacé par un calcul sans Intl ; un test interdit désormais ces API dans le code
  partagé et mobile, et un test rend l'écran avec de vraies offres sans cette API.
- Les offres de pièces d'un même appareil (écran / batterie iPhone 13) ne sont plus comparées
  entre elles.

### 4.3 Toujours désactivé (affiché comme tel, jamais simulé)

- Création / publication d'annonces eBay depuis MON STOCK (voir docs/SERVER.md §6).
- Marquer une commande comme expédiée, étiquette d'expédition, scan de code-barres.
- Amazon, Shopify, WooCommerce (« prochainement »).

### 4.4 Écarts assumés avec le design

| Design | Choix | Raison |
| --- | --- | --- |
| File d'écritures hors ligne | Aucune écriture hors ligne | Un mouvement rejoué plus tard pourrait être faux : la base doit confirmer. |
| « Commander 10 unités chez X » | Brouillon de commande | Rien n'est envoyé au fournisseur depuis le mobile. |
| Grades eBay « Excellent / Très bon / Bon » | Non convertis en A/B/C | Aucune équivalence officielle : grade retenu seulement s'il est écrit par le vendeur. |

### 4.5 Tests exécutés (dans cet environnement)

| Vérification | Résultat |
| --- | --- |
| Web : typecheck, lint | 0 erreur |
| Web : tests unitaires + intégration PostgreSQL local (toutes migrations) | 827 / 827 |
| dont création de produit (SQL) | 6 (atomicité, droits, codes en double, multi-variantes, ajout à un produit) |
| dont sourcing (adaptateurs eBay Browse, sitemap + JSON-LD, bibliothèque, secrets, routage, retour OAuth) | 22 |
| Mobile : typecheck strict, lint | 0 erreur |
| Mobile : Jest | 77 / 77 (dont création/édition produit 8, sourcing + appels serveur 8, eBay 7) |
| Export iOS + analyse des secrets du bundle | Réussi, 0 constat |
| Supabase TEST : `create_product_with_skus` (iPhone 13 grade B, 3 unités) | Stock 3, mouvement « initial » — transaction annulée |
| Edge Function en production TEST (`/health`, tâches planifiées) | 200 ; secrets chargés du Vault ; taux BCE réels importés (29 devises) |
| Recherche de bout en bout sur le serveur (organisation temporaire supprimée ensuite) : « écran iPhone 13 » | 4 offres relevées et stockées ; résultat retenu « Ecran iPhone 13 – Origine Apple », 199,90 € TTC, lien direct ; racks SIM écartés (« pas la pièce recherchée ») |
| Bibliothèque de sources (vérification réelle depuis le serveur) | Brico-phone : vérifiée (ex. « Ecran Soft Oled pour iPhone 13 – Premium », 79,90 €) ; eBay : en attente des clés ; autres : refus documentés (voir docs/SERVER.md §5) |

**Non testé ici :** exécution sur iPhone (pas de macOS), appel authentifié de bout en bout avec un
vrai jeton utilisateur (pas d'identifiants dans ce conteneur), connexion eBay réelle (clés absentes).

## 5. Mise en place de l'environnement TEST

1. **Base Supabase TEST** (`ccywsegdowikeirbsfae`) : migrations appliquées jusqu'à `20261009000500`.
2. **Supabase Auth → URL Configuration** : `monstock://**` dans les Redirect URLs.
3. **Serveur** : voir [docs/SERVER.md](SERVER.md) (fonction `api`, secrets, tâches planifiées, eBay).
4. **Variables publiques** du mobile : dans `apps/mobile/eas.json` (URL, clé `sb_publishable_…`, `TEST`).

## 6. Commandes (dans `apps/mobile`)

| Commande | Rôle |
| --- | --- |
| `npm run check` | Typecheck, lint et tests Jest |
| `npm run export:ios` | Bundle iOS (vérifie la compilation Metro) |
| `npm run scan:bundle` | Bundle JavaScript, puis analyse des secrets |
| `eas build -p ios --profile production --auto-submit` | Build + envoi TestFlight |

## 7. Procédure de test sur iPhone (bêta)

1. **Produit** : Stock → « + » → Marque `Apple`, Modèle `iPhone 13`, catégorie Smartphone ;
   variante 128 Go, Noir, Grade B, Reconditionné, prix d'achat 310, prix de vente 429, quantité 3 →
   Créer → confirmer. Le produit s'ouvre ; il apparaît dans le catalogue ; la fiche variante montre
   le mouvement « Stock initial +3 ».
2. **Variantes / édition** : « Ajouter » une variante 256 Go grade A ; crayon → modifier le prix ;
   stepper +1 / −1 et « Annuler » ; ajustement avec motif.
3. **Sourcing** : Sources (icône bibliothèque) → Brico-phone « Activer » (lire les CGU, attester) ;
   puis rechercher « écran iPhone 13 » → offres réelles avec lien. « Trouver un fournisseur » depuis
   la fiche SKU compare avec le coût d'achat.
4. **eBay** (après configuration des clés, docs/SERVER.md §4) : Réglages → Intégrations → eBay →
   « Connecter mon compte eBay » → autoriser chez eBay → retour automatique → synchronisation ;
   Ventes → Annonces → associer chaque annonce à son SKU.
5. **Produit à la voix** (après ajout de `ANTHROPIC_API_KEY`, docs/SERVER.md §3) : Stock → « + » →
   micro → dire « trois iPhone 13 128 gigas noir grade A achetés 310 euros revendus 429 » → ■ → le
   formulaire se remplit (Apple, iPhone 13, 128 Go, Noir, A, 310, 429, 3) → vérifier → Créer.
6. **Assistant** : Intelligence → « Demandez à l'assistant » → micro ou texte « quel est le
   produit que j'ai le plus vendu ? » → réponse chiffrée + « Données consultées : Ventes par
   produit ». Sans vente synchronisée, l'assistant le dit (il n'invente rien).
7. Mode avion : bannière hors ligne, écritures refusées avec message clair.

## 8. Problèmes restants

- **IA** : clé `ANTHROPIC_API_KEY` à ajouter dans Supabase → Edge Functions → Secrets ; sans elle,
  la dictée transcrit mais le remplissage et l'assistant affichent « non activé ».
- **eBay** : clés d'application eBay à fournir (App ID, Cert ID, RuName) et URL de retour à
  déclarer chez eBay — seule action manuelle bloquante (docs/SERVER.md §4).
- **Sources fournisseurs** : la plupart des fournisseurs spécialisés testés n'exposent pas leur
  catalogue sans compte professionnel ; leur intégration demande vos identifiants ou un flux fourni
  par le fournisseur (docs/SERVER.md §5).
- Aucune exécution sur appareil depuis cet environnement : le build TestFlight est le premier test réel.
- Catalogue limité à 5 000 SKU (signalé). Pas de cache hors ligne des données (confidentialité).
