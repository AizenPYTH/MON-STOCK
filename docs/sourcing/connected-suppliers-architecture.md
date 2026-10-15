# Sourcing B2B — architecture (fournisseurs publics et comptes connectés)

Principe : **un seul système**. L'annuaire existant est étendu par un registre commun, et l'état
réel de chaque organisation est calculé à partir des tables existantes. Aucune table ni migration
n'a été ajoutée.

## Couches

| Couche | Fichier | Rôle |
|---|---|---|
| Registre global (données) | `src/services/sourcing/data/supplier-directory.json` | 196 fiches (123 existantes + 73 nouvelles), communes à toutes les organisations, versionnées dans Git |
| Registre global (règles) | `src/domain/sourcing/supplier-registry.ts` (module pur) | 9 méthodes d'accès, statut d'intégration, priorité pondérée, fiabilité, action principale, écartés (`ABANDONED`), consultation seule (`MANUAL_ONLY`), connecteurs réels (`CONNECTOR_BY_KEY`) |
| Comptes pro prioritaires | `src/domain/sourcing/pro-accounts.ts` | Ordre et conditions des comptes à connecter, origine d'une offre (votre compte / publique / place de marché) |
| Bibliothèque publique | `src/services/sourcing/source-library.ts` | Catalogues publics collectés par MON STOCK (activation avec attestation des CGU) |
| Connecteurs API | `src/integrations/sourcing/<clé>` + `src/integrations/suppliers/core.ts` | Interface commune `SourceAdapter` (recherche, catalogue paginé, test) ; adaptateurs « compte » : BigBuy (clé), Ingram Micro (OAuth2 client credentials) |
| Connexions privées | `supplier_connections` + `supplier_connection_secrets` | Une connexion par organisation ; identifiants chiffrés AES-256-GCM, table sans politique RLS ni privilège (service_role uniquement) |
| Flux et imports | `supplier_feeds` + `supplier_feed_secrets`, `catalog-import.ts`, `sourcing_mapping_profiles`, `sourcing_import_jobs` / `_issues` | Flux distants autorisés (anti-SSRF), fichiers CSV / XLSX / XML / JSON, correspondance des colonnes mémorisée par fournisseur, historique et rapport d'erreurs |
| Offres et historique | `sourcing_offers`, `supplier_price_history`, `supplier_stock_history` (déclencheurs) | Upsert idempotent (organisation, source, référence), stock inconnu conservé inconnu, prix et stocks historisés |
| Synchronisations | `sync_runs`, `weekly-collection.ts` | Verrou par source, statut partiel / complet ; aucune expiration sur échec ou collecte partielle |
| État par organisation | `directoryForOrg` (`supplier-directory.ts`) | Pour chaque fiche : fournisseur rattaché (par domaine, sinon par nom), offres de votre compte / publiques, dernière synchronisation, dernière erreur, connexion, action principale |
| Analyse | `deal-analysis.ts`, `simple-search.ts` | Inchangée : équivalence stricte, coût total, marge, niveaux ; chaque offre porte son origine (`access`) et son domaine (logo) |

## Les 9 méthodes d'accès

| # | Méthode | Calculée quand |
|---|---|---|
| 1 | API officielle intégrée | Connecteur MON STOCK réel (`CONNECTOR_BY_KEY`) |
| 2 | Autorisation officielle (OAuth) | Place de marché à autorisation (eBay) |
| 3 | Flux de catalogue | Flux CSV / XML / JSON / EDI annoncé |
| 4 | Export depuis l'espace client | Téléchargement depuis le portail revendeur |
| 5 | Import de fichier | Liste de stock par e-mail, export, flux ou catalogue public, ou compte pro |
| 6 | API à intégrer (développement) | API annoncée sans connecteur MON STOCK |
| 7 | Compte pro à ouvrir | Compte professionnel requis |
| 8 | Non automatisable | Devis seul, consultation seule, ou CGU interdisant l'automatisation |
| 9 | Catalogue public intégré | Source équivalente présente dans la bibliothèque MON STOCK |

