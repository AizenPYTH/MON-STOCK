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

Les sections 4 et suivantes (état réel) sont complétées à la fin de la transition.
