# Site web — mise en ligne sur Vercel

Le site (Next.js 16, racine du dépôt) contient le **site public** (accueil, confidentialité,
conditions, mentions légales, support) et l'**application web** (mêmes comptes, mêmes données que
l'application iPhone, base Supabase `MON-STOCK`, région UE).

État au 23/10/2026 :

- adresse de production : https://mon-stock-chi.vercel.app ;
- branche de production : `claude/laughing-bardeen-bdn16j`, au commit `9c8b65b` (Next 16.4.2, fflate 0.8.3) ;
- la remédiation (`claude/remediation-audit`) n'est pas déployée.

Ordre de déploiement, retour arrière (Vercel → Deployments → **Promote to Production**) et checklists :
[`OPERATIONS.md`](OPERATIONS.md).

## 1. Importer le dépôt

1. vercel.com → **Add New… → Project** → importer `AizenPYTH/MON-STOCK`.
2. **Framework** : Next.js (détecté). **Root Directory** : la racine du dépôt (laisser vide).
   Build et installation par défaut (`npm install`, `next build`). Node 22 (champ `engines`).
3. **Production Branch** : aujourd'hui `claude/laughing-bardeen-bdn16j`, qui est aussi la branche par
   défaut du dépôt. Chaque push sur cette branche publie le site ; les autres branches donnent des aperçus.
   Avant la commercialisation (Q-01) :
   - passer à une branche de production dédiée et protégée (par exemple `main`), qui n'accepte que des
     pull requests avec CI verte et approbation humaine ;
   - la déclarer dans Vercel → Settings → Git → Production Branch.
4. **Plan et région** (Q-16) : le plan Hobby n'autorise pas l'usage commercial. Il faut passer en **Pro**
   avant la commercialisation et fixer la région des fonctions dans l'UE (`"regions": ["cdg1"]` ou
   `["dub1"]` dans `vercel.json`, aujourd'hui vide). Ajouter aussi un domaine personnalisé.

## 2. Variables d'environnement (Settings → Environment Variables)

| Variable | Valeur | Secret ? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` (référence du projet, Dashboard → Project Settings) | non |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé **publishable** du projet (`sb_publishable_…`, la même que l'application iPhone, `apps/mobile/eas.json`) | non |
| `NEXT_PUBLIC_APP_URL` | l'adresse canonique du site, sans `/` final (production : `https://mon-stock-chi.vercel.app`) | non |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → clé **secrète** (`sb_secret_…`) ou `service_role` | **oui** — uniquement dans Vercel, jamais dans Git |

