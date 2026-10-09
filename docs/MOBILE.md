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

## 4. État réel de l'application mobile (9 octobre 2026)

### 4.1 Ce qui a changé par rapport au plan

- **L'application web n'est pas déployée.** Le mobile lit et écrit donc directement dans Supabase,
  avec la session de l'utilisateur. Toutes les requêtes passent par la RLS ; le mobile n'a jamais
  de clé `service_role`. Les calculs réutilisent les modules purs du dépôt (vitesse, couverture,
  marge, regroupements de ventes, priorités).
  Le contrat `/api/mobile/v1` et sa projection côté serveur sont prêts
  (`src/features/mobile-api/`), mais les routes ne sont pas branchées. Elles le seront avec le
  déploiement web, pour la recherche fournisseurs en direct et la synchronisation eBay.
- **Le design « MON STOCK — Design complet »** (handoff hi-fi) est appliqué :
  - jetons, Manrope et icônes Lucide ;
  - 4 onglets, ouverture sur Intelligence › Aujourd'hui ;
  - une vingtaine de composants ;
  - les 12 écrans, branchés sur les données réelles. Le badge DÉMO n'est pas repris.
- **Plateforme cible de la bêta : iOS uniquement** (TestFlight). La configuration Android reste en
  place, mais aucun build Android n'est préparé.

### 4.2 Fonctionnalités réellement opérationnelles (code et tests)

| Domaine | Opérationnel | Source des données |
| --- | --- | --- |
| Authentification | Connexion, inscription, mot de passe oublié, nouveau mot de passe, déconnexion locale, liens `monstock://auth/callback` (PKCE), renouvellement selon l'état de l'application | Supabase Auth |
| Session | Stockée dans le trousseau iOS (`expo-secure-store`, découpée en morceaux de 1 800 caractères), jamais en clair | Appareil |
| Organisations | Choix de l'organisation active par appareil, création d'organisation (propriétaire), rôle respecté : lecture seule, rédacteur, administrateur | `organization_members`, `create_organization_with_owner` |
| Intelligence › Aujourd'hui | CA du jour, « vs hier », ventes, marge du jour (uniquement si tous les coûts sont connus), « À faire », dernières ventes | `v_daily_sales`, `orders`, `alerts`, catalogue |
| Intelligence › Analyse | 7/30/90 j : CA et évolution, marge nette estimée (SKU au coût connu), ventes et panier moyen, couverture, valeur du stock, CA par semaine, top marges, alerte ouverte | `v_daily_sales`, `v_stock_overview`, `alerts` |
| Stock | Catalogue produit → variantes, filtres Tous / Rupture / Faible / Sans annonce, recherche locale (nom, SKU, code-barres) | `v_stock_overview` (5 000 SKU max, signalé) |
| Fiche produit / variante | Prix, coût moyen, marge, quantité, seuil, couverture, mouvements | `v_stock_overview`, `inventory_movements` |
| Mouvements | Stepper (un mouvement réel par rafale, annulable), ajustement avec motif, validation et confirmation. La base reste l'arbitre : stock négatif refusé, signe contrôlé | `apply_inventory_movement` |
| Ventes | Commandes groupées par jour, à expédier, CA 7 j, remboursées, annonces eBay, détail de commande avec marge non inventée | `orders`, `order_items`, `channel_listings` |
| Sourcing | Offres enregistrées regroupées par produit, fournisseurs actifs, comparaison triée par marge estimée (coût rendu si le port est connu) | `sourcing_offers`, `suppliers` |
| Commande fournisseur | Création d'un brouillon (statut `draft`, jamais envoyé), annulable | `purchase_orders`, `purchase_order_items` |

### 4.3 Affiché « bientôt » (désactivé, jamais simulé)

- Mise en vente eBay.
- Marquer une commande comme expédiée.
- Étiquette d'expédition.
- Scan de code-barres.
- Création de produit sur mobile.
- Saisie de vente directe.
- Recherche fournisseurs en direct : elle nécessite le serveur MON STOCK. Sans source connectée,
  une bannière l'indique.
- Connexion eBay : elle se fait depuis le web (OAuth).

### 4.4 Écarts assumés avec le design

| Design | Choix | Raison |
| --- | --- | --- |
| File d'écritures hors ligne | Aucune écriture hors ligne. Une bannière l'indique. | Un mouvement de stock rejoué plus tard pourrait être faux. La base doit confirmer. |
| « Commander 10 unités chez X » | « Préparer la commande » crée un brouillon | Rien n'est envoyé au fournisseur depuis le mobile. |
| « Retours » | « Remboursées · 30 j » | Il n'y a pas de statut « retour » dans les données importées. |
| « Offre expire ce soir » | Non affiché | Les offres n'ont pas de date d'expiration future. |
| Adresse de l'acheteur | Non affichée | Elle n'est pas importée depuis eBay. |
| Swipe « Ajuster / Vendre » | Non implémenté | L'action « Vendre » n'existe pas encore. « Ajuster » est accessible depuis la fiche. |

### 4.5 Tests exécutés (dans cet environnement)

