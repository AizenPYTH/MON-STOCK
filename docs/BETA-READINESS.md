# MON STOCK — Préparation à la bêta

État au 2026-10-09, branche `claude/laughing-bardeen-bdn16j`. Tous les chiffres ci-dessous ont été mesurés, aucun n'est estimé.

**Verdict : 🟠 PRÊT AVEC RÉSERVES.** Le socle (comptes, isolation entre organisations, stock, commandes fournisseurs, intelligence, sourcing sur données présentes en base) est prêt pour de premiers utilisateurs. **Trois points bloquent une bêta « vente réelle »** : l'intégration eBay n'a jamais été exécutée contre l'API eBay, aucune source de sourcing n'est réellement connectée, et les pages authentifiées n'ont jamais été affichées avec un vrai projet Supabase. Voir « NEEDS ATTENTION ».

## Vérification exécutée

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck` | 0 erreur |
| `npm run lint` | 0 erreur, 0 avertissement |
| Tests unitaires (`npm test`) | 648 réussis / 648 (73 fichiers) |
| Tests d'intégration sur base neuve, 19 migrations (`npm run test:integration`) | 142 réussis / 142 (18 fichiers) |
| — dont sécurité multi-tenant / RLS / rôles | 44 |
| — dont synchronisation, idempotence, concurrence (eBay, commandes) | 50 |
| — dont stock, commandes fournisseurs, vues analytiques | 44 |
| Types générés vs migrations | identiques |
| `npm run build` (production) | réussi |
| E2E Playwright, pages publiques, 375 / 768 / 1280 px (`npm run test:e2e`) | 21 réussis / 21 |
| Routes | 38 pages + 6 routes API ; liens internes vérifiés par un test |
| Base | 39 tables, 5 vues, 112 fonctions, 106 politiques RLS |

## READY — réellement prêt

- **Comptes** : inscription, confirmation email, connexion, déconnexion, mot de passe oublié, session expirée (message clair), routes protégées, redirections sûres.
- **Organisations** : création, changement d'organisation, invitations liées à l'email vérifié, rôles owner / admin / member / viewer, dernier propriétaire protégé.
- **Isolation multi-tenant** : RLS sur toutes les tables, garde « même organisation » sur toutes les clés étrangères, `organization_id` immuable, aucune fonction exécutable par `anon`. Testé table par table et fonction par fonction à partir du catalogue PostgreSQL.
- **Stock** : PRODUIT → VARIANTE → SKU, mouvements journalisés et immuables, stock disponible/réservé, archivage (l'historique ne peut pas être supprimé), modifications concurrentes détectées, limites de quantité, alerte de stock négatif.
- **Commandes fournisseurs** : brouillon → envoyée → confirmée → réception partielle/totale, machine à états en base, double réception impossible, coût de référence uniquement dans la même devise.
- **Intelligence** : ventes, vitesse, jours de stock, rotation, risque de rupture, réapprovisionnement expliqué, marges (coûts inconnus jamais comptés à 0, devises jamais additionnées), jours calendaires Europe/Paris. « Pas assez de données » quand c'est le cas.
- **Sourcing sur les offres présentes en base** (saisie manuelle, flux CSV/XML/JSON importés) : normalisation, filtrage expliqué, déduplication, podium expliqué, badge de confiance, historique des prix, alertes, « Trouver moins cher » uniquement sur offres réelles.
- **Sécurité front** : en-têtes (CSP, HSTS, X-Frame-Options…), URLs externes filtrées (pas de `javascript:`), anti-SSRF sur toutes les URLs saisies par l'utilisateur, aucun secret côté client.

## NEEDS ATTENTION — problèmes connus

1. **eBay jamais exécuté en conditions réelles.** OAuth, annonces, commandes, webhooks et envoi de quantités sont implémentés d'après la documentation officielle et testés sur réponses simulées uniquement (le réseau sortant de l'environnement de développement est bloqué). À valider avec un compte développeur eBay **sandbox** avant toute utilisation sur un vrai compte vendeur.
2. **Sourcing : 0 source réellement connectée.** Les 6 adaptateurs sont testés sur fixtures uniquement ; les 35 sources documentées n'ont jamais été ouvertes depuis l'environnement (vérification à relancer : `npm run sources:verify`).
3. **Pages authentifiées jamais affichées avec de vraies données.** Elles compilent, sont typées et testées côté logique, mais n'ont été rendues ni avec un vrai projet Supabase ni dans un navigateur. Les pages publiques l'ont été.
4. CSP avec `'unsafe-inline'` pour les scripts (sans nonce). Acceptable pour la bêta ; une CSP à nonce via `proxy.ts` serait plus stricte.
5. Le trigger « même organisation » fait des lectures par ligne : coût à mesurer sur une synchronisation de plusieurs milliers d'annonces.
6. Le filtre « Stock non déduit » de `/sales` transmet jusqu'à 1 000 identifiants dans l'URL.
7. `EmptyState` et `CardHeader` utilisent `h3` directement sous le `h1` de page (hiérarchie de titres).

## NOT AVAILABLE — non implémenté (affiché « Disponible prochainement »)

- Canaux de vente Amazon, Shopify, WooCommerce.
- Facturation / abonnement.
- Envoi d'emails d'invitation (le lien est affiché à l'administrateur).
- Connecteurs SFTP / EDI fournisseurs.

## KNOWN LIMITATIONS — limitations assumées

- Changer `TOKEN_ENCRYPTION_KEY` oblige à reconnecter les comptes eBay et fournisseurs (pas de rotation de clé).
- Une commande eBay illisible est signalée (`INVALID_ORDER`) mais pas retentée, pour ne pas bloquer la synchronisation.
- Les caches de recherche en direct, de découverte et de taux de change vivent en mémoire du serveur (non partagés entre instances).
- La découverte de fournisseurs est désactivée par défaut (clé Brave Search API requise) ; une source découverte n'est jamais interrogée avant validation manuelle des conditions d'utilisation.
- L'insight « prix habituel » exige au moins 5 relevés sur 14 jours : il n'apparaît pas sur des données neuves.
- Les offres enregistrées avant le correctif du normaliseur (ex. « iPad Air 2022 ») gardent leur ancien modèle jusqu'à la prochaine synchronisation de leur source.
- `registrableDomain` (découverte) utilise une liste courte de suffixes, pas la Public Suffix List complète.

## TEST ACCOUNTS — comptes nécessaires

| Compte | Pourquoi | Où |
| --- | --- | --- |
| Projet Supabase **dédié à la bêta** (pas la production) | base, authentification | supabase.com, migrations via `npx supabase db push` |
| Compte développeur eBay + keyset **Sandbox** + utilisateur vendeur de test sandbox | valider OAuth, annonces, commandes, webhooks | developer.ebay.com, voir `docs/ebay-setup.md` |
| Au moins une source fournisseur réelle autorisée (boutique Shopify/WooCommerce publique, flux Google Merchant, ou compte BigBuy / Ingram Micro) | valider la recherche en direct sur de vraies offres | accord écrit ou CGU vérifiées |
| (Optionnel) Clé Brave Search API | découverte de fournisseurs | api.search.brave.com |
| 3 comptes utilisateurs dans 2 organisations (owner + member + viewer) | tests de rôles et d'isolation | inscription normale |

## TEST PROCEDURES — workflows critiques

1. **Comptes et rôles.** Créer l'organisation A (owner), inviter un member et un viewer ; vérifier que le viewer ne voit aucun bouton d'écriture actif et que le member ne peut pas gérer les membres. Créer l'organisation B avec un autre compte : aucune donnée de A ne doit apparaître (stock, ventes, fournisseurs, sourcing, synchronisations).
2. **Stock.** Créer un produit avec deux variantes (stockage, couleur, grade, EAN) ; réception +10 ; ajustement −3 ; tenter −20 (refus attendu) ; modifier le prix dans deux onglets (le second doit être refusé) ; archiver puis restaurer.
3. **Commandes fournisseurs.** Créer une commande depuis une offre (« Préparer la commande ») ; l'envoyer ; réception partielle puis totale ; double-cliquer « Réceptionner » (aucun double comptage) ; vérifier le stock et le coût de référence.
4. **eBay (sandbox).** Connecter eBay ; lancer l'assistant ; vérifier les annonces importées et l'association automatique par SKU exact ; associer une annonce à la main ; créer une vente sandbox ; synchroniser : la commande apparaît une seule fois et le stock baisse une seule fois ; synchroniser à nouveau (rien ne change) ; annuler la commande (le stock remonte une fois) ; révoquer l'autorisation côté eBay (statut « expiré », bouton « Reconnecter eBay »).
5. **Sourcing.** Ajouter un fournisseur, une offre manuelle, puis un flux CSV ; rechercher « iPhone 13 128 Go Grade A » : vérifier podium, raisons de rejet, traçabilité (méthode, date, URL source) ; depuis une fiche SKU, « Trouver moins cher » : l'économie n'apparaît que si une offre réelle est moins chère que le coût actuel.
6. **Intelligence.** Avec des ventes réelles : tableau de bord, `/stock/alerts`, `/insights` (« Actualiser les recommandations »), `/margins` ; vérifier que les SKU sans coût sont exclus et signalés.
7. **Erreurs.** Couper le réseau du navigateur pendant une action, laisser expirer la session puis soumettre un formulaire : un message clair doit apparaître, jamais une page blanche.

## Commandes de vérification

```bash
npm run typecheck && npm run lint && npm test
PGPASSWORD=postgres npm run db:local:reset && npm run test:integration
npm run build
npm run sources:verify            # depuis une machine avec accès réseau
npm run sourcing:test-searches    # avec des sources réellement configurées
```
