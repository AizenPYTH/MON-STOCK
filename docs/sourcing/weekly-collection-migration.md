# Migration « collecte hebdomadaire » — à valider

**État : NON APPLIQUÉE.** Les fichiers sont dans `supabase/pending/`, hors de `supabase/migrations/`, pour qu'aucun outil ne les applique par erreur. Après ton accord, ils seront déplacés puis appliqués en production.

| Fichier | Rôle |
| --- | --- |
| `supabase/pending/20261014000100_sourcing_weekly_collection.sql` | migration (additive) |
| `supabase/pending/schedule-weekly-collection.sql` | tâche cron, à lancer **après** le déploiement du code de collecte |
| `supabase/ops/rollback/20261014000100_sourcing_weekly_collection_down.sql` | retour arrière |
| `supabase/checks/weekly-collection-check.sql` | vérification sur base **locale** |

## Ce que la migration ajoute

1. **Fréquence `weekly`** dans le type `sync_frequency`, à côté de manual, hourly, every_6_hours et daily.
2. **Sur `supplier_sources`** :

   | Colonne | Rôle |
   | --- | --- |
   | `schedule_weekday` (1 = lundi … 7 = dimanche) | jour de collecte ; vide = réparti automatiquement par le serveur |
   | `schedule_hour_utc` (0–23) | heure de collecte ; vide = répartie automatiquement |
   | `collect_cursor` | curseur de reprise d'une collecte en cours (objet JSON) |
   | `collection_started_at` | début de la collecte en cours ; vide = aucune collecte en cours |
   | `last_full_collection_at` | fin de la dernière collecte **complète** |
   | `last_collection_stats` | bilan : pages, offres lues, nouvelles, prix modifiés, absentes, erreurs, durée |
   | `directory_key` | lien vers la fiche de l'annuaire (ex. `refreshed-apples`) |

3. **Sur `sourcing_offers`** :
   - `missing_since` : première collecte complète où l'offre n'a pas été revue ;
   - `missed_collections` : nombre de collectes complètes consécutives sans l'offre.
4. **Fonction `sourcing_close_full_collection(source, début)`**, réservée au serveur. Elle est appelée **seulement** à la fin d'une collecte complète réussie :
   - les offres revues voient leur compteur remis à 0 ;
   - les offres non revues voient leur compteur augmenter de 1, et `missing_since` est renseigné ;
   - après **2 collectes complètes** sans l'offre, son statut passe à `expired`.
     - Le stock affiché n'est pas modifié : aucune fausse rupture n'est créée.
     - L'offre n'est jamais supprimée.
     - Elle redevient active d'elle-même si elle réapparaît.
   - Une collecte interrompue, tronquée ou en erreur n'appelle jamais cette fonction, et ne fait donc disparaître aucune offre.
5. Deux index partiels : sources en cours de collecte, et offres actives par source et date de dernière vue.

Rien n'est supprimé et aucune donnée existante n'est réécrite : les nouvelles colonnes démarrent vides ou à 0.

## Fonctionnement prévu (code écrit après ta validation)

- Toutes les 15 minutes, le cron `monstock-sourcing-weekly` demande au serveur de reprendre **au plus 3 collectes dues**.
  - Budget de 100 s par passage.
  - Une requête à la fois par fournisseur, avec le délai de politesse et robots.txt respectés.
  - Quand aucune collecte n'est due, la réponse est immédiate.
- Chaque passage lit un lot du catalogue (par exemple 100 produits WooCommerce ou 8 fiches de plan du site), enregistre les offres, puis sauvegarde le curseur. Le passage suivant reprend au curseur.
- Fin de catalogue sans erreur bloquante : la fonction de clôture est appelée, puis le bilan est enregistré.
- Après 3 échecs consécutifs, la source passe en erreur avec le message exact. Aucune offre n'est touchée.

## Vérification faite (PostgreSQL 16 local, jamais en production)

- Les 30 migrations existantes, puis cette migration appliquée dans une transaction : OK.
- Scénario sur 3 offres :
  - 1re collecte complète : 2 offres revues et 1 absente, qui garde le statut actif avec un compteur à 1.
  - 2e collecte : l'offre absente passe en `expired`, avec le stock inchangé et les 3 offres toujours présentes.
  - La source est bien clôturée : curseur vidé, date de collecte complète renseignée.
- Sécurité et contraintes, toutes vérifiées :
  - un utilisateur connecté (`authenticated`) ne peut pas appeler la fonction ;
  - les valeurs invalides sont refusées : jour 8, curseur non-objet, date de début future.
- Retour arrière : colonnes et fonction retirées, offres conservées, sources en `weekly` repassées en `daily`.
- Ré-application deux fois de suite : aucune erreur (migration idempotente).

## Point d'attention

PostgreSQL ne permet pas de retirer une valeur d'un type énuméré. Après un retour arrière, `weekly` reste donc dans le type, mais plus aucune source ne l'utilise.
