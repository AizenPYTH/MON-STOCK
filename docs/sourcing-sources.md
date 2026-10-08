# Sources d'approvisionnement B2B — moteur de sourcing MON STOCK

**Date de vérification : 2026-10-07** · Périmètre initial : smartphones (Apple, Samsung, Google, Xiaomi…), électronique reconditionnée, électronique grand public, accessoires, informatique. Priorité France/Europe, puis UK/US/Asie.

---

## 0. État de vérification

| Élément | État |
|---|---|
| Fiches (sections 4–7) | 35 sources, établies le **2026-10-07** à partir d'extraits indexés de pages officielles (**pages non ouvertes, robots.txt non lus**) |
| Catalogue typé (données uniquement, aucun appel réseau) | `src/integrations/sourcing/catalog.ts` — `listCatalogSources()`, `catalogSourceByKey()`, `catalogSummary()` ; chaque source porte `verification: { lastCheckedAt: "2026-10-07", checkedFrom: "search_snippets_official_domain", pageOpened: false, robotsChecked: false }`. Le catalogue reprend les fiches sans relever la confiance : « À vérifier » / « Non trouvé » → `unknown` / `null` |
| Vérification HTTP (statut, URL finale, robots.txt pour `MonStockBot` et `*`, signaux Shopify / WooCommerce / JSON-LD / RSS, sondes publiques sans identifiants) | Script `scripts/verify-sources.ts` → `npm run sources:verify` (`--key <key>`, `--out <fichier>`). Politesse : 2 s/hôte, User-Agent `MonStockBot/0.1 (+contact)` (`SOURCING_USER_AGENT`), délai 15 s, 5 redirections max, aucune nouvelle tentative sur 403/429/CAPTCHA |
| Dernière exécution | **2026-10-08, depuis un environnement sans accès réseau : vérification NON exécutée** (toutes les requêtes refusées par le proxy de sortie). Rapport conservé dans `docs/sourcing-sources-verification.md` avec cette mention ; **à relancer** depuis une machine connectée avant toute décision d'intégration |
| Tableau 12 colonnes dérivé du catalogue | Section 11 (ci-dessous) ; « À vérifier (réseau bloqué) » = champ non tranché par les extraits officiels |

---

## 1. Méthodologie

1. **Identification** : liste de candidats (brief produit + recherches web) → 35 sources retenues pour fiche, 20 écartées ou non vérifiables (section 8).
2. **Vérification** : pour chaque source, recherches **restreintes au domaine officiel** (`allowed_domains`) afin de ne retenir que des informations publiées par le fournisseur lui-même (pages « devenir client », FAQ, CGU/CGV, documentation API, portail développeur). Chaque fiche cite les URL officielles consultées.
3. **Limite technique importante** : depuis l'environnement d'analyse, les requêtes HTTP directes vers les sites fournisseurs étaient bloquées par le proxy réseau (403 sur CONNECT). Les pages n'ont donc **pas été ouvertes directement** ; les faits proviennent des extraits indexés des pages officielles (titres, URL et contenu). Conséquences :
   - les URL listées sont celles indexées sur le domaine officiel ; leur résolution HTTP n'a pas pu être testée ici (à rejouer avec un simple `HEAD` avant intégration) ;
   - `robots.txt` n'a pas pu être lu (sauf eBay, dont le fichier est indexé) → « À vérifier » partout ailleurs ;
   - les prix d'abonnement, MOQ et clauses sont cités uniquement lorsqu'ils figuraient dans un extrait officiel.
4. **Règle d'or** : rien n'est inventé. Quand une information n'a pas été trouvée sur le site officiel, la fiche indique **« À vérifier »** ou **« Non trouvé »**.
5. **Niveaux de confiance** :
   - **Vérifié (extraits officiels)** : plusieurs pages officielles identifiées, champs clés (accès, compte, API/flux, CGU) documentés à partir de ces pages.
   - **Partiel** : site officiel identifié, mais un ou plusieurs champs clés manquants.
   - **Non vérifié** : aucune page officielle trouvée → source non retenue (section 8).

---

## 2. Règles légales et éthiques du moteur de sourcing

Le moteur MON STOCK applique, sans exception, les règles suivantes :

1. **Respect de `robots.txt`**, des CGU/CGV et des conditions d'API de chaque source. Une clause interdisant les robots/scrapers = pas d'accès automatisé, point.
2. **Rate limiting** conservateur sur toute source publique (quelques requêtes/minute, User-Agent identifié, cache), jamais de parallélisme agressif.
3. **Aucun contournement** de login, CAPTCHA, anti-bot, paywall, abonnement ou limitation d'API. Aucune rotation d'IP/proxy pour masquer l'origine.
4. **Comptes fournisseurs** : uniquement connectés **par le vendeur lui-même**, avec ses propres identifiants, et seulement si le fournisseur autorise l'usage automatisé (API officielle, flux CSV/XML/SFTP, EDI). MON STOCK ne crée jamais de compte au nom du vendeur et ne partage jamais d'identifiants entre vendeurs (clause explicite chez gsmExchange, par ex.).
5. **Données** : on n'extrait que ce qui est nécessaire (prix, stock, référence, condition) ; aucune reconstitution de base de données de prix à partir d'un site qui l'interdit (Amazon, eBay, Alibaba, B-Stock, BrokerBin…).
6. **Transparence** : chaque offre affichée dans MON STOCK indique sa source, son mode d'accès (API, flux, compte, manuel) et sa date de rafraîchissement.
7. **Révision** : les CGU évoluent ; chaque source intégrée est re-vérifiée au moins tous les 6 mois et à chaque changement de conditions.

**Classes d'intégration utilisées dans les fiches**

