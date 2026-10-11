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
| `GET /api/sourcing/directory` | membre | annuaire de 120 fournisseurs professionnels : fiche, niveau d'accès réel, prochaine action, dernier contrôle du site, e-mails de demande d'accès FR/EN |
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
| `GET /api/tools/status` | membre | plateformes d'expédition et API de suivi configurées (noms uniquement) |
| `POST /api/shipping/quotes` | membre | devis réels Packlink PRO / Boxtal / Sendcloud pour un colis (poids, dimensions, codes postaux) ; consultation seulement, aucune étiquette ; aucune plateforme = aucun prix |
| `POST /api/tracking/refresh` | rédacteur | actualise un colis suivi (La Poste Suivi v2 ou Ship24) ; seul le numéro est transmis |
| `POST /api/cron/sync` · `/sourcing` · `/library-checks` · `/directory-checks` · `/scout` · `/tracking` | `CRON_SECRET` | tâches planifiées |
| `POST /api/cron/connectors-probe` | `CRON_SECRET` | contrôle sans identifiants des API d'expédition et de suivi (le point d'accès doit répondre et exiger une authentification) |
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
| `PACKLINK_API_KEY` | facultatif : devis d'expédition Packlink PRO (Packlink PRO → Paramètres → clé API) |
| `SENDCLOUD_PUBLIC_KEY`, `SENDCLOUD_SECRET_KEY` | facultatif : devis d'expédition Sendcloud, consultation uniquement (Sendcloud → Paramètres → Intégrations → Sendcloud API) |
| `BOXTAL_V1_LOGIN`, `BOXTAL_V1_PASSWORD`, `BOXTAL_CONTENT_CODE` (`BOXTAL_API_URL` facultatif) | facultatif : cotation Boxtal (identifiants API v1 ; code de catégorie de contenu de vos envois, liste fournie par Boxtal) |
| `LAPOSTE_OKAPI_KEY` | facultatif : suivi La Poste / Colissimo / Chronopost (developer.laposte.fr → application → abonnement « Suivi v2 ») |
| `SHIP24_API_KEY` | facultatif : suivi multi-transporteurs (dashboard.ship24.com → API keys) |

Tâches planifiées (pg_cron, `supabase/ops/schedule-edge-cron.sql`) :

| Tâche | Fréquence (UTC) | Rôle |
| --- | --- | --- |
| `monstock-ebay-sync` | toutes les 15 min | synchronisation des connexions eBay dues |
| `monstock-sourcing` | toutes les 6 h (h:07) | taux BCE, flux fournisseurs, alertes de prix |
| `monstock-library-checks` | 04:23 | vérification de la bibliothèque de sources |
| `monstock-directory-checks` | 05:41 | contrôle réel des sites de l'annuaire (16 par passage, les plus anciens d'abord) |
| `monstock-tracking` | h:17 et h:47 | actualisation des colis dont l'échéance est passée (30 par passage ; rien si aucune clé de suivi) |

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

### 5.1 Annuaire (120 fournisseurs, recherches du 10 octobre 2026)

Données : `src/services/sourcing/data/supplier-directory.json` (copie et méthode :
[docs/research/suppliers-2026-10.md](research/suppliers-2026-10.md)). Première recherche : 63 fiches
(acteurs connus). Seconde recherche (FR, BE, NL, ES, DE, IT, PL, AT, CZ ; annuaires, exposants de
salons, boutiques B2B) : **57 fournisseurs moins connus**, dont :
- des grossistes d'iPhone par grade : Refreshed Apples, Mobile Depot Europe, Mobistock, Molano,
  ITP Technologie, TR Vertriebs ;
- des distributeurs à flux ou API : Nedis, Infortisa, DMI Computer, Megasur, Home Screen
  Distribution, MICHAEL AG, TelePart ;
- des grossistes de pièces : Horepa, Pieces2Mobile, mpsmobile, Mobiltec 24, GSMOK, Nowacell,
  Servisní díly, Fixje ;
- des lots de retours : BitStockz, Planet Outlet, Subastalotes ;
- des PC ex-entreprise : Ecoportátil, PC-Portátil, Bestellaptops, Omnicomp.

Chaque fiche contient : pays, zones de livraison, site, catalogue, catégories, marques, types de
produits, B2B/B2C, compte pro, conditions et modes d'accès, prix HT/TTC, devise, MOQ, livraison,
garantie, intérêt, procédure pour obtenir le catalogue, niveau de vérification et sources.

**Niveau d'accès réel** (calculé, affiché et filtrable dans l'application) :

| Niveau | Condition |
| --- | --- |
| connecté | source active ou import réussi dans votre organisation |
| importable | le fournisseur fournit un fichier, un flux, une API ou une liste de prix que MON STOCK importe |
| accessible | catalogue public vérifié depuis le serveur |
| vérifié | site officiel joignable depuis le serveur |
| identifié | fiche issue de la recherche, rien de vérifié |

