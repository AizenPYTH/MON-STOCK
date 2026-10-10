# Recherche fournisseurs B2B — octobre 2026

Données complètes : [`suppliers-2026-10.json`](./suppliers-2026-10.json) (63 fiches, vérifiées le 2026-10-10).

## Méthode et limites (à lire avant d'utiliser les données)

- **Aucune page fournisseur n'a pu être ouverte directement.** WebFetch et `curl` ont été refusés par le proxy de sortie de l'environnement (`getaddrinfo ENOTFOUND` / `CONNECT 403`, par exemple pour foneday.shop, bigbuy.eu et mobilax.fr). Toutes les informations nouvelles viennent donc des **résumés et extraits du moteur de recherche** (en FR, EN, DE, NL, ES, IT, PL et RO). Elles sont indicatives tant qu'un humain ou le serveur ne les a pas confirmées.
- Les fiches ont été recoupées avec la documentation déjà présente dans le dépôt. `docs/sourcing-sources.md` contient des extraits officiels du 2026-10-07 et `docs/SERVER.md` §5 les vérifications HTTP faites depuis le serveur le 2026-10-10. Quand une information ne vient que de ces documents, la fiche le précise (`verificationLevel: repo_doc_only`).
- Rien n'a été inventé. Une URL, un prix ou un mode d'accès non trouvé vaut `null`, et la fiche porte `verificationLevel: unverified`. Aucun prix n'a été relevé.
- Champs ajoutés au schéma demandé :
  - `segment` : A_refurb, B_parts, C_liquidation, D_distributor ou E_specialist ;
  - `verificationLevel` : niveau de vérification de la fiche ;
  - `knownInApp` : fournisseur déjà présent dans l'app.
- Un résultat de recherche (une page de documentation sans rapport avec le sujet) contenait des instructions injectées. Elles ont été ignorées.

### Niveaux de vérification

