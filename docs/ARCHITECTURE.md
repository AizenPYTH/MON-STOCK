# Architecture de MON STOCK

État au 23/10/2026. Pour l'exploitation (déploiements, incidents, sauvegardes), voir `docs/OPERATIONS.md`. Pour les migrations, voir `docs/MIGRATIONS.md`.

## 1. Vue d'ensemble

MON STOCK sert aux revendeurs de téléphones, de pièces et de matériel reconditionné qui vendent sur eBay. Il couvre :

- le stock : produits, variantes, SKU et mouvements journalisés ;
- les ventes eBay : synchronisation des annonces et des commandes, déduction du stock une seule fois par ligne ;
- le sourcing fournisseurs : recherche en direct, imports de catalogues, radar ;
- l'analyse des marges, des outils et un conseiller IA.

```
 Site web Next.js (src/, Vercel)             App iPhone Expo (apps/mobile, TestFlight)
   | Server Components / Actions               | lectures/écritures PostgREST et RPC
   | sous RLS (session de l'utilisateur)       | sous RLS (jeton de l'utilisateur)
   |                                           |
   +--> fonctions à secrets (IA, transport, recherche, voix) <--+
                          |
             Edge Function Supabase `api` (Deno)
             server/edge/api.ts + code de src/ regroupé (bundle)
                          |
   Postgres Supabase (UE) : RLS sur toutes les tables, Vault, pg_cron + pg_net -> Edge
                          |
   Services externes : eBay, OpenAI, sites fournisseurs (robots.txt respecté),
   Sendcloud / Boxtal / Packlink, La Poste / Ship24 / DHL, BCE
```

## 2. Un code métier, trois environnements d'exécution

| Dossier | Contenu | S'exécute dans |
| --- | --- | --- |
| `src/domain/` | Fonctions pures : calculs de marge, analyse « bonne affaire », normalisation | web, Edge, mobile (modules partagés) |
| `src/services/` | Services métier : synchro eBay, sourcing, IA, transport, suivi | web (Node) et Edge (Deno) |
| `src/integrations/` | Connecteurs externes (eBay, adaptateurs de sources, transporteurs) | web et Edge |
| `src/features/` | Code web par domaine : requêtes, actions serveur, composants. `mobile-api/` contient le contrat de l'API mobile | web ; le contrat est aussi utilisé par l'Edge |
| `src/app/` | Routes Next.js : `(public)`, `(auth)`, `(app)`, `api/` | web |
| `server/edge/` | Routeur de l'Edge Function, shims Deno, chargement des secrets | Edge |
| `apps/mobile/` | Application Expo (expo-router, TanStack Query) | iPhone |

`scripts/build-edge.mjs` regroupe `server/edge/` et le code de `src/` utile dans `supabase/functions/api/bundle.js`, fichier versionné. Le bundle doit toujours correspondre au code source : la CI le reconstruit et compare.

## 3. Sécurité d'accès

- **Isolation par organisation.** Un utilisateur peut appartenir à plusieurs organisations avec un rôle : `owner`, `admin`, `member` ou `viewer`. Toutes les tables ont la RLS. Des triggers empêchent qu'une ligne pointe vers une autre organisation. Le rôle `anon` n'a aucun droit.
- **Web.** La couche d'accès (`src/features/auth/dal.ts`) valide la session, l'organisation et le rôle avant chaque lecture ou écriture. Les actions serveur passent par `requireOrgContextForAction()`.
- **Mobile.** L'organisation active est envoyée dans l'en-tête `X-Organization-Id`. Une partie des lectures et écritures va directement à PostgREST : la RLS est donc la barrière principale.
- **Edge.** `verify_jwt` est désactivé au niveau de la plateforme. Chaque route valide elle-même le jeton (`getUser`), l'appartenance et le rôle. Les routes `/cron/*` exigent `Authorization: Bearer <CRON_SECRET>`.
- **Secrets.** Les clés tierces sont dans les secrets de l'Edge Function ou dans le Vault Supabase. Le Vault est lu par la RPC `server_runtime_secrets()`, réservée au `service_role`. Les jetons OAuth et les identifiants fournisseurs sont chiffrés en AES-256-GCM avec `TOKEN_ENCRYPTION_KEY`. Aucun secret n'est dans le dépôt ni dans l'app mobile ; la clé *publishable* Supabase est publique par conception.

