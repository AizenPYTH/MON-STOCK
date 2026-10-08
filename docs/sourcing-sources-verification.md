# Vérification HTTP des sources d'approvisionnement — MON STOCK

> ⚠️ **VÉRIFICATION NON EXÉCUTÉE : réseau indisponible depuis cet environnement.**
>
> Toutes les requêtes sortantes ont été refusées par le proxy de sortie de l'environnement d'exécution
> (réponse `403` « Host not in allowlist » avant d'atteindre le site). Aucune page, aucun `robots.txt` et
> aucun point d'entrée public n'a pu être consulté : **aucune ligne ci-dessous ne constitue une observation**.
> Les colonnes marquées « (catalogue) » reprennent uniquement les fiches issues des extraits officiels du 2026-10-07.
>
> **À faire** : relancer `npm run sources:verify` depuis une machine disposant d'un accès réseau, puis
> relire le rapport avant toute décision d'intégration.

- Exécuté le : 2026-10-08T15:45:56.071Z
- User-Agent : `MonStockBot/0.1 (+contact)` (jeton robots.txt : `monstockbot`)
- Politesse : 2 s minimum entre deux requêtes par hôte, délai d'attente 15 s, 5 redirections max, aucune nouvelle tentative, aucun identifiant, aucun contournement.
- Sondes publiques : `/products.json?limit=1` (si Shopify détecté) et `/wp-json/wc/store/v1/products?per_page=1` (si WooCommerce détecté), uniquement lorsque robots.txt autorise le chemin.
- « Prix visible sans connexion » n'est noté **Oui** que si un prix JSON-LD / Shopify / WooCommerce a réellement été retourné.
- Source des colonnes « (catalogue) » : `src/integrations/sourcing/catalog.ts` (non observable par une sonde HTTP : compte, API, méthode d'intégration).

## Tableau de vérification

| SOURCE | URL | CATÉGORIE | PAYS | PRIX PUBLIC ? | COMPTE NÉCESSAIRE ? | API ? | CSV/XML ? | STOCK VISIBLE ? | AUTOMATISATION POSSIBLE ? | MÉTHODE D'INTÉGRATION | STATUT |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Back Market Pro | https://pro.backmarket.fr/ | smartphones, laptops, tablettes, accessoires | FR / UK / US | réseau indisponible depuis cet environnement | Oui (catalogue) | Non (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `SUPPLIER_ACCOUNT` | réseau indisponible depuis cet environnement |
| Foxway (Reseller Store + Wholesale) | https://resellers.foxway.com/ | smartphones, tablettes, laptops, wearables, accessoires | EU (Wholesale : ex-works UK) | réseau indisponible depuis cet environnement | Oui (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `SUPPLIER_ACCOUNT` | réseau indisponible depuis cet environnement |
| refurbed Business | https://business.refurbed.de/ | smartphones, laptops, tablettes, écrans | DE / AT (+ IE) ; FR : À vérifier | réseau indisponible depuis cet environnement | Oui (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `MANUAL` | réseau indisponible depuis cet environnement |
| Largo (Largo Business) | https://www.largo.fr/ | smartphones, tablettes, ordinateurs, accessoires | FR / BE / CH | réseau indisponible depuis cet environnement | Oui (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `SUPPLIER_ACCOUNT` | réseau indisponible depuis cet environnement |
| Recommerce | https://www.recommerce.com/fr/ | smartphones | EU (20 pays) | réseau indisponible depuis cet environnement | À vérifier (réseau bloqué) (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `PARTNER_FEED` | réseau indisponible depuis cet environnement |
| SMAAART | https://smaaart.fr/ | smartphones, ordinateurs, tablettes | FR | réseau indisponible depuis cet environnement | À vérifier (réseau bloqué) (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `MANUAL` | réseau indisponible depuis cet environnement |
| AB Business | https://www.abbusiness.fr/ | smartphones, tablettes, accessoires | FR | réseau indisponible depuis cet environnement | À vérifier (réseau bloqué) (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `SUPPLIER_ACCOUNT` | réseau indisponible depuis cet environnement |
| Ingram Micro France | https://fr.ingrammicro.eu/ | informatique, mobilité, accessoires | FR | réseau indisponible depuis cet environnement | Oui (catalogue) | Oui (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `API` | réseau indisponible depuis cet environnement |
| TD SYNNEX France | https://fr.tdsynnex.com/ | informatique | FR / EU | réseau indisponible depuis cet environnement | Oui (catalogue) | Oui (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `API` | réseau indisponible depuis cet environnement |
| ALSO France | https://www.also.com/ec/cms5/fr_2000/2000/ | informatique | FR / EU | réseau indisponible depuis cet environnement | Oui (catalogue) | Oui (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `FEED` | réseau indisponible depuis cet environnement |
| Exertis France | https://www.exertis.fr/ | informatique, gaming, mobilité, audio-vidéo | FR | réseau indisponible depuis cet environnement | Oui (catalogue) | Oui (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `FEED` | réseau indisponible depuis cet environnement |
| Westcoast | https://www.westcoast.co.uk/ | informatique, composants | UK (FR : À vérifier) | réseau indisponible depuis cet environnement | Oui (catalogue) | Oui (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `API` | réseau indisponible depuis cet environnement |
| KOMSA | https://komsa.com/ | smartphones, accessoires, informatique | DE (FR : À vérifier) | réseau indisponible depuis cet environnement | Oui (catalogue) | Oui (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `API` | réseau indisponible depuis cet environnement |
| Brodos AG | https://brodos.com/ | smartphones, tablettes, accessoires | DE (intl. possible) | réseau indisponible depuis cet environnement | Oui (catalogue) | Oui (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `API` | réseau indisponible depuis cet environnement |
| Stocklear | https://stocklear.fr/ | retours clients, invendus, téléphonie | FR (+ EU) | réseau indisponible depuis cet environnement | Oui (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `SUPPLIER_ACCOUNT` | réseau indisponible depuis cet environnement |
| Destockplus | https://www.destockplus.com/ | lots, téléphonie, déstockage | FR | réseau indisponible depuis cet environnement | Non (catalogue) | Non (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `PUBLIC_WEB` | réseau indisponible depuis cet environnement |
| Merkandi | https://merkandi.fr/ | surstocks, retours, reconditionné, électronique | EU / monde | réseau indisponible depuis cet environnement | Oui (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `SUPPLIER_ACCOUNT` | réseau indisponible depuis cet environnement |
| B-Stock (Europe / Amazon EU / France) | https://bstock.com/auctions/europe/ | électronique, mobiles (grades A–D), retours Amazon | EU / UK | réseau indisponible depuis cet environnement | Oui (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `MANUAL` | réseau indisponible depuis cet environnement |
| Eurolots | https://www.eurolots.com/en | électronique, lots mixtes | EU | réseau indisponible depuis cet environnement | Oui (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `SUPPLIER_ACCOUNT` | réseau indisponible depuis cet environnement |
| Wholesale Clearance UK | https://www.wholesaleclearance.co.uk/ | électronique, lots, déstockage | UK | réseau indisponible depuis cet environnement | Non (catalogue) | Non (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `MANUAL` | réseau indisponible depuis cet environnement |
| Gem Wholesale | https://www.gemwholesale.co.uk/ | électroménager, électronique domestique | UK | réseau indisponible depuis cet environnement | À vérifier (réseau bloqué) (catalogue) | Non (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `PUBLIC_WEB` | réseau indisponible depuis cet environnement |
| SoloStocks | https://www.solostocks.fr/ | téléphonie, informatique, multi-secteurs | ES / FR / EU / LATAM | réseau indisponible depuis cet environnement | Oui (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `PUBLIC_WEB` | réseau indisponible depuis cet environnement |
| BrokerBin | https://brokerbin.com/ | pièces IT, systèmes IT, télécom/réseau | Monde | réseau indisponible depuis cet environnement | Oui (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `MANUAL` | réseau indisponible depuis cet environnement |
| gsmExchange | https://www.gsmexchange.com/ | smartphones en gros, accessoires | Monde (Dublin) | réseau indisponible depuis cet environnement | Oui (catalogue) | Non (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `MANUAL` | réseau indisponible depuis cet environnement |
| Handelot | https://www.handelot.com/ | mobiles, tablettes, consoles, TV, informatique | Monde (Pologne) | réseau indisponible depuis cet environnement | Oui (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `SUPPLIER_ACCOUNT` | réseau indisponible depuis cet environnement |
| Amazon Business (FR) | https://business.amazon.fr/ | smartphones, informatique, tout | FR / EU | réseau indisponible depuis cet environnement | Oui (catalogue) | Oui (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `API` | réseau indisponible depuis cet environnement |
| eBay (Browse API) | https://developer.ebay.com/api-docs/buy/browse/overview.html | smartphones, lots, tout | FR / EU / monde | réseau indisponible depuis cet environnement | Non (catalogue) | Oui (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `API` | réseau indisponible depuis cet environnement |
| BigBuy | https://www.bigbuy.eu/fr/ | électronique, informatique, accessoires | EU (Espagne) | réseau indisponible depuis cet environnement | Oui (catalogue) | Oui (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `API` | réseau indisponible depuis cet environnement |
| CdiscountPro | https://www.cdiscountpro.com/ | informatique, téléphonie | FR | réseau indisponible depuis cet environnement | Non (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `PUBLIC_WEB` | réseau indisponible depuis cet environnement |
| Alibaba.com | https://www.alibaba.com/ | électronique, tout | Asie / monde | réseau indisponible depuis cet environnement | Non (catalogue) | Oui (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `API` | réseau indisponible depuis cet environnement |
| Global Sources | https://www.globalsources.com/ | électronique grand public, mobile | Asie / monde (Hong Kong) | réseau indisponible depuis cet environnement | Oui (catalogue) | À vérifier (réseau bloqué) (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `MANUAL` | réseau indisponible depuis cet environnement |
| Liquidation.com | https://www.liquidation.com/ | électronique, mobiles, retours | US | réseau indisponible depuis cet environnement | Oui (catalogue) | Non (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `MANUAL` | réseau indisponible depuis cet environnement |
| Direct Liquidation | https://www.directliquidation.com/ | électronique, retours | US | réseau indisponible depuis cet environnement | Oui (catalogue) | Non (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `MANUAL` | réseau indisponible depuis cet environnement |
| Via Trading | https://www.viatrading.com/ | électronique, retours | US (export) | réseau indisponible depuis cet environnement | Non (catalogue) | Non (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `MANUAL` | réseau indisponible depuis cet environnement |
| 888 Lots | https://888lots.com/ | électronique, mobiles | US uniquement | réseau indisponible depuis cet environnement | Oui (catalogue) | Non (catalogue) | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | réseau indisponible depuis cet environnement | `NOT_INTEGRABLE` | réseau indisponible depuis cet environnement |

## Détail par source

### Back Market Pro (`backmarket-pro`)

- URL officielle : https://pro.backmarket.fr/ (fiche 4.1 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Compte réservé aux professionnels (n° TVA intracommunautaire). Affichage des prix avant connexion : À vérifier. Flux CSV/XML : non trouvé. Volume : canal MANUAL (sourcing accompagné).
- CGU (catalogue) : CGU Back Market : interdiction des « software, devices, scripts, robots or any other means or process (including web crawlers…) » pour du web scraping. Pas d'API côté acheteur (API vendeur uniquement).

### Foxway (Reseller Store + Wholesale) (`foxway`)

- URL officielle : https://resellers.foxway.com/ (fiche 4.2 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : « Real-time prices and on-site checkout » après création de compte ; « real-time stock visibility ». Wholesale : deals « take-all » décrits dans un tableur (manuel), feed structuré À vérifier. API : À vérifier.
- CGU (catalogue) : CGV du Reseller Portal : compte requis, mot de passe strictement personnel. Clause scraping explicite : non trouvée.

### refurbed Business (`refurbed-business`)

- URL officielle : https://business.refurbed.de/ (fiche 4.3 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Prix B2C publics ; offre B2B sur devis par e-mail (MOQ 15 appareils identiques), pas de portail de commande automatisé trouvé. API : non trouvée. Portail business FR : À vérifier.
- CGU (catalogue) : AGB B2B : devis et listes de prix non contraignants. Clause scraping : non trouvée.

### Largo (Largo Business) (`largo`)

- URL officielle : https://www.largo.fr/ (fiche 4.4 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Extranet distributeurs : « accès en temps réel au stock disponible, saisie de commande simplifiée ». API et flux : À vérifier. Conditions exactes du compte (Kbis, validation) : À vérifier. PARTNER_FEED si Largo fournit un export.
- CGU (catalogue) : CGU / clause d'accès automatisé : non trouvées.

### Recommerce (`recommerce`)

- URL officielle : https://www.recommerce.com/fr/ (fiche 4.5 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Prix B2C publics sur recommerce.com ; B2B via distributeurs/opérateurs/partenariat, pas de portail ouvert trouvé. API / flux : non trouvés. Compte : À vérifier (contact commercial).
- CGU (catalogue) : CGU / clause d'accès automatisé : non trouvées.

### SMAAART (`smaaart`)

- URL officielle : https://smaaart.fr/ (fiche 4.6 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Prix B2C publics ; programme revendeurs / tarifs pro : À vérifier. API / flux : non trouvés. Alternative : PARTNER_FEED après qualification commerciale.

### AB Business (`ab-business`)

- URL officielle : https://www.abbusiness.fr/ (fiche 4.7 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Grossiste téléphonie (neuf + reconditionné). Visibilité des prix avant compte non confirmée ; conditions pro non trouvées ; API / flux non trouvés. SUPPLIER_ACCOUNT probable, à confirmer.
- CGU (catalogue) : CGU : À vérifier.

### Ingram Micro France (`ingram-micro-fr`)

- URL officielle : https://fr.ingrammicro.eu/ (fiche 5.1 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Reseller APIs v6 (catalogue, prix & disponibilité ≤ 50 SKU/appel, stock par entrepôt), sans frais, accès avec n° client / Partner ID. Listes de prix / EDI : À vérifier. Pièces d'ouverture de compte : À vérifier.
- CGU (catalogue) : Terms of Use couvrant les API : accès « solely within the applicable country for your account(s) », apps abusives révoquées. Pas de clause anti-scraping spécifique trouvée (l'API est la voie officielle).

### TD SYNNEX France (`td-synnex-fr`)

- URL officielle : https://fr.tdsynnex.com/ (fiche 5.2 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Developer Portal EU : REST APIs produits, prix, disponibilité, commandes ; sandbox, Swagger. Compte revendeur (RIB, Kbis < 3 mois, DBE-S1, n° TVA, SIRET…). EDI : probable, non confirmé.
- CGU (catalogue) : Via l'API officielle (Developer Portal). CGU hors API : À vérifier.

### ALSO France (`also-fr`)

- URL officielle : https://www.also.com/ec/cms5/fr_2000/2000/ (fiche 5.3 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Groupe : intégration XML/EDI (commande XML ou requête HTTP vers l'ERP), « SFTP price lists », contenu 1WorldSync quotidien. Disponibilité exacte pour la filiale France : À vérifier. Webshop : disponibilité et prix d'achat en temps réel après compte.
- CGU (catalogue) : Via flux SFTP / EDI-XML du groupe. CGV (section Documentation) : À vérifier.

### Exertis France (`exertis-fr`)

- URL officielle : https://www.exertis.fr/ (fiche 5.4 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : API = EDI (commandes). Flux PriceCAT : format exact À vérifier. Ouverture de compte : CGV signées, Kbis < 3 mois, RIB, papier en-tête, CNI du gérant.
- CGU (catalogue) : Via « PriceCAT feeds » et EDI (page web-services). CGU hors flux : À vérifier.

### Westcoast (`westcoast-uk`)

- URL officielle : https://www.westcoast.co.uk/ (fiche 5.5 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : « XML Portal » (stock, prix, commandes) ; feed par marque configurable par l'account manager. Compte : Cash with Order ou crédit. Site FR officiel : À vérifier.
- CGU (catalogue) : Via XML Portal / EDI (EDIFact, Tradacoms, BOSS XML, cXML). CGU hors API : À vérifier.

### KOMSA (`komsa-de`)

- URL officielle : https://komsa.com/ (fiche 5.6 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Webservice de disponibilité temps réel (GET partner.komsa.de/api/v1/product/[article]) ; EDI complet XML/JSON via webservice ou SFTP ; données articles easydata. Compte après vérification société + solvabilité (KARLO). Livraison France : À vérifier.
- CGU (catalogue) : Via webservice REST authentifié et EDI (XML/JSON, SFTP). CG easydata (PDF) : À vérifier.

### Brodos AG (`brodos-de`)

- URL officielle : https://brodos.com/ (fiche 5.7 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Activate API, Customer API, Marketplace OFFER API, Article Master Data API, commandes openTRANS XML ; identifiants de test via account manager. Livraison France : À vérifier.
- CGU (catalogue) : Via les API documentées (Developer Area) et openTRANS XML. CGU hors API : À vérifier.

### Stocklear (`stocklear`)

- URL officielle : https://stocklear.fr/ (fiche 6.1 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : « Only certified accounts… have access to offers and the ability to bid and purchase ». Compte pro validé manuellement (SIRET, Kbis < 1 an, TVA). API / flux : À vérifier.
- CGU (catalogue) : CGU / clause d'accès automatisé : non trouvées. Automatisation à confirmer avec Stocklear.

### Destockplus (`destockplus`)

- URL officielle : https://www.destockplus.com/ (fiche 6.2 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Annonces publiques (consultation sans compte), prix affichés ou « sur demande » selon l'annonceur. « Flux d'annonces » = flux entrant pour les vendeurs, pas de flux sortant acheteurs. Qualité hétérogène.
- CGU (catalogue) : CGV : interdiction de programmes visant à endommager ou intercepter clandestinement les systèmes/données ; clause spécifique robots/scraping : non trouvée. robots.txt à lire avant toute automatisation.

### Merkandi (`merkandi`)

- URL officielle : https://merkandi.fr/ (fiche 6.3 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Abonnement annuel payant (STANDARD 239 € HT, PREMIUM 279 € HT). Particuliers et entreprises acceptés comme acheteurs. API / flux : non trouvés (import d'offres côté vendeur uniquement).
- CGU (catalogue) : Clause robots/scraping : non trouvée dans les extraits des conditions. Automatisation à confirmer par écrit avec Merkandi.

### B-Stock (Europe / Amazon EU / France) (`bstock-europe`)

- URL officielle : https://bstock.com/auctions/europe/ (fiche 6.4 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Enchères après compte (business license + n° TVA ; Amazon EU : virement uniquement). API / flux : non trouvés. Alternative : alertes natives du compte vendeur ; PARTNER_FEED sur accord écrit.
- CGU (catalogue) : Terms of Use : interdiction de « any robot, spider, scraper, data mining tool, data gathering or extraction tool, or any other automated means, to access, collect, copy or record the Services ».

### Eurolots (`eurolots`)

- URL officielle : https://www.eurolots.com/en (fiche 6.5 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : « Company registration is mandatory », revue manuelle de chaque candidature ; minimum 100 € par commande. API / flux : À vérifier.
- CGU (catalogue) : CGU / clause d'accès automatisé : À vérifier.

### Wholesale Clearance UK (`wholesale-clearance-uk`)

- URL officielle : https://www.wholesaleclearance.co.uk/ (fiche 6.6 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Prix publics ; achats réputés professionnels (B2B basis), pas de société/TVA requise ; paiement intégral avant expédition. Import FR post-Brexit à prévoir.
- CGU (catalogue) : Conditions du site : interdiction de « automated software, process, program, robot, web crawler, spider, data mining, trawling or 'screen scraping' software ».

### Gem Wholesale (`gem-wholesale`)

- URL officielle : https://www.gemwholesale.co.uk/ (fiche 6.7 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Prix publics HT, minimum £250 + VAT, « trade only » (modalités de compte non trouvées). Faible pertinence pour le périmètre smartphones.
- CGU (catalogue) : Clause robots : non trouvée.

### SoloStocks (`solostocks`)

- URL officielle : https://www.solostocks.fr/ (fiche 6.8 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Prix publics sur annonces (selon vendeur) ; inscription préalable pour négocier avec les fournisseurs. API / flux : non trouvés.
- CGU (catalogue) : Conditions non indexées : clause d'accès automatisé non trouvée. Ne pas automatiser avant lecture des CGU.

### BrokerBin (`brokerbin`)

- URL officielle : https://brokerbin.com/ (fiche 7.1 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Bourse « members-only » (plans 1 599 à 3 750 $/an, vérification par account manager). API / flux : non trouvés. Smartphones : marginal.
- CGU (catalogue) : Terms : interdiction de « mining, harvesting, or scripting any data » ; « robot, spider, scraper, or other automated means… without express written permission ».

### gsmExchange (`gsmexchange`)

- URL officielle : https://www.gsmexchange.com/ (fiche 7.2 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Membres vérifiés : 100–500 terminaux min. par transaction, > 1 an d'expérience, 2 références commerciales, preuve TVA. Frais de transaction sur le trading floor.
- CGU (catalogue) : Terms : interdiction de « systematic retrieval of site content… through robots, spiders, automatic devices or manual processes » ; partage d'identifiants = résiliation.

### Handelot (`handelot`)

- URL officielle : https://www.handelot.com/ (fiche 7.3 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Niveaux VIP / VIP Gold / Junior ; 2 références commerciales, > 1 an d'activité. Tarif d'adhésion : non trouvé. API / flux : non trouvés.
- CGU (catalogue) : CGU / clause d'accès automatisé : non trouvées.

### Amazon Business (FR) (`amazon-business-fr`)

- URL officielle : https://business.amazon.fr/ (fiche 7.4 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Prix pro après compte Business gratuit et vérifié (SIRET/TVA). Product Search API (searchProducts, getProductsByAsins ≤ 30 ASIN) après questionnaire d'onboarding. Sans approbation : SUPPLIER_ACCOUNT sans automatisation.
- CGU (catalogue) : CGU : interdiction sans consentement écrit des « data mining, robots, or similar data gathering and extraction tools » et de constituer une base de données de prix. Seule voie : Product Search API sur approbation (rôles attribués par Amazon Business).

### eBay (Browse API) (`ebay-browse-api`)

- URL officielle : https://developer.ebay.com/api-docs/buy/browse/overview.html (fiche 7.5 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Browse API (token applicatif, 5 000 appels/jour par défaut) ; Buy APIs en Limited Release : production réservée aux partenaires EPN après « Application Growth Check ». Aucun scraping HTML.
- CGU (catalogue) : CGU eBay.fr : robots, spiders, scrapers et data mining interdits hors API ; robots.txt : accès automatisé interdit sauf moteurs de recherche ; licence API : « market research » et contournement des limites interdits.

### BigBuy (`bigbuy`)

- URL officielle : https://www.bigbuy.eu/fr/ (fiche 7.6 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : API REST/JSON réservée aux packs Ecommerce ou supérieurs (tarif À vérifier) ; CSV/XML avec code, EAN, prix distributeur, PVC, stock ; FTP sur demande. Visibilité des prix avant compte : À vérifier. Présence de smartphones de marque : À vérifier.
- CGU (catalogue) : Via API REST et fichiers CSV/XML/FTP (voie officielle). Clause scraping : non trouvée.

### CdiscountPro (`cdiscount-pro`)

- URL officielle : https://www.cdiscountpro.com/ (fiche 7.7 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Prix publics affichés HT (> 100 000 références) ; conditions de commande/compte : À vérifier. API / flux : non trouvés. Prix de détail pro, pas de prix de gros.
- CGU (catalogue) : CGU : À vérifier (non lues).

### Alibaba.com (`alibaba`)

- URL officielle : https://www.alibaba.com/ (fiche 7.8 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Fourchettes de prix indicatives publiques (MOQ), prix réels négociés. Open Platform : inscription développeur, OAuth, accès « scoped to approved business partners ». Sans accès : MANUAL.
- CGU (catalogue) : CGU : « Systematic retrieval of Site Content… (whether through robots, spiders, automatic devices or manual processes) without written permission » interdit. Seule voie : Open Platform sur approbation.

### Global Sources (`global-sources`)

- URL officielle : https://www.globalsources.com/ (fiche 7.9 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Prix sur demande (inquiries) ; inscription gratuite. API / flux : non trouvés.
- CGU (catalogue) : CGU : usage limité à des « non-substantial portions… for personal or internal and non-commercial purposes », reproduction/réutilisation interdite sans permission écrite ; clause robots explicite : non trouvée.

### Liquidation.com (`liquidation-com`)

- URL officielle : https://www.liquidation.com/ (fiche 7.10 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Compte gratuit ; acheteurs internationaux : virement uniquement ; export à la charge de l'acheteur. Priorité basse.
- CGU (catalogue) : User Agreement : interdiction des « spiders, crawlers, robots or any other similar means… data-mining ».

### Direct Liquidation (`direct-liquidation`)

- URL officielle : https://www.directliquidation.com/ (fiche 7.11 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Compte (nom, e-mail, téléphone, société) ; pas d'expédition internationale gérée. Priorité basse.
- CGU (catalogue) : Terms : interdiction de « robot, spider, data miner, wanderer, crawler or any other automatic or manual device or process to copy or monitor ».

### Via Trading (`via-trading`)

- URL officielle : https://www.viatrading.com/ (fiche 7.12 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Prix publics, « no membership fee and no minimum dollar order », aucune licence/société requise ; minimum un carton, une palette ou un camion. Priorité basse.
- CGU (catalogue) : Terms : interdiction sans permission écrite des « automated tools to scrape, copy or download listings, manifests, images or pricing » ; republication des manifestes interdite.

### 888 Lots (`888lots`)

- URL officielle : https://888lots.com/ (fiche 7.13 de docs/sourcing-sources.md)
- Résultat : **réseau indisponible depuis cet environnement** — vérification non exécutée, à relancer avec `npm run sources:verify` depuis une machine connectée.
- Note : préflight : réseau indisponible depuis cet environnement (aucune requête envoyée à cette source)
- Fiche (catalogue, extraits officiels du 2026-10-07) : Certificat de revente US exigé ; clients internationaux refusés → plateforme sœur Eurolots (6.5) pour l'Europe.
- CGU (catalogue) : Non applicable : « does not accept international customers ».

## Comptage

- Sources vérifiées : 35
- Joignables (page d'accueil lue) : 0
- Accès automatisé refusé (403/429/anti-bot) : 0
- Injoignables (DNS, délai, erreur de connexion) : 0
- Réseau indisponible depuis cet environnement : 35
- Prix observé sans connexion (JSON-LD / Shopify / Woo) : 0
- Disponibilité observée sans connexion : 0
- Signaux : Shopify 0 · WooCommerce 0 · JSON-LD Product 0 · flux RSS valide 0
- robots.txt interdisant « / » à monstockbot : 0 · interdisant au moins un chemin testé : 0

## Tableau de référence (catalogue, extraits officiels du 2026-10-07)

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