| Niveau | Nb | Sens |
|---|---|---|
| `server_verified` | 1 | Lecture réelle depuis le serveur (Brico-phone) |
| `official_docs_snippet` | 3 | Documentation technique officielle vue en extrait (eBay, Ingram Micro, BigBuy) |
| `official_page_snippet` | 2 | Page officielle qui décrit un flux, sans spécification technique (Esprinet, Action) |
| `third_party_docs` (+repo) | 6 | Flux ou API décrits par un intégrateur tiers (Copaco, Kosatec, AB, Hurtel, TD SYNNEX, Exertis) |
| `search_snippets` (+repo) | 36 | Existence et modèle confirmés par des extraits de recherche |
| `repo_doc_only` | 5 | Non retrouvé cette fois, repris de la doc du dépôt |
| `unverified` | 10 | Piste à qualifier (site propre non trouvé ou aucune info d'accès) |

## Constats principaux

1. **Pièces détachées : aucune API publique trouvée** chez les grossistes du secteur : Foneday, Mobilax, Utopya, Mobileparts.shop, MobileSentrix EU, REWA, Replacebase, 4Phones, GPC et Mobiparts. Tous fonctionnent avec un **compte pro et un portail**. Le seul acteur pièces qui *annonce* un accès API au stock est **Life365** (Italie), sans documentation publique. Seul **Brico-phone** est lisible automatiquement (sitemap + JSON-LD), mais au prix public TTC.
2. **Reconditionné B2B : uniquement des portails ou des listes de prix.**
   - **Foxway** propose un portail revendeur avec stock en direct, et **iOutlet Business** une price sheet quotidienne envoyée aux comptes trade.
   - **Back Market Pro**, **refurbed Business** et **Largo** fonctionnent sur devis ou extranet.
   - L'API Back Market ne sert qu'aux **vendeurs** : il n'existe pas d'API acheteur.
3. **Liquidation : accès manuel uniquement.** B-Stock (Amazon EU), Stocklear, Merkandi, Jobalots, Troostwijk et EuroLots exigent un compte, et plusieurs interdisent l'automatisation dans leurs CGU (voir la doc du dépôt). Il y a une exception partielle : **Destockplus publie un flux RSS/XML public** de ses annonces (`/modules/annonces/rss.php`), utilisable pour une veille.
4. **Distributeurs IT : les seules vraies API et les seuls vrais flux**, avec un assortiment neuf.
   - API : Ingram Micro, TD SYNNEX et KOMSA.
   - Fichiers : Exertis (CSV par SFTP), Copaco (CSV par FTP), Kosatec (CSV par URL), Action (XLSX/CSV) et AB (XML).
   - Esprinet propose espriCATALOG.
   - La plupart demandent un compte revendeur validé (Kbis, solvabilité). La livraison en France reste à confirmer pour les acteurs DE, PL et IT.

## Top 10 à intégrer en priorité

Classement selon le caractère concret de l'accès automatisé et la pertinence pour un revendeur français de smartphones, de reconditionné et de pièces.

| # | Fournisseur | Connecteur | Pourquoi / condition |
|---|---|---|---|
| 1 | **eBay (Browse API)** | API REST (OAuth client credentials) | Déjà prévu ; doc officielle vérifiée ; en production, il faut l'approbation des Buy APIs et le respect de la nouvelle licence (restrictions IA). |
| 2 | **Brico-phone** | Sitemap + JSON-LD | Fonctionne déjà côté serveur ; prix publics TTC (référence de prix pour les pièces FR). |
| 3 | **BigBuy** | API REST + flux CSV/XML (FTP) | Doc officielle (`api.bigbuy.eu/rest/doc`, sandbox) ; pack payant ; vérifier qu'il y a des smartphones dans l'assortiment. |
| 4 | **Ingram Micro** | API REST (Xvantage Reseller v6 : P&A, recherche, détail) + fichier prix SFTP en secours | API gratuite pour les clients ; **disponibilité de l'API en France à confirmer** (un guide tiers cite seulement US/UK/CA). |
| 5 | **TD SYNNEX France** | Flux XML de prix et disponibilité temps réel (ECExpress) / REST (portail dev EU) | Couvre explicitement FR, BE, NL et UK ; code d'autorisation à demander à l'équipe e-commerce. |
| 6 | **KOMSA** | API REST de disponibilité + EDI XML/JSON (SFTP) | Distributeur smartphones de référence en Allemagne ; spécification issue de la doc du dépôt ; livraison France à confirmer. |
| 7 | **Foxway (Reseller Portal)** | Import d'un tableur XLSX/CSV (stocklists / deals « take-all ») | Le plus gros fournisseur de reconditionné B2B en Europe ; pas d'API publique, demander un export au gestionnaire de compte. |
| 8 | **Exertis France** | Fichier prix CSV par SFTP | Activation par le gestionnaire de compte ; société reprise par WE.CONNECT avec changement de nom à venir, à revérifier. |
| 9 | **Esprinet (espriCATALOG)** | Flux catalogue (format à obtenir) + API de commande espriREALTIME | Couvre aussi Sifar, distributeur autorisé de pièces Samsung, Oppo, Realme et autres ; livraison France à confirmer. |
| 10 | **iOutlet Business** | Import de la price sheet quotidienne (tableur ; format exact non confirmé) | Smartphones gradés A+ à D livrés dans l'UE ; expédition depuis le Royaume-Uni (droits et TVA à l'import). |

**À suivre :**
- Copaco : CSV par FTP, Benelux.
- Kosatec : CSV par URL avec clé EDI.
- Action et AB S.A. : XLSX/CSV/XML, Pologne.
- Hurtel : XML, accessoires, Pologne.
- Life365 : API annoncée.
- Destockplus : veille par flux RSS/XML.
- Brodos : API d'après la doc du dépôt.

## Fiches par catégorie (résumé)

### A. Reconditionné / ITAD (16 fiches)

- **Utiles :** Foxway, Back Market Pro, refurbed Business, Largo, Recommerce, Smaaart, iOutlet Business, Callisto (Alchemy, US, enchères et escrow), gsmExchange, Handelot, Swappie for Business.
- **Benchmark B2C seulement :** Certideal, Easycash.
- **Non vérifiées :** Mobile Express NL (site propre introuvable), AfB France (domaine non confirmé), YesYes (modèle B2B inconnu).