| Classe | Signification |
|---|---|
| `PUBLIC_WEB` | Prix publics, accès automatisé autorisé ou non précisé (pages HTML / JSON-LD) |
| `API` | API officielle documentée |
| `FEED` | Flux CSV/XML/JSON/SFTP/EDI fourni par le fournisseur |
| `SUPPLIER_ACCOUNT` | Prix après connexion → le vendeur connecte son propre compte autorisé |
| `PARTNER_FEED` | Nécessite un accord/partenariat avec le fournisseur |
| `MANUAL` | Consultation manuelle uniquement (CGU interdisant l'automatisation, ou devis) |

---

## 3. Tableau de synthèse

| # | Source | Type | Zone | Catégories clés | Prix | API | Flux | Classe d'intégration | Confiance |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Back Market Pro | Marketplace B2B reconditionné | FR / UK / US | Smartphones, laptops, tablettes, accessoires | Privé (pro, n° TVA) | Non (acheteur) | Non trouvé | `SUPPLIER_ACCOUNT` / `MANUAL` | Vérifié |
| 2 | Foxway (Reseller Store + Wholesale) | Reconditionneur / distributeur B2B | EU (ex-works UK pour Wholesale) | Smartphones, tablettes, PC, wearables, accessoires | Privé (compte) | À vérifier | Tableurs « take-all » | `SUPPLIER_ACCOUNT` | Vérifié |
| 3 | refurbed Business | Marketplace reconditionné, offre B2B | DE / AT (+ IE) ; FR : À vérifier | Smartphones, laptops, tablettes, écrans | B2C public ; B2B sur devis | Non trouvé | Non | `MANUAL` (devis) | Vérifié |
| 4 | Largo (Largo Business) | Reconditionneur industriel FR, extranet distributeurs | FR / BE / CH | Smartphones, tablettes, PC, accessoires | Privé (extranet) | À vérifier | À vérifier | `SUPPLIER_ACCOUNT` / `PARTNER_FEED` | Vérifié |
| 5 | Recommerce | Reconditionneur, distribution B2B via partenaires | EU (20 pays) | Smartphones | Privé / partenariat | Non trouvé | Non trouvé | `PARTNER_FEED` | Partiel |
| 6 | Smaaart | Reconditionneur FR, solutions entreprises | FR | Smartphones, PC, tablettes | B2C public ; pro : À vérifier | Non trouvé | Non trouvé | `MANUAL` / `PARTNER_FEED` | Partiel |
| 7 | AB Business | Grossiste téléphonie mobile FR | FR | Smartphones neufs + reconditionnés, accessoires | À vérifier | Non trouvé | Non trouvé | `SUPPLIER_ACCOUNT` (probable) | Partiel |
| 8 | Ingram Micro France | Distributeur IT broadline | FR (groupe mondial) | IT, mobilité, accessoires | Privé (revendeur) | **Oui** (Reseller API v6) | À vérifier | `API` + `SUPPLIER_ACCOUNT` | Vérifié |
| 9 | TD SYNNEX France | Distributeur IT broadline | FR / EU | IT, 150 000 produits, 250 marques | Privé (revendeur) | **Oui** (Digital Bridge EU) | À vérifier (EDI) | `API` + `SUPPLIER_ACCOUNT` | Vérifié |
| 10 | ALSO France | Distributeur IT | FR / EU | IT, 35 000 produits | Privé (revendeur) | EDI/XML (groupe) | **Oui** (SFTP listes de prix, 1WorldSync) | `FEED` + `SUPPLIER_ACCOUNT` | Vérifié |
| 11 | Exertis France | Distributeur IT / mobilité / AV | FR | Informatique, Gaming, Mobilité, Audio-Vidéo | Privé (revendeur) | EDI | **Oui** (PriceCAT feeds) | `FEED` + `SUPPLIER_ACCOUNT` | Vérifié |
| 12 | Westcoast | Distributeur IT | UK (FR : À vérifier) | IT, composants | Privé (revendeur) | **Oui** (XML Portal, cXML, EDI) | Feed par marque sur demande | `API`/`FEED` + `SUPPLIER_ACCOUNT` | Vérifié |
| 13 | KOMSA | Distributeur télécom / mobilité | DE (FR : À vérifier) | Smartphones, accessoires, IT | Privé (KARLO) | **Oui** (REST dispo. temps réel) | **Oui** (EDI XML/JSON, SFTP, easydata) | `API`/`FEED` + `SUPPLIER_ACCOUNT` | Vérifié |
| 14 | Brodos | Distributeur mobilité | DE (intl. possible) | Smartphones, tablettes, accessoires | Privé (B2B Shop) | **Oui** (Article Master Data, Offer API, openTRANS) | Oui (openTRANS XML) | `API` + `SUPPLIER_ACCOUNT` | Vérifié |
| 15 | Stocklear | Marketplace B2B déstockage, enchères | FR (+EU) | Retours clients / invendus, dont téléphonie | Privé (compte validé) | À vérifier | À vérifier | `SUPPLIER_ACCOUNT` | Vérifié |
| 16 | Destockplus | Petites annonces B2B déstockage | FR | Lots, dont téléphonie | Annonces publiques (prix souvent sur demande) | Non | Flux entrant vendeurs uniquement | `PUBLIC_WEB` (prudence) | Vérifié |
| 17 | Merkandi | Plateforme B2B stocklots (abonnement) | EU / monde | Surstocks, retours, reconditionné, dont électronique | Privé (abonnement payant) | Non trouvé | Non trouvé | `SUPPLIER_ACCOUNT` | Vérifié |
| 18 | B-Stock (Europe / Amazon EU / France) | Enchères B2B liquidation | EU / UK | Électronique, mobiles (grades A–D), retours Amazon | Privé (compte, n° TVA) | Non trouvé | Non trouvé | `MANUAL` (automatisation interdite) | Vérifié |
| 19 | Eurolots | Plateforme B2B liquidation | EU | Électronique, lots mixtes | Privé (compte validé) | À vérifier | À vérifier | `SUPPLIER_ACCOUNT` | Vérifié |
| 20 | Wholesale Clearance UK | Déstockage / liquidation | UK | Électronique, lots | Public | Non | Non | `MANUAL` (scraping interdit) | Vérifié |
| 21 | Gem Wholesale | Grossiste retours / clearance | UK | Électroménager, électronique domestique | Public (HT) | Non | Non | `PUBLIC_WEB` (prudence) | Vérifié |
| 22 | SoloStocks | Marketplace B2B généraliste | ES / FR / EU / LATAM | Téléphonie, informatique (entre autres) | Public (négociation après inscription) | Non trouvé | Non trouvé | `PUBLIC_WEB` (prudence) | Partiel |
| 23 | BrokerBin | Bourse B2B IT hardware (membres) | Monde | Pièces/systèmes IT neufs, used, refurb | Privé (1 599–3 750 $/an) | Non | Non | `MANUAL` (scraping interdit) | Vérifié |
| 24 | gsmExchange | Bourse B2B mobiles (membres vérifiés) | Monde (Dublin) | Smartphones en gros (100–500 unités/transaction) | Privé (membres) | Non | Non | `MANUAL` (scraping interdit) | Vérifié |
| 25 | Handelot | Plateforme trading B2B électronique | Monde (Pologne) | Mobiles, tablettes, consoles, TV, IT (neuf/used/refurb) | Privé (membres VIP/VIP Gold/Junior) | Non trouvé | Non trouvé | `SUPPLIER_ACCOUNT` / `MANUAL` | Partiel |
| 26 | Amazon Business (FR) | Marketplace B2B | FR / EU | Tout, dont smartphones et IT | Prix pro après compte vérifié | **Oui** (Product Search API, sur approbation) | Non | `API` (sous approbation) / `SUPPLIER_ACCOUNT` | Vérifié |
| 27 | eBay (Browse API) | Marketplace | FR / EU / monde | Tout, dont lots | Public | **Oui** (Browse API, prod. via EPN) | Non | `API` (sous approbation) | Vérifié |
| 28 | BigBuy | Grossiste / dropshipping EU | EU (Espagne) | Électronique, IT, accessoires (smartphones : À vérifier) | Privé (pack payant) | **Oui** (REST JSON) | **Oui** (CSV/XML, FTP, 24 langues) | `API` + `FEED` | Vérifié |
| 29 | CdiscountPro | Site B2B achats pro | FR | IT, téléphonie, 100 000 réf. | Public HT | Non trouvé | Non trouvé | `PUBLIC_WEB` (CGU à vérifier) | Partiel |
| 30 | Alibaba.com | Marketplace B2B | Asie / monde | Tout, dont électronique | Public indicatif, négocié | **Oui** (Open Platform, sur approbation) | Non | `API` (sous approbation) / `MANUAL` | Vérifié |
| 31 | Global Sources | Marketplace B2B | Asie / monde | Électronique grand public, mobile | Sur demande | Non trouvé | Non | `MANUAL` | Vérifié |
| 32 | Liquidation.com | Enchères liquidation | US | Électronique, mobiles | Privé (compte gratuit) | Non | Non | `MANUAL` (scraping interdit) | Vérifié |
| 33 | Direct Liquidation | Enchères / prix fixes liquidation | US | Électronique, retours | Privé (compte) | Non | Non | `MANUAL` (scraping interdit) | Vérifié |
| 34 | Via Trading | Grossiste liquidation | US (export) | Électronique, retours | Public | Non | Non | `MANUAL` (scraping interdit) | Vérifié |
| 35 | 888 Lots | Plateforme B2B liquidation | US uniquement | Électronique, mobiles | Privé (compte) | Non | Non | n/a → voir Eurolots | Vérifié |

---

## 4. Fiches détaillées — Reconditionné et B2B « refurbished » (France / Europe)

### 4.1 Back Market Pro

| Champ | Valeur vérifiée |
|---|---|
| Nom | Back Market Pro |
| URL officielle | https://pro.backmarket.fr/ · https://pro.backmarket.com/ · aide : https://help.backmarket.com/hc/fr-fr/articles/360033757394 (« Je suis un professionnel et je souhaite passer commande en gros… ») · https://help.backmarket.com/hc/en-us/articles/15855626593948 (« What B2B services does Back Market offer? ») |
| Type | Marketplace B2B de reconditionné (« the leading B2B marketplace for verified refurbished tech ») |
| Catégories | Smartphones, laptops, tablettes, accessoires reconditionnés |
| Prix | **Privé** : « The creation of a customer account on the Platform is only authorized for professionals. The User must provide their intra-community VAT number » (CGU Pro : https://pro.backmarket.fr/policies/terms-of-service). Affichage des prix avant connexion : À vérifier |
| API | **Non côté acheteur** (non trouvé). Back Market expose des API **côté vendeur** (seller hub / back-office marchand : https://www.backmarket.com/en-us/seller/home) — sans rapport avec l'achat |
| Flux CSV/XML/JSON | Non trouvé |
| Compte | Oui — professionnels uniquement, n° TVA intracommunautaire demandé à la création |
| CGU / accès automatisé | CGU Back Market (https://www.backmarket.fr/fr-fr/legal/terms-of-use) : interdiction d'utiliser « software, devices, scripts, robots or any other means or process (including web crawlers, browser extension modules…) » pour faire du « web scraping » (extraction automatisée de données en vue de leur réutilisation). CGV Pro : https://pro.backmarket.fr/pages/conditions-generales-de-vente |
| Intégration MON STOCK | `SUPPLIER_ACCOUNT` (compte pro du vendeur) ; pour le volume, `MANUAL` : « bulk sourcing or test orders… hand-picks models and trusted sellers… one dedicated point of contact » |
| Fréquence MAJ | Non indiquée |
| Zone / MOQ / TVA | FR, UK, US (sites pro.backmarket.fr / .com / .co.uk). MOQ : À vérifier. TVA calculée à la validation du panier ; certains produits en **TVA sur la marge** (pas de TVA déductible) — article d'aide « Puis-je récupérer la TVA si je suis un professionnel ? » |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 4.2 Foxway — Reseller Store et Wholesale Platform

| Champ | Valeur vérifiée |
|---|---|
| Nom | Foxway (Reseller Store ; Wholesale Platform « Deals ») |
| URL officielle | https://www.foxway.com/en/buy-devices/ · Reseller Store : https://resellers.foxway.com/ · Wholesale : https://wholesale.foxway.com/ (register : /register ; FAQ : /faqs) · CGV portail : https://foxway.shop/sp/MTerms/tc |
| Type | Reconditionneur / recommerce B2B (Suède–Estonie), « largest supplier of new and used electronic devices in Europe » |
| Catégories | Mobiles et smartphones, tablettes, laptops (Apple & PC), wearables, accessoires, composants, enceintes/casques — neuf, reconditionné, used, et lots « for refurbishing » |
| Prix | **Privé** : « online wholesale electronics portal with real-time prices and on-site checkout » après création de compte. Wholesale : « Advertised prices are Ex-Works from the UK and exclude delivery and any taxes/duties » ; devises GBP/EUR/USD |
| API | À vérifier (non trouvé) |
| Flux | Wholesale : offres « Take-All » décrites dans un **tableur** par deal (manuel). Enchères hebdomadaires mardi→jeudi. Feed structuré : À vérifier |
| Compte | Oui. Reseller Store : inscription + questionnaire. Wholesale : formulaire « New Customer registration » signé + preuve d'identité + vérification de l'entreprise après le premier deal ; champ « Company Name » obligatoire |
| CGU / accès automatisé | CGV du Reseller Portal : compte requis, mot de passe strictement personnel, obligation de surveiller les accès tiers. Clause scraping explicite : **Non trouvé** |
| Intégration MON STOCK | `SUPPLIER_ACCOUNT` (le vendeur connecte son compte ; demander à Foxway s'il existe un export/API partenaire → `PARTNER_FEED`) |
| Fréquence MAJ | « Real-time stock visibility » (Reseller Store) |
| Zone / MOQ / TVA | > 1 000 revendeurs B2B en Europe ; Wholesale ex-works UK ; prix HT ; garantie 90 jours ; MOQ : deals « take-all » (lot complet) |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 4.3 refurbed Business

| Champ | Valeur vérifiée |
|---|---|
| Nom | refurbed Business |
| URL officielle | https://business.refurbed.de/ · https://business.refurbed.at/ · AGB B2B : https://business.refurbed.de/agb · demande : https://business.refurbed.de/angebot · FAQ : https://www.refurbed.de/fragen-und-antworten/ · FR (B2C) : https://www.refurbed.fr/ |
| Type | Marketplace de reconditionné (Vienne) avec offre B2B sur devis |
| Catégories | Smartphones, laptops, tablettes, écrans, desktops, imprimantes |
| Prix | B2C **publics** ; B2B **sur devis** : « order more than 15 devices and receive a customized offer… b2b@refurbed.de / businesscontact@refurbed.com ». FAQ FR : les entreprises achètent comme les particuliers, montant net affiché en livraison transfrontalière avec n° TVA vérifié |
| API | Non trouvé |
| Flux | Non |
| Compte | B2C : compte standard. B2B : demande par e-mail, pas de portail de commande automatisé trouvé |
| CGU / accès automatisé | AGB B2B : devis et listes de prix non contraignants sauf mention. Clause scraping : Non trouvé |
| Intégration MON STOCK | `MANUAL` (devis) ; prix B2C publics non exploitables automatiquement sans accord |
| Fréquence MAJ | Non indiquée |
| Zone / MOQ / TVA | Portails business DE/AT ; lancement B2B Irlande (presse). **MOQ : 15 appareils identiques** (« Requests with fewer than 15 identical products cannot be processed ») ; rachat ≥ 30. Garantie ≥ 12 mois, achat sur facture. Portail business FR : À vérifier |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 4.4 Largo / Largo Business

| Champ | Valeur vérifiée |
|---|---|
| Nom | Largo (Largo Business) |
| URL officielle | https://www.largo.fr/ · https://www.largo.fr/content/largo-business.html · https://www.largo.fr/content/devenir-distributeur.html · CGV : https://sav.largo.fr/cgv · garantie revendeurs : https://sav.largo.fr/conditions-particulieres-relatives-la-garantie-contractuelle-largo-envers-les-revendeurs |
| Type | Reconditionneur industriel (Nantes, coté en bourse) ; canal B2B via distributeurs et **extranet de vente en ligne dédié aux professionnels de la distribution** (FR/BE/CH) |
| Catégories | Smartphones, tablettes, ordinateurs, accessoires reconditionnés en France |
| Prix | **Privé** (extranet) : « accès en temps réel au stock disponible, saisie de commande simplifiée, livraison express » (communiqué, espace presse largo.fr) |
| API | À vérifier |
| Flux | À vérifier |
| Compte | Oui — page « Devenir distributeur » ; conditions exactes (Kbis, validation) : À vérifier |
| CGU / accès automatisé | Non trouvé |
| Intégration MON STOCK | `SUPPLIER_ACCOUNT` (extranet) → `PARTNER_FEED` si Largo fournit un export |
| Fréquence MAJ | « temps réel » (stock extranet) |
| Zone / MOQ / TVA | FR, BE, CH ; garantie jusqu'à 36 mois ; MOQ : À vérifier |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 4.5 Recommerce

| Champ | Valeur vérifiée |
|---|---|
| Nom | Recommerce (Recommerce Group) |
| URL officielle | https://www.recommerce.com/fr/ · https://www.recommerce-group.com/ |
| Type | Reconditionneur (Gentilly) ; distribution B2B « via des distributeurs, des opérateurs Télécoms et des sites Internet e-commerce » ; CircularX (SaaS reprise en marque blanche) |
| Catégories | Smartphones reconditionnés |
| Prix | B2C publics sur recommerce.com ; B2B : partenariat, pas de portail ouvert trouvé |
| API / Flux | Non trouvé |
| Compte | À vérifier (contact commercial) |
| CGU / accès automatisé | Non trouvé |
| Intégration MON STOCK | `PARTNER_FEED` |
| Zone | 20 pays européens |
| Confiance | Partiel — 2026-10-07 |

### 4.6 Smaaart

| Champ | Valeur vérifiée |
|---|---|
| Nom | SMAAART |
| URL officielle | https://smaaart.fr/ · https://smaaart.fr/content/21-solutions-pour-entreprises |
| Type | Reconditionneur (usine dans l'Hérault) ; « solution 360° pour les entreprises » (vente, rachat de flotte, réparation) |
| Catégories | Smartphones, ordinateurs, tablettes (3 états esthétiques, garantie jusqu'à 24 mois) |
| Prix | B2C publics ; programme revendeurs / tarifs pro : À vérifier |
| API / Flux | Non trouvé |
| Intégration MON STOCK | `MANUAL` / `PARTNER_FEED` |
| Confiance | Partiel — 2026-10-07 |

### 4.7 AB Business (grossiste téléphonie, Marseille)

| Champ | Valeur vérifiée |
|---|---|
| Nom | AB Business (« powered by Phone18 ») |
| URL officielle | https://www.abbusiness.fr/ (pages marques : /12-grossiste-telephones-samsung, /21206-oppo, …) |
| Type | Grossiste en téléphonie mobile depuis 2008, neuf et **reconditionné** ; cible revendeurs, réparateurs, détaillants |
| Catégories | Smartphones (Samsung, Apple, Oppo, Nokia/HMD, ZTE, Ulefone…), tablettes, accessoires |
| Prix | À vérifier (visibilité avant compte non confirmée) |
| API / Flux | Non trouvé |
| Compte | À vérifier (conditions pro non trouvées) |
| CGU | À vérifier |
| Intégration MON STOCK | `SUPPLIER_ACCOUNT` (probable) — à confirmer |
| Zone | FR |
| Confiance | Partiel — 2026-10-07 |

---

## 5. Fiches détaillées — Distributeurs IT et mobilité

### 5.1 Ingram Micro France

| Champ | Valeur vérifiée |
|---|---|
| Nom | Ingram Micro France |
| URL officielle | https://fr.ingrammicro.eu/ · devenir client : https://fr.ingrammicro.eu/nous-contacter/devenir-client · inscription : https://www.ingrammicro.com/fr-fr/sign-up · portail dev : https://developer.ingrammicro.com/reseller · docs : https://developer.ingrammicro.com/reseller/api-documentation/product-catalog , …/price-and-availability · CGU : https://www.ingrammicro.com/en-us/legal/terms-of-use/ |
| Type | Distributeur IT broadline (plateforme Xvantage) |
| Catégories | IT, mobilité, accessoires (référencement « très étendu ») |
| Prix | **Privé** : « prix attractifs réservés aux professionnels de la distribution » ; « En vous inscrivant vous attestez être revendeurs » |
| API | **Oui** — Reseller APIs v6 : catalogue, **prix & disponibilité (jusqu'à 50 SKU par appel, stock par entrepôt)**, commandes… REST/JSON, hôte `https://api.ingrammicro.com:443/resellers/v6` ; « no direct fees for consuming Ingram Micro APIs » ; demande d'accès avec **numéro client / Partner ID** ; SDK C#, Java, Node.js, Python, Go ; spéc. OpenAPI publiée sur GitHub (`ingrammicro-xvantage/xi-sdk-openapispec`) |
| Flux | À vérifier (listes de prix/EDI non confirmées) |
| Compte | Oui — revendeur ; prépaiement pour professions libérales / auto-entrepreneurs, crédit pour les autres (service crédit) ; pièces exactes : À vérifier |
| CGU / accès automatisé | Terms of Use couvrent les API : accès « solely within the applicable country for your account(s) » ; apps « abusive » révoquées. Pas de clause anti-scraping spécifique trouvée (inutile : l'API est la voie officielle) |
| Intégration MON STOCK | `API` via `SUPPLIER_ACCOUNT` (le vendeur fournit ses identifiants API Ingram) |
| Fréquence MAJ | Temps réel (« real-time price and availability ») |
| Zone / MOQ / TVA | France ; prix HT revendeur ; MOQ : non indiqué |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 5.2 TD SYNNEX France

| Champ | Valeur vérifiée |
|---|---|
| Nom | TD SYNNEX France |
| URL officielle | https://fr.tdsynnex.com/ · ouverture de compte : https://fr.tdsynnex.com/newCustomerRegistration · portail dev EU : https://developer.api.tdsynnex.com/eu · https://developer.tdsynnex.com/ · Digital Bridge : https://www.tdsynnex.com/na/us/digital-bridge/ · services : https://fr.tdsynnex.com/services-et-assistance |
| Type | Distributeur IT broadline (webshop InTouch) |
| Catégories | « plus de 150 000 produits de 250 marques » |
| Prix | **Privé** (revendeurs/professionnels IT) |
| API | **Oui** — Developer Portal : REST APIs produits, **prix, disponibilité**, commandes, renouvellements, cloud ; clés sandbox, Swagger ; « real-time data… product information, online stock and prices, order status with ETA » ; portail EU dédié |
| Flux | À vérifier (EDI probable, non confirmé) |
| Compte | Oui — pièces listées : **RIB, Kbis < 3 mois, papier à en-tête, pièce d'identité du représentant légal, déclaration DBE-S1, n° TVA, SIRET** |
| CGU / accès automatisé | À vérifier |
| Intégration MON STOCK | `API` via `SUPPLIER_ACCOUNT` |
| Fréquence MAJ | Temps réel (stock/prix en ligne) |
| Zone / MOQ / TVA | France / Europe ; HT ; MOQ : non indiqué |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 5.3 ALSO France

| Champ | Valeur vérifiée |
|---|---|
| Nom | ALSO France S.A.S. |
| URL officielle | https://www.also.com/ec/cms5/fr_2000/2000/ · ouvrir un compte : https://www.also.com/ec/cms5/fr_2000/2000/information/ouvrir-un-compte/index.jsp · documentation/CGV : https://www.also.com/ec/cms5/fr_2000/2000/information/documentation/index.jsp · webshop : https://www.also.com/ec/cms5/fr_2000/2000/offres-also/offre-it/also-webshop/index.jsp · services e-commerce groupe : https://www.also.com/ec/cms5/en_6000/6000/web-shop/index.jsp · EDI/XML (DE) : https://www.also.com/ec/cms5/de_1010/1010/services/it-services/edi-und-xml-integration/index.jsp |
| Type | Distributeur IT |
| Catégories | « plus de 35 000 produits IT à prix de gros » ; webshop > 1 500 catégories (groupe) |
| Prix | **Privé** : « affichage en temps réel de la disponibilité et des prix d'achat » après compte revendeur |
| API | Groupe : intégration **XML/EDI** (commande XML ou requête HTTP vers l'ERP), connecteurs ERP ; API ALSO Cloud Marketplace (cloud/SaaS uniquement, hors périmètre matériel) |
| Flux | **Oui (groupe)** : « SFTP price lists », contenu produit 1WorldSync mis à jour quotidiennement, « load all product information daily free of charge into your own… webshop ». Disponibilité exacte pour la filiale France : À vérifier |
| Compte | Oui — « ouvrir votre compte revendeur en 5 minutes » ; documents complémentaires (PDF officiel) |
| CGU / accès automatisé | À vérifier (CGV dans la section Documentation) |
| Intégration MON STOCK | `FEED` (SFTP) + EDI via `SUPPLIER_ACCOUNT` |
| Fréquence MAJ | Quotidienne (contenu/prix SFTP), temps réel (webshop) |
| Zone / MOQ / TVA | France ; HT |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 5.4 Exertis France

| Champ | Valeur vérifiée |
|---|---|
| Nom | Exertis France |
| URL officielle | https://www.exertis.fr/ · CGV : https://www.exertis.fr/exertis-cgv.php · clients : https://www.exertis.fr/clients.php · web services : https://exertis.fr/web-services.php · canal B2B : https://www.exertis.fr/canal-b2b.php |
| Type | Distributeur (groupe DCC) : Informatique, Gaming, Mobilité, Audio-Vidéo ; > 350 marques |
| Prix | **Privé** (revendeurs) |
| API | EDI (« transact orders via EDI ») |
| Flux | **Oui** : « PriceCAT feeds » et service de contenu (page web-services) ; format exact : À vérifier |
| Compte | Oui — demande d'ouverture de compte avant première commande : **CGV signées et cachetées, Kbis < 3 mois, RIB original, papier en-tête avec SIREN et code APE, copie CNI du gérant** ; premières commandes réglées avant expédition |
| CGU / accès automatisé | À vérifier |
| Intégration MON STOCK | `FEED` + EDI via `SUPPLIER_ACCOUNT` |
| Zone / MOQ / TVA | France ; HT |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 5.5 Westcoast (UK ; Westcoast France SAS)

| Champ | Valeur vérifiée |
|---|---|
| Nom | Westcoast |
| URL officielle | https://www.westcoast.co.uk/ · ouverture de compte : https://www.westcoast.co.uk/about-us/OpenAnAccount.html · https://openaccount.westcoast.co.uk/ · Electronic Trading : https://www.westcoast.co.uk/what-we-do/Electronic_Trading.html |
| Type | Distributeur IT (UK) ; entité française issue du rachat d'ADS France (Lyon) — site FR officiel : À vérifier |
| Prix | **Privé** (revendeurs UK) |
| API | **Oui** : « XML Portal » (stock, prix, commandes, réponses), standards **EDIFact, Tradacoms, BOSS XML, cXML** + format propre ; « self-onboarding customer API for EDI transactions » |
| Flux | « Your account manager can configure a brand-specific feed » |
| Compte | Oui — « Cash with Order » (≈ 1 jour ouvré) ou crédit (≈ 2 jours) |
| CGU / accès automatisé | À vérifier |
| Intégration MON STOCK | `API`/`FEED` via `SUPPLIER_ACCOUNT` (UK) |
| Zone | UK (FR : À vérifier) |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 5.6 KOMSA (Allemagne)

| Champ | Valeur vérifiée |
|---|---|
| Nom | KOMSA |
| URL officielle | https://komsa.com/ · devenir partenaire : https://komsa.com/en/contact/become-a-partner · interfaces : https://komsa.com/en/downloads/edi/interfaces-at-komsa · spéc. API dispo temps réel (PDF) : https://komsa.com/fileadmin/komsa.com/Dokumente/EDI/de/KOMSA_Echtzeit-Bestandsabfrage_API_Spezifikation.pdf · CG easydata : https://komsa.com/fileadmin/legal/KOMSA_easydata_AVB.pdf |
| Type | Distributeur télécom / mobilité à valeur ajoutée (Apple, Samsung, Huawei, Microsoft…) |
| Prix | **Privé** (B2B shop KARLO) |
| API | **Oui** : webservice REST d'interrogation des disponibilités, authentifié, `https://partner.komsa.de/api/v1/product/[article]` (GET) |
| Flux | **Oui** : EDI complet (commandes, stocks, ASN, factures) en **XML et JSON**, via webservice ou **SFTP** ; données articles « easydata » |
| Compte | Oui — vérification des données société **et de la solvabilité**, puis accès KARLO + account manager |
| CGU / accès automatisé | CG easydata (PDF) : À vérifier |
| Intégration MON STOCK | `API`/`FEED` via `SUPPLIER_ACCOUNT` |
| Zone | Allemagne ; livraison France : À vérifier |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 5.7 Brodos (Allemagne)

| Champ | Valeur vérifiée |
|---|---|
| Nom | Brodos AG |
| URL officielle | https://brodos.com/ · inscription : https://brodos.com/registrierung/ · B2B Shop : https://shop.brodos.net/ · Developer Area : https://forms.brodos.com/brodos-developer-area/ |
| Type | Distributeur / prestataire mobilité (Apple Authorized Reseller, portail Samsung B2B) |
| Prix | **Privé** (B2B Shop, autorisation sur le compte) |
| API | **Oui** : Activate API, Customer API, Marketplace OFFER API, **Article Master Data API**, commandes **openTRANS XML** ; identifiants de test via account manager |
| Flux | openTRANS XML |
| Compte | Oui — formulaire avec canal de distribution (dont « international business partner ») |
| CGU / accès automatisé | À vérifier |
| Intégration MON STOCK | `API` via `SUPPLIER_ACCOUNT` |
| Zone | Allemagne ; livraison France : À vérifier |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

---

## 6. Fiches détaillées — Déstockage, liquidation, enchères B2B

### 6.1 Stocklear (France)

| Champ | Valeur vérifiée |
|---|---|
| Nom | Stocklear |
| URL officielle | https://stocklear.fr/ · acheter : https://stocklear.fr/acheter-sur-stocklear-la-marketplace-b2b-dediee-au-destockage · catégorie téléphone : https://stocklear.fr/lots/cat/telephone-16 · lots Cdiscount : https://stocklear.fr/lots/s/cdiscount-1 |
| Type | Marketplace B2B 100 % en ligne de déstockage (enchères) — lots de retours clients, invendus, fins de série de grandes enseignes/e-commerçants |
| Catégories | Palettes multi-catégories dont électronique/téléphonie ; états : neuf emballé, neuf sans emballage, retours fonctionnels, casse transport, reconditionné A/B, occasion, non fonctionnel, non testé |
| Prix | **Privé** : « only certified accounts… have access to offers and the ability to bid and purchase » |
| API / Flux | À vérifier |
| Compte | Oui — **professionnels uniquement** : formulaire (SIRET, SIREN, **Kbis < 1 an**, TVA…), **validation manuelle** par l'équipe ; auto-entrepreneurs acceptés |
| CGU / accès automatisé | Non trouvé |
| Intégration MON STOCK | `SUPPLIER_ACCOUNT` (alertes d'enchères via le compte du vendeur ; automatisation à confirmer avec Stocklear) |
| Zone | France (presse : 15 pays) |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 6.2 Destockplus (France)

| Champ | Valeur vérifiée |
|---|---|
| Nom | Destockplus |
| URL officielle | https://www.destockplus.com/ · CGU/CGV : https://www.destockplus.com/cgv.php · inscription : https://www.destockplus.com/mon_espace/inscription.php · Téléphonie : https://www.destockplus.com/acheter/Telephonie-1-27.html · flux vendeurs : https://www.destockplus.com/flux-d-annonces |
| Type | Site de petites annonces B2B de déstockage : « tout professionnel du négoce (grossiste, fournisseur, fabricant, liquidateur…) » publie des annonces ; dépôt gratuit, sans commission |
| Catégories | Multi-secteurs ; rubrique Téléphonie (accessoires, mobiles, fixes) ; nombreuses annonces de lots iPhone/Android « réservés aux professionnels » |
| Prix | Annonces **publiques** ; prix affichés ou « sur demande » selon l'annonceur : À vérifier annonce par annonce |
| API | Non |
| Flux | « Flux d'annonces » = flux **entrant** pour les vendeurs (synchronisation de leur boutique) ; pas de flux sortant pour acheteurs |
| Compte | Compte gratuit pour publier/contacter ; consultation sans compte |
| CGU / accès automatisé | CGV : interdiction de programmes visant à endommager ou intercepter clandestinement les systèmes/données ; clause spécifique robots/scraping : **Non trouvé** |
| Intégration MON STOCK | `PUBLIC_WEB` avec prudence (robots.txt à lire, rate limit strict, pas de reconstitution de base) ; qualité hétérogène (annonces non vérifiées) |
| Zone | France |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 6.3 Merkandi

| Champ | Valeur vérifiée |
|---|---|
| Nom | Merkandi |
| URL officielle | https://merkandi.fr/ · types de comptes : https://merkandi.fr/faq/comment-traduire-une-offre-avec-laide-du-traducteur/17 · conditions : https://merkandi.fr/conditions · inscription : https://merkandi.com/register · enchères : https://auctions.merkandi.com/fr/for-buyers |
| Type | Plateforme B2B internationale de stocklots (surstocks, liquidations, faillites, retours clients) ; Merkandi n'est pas partie au contrat de vente |
| Catégories | Neuf, occasion, reconditionné usine, endommagé (pièces) — dont électronique |
| Prix | **Privé** : abonnement annuel payant ; **STANDARD 239 € HT/an, PREMIUM 279 € HT/an** (remise -20 % affichée : 191,20 € / 223,20 €) ; BUSINESS/ENTERPRISE : tarif non trouvé |
| API | Non trouvé (import d'offres côté vendeur uniquement) |
| Flux | Non trouvé |
| Compte | Oui — particuliers **et** entreprises acceptés comme acheteurs (« sans être obligé d'avoir une entreprise ») ; vente après vérification |
| CGU / accès automatisé | Clause robots/scraping : **Non trouvé** dans les extraits des conditions |
| Intégration MON STOCK | `SUPPLIER_ACCOUNT` (abonnement du vendeur) ; automatisation à confirmer par écrit avec Merkandi |
| Zone | Europe / monde |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 6.4 B-Stock — Europe, France, Amazon EU, Mobile

| Champ | Valeur vérifiée |
|---|---|
| Nom | B-Stock Solutions (storefronts Europe) |
| URL officielle | https://bstock.com/auctions/europe/ · https://bstock.com/auctions/france/ · Amazon EU : https://bstock.com/amazoneu/ (FAQ : /faq/ ; électronique : /consumer-electronics-computers/) · Mobile Carrier : https://bstock.com/auctions/mobile-carrier/ · Samsung Mobile : https://bstock.com/auctions/samsung-mobile/ · Terms : https://bstock.com/terms-of-use/ · Buyer T&C : https://bstock.com/b-stock-solutions-buyer-terms-and-conditions/ |
| Type | Enchères B2B de retours/surstocks (marketplaces dédiées par enseigne) |
| Catégories | Électronique, informatique, **mobiles trade-in grades A–D (Apple, Samsung, Google)**, lots mixtes |
| Prix | **Privé** (enchères après compte) ; Amazon EU : enchères en GBP ou EUR, **virement uniquement** |
| API | Non trouvé |
| Flux | Non trouvé |
| Compte | Oui — « business license and VAT number » ; Amazon EU : **n° TVA valide obligatoire**, candidatures EU & UK, aucun frais ; entrepôts UK/ES/SK/PL |
| CGU / accès automatisé | **Interdit** : « any robot, spider, scraper, data mining tool, data gathering or extraction tool, or any other automated means, to access, collect, copy or record the Services » (+ clauses similaires dans Supply et Buyer terms) |
| Intégration MON STOCK | `MANUAL` (le vendeur utilise ses alertes natives B-Stock ; aucune automatisation sans accord écrit → `PARTNER_FEED`) |
| Zone | EU / UK |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 6.5 Eurolots (sœur européenne de 888 Lots)

| Champ | Valeur vérifiée |
|---|---|
| Nom | Eurolots |
| URL officielle | https://www.eurolots.com/en · prix fixes : https://www.eurolots.com/en/fixed-price-lots · catégories : https://www.eurolots.com/en/lots?category=… |
| Type | Plateforme B2B liquidation / wholesale (lots et articles), expédition EU |
| Catégories | > 90 catégories dont électronique (neuf, reconditionné, retours) |
| Prix | **Privé** après validation |
| API / Flux | À vérifier |
| Compte | Oui — « company registration is mandatory », **revue manuelle** de chaque candidature |
| CGU / accès automatisé | À vérifier |
| Intégration MON STOCK | `SUPPLIER_ACCOUNT` |
| Zone / MOQ | EU ; **minimum 100 €** par commande |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 6.6 Wholesale Clearance UK

| Champ | Valeur vérifiée |
|---|---|
| Nom | Wholesale Clearance UK Ltd (Poole) |
| URL officielle | https://www.wholesaleclearance.co.uk/ · CGV : https://www.wholesaleclearance.co.uk/terms-conditions_3.htm · conditions site : https://www.wholesaleclearance.co.uk/website-user-terms-and-conditions.htm · électronique : https://www.wholesaleclearance.co.uk/electrical__5.htm |
| Type | Déstockage / stocks de faillite, palettes et lots ; depuis 2005 |
| Prix | **Public** ; achats « B2B basis » (pas de protection consommateur) ; paiement intégral avant expédition |
| API / Flux | Non |
| Compte | Pas de société/TVA requise, mais achat réputé professionnel |
| CGU / accès automatisé | **Interdit** : « automated software, process, program, robot, web crawler, spider, data mining, trawling or 'screen scraping' software » |
| Intégration MON STOCK | `MANUAL` |
| Zone | UK (import FR : droits/TVA post-Brexit à prévoir) |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 6.7 Gem Wholesale

| Champ | Valeur vérifiée |
|---|---|
| Nom | Gem Wholesale (Gem Discounts Ltd) |
| URL officielle | https://www.gemwholesale.co.uk/ · CGV : https://www.gemwholesale.co.uk/acatalog/info.html · électrique : https://www.gemwholesale.co.uk/acatalog/Electrical.html · FAQ : https://www.gemwholesale.co.uk/faq.html |
| Type | Grossiste de retours ex-catalogue / clearance (palettes, conteneurs) |
| Catégories | Électrique : luminaires, petit électroménager, aspirateurs, électronique domestique (peu de smartphones) |
| Prix | **Public HT** ; « minimum order value of £250 (+VAT) » ; virement avant expédition ; « as is », ventes finales |
| API / Flux | Non |
| Compte | Trade only (B2B) |
| CGU / accès automatisé | Clause robots : Non trouvé |
| Intégration MON STOCK | `PUBLIC_WEB` avec prudence — faible pertinence pour le périmètre smartphones |
| Zone | UK |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 6.8 SoloStocks

| Champ | Valeur vérifiée |
|---|---|
| Nom | SoloStocks |
| URL officielle | https://www.solostocks.fr/ · https://www.solostocks.com/ |
| Type | Marketplace B2B généraliste (Espagne, 12 pays dont France) ; inscription préalable pour négocier avec les fournisseurs |
| Catégories | 6 000+ catégories dont téléphonie et informatique |
| Prix | Public sur annonces (selon vendeur) |
| API / Flux | Non trouvé |
| CGU / accès automatisé | Non trouvé (conditions non indexées) |
| Intégration MON STOCK | `PUBLIC_WEB` avec prudence — à ne pas automatiser avant lecture des CGU |
| Confiance | Partiel — 2026-10-07 |

---

## 7. Fiches détaillées — Brokers, marketplaces B2B avec API, plateformes US/Asie

### 7.1 BrokerBin

| Champ | Valeur vérifiée |
|---|---|
| URL officielle | https://brokerbin.com/ · adhésions : https://brokerbin.com/memberships · conditions : https://brokerbin.com/terms · https://brokerbin.com/legal |
| Type | Bourse B2B « members-only » IT lifecycle (ITAD/ITAM), > 10 000 membres, 65 pays |
| Catégories | Pièces et systèmes IT neufs, used, refurbished (télécom/réseau inclus ; smartphones : marginal) |
| Prix | **Privé** — plans **Standard 1 599 $/an (≤ 100 références), Platinum 2 214 $, Premier 3 198 $, Bold Premier 3 750 $** ; vérification par un account manager |
| API / Flux | Non trouvé |
| CGU / accès automatisé | **Interdit** : « mining, harvesting, or scripting any data » ; « robot, spider, scraper, or other automated means… without express written permission » |
| Intégration MON STOCK | `MANUAL` |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 7.2 gsmExchange

| Champ | Valeur vérifiée |
|---|---|
| URL officielle | https://www.gsmexchange.com/ · critères : https://www.gsmexchange.com/en/membership · inscription : https://www.gsmexchange.com/registration.en.html · conditions : https://www.gsmexchange.com/en/terms |
| Type | Bourse B2B mobile (Dublin, depuis 2000), marché fermé et vérifié |
| Catégories | Smartphones et accessoires en gros |
| Prix | **Privé** (membres ; offres/demandes en temps réel pour les Premium) ; frais de transaction sur le « trading floor » |
| Compte | Critères stricts : **100–500 terminaux minimum par transaction**, > 1 an d'expérience internationale en gros, **2 références commerciales**, preuve d'immatriculation/TVA |
| CGU / accès automatisé | **Interdit** : « systematic retrieval of site content… through robots, spiders, automatic devices or manual processes » ; partage d'identifiants = résiliation |
| Intégration MON STOCK | `MANUAL` |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 7.3 Handelot

| Champ | Valeur vérifiée |
|---|---|
| URL officielle | https://www.handelot.com/ · news : https://www.handelot.com/news/index · success stories : https://www.handelot.com/es/success/ |
| Type | Plateforme de trading B2B électronique de marque (> 4 500 sociétés) ; Wrocław (PL) / Handelot FZC |
| Catégories | Mobiles, tablettes, consoles, caméras, TV, accessoires, pièces, IT (neuf et occasion) |
| Prix | **Privé** — niveaux VIP, VIP Gold (vérifié par assureur), Junior (accès limité) ; tarif d'adhésion : Non trouvé |
| Compte | **2 références commerciales**, documents société, > 1 an d'activité ; statut « wholesale » ≥ 70 000 € de transactions sur 6 mois |
| API / Flux | Non trouvé |
| CGU / accès automatisé | Non trouvé |
| Intégration MON STOCK | `SUPPLIER_ACCOUNT` / `MANUAL` |
| Confiance | Partiel — 2026-10-07 |

### 7.4 Amazon Business (France)

| Champ | Valeur vérifiée |
|---|---|
| URL officielle | https://business.amazon.fr/ · aide compte : https://www.amazon.fr/gp/help/customer/display.html?nodeId=G201633340 · conditions Business : https://www.amazon.fr/gp/help/customer/display.html?nodeId=202119380 · CGU/CGV : https://www.amazon.fr/gp/help/customer/display.html?nodeId=GLSBYFE9MGKKQXXM · API : https://developer-docs.amazon.com/amazon-business/docs/product-search-api-overview · onboarding : https://developer-docs.amazon.com/amazon-business/docs/onboarding-overview |
| Type | Marketplace B2B |
| Prix | Après compte Business gratuit et **vérifié** (SIRET/TVA, vérification manuelle jusqu'à 24 h) ; « business-only price savings » |
| API | **Oui, sur approbation** : **Product Search API** (`searchProducts`, produits par ASIN, offres, `getProductsByAsins` ≤ 30 ASIN), Reporting API, User Management ; **questionnaire d'onboarding** (société, modèle, régions, API) ; **rôles attribués par l'équipe Amazon Business**, non auto-sélectionnables ; Punchout pour e-procurement |
| Flux | Non |
| CGU / accès automatisé | **Interdit** sans consentement écrit : « data mining, robots, or similar data gathering and extraction tools » ; interdiction de créer « votre propre base de données contenant des parties substantielles (telles que les prix) » |
| Intégration MON STOCK | `API` (si MON STOCK est approuvé comme solution provider) ; sinon `SUPPLIER_ACCOUNT` sans automatisation |
| Zone / TVA | France / EU ; HT via n° TVA |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 7.5 eBay — Browse API

| Champ | Valeur vérifiée |
|---|---|
| URL officielle | https://developer.ebay.com/api-docs/buy/browse/overview.html · prérequis Buy APIs : https://developer.ebay.com/api-docs/buy/static/buy-requirements.html · licence : https://developer.ebay.com/join/api-license-agreement · limites : https://developer.ebay.com/develop/get-started/api-call-limits · CGU eBay.fr : https://www.ebay.fr/help/policies/member-behavior-policies/conditions-dutilisation-des-services-debayfr?id=4259 · robots.txt : https://www.ebay.com/robots.txt |
| Type | Marketplace ; catégories lots/wholesale : À vérifier |
| Prix | **Public** |
| API | **Oui** : Browse API (recherche par mot-clé, catégorie, GTIN, image ; token applicatif) — **limite par défaut 5 000 appels/jour** ; **Buy APIs en « Limited Release »** : accès production réservé aux partenaires via candidature **eBay Partner Network** + « Application Growth Check », « no guarantee » d'approbation |
| CGU / accès automatisé | **Interdit** hors API : robots, spiders, scrapers, data mining ; robots.txt : accès automatisé interdit sauf moteurs de recherche ; licence API interdit la « market research » et le contournement des limites |
| Intégration MON STOCK | `API` (après approbation EPN) ; aucun scraping HTML |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 7.6 BigBuy

| Champ | Valeur vérifiée |
|---|---|
| URL officielle | https://www.bigbuy.eu/fr/ · API : https://www.bigbuy.eu/fr/api_bigbuy.html · doc : https://api.bigbuy.eu/rest/doc (sandbox : https://api.sandbox.bigbuy.eu) · CSV/XML : https://www.bigbuy.eu/en/csv-xml-files.html · packs : https://www.bigbuy.eu/en/wholesaler-packs.html · taxes : https://www.bigbuy.eu/en/taxes.html · conditions : https://www.bigbuy.eu/fr/conditions-du-S-A-V.html |
| Type | Grossiste / dropshipping B2B européen (Espagne) ; catalogue 24 langues |
| Catégories | 20+ catégories dont électronique et IT ; présence de smartphones de marque : **À vérifier** |
| Prix | Prix distributeur **HT** ; **exonération TVA intracommunautaire si n° TVA valide (VIES)** ; visibilité avant compte : À vérifier |
| API | **Oui** : REST/JSON (catalogue, commandes, transporteurs, tracking), clé API sur demande ; **réservée aux packs Ecommerce ou supérieurs** (payants, tarif non capturé → À vérifier) |
| Flux | **Oui** : CSV/XML (code, EAN, nom, description, prix distributeur, PVC, stock, 8 images, dates) ; **FTP** sur demande pour packs Ecommerce/Marketplaces |
| Compte | Oui (pro, n° TVA pour l'exonération) |
| CGU / accès automatisé | Clause scraping : Non trouvé (l'API/FTP est la voie officielle) |
| Intégration MON STOCK | `API` + `FEED` (pack souscrit par le vendeur ou par MON STOCK) |
| Fréquence MAJ | Synchronisation catalogue/stock/prix via API et fichiers (fréquence exacte : À vérifier) |
| MOQ | Dropshipping sans minimum (« minimum order of €0.01 ») |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 7.7 CdiscountPro

| Champ | Valeur vérifiée |
|---|---|
| URL officielle | https://www.cdiscountpro.com/ · https://quotation.cdiscount.com/ · smartphones : https://www.cdiscountpro.com/telephonie/telephone-mobile/smartphones/l-1440402.html |
| Type | Site d'achats pour professionnels et administrations (13 catégories, > 100 000 références, > 90 % en stock) |
| Prix | **Public, affiché HT** ; paiement CB, virement, **virement différé 30 jours**, mandat administratif ; devis ; livraison marque blanche |
| API / Flux | Non trouvé |
| CGU / accès automatisé | À vérifier |
| Intégration MON STOCK | `PUBLIC_WEB` (prudence : CGU non lues) ; attention, prix de détail pro, pas de prix de gros |
| Confiance | Partiel — 2026-10-07 |

### 7.8 Alibaba.com

| Champ | Valeur vérifiée |
|---|---|
| URL officielle | https://www.alibaba.com/ · Open Platform : https://openapi.alibaba.com/doc/doc.htm · référence API : https://openapi.alibaba.com/doc/api.htm · inscription dev : https://activity.alibaba.com/pc/developer.html · CGU : https://terms.alicdn.com/legal-agreement/terms/platform_service/20230224145817207/20230224145817207.html |
| Type | Marketplace B2B (fabricants/fournisseurs) |
| Prix | Fourchettes indicatives sur fiches (MOQ) ; prix réels **négociés** |
| API | **Oui, sur approbation** : inscription développeur (App key/secret), autorisation OAuth, > 20 endpoints JSON/XML ; « buyer sourcing solution » ; accès « scoped to approved business partners » |
| CGU / accès automatisé | **Interdit** : « Systematic retrieval of Site Content… (whether through robots, spiders, automatic devices or manual processes) without written permission » |
| Intégration MON STOCK | `API` (si accès accordé) ; sinon `MANUAL` |
| Zone / MOQ | Asie / monde ; MOQ par fournisseur ; import hors UE (droits, conformité CE) |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 7.9 Global Sources

| Champ | Valeur vérifiée |
|---|---|
| URL officielle | https://www.globalsources.com/ · inscription : https://www.globalsources.com/member/register · CGU : https://www.globalsources.com/STM/help-faq/en/terms-of-use/ · électronique : https://www.globalsources.com/consumer-electronics/ |
| Type | Plateforme B2B de sourcing (Hong Kong), fournisseurs vérifiés (D&B, Experian, TÜV SÜD) |
| Prix | Sur demande (inquiries) ; inscription gratuite (e-mail, nom, société, pays) |
| API / Flux | Non trouvé |
| CGU / accès automatisé | Usage limité à des « non-substantial portions… for personal or internal and non-commercial purposes » ; toute reproduction/réutilisation interdite sans permission écrite ; clause robots explicite : Non trouvé |
| Intégration MON STOCK | `MANUAL` |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 7.10 Liquidation.com (US)

| Champ | Valeur vérifiée |
|---|---|
| URL officielle | https://www.liquidation.com/ · FAQ acheteur : https://www.liquidation.com/c/buyer/index.html · User Agreement : https://www.liquidation.com/c/user-agreement |
| Type | Enchères de surplus/retours (Liquidity Services) |
| Compte | Gratuit ; certificat de revente pour l'exonération de taxe US ; **acheteurs internationaux : virement uniquement** |
| CGU / accès automatisé | **Interdit** : « spiders, crawlers, robots or any other similar means… data-mining » |
| Intégration MON STOCK | `MANUAL` ; priorité basse (US, logistique export à la charge de l'acheteur) |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 7.11 Direct Liquidation (US)

| Champ | Valeur vérifiée |
|---|---|
| URL officielle | https://www.directliquidation.com/ · FAQ : https://help.directliquidation.com/hc/en-us/categories/360002663212-Buyer-s-FAQ · conditions : https://www.directliquidation.com/terms |
| Type | Marketplace enchères/prix fixes de liquidation (division The Recon Group) |
| Compte | Nom, e-mail, téléphone, société ; **pas d'expédition internationale gérée** (« Arrange my own shipping », courtier en douane ; conteneurs via équipe truckload) |
| CGU / accès automatisé | **Interdit** : « robot, spider, data miner, wanderer, crawler or any other automatic or manual device or process to copy or monitor » |
| Intégration MON STOCK | `MANUAL` ; priorité basse |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 7.12 Via Trading (US)

| Champ | Valeur vérifiée |
|---|---|
| URL officielle | https://www.viatrading.com/ · FAQ : https://www.viatrading.com/how-it-works/faq-center · conditions : https://www.viatrading.com/terms |
| Type | Grossiste de liquidation (Californie, Floride), export conteneurs |
| Prix | **Public** ; « no membership fee and no minimum dollar order » ; minimum **un carton, une palette ou un camion** ; aucune licence/société requise |
| CGU / accès automatisé | **Interdit** sans permission écrite : « automated tools to scrape, copy or download listings, manifests, images or pricing » ; interdiction de republier les manifestes |
| Intégration MON STOCK | `MANUAL` ; priorité basse |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

### 7.13 888 Lots (US)

| Champ | Valeur vérifiée |
|---|---|
| URL officielle | https://888lots.com/ · FAQ : https://888lots.com/pages/faq |
| Type | Plateforme B2B liquidation (New Jersey) |
| Compte | Certificat de revente US ; **« does not accept international customers »** → plateformes sœurs **eurolots.com**, britdeals.co.uk, 888lots.ca, miamilots.com |
| Intégration MON STOCK | Non applicable pour la France → voir Eurolots (6.5) |
| Confiance | Vérifié (extraits officiels) — 2026-10-07 |

---

## 8. Sources écartées ou non vérifiables

| Candidat | Statut | Raison |
|---|---|---|
| BULQ (Optoro) | **Fermé** | Arrêt du marketplace le 28/07/2025 (source presse valueaddedresource.net ; site officiel non consulté) |
| Likewize (ex-Brightstar) | Écarté (sourcing) | Portails officiels trouvés = **trade-in / reprise** (https://appleb2bonlinefra.likewize.com/ « Apple Business Exchange Program », ≥ 10 appareils, toute entreprise avec n° TVA) et portail partenaires (https://partners.likewize.com/). Pas de plateforme ouverte d'achat de stock trouvée → utile côté **reprise**, pas côté sourcing |
| Prodealee, HEM France, Recondigo, WT S.A, DBC Electronics, Repargsm | Non vérifié | Cités par un agrégateur ; site officiel/conditions non confirmés → à qualifier manuellement avant toute intégration |
| Nestor, Gesten, Panda Stock, Alloallo, Refurb-exchange, Techforum, Stockbuzz, Stocklots.fr | Non vérifié | Aucune page officielle trouvée correspondant à ces noms dans le périmètre électronique |
| Kooomo | Hors sujet | Plateforme e-commerce (SaaS), pas un fournisseur |
| SPAR | Hors sujet | Distribution alimentaire |
| Ankorstore, Faire | Hors périmètre | Marketplaces wholesale orientées lifestyle/déco, pas électronique |
| Veepee, Showroomprivé | Hors sujet | Ventes flash B2C |
| Rakuten, Fnac Darty marketplace, Cdiscount marketplace | Hors sujet | Canaux de **vente**, pas de sourcing (CdiscountPro traité en 7.7) |
| Phone House / Ingram Micro Mobility | Fusionné | Couvert par Ingram Micro (5.1) |
| ALSO Cloud Marketplace | Hors périmètre | Cloud/SaaS, pas de matériel (mentionné en 5.3) |
| 1688.com | Non vérifié | Plateforme chinoise domestique, non vérifiable ici ; hors périmètre initial |
| Walmart Liquidation Auctions, autres storefronts B-Stock US | Hors zone | US uniquement |

---

## 9. Feuille de route d'intégration priorisée

Principe : **« 10 vraies sources bien intégrées plutôt que 500 fictives »**. Chaque source entre en production uniquement après (a) lecture intégrale des CGU/robots.txt, (b) accord écrit ou canal officiel (API/flux), (c) connexion du compte par le vendeur lui-même.

### Phase 1 (0–3 mois) — canaux officiels, valeur immédiate pour smartphones/IT

| Ordre | Source | Mode | Pourquoi d'abord | Pré-requis |
|---|---|---|---|---|
| 1 | **Ingram Micro** | `API` (Reseller API v6 : prix & dispo 50 SKU/appel) | API gratuite, documentée, SDK, temps réel, couverture IT + mobilité FR | Compte revendeur du vendeur + Partner ID ; demande d'accès API |
| 2 | **TD SYNNEX** | `API` (Digital Bridge EU : catalogue, prix, dispo) | Portail dev EU, sandbox, 150 000 produits | Compte FR (Kbis, RIB, DBE-S1…) ; clés sandbox → prod |
| 3 | **BigBuy** | `API` + `FEED` CSV/XML | Flux structurés (EAN, prix distributeur, stock), exonération TVA VIES | Pack Ecommerce (payant) ; vérifier la profondeur smartphones |
| 4 | **Amazon Business** | `API` Product Search (sur approbation) | Référentiel ASIN, prix pro | Questionnaire d'onboarding + rôles accordés ; sinon aucune automatisation |
| 5 | **eBay Browse API** | `API` (sur approbation EPN) | Prix publics, GTIN, lots ; 5 000 appels/jour | Candidature EPN + Growth Check ; zéro scraping HTML en attendant |

### Phase 2 (3–6 mois) — distributeurs à flux et reconditionné B2B

| Ordre | Source | Mode | Pré-requis / point d'attention |
|---|---|---|---|
| 6 | **ALSO France** | `FEED` SFTP listes de prix + EDI XML | Confirmer l'offre SFTP pour la filiale FR |
| 7 | **Exertis France** | `FEED` PriceCAT + EDI | Format/fréquence du feed à obtenir de l'account manager |
| 8 | **Foxway Reseller Store** | `SUPPLIER_ACCOUNT` → demander export/API | Vérifier existence d'un feed partenaire ; sinon saisie assistée |
| 9 | **Largo extranet** | `SUPPLIER_ACCOUNT` → `PARTNER_FEED` | Négocier un export stock (temps réel annoncé) |
| 10 | **KOMSA / Brodos** | `API` + EDI | Uniquement si livraison France confirmée (tarifs/TVA intracom) |
| 11 | **Westcoast** | `API` XML Portal | UK ; pertinent pour vendeurs expédiant depuis/vers le UK |

### Phase 3 (6–12 mois) — déstockage et lots (valeur élevée, friction élevée)

| Source | Mode | Point bloquant |
|---|---|---|
| **Stocklear** | `SUPPLIER_ACCOUNT` (alertes d'enchères) | Compte validé Kbis ; automatisation à confirmer par écrit |
| **Merkandi** | `SUPPLIER_ACCOUNT` (abonnement 239–279 €/an) | Pas d'API ; demander accord écrit avant tout traitement automatisé |
| **Eurolots** | `SUPPLIER_ACCOUNT` | Revue manuelle du compte ; API À vérifier |
| **Destockplus** | `PUBLIC_WEB` prudent | Annonces hétérogènes, prix souvent « sur demande » ; lire robots.txt |
| **refurbed Business** | `MANUAL` (devis ≥ 15 unités) | Pas de portail de commande |

### Bloqué en l'état (pas d'automatisation possible) — pourquoi

| Source | Raison | Alternative |
|---|---|---|
| B-Stock (Europe / Amazon EU) | CGU interdisent explicitement robots/scrapers et toute collecte automatisée | Alertes natives dans le compte du vendeur ; demander un partenariat data (`PARTNER_FEED`) |
| BrokerBin, gsmExchange | Communautés fermées, scraping interdit, adhésions payantes/sélectives | Usage manuel par le vendeur membre |
| Back Market (site public) | CGU interdisent le web scraping ; pas d'API acheteur | Compte Back Market Pro du vendeur ; demander un canal B2B data |
| Wholesale Clearance UK, Via Trading, Liquidation.com, Direct Liquidation | Clauses anti-scraping explicites ; US/UK | Consultation manuelle ; faible priorité géographique |
| Alibaba.com, Global Sources | Accès API sur approbation uniquement (Alibaba) ; CGU restrictives | Candidature Open Platform ; sinon manuel |
| Handelot, Recommerce, Smaaart, AB Business | Informations d'accès incomplètes | Qualification commerciale directe |

### Questions ouvertes à confirmer avec chaque fournisseur

- **Ingram Micro / TD SYNNEX / ALSO / Exertis** : les identifiants API/flux peuvent-ils être utilisés par un tiers (MON STOCK) au nom du revendeur ? Fréquence de rafraîchissement, quotas, champs disponibles (EAN, grade, garantie) ?
- **BigBuy** : part réelle des smartphones de marque dans le catalogue ; tarif des packs ; fréquence de MAJ des fichiers.
- **Amazon Business / eBay** : MON STOCK est-il éligible comme « solution provider » / partenaire EPN ? Délais et critères.
- **Foxway / Largo** : existe-t-il un export (CSV/API) du stock temps réel pour les revendeurs ? Conditions de livraison France, garantie, MOQ.
- **Stocklear / Merkandi / Eurolots** : position écrite sur l'accès automatisé via le compte du vendeur ; existence d'alertes/webhooks.
- **KOMSA / Brodos / Westcoast** : livraison et facturation intracommunautaire vers la France ; langue/format des flux.
- **B-Stock** : programme partenaire data ou API privée pour acheteurs approuvés ?
- **refurbed** : portail business pour la France ; grille de remise B2B.
- **Toutes** : contenu de `robots.txt` (non lisible depuis l'environnement d'analyse) et test de résolution HTTP des URL listées.

---

## 10. Résumé

Trente-cinq sources ont été documentées à partir de leurs pages officielles (vérification par extraits indexés, les requêtes HTTP directes étant bloquées dans l'environnement d'analyse) : **29 sont « vérifiées (extraits officiels) »** sur les champs clés (accès, compte, API/flux, clauses) et **6 sont « partielles »** (Recommerce, Smaaart, AB Business, SoloStocks, Handelot, CdiscountPro) ; une vingtaine de candidats ont été écartés comme fermés (BULQ), hors sujet ou non vérifiables (Nestor, Gesten, Panda Stock, Refurb-exchange, Techforum…). Le constat central : les seules voies d'automatisation légitimes et durables sont les **API/flux des distributeurs IT** (Ingram Micro, TD SYNNEX, ALSO, Exertis, Westcoast, KOMSA, Brodos), les **flux grossistes** (BigBuy) et les **API de marketplaces sous approbation** (Amazon Business, eBay, Alibaba) ; les plateformes de liquidation et les bourses B2B (B-Stock, BrokerBin, gsmExchange, Liquidation.com, Via Trading, Wholesale Clearance UK) interdisent explicitement tout accès automatisé et doivent rester en mode compte-vendeur/manuel, tandis que le reconditionné B2B français (Foxway, Largo, Back Market Pro, Stocklear) passe par un **compte connecté par le vendeur**, avec un partenariat data à négocier pour aller plus loin.

---

## 11. Tableau de synthèse 12 colonnes (dérivé du catalogue)

Généré depuis `src/integrations/sourcing/catalog.ts` (`catalogTableRow()`), état des fiches au 2026-10-07. Aucune page n'a été ouverte : « À vérifier (réseau bloqué) » signale un champ que les extraits officiels n'ont pas permis de trancher ; « Après connexion » = prix réservés aux comptes ; « Interdite par les CGU » = clause anti-robots citée dans la fiche ; « Oui (canal officiel) » = automatisation documentée via API/flux officiel uniquement. La colonne STATUT reprend la confiance de la fiche (`verified_official_snippets` / `partial`), pas le résultat d'une vérification HTTP (voir `docs/sourcing-sources-verification.md`).

| SOURCE | URL | CATÉGORIE | PAYS | PRIX PUBLIC ? | COMPTE NÉCESSAIRE ? | API ? | CSV/XML ? | STOCK VISIBLE ? | AUTOMATISATION POSSIBLE ? | MÉTHODE D'INTÉGRATION | STATUT |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Back Market Pro | https://pro.backmarket.fr/ | smartphones, laptops, tablettes, accessoires | FR / UK / US | À vérifier (réseau bloqué) | Oui | Non | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | Interdite par les CGU | `SUPPLIER_ACCOUNT` | Vérifié (extraits officiels) |
| Foxway (Reseller Store + Wholesale) | https://resellers.foxway.com/ | smartphones, tablettes, laptops, wearables, accessoires | EU (Wholesale : ex-works UK) | Après connexion | Oui | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | Oui | À vérifier (réseau bloqué) | `SUPPLIER_ACCOUNT` | Vérifié (extraits officiels) |
| refurbed Business | https://business.refurbed.de/ | smartphones, laptops, tablettes, écrans | DE / AT (+ IE) ; FR : À vérifier | Oui | Oui | À vérifier (réseau bloqué) | Non | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | `MANUAL` | Vérifié (extraits officiels) |
| Largo (Largo Business) | https://www.largo.fr/ | smartphones, tablettes, ordinateurs, accessoires | FR / BE / CH | Après connexion | Oui | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | Oui | À vérifier (réseau bloqué) | `SUPPLIER_ACCOUNT` | Vérifié (extraits officiels) |
| Recommerce | https://www.recommerce.com/fr/ | smartphones | EU (20 pays) | Non | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | `PARTNER_FEED` | Partiel |
| SMAAART | https://smaaart.fr/ | smartphones, ordinateurs, tablettes | FR | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | `MANUAL` | Partiel |
| AB Business | https://www.abbusiness.fr/ | smartphones, tablettes, accessoires | FR | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | `SUPPLIER_ACCOUNT` | Partiel |
| Ingram Micro France | https://fr.ingrammicro.eu/ | informatique, mobilité, accessoires | FR | Après connexion | Oui | Oui | À vérifier (réseau bloqué) | Oui | Oui (canal officiel) | `API` | Vérifié (extraits officiels) |
| TD SYNNEX France | https://fr.tdsynnex.com/ | informatique | FR / EU | Après connexion | Oui | Oui | À vérifier (réseau bloqué) | Oui | Oui (canal officiel) | `API` | Vérifié (extraits officiels) |
| ALSO France | https://www.also.com/ec/cms5/fr_2000/2000/ | informatique | FR / EU | Après connexion | Oui | Oui | Oui | Oui | Oui (canal officiel) | `FEED` | Vérifié (extraits officiels) |
| Exertis France | https://www.exertis.fr/ | informatique, gaming, mobilité, audio-vidéo | FR | Après connexion | Oui | Oui | Oui | À vérifier (réseau bloqué) | Oui (canal officiel) | `FEED` | Vérifié (extraits officiels) |
| Westcoast | https://www.westcoast.co.uk/ | informatique, composants | UK (FR : À vérifier) | Après connexion | Oui | Oui | Oui | Oui | Oui (canal officiel) | `API` | Vérifié (extraits officiels) |
| KOMSA | https://komsa.com/ | smartphones, accessoires, informatique | DE (FR : À vérifier) | Après connexion | Oui | Oui | Oui | Oui | Oui (canal officiel) | `API` | Vérifié (extraits officiels) |
| Brodos AG | https://brodos.com/ | smartphones, tablettes, accessoires | DE (intl. possible) | Après connexion | Oui | Oui | Oui | À vérifier (réseau bloqué) | Oui (canal officiel) | `API` | Vérifié (extraits officiels) |
| Stocklear | https://stocklear.fr/ | retours clients, invendus, téléphonie | FR (+ EU) | Après connexion | Oui | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | `SUPPLIER_ACCOUNT` | Vérifié (extraits officiels) |
| Destockplus | https://www.destockplus.com/ | lots, téléphonie, déstockage | FR | Oui | Non | Non | Non | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | `PUBLIC_WEB` | Vérifié (extraits officiels) |
| Merkandi | https://merkandi.fr/ | surstocks, retours, reconditionné, électronique | EU / monde | Après connexion | Oui | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | `SUPPLIER_ACCOUNT` | Vérifié (extraits officiels) |
| B-Stock (Europe / Amazon EU / France) | https://bstock.com/auctions/europe/ | électronique, mobiles (grades A–D), retours Amazon | EU / UK | Après connexion | Oui | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | Interdite par les CGU | `MANUAL` | Vérifié (extraits officiels) |
| Eurolots | https://www.eurolots.com/en | électronique, lots mixtes | EU | Après connexion | Oui | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | `SUPPLIER_ACCOUNT` | Vérifié (extraits officiels) |
| Wholesale Clearance UK | https://www.wholesaleclearance.co.uk/ | électronique, lots, déstockage | UK | Oui | Non | Non | Non | À vérifier (réseau bloqué) | Interdite par les CGU | `MANUAL` | Vérifié (extraits officiels) |
| Gem Wholesale | https://www.gemwholesale.co.uk/ | électroménager, électronique domestique | UK | Oui | À vérifier (réseau bloqué) | Non | Non | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | `PUBLIC_WEB` | Vérifié (extraits officiels) |
| SoloStocks | https://www.solostocks.fr/ | téléphonie, informatique, multi-secteurs | ES / FR / EU / LATAM | Oui | Oui | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | `PUBLIC_WEB` | Partiel |
| BrokerBin | https://brokerbin.com/ | pièces IT, systèmes IT, télécom/réseau | Monde | Après connexion | Oui | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | Interdite par les CGU | `MANUAL` | Vérifié (extraits officiels) |
| gsmExchange | https://www.gsmexchange.com/ | smartphones en gros, accessoires | Monde (Dublin) | Après connexion | Oui | Non | Non | À vérifier (réseau bloqué) | Interdite par les CGU | `MANUAL` | Vérifié (extraits officiels) |
| Handelot | https://www.handelot.com/ | mobiles, tablettes, consoles, TV, informatique | Monde (Pologne) | Après connexion | Oui | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | `SUPPLIER_ACCOUNT` | Partiel |
| Amazon Business (FR) | https://business.amazon.fr/ | smartphones, informatique, tout | FR / EU | Après connexion | Oui | Oui | Non | À vérifier (réseau bloqué) | Interdite par les CGU | `API` | Vérifié (extraits officiels) |
| eBay (Browse API) | https://developer.ebay.com/api-docs/buy/browse/overview.html | smartphones, lots, tout | FR / EU / monde | Oui | Non | Oui | Non | À vérifier (réseau bloqué) | Interdite par les CGU | `API` | Vérifié (extraits officiels) |
| BigBuy | https://www.bigbuy.eu/fr/ | électronique, informatique, accessoires | EU (Espagne) | À vérifier (réseau bloqué) | Oui | Oui | Oui | Oui | Oui (canal officiel) | `API` | Vérifié (extraits officiels) |
| CdiscountPro | https://www.cdiscountpro.com/ | informatique, téléphonie | FR | Oui | Non | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | `PUBLIC_WEB` | Partiel |
| Alibaba.com | https://www.alibaba.com/ | électronique, tout | Asie / monde | Oui | Non | Oui | Non | À vérifier (réseau bloqué) | Interdite par les CGU | `API` | Vérifié (extraits officiels) |
| Global Sources | https://www.globalsources.com/ | électronique grand public, mobile | Asie / monde (Hong Kong) | Non | Oui | À vérifier (réseau bloqué) | Non | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | `MANUAL` | Vérifié (extraits officiels) |
| Liquidation.com | https://www.liquidation.com/ | électronique, mobiles, retours | US | Après connexion | Oui | Non | Non | À vérifier (réseau bloqué) | Interdite par les CGU | `MANUAL` | Vérifié (extraits officiels) |
| Direct Liquidation | https://www.directliquidation.com/ | électronique, retours | US | Après connexion | Oui | Non | Non | À vérifier (réseau bloqué) | Interdite par les CGU | `MANUAL` | Vérifié (extraits officiels) |
| Via Trading | https://www.viatrading.com/ | électronique, retours | US (export) | Oui | Non | Non | Non | À vérifier (réseau bloqué) | Interdite par les CGU | `MANUAL` | Vérifié (extraits officiels) |
| 888 Lots | https://888lots.com/ | électronique, mobiles | US uniquement | Après connexion | Oui | Non | Non | À vérifier (réseau bloqué) | À vérifier (réseau bloqué) | `NOT_INTEGRABLE` | Vérifié (extraits officiels) |

Comptage (`catalogSummary()`) : 35 sources · 29 vérifiées (extraits officiels) · 6 partielles · 0 non vérifiée (les candidats non vérifiables sont listés en section 8 et absents du catalogue) · prix publics sans connexion : 9 · compte nécessaire : 25 · API ou flux documenté : 11 · non intégrable : 1 (888 Lots). Par classe : API 9, FEED 2, SUPPLIER_ACCOUNT 8, PARTNER_FEED 1, PUBLIC_WEB 4, MANUAL 10, NOT_INTEGRABLE 1.