## 4. Flux principaux

### 4.1 Synchronisation eBay

1. `pg_cron` appelle toutes les 15 min `public.call_monstock_cron('sync')`. Cette fonction fait un appel HTTP asynchrone (`pg_net`) vers `/api/cron/sync` de l'Edge Function.
2. Pour chaque connexion due, l'Edge lit les annonces (Trading API) puis les commandes (Sell Fulfillment), sur une fenêtre bornée par un curseur.
3. Chaque commande est ingérée par la RPC `ingest_external_order`. Elle verrouille la commande et applique au plus un mouvement de stock par ligne, même si un webhook et le cron arrivent en même temps.
4. L'envoi des quantités vers eBay est désactivé par défaut (`push_inventory = false`).
5. Chaque passage est tracé dans `sync_runs`. Attention : `cron.job_run_details` indique seulement que l'appel HTTP a été émis, pas que le traitement a réussi. La supervision lit `sync_runs` et `net._http_response`.

### 4.2 Sourcing

- **Recherche en direct.** Les sources actives d'une organisation sont interrogées par des adaptateurs : `shopify-storefront`, `woocommerce-store`, `sitemap-jsonld` et `ebay-browse`. Avant toute lecture, la requête est validée (protection SSRF) et robots.txt est contrôlé.
- **Bibliothèque de sources.** Sources publiques codées dans `src/services/sourcing/source-library.ts`, vérifiées automatiquement chaque nuit et activées par organisation.
- **Imports.** Fichiers CSV, XLSX, XML et JSON, ou flux distants. Le résultat est stocké dans `sourcing_offers`.
- **Analyse.** Coût rendu (prix, port, frais, devise) comparé à la médiane du marché eBay ; radar des ruptures croisées avec les offres.

### 4.3 Conseiller IA

Le conseiller pose des questions en langage naturel au modèle OpenAI, avec `store: false`. Le modèle s'appuie sur des outils en lecture seule, exécutés sous les droits de l'utilisateur. Les actions qu'il prépare, comme un ajustement de stock ou un changement de prix, ne s'exécutent qu'après confirmation explicite. La voix est produite par synthèse OpenAI côté serveur, et la dictée est faite par l'appareil ou le navigateur.

## 5. Environnements

| Environnement | Base | Usage |
| --- | --- | --- |
| Local | PostgreSQL 16 + shim Supabase (`scripts/db-local-reset.sh`) | tests d'intégration, données jetables |
| Préproduction | projet Supabase distinct, à créer (voir `docs/MIGRATIONS.md`) | essai des migrations, démo, autotests |
| Production | projet Supabase `MON-STOCK` (UE) | données réelles |

Les scripts qui écrivent dans une base (`seed:demo`, `sync:run`, `db:local:reset`) refusent par défaut de cibler une base distante ou la production.

## 6. Livraison

| Composant | Comment il part en production |
| --- | --- |
| Web | Vercel construit et publie à chaque push sur la branche de production |
| Edge Function | Déploiement manuel d'un `index.ts` qui importe le `bundle.js` d'un commit précis |
| Base | Migrations appliquées manuellement, après essai en préproduction (`docs/MIGRATIONS.md`) |
| iPhone | Workflow GitHub `ios-testflight-local.yml` (manuel ou tag `testflight-*`) puis TestFlight |

L'ordre recommandé est : migration, puis Edge, puis web, puis mobile. La CI (`.github/workflows/ci.yml`) valide chaque push et chaque PR. Les règles de travail sont dans `CONTRIBUTING.md`.