### B. Pièces détachées (17 fiches)

- **Déjà dans l'app :** Foneday, Mobileparts.shop, MobileSentrix EU, Replacebase, REWA EU, iFixit Pro, Brico-phone, Utopya, Mobilax, Injured Gadgets, Fixez.
- **Nouveaux :**
  - **4Phones** (NL) : webshop fermé, compte à demander ; la France ne figure pas dans les zones de livraison listées.
  - **Mobiparts/GSMnet** (RO) : plateforme B2B, stock affiché en temps réel.
  - **Sifar** (IT, groupe Esprinet) : distributeur autorisé de pièces Samsung, Oppo, Realme, Huawei, Asus et OnePlus.
  - **SmartGrade** (FR) : écrans Samsung Service Pack d'origine, sur devis par e-mail.
  - **Life365** (IT) : API annoncée.
  - **GSM Parts Center** : partenaire de REWA EU ; site non trouvé.
  - **smartpart4u** (DE) : non vérifié.
- Qualité des pièces documentée :
  - Mobileparts.shop : d'origine, compatibles et de récupération.
  - Brico-phone : OLED compatible, reconditionné d'origine, batterie d'origine.
  - SmartGrade : Service Pack d'origine.
  - iFixit : OEM et aftermarket.

### C. Liquidation / retours / lots (11 fiches)

- **Plateformes :** B-Stock Europe (Amazon EU, Supply Europe : n° TVA, licence commerciale, transport à la charge de l'acheteur), Merkandi, Stocklear (9 niveaux de qualité), Jobalots (aucune garantie, ±10 % sur le manifeste), EuroLots (Bulgarie, annuaire tiers seulement), Wholesale Clearance UK, Destockplus (flux RSS), Troostwijk (retours e-commerce chaque semaine), Vavato (BE, statut incertain), Restposten.de.
- **eBay** est classé ici pour les lots.

### D. Distributeurs UE (14 fiches)

Ingram Micro, TD SYNNEX, ALSO, Esprinet, Exertis FR, KOMSA, Brodos, Wortmann, Jarltech (rien trouvé), bluechip (rien trouvé), Action, AB S.A., LDLC.pro, Westcoast.

### E. Spécialistes à flux (5 fiches)

BigBuy, Copaco, Kosatec, Hurtel, Life365.

## Pistes non qualifiées (non intégrées au JSON)

| Piste | Raison |
|---|---|
| Parts4Repair, 4Gadgets, PhoneParts.nl, Partsfix | Introuvables ; « PartsFixit » apparaît seulement dans un post de 2022 |
| Pieces2Mobile, Distriphone | Mentions anciennes ou faibles |
| APLONG | Usine chinoise avec filiale NL ; site non trouvé |
| Spares Nordic / Teknikdelar | Plutôt B2C, propriété de Clas Ohlson |
| Revendeurs d'annonces Destockplus (PCPACK, Reconditionner.fr, Hexadis, PC4U) | Lots de PC portables professionnels, à qualifier un par un |
| asgoodasnew, Renewd, TrenDevice, reBuy | Aucune offre revendeur B2B trouvée |
| Swappa B2B, Liquidation.com | Marché US |

## Prochaines étapes

1. Relancer `npm run sources:verify` depuis une machine qui a accès au réseau pour confirmer les URL du JSON (en particulier celles en `unverified`).
2. Demander par e-mail, en priorité à Foxway, Ingram FR, TD SYNNEX FR, Exertis/WE.CONNECT, Life365, Foneday, Mobilax et Utopya :
   - l'existence d'un export CSV/XML ou d'une API de stock et de prix pour les revendeurs ;
   - les conditions de livraison et de facturation en France (TVA intracommunautaire).
3. Prévoir côté MON STOCK un connecteur générique « import de tableur fournisseur » (XLSX/CSV avec mapping de colonnes). Il couvrirait Foxway, iOutlet, Exertis, Copaco, Kosatec et Action sans développement propre à chaque fournisseur.
