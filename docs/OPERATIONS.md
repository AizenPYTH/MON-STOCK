# MON STOCK — Guide opérationnel

Guide court pour mettre en service et vérifier MON STOCK. Détails techniques :
[SERVER.md](SERVER.md) (serveur, routes, eBay, radar, IA, sécurité) et [MOBILE.md](MOBILE.md)
(application). **Aucune clé n'est écrite dans ce document ni dans le dépôt** : les secrets se
saisissent uniquement dans le Dashboard Supabase.

Projet Supabase TEST : `ccywsegdowikeirbsfae` · Edge Function : `api` · URL de base :
`https://ccywsegdowikeirbsfae.supabase.co/functions/v1/api`

---

## 1. Configuration des fournisseurs

1. Application → Sourcing → **Fournisseurs** : annuaire de 63 fournisseurs qualifiés (reconditionné,
   pièces, lots, distributeurs IT, spécialistes). Chaque fiche indique le mode d'accès réaliste
   (portail pro, fichier, flux, API), les conditions (HT/TTC, MOQ, livraison, garantie) et la
   procédure pour obtenir le catalogue.
2. Fiche → **E-mail de demande d'accès** (FR ou EN) : la messagerie s'ouvre avec une demande
   pré-rédigée (export CSV/XLSX ou API, conditions, fréquence de mise à jour). Complétez vos
   coordonnées et votre SIRET avant l'envoi.
3. Sources publiques vérifiées (Brico-phone) : Sourcing → icône bibliothèque → **Activer** après
   lecture des CGU.
4. Les statuts « vérifié » / « temporairement indisponible » sont mis à jour chaque jour (05:41
   UTC) par un contrôle réel du site ; « connecteur fonctionnel » et « import réel testé » se
   calculent à partir de vos sources et imports.

## 2. Import d'un catalogue fournisseur

Formats : CSV, TSV, XLSX (première feuille), XML, JSON — UTF-8 ou Windows-1252, 15 Mo max.

1. Sourcing → **Importer** → choisir un fournisseur existant ou saisir son nom.
2. Choisir le fichier (Fichiers, pièce jointe enregistrée, iCloud…).
3. Vérifier la correspondance des colonnes proposée (référence fournisseur, titre, prix, devise,
   HT/TTC, stock, EAN, MPN, marque, état, MOQ, URL). Les prix « HT » / « TTC » sont déduits de
   l'en-tête quand il le dit ; sinon choisissez.
4. Aperçu des 20 premières lignes + erreurs par ligne → **Confirmer l'import**.
5. Résultat : offres enregistrées, lignes illisibles, offres rejetées. Les offres portent l'origine
   « catalogue importé » et la date d'import ; un nouvel import met à jour les prix et alimente
   l'historique.
6. Rapprochement : une offre dont l'EAN ou le MPN correspond exactement à un SKU est associée
   automatiquement ; les autres suggestions sont dans Radar → **Rapprochements à valider**.

## 3. Ajout d'un compte professionnel fournisseur