Chaque fiche affiche aussi la **prochaine action** concrète (activer la source, demander le flux,
envoyer l'e-mail de liste de prix, importer le fichier…). Les statuts détaillés (vérifié, compte pro
requis, connecteur, import testé, indisponible) restent calculés comme avant.

**Contrôle réel des sites** depuis l'Edge Function (10 octobre 2026, robots.txt lu, aucun
contournement) : **102 / 120 joignables**.
- Première série, non joignables : eBay développeurs, Largo, Merkandi, Mobiparts, Westcoast, Fixez,
  Exertis, AFB France, Mobile Express HDE, Yes-yes.
- Seconde série, non joignables :
  - Megasur, Serviphone, Planet Outlet, Smartphone Italia : 403 anti-robot ;
  - Big Brand Depot, Omnicomp, Avides : aucune réponse ;
  - GSP Electronics : HTTP 500.

**Catalogues publics réellement exploitables** (éclaireur serveur `/cron/scout` sur 34 sites de la
seconde série, puis vérification de la bibliothèque) :
- **Refreshed Apples** (NL, iPhone par grade) : 117 fiches avec prix, plan du site + données
  structurées ;
- **Fixje** (NL, pièces) : 200 fiches avec prix, WooCommerce. Certaines fiches sont des prix de
  réparation : vérifiez chaque offre ;
- **Servisní díly** (CZ, pièces) : fiches avec prix en CZK, converties par les taux BCE.

Ces trois sources sont ajoutées à la bibliothèque, comme Brico-phone. Les autres refusent
l'automatisation, et MON STOCK le respecte :
- robots.txt interdit : Pieces2Mobile, ITP Technologie, Ingrosmart, Planet Outlet ;
- prix masqués sans compte : Punto Ingrosso (prix à 0) ;
- 429 : Shopify products.json ;
- catalogue rendu en JavaScript, sans données lisibles.

Pour toutes ces sources, le canal reste un compte pro avec un fichier ou une API.

### 5.2 Accès pratique aux catalogues