Ces quatre variables suffisent. Au démarrage, le serveur lit dans le **Vault Supabase** les
secrets partagés avec l'Edge (`src/instrumentation.ts`, liste fermée dans
`src/lib/web-runtime-secrets.ts`) : `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `EBAY_ENV`,
`EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RU_NAME`, `EBAY_WEBHOOK_VERIFICATION_TOKEN`,
`SOURCING_DISCOVERY_PROVIDER`, `BRAVE_SEARCH_API_KEY`. Le web chiffre et déchiffre ainsi avec la
même clé que l'Edge.

Une variable définie dans Vercel garde la priorité. Ne le faire qu'en connaissance de cause : une
autre `TOKEN_ENCRYPTION_KEY` rendrait illisibles les jetons existants.

Facultatives :

| Variable | Rôle |
| --- | --- |
| `EBAY_WEB_RU_NAME` | RuName dédié au web, nécessaire à la connexion eBay depuis le site (§ 4 et [`ebay-setup.md` § 2](ebay-setup.md#2-runame-et-url-de-retour)) |
| `MONSTOCK_WEB_LEGACY_ROUTES` | `1` réactive les routes web `/api/cron/*` et `/api/webhooks/ebay` (secours) |
| `SYNC_RUN_BUDGET_MS` | budget d'un run de synchro lancé depuis le web |
| `TOKEN_ENCRYPTION_KEY_VERSION`, `TOKEN_ENCRYPTION_KEY_PREVIOUS`, `TOKEN_ENCRYPTION_KEY_FORMAT` | rotation de la clé, à l'identique de l'Edge ([`SERVER.md`](SERVER.md#rotation-de-la-clé-de-chiffrement)) |

L'IA, les devis d'expédition, le suivi de colis et la publication d'annonces passent par l'Edge
(`src/lib/edge-api.ts`, au nom de l'utilisateur). Le web n'a donc besoin ni d'`OPENAI_API_KEY`, ni
des clés de transporteurs.

## 3. Supabase Auth (une fois le domaine connu)

Supabase → **Authentication → URL Configuration** :

- **Redirect URLs** : ajouter `https://<votre-domaine>/auth/callback` (et
  `https://*-<équipe>.vercel.app/auth/callback` pour les aperçus si besoin).
- **Site URL** : ne la changer que si les e-mails (confirmation, mot de passe oublié) doivent
  pointer vers le web plutôt que vers l'application.

## 4. Ce qui ne passe PAS par Vercel

- **Tâches planifiées** : synchro eBay (15 min), sourcing (6 h), suivi de colis, contrôles de
  l'annuaire tournent déjà dans Supabase (`pg_cron` → Edge Function). `vercel.json` ne déclare donc
  aucun cron (le plan Hobby refuse les crons de plus d'une fois par jour, et ils feraient doublon).
  Les routes web `/api/cron/*` et `/api/webhooks/ebay` sont désactivées par défaut (404, W-18) ;
  `MONSTOCK_WEB_LEGACY_ROUTES=1` les réactive (puis `Authorization: Bearer $CRON_SECRET`).
- **eBay** : l'adresse de retour OAuth et les notifications enregistrées chez eBay pointent vers
  l'Edge Function Supabase. La connexion eBay se fait depuis l'application iPhone ; pour la proposer
  aussi sur le web, créer chez eBay un second RuName dont l'URL de retour est
  `https://<domaine>/api/integrations/ebay/callback` et le renseigner dans `EBAY_WEB_RU_NAME` (Vercel).
  Sans lui, le site affiche « connectez eBay depuis l'app iPhone » à la place des boutons (W-06).

## 5. Vérifier après le premier déploiement

1. `https://<domaine>/` affiche l'accueil public ; `/confidentialite`, `/support` répondent.
2. `/login` → connexion avec un compte existant de l'application → `/dashboard`.
3. Les journaux Vercel affichent `[runtime-secrets] Secrets d'exécution chargés` avec
   `fromVault` contenant `TOKEN_ENCRYPTION_KEY` (noms seulement, jamais les valeurs).
4. `/robots.txt` et `/sitemap.xml` utilisent le bon domaine (sinon renseigner `NEXT_PUBLIC_APP_URL`).

## 6. Informations légales à fournir

`src/content/legal.ts` : raison sociale ou nom, forme juridique, adresse, SIREN/RCS, directeur de
la publication, e-mail de contact. Tant qu'ils manquent, les pages légales affichent « à compléter
par l'éditeur » (rien n'est inventé) et le bouton « Demander un accès » est masqué.

## 7. Sécurité du navigateur (CSP)

En-têtes posés par `next.config.ts` (testés : `tests/unit/web-csp.test.ts`, `tests/e2e/public-pages.spec.ts`) :

- `connect-src 'self'` (W-33) : le navigateur ne parle qu'au site. Aucun client Supabase navigateur,
  aucun Realtime ; conseiller, voix, imports et Server Actions sont sur le site ; la dictée (Web
  Speech API) est un service du navigateur, hors CSP.
- `img-src 'self' data: https:` : les photos produit sont servies par le domaine de chaque
  fournisseur (liste imprévisible) ; `blob:` retiré (aucune image locale créée par le site).
- `script-src 'self' 'unsafe-inline'` : **CSP à nonce non retenue pour l'instant** (Q-22). Avec
  Next 16.4, un nonce (`proxy.ts` + en-tête `x-nonce`) impose le rendu dynamique de **toutes** les
  pages : l'accueil, `/conditions`, `/confidentialite`, `/mentions-legales`, `/support` et la page
  404, aujourd'hui statiques (servies par le CDN), deviendraient rendues à chaque requête ; une page
  restée statique perdrait son hydratation (scripts sans nonce bloqués). Le gain serait limité aux
  scripts : `style-src` doit garder `'unsafe-inline'` (attributs `style` de React). À reprendre si
  l'exigence de sécurité le justifie : nonce généré dans `proxy.ts` sur les requêtes de document
  (hors préchargements), lu dans le layout racine (`headers()`) pour `ThemeScript nonce`, CSP retirée
  de `next.config.ts` pour ces chemins, puis e2e « aucune violation CSP » sur toutes les pages.