1. Créez le compte chez le fournisseur (Kbis / SIRET / TVA intracommunautaire souvent demandés).
2. Selon ce qu'il fournit :
   - **fichier** (e-mail, portail, FTP) → import (§2), à refaire à chaque nouvelle liste de prix ;
   - **URL de flux** CSV/XML/JSON → source « flux » relue toutes les 6 h par le serveur. L'écran
     de saisie existe dans l'application web MON STOCK (Fournisseurs → Flux), **non déployée** :
     en attendant, utilisez l'import de fichier ;
   - **API** (BigBuy, Ingram Micro) → identifiants enregistrés chiffrés côté serveur (même écran
     web, jamais dans l'application mobile ni dans le dépôt). eBay Browse n'a besoin que des clés
     eBay du serveur (§5).
3. Ne partagez jamais un mot de passe de portail : MON STOCK ne se connecte pas aux portails à
   votre place et ne contourne aucune connexion ni CAPTCHA.

## 4. Configuration des secrets

Supabase Dashboard → projet → **Edge Functions → Secrets** (jamais dans Git, jamais dans l'app) :

| Secret | Quand |
| --- | --- |
| `EBAY_ENV` (`production`), `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RU_NAME` | pour connecter eBay (§5) |
| `ANTHROPIC_API_KEY` | pour le produit dicté et l'assistant (§6) |
| `EBAY_LISTING_ENABLED` = `true` | seulement quand vous décidez d'autoriser la publication d'annonces |

Générés automatiquement dans Vault (ne pas modifier) : `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`,
`EBAY_WEBHOOK_VERIFICATION_TOKEN`. Un nouveau secret est pris en compte par la fonction sans
redéploiement (au plus tard au démarrage d'une nouvelle instance, en pratique quelques minutes).

## 5. Configuration eBay

Procédure complète : [SERVER.md §4](SERVER.md#4-ebay--seule-configuration-manuelle-restante).
En bref : keyset Production → RuName avec l'URL de retour
`…/functions/v1/api/ebay/callback` (acceptée et refusée) + URL de politique de confidentialité →
notification « Marketplace account deletion » vers `…/functions/v1/api/ebay/webhook` avec le jeton
de Vault → 4 secrets eBay (§4) → application : Réglages → Intégrations → eBay → **Connecter mon
compte eBay** (administrateur). Un compte connecté avant le 10 octobre 2026 doit être reconnecté
une fois (nouveau scope de lecture des politiques).

Avant la première annonce : sur eBay, activer les **politiques métier** (paiement, retour,
expédition) et créer un **emplacement d'inventaire**.

## 6. Configuration Anthropic

1. console.anthropic.com → API Keys → créer une clé dédiée « MON STOCK serveur » ; fixer une limite
   de dépense mensuelle dans la console.
2. Ajouter `ANTHROPIC_API_KEY` (§4).
3. Vérifier : `GET /health` → `aiConfigured: true` ; application → Réglages → Diagnostic →
   « Assistant IA : activé ».
4. Quotas intégrés : 40 questions et 60 produits dictés par heure et par utilisateur, 400 appels par
   jour et par organisation.

## 7. Vérification du serveur

- Navigateur : `https://ccywsegdowikeirbsfae.supabase.co/functions/v1/api/health` → `ok: true`,
  `cronConfigured`, `encryptionConfigured`, `ebayConfigured`, `aiConfigured` (noms des secrets
  chargés, jamais leurs valeurs).
- Contrôles complets, depuis le SQL Editor (le secret est lu dans Vault, rien à copier) :

  ```sql
  select public.call_monstock_cron('readonly-check');   -- radar, annuaire, suggestions sur le schéma réel
  select public.call_monstock_cron('chain-selftest');   -- SKU → import → rapprochement → radar → contrôle eBay (organisation temporaire supprimée)
  select public.call_monstock_cron('import-selftest');  -- import d'un fichier réel (organisation temporaire supprimée)
  select public.call_monstock_cron('ai-tools-check');   -- outils de l'assistant sur le schéma réel
  -- puis, quelques secondes plus tard :
  select id, status_code, left(content::text, 800) from net._http_response order by id desc limit 4;
  ```
- Journaux : Dashboard → Edge Functions → `api` → Logs (aucun secret n'y est écrit).

## 8. Vérification des synchronisations

- Application : Réglages → eBay → dernière synchronisation réussie, dernier passage, erreurs ;
  « Synchroniser maintenant ».
- SQL :

  ```sql
  select provider, status, started_at, records_processed, error_count, error_summary
  from public.sync_runs order by started_at desc limit 10;
  select jobname, status, start_time from cron.job_run_details d join cron.job j using (jobid)
  order by start_time desc limit 10;
  ```
- Stock : une vente déduit le stock une seule fois ; un remboursement après expédition ne recrédite
  pas (alerte « Remboursement après expédition » → enregistrer un « Retour client » si l'article
  revient).

## 9. Procédure de test sur iPhone

TestFlight → MON STOCK → installer le dernier build, puis suivre
[MOBILE.md §7](MOBILE.md#7-procédure-de-test-sur-iphone-bêta) : produit, variantes, sourcing,
import de catalogue, radar, fournisseurs, eBay, annonce (contrôle), produit dicté, assistant,
diagnostic, mode avion.

## 10. Retour à une version précédente

| Élément | Procédure |
| --- | --- |
| Application iOS | TestFlight → MON STOCK → **Builds précédents** → installer le build voulu. Pour redistribuer : `eas build -p ios --profile production` depuis le commit voulu. |
| Edge Function | Redéployer l'entrée `index.ts` en important le `bundle.js` d'un commit antérieur (`raw.githubusercontent.com/AizenPYTH/MON-STOCK/<sha>/supabase/functions/api/bundle.js`), ou `git checkout <sha> -- supabase/functions/api && supabase functions deploy api --no-verify-jwt`. Version 17 = commit `8846e0c`, version 18 = commit `8e96407`. |
| Base de données | Pas de retour arrière destructif. Chaque migration de l'audit indique comment l'annuler : `20261010000300` → réappliquer la définition de `ingest_external_order` de `20261008005000` ; `20261010000100` / `0200` → tables nouvelles, les conserver (données) ; droits révoqués rétablissables par `grant`. Sauvegardes : Dashboard → Database → Backups. |
| Tâche planifiée | `select cron.unschedule('monstock-directory-checks');` (idem pour les autres noms) |
| Publication eBay | Retirer `EBAY_LISTING_ENABLED` des secrets : la publication est immédiatement refusée. |
| IA | Retirer `ANTHROPIC_API_KEY` : l'IA affiche « non activé », le reste fonctionne. |

## 11. Procédure de diagnostic

1. Application → Réglages → **Diagnostic** : base, compte et rôle, serveur, assistant IA, sourcing,
   eBay — chaque ligne « OK » / « attention » / « erreur » avec la raison et la durée. Tirer vers
   le bas pour relancer.
2. Serveur : `/health` (§7), puis journaux de la fonction.
3. Synchronisation : `sync_runs` et `sync_errors` (§8) ; alertes ouvertes : Intelligence
   (alerte principale) ou `select type, title, message from public.alerts where status = 'open';`.
4. Sourcing : `select * from public.supplier_directory_checks order by checked_at desc;` (contrôles
   des sites) ; résultats d'import dans `sync_runs` (`source_kind = 'supplier_feed'`).
5. Sécurité : Dashboard → Advisors → Security (résultat attendu : SERVER.md §9).

---

## Checklist finale (10 octobre 2026)

### 1. Fonctionnel et testé réellement

- Edge Function `api` v18 sur TEST : `/health`, secrets du Vault, tâches planifiées (pg_cron).
- Migrations `20261010000100` → `0300` appliquées sur TEST ; droits et `search_path` vérifiés
  (conseiller de sécurité : 18 → 12 fonctions exposées, 13 → 0 avertissements `search_path`).
- Import de catalogue : fichier réel importé sur TEST (2 offres, 1 ligne illisible signalée,
  organisation temporaire supprimée).
- Chaîne SKU → import → rapprochement EAN automatique → radar (bénéfice, coût manquant signalé,
  origine du prix) → contrôle d'annonce eBay (verrous) sur TEST.
- Annuaire : 63 fiches, contrôle réel des sites depuis le serveur (53 joignables).
- Source publique Brico-phone : offres réelles relevées ; taux BCE importés.
- Outils de lecture de l'assistant (6) sur le schéma réel.
- Règles de stock (vente unique, rejeu sans effet, annulation, remboursement avant / après
  expédition), RLS et isolation entre organisations, gardes « même organisation », quotas IA,
  offres enregistrées : tests d'intégration sur PostgreSQL réel avec toutes les migrations
  (891 / 891).
- Application : typecheck, lint, 98 tests ; bundle iOS de production exporté et analysé (aucun
  secret) ; build TestFlight 6 accepté par Apple (avant cet audit).

### 2. Fonctionnel uniquement avec des tests simulés

- eBay OAuth (anti-CSRF, échange, rafraîchissement, révocation), synchronisation des commandes et
  annonces, webhooks signés, limites de débit : réponses eBay simulées.
- Préparation, contrôle et publication d'annonce eBay (anti-doublon, verrous), lecture des
  politiques du compte : réponses eBay simulées.
- Produit dicté et assistant IA : réponses Claude simulées (schéma, outils, refus, erreurs,
  délais) ; fonctionnement sans clé testé.
- Connecteurs flux URL, BigBuy, Ingram Micro, eBay Browse : fichiers de réponse de test.
- Écrans mobiles (radar, import, annuaire, annonce, diagnostic, assistant) : rendus en Jest avec
  serveur simulé — pas encore exécutés sur iPhone.

### 3. En attente d'un compte ou d'identifiants

- Clés eBay (`EBAY_ENV`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RU_NAME`) : connexion,
  synchronisation, sourcing eBay Browse, annonces.
- `ANTHROPIC_API_KEY` : produit dicté et assistant.
- Comptes professionnels fournisseurs (Foxway, Mobilax, Foneday, Utopya, MobileSentrix, etc.) :
  catalogues à importer ou flux / API.
- Identifiants BigBuy / Ingram Micro si vous ouvrez ces comptes.

### 4. En attente d'une approbation externe

- eBay : activation du keyset Production (conformité à la notification de suppression de compte),
  RuName avec URL de politique de confidentialité.
- Fournisseurs : validation de votre compte revendeur (Kbis, solvabilité) et accord pour un export
  ou une API.
- Apple : nouveau build TestFlight (traitement Apple ; relecture « Beta App Review » seulement
  pour des testeurs externes).

### 5. Encore incomplet

- Publication réelle d'une annonce eBay : jamais exécutée (à tester sur une annonce de test, avec
  votre autorisation) ; choix de catégorie par l'API Taxonomy non implémenté (identifiant saisi) ;
  mise à jour groupée prix/quantité construite mais non branchée.
- Expédition (marquer expédié, étiquettes), scan de code-barres, Amazon / Shopify / WooCommerce.
- Protection des mots de passe divulgués à activer (Dashboard → Authentication) ; extensions
  `pg_trgm` / `unaccent` dans `public` (documenté).
- Android : configuration vérifiée et bundle exporté, mais aucun build Play Store (bêta iOS
  uniquement).
- Application web Next.js non déployée (le serveur tourne en Edge Function) : la saisie d'un flux
  URL ou d'identifiants BigBuy / Ingram n'a pas encore d'écran mobile (import de fichier en
  attendant).
