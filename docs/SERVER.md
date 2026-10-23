# Serveur MON STOCK : Edge Function Supabase `api`

État au **23/10/2026**. La fonction `api` (Deno) exécute tout ce qui ne doit pas tourner dans le téléphone : secrets, jetons eBay, réseau sortant vers les fournisseurs, tâches planifiées. Elle est construite à partir des **mêmes modules `src/`** que le site web Next.js (déployé sur Vercel) : aucune logique n'est dupliquée.

```
apps/mobile ──(jeton utilisateur, X-Organization-Id)──▶ /functions/v1/api/*  ──▶ services src/
             ──(lectures / écritures sous RLS)────────▶ PostgREST (Supabase)
pg_cron ──(call_monstock_cron : CRON_SECRET lu dans le Vault)──▶ /functions/v1/api/cron/*
eBay ──▶ /functions/v1/api/ebay/callback (relais vers monstock://) · /functions/v1/api/ebay/webhook (notifications signées)
```

Le site web a ses propres routes (`src/app/api/*`) pour l'OAuth eBay web, le webhook web, `/api/cron/sync` et `/api/cron/sourcing`. Les tâches planifiées de production appellent **l'Edge**, pas Vercel.

Déploiement, retour arrière, supervision et incidents : [`OPERATIONS.md`](OPERATIONS.md). Architecture d'ensemble : [`ARCHITECTURE.md`](ARCHITECTURE.md).

## 1. Construction et déploiement

