# Site web — mise en ligne sur Vercel

Le site (Next.js 16, racine du dépôt) contient le **site public** (accueil, confidentialité,
conditions, mentions légales, support) et l'**application web** (mêmes comptes, mêmes données que
l'application iPhone, base Supabase `MON-STOCK`, région UE).

## 1. Importer le dépôt

1. vercel.com → **Add New… → Project** → importer `AizenPYTH/MON-STOCK`.
2. **Framework** : Next.js (détecté). **Root Directory** : la racine du dépôt (laisser vide).
   Build et installation par défaut (`npm install`, `next build`). Node 22 (champ `engines`).
3. **Production Branch** : la branche par défaut du dépôt, `claude/laughing-bardeen-bdn16j`.
   Chaque push sur cette branche publie le site ; les autres branches donnent des aperçus.

## 2. Variables d'environnement (Settings → Environment Variables)

| Variable | Valeur | Secret ? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ccywsegdowikeirbsfae.supabase.co` | non |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé **publishable** du projet (`sb_publishable_…`, la même que l'application iPhone, `apps/mobile/eas.json`) | non |
| `NEXT_PUBLIC_APP_URL` | l'adresse du site, ex. `https://mon-stock.vercel.app` (sans `/` final) | non |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → clé **secrète** (`sb_secret_…`) ou `service_role` | **oui** — uniquement dans Vercel, jamais dans Git |

C'est tout. Au démarrage, le serveur lit dans le **Vault Supabase** les secrets partagés avec
l'application iPhone (`TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `EBAY_WEBHOOK_VERIFICATION_TOKEN`,
voir `src/instrumentation.ts`) : le web chiffre et déchiffre avec la même clé que le serveur de
l'application. Une variable définie dans Vercel garde la priorité (à ne faire qu'en connaissance
de cause : une autre `TOKEN_ENCRYPTION_KEY` rendrait illisibles les jetons existants).

Facultatif plus tard (fonctions qui appellent des services tiers depuis le web) : `EBAY_*`,
`OPENAI_API_KEY`, `SENDCLOUD_*`, `LAPOSTE_OKAPI_KEY` — tant qu'elles manquent, les écrans concernés
l'indiquent clairement.

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
  Les routes `/api/cron/*` restent appelables manuellement avec `Authorization: Bearer $CRON_SECRET`.
- **eBay** : l'adresse de retour OAuth et les notifications enregistrées chez eBay pointent vers
  l'Edge Function Supabase. La connexion eBay se fait depuis l'application iPhone ; la reprendre
  sur le web demande de déclarer une nouvelle adresse chez eBay (`docs/ebay-setup.md`).

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
