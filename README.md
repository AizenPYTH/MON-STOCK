# MON STOCK

**Le centre de contrôle du revendeur multicanal** : téléphones, pièces et matériel reconditionné vendus sur eBay.

- Stock centralisé (produit → variante → SKU) et mouvements journalisés.
- Ventes eBay synchronisées, stock déduit une seule fois par ligne.
- Alertes de rupture et réapprovisionnement.
- Fournisseurs et sourcing B2B.
- Analyse des marges, outils et conseiller IA.

> Principe fondateur : **aucune fausse donnée**. Tout ce qui s'affiche vient de la base de votre organisation.
>
> - Une valeur inconnue s'affiche « — » ou « Coût inconnu », jamais 0.
> - Une estimation est marquée « ≈ ».
> - Une fonctionnalité absente est marquée « Disponible prochainement ».
> - La démonstration est une organisation séparée, marquée **DEMO** sur chaque écran.

Production : site https://mon-stock-chi.vercel.app, app iPhone sur TestFlight, base et Edge Function sur Supabase (UE). État des déploiements au 23/10/2026 : [`docs/OPERATIONS.md` § 1](docs/OPERATIONS.md#1-état-de-la-production-au-23102026).

## Sommaire

1. [Documentation](#1-documentation)
2. [Stack](#2-stack)
3. [Démarrage local](#3-démarrage-local)
4. [Variables d'environnement](#4-variables-denvironnement)
5. [Tests](#5-tests)
6. [Intégration continue](#6-intégration-continue)
7. [Déploiement](#7-déploiement)
8. [eBay en bref](#8-ebay-en-bref)
9. [État des fonctionnalités](#9-état-des-fonctionnalités)

## 1. Documentation

| Document | Contenu |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | vue d'ensemble, code partagé web / Edge / mobile, sécurité d'accès, flux principaux |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | branches, revue, règles de code, base de données, interdits en production |
| [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md) | migrations, historique de production, réconciliation, préproduction, retour arrière |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | déploiement, retour arrière, runbook de synchro eBay, supervision, sauvegardes, secrets, checklists |
| [`docs/SERVER.md`](docs/SERVER.md) | Edge Function `api` : routes, secrets, tâches planifiées, eBay, sourcing, IA, outils |
| [`docs/WEB-DEPLOY.md`](docs/WEB-DEPLOY.md) | site web sur Vercel |
| [`docs/MOBILE.md`](docs/MOBILE.md) | application iPhone (Expo) |
| [`docs/ebay-setup.md`](docs/ebay-setup.md) | application eBay, RuName, notifications, synchronisation |
| [`docs/design/DESIGN-SYSTEM.md`](docs/design/DESIGN-SYSTEM.md) | système de design du web |
| [`docs/data-model.md`](docs/data-model.md) · [`docs/ADVISOR.md`](docs/ADVISOR.md) | modèle de données ; conseiller IA |

## 2. Stack

| Couche | Technologies |
| --- | --- |
| Web | Next.js 16 (App Router, Server Actions, `src/proxy.ts`), React 19, TypeScript strict, Tailwind CSS 4, Zod 4 |
| Serveur | Supabase Edge Function `api` (Deno), construite depuis `src/` (`server/edge/`, `scripts/build-edge.mjs`) |
| Base | Supabase Postgres 17 (UE) : RLS sur toutes les tables, Vault, `pg_cron` et `pg_net` |
| Mobile | Expo / React Native (`apps/mobile`), expo-router, TanStack Query ; build TestFlight par GitHub Actions |
| Tests | Vitest (unitaires et intégration sur PostgreSQL 16), Playwright (e2e), Jest (mobile) |
| Services externes | eBay (OAuth, Trading, Sell Fulfillment, Notifications), OpenAI, transporteurs (Packlink, Boxtal, Sendcloud, La Poste, DHL, Ship24), BCE |

Node.js ≥ 22 est requis (`engines`).

## 3. Démarrage local

Le développement local n'a pas besoin de projet Supabase pour la base : les tests d'intégration tournent sur un **PostgreSQL 16 jetable**, avec un shim qui reproduit `auth.uid()` et les rôles `anon`, `authenticated` et `service_role`.

```bash
git clone https://github.com/AizenPYTH/MON-STOCK.git mon-stock && cd mon-stock
npm ci
cp .env.example .env.local     # puis compléter (§ 4) ; jamais commité

# Base locale jetable (exemple avec Docker ; un PostgreSQL 16 installé convient aussi)
docker run --rm -d --name monstock-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
PGPASSWORD=postgres npm run db:local:reset   # supprime puis recrée mon_stock_test et applique toutes les migrations

npm run dev                    # http://localhost:3000
```

- `npm run db:local:reset` (`scripts/db-local-reset.sh`) :
  - lit `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` et `PGDATABASE` (défaut `mon_stock_test`) ;
  - **refuse tout hôte non local** et toute base Supabase ;
  - ne doit jamais viser autre chose qu'une base jetable.
- `supabase/local/0000_supabase_shim.sql` ne doit **jamais** être exécuté sur un vrai projet Supabase.
- Pour l'interface connectée (connexion, organisations), `npm run dev` a besoin d'un projet Supabase : une **préproduction** ou un projet personnel, jamais la production. Voir [`docs/OPERATIONS.md` § 2](docs/OPERATIONS.md#2-environnements).
- `npm run db:types` régénère `src/db/database.types.ts` depuis la base locale. `DATABASE_URL` permet d'en viser une autre.
- `npm run seed:demo -- --email <adresse>` crée une organisation **DEMO** pour un utilisateur existant. `npm run sync:run -- --due` lance une synchronisation. Ces deux scripts **refusent la base de production** (`scripts/lib/production-guard.ts`).

Parcours dans l'application : `/signup` → confirmation de l'e-mail → `/onboarding` (votre organisation, ou une démonstration) → `/dashboard`.

Application mobile :

```bash
npm ci --prefix apps/mobile
cp apps/mobile/.env.example apps/mobile/.env.local   # valeurs publiques uniquement
npm --prefix apps/mobile run start                   # Expo
```

## 4. Variables d'environnement

Toutes les variables lues par le code sont listées et commentées dans [`.env.example`](.env.example) (web, scripts et tests) et dans [`apps/mobile/.env.example`](apps/mobile/.env.example).

Règles :

- `.env*` est ignoré par git, sauf les fichiers `.env.example`.
- Les variables `NEXT_PUBLIC_*` et `EXPO_PUBLIC_*` sont **publiques** : jamais de secret dedans.
- Les variables serveur sont validées par Zod au premier usage (`src/lib/env.ts`), avec des messages explicites.
- Le client `service_role` (`src/lib/supabase/admin.ts`) importe `server-only` : il n'est jamais atteint depuis un composant client.

En production, le web lit ses secrets partagés dans le **Vault Supabase** au démarrage (`src/instrumentation.ts`). La liste est fermée (`src/lib/web-runtime-secrets.ts`) : `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `EBAY_*` et la découverte de sources. L'IA, les transporteurs et la publication d'annonces passent par l'Edge. Où vit chaque secret : [`docs/OPERATIONS.md` § 10](docs/OPERATIONS.md#10-secrets).

## 5. Tests

```bash
npm run typecheck                 # tsc --noEmit
npm run lint                      # eslint
npm test                          # unitaires (tests/unit) : domaine, adaptateurs sur fixtures, eBay simulé, garde-fous
npm run build                     # build de production
```

**Intégration** (`tests/integration`) : sur la base locale de § 3. Ces tests couvrent :

- la sécurité multi-organisation, énumérée depuis `pg_catalog` ;
- les rôles, le stock et les commandes fournisseurs ;
- l'idempotence et la concurrence ;
- la synchronisation eBay et les webhooks.

```bash
PGPASSWORD=postgres npm run db:local:reset
REQUIRE_DB=1 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mon_stock_test npm run test:integration
```

Sans `REQUIRE_DB=1`, les tests d'intégration sont **ignorés** si la base est injoignable. Avec, ils échouent : c'est le réglage de la CI. Toute nouvelle table avec `organization_id` doit appeler `public.install_same_org_guards(...)` et être ajoutée à `tests/integration/security-fixtures.ts`.

**End-to-end** (Playwright, `tests/e2e`) : pages publiques sur 3 largeurs et en-têtes de sécurité, contre un serveur déjà lancé.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x \
  NEXT_PUBLIC_APP_URL=http://localhost:3100 npx next dev -p 3100 &
E2E_BASE_URL=http://localhost:3100 npm run test:e2e   # PLAYWRIGHT_CHROMIUM_PATH=<chemin> si besoin
```

Le parcours d'inscription (`tests/e2e/onboarding.spec.ts`) n'est lancé qu'avec `E2E_ONBOARDING=1`, et contre une préproduction.

**Mobile** : typecheck, lint, Jest et recherche de secrets dans le bundle exporté.

```bash
npm --prefix apps/mobile run check
```

`npm run test:all` lance unitaires et intégration ensemble. Les adaptateurs de sourcing et les API eBay sont testés sur des **fixtures** construites d'après leur documentation publique. Un test ne dépend ni de la date du jour ni du réseau.

## 6. Intégration continue

`.github/workflows/ci.yml` tourne à chaque push de branche et à chaque pull request. Il n'utilise aucun secret, seulement des valeurs publiques factices.

| Job | Contrôles |
| --- | --- |
| `web` | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` |
| `edge-bundle` | reconstruit `supabase/functions/api/bundle.js` et échoue s'il diffère du fichier commité |
| `integration` | nommage des migrations, application complète sur PostgreSQL 16 vierge (`scripts/db-local-reset.sh`), `npm run test:integration` avec `REQUIRE_DB=1` |
| `mobile` | `npm --prefix apps/mobile run check`, export iOS et scan des secrets du bundle |
| `secrets` | gitleaks sur tout l'historique (`.gitleaks.toml`) |

Autres workflows :

- `ios-testflight-local.yml` : build iOS sur macOS et envoi sur TestFlight (lancement manuel ou tag `testflight-*`) ;
- `supplier-logos.yml` : logos fournisseurs, proposés par pull request.

Dependabot (`.github/dependabot.yml`) propose les mises à jour chaque semaine.

> Au 23/10/2026, sur `claude/remediation-audit`, quatre jobs sont verts et le job `mobile` échoue au lint : `apps/mobile/preview/mock-api.ts` importe un fichier d'aperçu généré, non versionné. La protection de la branche de production, qui exigerait ces contrôles, reste à activer côté GitHub (Q-01).

## 7. Déploiement

**Toute la procédure est dans [`docs/OPERATIONS.md`](docs/OPERATIONS.md).** En résumé :

- ordre : **migration → Edge → web → mobile** ;
- **base** : migrations appliquées une par une, avec l'accord du titulaire, après essai en local puis en préproduction ([`docs/MIGRATIONS.md`](docs/MIGRATIONS.md)). L'historique de la production diffère du dépôt : `supabase db push` n'est **pas** une méthode de déploiement en production ;
- **Edge Function** : `npm run edge:build`, commit du bundle, puis déploiement d'un `index.ts` qui importe le bundle d'un **SHA complet** ([`docs/OPERATIONS.md` § 4](docs/OPERATIONS.md#4-déployer-ledge-function)) ;
- **web** : Vercel publie à chaque push sur la branche de production ([`docs/WEB-DEPLOY.md`](docs/WEB-DEPLOY.md)) ;
- **mobile** : workflow `ios-testflight-local.yml`.

Tâches planifiées : `pg_cron` dans Supabase appelle l'Edge Function (synchro eBay toutes les 15 min, sourcing, suivi de colis, contrôles). **`vercel.json` ne déclare aucun cron.** Sur la branche de remédiation, les routes web `/api/cron/*` et `/api/webhooks/ebay` sont désactivées par défaut (404) ; `MONSTOCK_WEB_LEGACY_ROUTES=1` les réactive en secours.

## 8. eBay en bref

Guide complet : [`docs/ebay-setup.md`](docs/ebay-setup.md).

- Connexion par **OAuth uniquement** : aucun mot de passe eBay n'est demandé ni stocké. Les jetons sont chiffrés en base (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`) et ne vont jamais vers le navigateur ou le téléphone.
- eBay n'accepte qu'une URL de retour par RuName, d'où deux RuName :
  - `EBAY_RU_NAME` sert l'**iPhone** : retour sur l'Edge Function (`…/functions/v1/api/ebay/callback`), puis l'application ;
  - `EBAY_WEB_RU_NAME` sert le **site web** : retour sur `${NEXT_PUBLIC_APP_URL}/api/integrations/ebay/callback`. **Sans lui, la connexion eBay depuis le site est désactivée** et le site renvoie vers l'iPhone.
- Notifications (dont *Marketplace Account Deletion*, obligatoire) : reçues par l'Edge Function (`…/functions/v1/api/ebay/webhook`), signature vérifiée, événements dédoublonnés.
- Synchronisation :
  - par le cron toutes les 15 min, par « Synchroniser maintenant », ou par une notification ;
  - chaque run est borné (100 s) et reprenable ;
  - chaque run est tracé dans `sync_runs` et `sync_errors`, visible sur `/settings/sync`.
- L'envoi des quantités vers eBay est désactivé par défaut (`push_inventory`). La publication d'annonces est verrouillée (`EBAY_LISTING_ENABLED`, administrateur, confirmation).

## 9. État des fonctionnalités

Légende : ✅ disponible · ⚠️ partiel ou non vérifié en conditions réelles · 🚧 prochainement.

| Fonctionnalité | État |
| --- | --- |
| Inscription, connexion, sessions, organisations, rôles, invitations | ✅ (le lien d'invitation est affiché à l'administrateur ; aucun e-mail n'est envoyé) |
| Isolation multi-organisation (RLS et garde « même organisation ») | ✅ testée table par table et fonction par fonction |
| Stock produit → variante → SKU, mouvements, historique, commandes fournisseurs | ✅ |
| Tableau de bord, ruptures, réapprovisionnement, marges | ✅ calculés uniquement à partir des données présentes |
| Synchronisation eBay (annonces, commandes, stock) | ✅ en production pour deux comptes depuis le correctif du 23/10/2026 |
| Envoi des quantités vers eBay, publication d'annonces | ⚠️ opt-in et verrouillés ; jamais exécutés sur un compte réel |
| Connexion eBay depuis le site web | ⚠️ exige `EBAY_WEB_RU_NAME` (branche de remédiation, non déployée) |
| Sourcing : imports de catalogues, bibliothèque de sources vérifiées, radar | ✅ ; sources publiques réelles listées dans [`docs/SERVER.md` § 5](docs/SERVER.md#5-fournisseurs-professionnels) |
| Conseiller IA, produit dicté | ⚠️ dépend d'`OPENAI_API_KEY` côté Edge |
| Devis d'expédition, suivi de colis | ⚠️ connecteurs prêts, en attente des clés des transporteurs |
| Suppression de compte (iPhone, web, Edge) | ⚠️ sur la branche de remédiation ; exige la migration `20261023000600` |
| Amazon, Shopify, WooCommerce (canaux de vente), facturation | 🚧 |

Avant toute ouverture commerciale : [`docs/OPERATIONS.md` § 12](docs/OPERATIONS.md#12-checklist-avant-commercialisation).