| Étape | Commande / action |
| --- | --- |
| Construire | `npm run edge:build`, qui produit `supabase/functions/api/bundle.js`. Les dépendances npm sont chargées par Deno en `npm:` ; les shims Next et React sont dans `server/edge/shims`. Le bundle est **versionné** ; le job CI `edge-bundle` vérifie qu'il correspond au code. |
| Point d'entrée | `server/edge/main.ts` lance `Deno.serve`, et `server/edge/api.ts` contient le routeur. Dans le dépôt, `supabase/functions/api/index.ts` importe `./bundle.js`. |
| Déployer en production | `index.ts` importe le bundle **figé sur un SHA complet** (`raw.githubusercontent.com/AizenPYTH/MON-STOCK/<sha>/supabase/functions/api/bundle.js`), ou bien la CLI est lancée depuis une copie de travail de ce SHA. Forme exacte et procédure : [`OPERATIONS.md` § 4](OPERATIONS.md#4-déployer-ledge-function). |
| En production le 23/10/2026 | v65, bundle du commit `43f55c9` (correctif de la synchro eBay) |

`verify_jwt` est désactivé, car le retour OAuth et les notifications eBay n'ont pas de JWT Supabase. **Chaque route authentifie donc elle-même** :

- jeton utilisateur validé par Supabase Auth (`getUser`) et appartenance à l'organisation de l'en-tête `X-Organization-Id` ;
- `CRON_SECRET`, comparé en temps constant, pour `/cron/*` ;
- signature eBay pour `/ebay/webhook`.

## 2. Routes

Chemins relatifs à `https://<ref>.supabase.co/functions/v1/api`, où `<ref>` est la référence du projet (Dashboard → Project Settings).

Niveaux d'accès :

- *membre* : tout membre de l'organisation ;
- *rédacteur* : rôle d'écriture (`owner`, `admin` ou `member`) ;
- *administrateur* : `owner` ou `admin`.

Chaque corps JSON est validé par Zod, avec une taille maximale : 64 Ko par défaut ; 21 Mo pour l'import de catalogue (fichier de 15 Mo encodé en base64).

La mention **(branche)** signale une route présente sur `claude/remediation-audit` mais absente de la version en production (v65).

Règles communes sur la branche :

- **Organisation explicite** (S-29) : toute route « rédacteur » ou « administrateur » exige l'en-tête `X-Organization-Id` (400 sinon). L'application iPhone (`apps/mobile/src/lib/api.ts`) et le site (`src/lib/edge-api.ts`) l'envoient toujours ; les lectures gardent le repli sur l'organisation par défaut.
- **Lecture seule et recherche en direct** (S-15) : pour un rôle `viewer`, `/sourcing/search` et `/suppliers/search` ne lancent pas la recherche en direct (qui enregistre des offres) : seules les offres déjà enregistrées sont renvoyées.
- **Limites de débit** (S-15, I-29) : `src/services/rate-limit.ts`, fonction SQL `api_rate_reserve` (migration `20261023000800`). Refus : 429 `RATE_LIMITED`, message rédigé. Fonction absente (Edge déployée avant la migration) : la demande passe, avec un avertissement dans les journaux.
- **CORS** (Q-22) : plus de `Access-Control-Allow-Origin: *`. Seules les origines connues reçoivent les en-têtes CORS : `APP_URL` (ou `NEXT_PUBLIC_APP_URL`), la liste `EDGE_CORS_ORIGINS` (https, séparées par des virgules), et `http://localhost:*` en développement (pile Supabase locale ou `EDGE_CORS_ALLOW_LOCALHOST=1`). L'application native n'envoie pas d'`Origin` et n'est pas concernée.
- **Journaux** (S-17) : une ligne JSON par événement (`ts`, `level`, `scope`, `message`, `requestId`, métadonnées). L'identifiant vient de l'en-tête `X-Request-Id` de l'appelant s'il est sûr, sinon un UUID ; il est renvoyé dans l'en-tête de réponse `X-Request-Id`.
- La table des routes est aussi en tête de `server/edge/api.ts` ; un test vérifie qu'elle contient chaque route du routeur (S-26).

| Route | Accès | Rôle |
| --- | --- | --- |
| `GET /health` | public | réponse **minimale** (S-16) : `ok`, `ebayConfigured`, `cronConfigured`, `aiConfigured`, `encryptionConfigured` (clé conforme), `time`. Plus aucun nom de secret, ni environnement eBay (`ebayEnvironment: null`), ni message d'erreur |
| `GET /health/details` **(branche)** | `Authorization: Bearer <CRON_SECRET>` | diagnostic d'exploitation : **ping réel de la base** (durée), état du chargement des secrets (noms seulement, tentatives, prochain essai), environnement eBay, état de la clé de chiffrement (format, versions), transporteurs, suivi utilisable (disjoncteur La Poste) |
| `GET /suppliers/search?q=…` | membre | recherche « Fournisseurs » : offres par fournisseur, de la moins chère à la plus chère |
| `GET /sourcing/search?q=…&sku=…` | membre | recherche d'offres : sources activées en direct et offres stockées |
| `GET /sourcing/status` · `GET /sourcing/library` | membre | état des sources ; bibliothèque vérifiée |
| `POST /sourcing/library/activate` | rédacteur | activer une source vérifiée (attestation des conditions d'utilisation tracée) |
| `GET /sourcing/directory` | membre | annuaire de fournisseurs professionnels (§ 5) |
| `GET /sourcing/accounts` · `GET /sourcing/supplier-offers?supplierId=` | membre | comptes pro prioritaires et produits récupérés par fournisseur |
| `POST /sourcing/accounts/connect` · `/sync` | rédacteur | connexion API d'un compte fournisseur (identifiants chiffrés, test réel) ; synchronisation |
| `POST /sourcing/accounts/disconnect` | administrateur | déconnexion : identifiants supprimés |
| `POST /sourcing/import/preview` | rédacteur | aperçu d'un catalogue (CSV, TSV, XLSX, XML, JSON) : rien n'est enregistré |
| `POST /sourcing/import` | rédacteur | import réel, par lots dans le budget de la requête |
| `GET /sourcing/imports` · `/sourcing/imports/detail?id=` | membre | historique des imports, lignes ignorées et raison |
| `POST /sourcing/imports/resume` **(branche)** | rédacteur | reprise d'un import par lots |
| `GET /sourcing/sources` | membre | sources : statut, offres exploitables, prochain passage |
| `POST /sourcing/sources/sync` | rédacteur | « Synchroniser maintenant » (verrou et délai de 2 min) |
| `POST /sourcing/sources/schedule` | administrateur | fréquence et activation d'une source |
| `POST /sourcing/feeds/preview` · `POST /sourcing/feeds` | rédacteur | aperçu, puis ajout d'un flux distant HTTPS (accord du fournisseur attesté, identifiants chiffrés) |
| `GET /sourcing/matches` · `POST /sourcing/matches/decide` | membre · rédacteur | rapprochements offre ↔ SKU |
| `GET /radar?sort=…` · `GET /radar/offer?id=&quantity=` | membre | radar d'opportunités (§ 6) et détail d'une offre |
| `POST /radar/settings` | administrateur | paramètres de coût (TVA, commissions, port, emballage, retours, douane) |
| `GET /tools/status` | membre | plateformes d'expédition et API de suivi utilisables (noms uniquement ; La Poste affichée « non configurée » quand sa clé est refusée, I-17) |
| `POST /shipping/quotes` | membre | devis Packlink PRO / Boxtal / Sendcloud (consultation, aucune étiquette). **Limite de débit (branche)** : 20 / min par utilisateur, 40 / min par organisation |
| `POST /tracking/refresh` | rédacteur | actualise un colis suivi. **Limite (branche)** : un même colis au plus une fois par minute ; 60 / h par utilisateur, 200 / jour par organisation |
| `GET /integrations` | membre | connexions eBay, dernière synchro, erreurs, annonces non associées |
| `POST /ebay/connect` | administrateur | URL d'autorisation eBay : état anti-CSRF lié à l'utilisateur et à l'organisation, 15 min, usage unique. Corps `{ "extended": true }` pour l'analyse complète. |
| `GET /ebay/callback` | public | relaie `code`/`state` vers `monstock://ebay/callback` (n'échange rien) |
| `POST /ebay/finalize` | administrateur | échange du code, **refusé si l'état n'a pas été créé par ce même utilisateur** pour cette organisation. Sur la branche, l'état n'est consommé que s'il appartient à l'appelant (S-24) : un autre administrateur ne peut plus invalider un flux en cours |
| `POST /ebay/disconnect` | administrateur | déconnexion : jetons supprimés |
| `POST /ebay/sync` | rédacteur | synchronisation immédiate d'une connexion (`scope` : `full`, `listings` ou `orders`). **Limite (branche)** : une même connexion au plus une fois toutes les 2 min ; 20 / h par utilisateur |
| `GET /ebay/listings/prefill?skuId=…` · `GET /ebay/account-setup[?connectionId=]` | rédacteur | brouillon d'annonce ; politiques et emplacements du compte eBay (compte à préciser s'il y en a plusieurs) |
| `POST /ebay/listings/check` | rédacteur | contrôle et **simulation** : aucun appel d'écriture chez eBay |
| `POST /ebay/listings/publish` | administrateur | publication réelle, **uniquement** si les 4 verrous sont levés (§ 7). Corps : `{ draft, confirm, connectionId? }` ; `connectionId` obligatoire quand plusieurs comptes eBay sont connectés (I-31) |
| `GET/POST /ebay/webhook` | eBay (signé) | challenge, puis notifications (suppression de compte, commandes) |
| `POST /ai/product-draft` | rédacteur | phrase dictée → brouillon de produit (rien n'est créé) |
| `POST /ai/assistant` | membre | questions sur les ventes et le stock : outils de lecture sous RLS |
| `GET /advisor/status` | membre | conseiller IA : configuré ?, modèle, voix, limites |
| `POST /advisor/chat` | membre | conseiller IA (flux NDJSON si `Accept: application/x-ndjson`), voir [`ADVISOR.md`](ADVISOR.md) |
| `GET /advisor/speech?messageId=` · `GET /advisor/voice-sample?voice=` | membre | voix d'une réponse ; échantillon de voix (quota IA) |
| `POST /advisor/actions/confirm` · `/cancel` | membre (rédacteur pour exécuter) | exécute ou annule UNE action préparée, après revérification |
| `POST /account/delete` **(branche)** | utilisateur connecté | suppression définitive du compte (`{ "confirmation": "SUPPRIMER" }`), sans organisation requise ; nécessite la migration `20261023000600` |

Tâches et contrôles serveur : tous en `POST`, avec `Authorization: Bearer <CRON_SECRET>`.

| Route | Rôle |
| --- | --- |
| `/cron/sync` | synchro eBay des connexions dues, dans un budget partagé. Libère aussi les runs abandonnés (plus de 10 min) et reprend les notifications abandonnées. |
| `/cron/sourcing` | taux BCE, flux fournisseurs, crawls, alertes de prix (corps facultatif `{ "phase": … }`) |
| `/cron/sourcing-imports` **(branche)** | reprise des imports par lots |
| `/cron/library-checks` | vérification d'un lot de sources de la bibliothèque |
| `/cron/library-review-report` **(branche)** | rapport en lecture seule des sources à faire revalider |
| `/cron/library-activate` | en production : activation planifiée ; sur la branche : **supprimée** (réponse 410) |
| `/cron/directory-checks` | contrôle réel des sites de l'annuaire |
| `/cron/tracking` | actualisation des colis dont l'échéance est passée |
| `/cron/collect-source` | collecte d'une source précise (budget borné) |
| `/cron/sourcing-weekly` | collecte hebdomadaire. Elle dépend de `supabase/pending/20261014000100_sourcing_weekly_collection.sql`, **non appliquée** : ne pas planifier. Sur la branche, la route répond **503 `NOT_CONFIGURED`** (« collecte hebdomadaire désactivée ») tant que les colonnes de cette migration sont absentes, sans rien exécuter (S-27). |
| `/cron/connectors-probe` · `/cron/adapter-probe` · `/cron/scout` | sondes sans identifiants (API d'expédition et de suivi, adaptateurs, sites candidats) |
| `/cron/readonly-check` · `/cron/ai-tools-check` · `/cron/deal-check` | contrôles en lecture sur le schéma réel |
| `/cron/import-selftest` · `/cron/chain-selftest` · `/cron/e2e-search` | autotests qui créent puis suppriment des organisations temporaires. **À réserver à la préproduction.** |

## 3. Secrets

Ordre de lecture : d'abord les **secrets de la fonction** (Dashboard → Edge Functions → Secrets), puis le **Vault Supabase** via `server_runtime_secrets()` (exécutable par `service_role` uniquement, liste fermée). Une variable de la fonction a priorité sur le Vault. Les valeurs ne sont jamais journalisées.

| Secret | Origine |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | fournis automatiquement par Supabase |
| `TOKEN_ENCRYPTION_KEY` | **généré dans le Vault** par la migration `20261009000400`. Ne jamais le remplacer sans suivre la [rotation](#rotation-de-la-clé-de-chiffrement), sinon les jetons eBay deviennent illisibles. Copie hors ligne obligatoire ([`OPERATIONS.md` § 9.4](OPERATIONS.md#94-clé-token_encryption_key--copie-hors-ligne-q-08-d-05)). |
| `CRON_SECRET` | généré dans le Vault ; lu par `call_monstock_cron()` à chaque exécution |
| `EBAY_WEBHOOK_VERIFICATION_TOKEN` | généré dans le Vault (migration `20261009000500`), à recopier chez eBay |
| `PROJECT_URL` | Vault, **à créer** avant la migration `20261023000700` (URL de ce projet, lue par `call_monstock_cron`) |
| `EBAY_ENV`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RU_NAME` | **à fournir** (§ 4), dans les secrets de la fonction ou dans le Vault |
| `SOURCING_DISCOVERY_PROVIDER`, `BRAVE_SEARCH_API_KEY` | facultatif : découverte de fournisseurs par l'API Brave Search (`none` par défaut) |
| `OPENAI_API_KEY` | **à fournir** dans les secrets de la fonction. Sans elle, `/ai/*` et `/advisor/*` répondent « non configuré », sans jamais simuler de réponse. |
| `OPENAI_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`, `ADVISOR_AUDIO_MAX_AGE_SECONDS` | facultatif : modèle de texte, modèle et voix de synthèse, durée du cache audio |
| `EBAY_LISTING_ENABLED` | facultatif ; `true` autorise la publication d'annonces (désactivée par défaut) |
| `PACKLINK_API_KEY` ; `SENDCLOUD_PUBLIC_KEY`, `SENDCLOUD_SECRET_KEY` ; `BOXTAL_V1_LOGIN`, `BOXTAL_V1_PASSWORD`, `BOXTAL_CONTENT_CODE`, `BOXTAL_API_URL` | facultatif : devis d'expédition (§ 10) |
| `LAPOSTE_OKAPI_KEY`, `SHIP24_API_KEY`, `DHL_API_KEY` | facultatif : suivi de colis (§ 10) |
| `SYNC_RUN_BUDGET_MS` | facultatif : budget d'un run de synchro (100 000 ms par défaut, borné à 8 min) |
| `SOURCING_USER_AGENT`, `SOURCING_BOT_CONTACT` | facultatif : identité du robot de collecte et contact réel (aucun contact n'est inventé) |
| `TOKEN_ENCRYPTION_KEY_VERSION`, `TOKEN_ENCRYPTION_KEY_PREVIOUS`, `TOKEN_ENCRYPTION_KEY_FORMAT` | **(branche)** rotation de la clé, ci-dessous |
| `APP_URL`, `EDGE_CORS_ORIGINS`, `EDGE_CORS_ALLOW_LOCALHOST` | **(branche)** facultatif : origines de navigateur autorisées par CORS (voir § 2). Sans elles, aucune origine de navigateur n'est autorisée, ce qui ne gêne ni l'iPhone ni le site |
| `EBAY_DAILY_CALL_BUDGET` | **(branche)** facultatif : budget quotidien d'appels eBay de l'application (5 000 par défaut, valeur réelle dans le portail développeur) ; alerte à 80 % (I-12) |

`server_runtime_secrets()`, dans sa version versionnée, ne renvoie que 9 noms : `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `EBAY_*` (5) et la découverte de sources (2). Les autres secrets doivent être déclarés **dans les secrets de la fonction**. Dans le code (S-25), `server/edge/runtime-secrets.ts` sépare `VAULT_SECRET_NAMES` (ces 9 noms, comparés à la migration par un test) et `ENV_ONLY_SECRET_NAMES` ; un nom « env seulement » renvoyé par une version modifiée de la fonction reste accepté.

Chargement (S-07, W-15, branche) : chaque lecture du Vault a un délai de 5 s et jusqu'à 2 nouvelles tentatives (300 ms puis 900 ms) sur erreur passagère (réseau, délai, HTTP 5xx ou 429). Seul un **succès** est gardé pour la vie de l'instance : après un échec, le chargement est retenté au besoin suivant (au plus tôt après 2 s, puis 4 s… jusqu'à 60 s). L'état est visible dans `GET /health/details`. Une clé de chiffrement absente ou non conforme ne fait plus jamais passer une connexion eBay en « Expirée » : la route répond « chiffrement indisponible (configuration) » et la connexion reste intacte. Un nouveau secret est pris en compte sans redéploiement, au démarrage d'une nouvelle instance (quelques minutes).

### Rotation de la clé de chiffrement

> **Statut** : préparée par le code de la branche `claude/remediation-audit` (`src/lib/crypto.ts`), **non déployée** au 23/10/2026, **jamais exercée**. À essayer d'abord en préproduction.

Principe :

- chaque texte chiffré porte la version de sa clé : `v1:…` pour la clé 1, `v1k<N>:…` pour une clé de version N ≥ 2 ;
- la colonne `key_version` des tables de secrets n'est qu'indicative ;
- le chiffrement utilise toujours la clé **courante** ;
- le déchiffrement utilise la clé de la version indiquée dans le texte.

| Variable | Rôle |
| --- | --- |
| `TOKEN_ENCRYPTION_KEY` | clé courante : 32 octets encodés en base64 (`openssl rand -base64 32`). Une valeur non conforme est refusée. |
| `TOKEN_ENCRYPTION_KEY_VERSION` | version de la clé courante (1 par défaut) |
| `TOKEN_ENCRYPTION_KEY_PREVIOUS` | anciennes clés, encore utilisées pour **déchiffrer** : `<version>:<clé base64>`, séparées par des virgules |
| `TOKEN_ENCRYPTION_KEY_FORMAT` | `passphrase-sha256` seulement si la clé courante historique n'est pas du base64 de 32 octets (compatibilité). La sortir par une rotation. |

Procédure, avec l'accord du titulaire :

1. Le code de rotation doit être déployé sur l'Edge **et** sur le web : les deux déchiffrent.
2. Générer la nouvelle clé hors ligne et la ranger d'abord dans le coffre ([`OPERATIONS.md` § 9.4](OPERATIONS.md#94-clé-token_encryption_key--copie-hors-ligne-q-08-d-05)).
3. Définir à l'identique dans les secrets de l'Edge **et** dans les variables Vercel :
   - `TOKEN_ENCRYPTION_KEY` = nouvelle clé ;
   - `TOKEN_ENCRYPTION_KEY_VERSION` = 2 (ou la version suivante) ;
   - `TOKEN_ENCRYPTION_KEY_PREVIOUS` = `1:<ancienne clé>`, à compléter avec les versions encore utilisées.

   Ces variables ont priorité sur le Vault.
4. Vérifier :
   - une connexion eBay se synchronise sans passer en « Expirée » ;
   - les nouveaux secrets écrits commencent par `v1k2:`.
5. **Garder l'ancienne clé dans `TOKEN_ENCRYPTION_KEY_PREVIOUS`** tant que des secrets chiffrés avec elle existent. Le jeton d'accès eBay est rechiffré à chaque rafraîchissement, mais le jeton de renouvellement et les identifiants fournisseurs ne le sont qu'à leur prochaine écriture : reconnexion ou nouvel enregistrement. Il n'existe pas encore de script de rechiffrement en masse. La fonction `reencryptSecret` existe, mais aucun outil ne l'appelle.
6. Ensuite seulement, retirer l'ancienne clé, puis aligner le Vault sur la clé courante pour les restaurations et la préproduction.

### Tâches planifiées

Elles reposent sur `pg_cron`, qui appelle `public.call_monstock_cron('<chemin>')`. Cette fonction lance un appel `net.http_post` asynchrone vers `/functions/v1/api/cron/<chemin>`, avec `CRON_SECRET` lu dans le Vault au moment de l'appel.

- **En production**, la fonction et les 5 tâches de base ont été créées à la main (`supabase/ops/schedule-edge-cron.sql`, URL du projet écrite en dur).
- La migration `20261023000700` (non appliquée) les **versionne** : l'URL est lue dans le secret Vault `PROJECT_URL`, et une base restaurée ou une préproduction appelle donc sa propre Edge.

| Tâche | Fréquence (UTC) | Route | Source |
| --- | --- | --- | --- |
| `monstock-ebay-sync` | toutes les 15 min | `/cron/sync` | ops / `0700` |
| `monstock-sourcing` | toutes les 6 h (h:07) | `/cron/sourcing` | ops / `0700` |
| `monstock-library-checks` | 04:23 | `/cron/library-checks` | ops / `0700` |
| `monstock-directory-checks` | 05:41 | `/cron/directory-checks` | ops / `0700` |
| `monstock-tracking` | h:17 et h:47 | `/cron/tracking` | ops / `0700` |
| `monstock-library-checks-rotation` | toutes les 3 h (h:53, de 01 h à 22 h) | `/cron/library-checks` | migration `20261023000230`, **non appliquée** |
| `monstock-sourcing-imports` | toutes les 5 min | `/cron/sourcing-imports` | migration `20261023000230`, **non appliquée**. Exige une Edge qui connaît la route. |

`cron.job_run_details` dit seulement que l'appel a été **émis**. Le résultat réel est dans `sync_runs` et `net._http_response` ([`OPERATIONS.md` § 7.2](OPERATIONS.md#72-diagnostic-sql-en-lecture-seule)).

Supervision (D-06, migration `20261023000810`, **non appliquée**) : la tâche `monstock-supervision` (toutes les 15 min, créée seulement si `pg_cron` est présent, sans appel HTTP ni secret) exécute `public.ops_supervise()`. Elle recopie dans `ops_supervision_events` les réponses non 2xx (ou en délai dépassé) de `net._http_response`, gardées 30 jours au lieu de ~6 h, et crée une alerte `sync_stale` dans `alerts` pour chaque connexion active sans synchronisation **réussie** depuis plus de 2 h (ou 2 × son intervalle s'il est plus long) ; l'alerte est résolue au retour d'une synchronisation réussie. Requêtes de lecture : [`OPERATIONS.md` § 8](OPERATIONS.md#8-supervision).

## 4. eBay : configuration

Guide détaillé, côté web compris : [`ebay-setup.md`](ebay-setup.md). Pour l'application iPhone et l'Edge :

1. <https://developer.ebay.com> → **Application Keys** → keyset **Production** : noter *App ID* et *Cert ID*.
2. **User Tokens → Get a Token from eBay via Your Application → Add eBay Redirect URL** :
   - *Your auth accepted URL* : `https://<ref>.supabase.co/functions/v1/api/ebay/callback` ;
   - *Your auth declined URL* : la même URL ;
   - *Privacy Policy URL* : obligatoire en production, par exemple `https://mon-stock-chi.vercel.app/confidentialite` ;
   - type **OAuth**. eBay affiche alors le **RuName**, qui va dans `EBAY_RU_NAME`.

   eBay n'accepte qu'une URL de retour par RuName. Celui-ci sert **l'iPhone**. La connexion depuis le site web demande un second RuName, `EBAY_WEB_RU_NAME` (côté Vercel, [`ebay-setup.md` § 2](ebay-setup.md#2-runame-et-url-de-retour)).
3. **Alerts & Notifications → Marketplace account deletion** :
   - endpoint : `https://<ref>.supabase.co/functions/v1/api/ebay/webhook` ;
   - jeton de vérification : `EBAY_WEBHOOK_VERIFICATION_TOKEN`, à copier depuis Supabase → Project Settings → Vault ;
   - puis « Send test notification ».
4. Supabase → **Edge Functions → Secrets** : ajouter `EBAY_ENV=production`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RU_NAME`. Jamais dans le dépôt ni dans l'application.
5. Vérifier : `GET /health` doit renvoyer `ebayConfigured: true`.
6. **Comptes connectés avant le 10/10/2026** : il faut les reconnecter une fois (scope `sell.account.readonly` ajouté).

Flux mobile :

1. `connect` (administrateur) ouvre la page eBay dans une session d'authentification système.
2. eBay redirige vers `/ebay/callback`, qui renvoie vers `monstock://ebay/callback?code&state`.
3. `finalize` échange le code : même utilisateur, même organisation, état à usage unique.
4. Les jetons sont chiffrés (AES-256-GCM) en base et jamais renvoyés, puis la première synchronisation démarre.

Un même compte eBay ne peut être relié qu'à une seule organisation (migration `20261023000110`). Les ventes déduisent le stock une seule fois (`ingest_external_order`, verrous et unicité en base, migration `20261023000120`). Les ventes antérieures à la première connexion sont importées sans mouvement de stock (`20261023000130`). Les annonces non associées à un SKU ne touchent pas le stock.

Synchronisation bornée et reprenable : échéance interne de 100 s, progression dans `channel_connections.sync_state`, curseur des commandes, runs abandonnés libérés après 10 min. Détail dans [`ebay-setup.md` § 6](ebay-setup.md#6-synchronisation-planifiée-cron). Runbook d'incident : [`OPERATIONS.md` § 7](OPERATIONS.md#7-runbook--incident-de-synchronisation-ebay).

Règles de stock des commandes synchronisées (testées en intégration) :

| Événement | Effet sur le stock |
| --- | --- |
| Nouvelle commande (ligne associée à un SKU) | −quantité, **une seule fois** (`order_items.inventory_applied`, index unique sur le mouvement) |
| Même commande resynchronisée / webhook rejoué | aucun effet |
| Annulation, ou remboursement **avant** expédition | +quantité, une seule fois |
| Remboursement **après** expédition | **aucun recrédit automatique**, car l'article n'est pas forcément revenu. Une alerte « Remboursement après expédition » est créée : enregistrer un « Retour client » si l'article revient. |
| Ligne associée à un SKU après coup | jamais déduite automatiquement : action explicite « Déduire les ventes en attente » |
| Vente antérieure à la première connexion du compte | importée pour l'analyse, sans mouvement de stock |

Déconnexion (`POST /ebay/disconnect`, administrateur) :

- les jetons sont supprimés de la base ;
- la connexion est marquée « déconnectée » ;
- les alertes de connexion sont résolues ;
- les annonces et commandes déjà importées restent (historique).

Limites de débit eBay : les réponses 429 / `Retry-After` sont respectées, avec un nouvel essai borné pour les lectures. **Jamais** de nouvel essai pour une écriture, afin d'éviter un doublon.

## 5. Fournisseurs professionnels

### 5.1 Annuaire (120 fournisseurs, recherches du 10 octobre 2026)

Données : `src/services/sourcing/data/supplier-directory.json` (copie et méthode :
[docs/research/suppliers-2026-10.md](research/suppliers-2026-10.md)). Première recherche : 63 fiches
(acteurs connus). Seconde recherche (FR, BE, NL, ES, DE, IT, PL, AT, CZ ; annuaires, exposants de
salons, boutiques B2B) : **57 fournisseurs moins connus**, dont :
- des grossistes d'iPhone par grade : Refreshed Apples, Mobile Depot Europe, Mobistock, Molano,
  ITP Technologie, TR Vertriebs ;
- des distributeurs à flux ou API : Nedis, Infortisa, DMI Computer, Megasur, Home Screen
  Distribution, MICHAEL AG, TelePart ;
- des grossistes de pièces : Horepa, Pieces2Mobile, mpsmobile, Mobiltec 24, GSMOK, Nowacell,
  Servisní díly, Fixje ;
- des lots de retours : BitStockz, Planet Outlet, Subastalotes ;
- des PC ex-entreprise : Ecoportátil, PC-Portátil, Bestellaptops, Omnicomp.

Chaque fiche contient : pays, zones de livraison, site, catalogue, catégories, marques, types de
produits, B2B/B2C, compte pro, conditions et modes d'accès, prix HT/TTC, devise, MOQ, livraison,
garantie, intérêt, procédure pour obtenir le catalogue, niveau de vérification et sources.

**Niveau d'accès réel** (calculé, affiché et filtrable dans l'application) :

| Niveau | Condition |
| --- | --- |
| connecté | source active ou import réussi dans votre organisation |
| importable | le fournisseur fournit un fichier, un flux, une API ou une liste de prix que MON STOCK importe |
| accessible | catalogue public vérifié depuis le serveur |
| vérifié | site officiel joignable depuis le serveur |
| identifié | fiche issue de la recherche, rien de vérifié |

Chaque fiche affiche aussi la **prochaine action** concrète (activer la source, demander le flux,
envoyer l'e-mail de liste de prix, importer le fichier…). Les statuts détaillés (vérifié, compte pro
requis, connecteur, import testé, indisponible) restent calculés comme avant.

**Contrôle réel des sites** depuis l'Edge Function (10 octobre 2026, robots.txt lu, aucun
contournement) : **102 / 120 joignables**.
- Première série, non joignables : eBay développeurs, Largo, Merkandi, Mobiparts, Westcoast, Fixez,
  Exertis, AFB France, Mobile Express HDE, Yes-yes.
- Seconde série, non joignables :
  - Megasur, Serviphone, Planet Outlet, Smartphone Italia : 403 anti-robot ;
  - Big Brand Depot, Omnicomp, Avides : aucune réponse ;
  - GSP Electronics : HTTP 500.

**Catalogues publics réellement exploitables** (éclaireur serveur `/cron/scout` sur 34 sites de la
seconde série, puis vérification de la bibliothèque) :
- **Refreshed Apples** (NL, iPhone par grade) : 117 fiches avec prix, plan du site + données
  structurées ;
- **Fixje** (NL, pièces) : 200 fiches avec prix, WooCommerce. Certaines fiches sont des prix de
  réparation : vérifiez chaque offre ;
- **Servisní díly** (CZ, pièces) : fiches avec prix en CZK, converties par les taux BCE.

Ces trois sources sont ajoutées à la bibliothèque, comme Brico-phone. Les autres refusent
l'automatisation, et MON STOCK le respecte :
- robots.txt interdit : Pieces2Mobile, ITP Technologie, Ingrosmart, Planet Outlet ;
- prix masqués sans compte : Punto Ingrosso (prix à 0) ;
- 429 : Shopify products.json ;
- catalogue rendu en JavaScript, sans données lisibles.

Pour toutes ces sources, le canal reste un compte pro avec un fichier ou une API.

### 5.2 Accès pratique aux catalogues

| Mode | Connecteur | État |
| --- | --- | --- |
| Fichier envoyé par le fournisseur (CSV/TSV/XLSX/XML/JSON) | Import de catalogue (`POST /sourcing/import`, § 2) | **fonctionnel, testé le 10/10/2026 sur la base de production, alors appelée « TEST »** (`/cron/import-selftest` : 6 offres + 1 ligne illisible ; fichier défectueux suspendu sans rien modifier ; mise à jour avec doublon ignoré) |
| Flux URL (CSV/XML/JSON) | `supplier_feeds` + moteur de sourcing (toutes les 6 h) | fonctionnel (tests d'intégration) ; à configurer avec l'URL du fournisseur |
| API officielle | eBay Browse, BigBuy, Ingram Micro (adaptateurs existants) | eBay : en attente des clés ; BigBuy / Ingram : identifiants du compte revendeur |
| Catalogue public | Sitemap + données structurées, WooCommerce Store API | vérifiés : Brico-phone, Refreshed Apples, Fixje, Servisní díly (prix publics) |
| Portail sans export | — | consultation manuelle ; demander un export (modèle d'e-mail fourni) |

**Protection des imports** (`src/domain/sourcing/import-quality.ts`) : avant toute écriture, le
fichier entier est lu. L'import est **suspendu, sans aucune modification**, si :
- plus de 50 % des lignes sont illisibles ;
- le catalogue fait moins de la moitié du dernier import ;
- plus de la moitié des références connues changent de prix de plus de 60 % (mauvaise colonne,
  HT/TTC, devise) ;
- la colonne de référence n'identifie pas les produits.

Les doublons (même référence) sont ignorés et signalés. Si le fichier est correct, l'utilisateur
peut confirmer : « Importer quand même ».

Modèles d'e-mail de demande d'accès (FR / EN) : générés par fournisseur dans l'application
(Réglages → Fournisseurs professionnels → fiche → « E-mail de demande d'accès » FR ou EN, ouvert dans la messagerie du téléphone), demandent un export
CSV/XLSX ou un accès API, les conditions (HT, MOQ, livraison France, garantie) et la fréquence de
mise à jour.

### 5.3 Bibliothèque de sources (contrôle quotidien)

| Source | Résultat | Mode d'accès |
| --- | --- | --- |
| **eBay France (API Browse officielle)** | en attente des clés eBay (§4) | API officielle |
| **Brico-phone** (FR, pièces) | ✅ vérifiée : produits avec prix relevés | catalogue public (sitemap + données structurées) |
| **Refreshed Apples** (NL, iPhone par grade) | ✅ vérifiée le 10/10/2026 : 117 produits avec prix | catalogue public (sitemap + données structurées) |
| **Fixje** (NL, pièces) | ✅ vérifiée le 10/10/2026 : 200 produits avec prix (dont prestations de réparation) | WooCommerce Store API publique |
| **Servisní díly** (CZ, pièces) | ✅ vérifiée le 10/10/2026 : produits avec prix en CZK | catalogue public (sitemap + données structurées) |
| Utopya, Certideal, Recommerce, Largo, Injured Gadgets, Merkandi, Fixez, Jobalots | ❌ robots.txt interdit ou 403 | compte / partenariat |
| Mobilax, Yes-yes, Refurbed, Eurolots, Wholesale Clearance, Cash Converters, Mobilesentrix EU, REWA, Foneday, MobileParts.shop, Replacebase, iFixit Pro EU, Stocklear, LDLC Pro, Destockplus, Easycash, Smaaart | ❌ pas de catalogue public lisible | compte pro, flux ou fichier |

## 6. Radar d'opportunités

Pour chaque offre fournisseur rapprochée d'un SKU (EAN/MPN exact ou validation manuelle) :

```
coût rendu   = prix HT (TTC ÷ (1 + TVA) si l'offre est TTC) + port fournisseur réparti + douane (hors UE)
               + TVA d'achat si elle n'est PAS récupérable (jamais supposée récupérable par défaut)
CA HT        = prix de vente (TTC ÷ (1 + TVA) en régime normal ; TVA sur marge : TVA due sur la marge)
marge brute  = CA HT − coût rendu
bénéfice net = marge brute − commission marketplace − frais de paiement − expédition client
               − emballage − provision retours
```

- Chaque coût inconnu est **listé** (« transport fournisseur », « commission », « TVA »…) et le
  résultat est marqué « estimé » ; sans prix de vente ni prix d'achat, aucun chiffre n'est affiché.
- Origine du prix affichée : API vérifiée, relevé public, catalogue importé, communiqué par le
  fournisseur, saisie manuelle ; fraîcheur (fraîche / à revérifier / périmée).
- Offres enregistrées (`sourcing_saved_offers`, prix figé à l'enregistrement), historique des prix,
  **brouillon de commande** uniquement : aucune commande n'est jamais envoyée automatiquement.
- Paramètres (administrateur) : régime de TVA, taux, TVA récupérable oui/non, commission, frais de
  paiement, port client, emballage, provision retours, droits de douane. Commission, paiement et
  port sont repris du canal eBay s'ils manquent.
- Vérifié le 10/10/2026 sur la base de production (alors appelée « TEST ») (`/cron/chain-selftest`) : SKU créé → fichier importé → offre rapprochée par EAN
  → radar « estimé », bénéfice calculé, coût manquant « transport fournisseur » signalé, origine
  « catalogue importé » → contrôle d'annonce eBay (2 erreurs : politiques et emplacement) →
  publication refusée → organisation temporaire supprimée.

## 7. Création et publication d'annonces eBay (préparé, publication verrouillée)

Implémenté (`src/integrations/ebay/listing.ts`, `src/services/channels/ebay-listing-service.ts`) :
- **Préparation** depuis un SKU : titre (80 car.), description, prix, quantité disponible réelle,
  EAN, caractéristiques connues (marque, modèle, capacité, couleur). Catégorie, état eBay et photos
  à choisir : MON STOCK ne convertit pas les grades A/B/C en états eBay.
- **Lecture du compte** : politiques métier (paiement, retour, expédition) et emplacements
  d'inventaire (Account API, scope `sell.account.readonly`).
- **Contrôle / simulation** : validation complète, contenu exact des appels
  (`PUT inventory_item/{sku}`, `POST offer`) affiché, aucune écriture chez eBay.
- **Publication** : `createOrReplaceInventoryItem` → offre existante réutilisée (`GET offer?sku=`,
  anti-doublon) ou `createOffer` → `publishOffer` ; en-tête `Content-Language: fr-FR` ; aucun
  nouvel essai automatique d'un POST.
- **4 verrous**, tous obligatoires : `EBAY_LISTING_ENABLED=true` sur le serveur, administrateur,
  confirmation explicite dans l'application, compte eBay connecté.
- **Compte et SKU (I-31, branche)** : avec plusieurs comptes eBay connectés, le compte de
  publication doit être choisi (`connectionId`), sinon refus sans aucun appel à eBay. Avant tout
  appel, le SKU est comparé aux annonces **actives** de ce compte connues par la synchronisation
  (`channel_listings`, y compris les annonces Trading) : s'il est déjà utilisé, refus (409) avec le
  numéro de l'annonce existante, à modifier sur eBay. Le contrôle (`/ebay/listings/check`) affiche
  les mêmes blocages.
- Mise à jour prix/quantité groupée (`bulk_update_price_quantity`) : construite et testée, non
  exposée.

**Jamais exécuté contre eBay** (clés absentes) : la publication réelle reste à tester sur un
compte réel, avec votre autorisation, sur une annonce de test.

## 8. IA (OpenAI)

- Fournisseur OpenAI, API Chat Completions en flux (`src/services/ai/llm.ts`, interface neutre `LlmClient`). Modèle `gpt-5.4-mini` par défaut (`OPENAI_MODEL` pour changer), `store: false`, `prompt_cache_key` pour le cache d'invite, refus et filtre de contenu traités comme refus.
- **Produit dicté** : la transcription (reconnaissance vocale du téléphone) est envoyée au
  serveur ; le modèle renvoie un JSON imposé par schéma strict (`response_format: json_schema`), revalidé par Zod. Consigne : rien d'inventé,
  valeurs non dites laissées vides. La création reste confirmée par l'utilisateur.
- **Assistant** : boucle d'outils (8 étapes max), outils en lecture seule filtrés sur
  l'organisation active et exécutés avec le client Supabase de l'utilisateur (RLS). La consigne
  impose que chaque chiffre provienne d'un résultat d'outil ; la réponse liste les données
  consultées.
- **Quotas** (table `ai_usage_events`, vérifiés AVANT tout appel au modèle) : 40 questions / heure /
  utilisateur, 60 brouillons / heure / utilisateur, 400 appels / jour / organisation → « Limite
  atteinte » (429).
- **Délais** : 55 s par appel, 1 nouvel essai, 110 s pour toute la boucle (limite Edge ≈ 150 s).
- **Sans clé** : « non configuré » (aucune réponse simulée) ; le reste de l'application fonctionne.
- Vérifié sur la base de production (alors appelée « TEST ») (`/cron/ai-tools-check`) : les 6 outils s'exécutent sur le schéma réel. Appel au
  modèle non exécuté : clé non configurée.

## 9. Sécurité de la base

- Revue à jour des fonctions SECURITY DEFINER, durcissements et contrôles avant production : [`MIGRATIONS.md` § 7 et § 8](MIGRATIONS.md#8-revue-des-fonctions-security-definer-q-17).
- Ancien audit du 10/10/2026 : [`archive/SERVER-audit-securite-2026-10-10.md`](archive/SERVER-audit-securite-2026-10-10.md).
- Tests qui énumèrent automatiquement tables, vues et fonctions : `tests/integration/security-catalog.test.ts`, `security-tenant-matrix.test.ts`, `security-roles.test.ts`.

## 10. « Mes outils » : expédition et suivi de colis

Comparatif des API : [docs/research/shipping-tracking-apis-2026-10.md](research/shipping-tracking-apis-2026-10.md).

### 10.1 Calculs locaux (sans serveur)

- **Outils concernés :** TVA, marge, prix de vente, frais eBay, remise.
- **Où :** modules purs `src/domain/tools/*` (tests `tests/unit/tools-calculators.test.ts`).
- **Calcul exact :** fractions BigInt, arrondi au centime uniquement à l'affichage.
- **Marge et prix de vente :** même fonction que le radar (`computeUnitEconomics`).
- **Convertisseur de devises :** taux BCE de la table `fx_rates`, avec leur date.

### 10.2 Comparateur de frais de port

| Source | Connecteur | État |
| --- | --- | --- |
| Packlink PRO | `src/integrations/shipping/packlink.ts` (contrat du code officiel `packlink-dev/ecommerce_module_core`) | prêt ; **en attente de `PACKLINK_API_KEY`** ; hôte joignable (contrôle sans clé) |
| Boxtal API v1 | `src/integrations/shipping/boxtal.ts` (contrat du SDK officiel `boxtal/php-library`) | prêt ; **en attente des identifiants v1 et du code de contenu** ; point d'accès actif (401 sans identifiants) |
| Sendcloud API v3 | `src/integrations/shipping/sendcloud.ts` : `POST /api/v3/shipping-options` uniquement (devis, jamais d'étiquette ni d'envoi) | prêt ; **en attente de `SENDCLOUD_PUBLIC_KEY` / `SENDCLOUD_SECRET_KEY`** ; format vérifié sur une réponse réelle du compte (11/10/2026, appel en lecture seule hors MON STOCK) |
| Grilles de l'utilisateur | table `shipping_rate_cards` (RLS), calcul local ; affichées comme **estimations** | **fonctionnel** |

Sans plateforme ni grille : aucun prix, message explicite (« MON STOCK n'invente aucun prix »).

Règles communes des devis (`optionFromQuote`) :
- un prix nul, négatif ou illisible n'est jamais une offre ;
- HT / TTC n'est indiqué que si l'API le précise. Sendcloud ne le précise pas, donc l'app affiche « HT/TTC inconnu » ;
- Sendcloud : les offres non suivies, en erreur, sans prix ou sans devise sont écartées et comptées dans le message de la source (« N offres écartées ») ;
- les suppléments (carburant…) sont détaillés ;
- délai : seulement le `lead_time` renvoyé, converti d'heures en jours.

> Les clés de plateforme sont celles du serveur : tous les utilisateurs de ce déploiement voient
> les devis de ce compte. En exploitation multi-clients, prévoir une clé par organisation.

### 10.3 Suivi de colis

| API | Pour | Connecteur | État |
| --- | --- | --- | --- |
| La Poste Suivi v2 (officiel, gratuit) | La Poste, Colissimo, Chronopost | `src/integrations/tracking/laposte.ts` | prêt ; **en attente de `LAPOSTE_OKAPI_KEY`** ; point d'accès actif (401 sans clé) |
| DHL Shipment Tracking - Unified (officiel, gratuit) | DHL (Express, Parcel, eCommerce) | `src/integrations/tracking/dhl.ts` | prêt ; **en attente de `DHL_API_KEY`** ; 250 appels / jour, 1 appel / 5 s au départ |
| Ship24 (multi-transporteurs, détection automatique) | tous les autres transporteurs | `src/integrations/tracking/ship24.ts` (spécification OpenAPI officielle) | prêt ; **en attente de `SHIP24_API_KEY`** ; point d'accès actif |
| Pages publiques des transporteurs + 17TRACK (gratuit, sans clé) | tous | `carrierTrackingUrl` (`src/domain/tools/tracking.ts`) | actif : bouton « Suivre sur le site du transporteur » dans le détail d'un colis, ouvert dans le navigateur (aucune donnée envoyée par MON STOCK) |

Ordre de choix : API officielle gratuite (La Poste pour son groupe, DHL pour DHL), sinon Ship24.
Migration `20261012000100_tracking_dhl_provider.sql` (additive : élargit `tracked_parcels.provider`
à `dhl` ; retour arrière manuel dans `supabase/ops/rollback/`).

- **Colis :** table `tracked_parcels` (RLS, garde « même organisation »).
- **Colonnes réservées au serveur :** le statut, l'historique, la date estimée et la source ne
  sont écrits que par le serveur. Le déclencheur `tracked_parcels_client_guard` refuse toute
  modification par l'application, ce que testent les tests d'intégration.
- **Actualisation automatique** (`/cron/tracking`, deux fois par heure, 30 colis par passage) :
  - toutes les 2 h si le colis est en cours de livraison, 4 h s'il est en transit, 8 h si
    l'étiquette est seulement créée ;
  - arrêt une fois le colis livré, après 7 jours si le numéro est introuvable, et après 60 jours
    au total ;
  - sans clé : nouvel essai toutes les 12 h, sans aucun statut écrit.
- **Alertes** (table `alerts`, sans doublon) :
  - colis livré ;
  - problème (échec de livraison, incident, retour) ;
  - retard, uniquement si l'API a fourni une date estimée désormais dépassée.
- **Données transmises :** le numéro de suivi et, s'il est connu, le pays de destination. Aucune
  donnée client.
- **Clé refusée (I-17, branche)** : au premier refus de la clé La Poste (HTTP 401 / 403), le
  fournisseur est coupé pour le reste du passage (une seule requête avec la clé refusée), une
  **alerte unique** par organisation concernée est créée (`alerts`, clé
  `tracking_provider_auth:laposte`) et une ligne d'erreur est écrite dans les journaux. Le colis
  bascule aussitôt vers Ship24 (ou DHL selon le transporteur) si ces clés sont configurées ; sinon
  il est replanifié 6 h plus tard sans nouvel appel. L'alerte ouverte sert d'état partagé entre
  instances : tant qu'elle date de moins de 6 h, La Poste n'est plus appelée ; ensuite un essai est
  refait, et un succès résout l'alerte. `/tools/status` n'affiche plus La Poste comme utilisable
  pendant ce temps.
- **Budget de temps (I-17, branche)** : `/cron/tracking` s'arrête de commencer des colis après
  90 s (marge de 20 s par colis) ; les suivants restent dus et passent au passage suivant
  (`deferred` dans la réponse). Les appels Ship24 sont bornés par cette échéance.

### 10.4 Activer une plateforme ou une API (aucune clé dans le dépôt)

1. Créer le compte chez le fournisseur et générer la clé (voir §3).
2. Supabase → Edge Functions → **Secrets** : ajouter la variable.
3. Vérifier :
   - `GET /health` → `shippingProviders` / `trackingProviders` ;
   - application → Outils → Frais de port ou Suivi de colis.
4. Contrôle des points d'accès : `select public.call_monstock_cron('connectors-probe');`.
