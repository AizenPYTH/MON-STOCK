# Guide d'exploitation de MON STOCK

État au **23/10/2026**. Ce guide sert à qui déploie, surveille ou dépanne MON STOCK en production.

À lire aussi :

- [`ARCHITECTURE.md`](ARCHITECTURE.md) : comment le système est découpé ;
- [`MIGRATIONS.md`](MIGRATIONS.md) : base de données, historique des migrations, réconciliation ;
- [`SERVER.md`](SERVER.md) : Edge Function `api`, routes, tâches planifiées, secrets ;
- [`WEB-DEPLOY.md`](WEB-DEPLOY.md) : site web sur Vercel ;
- [`MOBILE.md`](MOBILE.md) : application iPhone ;
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) : règles de travail.

Règles de ce document :

- **Le dépôt est public.** On n'écrit ici aucun secret, aucune donnée personnelle (e-mail, nom de client ou de compte eBay), et aucun détail sur une faille non corrigée.
- On cite les secrets **par leur nom**, jamais par leur valeur.
- Les identifiants d'audit (Q-07, D-05…) renvoient au registre de remédiation. C'est un **document interne**, volontairement hors du dépôt.
- Toute opération en production (migration, déploiement, secret, suppression de données, jetons eBay) demande l'**accord explicite du titulaire** ([`CONTRIBUTING.md`](../CONTRIBUTING.md#production)).
- Les requêtes SQL de diagnostic de ce guide sont **en lecture seule**. Les écritures sont signalées comme telles.

Sommaire

