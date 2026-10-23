> **Archivé le 23/10/2026.** Extrait de `docs/SERVER.md` (ancien § 9), état au 10/10/2026, conservé pour
> l'historique. La revue à jour des fonctions SECURITY DEFINER est dans [`docs/MIGRATIONS.md`](../MIGRATIONS.md) § 8.

## 9. Audit de sécurité Supabase (10 octobre 2026, projet TEST)

| Point | Avant | Après |
| --- | --- | --- |
| Fonctions SECURITY DEFINER exécutables par `authenticated` | 18 | 12 (toutes des RPC métier qui vérifient l'organisation et le rôle) ; fonctions de déclencheur révoquées |
| `search_path` modifiable (avertissements) | 13 | 0 |
| Tables avec `organization_id` sans garde « même organisation » | — | 0 (test de catalogue de sécurité) |
| RLS | activée sur toutes les tables exposées | inchangé ; matrice d'isolation entre organisations testée sur chaque table |
| `ingest_external_order` | service_role | service_role uniquement (vérifié après la migration `20261010000300`) |

Restent (documentés, sans risque immédiat) : extensions `pg_trgm` / `unaccent` dans `public`
(déplacement risqué pour les index existants) ; **protection des mots de passe divulgués à
activer** (Dashboard → Authentication → Policies) ; 3 tables serveur sans politique (accès
`service_role` uniquement, voulu).

Migrations de cet audit, appliquées sur TEST : `20261010000100` (durcissement, offres enregistrées,
quotas IA), `20261010000200` (contrôles de l'annuaire), `20261010000300` (remboursement après
expédition).

