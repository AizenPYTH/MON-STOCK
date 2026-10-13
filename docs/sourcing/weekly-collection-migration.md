# Migration « collecte hebdomadaire » — validée sur le principe, application en attente

**État au 13/10/2026 : NON APPLIQUÉE.** Toutes les vérifications ont été faites sur le projet ciblé, sauf le script de retour arrière ; voir « Vérification sur le projet ciblé » plus bas. Les fichiers sont dans `supabase/pending/`, hors de `supabase/migrations/`, pour qu'aucun outil ne les applique par erreur. Après ton accord, ils seront déplacés puis appliqués en production.

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

## Vérification sur le projet ciblé (13/10/2026)

**Projet Supabase** : `ccywsegdowikeirbsfae` (« MON-STOCK », production, eu-west-1, PostgreSQL 17).

**Méthode.** Chaque vérification tourne dans UNE transaction qui se termine volontairement par une erreur : PostgreSQL annule donc tout. Après chaque essai, on a contrôlé qu'il ne restait rien : aucune colonne, pas de valeur `weekly`, pas de fonction, aucune ligne de test, aucun verrou.

Résultats :

| Contrôle | Résultat |
| --- | --- |
| Migration complète (type, colonnes, contrainte, index, fonction, droits) | ✅ s'applique sans erreur |
| 1re collecte complète : 2 offres revues, 1 absente | ✅ seen=2, missed=1, expired=0 ; l'absente reste active |
| 2e collecte complète sans l'offre | ✅ expired=1 ; stock inchangé (`in_stock`) ; 3 lignes conservées |
| `authenticated` / `anon` peuvent-ils clôturer une collecte ? | ✅ non (droit EXECUTE absent) ; seul `service_role` peut |
| Changement de rôle `authenticated` + appel de la fonction | ✅ refusé |
| **Retour arrière** (DROP des colonnes et de la fonction) | ⚠️ **non exécuté sur le projet ciblé** |

Le retour arrière n'a pas pu être exécuté parce que l'outil d'accès SQL demande une confirmation manuelle pour toute instruction `DROP`. Sans réponse dans les 60 s, la requête est abandonnée, et cela s'est produit 3 fois.

Le retour arrière est vérifié sur PostgreSQL 16 local : colonnes et fonction retirées, offres et sources conservées.

**Conformément à la consigne** (« avant toute application en production, vérifie… le script de retour arrière sur le projet ciblé »), la migration n'est **pas appliquée**. Il suffit d'approuver la demande de confirmation `DROP` lors du prochain essai, qui reste annulé par la transaction.

## Fonctionnement (code écrit et testé, actif après application)

- Toutes les 15 minutes, le cron `monstock-sourcing-weekly` demande au serveur de reprendre **au plus 5 collectes dues**, dont 2 au plus par plan du site.
  - Budget de 100 s par passage.
  - Une requête à la fois par fournisseur, avec le délai de politesse et robots.txt respectés.
  - Quand aucune collecte n'est due, la réponse est immédiate.
- Chaque passage lit un lot du catalogue (par exemple 100 produits WooCommerce ou 8 fiches de plan du site), enregistre les offres, puis sauvegarde le curseur. Le passage suivant reprend au curseur.
- Fin de catalogue sans erreur bloquante : la fonction de clôture est appelée, puis le bilan est enregistré.
- Après 3 échecs consécutifs, la source passe en erreur avec le message exact. Aucune offre n'est touchée.
- **Garde-fous du code** (`src/services/sourcing/weekly-collection.ts`, 15 tests dans `tests/unit/weekly-collection.test.ts`) :
  - **Collecte complète** seulement si tout le catalogue est parcouru avec :
    - aucune requête en erreur et aucune écriture en échec ;
    - un catalogue non signalé tronqué (plan du site plafonné ou coupé) ;
    - au moins une offre ;
    - pas d'effondrement du volume (moins de la moitié des offres de la collecte complète précédente).
  - Sinon la collecte est « incomplète » : les offres sont enregistrées, mais aucune n'est déclarée absente.
  - **Verrou** : l'index unique « un run en cours par source » interdit deux passages simultanés sur une même source. Le démarrage d'une collecte est conditionnel (`collection_started_at is null`).
  - **Calendrier** : chaque source a un créneau hebdomadaire (jour, heure UTC) :
    - une seule collecte par créneau ;
    - une collecte abandonnée est relancée au plus 3 fois, à 1 h d'intervalle ;
    - jamais avant le créneau.
  - **Idempotence** : upsert sur (organisation, source, identifiant externe). Une page coupée en plein milieu reprend au bon rang (`pageOffset`), sans doublon ni perte.

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
