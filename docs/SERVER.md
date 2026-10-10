# Serveur MON STOCK — Edge Function Supabase `api`

L'application web Next.js n'est pas déployée. Tout ce qui ne doit **pas** s'exécuter dans le
téléphone (secrets, tokens eBay, réseau sortant vers les fournisseurs, tâches planifiées) tourne
dans une **Supabase Edge Function** nommée `api`, construite à partir des **mêmes modules `src/`**
que le web : aucune logique n'est dupliquée.

```
apps/mobile ──(jeton utilisateur, X-Organization-Id)──▶ /functions/v1/api/*  ──▶ services src/
             ──(lectures / écritures sous RLS)────────▶ PostgREST (Supabase)
pg_cron ──(CRON_SECRET lu dans Vault)──▶ /api/cron/*
eBay ──▶ /api/ebay/callback (relais vers monstock://) · /api/ebay/webhook (notifications signées)
```

Mise en service pas à pas, vérifications, retour arrière et checklist : [OPERATIONS.md](OPERATIONS.md).

## 1. Construction et déploiement

| Étape | Commande / action |
| --- | --- |
| Construire | `npm run edge:build` → `supabase/functions/api/bundle.js` (dépendances npm en `npm:` résolues par Deno ; shims Next/React dans `server/edge/shims`) |
| Déployer (CLI) | `supabase functions deploy api --no-verify-jwt` (le point d'entrée `index.ts` importe `./bundle.js`) |
| Déploiement effectué ici | le dépôt étant public, l'entrée déployée importe le bundle **figé sur un commit** (`raw.githubusercontent.com/…/<sha>/supabase/functions/api/bundle.js`) : contenu immuable, résolu au déploiement |

`verify_jwt` est désactivé car le retour OAuth et les notifications eBay n'ont pas de JWT Supabase ;
**chaque route authentifie elle-même** : jeton utilisateur validé par Supabase Auth (`getUser`) +
appartenance à l'organisation, `CRON_SECRET` (comparaison en temps constant) pour `/cron/*`,
signature eBay pour `/ebay/webhook`.

## 2. Routes

Accès : *membre* = tout membre de l'organisation (`X-Organization-Id`), *rédacteur* = rôle
d'écriture, *administrateur* = owner/admin. Chaque corps JSON est validé par Zod avec une taille
maximale (64 Ko par défaut ; fichier catalogue : 15 Mo, soit 21 Mo une fois encodé).

| Route | Accès | Rôle |
| --- | --- | --- |
| `GET /api/health` | public | configuration (noms des secrets chargés, jamais les valeurs ; `ebayConfigured`, `aiConfigured`, `cronConfigured`) |
| `GET /api/sourcing/search?q=…&sku=…` | membre | recherche d'offres : sources activées en direct + offres stockées |
| `GET /api/sourcing/status` · `GET /api/sourcing/library` | membre | état des sources, bibliothèque vérifiée |
| `POST /api/sourcing/library/activate` | rédacteur | activer une source vérifiée (attestation CGU obligatoire) |
| `GET /api/sourcing/directory` | membre | annuaire de 63 fournisseurs professionnels : fiche, statut, dernier contrôle réel du site, modèles d'e-mail de demande d'accès FR/EN |
| `POST /api/sourcing/import/preview` | rédacteur | fichier catalogue (CSV, TSV, XLSX, XML, JSON ; UTF-8 / Windows-1252) → colonnes détectées, correspondance proposée, 20 premières lignes, erreurs par ligne ; rien n'est enregistré |
| `POST /api/sourcing/import` | rédacteur | import réel avec la correspondance validée : fournisseur et source « Import de fichier » créés au besoin, offres horodatées (origine du prix « catalogue importé »), historique des prix, lignes illisibles comptées |
| `GET /api/sourcing/matches` · `POST /api/sourcing/matches/decide` | membre · rédacteur | suggestions de rapprochement offre ↔ SKU (EAN/MPN exacts confirmés automatiquement, le reste à valider) |
| `GET /api/radar?sort=…` | membre | radar d'opportunités (modèle de coût complet, voir §6) |
| `POST /api/radar/settings` | administrateur | paramètres de coût (TVA, commissions, port, emballage, retours, douane) |
| `GET /api/integrations` | membre | connexions eBay, dernière synchro, erreurs, annonces non associées |
| `POST /api/ebay/connect` | administrateur | URL d'autorisation eBay (état anti-CSRF lié à l'utilisateur et à l'organisation, 15 min, usage unique) |
| `GET /api/ebay/callback` | public | relaie `code`/`state` vers `monstock://ebay/callback` (n'échange rien) |
| `POST /api/ebay/finalize` | administrateur | échange du code — **refusé si l'état n'a pas été créé par ce même utilisateur** |
| `POST /api/ebay/disconnect` | administrateur | déconnexion : tokens supprimés |
| `POST /api/ebay/sync` | rédacteur | synchronisation immédiate (annonces, commandes, stock) |
| `GET /api/ebay/listings/prefill?skuId=…` | rédacteur | brouillon d'annonce depuis les vraies données du SKU (champs inconnus laissés vides) |
| `GET /api/ebay/account-setup` | rédacteur | politiques métier et emplacements du compte eBay connecté (lecture) |
| `POST /api/ebay/listings/check` | rédacteur | contrôle + **simulation** : contenu exact qui serait envoyé à eBay, erreurs, verrous restants — aucun appel d'écriture |
| `POST /api/ebay/listings/publish` | administrateur | publication réelle, **uniquement** si les 4 verrous sont levés (§7) |
| `GET/POST /api/ebay/webhook` | eBay (signé) | challenge + notifications (suppression de compte, commandes) |
| `POST /api/ai/product-draft` | rédacteur | phrase dictée → brouillon du formulaire produit (Claude, sortie structurée) ; rien n'est créé |
| `POST /api/ai/assistant` | membre | questions sur les ventes, le stock, eBay : Claude appelle des outils de LECTURE exécutés avec la session de l'utilisateur (RLS) |
| `POST /api/cron/sync` · `/sourcing` · `/library-checks` · `/directory-checks` · `/scout` | `CRON_SECRET` | tâches planifiées |
| `POST /api/cron/ai-tools-check` · `/readonly-check` · `/import-selftest` · `/chain-selftest` · `/e2e-search` | `CRON_SECRET` | contrôles serveur sur le schéma réel (organisations temporaires supprimées ensuite) |

## 3. Secrets

Lus dans l'ordre : variables de la fonction (Dashboard → Edge Functions → Secrets), puis **Supabase
Vault** via `server_runtime_secrets()` (exécutable par `service_role` uniquement, liste fermée).

| Secret | Origine |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | fournis automatiquement par Supabase |
| `TOKEN_ENCRYPTION_KEY` | **généré dans la base** (Vault, migration `20261009000400`) — ne jamais le changer (tokens eBay illisibles sinon) |
| `CRON_SECRET` | généré dans la base (Vault) ; lu par `call_monstock_cron()` à chaque exécution |
| `EBAY_WEBHOOK_VERIFICATION_TOKEN` | généré dans la base (Vault, migration `20261009000500`) — à recopier chez eBay |
| `EBAY_ENV`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RU_NAME` | **à fournir** (voir §4) |
| `ANTHROPIC_API_KEY` | **à fournir** : clé de l'API Claude (console.anthropic.com → API Keys) dans Edge Functions → Secrets. Sans elle, `/api/ai/*` répond « non configuré » (jamais de réponse simulée) ; `/api/health` → `aiConfigured` |
| `EBAY_LISTING_ENABLED` | facultatif, `true` pour autoriser la publication d'annonces (désactivée par défaut) |

Tâches planifiées (pg_cron, `supabase/ops/schedule-edge-cron.sql`) :

| Tâche | Fréquence (UTC) | Rôle |
| --- | --- | --- |
| `monstock-ebay-sync` | toutes les 15 min | synchronisation des connexions eBay dues |
| `monstock-sourcing` | toutes les 6 h (h:07) | taux BCE, flux fournisseurs, alertes de prix |
| `monstock-library-checks` | 04:23 | vérification de la bibliothèque de sources |
| `monstock-directory-checks` | 05:41 | contrôle réel des sites de l'annuaire (16 par passage, les plus anciens d'abord) |

## 4. eBay — seule configuration manuelle restante

1. <https://developer.ebay.com> → **Application Keys** → keyset **Production** : notez *App ID* et
   *Cert ID*.
2. **User Tokens → Get a Token from eBay via Your Application → Add eBay Redirect URL** :
   - *Your auth accepted URL* : `https://ccywsegdowikeirbsfae.supabase.co/functions/v1/api/ebay/callback`
   - *Your auth declined URL* : la même URL
   - *Privacy Policy URL* : obligatoire en production (une page publique de votre politique de confidentialité)
   - type **OAuth** → eBay affiche le **RuName**.
3. **Alerts & Notifications → Marketplace account deletion** :
   - endpoint : `https://ccywsegdowikeirbsfae.supabase.co/functions/v1/api/ebay/webhook`
   - jeton de vérification : copiez `EBAY_WEBHOOK_VERIFICATION_TOKEN` depuis Supabase → Project
     Settings → Vault (généré pour vous), puis « Send test notification ».
4. Supabase → **Edge Functions → Secrets** : ajoutez `EBAY_ENV=production`, `EBAY_CLIENT_ID`,
   `EBAY_CLIENT_SECRET`, `EBAY_RU_NAME` (jamais dans le dépôt ni dans l'application).
5. Vérification : `GET /api/health` → `ebayConfigured: true` ; la source « eBay France » de la
   bibliothèque passe « vérifiée » au prochain contrôle (ou immédiatement via `/cron/library-checks`).
6. **Comptes déjà connectés avant le 10 octobre 2026** : le scope `sell.account.readonly` (lecture
   des politiques métier pour préparer une annonce) a été ajouté ; reconnectez le compte une fois
   (Réglages → Intégrations → eBay → Déconnecter, puis Connecter).

Flux mobile : `connect` (admin) → page eBay dans une session d'authentification système → eBay
redirige vers `/ebay/callback` → `monstock://ebay/callback?code&state` → `finalize` (même
utilisateur, même organisation, état à usage unique) → tokens chiffrés (AES-256-GCM) en base,
jamais renvoyés → première synchronisation. Les ventes déduisent le stock une seule fois
(`ingest_external_order`, verrous et unicité en base) ; les annonces non associées à un SKU ne
touchent pas le stock.

Règles de stock des commandes synchronisées (testées en intégration) :

| Événement | Effet sur le stock |
| --- | --- |
| Nouvelle commande (ligne associée à un SKU) | −quantité, **une seule fois** (`order_items.inventory_applied`, index unique sur le mouvement) |
| Même commande resynchronisée / webhook rejoué | aucun effet |
| Annulation, ou remboursement **avant** expédition | +quantité, une seule fois |
| Remboursement **après** expédition (`shipped`/`delivered` ou `fulfillment_status` FULFILLED/IN_PROGRESS) | **aucun recrédit automatique** (l'article n'est pas forcément revenu) + alerte « Remboursement après expédition » : enregistrer un « Retour client » si l'article revient |
| Ligne associée à un SKU après coup | jamais déduite automatiquement : action explicite « Déduire les ventes en attente » |

Déconnexion (`POST /api/ebay/disconnect`, administrateur) : révocation demandée à eBay (si
impossible, c'est indiqué), tokens supprimés de la base, connexion marquée « déconnectée », alertes
de connexion résolues ; les annonces et commandes déjà importées restent (historique).
Limites de débit eBay : réponses 429 / `Retry-After` respectées par le client REST (nouvel essai
borné pour les lectures ; **jamais** pour une écriture POST, afin d'éviter un doublon).


## 5. Fournisseurs professionnels

### 5.1 Annuaire (63 fournisseurs, recherche du 10 octobre 2026)

Données : `src/services/sourcing/data/supplier-directory.json` (copie et méthode :
[docs/research/suppliers-2026-10.md](research/suppliers-2026-10.md)). Segments : reconditionné B2B
(16), pièces détachées (17), liquidation / lots (11), distributeurs IT (14), spécialistes (5).
Chaque fiche : pays, zones de livraison, site, catalogue, catégories, marques, types de produits,
B2B/B2C, compte pro requis, conditions d'accès, modes d'accès (API, flux, portail, fichier),
documentation API, prix HT/TTC, devise, MOQ, livraison, garantie, intérêt, procédure pour obtenir
le catalogue, niveau de vérification, sources consultées.

Statuts (calculés, jamais déclarés à la main) :

| Statut | Condition réelle |
| --- | --- |
| identifié | fiche issue de la recherche |
| vérifié | site officiel joignable lors du dernier contrôle serveur |
| accès public fonctionnel | une source publique de ce fournisseur est vérifiée dans la bibliothèque (ex. Brico-phone) |
| compte pro requis | la fiche l'indique (la grande majorité) |
| connecteur fonctionnel | une source de l'organisation est active pour ce fournisseur |
| import réel testé | au moins un import de fichier / flux réussi pour ce fournisseur dans l'organisation |
| temporairement indisponible | dernier contrôle en échec (403, délai, DNS) |

Contrôle réel du 10 octobre 2026 depuis l'Edge Function (`/cron/directory-checks`, robots.txt lu,
une requête par hôte, aucun contournement) : **53 / 63 sites joignables**. Non joignables :
`ebay-browse` (page développeur, 403 anti-robot), Largo, Merkandi, Mobiparts, Westcoast, Fixez
(403 anti-robot : à consulter manuellement), Exertis (délai), AFB France, Mobile Express HDE,
Yes-yes (site non trouvé / injoignable). Aucun fournisseur de pièces ou de reconditionné testé
n'expose de catalogue public exploitable (essais Shopify `products.json`, WooCommerce Store API,
PrestaShop, sitemap + JSON-LD : 429, robots.txt interdit ou prix après connexion) ; le canal
réaliste est **compte professionnel + fichier ou API fournis par le fournisseur**.

### 5.2 Accès pratique aux catalogues

| Mode | Connecteur | État |
| --- | --- | --- |
| Fichier envoyé par le fournisseur (CSV/TSV/XLSX/XML/JSON) | Import de catalogue (§2) | **fonctionnel, testé sur TEST** (`/cron/import-selftest` : 2 offres, 1 ligne illisible signalée, statut « partiel ») |
| Flux URL (CSV/XML/JSON) | `supplier_feeds` + moteur de sourcing (toutes les 6 h) | fonctionnel (tests d'intégration) ; à configurer avec l'URL du fournisseur |
| API officielle | eBay Browse, BigBuy, Ingram Micro (adaptateurs existants) | eBay : en attente des clés ; BigBuy / Ingram : identifiants du compte revendeur |
| Catalogue public | Sitemap + données structurées (Brico-phone) | vérifié (prix publics TTC) |
| Portail sans export | — | consultation manuelle ; demander un export (modèle d'e-mail fourni) |

Modèles d'e-mail de demande d'accès (FR / EN) : générés par fournisseur dans l'application
(Réglages → Fournisseurs professionnels → fiche → « E-mail de demande d'accès » FR ou EN, ouvert dans la messagerie du téléphone), demandent un export
CSV/XLSX ou un accès API, les conditions (HT, MOQ, livraison France, garantie) et la fréquence de
mise à jour.

### 5.3 Bibliothèque de sources (contrôle quotidien)

| Source | Résultat | Mode d'accès |
| --- | --- | --- |
| **eBay France (API Browse officielle)** | en attente des clés eBay (§4) | API officielle |
| **Brico-phone** (FR, pièces) | ✅ vérifiée : produits avec prix relevés | catalogue public (sitemap + données structurées) |
| Utopya, Certideal, Recommerce, Largo, Injured Gadgets, Merkandi, Fixez, Jobalots | ❌ robots.txt interdit ou 403 | compte / partenariat |
| Mobilax, Yes-yes, Refurbed, Eurolots, Wholesale Clearance, Cash Converters, Mobilesentrix EU, REWA, Foneday, MobileParts.shop, Replacebase, iFixit Pro EU, Stocklear, LDLC Pro, Destockplus, Easycash, Smaaart | ❌ pas de catalogue public lisible | compte pro, flux ou fichier |

## 6. Radar d'opportunités

Pour chaque offre fournisseur rapprochée d'un SKU (EAN/MPN exact ou validation manuelle) :

```
coût rendu   = prix HT (TTC ÷ (1 + TVA) si l'offre est TTC) + port fournisseur réparti + douane (hors UE)
               + TVA d'achat si elle n'est PAS récupérable (jamais supposée récupérable par défaut)
CA HT        = prix de vente (TTC ÷ (1 + TVA) en régime normal ; TVA sur marge : TVA due sur la marge)
marge brute  = CA HT − coût rendu
bénéfice net = marge brute − commission marketplace − frais de paiement − expédition client
               − emballage − provision retours
```

- Chaque coût inconnu est **listé** (« transport fournisseur », « commission », « TVA »…) et le
  résultat est marqué « estimé » ; sans prix de vente ni prix d'achat, aucun chiffre n'est affiché.
- Origine du prix affichée : API vérifiée, relevé public, catalogue importé, communiqué par le
  fournisseur, saisie manuelle ; fraîcheur (fraîche / à revérifier / périmée).
- Offres enregistrées (`sourcing_saved_offers`, prix figé à l'enregistrement), historique des prix,
  **brouillon de commande** uniquement : aucune commande n'est jamais envoyée automatiquement.
- Paramètres (administrateur) : régime de TVA, taux, TVA récupérable oui/non, commission, frais de
  paiement, port client, emballage, provision retours, droits de douane. Commission, paiement et
  port sont repris du canal eBay s'ils manquent.
- Vérifié sur TEST (`/cron/chain-selftest`) : SKU créé → fichier importé → offre rapprochée par EAN
  → radar « estimé », bénéfice calculé, coût manquant « transport fournisseur » signalé, origine
  « catalogue importé » → contrôle d'annonce eBay (2 erreurs : politiques et emplacement) →
  publication refusée → organisation temporaire supprimée.

## 7. Création et publication d'annonces eBay (préparé, publication verrouillée)

Implémenté (`src/integrations/ebay/listing.ts`, `src/services/channels/ebay-listing-service.ts`) :
- **Préparation** depuis un SKU : titre (80 car.), description, prix, quantité disponible réelle,
  EAN, caractéristiques connues (marque, modèle, capacité, couleur). Catégorie, état eBay et photos
  à choisir : MON STOCK ne convertit pas les grades A/B/C en états eBay.
- **Lecture du compte** : politiques métier (paiement, retour, expédition) et emplacements
  d'inventaire (Account API, scope `sell.account.readonly`).
- **Contrôle / simulation** : validation complète, contenu exact des appels
  (`PUT inventory_item/{sku}`, `POST offer`) affiché, aucune écriture chez eBay.
- **Publication** : `createOrReplaceInventoryItem` → offre existante réutilisée (`GET offer?sku=`,
  anti-doublon) ou `createOffer` → `publishOffer` ; en-tête `Content-Language: fr-FR` ; aucun
  nouvel essai automatique d'un POST.
- **4 verrous**, tous obligatoires : `EBAY_LISTING_ENABLED=true` sur le serveur, administrateur,
  confirmation explicite dans l'application, compte eBay connecté.
- Mise à jour prix/quantité groupée (`bulk_update_price_quantity`) : construite et testée, non
  exposée.

**Jamais exécuté contre eBay** (clés absentes) : la publication réelle reste à tester sur un
compte réel, avec votre autorisation, sur une annonce de test.

## 8. IA (Claude)

- Modèle `claude-opus-5-5`, repli serveur par défaut d'Anthropic si une requête est déclinée.
- **Produit dicté** : la transcription (reconnaissance vocale du téléphone) est envoyée au
  serveur ; Claude renvoie un JSON imposé par schéma, revalidé par Zod. Consigne : rien d'inventé,
  valeurs non dites laissées vides. La création reste confirmée par l'utilisateur.
- **Assistant** : boucle d'outils (8 étapes max), outils en lecture seule filtrés sur
  l'organisation active et exécutés avec le client Supabase de l'utilisateur (RLS). La consigne
  impose que chaque chiffre provienne d'un résultat d'outil ; la réponse liste les données
  consultées.
- **Quotas** (table `ai_usage_events`, vérifiés AVANT tout appel à Claude) : 40 questions / heure /
  utilisateur, 60 brouillons / heure / utilisateur, 400 appels / jour / organisation → « Limite
  atteinte » (429).
- **Délais** : 55 s par appel, 1 nouvel essai, 110 s pour toute la boucle (limite Edge ≈ 150 s).
- **Sans clé** : « non configuré » (aucune réponse simulée) ; le reste de l'application fonctionne.
- Vérifié sur TEST (`/cron/ai-tools-check`) : les 6 outils s'exécutent sur le schéma réel. Appel à
  Claude non exécuté : clé non configurée.

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
