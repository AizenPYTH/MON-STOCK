# Sourcing B2B — état initial (audit du code réel, 15/10/2026)

Audit réalisé sur le dépôt (branche `claude/laughing-bardeen-bdn16j`, commit 4bb031e) et sur la
base de production `ccywsegdowikeirbsfae` (lecture seule). Objectif : étendre l'existant, sans
second système de fournisseurs.

## Ce qui existe et fonctionne

| Brique | Où | État vérifié |
|---|---|---|
| Annuaire global des fournisseurs | `src/services/sourcing/data/supplier-directory.json` (123 fiches) + `supplier-directory.ts` | Fiches statiques versionnées, statut calculé par organisation (identifié → connecté), e-mails de demande d'accès FR/EN, fiches B2B (`b2b-profiles.ts`) |
| Bibliothèque de sources publiques | `src/services/sourcing/source-library.ts` (31 entrées) | 22 sources actives en production : 1 856 offres publiques, 88 annonces eBay |
| Adaptateurs | `src/integrations/sourcing/*` | Shopify Storefront, WooCommerce Store, sitemap + JSON-LD, JSON-LD public, Google Merchant feed, eBay Browse (API officielle), **BigBuy (API clé)**, **Ingram Micro (OAuth2 client credentials)** |
| Connexions de comptes | `supplier_connections` + `supplier_connection_secrets` (AES-256-GCM, service_role) ; `src/services/sourcing/supplier-connectors.ts` | Création, test réel, synchronisation (20 pages max), routes Edge `/sourcing/accounts/*` |
| Import de catalogues | `catalog-import.ts`, routes `/sourcing/import/preview`, `/sourcing/import` | CSV / XLSX / XML / JSON, détection du format par le contenu, aperçu, correspondance des colonnes **mémorisée par fournisseur** (`sourcing_mapping_profiles`), modes partiel / instantané, contrôle qualité, historique (`sourcing_import_jobs` + `sourcing_import_issues`), même fichier détecté |
| Flux distants autorisés | `remote-feeds.ts`, `/sourcing/feeds` | HTTPS uniquement, protection SSRF (`http-ssrf.test.ts`), en-tête d'authentification chiffré (`supplier_feed_secrets`), 20 Mo, 5 000 lignes |
| Stockage des offres | `offer-storage.ts` (`storeOffer`) | Upsert sur (organisation, source, référence), normalisation, devises BCE, HT/TTC, historique prix/stock par déclencheurs SQL, stock inconnu conservé inconnu |
| Analyse des bonnes affaires | `src/domain/sourcing/deal-analysis.ts` | Équivalence stricte (modèle, type, qualité, capacité, état, grade, lots, hors service, multi-modèles), coût total, marge, niveaux, score |
| Recherche Fournisseurs | `simple-search.ts`, onglet mobile | En direct (10 sources max, places de marché d'abord) + offres stockées, tri par prix, « Vos comptes » avant « Sources publiques », logos (favicon distant) |
| Collecte hebdomadaire | `weekly-collection.ts` | Code déployé ; **migration `supabase/pending/20261014000100_sourcing_weekly_collection.sql` non appliquée** |
| Sécurité | RLS par organisation ; secrets sans politique ni privilège ; cron protégé (`CRON_SECRET`, comparaison en temps constant) ; mobile : clé publique Supabase + URL de l'API uniquement | Vérifié |

## Lacunes constatées (traitées dans cette mission)

1. **Logos** : icône chargée depuis le service public de Google à chaque affichage. C'est une
   dépendance tierce à l'exécution, sans fichier de logo maîtrisé ni registre central.
2. **Annuaire** : 123 fiches, sans méthode d'accès normalisée (les 9 catégories demandées), sans
   statut d'intégration ni priorité. Plusieurs fournisseurs demandés étaient absents : MPS Mobile,
   TR-Vertrieb, 4Phones, LCD-Phone, TD SYNNEX, Esprinet, Exertis…
3. **Deux écrans concurrents** : l'annuaire (`supplier-directory`) et « Mes comptes »
   (`pro-accounts`), avec des statuts calculés séparément.
4. **Bibliothèque** : liste simple, sans favoris, sans tri, sans filtres pays / catégorie /
   méthode, sans animation, sans action principale par carte.
5. **Fiche fournisseur** : pas de produits récupérés, pas d'état de synchronisation ni d'erreurs,
   actions incomplètes.
6. **Écran principal** : pas d'accès rapide aux erreurs de synchronisation, aux favoris ni aux
   imports.
7. **Rapport d'erreurs d'import** : consultable, mais pas exportable.
8. **Connecteurs** : seuls BigBuy, Ingram Micro et eBay ont une API officielle intégrée.
   Foxway, Foneday, MobileSentrix, Callisto et les autres n'ont **aucune API documentée
   publiquement**. Aucun connecteur ne peut être écrit sans documentation : on n'invente pas
   d'endpoint.

## Contraintes de cet environnement

- Pas d'accès Internet direct depuis le bac à sable (proxy 403). Les recherches passent par la
  recherche web ; les logos sont récupérés par GitHub Actions depuis le site officiel de chaque
  fournisseur.
- Pas de migration ni de déploiement en production sans validation explicite (consigne de la
  mission).
- Aucun compte fournisseur ouvert : aucune connexion réelle ne peut être testée.
