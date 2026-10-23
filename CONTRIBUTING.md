# Contribuer à MON STOCK

## Branches et revue

- **Branche de production** : aujourd'hui `claude/laughing-bardeen-bdn16j`. Chaque push publie le site Vercel. On n'y pousse jamais directement : on fusionne par pull request. Cette règle n'est **pas encore imposée** par GitHub : la protection de branche est à activer (Q-01, `docs/OPERATIONS.md` § 12).
- **Branches de travail** : une branche par sujet (`claude/<sujet>` pour l'assistant, `<initiales>/<sujet>` pour une personne).
- **Pull request obligatoire**, avec CI verte (`.github/workflows/ci.yml`).
- **Revue humaine obligatoire** pour les changements sensibles : migrations, politiques RLS, fonctions `SECURITY DEFINER`, authentification, synchro eBay, chiffrement, workflows.
- **Interdits** : `git push --force`, réécriture de l'historique partagé, suppression de branche distante sans accord.

## Avant d'ouvrir une PR

```bash
npm ci
npm ci --prefix apps/mobile                # une fois, pour les contrôles mobiles
npm run typecheck
npm run lint
npm test                                   # tests unitaires
REQUIRE_DB=1 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mon_stock_test npm run test:integration
npm --prefix apps/mobile run check         # si l'app mobile est touchée
node scripts/build-edge.mjs                # si src/ ou server/ change : le bundle versionné doit suivre
```

Recréer la base locale : `PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres PGDATABASE=mon_stock_test npm run db:local:reset`. La commande supprime puis recrée la base. Elle refuse tout hôte non local et toute base Supabase ; la seule dérogation, `MONSTOCK_ALLOW_REMOTE_DB_RESET=<PGHOST>`, est réservée à un serveur PostgreSQL jetable. Une base PostgreSQL 16 locale suffit (voir `README.md` § 3).

## Règles de code

- **Typage** : TypeScript strict, pas de `any`. Valider avec zod chaque entrée venue de l'extérieur.
- **Accès aux données** :
    - Web : passer par la couche d'accès (`src/features/auth/dal.ts`). Une écriture vérifie la session, l'organisation et le rôle.
    - Toujours filtrer par `organization_id`, en plus de la RLS.
- **Données honnêtes** : une valeur inconnue s'affiche « — », jamais 0 ; une estimation porte « ≈ ». Une lecture tronquée est paginée (`src/lib/supabase/paginate.ts`) ou signalée comme partielle.
- **Erreurs** : l'utilisateur ne voit que des messages rédigés (`AppError`) ; tout le reste est journalisé avec une référence.
- **Tests** : tout correctif s'accompagne d'un test qui échouait avant. Un test ne dépend ni de la date du jour ni du réseau (horloge injectée, appels simulés). Un test qui échoue ne se supprime pas.
- **Dépendances** : ne pas en ajouter une si une solution existe déjà dans le dépôt. Dependabot propose les mises à jour, la CI les valide.

## Base de données

- Une migration est un nouveau fichier `supabase/migrations/<horodatage>_<nom>.sql` : non destructive, idempotente quand c'est possible, accompagnée d'un script de retour arrière dans `supabase/ops/rollback/`.
- Ne jamais désactiver la RLS, ne jamais accorder un droit global pour « faire passer » un test.
- Les migrations sont essayées en local, puis en préproduction, avant la production. Procédure dans `docs/MIGRATIONS.md`. Ne jamais lancer `supabase db push` sur la production.

## Production

Aucune de ces opérations ne se fait sans l'accord explicite du titulaire :

- appliquer une migration en production ;
- déployer l'Edge Function, le site ou l'app ;
- modifier des secrets ;
- supprimer des données ;
- toucher aux jetons eBay ou à la boutique réelle.

Les garde-fous de l'assistant (`.claude/`) aident mais ne sont pas une frontière de sécurité. La vraie protection est la règle de branche côté GitHub et la revue humaine.

Le dépôt est public : n'y écrivez jamais de secret, ni de donnée personnelle, ni le détail d'une faille non corrigée.
