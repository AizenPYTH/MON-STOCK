# Migrations, réconciliation de l'historique et exploitation de la base

> Rédigé le 22/10/2026 (audit `MON-STOCK-audit-2026-10-22`, points D-02 / Q-05, Q-17, D-08 à D-21, D-12, D-13).
> Toutes les constatations sur la production ont été faites **en lecture seule** (outils MCP Supabase :
> `list_migrations` et `execute_sql` limité à des `SELECT` sur le catalogue et sur
> `supabase_migrations.schema_migrations`). **Aucune écriture, aucune migration, aucun `repair` n'a été
> exécuté en production.** Les actions décrites ici demandent l'autorisation explicite du titulaire.

Sommaire

1. [Règle d'or](#1-règle-dor)
2. [État constaté : dépôt ↔ production](#2-état-constaté--dépôt--production)
3. [Dépendances et ordre d'application](#3-dépendances-et-ordre-dapplication)
4. [Procédure de réconciliation pas à pas](#4-procédure-de-réconciliation-pas-à-pas)
5. [Préproduction et test de reconstruction](#5-préproduction-et-test-de-reconstruction)
6. [Retour arrière et limites](#6-retour-arrière-et-limites)
7. [Migrations 20261023000300 → 0360 : impact et contrôles avant production](#7-migrations-20261023000300--0360--impact-et-contrôles-avant-production)
8. [Revue des fonctions SECURITY DEFINER (Q-17)](#8-revue-des-fonctions-security-definer-q-17)
9. [Extensions `pg_trgm` / `unaccent` hors de `public` (D-14) — non fait](#9-extensions-pg_trgm--unaccent-hors-de-public-d-14--non-fait)
10. [Rétention et purge (D-10)](#10-rétention-et-purge-d-10)
11. [Réglages du tableau de bord : mots de passe divulgués (D-13), sauvegardes et PITR (D-12)](#11-réglages-du-tableau-de-bord--mots-de-passe-divulgués-d-13-sauvegardes-et-pitr-d-12)
12. [Écrire une nouvelle migration](#12-écrire-une-nouvelle-migration)
13. [Annexe : requête d'empreinte du schéma](#13-annexe--requête-dempreinte-du-schéma)

---

## 1. Règle d'or

- **Ne jamais lancer `supabase db push` sur la production** tant que `supabase migration list` n'affiche pas
  un historique identique entre le dépôt et la base (section 4). Sur un projet **neuf et vide**
  (préproduction, DEV), `db push` est au contraire la méthode normale.
- Ne jamais fabriquer de migration « déjà appliquée » pour faire coïncider l'historique : l'historique se
  corrige avec `supabase migration repair` (qui n'exécute aucun SQL), **après** preuve que le schéma est
  identique.
- Toute migration est d'abord appliquée sur une base locale (`scripts/db-local-reset.sh`), puis sur la
  préproduction, et seulement ensuite sur la production, avec son script de retour arrière dans
  `supabase/ops/rollback/`.

## 2. État constaté : dépôt ↔ production

### 2.1 Historique (`supabase_migrations.schema_migrations`, lu le 22/10/2026)

La production contient **13 versions** ; le dépôt contenait **30 fichiers** à la date de l'audit (plus les
migrations `20261023*` ajoutées depuis, non appliquées). Comparaison du SQL : texte enregistré en base
(`statements`) et fichier du dépôt, normalisés (commentaires et blancs supprimés), comparés par MD5.

| Fichier du dépôt | Version en production | SQL enregistré vs fichier | Statut |
| --- | --- | --- | --- |
| `20261007000100_core` … `20261008005200_sku_variant_atomic_update` (18 fichiers) | — | — | **Absents de l'historique**, effets présents (schéma identique, § 2.2). Appliqués hors CLI (éditeur SQL, supposé). |
| `20261009000100_orders_server_only` | — | — | **Absent de l'historique**, effet présent (`orders` en lecture seule pour `authenticated`). |
| `20261009000200_create_product_with_skus` | `20261009114920` | identique | Version différente |
| `20261009000300_sourcing_library_checks` | `20261009122432` | identique | Version différente |
| *(aucun fichier)* | `20261009123403 enable_pg_net_pg_cron` | `create extension if not exists pg_net with schema extensions; create extension if not exists pg_cron;` | **Seulement en base.** Contenu repris dans `supabase/ops/schedule-edge-cron.sql` et supposé par `20261023000700_versioned_cron_function`. |
| `20261009000400_server_runtime_secrets` | `20261010043055` | identique | Version différente |
| `20261009000500_ebay_webhook_token` | `20261010050553` | **différent** (non lu : peut contenir un secret) | Version différente ; schéma résultant identique |
| `20261010000100_audit_hardening_saved_offers_ai_usage` | `20261010100950` | **différent** | Version différente ; schéma résultant identique |
| `20261010000200_supplier_directory_checks` | `20261010102053` | **différent** | Version différente ; schéma résultant identique |
| `20261010000300_refund_after_shipment` | `20261010110000` | identique | Version différente |
| `20261011000100_tools_shipping_tracking` | `20261010184757 tools_shipping_rate_cards` + `20261010184924 tools_tracked_parcels` | 1 fichier ↔ 2 entrées | **Scindé en base** ; schéma résultant identique |
| `20261011000200_advisor` | `20261011092900` | identique | Version différente |
| `20261012000100_tracking_dhl_provider` | `20261012000100` | **libellé à la place du SQL** (`widen tracked_parcels.provider to dhl`) | Même version ; entrée enregistrée à la main ; effet présent |
| `20261013000100_sourcing_b2b` | `20261013000100` | **aucun SQL enregistré** | Même version ; entrée enregistrée à la main (repair) ; effet présent |
| `20261023000100` … `20261023000700` (nouveaux, 19 fichiers au 22/10 soir) | — | — | **Non appliqués** : à appliquer après réconciliation (§ 3, § 4) |
| `supabase/pending/20261014000100_sourcing_weekly_collection.sql` | — | — | Hors `migrations/`, **non appliqué** (décision titulaire, Q-12) |

### 2.2 Schéma : base reconstruite depuis le dépôt ↔ production

Méthode : base PostgreSQL locale reconstruite avec le shim + les 30 fichiers (`scripts/db-local-reset.sh`),
puis **même requête d'empreinte** (annexe § 13) exécutée sur les deux bases ; comparaison catégorie par
catégorie (MD5 des définitions triées).

| Catégorie | Nombre | Résultat |
| --- | --- | --- |
| Colonnes (`information_schema.columns`, type, nullabilité, défaut) | 824 | **identique** |
| Contraintes (`pg_get_constraintdef`) | 307 | **identique** |
| Index (`pg_indexes.indexdef`) | 176 | **identique** |
| Politiques RLS (`pg_policies`, rôles, USING, WITH CHECK) | 134 | **identique** |
| RLS activée / forcée par relation | 57 | **identique** |
| Privilèges de tables (`anon`, `authenticated`, `service_role`) | 568 | **identique** |
| Privilèges par colonne | 11 | **identique** |
| Déclencheurs (`pg_get_triggerdef`) | 84 | **identique** |
| Vues (options + définition) | 5 | **identique** |
| Types énumérés | 24 | **identique** |
| Corps des fonctions (`prosrc`, 46) | 46 | identique pour 44 ; `create_product_with_skus` : commentaires seulement ; `call_monstock_cron` : **seulement en base** ; `server_runtime_secrets` : version locale neutre (pas de Vault en local, voulu) |
| Extensions | 9 (prod) / 4 (local) | attendu : `pg_cron`, `pg_net`, `supabase_vault`, `uuid-ossp`, `pg_stat_statements` n'existent qu'en production |

**Conclusion** : le schéma `public` de la production est celui que produisent les fichiers du dépôt ; seules
diffèrent les écritures de l'historique, plus `call_monstock_cron` / pg_cron / pg_net (versionnés par
`20261023000700_versioned_cron_function`). La réconciliation consiste donc à **réécrire l'historique**, pas
le schéma. Cette comparaison doit être **refaite avec `pg_dump`** (§ 4, étape 3) juste avant toute
réparation : elle porte sur `public` et ne couvre ni `auth`, ni `storage`, ni `cron`, ni le Vault.

## 3. Dépendances et ordre d'application

Ordre imposé par les versions (application dans l'ordre lexical). Points d'attention :

| Migration | Dépend de / interagit avec | À faire |
| --- | --- | --- |
| `20261023000330_supplier_source_attestation` | colonnes de `20261023000200` (droits par colonne calculés à l'application) | appliquer après 0200 (ordre naturel) ; **déployer le web en même temps** (`src/features/suppliers/discovered-actions.ts` appelle la nouvelle RPC) |
| `20261023000310_rls_initplan_views` | `advisor_messages_insert` volontairement non modifiée (redéfinie par 0510) ; `ai_usage_events_insert` supprimée par 0500 (ALTER seulement si elle existe) | aucun |
| `20261023000510_advisor_messages_user_role_only` | Edge Function à jour (réponses via service_role) | déployer l'Edge **avant ou avec** |
| `20261023000700_versioned_cron_function` | secret Vault `PROJECT_URL`, extensions pg_cron/pg_net (entrée prod `enable_pg_net_pg_cron`) | créer le secret avant ; sur une base reconstruite, créer d'abord les extensions |
| `20261023000300_secdef_hardening` | aucun appelant de `adjust_reserved_quantity` (web, mobile, Edge, bundle déployé : 0 occurrence) | aucun |
| `20261023000340_organization_limits_delete` | messages d'erreur ajoutés dans `src/lib/db-error-messages.ts` (web + mobile) | déployer le web/mobile pour des messages lisibles (sinon message générique) |
| Toutes | `src/lib/db-error-messages.ts` doit connaître chaque code `raise exception 'CODE'` (`tests/unit/errors-mapping.test.ts`) | — |

## 4. Procédure de réconciliation pas à pas

> Durée estimée : une demi-journée. À faire **hors des heures d'activité**, avec l'accord écrit du titulaire.
> Aucune étape ne modifie le schéma de la production ; l'étape 6 modifie seulement la table d'historique.

**Étape 0 — Prérequis**

- Supabase CLI ≥ 2.x, `pg_dump`/`psql` **version 17** (même version majeure que le serveur).
- `supabase/config.toml` : absent du dépôt → `npx supabase init` (ne touche pas aux migrations), puis
  `npx supabase link --project-ref ccywsegdowikeirbsfae` (mot de passe de la base requis).
- Geler les changements de schéma (aucune migration, aucun SQL Editor) pendant toute la procédure.

**Étape 1 — Sauvegardes**

- Vérifier qu'une sauvegarde quotidienne récente existe (Dashboard → Database → Backups) ; si le PITR est
  actif, noter l'heure (§ 11.2).
- Export logique hors Supabase : `pg_dump "$PROD_URL" --schema-only --no-owner -f prod-schema.sql` et
  `pg_dump "$PROD_URL" --data-only --schema=supabase_migrations -f prod-history.sql`
  (conserver ces fichiers **hors du dépôt public**).

**Étape 2 — Base reconstruite de référence**

- Créer la préproduction (§ 5) **vide**, puis y appliquer **tout le dépôt** :
  `npx supabase link --project-ref <ref-preprod> && npx supabase db push` (légitime : projet vide).
- Alternative sans projet : base locale `scripts/db-local-reset.sh` (ne couvre pas `auth`, Vault, pg_cron).

**Étape 3 — Comparaison `pg_dump --schema-only`**

```bash
for t in prod preprod; do
  pg_dump "$(eval echo \$${t^^}_URL)" --schema-only --no-owner --schema=public \
    | grep -v '^--' | sed '/^$/d' > /tmp/$t-public.sql
done
diff -u /tmp/prod-public.sql /tmp/preprod-public.sql > public.diff
```

- Compléter par la requête d'empreinte (annexe § 13) sur les deux bases : elle ignore l'ordre et les OID.
- Écarts attendus : aucun dans `public` hors `call_monstock_cron` (si 0700 non appliquée en prod) et les
  migrations `20261023*` (appliquées en préproduction seulement). **Tout autre écart** → analyser, puis
  corriger **par une nouvelle migration** (jamais en modifiant un ancien fichier).

**Étape 4 — Validation**

- Le titulaire valide le diff (écrit). Sans cette validation, **arrêt**.

**Étape 5 — Choix de la stratégie** (recommandée : le dépôt fait foi)

Marquer en production les 30 versions du dépôt comme appliquées et les 11 versions orphelines comme
annulées. `repair` n'exécute **aucun** SQL de migration : il écrit seulement dans
`supabase_migrations.schema_migrations`.

**Étape 6 — Réparation de l'historique** (production, avec autorisation)

```bash
# 6a. versions présentes seulement en base (rien n'est exécuté ni annulé dans le schéma)
npx supabase migration repair --status reverted \
  20261009114920 20261009122432 20261009123403 20261010043055 20261010050553 \
  20261010100950 20261010102053 20261010110000 20261010184757 20261010184924 20261011092900

# 6b. fichiers du dépôt dont l'effet est prouvé présent (étape 3)
npx supabase migration repair --status applied \
  20261007000100 20261007000200 20261007000300 20261007000400 20261007000500 \
  20261007000600 20261007000700 20261007000800 20261007000900 20261008001000 \
  20261008001100 20261008001200 20261008002000 20261008002100 20261008003000 \
  20261008005000 20261008005100 20261008005200 20261009000100 20261009000200 \
  20261009000300 20261009000400 20261009000500 20261010000100 20261010000200 \
  20261010000300 20261011000100 20261011000200
# 20261012000100 et 20261013000100 sont déjà enregistrées sous la bonne version.

npx supabase migration list   # attendu : Local = Remote pour toutes les versions ≤ 20261013000100
```

- `enable_pg_net_pg_cron` disparaît de l'historique mais **pas** de la base (les extensions restent). Pour
  qu'une base reconstruite les ait aussi, `20261023000700` doit les créer ou une migration idempotente
  `create extension if not exists pg_net with schema extensions; create extension if not exists pg_cron;`
  doit précéder 0700 (à décider avec l'auteur de 0700 ; sans effet sur la production).

**Étape 7 — Migrations nouvelles**

- Appliquer d'abord en préproduction (`db push`), lancer les contrôles (§ 7), puis en production :
  `npx supabase db push --dry-run` (doit lister **uniquement** les `20261023*`), puis `npx supabase db push`.

**Étape 8 — Garde-fou durable**

- Ajouter en CI : `supabase migration list` (échec si Local ≠ Remote) et `supabase db diff --linked` sur la
  préproduction. Interdire le SQL Editor pour les changements de schéma.

## 5. Préproduction et test de reconstruction

1. **Créer le projet** : Dashboard → New project « MON-STOCK-preprod », même région (`eu-west-1`), même
   version Postgres (17). (Les branches Supabase sont une alternative, mais exigent l'intégration GitHub et
   un historique propre : à envisager après l'étape 6.) Coût : un projet supplémentaire du plan Pro.
2. **Reconstruire** : `npx supabase link --project-ref <ref-preprod> && npx supabase db push`.
   La migration `20261009000400` génère `TOKEN_ENCRYPTION_KEY` et `CRON_SECRET` **propres à la
   préproduction** (jamais copier ceux de la production). Créer `PROJECT_URL` avant `20261023000700`.
3. **Edge Function** : déployer `supabase/functions/api` sur la préproduction ; clés eBay **sandbox**.
4. **Vérifier** : requête d'empreinte (§ 13) prod vs préprod ; `supabase/checks/rls-check.sql` (prévu
   pour ne pas tourner en production) ; parcours manuel (connexion, création d'organisation, mouvement de
   stock, validation d'une source découverte, suppression d'une organisation de test).
5. **Déplacer** vers la préproduction : organisation de démonstration, auto-tests serveur
   (`/cron/*-selftest`), essais de migration (D-03).
6. **Test de reconstruction périodique** : une fois par mois, supprimer et recréer la préproduction depuis
   le dépôt ; un échec signale une dérive.

## 6. Retour arrière et limites

- Chaque migration récente a un script `supabase/ops/rollback/<version>_<nom>_down.sql`, **manuel**, à
  exécuter seulement sur décision, puis `npx supabase migration repair --status reverted <version>`.
- Les scripts de 0300 à 0360 ont été testés en local : application → rejeu (idempotence) → retour arrière
  (ordre inverse) → réapplication : catalogue final **identique** au catalogue avant retour arrière ; après
  retour arrière, catalogue identique à une base sans ces migrations, **sauf** le `search_path`
  `public, pg_temp` des fonctions SECURITY DEFINER, conservé volontairement (sans effet fonctionnel ;
  d'autres migrations posent la même valeur).
- **Non réversible sans sauvegarde** :
  - les données supprimées par `delete_organization` (cascade complète) ou par `purge_retention(false, …)` ;
  - les colonnes et tables supprimées par un script `down` (journal des attestations, journal des réserves :
    exporter avant, commandes `copy` en tête des scripts) ;
  - les valeurs ajoutées à un type énuméré (PostgreSQL ne sait pas les retirer) ;
  - toute donnée écrite pendant la fenêtre si l'on restaure une sauvegarde complète.
- En dernier recours : restauration Supabase (sauvegarde quotidienne ou PITR, § 11.2), qui ramène
  **toute** la base à un instant donné.

## 7. Migrations 20261023000300 → 0360 : impact et contrôles avant production

Les requêtes de contrôle sont en lecture seule ; les exécuter en production juste avant d'appliquer.

| Migration | Objet | Impact sur les données existantes | Contrôles avant production |
| --- | --- | --- | --- |
| `0300_secdef_hardening` | Q-17 : `search_path = public, pg_temp` (17 fonctions) ; D-17 : `apply_inventory_movement` borne la date des appels clients (+10 min / −7 j, petite avance ramenée à `now()`), `adjust_reserved_quantity` réservée à `service_role`, bornée, verrouillée, journalisée (`inventory_reservation_events`) | aucune ligne modifiée ; nouvelle table vide | `select count(*) from cron.job where command ilike '%adjust_reserved_quantity%';` → 0 ; vérifier que le bundle Edge déployé n'appelle pas `adjust_reserved_quantity` (0 occurrence au 22/10) |
| `0310_rls_initplan_views` | D-15 : `(select auth.uid())` dans 13 politiques (ALTER POLICY, si elles existent), fusion des 2 politiques SELECT de `user_profiles` ; D-18 : vues sans INSERT/UPDATE/DELETE pour les clients | aucune ; mêmes lignes visibles | `select policyname from pg_policies where tablename = 'user_profiles';` → `user_profiles_select_own`, `user_profiles_select_org_members`, `user_profiles_update_own` |
| `0320_org_fk_indexes` | D-16 : 10 index `organization_id` | aucune ; verrou d'écriture bref par table | `select relname, n_live_tup from pg_stat_user_tables where relname in ('supplier_price_history','supplier_stock_history','price_history','sync_errors');` (quelques milliers de lignes) |
| `0330_supplier_source_attestation` | D-09 : `access_attested_by/at` posés par trigger, journal `supplier_source_attestations`, UPDATE client retiré sur les colonnes d'attestation, RPC `attest_supplier_source_access` | aucune ligne modifiée ; les sources existantes gardent `access_attested_*` à NULL (attestation antérieure, auteur inconnu) | `select count(*) filter (where automated_access_confirmed) as attestees, count(*) filter (where access_conditions is null) as sans_texte from public.supplier_sources;` ; **déployer le web** (`discovered-actions.ts`) dans la foulée |
| `0340_organization_limits_delete` | D-08 : 3 créations / 24 h / utilisateur, 1 démo par utilisateur ; RPC `delete_organization` (propriétaire, confirmation par le nom, refus si autres membres / commandes hors démo fictive / connexion active) | aucune ; les organisations existantes ne sont pas touchées | `select max(n) from (select created_by, count(*) n from public.organizations where is_demo group by 1) s;` (> 1 n'empêche pas l'application, seulement une nouvelle démo) |
| `0350_retention_purge` | D-10 : `purge_retention(...)` (service_role, simulation par défaut), **non planifiée** | aucune | — |
| `0360_inventory_movements_sku_restrict` | D-21 : `inventory_movements.sku_id` en ON DELETE RESTRICT | aucune ; validation de la contrainte (≈ 4 400 lignes) | `select confdeltype from pg_constraint where conname = 'inventory_movements_sku_id_fkey';` → `c` |

Remarques :

- **D-09, migrations futures** : `supplier_sources` n'a plus de droit UPDATE de niveau table pour
  `authenticated`. Une colonne ajoutée plus tard et modifiable par le client exige
  `grant update (<colonne>) on public.supplier_sources to authenticated;` dans sa migration.
- **D-08, interface** : `delete_organization` n'est appelée par aucun écran (aucune suppression
  automatique). Appel : `supabase.rpc("delete_organization", { p_organization_id, p_confirmation: <nom exact> })`.
  L'exception « démo fictive » (organisation `is_demo` dont toutes les commandes ont `connection_id` NULL)
  est à valider par le titulaire ; sans elle, l'unique démo autorisée par utilisateur ne pourrait jamais
  être remplacée.
- **D-21** : la suppression d'une organisation reste possible (le journal part par la cascade
  `organizations → inventory_movements`) ; seule la suppression directe d'un SKU ayant un historique est
  refusée, y compris en `service_role` (aucun code ne le fait).
- Tests : `tests/integration/security-db-remediation.test.ts` (17 tests) + matrices existantes
  (`security-tenant-matrix`, `security-roles`, `security-catalog`) qui énumèrent automatiquement les
  nouvelles tables et fonctions.

## 8. Revue des fonctions SECURITY DEFINER (Q-17)

Les 12 fonctions SECURITY DEFINER exécutables par `authenticated` (conseiller Supabase,
`authenticated_security_definer_function_executable`) ont été relues dans leur version de production
(corps identiques au dépôt, § 2.2). `anon` n'en exécute aucune.

| Fonction | Appelants (code) | Contrôles internes | Verdict / action |
| --- | --- | --- | --- |
| `is_org_member`, `is_org_admin`, `can_write_org`, `org_role_of` | politiques RLS, autres fonctions | ne lisent que l'appartenance **de l'appelant** (`auth.uid()`), aucun effet de bord | Conservées (révoquer casserait la RLS) ; `search_path` durci |
| `accept_invitation(p_token)` | web | connecté, e-mail confirmé, e-mail = invitation, `FOR UPDATE`, rôle existant non modifié | Correct ; `search_path` durci |
| `create_organization_with_owner` | web, mobile, démo | connecté seulement ; aucune limite ; `p_is_demo` libre | **Corrigée** (0340) : limite 3 / 24 h, 1 démo, verrou par utilisateur |
| `create_sku` | web, serveur | `can_write_org`, produit de la même organisation, fournisseur vérifié par le garde « même organisation » | Correct ; `search_path` durci |
| `apply_inventory_movement` | web, mobile, serveur, conseiller | `can_write_org`, ventes réservées au serveur, bornes, signe, verrou, anti-négatif ; **date libre** | **Corrigée** (0300) : date bornée pour les clients |
| `adjust_reserved_quantity` | **aucun** | `can_write_org` ; delta non borné, NULL remet à 0, aucune trace | **Révoquée** pour `authenticated` (0300), bornée, journalisée |
| `apply_pending_sales_for_sku` | web, mobile | `can_write_org` de l'organisation du SKU ; lignes de la même organisation (garde par trigger) | Correct ; `search_path` durci |
| `map_listing_to_sku` | web, mobile, serveur | `can_write_org` de l'annonce, SKU de la même organisation | Correct (`p_source` texte libre, sans risque d'accès) ; `search_path` durci |
| `receive_purchase_order_items` | web | `FOR UPDATE`, `can_write_org`, lignes de la commande uniquement, bornes | Correct ; `search_path` durci |

Nouvelles fonctions SECURITY DEFINER exposées à `authenticated` : `delete_organization` (0340) et
`attest_supplier_source_access` (0330), toutes deux avec contrôle d'appartenance (réponse « introuvable »
pour une autre organisation) et de rôle, `search_path = public, pg_temp`. `purge_retention` (0350) :
`service_role` seul.

## 9. Extensions `pg_trgm` / `unaccent` hors de `public` (D-14) — non fait

**Pourquoi ce n'est pas fait par migration** (constaté en lecture seule le 22/10/2026) :

- les deux extensions appartiennent à `supabase_admin` : `alter extension … set schema extensions`
  exécuté par une migration (rôle `postgres`) **échouerait** ;
- dépendances : `public.normalize_text()` appelle `public.unaccent(...)` (nom qualifié) et sert à
  **5 index d'expression** ; **6 index GIN** utilisent l'opérateur `gin_trgm_ops` ;
- risque : un index d'expression construit avec une fonction remplacée de travers serait incohérent.

**Procédure proposée (fenêtre de maintenance, préproduction d'abord, ~15 min)** :

1. Sauvegarde ; noter les définitions : `select indexdef from pg_indexes where indexdef ilike '%trgm%';`
2. `drop index` des 6 index trigrammes (la recherche reste fonctionnelle, plus lente).
3. Dashboard → Database → Extensions : désactiver `pg_trgm` et `unaccent`, puis les réactiver en
   choisissant le schéma `extensions` (exécuté en `supabase_admin`).
4. Migration : `create or replace function public.normalize_text(p text) … extensions.unaccent(...)` (même
   résultat) puis recréer les 6 index avec `extensions.gin_trgm_ops` (+ `reindex` des index d'expression).
5. Contrôle : conseiller Security (lint `extension_in_public` absent), recherche produit / offres.

## 10. Rétention et purge (D-10)

`public.purge_retention(...)` (migration 0350) — **service_role uniquement, non planifiée**.

```sql
-- Simulation (défaut) : ne supprime rien, renvoie les volumes concernés.
select public.purge_retention();
-- Exécution réelle avec les durées par défaut.
select public.purge_retention(p_dry_run => false);
```

| Paramètre | Défaut | Portée |
| --- | --- | --- |
| `p_sync_runs_days` | 90 | runs terminés (jamais `running`, jamais le dernier run d'une source) ; `sync_errors` en cascade |
| `p_webhook_events_days` | 90 | notifications traitées / ignorées / doublons / en échec (jamais `received`) |
| `p_oauth_states_grace_hours` | 24 | états OAuth expirés |
| `p_cron_run_details_days` | 30 | `cron.job_run_details` (ignoré si pg_cron absent ou droits insuffisants) |
| `p_supplier_history_days` | NULL | historiques de prix / stock fournisseurs (décision titulaire) |
| `p_resolved_alerts_days` | NULL | alertes résolues (décision titulaire) |
| `p_buyer_username_days` | NULL | anonymisation de `orders.buyer_username` (décision titulaire / RGPD) |

- NULL = catégorie ignorée ; minimum 7 jours par catégorie (garde-fou).
- Le conseiller IA (conversations, cartes, actions, `ai_usage_events`) relève de `advisor_purge_expired()`
  (migration 20261023000530) : une seule règle par donnée.
- **Planification** (à décider avec le titulaire, non faite) — exemple après décision :
  `select cron.schedule('monstock-retention', '13 3 * * *', $$select public.purge_retention(p_dry_run => false)$$);`
  Retrait : `select cron.unschedule('monstock-retention');`

## 11. Réglages du tableau de bord : mots de passe divulgués (D-13), sauvegardes et PITR (D-12)

Statut : **BLOCKED_EXTERNAL** — réglages du tableau de bord Supabase, hors SQL et hors dépôt, à faire par
le titulaire (accès propriétaire du projet).

### 11.1 D-13 — Protection contre les mots de passe divulgués

1. Dashboard → projet MON-STOCK → **Authentication → Attack Protection** (selon la version de l'interface :
   *Authentication → Policies / Password security*).
2. Activer **« Prevent use of leaked passwords »** (vérification HaveIBeenPwned ; disponible sur le plan Pro).
3. Dans la même page, fixer une longueur minimale (≥ 10) et exiger lettres + chiffres.
4. Vérifier : Advisors → Security : le lint `auth_leaked_password_protection` doit disparaître.
5. Effet : seuls les **nouveaux** mots de passe (inscription, changement) sont contrôlés ; prévoir un message
   clair côté application si l'erreur `weak_password` est renvoyée.

### 11.2 D-12 — Sauvegardes, PITR, restauration testée

1. Dashboard → **Database → Backups** : vérifier la présence des sauvegardes quotidiennes (plan Pro :
   7 jours) et noter la plus ancienne.
2. **PITR** : Project Settings → **Add-ons → Point in Time Recovery** : vérifier s'il est actif ; sinon
   décider (coût mensuel, exige une instance de calcul ≥ Small). RPO avec PITR : quelques minutes ; sans :
   jusqu'à 24 h.
3. **Restauration testée** (au moins une fois, puis chaque trimestre) : restaurer une sauvegarde **dans un
   nouveau projet** (fonction « Restore to new project » quand elle est proposée) ou dans la préproduction ;
   vérifier la connexion, le stock, une commande, et que les jetons eBay se déchiffrent
   (la clé `TOKEN_ENCRYPTION_KEY` est dans le Vault de la même base, voir D-05). Mesurer le temps total
   (RTO) et le consigner dans `docs/OPERATIONS.md`.
4. **Export logique hors Supabase** (hebdomadaire, stockage chiffré hors dépôt) :
   `pg_dump "$PROD_URL" --no-owner --schema=public --schema=auth -Fc -f monstock-$(date +%F).dump`.
   Attention : un tel export ne contient pas les secrets du Vault en clair ; conserver `TOKEN_ENCRYPTION_KEY`
   séparément (coffre du titulaire), sinon les jetons OAuth restaurés seront inutilisables.

## 12. Écrire une nouvelle migration

- Nom : `supabase/migrations/<AAAAMMJJhhmmss>_<sujet>.sql`, version strictement supérieure à la dernière.
- En-tête : objet, audit concerné, impact sur les données, contrôles, chemin du script de retour arrière.
- Idempotente (`if not exists`, `create or replace`, `drop … if exists` avant `create`), contrôles
  préalables en `do $$ … raise exception 'Contrôle préalable …' $$` (message en prose : un code
  `MAJUSCULES_` doit figurer dans `src/lib/db-error-messages.ts`).
- Nouvelle table à `organization_id` : RLS + politique `is_org_member`, privilèges minimaux,
  `select public.install_same_org_guards('public.<table>'::regclass);`, ligne de fixture dans
  `tests/integration/security-fixtures.ts`.
- Script `supabase/ops/rollback/<version>_<sujet>_down.sql` ; tester application → rejeu → retour → réapplication.
- Mettre à jour `src/db/database.types.ts` (`npm run db:types` sur la préproduction).

## 13. Annexe : requête d'empreinte du schéma

Lecture seule ; renvoie, par catégorie, le nombre d'objets et un MD5 de leurs définitions triées. Deux bases
au schéma `public` identique renvoient les mêmes lignes (hors extensions propres à Supabase).

```sql
with cols as (select 'col' k, table_name||'.'||column_name||':'||data_type||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,'') v from information_schema.columns where table_schema='public'),
pols as (select 'pol' k, tablename||'.'||policyname||':'||cmd||':'||array_to_string(roles,',')||':'||coalesce(qual,'')||':'||coalesce(with_check,'') v from pg_policies where schemaname='public'),
idx as (select 'idx' k, tablename||'.'||indexname||':'||indexdef v from pg_indexes where schemaname='public'),
cons as (select 'con' k, conrelid::regclass::text||'.'||conname||':'||pg_get_constraintdef(oid) v from pg_constraint where connamespace='public'::regnamespace),
trg as (select 'trg' k, tgrelid::regclass::text||'.'||tgname||':'||pg_get_triggerdef(oid) v from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace)),
tgr as (select 'tgrant' k, table_name||':'||grantee||':'||privilege_type v from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role')),
cgr as (select 'cgrant' k, table_name||'.'||column_name||':'||grantee||':'||privilege_type v from information_schema.column_privileges where table_schema='public' and grantee in ('anon','authenticated') and (table_name, grantee, privilege_type) not in (select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema='public')),
fgr as (select 'fgrant' k, p.proname||'('||pg_get_function_identity_arguments(p.oid)||'):'||r||':'||has_function_privilege(r, p.oid,'EXECUTE')::text||':'||p.prosecdef::text||':'||coalesce(array_to_string(p.proconfig,','),'') v from pg_proc p cross join (values ('anon'),('authenticated'),('service_role')) x(r) where p.pronamespace='public'::regnamespace and p.prokind='f' and p.oid not in (select objid from pg_depend where deptype='e')),
rls as (select 'rls' k, relname||':'||relrowsecurity::text||':'||relforcerowsecurity::text||':'||relkind::text v from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v','m')),
vopt as (select 'view' k, c.relname||':'||coalesce(array_to_string(c.reloptions,','),'')||':'||md5(regexp_replace(pg_get_viewdef(c.oid),'\s+',' ','g')) v from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v'),
enums as (select 'enum' k, t.typname||':'||string_agg(e.enumlabel, ',' order by e.enumsortorder) v from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typnamespace='public'::regnamespace group by t.typname),
ext as (select 'ext' k, extname||':'||extnamespace::regnamespace::text v from pg_extension)
select k, count(*), md5(string_agg(md5(v), '' order by md5(v)))
from (select * from cols union all select * from pols union all select * from idx union all select * from cons
      union all select * from trg union all select * from tgr union all select * from cgr union all select * from fgr
      union all select * from rls union all select * from vopt union all select * from enums union all select * from ext) s
group by k order by 1;
```

Corps des fonctions (à comparer séparément) :
`select proname, md5(regexp_replace(prosrc, '\s+', ' ', 'g')) from pg_proc where pronamespace = 'public'::regnamespace order by 1;`
