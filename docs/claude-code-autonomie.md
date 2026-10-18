# Claude Code — travail autonome sur MON STOCK

But : sur une longue tâche, Claude avance sur tout ce qui est sûr sans attendre, et ne s'arrête que
pour les opérations qui exigent un accord explicite.

## 1. Les couches qui peuvent interrompre une session

| Couche | Où elle se règle | Ce que le dépôt peut faire |
| --- | --- | --- |
| **Mode de la session** (Accept edits, Plan, Auto) | Menu des modes à côté de la zone de saisie, au lancement ou pendant la tâche | Rien : le dépôt ne peut pas choisir le mode d'une session cloud |
| **Règles du projet** (`allow` / `ask`) | `.claude/settings.json` (versionné) | Tout ce fichier ; lu seulement par une session ouverte sur **un seul** dépôt |
| **Garde-fous** (hooks `PreToolUse`) | `.claude/hooks/*.mjs` | Forcent une confirmation (« ask ») ou un refus selon le CONTENU de la commande |
| **Autorisations de session** | Bouton « toujours autoriser » d'une demande | Valables pour la session seulement, non versionnées |
| **Réseau de l'environnement** | Menu de l'environnement cloud (barre de titre) → Edit → Network access | Rien : un hôte refusé (ex. `unpkg.com`, `api.expo.dev`) l'est quelles que soient les règles |
| **Classificateur de sécurité de l'environnement** | Côté Anthropic | Rien : peut bloquer une action (ex. déploiement de production) dans tous les modes |
| **Services externes** (Expo, Apple, Supabase, GitHub) | Leur propre compte / jeton | Rien : leurs confirmations, quotas et droits s'appliquent en plus |

Points vérifiés dans la documentation de l'environnement :

- en session cloud, les modifications de fichiers ne demandent rien, quel que soit le mode ;
- **Auto** exécute aussi la plupart des autres appels d'outils sans demander ; il n'apparaît que si
  l'organisation l'autorise et que le modèle choisi le prend en charge ;
- `defaultMode: "bypassPermissions"` ou `"dontAsk"` dans un fichier est **ignoré** en cloud, les
  options de ligne de commande ne changent pas le mode, et « Bypass permissions » n'existe pas en cloud.

**Conclusion : le fichier seul ne suffit pas.** Sans le mode Auto, chaque commande qui ne figure pas
dans `allow` reste une demande. Avec Auto, les règles `ask` et les garde-fous gardent les opérations
risquées sous confirmation.

## 2. Ce qui passe sans confirmation (`allow`)

- Lecture et recherche (Read, Glob, Grep, `ls`, `cat`, `grep`, `rg`, `jq`, `sed -n`, `git show`…).
- Modifications des fichiers du projet (`apps/`, `src/`, `server/`, `tests/`, `docs/`, `scripts/`,
  `supabase/`…), sauf les fichiers sensibles listés au § 3.
- Contrôles : `npm run typecheck|lint|test|test:integration|test:all|build|edge:build` (racine),
  `npm --prefix apps/mobile run typecheck|lint|check|export:ios|scan:bundle`, `npm test`,
  `npx tsc --noEmit`, `npx eslint`, `npx vitest run`, `npx jest`, `npm ci`.
- Expo local : `npx expo config`, `npx expo export` (aucune build distante, aucune publication).
- Aperçus : `npx tsx --conditions=react-server scripts/preview-api-fixtures.ts`,
  `bash preview/export-web.sh …`, `node preview/capture.mjs …` (base de démonstration en mémoire).
- Git local : status, diff, log, add, commit, fetch, et **push uniquement vers la branche de travail**
  `claude/laughing-bardeen-bdn16j`.
- Supabase (MCP) : lectures (tables, migrations, fonctions, journaux, conseils, documentation, types)
  et `execute_sql` **en lecture seule stricte** (décidé par le garde-fou, § 4).