Le statut d'intégration ne devient **« Connecté et testé »** que sur preuve : connexion API testée
avec succès, import réussi ou source publique active. Un lien vers le site n'est jamais présenté
comme une connexion.

## Logos

- `scripts/fetch-supplier-logos.mjs`, lancé par le workflow `.github/workflows/supplier-logos.yml`
  (manuel). Le bac à sable de développement n'a pas d'accès Internet. Le script :
  - récupère l'icône officielle sur le site de chaque fournisseur (`apple-touch-icon`, icône
    déclarée, `/favicon.ico`) ;
  - la convertit en PNG 128 px ;
  - l'écrit dans `apps/mobile/assets/suppliers/` ;
  - génère `apps/mobile/src/data/supplier-logos.generated.ts`, le **registre central** des logos.
- `docs/sourcing/supplier-logos-manifest.json` indique la source exacte, la date et les refus de
  chaque logo.
- `SupplierLogo` affiche l'image embarquée sur une plaque claire, lisible sur fond clair comme
  sombre. Sinon, il affiche les initiales. Aucun appel à un service tiers n'a lieu à l'affichage.

## Application

| Écran | Fichier |
|---|---|
| Fournisseurs (recherche, accès rapides, « Vos comptes » d'abord) | `apps/mobile/src/app/(app)/(tabs)/sourcing.tsx` |
| Bibliothèque (recherche, vues rapides, filtres pays / catégorie / méthode, tri, favoris, animations) | `apps/mobile/src/app/(app)/supplier-directory/index.tsx` |
| Fiche fournisseur (identité, méthodes, connexion, produits récupérés, avantages et limites, actions) | `apps/mobile/src/app/(app)/supplier-directory/[key].tsx` |
| Mes comptes fournisseurs | `apps/mobile/src/app/(app)/pro-accounts.tsx` |
| Composants partagés (`FadeIn`, `FavoriteButton`, `ConnectApiSheet`, `useSupplierAction`, `useReduceMotion`) | `apps/mobile/src/components/supplier-library.tsx` |
| Favoris (par appareil et par organisation, AsyncStorage) | `apps/mobile/src/data/supplier-favorites.ts` |
| Rapport d'erreurs d'import (CSV via la feuille de partage) | `sourcing-imports/[id].tsx`, `issuesCsv` |

## Routes serveur (Edge Function `api`)

| Route | Accès |
|---|---|
| `GET /sourcing/directory` | Membre ; annuaire enrichi de l'état de l'organisation |
| `GET /sourcing/supplier-offers?supplierId=` | Membre ; produits récupérés d'un fournisseur de l'organisation |
| `GET /sourcing/accounts` | Membre ; comptes pro et sources publiques |
| `POST /sourcing/accounts/connect` | Rédacteur ; identifiants chiffrés côté serveur, puis test réel |
| `POST /sourcing/accounts/sync` | Rédacteur |
| `POST /sourcing/accounts/disconnect` | Administrateur ; identifiants supprimés |

## Performance

| Point | Mesure |
|---|---|
| Liste de la bibliothèque | `FlatList` virtualisée (8 cartes initiales, `windowSize` 7) ; filtrage et tri mémoïsés |
| Animations | Apparition limitée aux 8 premières cartes ; aucune si « Réduire les animations » est actif |
| Comptage des offres par source | Une requête d'une seule colonne (`source_id`) bornée à 50 000 lignes. Au-delà, prévoir une vue SQL agrégée |
| Logos | Fichiers embarqués : aucun réseau et aucune latence à l'affichage |
| Synchronisations | Jamais à l'ouverture de l'application ; uniquement planifiées ou à la demande |

## Favoris : pourquoi sur l'appareil

Mémoriser les favoris côté serveur demanderait une table et une migration. La consigne interdit de
la passer en production sans validation. Les favoris sont donc mémorisés sur l'appareil (préférence
personnelle, aucune donnée sensible). Une table `sourcing_supplier_favorites` (organisation,
utilisateur, clé, RLS par membre) pourra les synchroniser entre appareils après validation.
