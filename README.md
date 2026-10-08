# MON STOCK

**Le centre de contrôle du vendeur multicanal.** Stock centralisé (PRODUIT → VARIANTE → SKU), ventes eBay synchronisées, alertes de rupture, recommandations de réapprovisionnement, fournisseurs et moteur de sourcing B2B.

> Principe fondateur : **aucune fausse donnée**. Tout ce qui s'affiche vient de la base de données de votre organisation. Une information inconnue est affichée comme telle (« Coût inconnu », « Pas assez de données », « Non communiqué »). Les fonctionnalités non disponibles sont marquées « Disponible prochainement ». Le mode démonstration est une organisation séparée, explicitement marquée **DEMO** sur chaque écran.

## Sommaire

1. [Installation](#1-installation)
2. [Variables d'environnement](#2-variables-denvironnement)
3. [Supabase](#3-supabase)
4. [Migrations](#4-migrations)
5. [Lancement local](#5-lancement-local)
6. [Configuration eBay](#6-configuration-ebay)
7. [OAuth callback](#7-oauth-callback)
8. [Synchronisation](#8-synchronisation)
9. [Architecture](#9-architecture)
10. [Tests](#10-tests)
11. [Déploiement](#11-déploiement)
12. [État des fonctionnalités](#12-état-des-fonctionnalités)

---

## 1. Installation

Prérequis : Node.js ≥ 22, npm, un projet Supabase (gratuit) et, pour les tests d'intégration, un PostgreSQL 16 local.

```bash
git clone <repo> mon-stock
cd mon-stock
npm install
cp .env.example .env.local   # puis remplir les valeurs (section 2)
```

## 2. Variables d'environnement

Toutes les variables sont listées et commentées dans [`.env.example`](.env.example). Résumé :

| Variable | Côté | Rôle |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | public | URL publique de l'application (callbacks OAuth, emails) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | accès Supabase avec la clé anonyme (la RLS s'applique) |
| `SUPABASE_SERVICE_ROLE_KEY` | serveur | moteur de synchronisation, webhooks, cron, secrets OAuth (**jamais** exposée) |
| `TOKEN_ENCRYPTION_KEY` | serveur | chiffrement AES-256-GCM des tokens OAuth et credentials fournisseurs (`openssl rand -base64 32`) |
| `CRON_SECRET` | serveur | protège `/api/cron/*` (`openssl rand -hex 32`) |
| `EBAY_ENV`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RU_NAME` | serveur | application eBay (voir section 6) |
| `EBAY_WEBHOOK_VERIFICATION_TOKEN` | serveur | vérification des notifications eBay |
| `SOURCING_USER_AGENT` | serveur | identité du crawler de sources publiques (User-Agent honnête et contactable) |
| `SOURCING_DISCOVERY_PROVIDER` | serveur | `none` (défaut) ou `brave` : découverte de nouveaux fournisseurs via une API de recherche web officielle |
| `BRAVE_SEARCH_API_KEY` | serveur | clé de la Brave Search API (uniquement si `SOURCING_DISCOVERY_PROVIDER=brave`) |

Règles : `.env*` est ignoré par git **sauf** `.env.example` ; les variables `NEXT_PUBLIC_*` ne contiennent jamais de secret (URL Supabase et clé anonyme uniquement) ; les variables serveur sont validées paresseusement par Zod (`src/lib/env.ts`) avec des messages d'erreur explicites ; le client `service_role` (`src/lib/supabase/admin.ts`) importe `server-only` et n'est jamais atteint depuis un composant client.

### Environnements

| Environnement | Base | Fichier de variables | Usage |
| --- | --- | --- | --- |
| DEV | projet Supabase de développement | `.env.local` | `npm run dev` |
| TEST | PostgreSQL 16 local + shim Supabase (`npm run db:local:reset`) | variables `DATABASE_URL` / `PGDATABASE` | tests d'intégration, aucune donnée réelle |
| PRODUCTION | projet Supabase de production | variables de l'hébergeur (jamais dans le dépôt) | déploiement |

Utilisez **un projet Supabase distinct** pour DEV et PRODUCTION, et des clés eBay *sandbox* en DEV. Ne lancez jamais `npm run seed:demo` ni les tests sur la production.

## 3. Supabase

1. Créez un projet sur <https://supabase.com>.
2. **Authentication → Providers → Email** : activez Email/Password. La confirmation d'email est recommandée (elle est gérée par l'application).
3. **Authentication → URL Configuration** :
   - *Site URL* : `NEXT_PUBLIC_APP_URL` (ex. `http://localhost:3000`)
   - *Redirect URLs* : ajoutez `http://localhost:3000/auth/callback` et l'URL de production équivalente.
4. **Settings → API** : copiez l'URL du projet, la clé `anon` et la clé `service_role` dans `.env.local`.
5. Appliquez les migrations (section 4).

Les emails de confirmation et de réinitialisation redirigent vers `/auth/callback` qui échange le code PKCE contre une session.

## 4. Migrations

Toutes les modifications de schéma sont versionnées dans `supabase/migrations/` (SQL pur, appliquées dans l'ordre) :

| Fichier | Contenu |
| --- | --- |
| `…000100_core.sql` | extensions, profils, organisations, membres, invitations, helpers RLS |
| `…000200_catalog_inventory.sql` | produits, variantes, SKU, stock, mouvements, historique des prix, `apply_inventory_movement` |
| `…000300_channels_orders.sql` | canaux, connexions OAuth (+ secrets), annonces/mapping, commandes, runs de sync, webhooks |
| `…000400_suppliers_sourcing.sql` | fournisseurs, sources, flux, connexions fournisseurs, produits normalisés, offres, historiques, correspondances, recherches, alertes sourcing, taux de change, commandes fournisseurs |
| `…000500_alerts_recommendations.sql` | alertes événementielles, recommandations de réapprovisionnement |
| `…000600_functions_views.sql` | `ingest_external_order`, `map_listing_to_sku`, `receive_purchase_order_items`, vues analytiques |
| `…000700_rls.sql` | Row Level Security complète |
| `…000800_catalog_functions.sql` | `create_sku` (création atomique produit → variante → SKU) |
| `…000900_indexes.sql` | index des clés étrangères jointes |
| `…001000_security_privileges.sql` | privilèges minimaux : EXECUTE retiré à PUBLIC/anon, pas de TRUNCATE, droits par colonne |
| `…001100_membership_hardening.sql` | invitations (email vérifié), dernier propriétaire protégé, profils et rôles verrouillés |
| `…001200_same_org_references.sql` | trigger « même organisation » sur toutes les clés étrangères, `organization_id` immuable |
| `…002000_stock_po_integrity.sql` | intégrité du stock (limites, sens des mouvements, historique non supprimable) et machine à états des commandes fournisseurs |
| `…002100_analytics_views.sql` | vues analytiques par devise, jours calendaires Europe/Paris, rotation du stock |
| `…003000_sync_hardening.sql` | ingestion de commandes sans course, stockage atomique des tokens rafraîchis |

**Appliquer sur Supabase** (au choix) :

```bash
# Option A — Supabase CLI
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push

# Option B — SQL Editor du dashboard : coller chaque fichier dans l'ordre.
```

**Base locale de test** (PostgreSQL 16 nu + shim reproduisant `auth.uid()`, les rôles `anon/authenticated/service_role`) :

```bash
PGPASSWORD=postgres npm run db:local:reset     # recrée mon_stock_test et applique tout (PGDATABASE=… pour une autre base)
npm run db:types                               # régénère src/db/database.types.ts (supabase gen types)
```

Le fichier `supabase/local/0000_supabase_shim.sql` ne doit **jamais** être exécuté sur un vrai projet Supabase.

Le détail du modèle (tables, vues, fonctions, correspondance avec le cahier des charges) est dans [`docs/data-model.md`](docs/data-model.md).

## 5. Lancement local

```bash
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # tests unitaires (vitest)
npm run build        # build de production
```

Parcours : `/signup` → confirmation email → `/onboarding` (créer votre organisation **ou** une organisation de démonstration DEMO) → `/dashboard`.

Mode démonstration en ligne de commande : `npm run seed:demo -- --email vous@exemple.com` (utilise la clé service_role).

## 6. Configuration eBay

Guide complet : [`docs/ebay-setup.md`](docs/ebay-setup.md). En résumé :

1. Créez un compte développeur sur <https://developer.ebay.com> et une application (keyset **Production** et/ou **Sandbox**).
2. Dans *User Tokens → Get a Token from eBay via Your Application*, créez un **RuName** (Redirect URL name) et renseignez :
   - *Your auth accepted URL* : `${NEXT_PUBLIC_APP_URL}/api/integrations/ebay/callback`
   - *Your auth declined URL* : `${NEXT_PUBLIC_APP_URL}/settings/integrations?error=declined`
3. Copiez `App ID (Client ID)`, `Cert ID (Client Secret)` et le RuName dans `.env.local` (`EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RU_NAME`), choisissez `EBAY_ENV=sandbox` ou `production`.
4. Scopes OAuth demandés (user token) : `https://api.ebay.com/oauth/api_scope`, `…/sell.fulfillment` (commandes), `…/sell.inventory` (annonces, quantités), `…/commerce.identity.readonly` (identité du compte).
5. Pour recevoir les notifications eBay (obligatoire en production : *Marketplace Account Deletion*), déclarez l'endpoint `${NEXT_PUBLIC_APP_URL}/api/webhooks/ebay` et le jeton `EBAY_WEBHOOK_VERIFICATION_TOKEN` dans *Alerts & Notifications*.

Aucun mot de passe eBay n'est jamais demandé ni stocké : la connexion passe exclusivement par OAuth. Les tokens sont chiffrés en base et ne transitent jamais vers le navigateur.

## 7. OAuth callback

Flux : `/settings/integrations` → **Connecter eBay** → `/api/integrations/ebay/connect` (crée un `state` anti-CSRF lié à l'organisation, redirige vers eBay) → autorisation par le vendeur → `/api/integrations/ebay/callback?code=…&state=…` (vérifie le `state`, échange le code contre les tokens, récupère l'identité du compte, chiffre et stocke les tokens côté serveur, marque la connexion **Connecté**) → assistant « Configuration de votre catalogue ».

En cas de refus ou d'erreur, l'utilisateur est renvoyé vers `/settings/integrations` avec un message explicite. Un token expiré ou révoqué place la connexion en état *Expiré* avec le bouton **Reconnecter eBay**.

## 8. Synchronisation

Le moteur (`src/services/sync/`) est appelé de trois façons :

- **Manuelle** : bouton *Synchroniser maintenant* (`/settings/integrations`).
- **Automatique / périodique** : `GET /api/cron/sync` avec l'en-tête `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron via `vercel.json`, ou tout scheduler). Chaque connexion a son intervalle (`sync_interval_minutes`) et peut être désactivée (`auto_sync`).
- **Webhook** : `POST /api/webhooks/ebay` (signature vérifiée, événements dédoublonnés dans `webhook_events`).

Chaque exécution crée une ligne `sync_runs` (`started_at`, `finished_at`, `status`, `trigger`, `records_processed`, `error_count`, `stats`) et des lignes `sync_errors` détaillées, visibles sur `/settings/sync`. Rien n'est supposé réussi : les compteurs reflètent ce qui a réellement été traité.

Ce que fait une synchronisation eBay : récupération des annonces actives (Trading API `GetMyeBaySelling`), rapprochement avec les SKU internes (association automatique **uniquement** sur correspondance exacte de SKU ; sinon suggestions à valider), récupération des commandes modifiées depuis le dernier curseur (Fulfillment API), ingestion idempotente (`ingest_external_order` : une commande n'est jamais comptée deux fois, une annulation recrédite une seule fois), mise à jour du stock central, et — si activé explicitement — envoi des quantités vers eBay.

CLI : `npm run sync:run -- --connection <id>` ou `--all`.

## 9. Architecture

```
src/
  app/                 routes Next.js (App Router) : (auth), (app), api/, onboarding, invite
  components/          ui/ (kit minimal : Button, Card, Table, Badge, Form…) et layout/ (sidebar, topbar)
  features/            un dossier par fonctionnalité : queries (lecture), actions (Server Actions + Zod), composants
  domain/              logique métier pure et testée : vitesse de vente, classification stock, marge, réapprovisionnement, sourcing (normalisation, matching, score, validation)
  services/            orchestration serveur : synchronisation, stockage des tokens, ingestion de flux, crawler, taux de change
  integrations/        connecteurs marketplace : core/ (MarketplaceConnector), ebay/, amazon/ et shopify/ (non implémentés, déclarés tels quels)
                       sourcing/ : un dossier indépendant par adaptateur de source (crawler / parser / mapper / index) + registre + catalogue des sources
  lib/                 env, clients Supabase (server / browser / admin), crypto, logger, erreurs, formatage
  db/                  types générés (database.types.ts) et alias
  proxy.ts             rafraîchissement de session + protection des routes (Next 16)
supabase/migrations/   schéma versionné        supabase/local/  shim PostgreSQL local
tests/unit             logique pure, adaptateurs (fixtures), actions   tests/integration RLS, sécurité, stock, commandes, synchronisation (PostgreSQL local)
tests/e2e              rendu des pages publiques (Playwright)          tests/fixtures  documents fournisseurs d'exemple (formats documentés)
docs/                  data-model, ebay-setup, sourcing-*, BETA-READINESS
```

Principes :

- **UI → features → domain / services → integrations → base**. Aucune logique de connecteur dans les composants React.
- **Multi-tenant strict** : chaque requête utilisateur passe par le client Supabase « au nom de l'utilisateur » (RLS). Le client `service_role` n'est utilisé que par le code serveur qui vérifie lui-même l'organisation (sync, webhooks, cron, secrets).
- **Validation serveur** : toutes les entrées (formulaires, API externes, flux fournisseurs) sont validées par Zod avant d'entrer dans le domaine.
- **Idempotence** : identifiants externes uniques (`orders`, `webhook_events`, `sourcing_offers`), transactions SQL pour les opérations critiques.
- **Logs** sans secret (`src/lib/logger.ts` masque tokens, mots de passe, clés).

## 10. Tests

```bash
npm run typecheck && npm run lint
npm test                                   # unitaires : domaine, adaptateurs de sourcing (fixtures), eBay, actions, liens internes…
PGPASSWORD=postgres npm run db:local:reset # base locale (toutes les migrations)
npm run test:integration                   # sécurité multi-tenant générée depuis le catalogue, rôles, stock, commandes fournisseurs,
                                           # idempotence et concurrence (deux connexions), synchronisation eBay, webhooks
npm run build
# e2e (pages publiques, 3 largeurs, en-têtes de sécurité) contre un serveur lancé :
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npx next start -p 3100 &
E2E_BASE_URL=http://localhost:3100 PLAYWRIGHT_CHROMIUM_PATH=<chemin chromium> npm run test:e2e
```

Les tests d'intégration s'exécutent dans une transaction annulée à la fin (base propre) en simulant les rôles PostgREST (`authenticated` + claims JWT, `anon`, `service_role`). Ils sont ignorés automatiquement si aucune base locale n'est joignable (`DATABASE_URL`). Les tests de sécurité énumèrent tables, vues et fonctions depuis `pg_catalog` : **toute nouvelle table avec `organization_id` doit appeler `public.install_same_org_guards(...)` et être ajoutée à `tests/integration/security-fixtures.ts`**, sinon ils échouent.

Les adaptateurs de sourcing et l'API eBay sont testés **uniquement sur des fixtures** construites d'après leur documentation publique : ils n'ont jamais été exécutés contre les vrais services depuis l'environnement de développement (réseau sortant bloqué).

## 11. Déploiement

1. Déployez sur Vercel (ou tout hébergeur Node.js ≥ 22) avec les variables de la section 2.
2. Mettez `NEXT_PUBLIC_APP_URL` sur l'URL publique, ajoutez-la aux *Redirect URLs* Supabase et dans la configuration eBay (RuName).
3. `vercel.json` déclare les crons (`/api/cron/sync`, `/api/cron/sourcing`) ; configurez `CRON_SECRET` (Vercel envoie automatiquement `Authorization: Bearer $CRON_SECRET`).
4. Vérifiez l'endpoint webhook eBay (challenge GET) depuis le portail développeur.
5. Configurez Supabase : *Confirm email*, *Secure email change* et *Secure password change* activés ; *Redirect URLs* limitées à votre domaine.
6. Si votre projet Supabase utilise un domaine personnalisé, ajoutez-le à `connect-src` de la Content-Security-Policy (`next.config.ts`).
7. Vérification finale : `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run build`.

Avant la bêta, lisez [`docs/BETA-READINESS.md`](docs/BETA-READINESS.md).

## 12. État des fonctionnalités

Légende : ✅ réellement disponible · ⚠️ partiellement disponible / non vérifié en conditions réelles · 🚧 prochainement disponible.

| Fonctionnalité | État |
| --- | --- |
| Inscription, connexion, reset, sessions, protection des routes | ✅ |
| Organisations, membres, rôles, invitations | ✅ (email d'invitation non envoyé : le lien est affiché à l'administrateur) |
| Isolation multi-tenant (RLS + garde « même organisation ») | ✅ testée table par table, fonction par fonction |
| Stock central PRODUIT → VARIANTE → SKU, mouvements, historique, archivage | ✅ |
| Commandes fournisseurs : brouillon → envoyée → réception partielle/totale | ✅ |
| Tableau de bord, alertes de rupture, vitesse, jours de stock, rotation, réapprovisionnement, marges | ✅ (calculés uniquement à partir des données présentes) |
| eBay : OAuth, annonces, commandes, mapping, webhooks, cron | ⚠️ implémenté et testé sur réponses simulées ; **jamais exécuté contre l'API eBay réelle** |
| Envoi des quantités vers eBay | ⚠️ opt-in, même réserve |
| Fournisseurs, offres manuelles, import CSV/XML/JSON | ✅ |
| Sourcing : recherche, normalisation, filtrage, déduplication, classement expliqué, confiance, historique, alertes, « Trouver moins cher » | ✅ sur les offres présentes en base (saisies, flux importés) |
| Sourcing : recherche en direct via 6 adaptateurs (JSON-LD, Shopify, WooCommerce, Google Merchant, BigBuy, Ingram Micro) | ⚠️ testés sur fixtures uniquement ; **0 source réellement connectée à ce jour** |
| Sourcing : découverte de nouveaux fournisseurs | ⚠️ désactivée par défaut (nécessite une clé Brave Search API), sources découvertes à valider manuellement |
| Amazon, Shopify (canal de vente), WooCommerce (canal de vente) | 🚧 « Disponible prochainement » |
| Facturation | 🚧 « Disponible prochainement » |

État réel des sources de sourcing : voir la carte « État des sources » sur `/sourcing` et [`docs/sourcing-sources-verification.md`](docs/sourcing-sources-verification.md).