| Mode | Connecteur | État |
| --- | --- | --- |
| Fichier envoyé par le fournisseur (CSV/TSV/XLSX/XML/JSON) | Import de catalogue (§2) | **fonctionnel, testé sur TEST** (`/cron/import-selftest` : 6 offres + 1 ligne illisible ; fichier défectueux suspendu sans rien modifier ; mise à jour avec doublon ignoré) |
| Flux URL (CSV/XML/JSON) | `supplier_feeds` + moteur de sourcing (toutes les 6 h) | fonctionnel (tests d'intégration) ; à configurer avec l'URL du fournisseur |
| API officielle | eBay Browse, BigBuy, Ingram Micro (adaptateurs existants) | eBay : en attente des clés ; BigBuy / Ingram : identifiants du compte revendeur |
| Catalogue public | Sitemap + données structurées, WooCommerce Store API | vérifiés : Brico-phone, Refreshed Apples, Fixje, Servisní díly (prix publics) |
| Portail sans export | — | consultation manuelle ; demander un export (modèle d'e-mail fourni) |

**Protection des imports** (`src/domain/sourcing/import-quality.ts`) : avant toute écriture, le
fichier entier est lu. L'import est **suspendu, sans aucune modification**, si :
- plus de 50 % des lignes sont illisibles ;
- le catalogue fait moins de la moitié du dernier import ;
- plus de la moitié des références connues changent de prix de plus de 60 % (mauvaise colonne,
  HT/TTC, devise) ;
- la colonne de référence n'identifie pas les produits.

Les doublons (même référence) sont ignorés et signalés. Si le fichier est correct, l'utilisateur
peut confirmer : « Importer quand même ».

Modèles d'e-mail de demande d'accès (FR / EN) : générés par fournisseur dans l'application
(Réglages → Fournisseurs professionnels → fiche → « E-mail de demande d'accès » FR ou EN, ouvert dans la messagerie du téléphone), demandent un export
CSV/XLSX ou un accès API, les conditions (HT, MOQ, livraison France, garantie) et la fréquence de
mise à jour.

### 5.3 Bibliothèque de sources (contrôle quotidien)

| Source | Résultat | Mode d'accès |
| --- | --- | --- |
| **eBay France (API Browse officielle)** | en attente des clés eBay (§4) | API officielle |
| **Brico-phone** (FR, pièces) | ✅ vérifiée : produits avec prix relevés | catalogue public (sitemap + données structurées) |
| **Refreshed Apples** (NL, iPhone par grade) | ✅ vérifiée le 10/10/2026 : 117 produits avec prix | catalogue public (sitemap + données structurées) |
| **Fixje** (NL, pièces) | ✅ vérifiée le 10/10/2026 : 200 produits avec prix (dont prestations de réparation) | WooCommerce Store API publique |
| **Servisní díly** (CZ, pièces) | ✅ vérifiée le 10/10/2026 : produits avec prix en CZK | catalogue public (sitemap + données structurées) |
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

## 10. « Mes outils » : expédition et suivi de colis

Comparatif des API : [docs/research/shipping-tracking-apis-2026-10.md](research/shipping-tracking-apis-2026-10.md).

### 10.1 Calculs locaux (sans serveur)

- **Outils concernés :** TVA, marge, prix de vente, frais eBay, remise.
- **Où :** modules purs `src/domain/tools/*` (tests `tests/unit/tools-calculators.test.ts`).
- **Calcul exact :** fractions BigInt, arrondi au centime uniquement à l'affichage.
- **Marge et prix de vente :** même fonction que le radar (`computeUnitEconomics`).
- **Convertisseur de devises :** taux BCE de la table `fx_rates`, avec leur date.

### 10.2 Comparateur de frais de port

| Source | Connecteur | État |
| --- | --- | --- |
| Packlink PRO | `src/integrations/shipping/packlink.ts` (contrat du code officiel `packlink-dev/ecommerce_module_core`) | prêt ; **en attente de `PACKLINK_API_KEY`** ; hôte joignable (contrôle sans clé) |
| Boxtal API v1 | `src/integrations/shipping/boxtal.ts` (contrat du SDK officiel `boxtal/php-library`) | prêt ; **en attente des identifiants v1 et du code de contenu** ; point d'accès actif (401 sans identifiants) |
| Sendcloud API v3 | `src/integrations/shipping/sendcloud.ts` : `POST /api/v3/shipping-options` uniquement (devis, jamais d'étiquette ni d'envoi) | prêt ; **en attente de `SENDCLOUD_PUBLIC_KEY` / `SENDCLOUD_SECRET_KEY`** ; format vérifié sur une réponse réelle du compte (11/10/2026, appel en lecture seule hors MON STOCK) |
| Grilles de l'utilisateur | table `shipping_rate_cards` (RLS), calcul local ; affichées comme **estimations** | **fonctionnel** |

Sans plateforme ni grille : aucun prix, message explicite (« MON STOCK n'invente aucun prix »).

Règles communes des devis (`optionFromQuote`) :
- un prix nul, négatif ou illisible n'est jamais une offre ;
- HT / TTC n'est indiqué que si l'API le précise. Sendcloud ne le précise pas, donc l'app affiche « HT/TTC inconnu » ;
- Sendcloud : les offres non suivies, en erreur, sans prix ou sans devise sont écartées et comptées dans le message de la source (« N offres écartées ») ;
- les suppléments (carburant…) sont détaillés ;
- délai : seulement le `lead_time` renvoyé, converti d'heures en jours.

> Les clés de plateforme sont celles du serveur : tous les utilisateurs de ce déploiement voient
> les devis de ce compte. En exploitation multi-clients, prévoir une clé par organisation.

### 10.3 Suivi de colis

| API | Pour | Connecteur | État |
| --- | --- | --- | --- |
| La Poste Suivi v2 (officiel, gratuit) | La Poste, Colissimo, Chronopost | `src/integrations/tracking/laposte.ts` | prêt ; **en attente de `LAPOSTE_OKAPI_KEY`** ; point d'accès actif (401 sans clé) |
| Ship24 (multi-transporteurs, détection automatique) | tous les autres transporteurs | `src/integrations/tracking/ship24.ts` (spécification OpenAPI officielle) | prêt ; **en attente de `SHIP24_API_KEY`** ; point d'accès actif |

- **Colis :** table `tracked_parcels` (RLS, garde « même organisation »).
- **Colonnes réservées au serveur :** le statut, l'historique, la date estimée et la source ne
  sont écrits que par le serveur. Le déclencheur `tracked_parcels_client_guard` refuse toute
  modification par l'application, ce que testent les tests d'intégration.
- **Actualisation automatique** (`/cron/tracking`, deux fois par heure, 30 colis par passage) :
  - toutes les 2 h si le colis est en cours de livraison, 4 h s'il est en transit, 8 h si
    l'étiquette est seulement créée ;
  - arrêt une fois le colis livré, après 7 jours si le numéro est introuvable, et après 60 jours
    au total ;
  - sans clé : nouvel essai toutes les 12 h, sans aucun statut écrit.
- **Alertes** (table `alerts`, sans doublon) :
  - colis livré ;
  - problème (échec de livraison, incident, retour) ;
  - retard, uniquement si l'API a fourni une date estimée désormais dépassée.
- **Données transmises :** le numéro de suivi et, s'il est connu, le pays de destination. Aucune
  donnée client.

### 10.4 Activer une plateforme ou une API (aucune clé dans le dépôt)

1. Créer le compte chez le fournisseur et générer la clé (voir §3).
2. Supabase → Edge Functions → **Secrets** : ajouter la variable.
3. Vérifier :
   - `GET /api/health` → `shippingProviders` / `trackingProviders` ;
   - application → Outils → Frais de port ou Suivi de colis.
4. Contrôle des points d'accès : `select public.call_monstock_cron('connectors-probe');`.