- Expo (MCP) : lecture des builds, journaux, retours TestFlight, métriques, documentation.
- GitHub (MCP) : lecture des fichiers, commits, PR, issues, checks, journaux CI.

Aucune autorisation générale n'est donnée à un interpréteur (`node *`, `python *`, `bash *`,
`npm run *`, `psql *`) : chaque script autorisé est nommé.

## 3. Ce qui demande toujours un accord explicite (`ask` + garde-fous)

- Migration Supabase (toutes : la base TEST est celle de l'application distribuée), SQL d'écriture,
  déploiement d'Edge Function, secrets Supabase, création/fusion/reset de branche ou de projet.
- Toute commande `eas` (build, submit, update, secrets, env, credentials), builds et soumissions Expo
  via MCP, workflows Expo, simulateurs/sandbox cloud, réponses publiques aux avis.
- Push d'un tag (un tag `testflight-*` lance la build TestFlight), push forcé, suppression de branche
  distante, push vers une autre branche, fusion de PR, workflow GitHub, écriture GitHub via l'API.
- CLI Supabase et Vercel (déploiement), `npm publish`.
- Réinitialisation de base (`npm run db:local:reset`), scripts lancés avec `.env.local`
  (`seed:demo`, `sync:run`), `DROP DATABASE`, connexion `psql` à une base distante.
- Pertes locales : `git reset --hard`, `git clean`, `rm -rf` hors des dossiers de sortie (`dist/`…).
- Fichiers sensibles : `.env*`, `.claude/**` (permissions et garde-fous), `package.json` (le contenu
  des scripts autorisés), `app.json` / `eas.json` (identifiants, profils), `.github/**`, `vercel.json`.
- Sendcloud (création d'expéditions et d'étiquettes payantes) : tout l'outil.

## 4. Garde-fous (`.claude/hooks/`)

- `bash-guard.mjs` lit la commande entière (`&&`, pipes, `bash -c "…"`) **et le contenu des scripts
  npm / shell qu'elle lance** : `npm run check` passe, mais un script qui contiendrait `eas build`,
  `supabase db push`, `drop database` ou `--env-file=.env.local` demande une confirmation. Un message
  de commit ou un motif de recherche qui cite ces mots ne déclenche rien.
- `supabase-guard.mjs` refuse tout projet autre que MON-STOCK TEST, demande une confirmation pour le
  SQL destructeur, pour toute migration et pour tout SQL qui n'est pas en lecture seule stricte
  (fonction inconnue, `EXPLAIN ANALYZE`, `SELECT … INTO`, bloc `DO`, `FOR UPDATE`…).
- Tests : `npx vitest run tests/unit/claude-guards.test.ts`.

Un nouveau hook n'est pris en compte qu'au démarrage d'une session (ou après ouverture du menu
`/hooks`). La modification du contenu d'un hook déjà déclaré s'applique tout de suite.

## 5. Conduite de Claude quand une autorisation manque

1. Nommer la commande et la permission (ou l'hôte réseau) en cause.
2. Ne pas contourner : pas d'autre outil, pas de script détourné, pas de changement de règles.
3. Continuer tout le travail indépendant ; utiliser une alternative sûre si elle existe.
4. Regrouper les demandes en fin de tâche ; ne pas relancer une commande refusée pour la même raison.
5. Ne jamais remplacer un résultat manquant par un résultat simulé ou inventé.

## 6. Pour une longue session sans surveillance

1. Au lancement de la tâche, choisir **Auto** dans le menu des modes à côté de la zone de saisie
   (s'il n'apparaît pas, l'organisation ou le modèle ne le permet pas : seules les règles `allow`
   évitent alors les demandes).
2. Ouvrir la session sur **ce seul dépôt** (sinon `.claude/settings.json` n'est pas lu).
3. Si un hôte réseau est refusé : menu de l'environnement → Edit → Network access → Allowed domains.
4. Les opérations du § 3 attendront votre accord : Claude les regroupe et continue le reste.