| Vérification | Résultat |
| --- | --- |
| Web : typecheck, lint | 0 erreur |
| Web : tests unitaires (dont frontière web/mobile) | 651 / 651 |
| Mobile : typecheck (strict, modules partagés inclus), lint (Expo + React Compiler) | 0 erreur |
| Mobile : Jest (54 tests) | 54 / 54 |
| Export iOS (Metro, Hermes) | Réussi |
| Analyse des secrets du bundle (export JavaScript `--no-bytecode`) | 0 constat. Trois tests négatifs (clé `service_role`, JWT `service_role`, `sb_secret_`) sont bien détectés. |
| Script SQL de TEST (base locale vide, puis base partielle comme le projet Supabase) | 39 tables, 106 politiques RLS, 5 vues. Abandon automatique si des données existent. |

Les 54 tests mobiles couvrent :
- la session (stockage découpé) et la configuration ;
- la traduction des erreurs (identique au web) ;
- l'organisation active et les permissions ;
- les requêtes de stock (filtre organisation, pagination stable) ;
- les mouvements (signe, refus de la base) ;
- l'authentification et les liens profonds ;
- la navigation protégée (4 onglets, ouverture sur Intelligence) ;
- le catalogue, la comparaison d'offres et les brouillons de commande ;
- le regroupement des ventes ;
- les composants accessibles.

**Non testé ici :**
- Aucun lancement sur simulateur ni sur iPhone : pas de macOS, pas de SDK.
- Aucun appel réel à Supabase depuis le conteneur : seul le registre npm est joignable.

## 5. Mise en place de l'environnement TEST

1. **Base Supabase TEST** (projet `ccywsegdowikeirbsfae`).
   - Générez le script avec `bash scripts/build-supabase-bootstrap.sh > bootstrap.sql`.
   - Collez-le dans Supabase → SQL Editor → Run.
   - Le script tourne dans une seule transaction et s'arrête si des données existent déjà.
2. **Supabase Auth → URL Configuration** : ajoutez `monstock://**` aux Redirect URLs (liens de
   confirmation et de mot de passe oublié). Sans cela, les liens email n'ouvrent pas l'application.
3. **Variables publiques** : elles sont déjà définies dans `apps/mobile/eas.json` pour les profils
   `development`, `preview` et `production`. Il s'agit de l'URL, de la clé `sb_publishable_…` et de
   `EXPO_PUBLIC_APP_ENV=TEST`. Ces valeurs sont publiques par conception (RLS). Aucun secret n'est
   dans le dépôt.
4. **Développement local** :
   - copiez `apps/mobile/.env.example` en `.env.local` ;
   - lancez `npm ci` dans `apps/mobile` puis `npx expo start`.

## 6. Commandes (dans `apps/mobile`)

| Commande | Rôle |
| --- | --- |
| `npm run check` | Typecheck, lint et tests Jest |
| `npm run export:ios` | Bundle iOS (vérifie la compilation Metro) |
| `npm run scan:bundle` | Bundle JavaScript, puis analyse des secrets |
| `npx expo start` | Serveur de développement (build de développement ou Expo Go) |
| `eas build -p ios --profile production` | Build TestFlight (Expo / EAS) |
| `eas submit -p ios --profile production` | Envoi du build vers App Store Connect / TestFlight |

## 7. Procédure de test sur iPhone (bêta)

1. Le build `production` est envoyé sur TestFlight. Il utilise l'environnement TEST.
2. Installez l'application via TestFlight, puis créez un compte (email de confirmation à ouvrir sur
   le même iPhone).
3. Créez une organisation, puis vérifiez que la session est conservée après fermeture et
   réouverture de l'application.
4. Ajoutez un produit depuis le web, ou par SQL sur TEST. Ensuite :
   - **Stock** : vérifiez filtres, recherche, fiche, stepper (et « Annuler »), ajustement, refus
     d'un stock négatif ;
   - **Ventes** : vérifiez les commandes, puis les annonces si eBay est connecté depuis le web ;
   - **Sourcing** : vérifiez la bannière « aucune source connectée », puis les offres si une source
     est connectée ;
   - **Intelligence** : vérifiez Aujourd'hui, Analyse et la période.
5. Testez le mode avion :
   - la bannière hors ligne s'affiche ;
   - les écritures sont refusées avec un message clair ;
   - la reprise se fait au retour du réseau.
6. Rôle lecture seule (invitation depuis le web) : aucune écriture n'est proposée, et la base refuse
   de toute façon.

## 8. Problèmes restants

- La base TEST doit encore recevoir les migrations (étape 5.1). Le connecteur Supabase utilisé ici
  refuse les instructions `drop` sans confirmation interactive.
- L'API web n'est pas déployée : pas de recherche fournisseurs en direct ni de synchronisation eBay
  depuis le mobile.
- Aucune exécution sur appareil. Le premier test réel sera le build TestFlight.
- Les données ne sont pas mises en cache sur l'appareil (choix de confidentialité). Hors ligne, seules
  les données déjà chargées pendant la session restent affichées.
- Le catalogue est limité à 5 000 SKU (signalé à l'écran).
- `npm audit` signale des vulnérabilités dans les dépendances de développement de l'outillage Expo.
  Les mises à jour forcées casseraient la compatibilité avec le SDK 57.
