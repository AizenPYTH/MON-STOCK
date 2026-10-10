# Serveur MON STOCK — Edge Function Supabase `api`

L'application web Next.js n'est pas déployée. Tout ce qui ne doit **pas** s'exécuter dans le
téléphone (secrets, tokens eBay, réseau sortant vers les fournisseurs, tâches planifiées) tourne
dans une **Supabase Edge Function** nommée `api`, construite à partir des **mêmes modules `src/`**
que le web : aucune logique n'est dupliquée.

```
apps/mobile ──(jeton utilisateur, X-Organization-Id)──▶ /functions/v1/api/*  ──▶ services src/
             ──(lectures / écritures sous RLS)────────▶ PostgREST (Supabase)
pg_cron ──(CRON_SECRET lu dans Vault)──▶ /api/cron/*
eBay ──▶ /api/ebay/callback (relais vers monstock://) · /api/ebay/webhook (notifications signées)
```

## 1. Construction et déploiement

| Étape | Commande / action |
| --- | --- |
| Construire | `npm run edge:build` → `supabase/functions/api/bundle.js` (dépendances npm en `npm:` résolues par Deno ; shims Next/React dans `server/edge/shims`) |
| Déployer (CLI) | `supabase functions deploy api --no-verify-jwt` (le point d'entrée `index.ts` importe `./bundle.js`) |
| Déploiement effectué ici | le dépôt étant public, l'entrée déployée importe le bundle **figé sur un commit** (`raw.githubusercontent.com/…/<sha>/supabase/functions/api/bundle.js`) : contenu immuable, résolu au déploiement |

`verify_jwt` est désactivé car le retour OAuth et les notifications eBay n'ont pas de JWT Supabase ;
**chaque route authentifie elle-même** : jeton utilisateur validé par Supabase Auth (`getUser`) +
appartenance à l'organisation, `CRON_SECRET` (comparaison en temps constant) pour `/cron/*`,
signature eBay pour `/ebay/webhook`.

## 2. Routes

| Route | Accès | Rôle |
| --- | --- | --- |
| `GET /api/health` | public | configuration (noms des secrets chargés, jamais les valeurs) |
| `GET /api/sourcing/search?q=…&sku=…` | membre | recherche d'offres : sources activées en direct + offres stockées |
| `GET /api/sourcing/status` · `GET /api/sourcing/library` | membre | état des sources, bibliothèque vérifiée |
| `POST /api/sourcing/library/activate` | rédacteur | activer une source vérifiée (attestation CGU obligatoire) |
| `GET /api/integrations` | membre | connexions eBay, dernière synchro, erreurs, annonces non associées |
| `POST /api/ebay/connect` | administrateur | URL d'autorisation eBay (état anti-CSRF lié à l'utilisateur et à l'organisation, 15 min) |
| `GET /api/ebay/callback` | public | relaie `code`/`state` vers `monstock://ebay/callback` (n'échange rien) |
| `POST /api/ebay/finalize` | administrateur | échange du code — **refusé si l'état n'a pas été créé par ce même utilisateur** |
| `POST /api/ebay/sync` | rédacteur | synchronisation immédiate (annonces, commandes, stock) |
| `GET/POST /api/ebay/webhook` | eBay (signé) | challenge + notifications (suppression de compte, commandes) |
| `POST /api/cron/sync` · `/cron/sourcing` · `/cron/library-checks` · `/cron/scout` | `CRON_SECRET` | tâches planifiées / outil d'exploration de sources |

## 3. Secrets

Lus dans l'ordre : variables de la fonction (Dashboard → Edge Functions → Secrets), puis **Supabase
Vault** via `server_runtime_secrets()` (exécutable par `service_role` uniquement, liste fermée).

| Secret | Origine |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | fournis automatiquement par Supabase |
| `TOKEN_ENCRYPTION_KEY` | **généré dans la base** (Vault, migration `20261009000400`) — ne jamais le changer (tokens eBay illisibles sinon) |
| `CRON_SECRET` | généré dans la base (Vault) ; lu par `call_monstock_cron()` à chaque exécution |
| `EBAY_WEBHOOK_VERIFICATION_TOKEN` | généré dans la base (Vault, migration `20261009000500`) — à recopier chez eBay |
| `EBAY_ENV`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RU_NAME` | **à fournir** (voir §4) |

Tâches planifiées (pg_cron, `supabase/ops/schedule-edge-cron.sql`) : synchronisation eBay toutes les
15 min (connexions dues uniquement), moteur de sourcing toutes les 6 h (taux BCE, flux, alertes),
vérification de la bibliothèque de sources chaque jour à 04:23 UTC.

## 4. eBay — seule configuration manuelle restante

1. <https://developer.ebay.com> → **Application Keys** → keyset **Production** : notez *App ID* et
   *Cert ID*.
2. **User Tokens → Get a Token from eBay via Your Application → Add eBay Redirect URL** :
   - *Your auth accepted URL* : `https://ccywsegdowikeirbsfae.supabase.co/functions/v1/api/ebay/callback`
   - *Your auth declined URL* : la même URL
   - *Privacy Policy URL* : obligatoire en production (une page publique de votre politique de confidentialité)
   - type **OAuth** → eBay affiche le **RuName**.
3. **Alerts & Notifications → Marketplace account deletion** :
   - endpoint : `https://ccywsegdowikeirbsfae.supabase.co/functions/v1/api/ebay/webhook`
   - jeton de vérification : copiez `EBAY_WEBHOOK_VERIFICATION_TOKEN` depuis Supabase → Project
     Settings → Vault (généré pour vous), puis « Send test notification ».
4. Supabase → **Edge Functions → Secrets** : ajoutez `EBAY_ENV=production`, `EBAY_CLIENT_ID`,
   `EBAY_CLIENT_SECRET`, `EBAY_RU_NAME` (jamais dans le dépôt ni dans l'application).
5. Vérification : `GET /api/health` → `ebayConfigured: true` ; la source « eBay France » de la
   bibliothèque passe « vérifiée » au prochain contrôle (ou immédiatement via `/cron/library-checks`).

Flux mobile : `connect` (admin) → page eBay dans une session d'authentification système → eBay
redirige vers `/ebay/callback` → `monstock://ebay/callback?code&state` → `finalize` (même
utilisateur, même organisation, état à usage unique) → tokens chiffrés (AES-256-GCM) en base,
jamais renvoyés → première synchronisation. Les ventes déduisent le stock une seule fois
(`ingest_external_order`, verrous et unicité en base) ; les annonces non associées à un SKU ne
touchent pas le stock.

## 5. Sources fournisseurs — résultat réel des vérifications (10 octobre 2026)

Vérifications exécutées **depuis le serveur** (robots.txt lu, aucun contournement, une requête à la
fois par hôte). Méthodes essayées : JSON public Shopify / WooCommerce, page de recherche JSON-LD,
plan du site + données structurées.

| Source | Résultat | Mode d'accès |
| --- | --- | --- |
| **eBay France (API Browse officielle)** | en attente des clés eBay (§4) — lots, reconditionnés, pièces, livrables en France | API officielle (clés d'application) |
| **Brico-phone** (FR, pièces) | ✅ vérifiée : produits avec prix relevés (ex. écran OLED iPhone 13, 79,90 €) | catalogue public (sitemap + données structurées) |
| Utopya (FR, pièces B2B) | ❌ robots.txt interdit les chemins nécessaires | compte professionnel |
| Certideal, Recommerce, Largo, Injured Gadgets, Merkandi, Fixez | ❌ robots.txt interdit ou 403 | compte / partenariat |
| Jobalots (lots de retours) | ❌ robots.txt interdit | — |
| Mobilax, Yes-yes, Refurbed, Eurolots, Wholesale Clearance, Cash Converters, Mobilesentrix EU, REWA | ❌ aucune donnée structurée publique exploitable (rendu JavaScript ou prix après connexion) | compte pro ou flux fournisseur |
| Foneday, MobileParts.shop, Replacebase, iFixit Pro EU, Stocklear, LDLC Pro, Destockplus, Easycash, Smaaart | ❌ pas de catalogue public lisible (pas de sitemap / pas d'API publique) | compte pro / API sur demande |

Les sources « compte » restent intégrables par les connecteurs existants (flux CSV/XML/JSON,
BigBuy, Ingram Micro, comptes fournisseurs chiffrés) dès que vous disposez d'identifiants ou d'un
flux fourni par le fournisseur.

## 6. Création et publication d'annonces eBay (préparé, non activé)

L'architecture le permet (scope `sell.inventory` déjà demandé). Exigences eBay à remplir avant
activation, sinon les appels échouent :
- compte vendeur avec **politiques métier** (paiement, retour, expédition) activées
  (`/sell/account/v1/payment_policy`, `return_policy`, `fulfillment_policy`) ;
- un **emplacement d'inventaire** (`/sell/inventory/v1/location`) ;
- par produit : catégorie eBay et caractéristiques obligatoires (Taxonomy API), état
  (`conditionId`), images en HTTPS ;
- appels : `createOrReplaceInventoryItem` (SKU MON STOCK) → `createOffer` → `publishOffer`.

Le bouton « Mise en vente eBay » reste désactivé tant que ce flux n'est pas implémenté et testé sur
un compte réel.
