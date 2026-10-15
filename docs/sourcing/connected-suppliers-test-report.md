# Sourcing B2B — rapport de tests (15/10/2026)

## Résultats

| Suite | Résultat |
|---|---|
| Tests serveur (Vitest, `tests/unit`) | **1 034 réussis / 1 034** (108 fichiers) |
| Tests application (Jest, `apps/mobile/tests`) | **179 réussis / 179** (29 suites) |
| Typecheck serveur (`npm run typecheck`) | OK |
| Typecheck application (`tsc -p apps/mobile`) | OK |
| Lint serveur | 0 erreur (2 avertissements préexistants dans les shims Edge) |
| Lint application | 0 erreur, 0 avertissement |
| Build de l'Edge Function | OK (bundle de 1,49 Mo) |

## Couverture des points demandés

| Point | Tests |
|---|---|
| Annuaire | `supplier-registry.test.ts` : 196 fiches, clés uniques, champs valides, fournisseurs demandés présents |
| Méthodes d'accès, statut, priorité, action | `supplier-registry.test.ts` : API intégrée ou à développer, import, non automatisable, écartés, eBay, gsmExchange / Merkandi |
| Logos et repli | `supplier-library.test.tsx` : logos embarqués (Foxway, BigBuy) et initiales (LCD-Phone) ; `pro-accounts.test.tsx` |
| États de connexion | Connecté par import, en erreur (401), en attente, non connecté : `supplier-registry.test.ts` et `supplier-library.test.tsx` |
| Isolation multi-organisation | Annuaire et produits d'un fournisseur : rien de l'autre organisation (`supplier-registry.test.ts`) |
| Connexion API | Identifiants transmis au service chiffré, test réel, refus si champ manquant ou fournisseur sans connecteur (`pro-accounts.test.ts`) ; feuille de connexion (`pro-accounts.test.tsx`) |
| Synchronisation et déconnexion | `supplier-library.test.tsx` (BigBuy en erreur) |
| Imports, formats, doublons, devises | Suites existantes : `catalog-import`, `import-quality`, `sourcing-*` |
| Rapport d'erreurs d'import | `issuesCsv` : échappement, BOM Excel |
| Changements de prix et de stock | Suites existantes (`offer-storage`, déclencheurs d'historique) |
| Synchronisations interrompues, collectes partielles | `weekly-collection.test.ts` (aucune expiration sur échec ou collecte partielle) |
| Tokens expirés, quotas, erreurs fournisseur | Suites existantes des adaptateurs (`sourcing-adapter-*`, `ebay-resilience`) |
| Calcul des marges | `deal-analysis.test.ts` (29 tests) |
| Navigation et interface | Bibliothèque (filtres, vues, favoris, tri, ouverture de fiche), fiche (méthodes, connexion, produits, import), accès rapides de l'écran principal |

## Ce qui n'a PAS été testé en conditions réelles

- **Aucune connexion fournisseur réelle.** Aucun compte n'est ouvert : Ingram Micro, BigBuy,
  Foxway, DistriHUB…
- **Rendu sur iPhone réel :** pas de nouvelle build TestFlight dans cette mission, car il faut votre
  validation pour publier le serveur correspondant. Le rendu a été vérifié par les tests de rendu
  React Native, pas visuellement sur un appareil.
- **Logos :** récupérés et contrôlés visuellement sur une planche contact (139 retenus, 4 écartés),
  pas encore vus dans l'application installée.