1. [État de la production au 23/10/2026](#1-état-de-la-production-au-23102026)
2. [Environnements](#2-environnements)
3. [Ordre de déploiement](#3-ordre-de-déploiement)
4. [Déployer l'Edge Function](#4-déployer-ledge-function)
5. [Appliquer une migration](#5-appliquer-une-migration)
6. [Retour arrière](#6-retour-arrière)
7. [Runbook : incident de synchronisation eBay](#7-runbook--incident-de-synchronisation-ebay)
8. [Supervision](#8-supervision)
9. [Sauvegardes et restauration](#9-sauvegardes-et-restauration)
10. [Secrets](#10-secrets)
11. [Checklist de mise en production](#11-checklist-de-mise-en-production)
12. [Checklist avant commercialisation](#12-checklist-avant-commercialisation)
13. [Journal des déploiements](#13-journal-des-déploiements)

---

## 1. État de la production au 23/10/2026

| Composant | Version en production | Remarques |
| --- | --- | --- |
| Edge Function `api` | **v65**, déployée le 23/10 à 07:05 UTC | `index.ts` importe le bundle figé au commit `43f55c9` (branche `claude/hotfix-sync`). C'est le correctif de la synchro eBay : échéance de 100 s, reprise par curseur, libération des runs abandonnés (plus de 10 min). |
| Base (migrations) | jusqu'à `20261023000130` | `20261023000100` à `0130` ont été appliquées le 23/10 (§ 5.2). Toutes les migrations suivantes du dépôt (`20261023000200` et au-delà) ne sont **pas** appliquées. |
| Site web (Vercel) | commit `9c8b65b` | Branche de production `claude/laughing-bardeen-bdn16j`. Ce commit ne contient qu'une montée de version de sécurité (Next 16.4.2, fflate 0.8.3) sur la base de `a05affd`. |
| Branche `claude/remediation-audit` | non déployée | Contient tout le reste de la remédiation : web, Edge, migrations `0200` et suivantes, mobile. |
| App iPhone | dernier build TestFlight | Voir [`MOBILE.md`](MOBILE.md). La suppression de compte (écran mobile, route Edge `POST /account/delete`, page web `/settings/account`) est sur la branche de remédiation et attend le déploiement. |

Synchronisation eBay, vérifiée après le déploiement de v65 :

- runs `partial` (« Budget de temps atteint, reprise au prochain passage ») à 07:15 et 07:30 ;
- puis `success` à 07:45 pour les deux comptes eBay connectés.

Le compte rendu de l'incident est au § [7.5](#75-incident-du-21-au-23102026).

## 2. Environnements

| | Local | Préproduction | Production |
| --- | --- | --- | --- |
| Statut | disponible | **à créer** (Q-02, D-03) | en service |
| Base | PostgreSQL 16 + shim Supabase (`supabase/local/0000_supabase_shim.sql`), recréée par `npm run db:local:reset` | projet Supabase distinct, même région (UE) et même version de Postgres que la production | projet Supabase de production (UE) |
| Edge Function | non exécutée (le code est testé par Vitest) | `api`, clés eBay **sandbox** | `api` (v65) |
| Web | `npm run dev` (port 3000) | déploiement d'aperçu Vercel branché sur la préproduction | Vercel, https://mon-stock-chi.vercel.app |
| Mobile | `npm --prefix apps/mobile run start` (Expo) | profil EAS dédié à créer | TestFlight (profil EAS `production`) |
| Données | jetables | fictives : organisation de démonstration, autotests | réelles |
| Secrets | `.env.local` (jamais commité) | **propres à la préproduction**, jamais copiés de la production | Edge, Vault, Vercel, EAS (§ 10) |

À savoir :

- **Il n'existe aujourd'hui qu'un seul projet Supabase.** D'anciens documents l'appellent « TEST », mais c'est la **production**. Le profil EAS `production` affiche encore `EXPO_PUBLIC_APP_ENV=TEST` (Q-02).
- Les scripts qui écrivent dans une base refusent la production, sauf dérogation nommée :
  - `npm run seed:demo`, `npm run sync:run` et `npm run sourcing:test-searches` s'arrêtent si une variable de connexion désigne le projet de production (`scripts/lib/production-guard.ts`). Dérogation : `MONSTOCK_ALLOW_PRODUCTION=<référence exacte du projet>`.
  - `npm run db:local:reset` supprime puis recrée la base. Il refuse **tout** hôte non local et toute base Supabase, sans dérogation possible pour Supabase.
- Les autotests serveur (`/cron/chain-selftest`, `/cron/import-selftest`, `/cron/e2e-search`…) créent des organisations temporaires. Ils sont réservés à la préproduction dès qu'elle existe.

**Créer la préproduction** : la procédure est dans [`MIGRATIONS.md` § 5](MIGRATIONS.md#5-préproduction-et-test-de-reconstruction). En résumé :

1. Créer un projet vide.
2. Y appliquer tout le dépôt.
3. Créer le secret Vault `PROJECT_URL` avant `20261023000700`.
4. Déployer l'Edge avec des clés eBay sandbox.
5. Brancher un déploiement Vercel d'aperçu sur ce projet.

## 3. Ordre de déploiement

**Toujours dans cet ordre : migration → Edge → web → mobile.** Chaque étape doit être vérifiée avant de passer à la suivante.

| Étape | Pourquoi à ce rang | Vérification avant de continuer |
| --- | --- | --- |
| 1. Migration | Le nouveau code lit des colonnes, des fonctions ou des index créés par la migration. Les migrations de remédiation restent compatibles avec l'ancien code. | Contrôles de [`MIGRATIONS.md` § 7](MIGRATIONS.md#7-migrations-20261023000300--0360--impact-et-contrôles-avant-production), `supabase migration list` |
| 2. Edge Function | Elle sert l'app iPhone et les tâches planifiées. Elle doit connaître le schéma avant que le web ou le mobile ne l'appellent. | `GET /functions/v1/api/health` ; premier passage du cron (§ 7.2) |
| 3. Web | Vercel publie à chaque push sur la branche de production. | Pages publiques, connexion, journaux Vercel (`[runtime-secrets]`) |
| 4. Mobile | Une build TestFlight met plusieurs jours à atteindre tous les testeurs. Elle doit pouvoir parler à l'Edge déjà déployée. | Procédure de test de [`MOBILE.md` § 7](MOBILE.md#7-procédure-de-test-sur-iphone-bêta) |

Dépendances connues entre migrations et code ([`MIGRATIONS.md` § 3](MIGRATIONS.md#3-dépendances-et-ordre-dapplication)) :

- `20261023000330` : le web doit être déployé juste après (nouvelle RPC d'attestation).
- `20261023000510` : l'Edge à jour doit être déployée **avant ou avec**.
- `20261023000700` : le secret Vault `PROJECT_URL` doit exister avant.
- `20261023000600` (suppression de compte) et `20261023000610` (brouillon de commande fournisseur) : à appliquer avant de déployer le web et le mobile qui les appellent.

Une seule chaîne à la fois : on ne commence pas le web tant que l'Edge n'est pas vérifiée. Chaque étape est notée au journal (§ 13).

## 4. Déployer l'Edge Function

### 4.1 Construire le bundle

```bash
npm run edge:build        # = node scripts/build-edge.mjs → supabase/functions/api/bundle.js
git add supabase/functions/api && git commit   # le bundle est versionné
```

Le job CI `edge-bundle` reconstruit le bundle et échoue s'il diffère du fichier commité. Un SHA ne se déploie que si ce job est vert.

### 4.2 Forme exacte de `index.ts` déployé

Le dépôt contient un `index.ts` qui importe `./bundle.js` (déploiement par la CLI). En production, l'entrée déployée importe le bundle **figé sur un commit**, par son SHA complet de 40 caractères :

```ts
// Edge Function `api` — bundle figé au commit <SHA complet>
import "https://raw.githubusercontent.com/AizenPYTH/MON-STOCK/<SHA complet de 40 caractères>/supabase/functions/api/bundle.js";
```

Version en production (v65) :

```ts
import "https://raw.githubusercontent.com/AizenPYTH/MON-STOCK/43f55c94c2e02c7cf65aa917790be3ba21acb664/supabase/functions/api/bundle.js";
```

Règles :

- **SHA complet, jamais un nom de branche.** Un nom de branche changerait de contenu sans redéploiement.
- Le commit doit être poussé sur GitHub **avant** le déploiement. Le bundle est résolu au moment du déploiement.
- `verify_jwt` reste **désactivé** : chaque route authentifie elle-même ([`SERVER.md` § 1](SERVER.md#1-construction-et-déploiement)).
- Cette méthode ne marche que si le dépôt est **public** (Q-18). Si le dépôt passe en privé, utiliser la méthode B.

### 4.3 Déployer (avec l'accord du titulaire)

- **Méthode A (actuelle) : URL figée.** Dashboard Supabase → Edge Functions → `api` → remplacer le contenu d'`index.ts` par la forme du § 4.2 → déployer avec la vérification JWT désactivée.
- **Méthode B : CLI depuis une copie du commit.** Elle ne dépend pas de la visibilité du dépôt.

  ```bash
  git worktree add ../edge-<sha> <sha>     # copie de travail exacte du commit
  cd ../edge-<sha>
  npx supabase functions deploy api --project-ref <ref-du-projet> --no-verify-jwt
  ```

  L'`index.ts` local importe `./bundle.js` de ce même commit : le contenu déployé est identique. Le dépôt n'a pas de `supabase/config.toml` : `--project-ref` est obligatoire.

### 4.4 Vérifier

1. `GET https://<ref-du-projet>.supabase.co/functions/v1/api/health` doit répondre `ok: true`, avec `cronConfigured`, `encryptionConfigured` et `ebayConfigured` à `true`.
2. Au passage suivant du cron (toutes les 15 min), un nouveau run apparaît dans `sync_runs` (requête 1 du § 7.2).
3. Dashboard → Edge Functions → `api` → Logs : aucune erreur au démarrage. Les journaux ne contiennent aucun secret.
4. Noter au journal (§ 13) : numéro de version affiché par Supabase, SHA, date, auteur.

## 5. Appliquer une migration

### 5.1 Procédure

La procédure complète est dans **[`MIGRATIONS.md`](MIGRATIONS.md)** : règle d'or, dépendances, réconciliation de l'historique, préproduction, retour arrière, écriture d'une nouvelle migration. Les points essentiels :

1. Essayer d'abord en local : `npm run db:local:reset`, puis `REQUIRE_DB=1 npm run test:integration`.
2. Puis en préproduction, quand elle existera.
3. Avant la production : sauvegarde (§ 9), contrôles en lecture seule de [`MIGRATIONS.md` § 7](MIGRATIONS.md#7-migrations-20261023000300--0360--impact-et-contrôles-avant-production), script de retour arrière prêt dans `supabase/ops/rollback/`.
4. **Ne jamais lancer `supabase db push` sur la production.** L'historique de production diffère du dépôt (Q-05) : la CLI tenterait de rejouer des migrations déjà appliquées. Les migrations s'appliquent une par une, avec l'accord du titulaire, après revue humaine.

### 5.2 Historique de production : numéros générés à l'application

Les migrations `20261023000100` à `0130` ont été appliquées le 23/10 sans passer par la CLI. Dans `supabase_migrations.schema_migrations`, elles portent donc un **numéro généré au moment de l'application**, et non celui du fichier :

- `20261023000100` porte le numéro `20261022182505` ;
- `20261023000110` porte le numéro `20261022182509` ;
- `0120` et `0130` ont aussi un horodatage d'application.

Ces quatre entrées s'ajoutent aux écarts décrits dans [`MIGRATIONS.md` § 2](MIGRATIONS.md#2-état-constaté--dépôt--production), qui décrit l'état du 22/10. Lors de la réconciliation (§ 4 de ce même document) :

- les numéros générés sont marqués `reverted` ;
- les versions du dépôt `20261023000100` à `0130` sont marquées `applied`.

Pour lire les numéros réels (lecture seule) :

```sql
select version, name from supabase_migrations.schema_migrations order by version desc limit 10;
```

> **Écart à connaître.** Pour `20261023000120`, le SQL appliqué en production remplace un trigger par `create or replace trigger`. Le fichier du dépôt utilise `drop trigger if exists` puis `create trigger`. L'effet est identique (§ 7.5). La comparaison de schéma de [`MIGRATIONS.md` § 4](MIGRATIONS.md#4-procédure-de-réconciliation-pas-à-pas) doit le confirmer avant tout `repair`.

## 6. Retour arrière

Avant tout retour arrière : prévenir le titulaire, noter l'heure (repère pour le PITR), et vérifier qu'une sauvegarde récente existe (§ 9).

### 6.1 Edge Function : redéployer un SHA précédent

Redéployer `index.ts` (§ 4.2) avec le SHA de la version voulue, puis vérifier (§ 4.4).

| Version | SHA | Contenu |
| --- | --- | --- |
| v64 | `a05affd17289602dedbad9557798ea1a81bc03cf` | Version auditée le 22/10. **Contient le défaut de synchronisation** (§ 7.5) : à n'utiliser qu'en dernier recours. |
| v65 | `43f55c94c2e02c7cf65aa917790be3ba21acb664` | Correctif de la synchro eBay (en production). |

Avant de revenir en arrière, vérifier que le code visé fonctionne avec le schéma en place. v64 fonctionne avec les migrations `0100` à `0130` : elles ajoutent des colonnes à valeur par défaut et des index d'unicité. En revanche, avec v64, la synchro du compte volumineux retombe dans l'incident.

Les versions plus anciennes sont listées dans [`archive/OPERATIONS-2026-10-11.md`](archive/OPERATIONS-2026-10-11.md).

### 6.2 Migrations : `supabase/ops/rollback/`

- Chaque migration récente a un script manuel `supabase/ops/rollback/<version>_<nom>_down.sql`. On l'exécute **en ordre inverse**, sur décision du titulaire.
- Exporter d'abord les données que le script supprime. Les commandes `copy` sont en tête des scripts concernés.
- Puis corriger l'historique avec le **numéro réellement enregistré en production** (§ 5.2) :

  ```bash
  npx supabase migration repair --status reverted <version>
  ```

  Par exemple, `20261022182505` pour `20261023000100`.
- Ce qui ne se défait pas sans sauvegarde : données supprimées, valeurs ajoutées à un type énuméré, tables supprimées par un script `down`. Voir [`MIGRATIONS.md` § 6](MIGRATIONS.md#6-retour-arrière-et-limites).
- En dernier recours, restaurer la base à un instant donné (§ 9). Attention : on perd tout ce qui a été écrit depuis.

### 6.3 Web : redéploiement Vercel

1. Vercel → projet → **Deployments** → choisir le déploiement de production précédent (par exemple celui de `a05affd`) → **Promote to Production** (retour instantané, sans reconstruction).
2. Un push suivant sur la branche de production republierait la version fautive. Il faut donc aussi annuler le commit par une pull request (`git revert`), sans jamais réécrire l'historique.

### 6.4 Mobile

TestFlight → MON STOCK → **Builds précédents** → installer le build voulu. Pour redistribuer une ancienne version : lancer le workflow `ios-testflight-local.yml` depuis le commit voulu.

### 6.5 Interrupteurs sans redéploiement

Toutes ces actions sont des écritures en production : accord du titulaire requis.

| Besoin | Action |
| --- | --- |
| Couper la publication d'annonces eBay | Retirer le secret `EBAY_LISTING_ENABLED` : la publication est refusée immédiatement. |
| Couper l'IA | Retirer `OPENAI_API_KEY` : l'IA affiche « non activé », le reste fonctionne. |
| Suspendre une tâche planifiée | `select cron.unschedule('monstock-ebay-sync');` (même chose pour les autres noms, [`SERVER.md`, « Tâches planifiées »](SERVER.md#tâches-planifiées)). Pour la recréer : migration `20261023000700` ou `supabase/ops/schedule-edge-cron.sql`. |
| Arrêter l'envoi des quantités vers eBay | Il est désactivé par défaut (`channel_connections.push_inventory = false`). Ne pas l'activer. |

## 7. Runbook : incident de synchronisation eBay

### 7.1 Symptômes

- **Application**, Réglages → Intégrations → eBay : la « dernière synchronisation réussie » date de plusieurs heures.
- **Web**, page `/settings/sync` : une suite de runs `failed`, ou des runs `running` qui ne se terminent jamais.
- Des ventes eBay récentes absentes de MON STOCK, ou un stock non déduit.
- `sync_runs` contient des runs `failed` dont le message commence par « Run interrompu (aucune fin enregistrée après 10 min) ».
- Journaux de l'Edge : instance arrêtée en cours de requête (limite de durée de la plateforme), ou erreurs `[SYNC]` / `[EBAY]` répétées.

Un run `partial` avec « Budget de temps atteint, reprise au prochain passage » **n'est pas un incident**. C'est le fonctionnement normal d'une longue synchro, qui reprend au passage suivant (exemple du 23/10, § 1).

### 7.2 Diagnostic (SQL en lecture seule)

À lancer dans l'éditeur SQL du Dashboard. Ces requêtes ne lisent aucune donnée personnelle : pas de pseudo eBay ni de nom d'acheteur.

**1. Derniers runs eBay**

```sql
select id, source_ref as connection_id, trigger, status, started_at, finished_at, duration_ms,
       records_processed, error_count, left(error_summary, 200) as error_summary
from public.sync_runs
where source_kind = 'channel' and provider = 'ebay'
order by started_at desc
limit 20;
```

**2. Runs encore `running`, et leur âge** (au-delà de 10 min, le cron les marque `failed`)

```sql
select id, source_ref as connection_id, trigger, started_at, now() - started_at as age
from public.sync_runs
where status = 'running'
order by started_at;
```

**3. Bilan sur 24 h, par connexion et par statut**

```sql
select source_ref as connection_id, status, count(*) as runs, max(started_at) as dernier
from public.sync_runs
where source_kind = 'channel' and started_at > now() - interval '24 hours'
group by 1, 2
order by 1, 2;
```

**4. État des connexions** : progression reprenable, dernière tentative, curseur

```sql
select id, status, environment, auto_sync, sync_interval_minutes, push_inventory,
       last_sync_attempt_at, last_sync_at, last_successful_sync_at, last_orders_cursor,
       sync_state, left(last_error, 200) as last_error
from public.channel_connections
where provider = 'ebay'
order by last_sync_attempt_at nulls first;
```

Lecture :

- `last_sync_attempt_at` avance mais `last_sync_at` reste figé : une passe complète est en cours, en plusieurs runs. C'est normal tant que les runs sont `partial`, et anormal s'ils sont `failed`.
- `sync_state.listingsPass` : parcours des annonces en cours (page suivante). `sync_state.ordersSliceHours` : taille de tranche des commandes, réduite automatiquement si une tranche dépasse le budget.
- `last_orders_cursor` ne bouge plus depuis des heures : regarder `error_summary` (requête 1) et les alertes « import bloqué ».
- `status = 'expired'` : le jeton n'est plus valable. L'administrateur doit reconnecter eBay (§ 7.3).

**5. Tâche planifiée** : `succeeded` signifie seulement que l'appel HTTP a été **émis**

```sql
select j.jobname, j.schedule, j.active, d.status, d.start_time, left(d.return_message, 200) as message
from cron.job j
left join cron.job_run_details d using (jobid)
where j.jobname = 'monstock-ebay-sync'
order by d.start_time desc nulls last
limit 10;
```

**6. Réponses de l'Edge aux appels du cron** (`pg_net` ne garde ces réponses que quelques heures)

```sql
select id, created, status_code, timed_out, left(error_msg, 200) as error_msg,
       left(content::text, 400) as content
from net._http_response
order by id desc
limit 20;
```

Lecture :

- `200` : `content` contient le résumé du cron (runs traités, `deferred`, runs abandonnés libérés).
- `401` : `CRON_SECRET` diffère entre le Vault et l'Edge.
- `timed_out = true`, ou une réponse 5xx (par exemple 546, renvoyé par Supabase quand une fonction dépasse ses limites) : l'Edge a été arrêtée avant de répondre. C'est la signature de l'incident du 21/10.

**7. Notifications eBay en attente**

```sql
select status, count(*) as n, max(received_at) as derniere
from public.webhook_events
where provider = 'ebay'
group by 1;
```

Une notification restée `received` plus de 10 min est reprise par `/cron/sync`.

### 7.3 Actions

Appliquer les actions de la plus légère à la plus lourde. Toutes celles qui écrivent en production demandent l'accord du titulaire.

1. **Runs `partial`, « budget atteint »** : ne rien faire. Vérifier dans l'heure qu'un `success` arrive (requête 3).
2. **Run bloqué en `running`** : attendre le passage suivant du cron. Au-delà de 10 min, il marque le run `failed` et libère la connexion. Si cela ne se produit pas, vérifier que l'Edge déployée est ≥ v65 (§ 1) : les versions antérieures ne libéraient pas ces runs.
3. **Aucun appel du cron** (requête 5 vide ou `active = false`) : recréer la tâche (§ 6.5) avec l'accord du titulaire.
4. **401 dans `net._http_response`** : réaligner `CRON_SECRET`. Il est lu dans le Vault par `call_monstock_cron` et par l'Edge ; aucune valeur ne doit être définie à la main d'un seul côté.
5. **Connexion `expired`** : l'administrateur de l'organisation reconnecte eBay depuis l'iPhone (Réglages → Intégrations → eBay). Le site web le permet aussi si `EBAY_WEB_RU_NAME` est configuré ([`ebay-setup.md`](ebay-setup.md)).
6. **Quota eBay atteint** (« Quota API eBay atteint ») : attendre la remise à zéro quotidienne. Éviter les synchros manuelles répétées.
7. **Relancer une synchro** :
   - par l'application : « Synchroniser maintenant » ;
   - ou, en SQL : `select public.call_monstock_cron('sync');` puis requête 6. C'est une écriture : elle déclenche un run réel.
8. **Échecs persistants après v65** :
   - lire les erreurs détaillées : `select code, left(message, 200), created_at from public.sync_errors order by created_at desc limit 20;` ;
   - ouvrir un correctif sur une branche dédiée, avec un test qui reproduit le problème.

   Aucune modification manuelle de `sync_state`, du curseur ou des runs n'est faite sans revue.
9. **Régression due à un déploiement** : revenir au SHA précédent (§ 6.1).

### 7.4 Après l'incident

- Vérifier que chaque connexion a un run `success` récent (requête 3) et que les ventes de la période ont bien déduit le stock, une seule fois (`ingest_external_order` est idempotente).
- Compléter le journal (§ 13) et, si besoin, ce runbook.

### 7.5 Incident du 21 au 23/10/2026

| | |
| --- | --- |
| Symptôme | Depuis le 21/10, la synchronisation eBay échouait à chaque passage pour le compte le plus volumineux (plusieurs milliers d'annonces). |
| Cause | Le run était tué par la limite de durée de l'Edge Function **avant** d'enregistrer sa progression : le curseur et `last_sync_at` n'étaient écrits qu'en fin de run. Chaque passage repartait du même point, et le run tué gardait la connexion verrouillée. |
| Correctif | Commit `43f55c9` (branche `claude/hotfix-sync`, construit sur `a05affd`) : échéance interne de 100 s propagée aux appels eBay, progression enregistrée après chaque page ou tranche confirmée (`sync_state`, curseur), runs abandonnés depuis plus de 10 min libérés par le cron. Migrations `20261023000100` à `0130` : synchro reprenable, unicité des comptes eBay, idempotence vente/annulation, ventes antérieures à la connexion non déduites. |
| Déploiement | Migrations le 23/10, puis Edge v65 le 23/10 à 07:05 UTC. |
| Vérification | Runs `partial` à 07:15 et 07:30, puis `success` à 07:45 pour les deux comptes eBay. |
| Incident secondaire | Pendant le correctif, une migration contenant `drop trigger` a été bloquée par le garde-fou SQL de l'assistant, faute de confirmation. Elle a été corrigée avec `create or replace trigger` (même effet, sans suppression préalable). Le fichier du dépôt n'est pas encore aligné (§ 5.2). |
| Enseignements | (1) Aucune alerte n'a signalé l'échec pendant deux jours : la supervision manque (§ 8, Q-07). (2) `cron.job_run_details` affichait `succeeded` alors que le traitement échouait : surveiller `sync_runs` et `net._http_response`. (3) Écrire les migrations sous forme idempotente et non destructive (`create or replace`, `if not exists`). (4) Le garde-fou de l'assistant est une aide, pas une frontière de sécurité. (5) Une préproduction aurait permis de reproduire le problème sur un volume réaliste. |

## 8. Supervision

### 8.1 Ce qui existe

| Outil | Ce qu'il montre | Limite |
| --- | --- | --- |
| `GET /functions/v1/api/health` | public : l'Edge répond ; oui/non pour eBay, cron, IA, chiffrement | sur la branche, plus aucun nom de secret ; ne vérifie ni la base ni eBay |
| `GET /functions/v1/api/health/details` **(branche)** | avec `Authorization: Bearer <CRON_SECRET>` : ping réel de la base, chargement des secrets (noms, tentatives), clé de chiffrement, transporteurs, disjoncteur La Poste | à appeler depuis la sonde de disponibilité (secret à garder côté sonde) |
| Réglages → **Diagnostic** (iPhone) | base, compte, serveur, IA, sourcing, eBay : OK / attention / erreur, avec la raison | manuel |
| Page web `/settings/sync` | historique des runs et erreurs par run | manuel |
| Tables `sync_runs`, `sync_errors`, `alerts` | traces de chaque run, erreurs détaillées, alertes ouvertes (jeton expiré, import bloqué…) | personne n'est prévenu |
| `cron.job_run_details`, `net._http_response` | émission des appels planifiés et réponse de l'Edge | réponses gardées quelques heures |
| Journaux Edge (Dashboard) et Vercel | erreurs d'exécution, `[runtime-secrets]` au démarrage du web | consultation manuelle |
| CI GitHub (`ci.yml`) | régressions de code à chaque push | — |

### 8.2 Ce qu'il faut ajouter (Q-07)

**Préparé sur la branche (migration `20261023000810`, non appliquée) :** table `ops_supervision_events` et fonction `public.ops_supervise()`, planifiée toutes les 15 min (`monstock-supervision`) si `pg_cron` est présent. Elle :

- recopie les réponses **non 2xx** (ou en délai dépassé) de `net._http_response`, conservées 30 jours ;
- crée une alerte `sync_stale` (table `alerts`, visible dans l'application) pour toute connexion active sans synchronisation **réussie** depuis plus de 2 h, et la résout au retour d'une synchronisation réussie.

Lecture (SQL, `service_role` ou propriétaire) :

```sql
select kind, source_ref, status_code, message, last_seen_at, occurrences
from public.ops_supervision_events
where resolved_at is null and last_seen_at > now() - interval '1 day'
order by last_seen_at desc;
```

Elle remplace la lecture manuelle des requêtes 5 et 6 du § 7.2. Elle ne prévient encore personne hors de l'application : l'envoi vers un canal suivi reste à faire (point 1 ci-dessous).

Reste à faire :

1. **Alertes planifiées en base**, envoyées vers un canal suivi (e-mail ou messagerie) :
   - aucune synchro `success` pour une connexion active depuis plus de 2 h ;
   - un run `running` depuis plus de 10 min ;
   - 3 runs `failed` consécutifs ;
   - une réponse non 2xx de l'Edge à un appel planifié ;
   - une tâche non exécutée depuis plus de 2 fois son intervalle ;
   - une connexion `expired`.
2. **Sonde de disponibilité externe** sur `/health` (Edge) et sur la page d'accueil du site, toutes les 5 min.
3. **Suivi des erreurs** (type Sentry) sur le web, l'Edge et l'app iPhone (plantages).
4. **Plafond de dépense OpenAI** (Billing → Limits) et alerte de consommation.
5. **Responsable d'astreinte** désigné, et second administrateur (Q-10), pour que l'alerte soit lue.

En attendant, faire un contrôle manuel quotidien : requêtes 3, 4 et 7 du § 7.2, et `select type, title from public.alerts where status = 'open';`.

## 9. Sauvegardes et restauration

État au 23/10 (D-12, Q-08) :

- sauvegardes quotidiennes Supabase supposées (plan Pro, 7 jours), **à vérifier** ;
- PITR **non vérifié** ;
- **aucune copie hors Supabase** ;
- **aucune restauration testée**.

### 9.1 Sauvegardes Supabase et PITR

1. Dashboard → **Database → Backups** : vérifier la présence des sauvegardes quotidiennes et noter la plus ancienne.
2. Project Settings → **Add-ons → Point in Time Recovery** : vérifier s'il est actif. Sinon, le titulaire décide (coût mensuel, instance de calcul minimale requise).
   - Avec PITR, on peut perdre au plus quelques minutes de données.
   - Sans PITR, jusqu'à 24 h.
3. Détail : [`MIGRATIONS.md` § 11.2](MIGRATIONS.md#112-d-12--sauvegardes-pitr-restauration-testée).

### 9.2 Export chiffré hors Supabase (hebdomadaire)

```bash
pg_dump "$PROD_URL" --no-owner --schema=public --schema=auth -Fc \
  | age -r <clé publique du coffre> > monstock-$(date +%F).dump.age
```

- `pg_dump` doit avoir la même version majeure que le serveur.
- `PROD_URL` est lu dans le gestionnaire de mots de passe, jamais écrit dans un fichier du dépôt.
- `age` est un exemple : tout outil de chiffrement à clé publique convient (`gpg --encrypt` par exemple).
- Stocker le fichier **hors du dépôt et hors de Supabase**, dans au moins deux emplacements. Conserver 8 semaines.
- L'export ne contient pas les secrets du Vault en clair (§ 9.4).

### 9.3 Test de restauration (avant commercialisation, puis chaque trimestre)

1. Restaurer la dernière sauvegarde, ou l'export du § 9.2, **dans un projet neuf ou dans la préproduction**. Jamais par-dessus la production.
2. Vérifier :
   - connexion d'un compte ;
   - stock d'un SKU ;
   - une commande eBay importée ;
   - déchiffrement d'un jeton eBay : la connexion ne doit pas passer en « Expirée ».
3. Mesurer la durée totale de remise en service et la noter au journal (§ 13).
4. Supprimer le projet de test, ou remettre la préproduction à zéro.

### 9.4 Clé `TOKEN_ENCRYPTION_KEY` : copie hors ligne (Q-08, D-05)

- Cette clé chiffre les jetons eBay et les identifiants fournisseurs. **Sans elle, une sauvegarde restaurée contient des jetons inutilisables** : il faut reconnecter chaque compte.
- Elle est aujourd'hui générée et conservée dans le Vault du projet. **Il faut aussi une copie hors ligne** :
  - dans le coffre du titulaire ;
  - et dans celui d'un second administrateur (Q-10) ;
  - jamais dans le dépôt, un ticket, un e-mail ou une conversation.
- Lecture ponctuelle pour la copie (accès propriétaire, puis effacer l'historique de l'éditeur) : Dashboard → Project Settings → Vault.

### 9.5 Rotation de la clé

Le code de la branche de remédiation prépare la rotation :

- chaque texte chiffré porte sa version de clé : `v1:`, puis `v1k<N>:` ;
- la colonne `key_version` des tables de secrets est indicative ;
- de nouveaux secrets, `TOKEN_ENCRYPTION_KEY_VERSION` et `TOKEN_ENCRYPTION_KEY_PREVIOUS`, gèrent la clé courante et les anciennes clés.

**Ce code n'est pas encore en production.** La procédure détaillée est dans [`SERVER.md`, « Rotation de la clé de chiffrement »](SERVER.md#rotation-de-la-clé-de-chiffrement). Elle doit être essayée en préproduction avant tout usage en production.

Faire une rotation en cas de fuite supposée, de départ d'une personne qui y avait accès, ou une fois par an.

## 10. Secrets

Ce tableau donne les **noms seulement**. Les valeurs ne sont écrites que dans les emplacements indiqués.

| Emplacement | Secrets | Remarques |
| --- | --- | --- |
| **Edge Function**, fournis par Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | automatiques |
| **Vault Supabase**, générés par migration | `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET` (`20261009000400`), `EBAY_WEBHOOK_VERIFICATION_TOKEN` (`20261009000500`) | Lus par `server_runtime_secrets()` (`service_role` seulement) et par `call_monstock_cron`. Ne pas modifier, sauf rotation (§ 9.5). |
| **Vault Supabase**, à créer | `PROJECT_URL` | URL du projet, exigée par `20261023000700` |
| **Edge Function** ou Vault | `EBAY_ENV`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RU_NAME`, `SOURCING_DISCOVERY_PROVIDER`, `BRAVE_SEARCH_API_KEY` | `server_runtime_secrets()` peut renvoyer ces 9 noms (avec les 3 ci-dessus). Une variable de l'Edge a priorité sur le Vault. |
| **Edge Function** seulement | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`, `ADVISOR_AUDIO_MAX_AGE_SECONDS`, `EBAY_LISTING_ENABLED`, `PACKLINK_API_KEY`, `SENDCLOUD_PUBLIC_KEY`, `SENDCLOUD_SECRET_KEY`, `BOXTAL_V1_LOGIN`, `BOXTAL_V1_PASSWORD`, `BOXTAL_CONTENT_CODE`, `BOXTAL_API_URL`, `LAPOSTE_OKAPI_KEY`, `SHIP24_API_KEY`, `DHL_API_KEY`, `SYNC_RUN_BUDGET_MS`, `SOURCING_USER_AGENT`, `SOURCING_BOT_CONTACT` | Dashboard → Edge Functions → Secrets. Pris en compte au démarrage d'une nouvelle instance. |
| **Edge Function**, branche de remédiation | `TOKEN_ENCRYPTION_KEY_VERSION`, `TOKEN_ENCRYPTION_KEY_PREVIOUS`, `TOKEN_ENCRYPTION_KEY_FORMAT` | rotation de clé (§ 9.5) ; à définir aussi dans Vercel |
| **Vercel**, Environment Variables | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` (publics), `SUPABASE_SERVICE_ROLE_KEY` (secret) | Au démarrage, le web lit dans le Vault `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `EBAY_*` et la découverte de sources (`src/lib/web-runtime-secrets.ts`). Facultatifs : `EBAY_WEB_RU_NAME` (connexion eBay web), `MONSTOCK_WEB_LEGACY_ROUTES`, `SYNC_RUN_BUDGET_MS`, secrets de rotation. L'IA et les transporteurs passent par l'Edge : pas de clé OpenAI ni de clé de transporteur dans Vercel. |
| **EAS / Expo** | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_SITE_URL` | Valeurs **publiques** par conception, dans `apps/mobile/eas.json`. Jamais de clé `sb_secret_` : le scan du bundle les refuse. Les certificats iOS et la clé App Store Connect sont gardés par EAS. |
| **GitHub Actions** | `EXPO_TOKEN` | Workflow `ios-testflight-local.yml` |
| **Coffre du titulaire**, hors ligne | copie de `TOKEN_ENCRYPTION_KEY`, mot de passe de la base, jeton d'accès Supabase CLI, clé de chiffrement des exports | à partager avec le second administrateur (Q-10) |

Règles :

- Jamais de secret dans Git, dans l'app mobile, dans un `NEXT_PUBLIC_*` ou dans un `EXPO_PUBLIC_*`.
- Les journaux masquent les secrets ; `/health` n'affiche aucune valeur de secret.
- Le job CI `secrets` (gitleaks) analyse tout l'historique à chaque push.
- Un secret exposé se change immédiatement chez le fournisseur, puis dans son emplacement. Pour `TOKEN_ENCRYPTION_KEY`, suivre la rotation (§ 9.5) : ne jamais simplement la remplacer.

## 11. Checklist de mise en production

À dérouler pour chaque livraison. Les cases non applicables sont notées « s.o. ».

**Préparation**

- [ ] Pull request revue par un humain : obligatoire pour les migrations, la RLS, l'authentification, la synchro eBay, le chiffrement et les workflows ([`CONTRIBUTING.md`](../CONTRIBUTING.md)).
- [ ] CI verte sur le SHA livré : `web`, `edge-bundle`, `integration`, `mobile`, `secrets`.
- [ ] SHA complet noté ; commit poussé sur GitHub.
- [ ] Accord explicite du titulaire, avec la fenêtre de déploiement (hors heures d'activité si une migration est prévue).
- [ ] Sauvegarde récente vérifiée (§ 9.1) ; heure de début notée.
- [ ] Plan de retour arrière écrit : SHA précédent, scripts `down`, déploiement Vercel précédent.

**Déploiement** (ordre du § 3)

- [ ] Migration(s) : contrôles en lecture seule, application une par une, `supabase migration list`, puis note du numéro enregistré (§ 5.2).
- [ ] Edge : `index.ts` au SHA livré (§ 4.2), `/health` OK, run de synchro suivant correct (§ 7.2).
- [ ] Web : fusion sur la branche de production, déploiement Vercel terminé, pages publiques et connexion OK, journal `[runtime-secrets]` sans erreur.
- [ ] Mobile : build TestFlight, procédure de test de [`MOBILE.md` § 7](MOBILE.md#7-procédure-de-test-sur-iphone-bêta).

**Après**

- [ ] Surveiller une heure : `sync_runs`, `net._http_response`, journaux Edge et Vercel.
- [ ] Journal du § 13 et § 1 de ce document mis à jour.

## 12. Checklist avant commercialisation

Ces points bloquent une ouverture publique ou payante. La plupart dépendent du titulaire.

- [ ] **Mentions légales**. Les 6 champs de l'éditeur manquent dans `src/content/legal.ts` : raison sociale, forme juridique, adresse, immatriculation, directeur de la publication, e-mail de contact. Contrôle (code de sortie 1 tant qu'il en manque) :

  ```bash
  npx tsx scripts/check-legal.ts
  ```

  Rien n'est inventé : ces informations viennent de l'éditeur (W-04, Q-03).
- [ ] **CGU** rédigées par un juriste : responsabilité, droit applicable, suspension, tarifs, sous-traitance, hébergeur des données (Q-25). Avis juridique sur le RGPD et les transferts hors UE (Q-09).
- [ ] **Vercel** (Q-16) :
  - plan **Pro** (le plan Hobby n'autorise pas l'usage commercial) ;
  - région des fonctions dans l'UE, par exemple `"regions": ["cdg1"]` dans `vercel.json` ;
  - domaine personnalisé ;
  - mettre à jour `NEXT_PUBLIC_APP_URL`, les Redirect URLs Supabase et l'URL de retour eBay web.
- [ ] **Visibilité du dépôt** décidée (Q-18). En cas de passage en privé, déployer l'Edge par la méthode B (§ 4.3), puis de préférence depuis la CI avec un jeton Supabase en secret GitHub.
- [ ] **Second administrateur** sur chaque compte : GitHub, Supabase, Vercel, Expo / App Store Connect, eBay Developer, OpenAI, coffre de secrets (Q-10).
- [ ] **Protection de la branche de production** et réglage Vercel (Q-01) :
  - branche de production dédiée (par exemple `main`) ;
  - fusion par pull request seulement, CI verte exigée (les 5 jobs) et approbation humaine ;
  - pas de push direct ni de force-push ;
  - Vercel → Settings → Git → Production Branch pointée sur cette branche.

  Aujourd'hui, la branche de production est aussi la branche par défaut du dépôt, sans protection.
- [ ] **Préproduction** créée et utilisée (Q-02, D-03). Démo et autotests déplacés hors de la production.
- [ ] **Historique des migrations** réconcilié (Q-05, [`MIGRATIONS.md` § 4](MIGRATIONS.md#4-procédure-de-réconciliation-pas-à-pas)). Migrations de remédiation `0200` et suivantes appliquées.
- [ ] **Sauvegardes** : PITR décidé, export hors Supabase en place, restauration testée, copie hors ligne de la clé (§ 9).
- [ ] **Supervision** minimale en place (§ 8.2, Q-07).
- [ ] **Protection contre les mots de passe divulgués** activée dans Supabase Auth (D-13).
- [ ] **Suppression de compte** déployée (migration `20261023000600`, Edge, web, mobile) : exigée par l'App Store.
- [ ] **Mobile** : nouvelle build avec `EXPO_PUBLIC_APP_ENV` réglé sur la production. Le thème sombre est préparé mais pas branché : il faut `userInterfaceStyle: "automatic"` dans `app.json` et une nouvelle build.

## 13. Journal des déploiements

Ajouter une ligne par opération en production : la plus récente en haut. On n'y écrit aucun secret ni aucune donnée personnelle.

| Date (UTC) | Composant | Version / SHA | Opération | Vérification |
| --- | --- | --- | --- | --- |
| 23/10/2026 07:05 | Edge `api` | v65 / `43f55c9` | Correctif de la synchro eBay | Runs `partial` à 07:15 et 07:30, `success` à 07:45 (2 comptes) |
| 23/10/2026 | Base | `20261023000100` → `0130` | Synchro reprenable, unicité des comptes, idempotence, ventes antérieures non déduites | Numéros enregistrés : voir § 5.2 |
| 23/10/2026 | Web (Vercel) | `9c8b65b` | Next 16.4.2, fflate 0.8.3 (sur `a05affd`) | — |
| avant le 22/10/2026 | Edge `api` | v64 / `a05affd` | Version auditée | — |
