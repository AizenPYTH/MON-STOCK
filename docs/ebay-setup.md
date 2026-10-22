# Intégration eBay — guide de configuration

Ce guide décrit comment brancher MON STOCK sur un compte vendeur eBay avec les **API officielles**
(OAuth 2.0, Identity API, Sell Fulfillment API, Trading API, Commerce Notification API).
Rien n'est simulé : tant que les variables d'environnement ne sont pas renseignées, la page
*Paramètres → Intégrations* affiche « Intégration eBay non configurée sur ce serveur ».

## 1. Créer un compte développeur et une application

1. Créez un compte sur <https://developer.ebay.com> (gratuit) et connectez-vous.
2. Menu **My Account → Application Keys** (*Application access keys*).
3. Deux jeux de clés (keysets) existent :
   - **Sandbox** : environnement de test (données fictives, compte vendeur de test créé via *Sandbox → Register a test user*).
   - **Production** : votre vrai compte vendeur. L'accès production nécessite d'accepter les conditions et, pour certaines API, une
     vérification (*Application growth check*) au-delà des quotas gratuits.
4. Pour le keyset choisi, notez :
   - **App ID (Client ID)** → `EBAY_CLIENT_ID`
   - **Cert ID (Client Secret)** → `EBAY_CLIENT_SECRET` (secret : ne jamais le committer ni l'exposer au navigateur)

## 2. RuName et URL de retour (« Your auth accepted URL »)

eBay n'utilise pas directement une URL de callback dans `redirect_uri` mais un identifiant appelé **RuName**.

1. Sur la page *Application Keys*, cliquez sur **User Tokens** du keyset concerné.
2. Section **Get a Token from eBay via Your Application** → **Add eBay Redirect URL**.
3. Renseignez :
   - *Display Title* : « MON STOCK »
   - *Privacy Policy URL* : l'URL de votre politique de confidentialité (obligatoire en production)
   - **Your auth accepted URL** : `${NEXT_PUBLIC_APP_URL}/api/integrations/ebay/callback`
     (par exemple `https://app.mon-stock.fr/api/integrations/ebay/callback`)
   - *Your auth declined URL* : `${NEXT_PUBLIC_APP_URL}/settings/integrations?error=refus`
   - Cochez **OAuth** (et non *Auth'n'Auth*).
4. Enregistrez : eBay affiche le **RuName** (forme `Votre_Nom-Votre_App-xxxx-xxxxxxxx`). Copiez-le dans `EBAY_RU_NAME`.

> Sandbox et production ont chacun leur RuName et leurs clés : ne les mélangez pas.
> `EBAY_ENV` doit correspondre au keyset utilisé (`production` ou `sandbox`).
> En local, eBay exige une URL HTTPS publique pour « auth accepted URL » : utilisez un tunnel
> (ngrok, Cloudflare Tunnel…) et mettez cette URL dans `NEXT_PUBLIC_APP_URL`.

## 3. Variables d'environnement

Copiez `.env.example` vers `.env.local` (jamais commité) :

| Variable | Rôle |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'application, sans slash final. Sert à construire l'URL de callback et l'URL du webhook. |
| `EBAY_ENV` | `production` ou `sandbox`. |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` | App ID / Cert ID du keyset. |
| `EBAY_RU_NAME` | RuName (voir §2). |
| `EBAY_WEBHOOK_VERIFICATION_TOKEN` | Jeton de 32 à 80 caractères alphanumériques (`openssl rand -hex 24`), saisi aussi dans le portail eBay (§5). |
| `TOKEN_ENCRYPTION_KEY` | Clé AES-256-GCM (`openssl rand -base64 32`) chiffrant les tokens OAuth en base. **Si elle change, toutes les connexions doivent être refaites.** |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role (serveur uniquement) : moteur de sync, webhooks, cron, secrets OAuth. |
| `CRON_SECRET` | Secret du cron (`openssl rand -hex 32`), ≥ 16 caractères. |

Sans `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` et `EBAY_RU_NAME`, l'intégration est désactivée et la liste des variables manquantes
est affichée aux administrateurs.

## 4. Scopes OAuth demandés (et pourquoi)

Le vendeur s'authentifie **chez eBay** (jamais de mot de passe eBay saisi dans MON STOCK). Les scopes demandés sont :

| Scope | Utilisation |
| --- | --- |
| `https://api.ebay.com/oauth/api_scope` | Scope de base requis par eBay pour tout token ; aussi utilisé en `client_credentials` pour lire les clés publiques des notifications. |
| `https://api.ebay.com/oauth/api_scope/sell.fulfillment` | Sell Fulfillment API `GET /sell/fulfillment/v1/order` : commandes, statut de paiement/expédition, annulations. |
| `https://api.ebay.com/oauth/api_scope/sell.inventory` | Trading API `GetMyeBaySelling` (annonces actives) et `ReviseInventoryStatus` (envoi des quantités). |
| `https://api.ebay.com/oauth/api_scope/sell.account.readonly` | Account API (lecture) : politiques d'expédition / retour / paiement, limites de vente (`privilege`), programmes, abonnement Boutique. |
| `https://api.ebay.com/oauth/api_scope/commerce.identity.readonly` | Identity API `GET /commerce/identity/v1/user/` : pseudo et identifiant du compte (affichage « Connecté en tant que… », routage des notifications). |

### 4 bis. « Analyse complète » du conseiller (facultative, lecture seule)

Dans **Réglages → Intégrations**, un administrateur peut cliquer **« Autoriser l'analyse complète »** (ou « Connecter avec
l'analyse complète »). MON STOCK redemande alors l'autorisation eBay avec, **en plus** des scopes standard :

| Scope | Utilisation (GET uniquement) |
| --- | --- |
| `https://api.ebay.com/oauth/api_scope/sell.finances` | Finances API (hôte `apiz.ebay.com`) : transactions (ventes, frais par type, remboursements, litiges, frais hors vente), versements, fonds disponibles / en cours / bloqués. eBay ne propose pas de variante `.readonly` de ce scope ; MON STOCK n'appelle que des lectures. |
| `https://api.ebay.com/oauth/api_scope/sell.analytics.readonly` | Analytics API : rapport de trafic (impressions, vues, taux de clic, conversion), niveau vendeur (`seller_standards_profile`), métriques de service client. |
| `https://api.ebay.com/oauth/api_scope/sell.marketing.readonly` | Marketing API : campagnes Promoted Listings, annonces sponsorisées, promotions. |

- C'est **opt-in** : la connexion standard reste celle par défaut ; une reconnexion conserve annonces, commandes et associations.
- L'information « analyse complète » voyage dans l'état OAuth (préfixe `ext_`, état créé et vérifié côté serveur) : **aucune
  migration**. Les scopes accordés sont enregistrés dans `channel_connections.scopes` (eBay accorde tout ou rien : un code
  d'autorisation reçu = tous les scopes demandés accordés).
- Si votre application eBay n'a pas accès à l'une de ces API, eBay renvoie `invalid_scope` dès la page d'autorisation :
  MON STOCK affiche « eBay a refusé les autorisations demandées » (code `scope_refused`) et la connexion existante n'est pas
  modifiée. Vérifiez dans le portail développeur (*Application Keys → OAuth Scopes*) que ces scopes sont listés pour le keyset.
- Mobile (Edge Function) : `POST /api/ebay/connect` accepte le corps `{ "extended": true }` ; `GET /api/integrations` renvoie
  `extendedAnalysis` par connexion. Le bouton côté application iPhone reste à ajouter (voir docs/ADVISOR.md).

### Rafraîchissement : scopes ACCORDÉS uniquement

Le rafraîchissement d'un access token redemande **exactement les scopes enregistrés sur la connexion**
(`channel_connections.scopes`), et non la liste courante de l'application : eBay répond `invalid_scope` si l'on demande un
scope non accordé, ce qui ferait passer toutes les connexions existantes en « Expirée » dès qu'un scope est ajouté au code.
Une connexion sans scopes enregistrés redemande les scopes standard.

Les tokens :
- **access token** : valable ~2 h, rafraîchi automatiquement avant chaque appel si nécessaire ;
- **refresh token** : valable ~18 mois (`refresh_token_expires_at` est stocké). À son expiration, ou si le vendeur révoque
  l'autorisation (`invalid_grant`), la connexion passe en statut **Expirée**, une alerte critique est créée et l'interface propose
  **Reconnecter eBay**.

Les deux sont chiffrés (AES-256-GCM) dans `channel_connection_secrets`, table sans policy RLS : seul le serveur (service_role) y accède.
Aucun token n'apparaît dans les journaux ni dans `sync_errors`.

## 5. Notifications eBay (webhook) — suppression de compte obligatoire

eBay impose à toute application de production de s'abonner aux notifications **Marketplace Account Deletion** (RGPD).

1. Portail développeur → **Alerts & Notifications** (ou *Application Keys → Notifications*).
2. Section *Marketplace Account Deletion* :
   - **Notification endpoint** : `${NEXT_PUBLIC_APP_URL}/api/webhooks/ebay`
   - **Verification token** : la valeur de `EBAY_WEBHOOK_VERIFICATION_TOKEN`
3. Cliquez **Save** : eBay appelle `GET …/api/webhooks/ebay?challenge_code=…` ; l'application répond
   `{"challengeResponse": sha256(challengeCode + verificationToken + endpointUrl)}` (l'URL doit être **exactement** celle saisie).
   Si le token n'est pas configuré, la route répond 503 avec un message explicite.
4. Les notifications `POST` sont signées (`x-ebay-signature`). La signature ECDSA est vérifiée avec la clé publique eBay
   (`GET /commerce/notification/v1/public_key/{kid}`, mise en cache). Une signature invalide → 401 et l'événement est enregistré
   en statut `failed` ; un doublon (`provider + event_id`) → 200 `duplicate`.

Traitement de `MARKETPLACE_ACCOUNT_DELETION` : la notification peut concerner **un acheteur** (son pseudo est alors anonymisé dans les
commandes) ou **le compte vendeur connecté** (tokens supprimés, connexion fermée, compte anonymisé, alerte créée). Les annonces et
commandes importées restent, sans donnée personnelle du compte supprimé. Pour reprendre la synchronisation, connectez un autre compte.

Les autres sujets (si vous vous y abonnez via la Commerce Notification API) déclenchent une synchronisation de la connexion
identifiée par `data.userId` / `data.username` ; les sujets inconnus sont enregistrés en `ignored`.

## 6. Synchronisation planifiée (cron)

La route `GET|POST /api/cron/sync` exécute, séquentiellement, les connexions `connected`/`error` dont `auto_sync` est actif et dont
`last_sync_at` est plus ancien que `sync_interval_minutes` (réglable par connexion, minimum 15 min). Elle est protégée par
`Authorization: Bearer ${CRON_SECRET}` (401 sinon ; 503 si `CRON_SECRET` est absent).

- **Planification actuelle** : Supabase `pg_cron` (`monstock-ebay-sync`, toutes les 15 min) appelle l'Edge Function ;
  `vercel.json` ne déclare aucun cron (voir `docs/WEB-DEPLOY.md`).
- **Autre hébergeur** : appelez la route depuis cron/systemd/GitHub Actions :
  `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://votre-domaine/api/cron/sync`
- **CLI** (serveur disposant de `.env.local`) :
  `npm run sync:run -- --connection <uuid>`, `npm run sync:run -- --all` ou `npm run sync:run -- --due`.

Chaque exécution crée une ligne `sync_runs` (statut `running` → `success` / `partial` / `failed`, statistiques réelles, erreurs
détaillées dans `sync_errors`). Un run encore `running` depuis moins de 10 min bloque un nouveau run sur la même connexion
(index unique partiel : même deux démarrages simultanés n'en créent qu'un ; l'autre reçoit « Une synchronisation … est déjà en
cours »). Au-delà de 10 min (un run vivant dure au plus son budget), le run est considéré interrompu et marqué `failed` ; le cron
nettoie aussi, à chaque passage, les runs `running` abandonnés (canaux > 10 min, sources fournisseurs > 30 min).

**Runs bornés et reprenables** (incident du 22/10/2026) : chaque run a une **échéance interne** (100 s par défaut,
`SYNC_RUN_BUDGET_MS`, bornée à 8 min ; le cron partage la sienne entre les runs : 100 s sur l'Edge Function, 200 s sur la route
web). Les appels eBay ont un délai réduit au temps restant et ne sont jamais relancés au-delà. La progression est enregistrée
**après chaque étape confirmée** : page d'annonces écrite (`channel_connections.sync_state`, au plus 6 pages par run et la moitié
du budget dans un run complet), tranche de commandes lue et ingérée en entier (`last_orders_cursor`). À l'échéance, le run se
termine en `partial` avec la raison « Budget de temps atteint, reprise au prochain passage », libère le verrou, et le passage
suivant reprend au dernier point confirmé (une page d'annonces est relue par sécurité). `last_sync_at` n'avance que lorsqu'une
passe complète est finie : la connexion reste « due » d'ici là. Le cron sert d'abord les connexions les moins récemment tentées
(`last_sync_attempt_at`). Une tranche de commandes trop longue pour le budget est divisée par deux au passage suivant.
Le cron (Edge Function et route web : même service `src/services/sync/cron.ts`) reprend aussi les notifications eBay
abandonnées. Aucun run n'est démarré s'il reste moins de 20 s au budget du cron : les connexions restantes sont reportées au
passage suivant (`deferred` dans la réponse JSON).
Les runs déclenchés par webhook (périmètre partiel) ne modifient pas `last_sync_at` : ils ne repoussent jamais la
synchronisation complète planifiée.

## 7. Ce que fait une synchronisation

1. **Annonces** : `GetMyeBaySelling` (ActiveList, 200 par page). Une ligne `channel_listings` par annonce ou par variation
   (clé = SKU de variation, à défaut ses caractéristiques). Les annonces non revues pendant un parcours **complet et non tronqué** sont marquées `ended` (une annonce illisible mais identifiée est considérée revue : jamais terminée à tort).
   Association automatique **uniquement** si le SKU eBay est strictement égal (insensible à la casse) à un code SKU interne
   (`mapping_source = auto_sku_match`). Sinon, des **suggestions** (EAN, SKU proche, titre + attributs) sont calculées avec une
   confiance 0–1 et doivent être validées dans *Intégrations → Associations*.
2. **Commandes** : `GET /sell/fulfillment/v1/order?filter=lastmodifieddate:[…]` depuis `last_orders_cursor` moins 3 h de
   chevauchement (90 jours lors du premier import). La fenêtre est lue par **tranches de 7 jours, de la plus ancienne à la plus
   récente** ; une tranche qui atteint la limite de pages est redécoupée (jusqu'à 1 h). Le curseur n'avance que jusqu'à la fin
   de la dernière tranche lue **en entier**, et jamais au-delà d'une commande dont l'ingestion a échoué : aucune commande n'est
   sautée. Ingestion idempotente et transactionnelle (tout ou rien par commande) via `ingest_external_order` : création des
   commandes, mouvements de stock `sale` pour les lignes associées, recrédit en cas d'annulation/remboursement. Deux ingestions
   simultanées de la même commande (webhook + cron) produisent une seule commande et un seul mouvement par ligne ; la base
   refuse d'ailleurs toute seconde vente pour une même ligne sans annulation intermédiaire (migration `20261023000120`).
   **Ventes antérieures à la première connexion du compte** (`sales_stock_cutoff_at`) : importées pour l'analyse mais **sans
   mouvement de stock** (le stock saisi les reflète déjà), ni à l'import ni par « appliquer les ventes en attente ». Une commande
   **illisible** (format inattendu) n'est jamais ignorée : le curseur ne dépasse pas sa date et une alerte « import bloqué » reste
   ouverte jusqu'à son import.
   Correspondance des statuts : `cancelState = CANCELED` → annulée ; `FULLY_REFUNDED` → remboursée ; `FULFILLED` → expédiée ;
   `PAID`/`PARTIALLY_REFUNDED` → payée ; `PENDING`/`FAILED` → en attente.
3. **Quantités** (opt-in `push_inventory`, désactivé par défaut) : pour les annonces associées dont la quantité eBay diffère du
   stock disponible, `ReviseInventoryStatus` (200 maximum par run). L'envoi n'a lieu qu'après un import des commandes
   **complet et sans erreur** dans le même run (sinon `INVENTORY_PUSH_SKIPPED`, raison détaillée). Un SKU associé à
   **plusieurs annonces actives** n'est jamais poussé (chacune recevrait tout le stock : survente) : erreur
   `INVENTORY_PUSH_SHARED_SKU` et alerte ; gardez une seule annonce associée par SKU. Un même compte eBay ne peut être relié
   qu'à une seule organisation (par environnement). Une action manuelle **« Pousser la quantité vers eBay »**
   existe par annonce, avec confirmation.

### Tokens

- L'access token (2 h) est rafraîchi automatiquement s'il expire dans moins de 5 min, et une fois de force après un 401.
- Les rafraîchissements simultanés d'un même processus sont fusionnés ; l'écriture en base est un *compare-and-set*
  (`store_refreshed_access_token`) : un rafraîchissement concurrent d'une déconnexion ou d'une reconnexion ne ressuscite ni
  n'écrase aucun token.
- `invalid_grant`, refresh token expiré (date eBay ~18 mois enregistrée à la connexion) ou secret indéchiffrable
  (`TOKEN_ENCRYPTION_KEY` modifiée) → connexion **Expirée**, alerte critique et bouton **Reconnecter eBay**.
- Aucun token n'est écrit dans les journaux, `sync_errors`, `error_summary` ou `last_error` (masquage des clés ET des valeurs
  ressemblant à un secret : `Bearer …`, `v^1.1#…`, JWT, `access_token=…`).

### Webhook

- Corps limité à 64 Ko (413 au-delà). Signature absente/invalide ou `kid` inconnu d'eBay → 401 ; vérification impossible
  (clé publique injoignable, panne eBay) → 503 **sans consommer l'identifiant d'événement** (eBay redélivre).
- Un événement déjà reçu répond `duplicate` (200), sauf si son traitement précédent a échoué : il est alors repris.
- Suppression de compte : pseudo acheteur anonymisé dans les commandes, notifications stockées purgées, compte vendeur
  déconnecté (tokens supprimés, pseudo et nom du canal anonymisés, alertes anonymisées). En cas d'erreur d'écriture : 500,
  eBay redélivre.
- La synchronisation déclenchée par une notification s'exécute après la réponse (`after`), dans la durée maximale de la route
  (`maxDuration = 60`) : elle est bornée à 50 s depuis la réception (périmètre limité au type d'événement, 20 pages de
  commandes au plus). Au-delà, l'événement passe en `failed` avec la raison, et les commandes sont reprises par la
  synchronisation planifiée.
- Notification de commande pendant une synchronisation manuelle : le webhook attend la fin du run (2 × 10 s au plus, dans le
  budget de 50 s) puis relance ; sinon l'événement passe en `failed` avec un message explicite, et la commande est reprise
  par la synchronisation suivante grâce au chevauchement de la fenêtre.
- Un événement resté `received` plus de 10 min (fonction interrompue par la plateforme) est marqué `failed` par
  `/api/cron/sync`, qui synchronise aussitôt les connexions concernées (eBay ayant déjà reçu 2xx, il ne redélivrera pas).
- Clé publique eBay : seul un 404 (ou un 400 dont le corps désigne explicitement l'identifiant de clé) signifie « `kid`
  inconnu » (401, mis en cache 10 min) ; tout autre 400 est traité comme une panne (503, token d'application redemandé).

## 8. Limites connues

- **Annonces créées avec l'Inventory API** (offres/`inventory_item`) : eBay refuse `ReviseInventoryStatus` sur ces annonces
  (« This listing was created with the Inventory API… »). L'erreur eBay est affichée telle quelle ; l'Inventory API n'est pas
  encore implémentée pour l'envoi de quantités.
- **Variations sans SKU** : impossibles à cibler pour l'envoi de quantité (eBay exige le SKU de variation).
- **Quotas** : Trading API ~5 000 appels/jour par application par défaut ; Fulfillment API 50 000–100 000/jour. Les appels sont
  réessayés sur 429/5xx avec attente bornée ; au-delà, le run est marqué partiel/échoué avec « Quota API eBay atteint ».
- **Fenêtre de commandes** : eBay ne renvoie pas plus de 90 jours d'historique lors du premier import ; 200 pages (20 000
  commandes) maximum par run, au-delà le run est « partiel » (`ORDERS_TRUNCATED`) et le curseur reprend au run suivant.
- **Commandes au format inattendu** (`INVALID_ORDER`) : comptées et listées dans le détail du run, mais le curseur les dépasse
  (une commande toujours illisible bloquerait sinon la synchronisation) : vérifiez-les dans eBay.
- **Quota Trading API (code 518)** ou `Retry-After` supérieur à 32 s : pas de nouvelle tentative, run partiel
  « Quota … atteint » ; l'envoi des quantités s'interrompt pour le run.
- **Révocation** : eBay n'offre pas d'API publique pour révoquer un token utilisateur. « Déconnecter » supprime les tokens de
  MON STOCK ; pour retirer l'autorisation côté eBay : *Mon eBay → Compte → Préférences du site → Autorisations tierces*.
- **Site** : les appels Trading utilisent `X-EBAY-API-SITEID: 0` ; `GetMyeBaySelling` renvoie les annonces de tous les sites du
  compte, les prix sont dans la devise de chaque annonce.
- **Identity API** : hôte `apiz.ebay.com` (et non `api.ebay.com`). Même chose pour la **Finances API**.
- **Lectures du conseiller** (`src/integrations/ebay/insights.ts`, `trading-insights.ts`) : appels en direct au moment de la
  question, cache mémoire de 60 s par connexion. Quotas partagés avec la synchronisation (Trading ~5 000 appels/jour) : une
  question en consomme 1 à 10. `GetMyeBaySelling` Sold/Unsold est limité par eBay à 60 jours ; `getOrders` en direct à 90 jours
  dans MON STOCK ; Finances et trafic à 90 jours.
- **Non lu par MON STOCK** : demandes de retour (Post-Order API), rapports de performance publicitaire (leur création est une
  écriture chez eBay), corps des messages sauf demande explicite de l'utilisateur au conseiller.

## 9. Dépannage

| Symptôme | Cause probable / solution |
| --- | --- |
| « Intégration eBay non configurée sur ce serveur » | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` ou `EBAY_RU_NAME` manquants (liste affichée aux admins). Redémarrez le serveur après modification. |
| `invalid_client` / « eBay refuse les identifiants de l'application » | Clés d'un autre environnement (`EBAY_ENV` ≠ keyset) ou Cert ID erroné. |
| eBay affiche « Invalid RuName » / redirection vers une page d'erreur eBay | `EBAY_RU_NAME` ne correspond pas au keyset, ou l'URL « auth accepted » n'est pas HTTPS/publique. |
| URL `?error=browser_mismatch` / « ne provient pas du navigateur qui a lancé la connexion » | Le retour eBay a été ouvert dans un autre navigateur (ou cookies bloqués) : relancez **Connecter eBay** depuis le même navigateur. |
| « État de connexion inconnu ou déjà utilisé » | Le lien de retour a été ouvert deux fois ou après 15 min : relancez **Connecter eBay**. |
| Statut **Expirée** / « le token d'autorisation a expiré » | Refresh token expiré (18 mois), autorisation révoquée par le vendeur, ou `TOKEN_ENCRYPTION_KEY` modifiée : cliquez **Reconnecter eBay**. |
| « eBay a refusé l'appel GetMyeBaySelling : … » | Message exact d'eBay (ex. scope insuffisant → reconnectez pour accorder `sell.inventory`). |
| `?error=scope_refused` / « eBay a refusé les autorisations demandées » | L'application eBay n'a pas accès à Finances / Analytics / Marketing : ajoutez ces scopes au keyset dans le portail développeur, ou restez en connexion standard. |
| Le conseiller répond « reconnectez eBay avec l'analyse complète » | La connexion n'a pas les scopes étendus : **Réglages → Intégrations → Autoriser l'analyse complète** (administrateur). |
| Le conseiller répond « eBay refuse l'accès à cette donnée » | eBay a répondu 403 pour cette API (compte non éligible, marketplace non pris en charge…) : la donnée n'est pas inventée. |
| Le challenge du webhook échoue | L'URL saisie chez eBay diffère de `${NEXT_PUBLIC_APP_URL}/api/webhooks/ebay` (slash final, http/https) ou le token n'a pas 32–80 caractères. |
| Notifications en statut `failed` (401) | Signature invalide : vérifiez que les clés eBay (`EBAY_CLIENT_ID/SECRET`) sont du même environnement que les notifications reçues. |
| `/api/cron/sync` répond 503 | `CRON_SECRET` absent ou trop court. |
| Run `failed` avec « Une synchronisation est déjà en cours » | Un run précédent n'a pas terminé ; il est automatiquement marqué échoué après 10 min. |
| Ventes importées mais stock inchangé | L'annonce n'est pas associée à un SKU (page *Associations*). Après association, les ventes passées peuvent être appliquées depuis la fiche SKU (« appliquer les ventes en attente »). |

Les journaux serveur sont préfixés `[SYNC]`, `[EBAY]`, `[EBAY_OAUTH]`, `[EBAY_WEBHOOK]`, `[CRON]` ; les clés sensibles y sont masquées.
