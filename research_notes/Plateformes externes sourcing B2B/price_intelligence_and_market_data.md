# Price intelligence, comparateurs et données produit (API) — pertinence pour MON STOCK (FR/UE, 2026)

> Méthode et limites (à lire d'abord). Recherche faite le 2026-10-15, en lecture seule, sans inscription ni contournement. **Le proxy de sortie de la session a bloqué l'accès direct à tous les sites des fournisseurs** (WebFetch/curl : `developer.ebay.com`, `keepa.com`, `prisync.com`, `price2spy.com`, `api.backmarket.dev` → connexion refusée). Toutes les constatations ci-dessous viennent donc des **résultats et extraits du moteur de recherche** (pages officielles indexées quand c'était possible, sinon sources secondaires). Les prix et les CGU doivent être revérifiés sur la page officielle avant toute décision. Légende : **CONFIRMÉ** = source primaire (doc officielle, page du fournisseur) ; **ANNONCÉ** = annonce/marketing du fournisseur ou source secondaire cohérente ; **HYPOTHÈSE** = déduction ou source faible/contradictoire ; « à confirmer auprès du fournisseur » quand l'info n'est pas publique.

## Q1. eBay — prix vendus (Marketplace Insights API, Terapeak) et conditions de réutilisation (état 2026)

### Takeaway
L'API Marketplace Insights (articles vendus, 90 jours) existe toujours mais elle est en « Limited Release » et **fermée aux nouveaux utilisateurs** (CONFIRMÉ par la doc eBay) : MON STOCK ne peut pas compter dessus. Les prix vendus restent visibles dans Product Research (ex-Terapeak) de Seller Hub, gratuit mais sans API publique. Le contrat de licence API eBay limite aussi le stockage et le mélange des données eBay avec d'autres sources.

### Cited Findings
- **CONFIRMÉ** — La page eBay « Buy API Support by Marketplace » porte une note disant que la Marketplace Insights API est « restricted and not open to new users at this time » — [eBay Developers – Buy API Support by Marketplace](https://developer.ebay.com/api-docs/buy/static/ref-marketplace-supported.html)
- **CONFIRMÉ (spec)** — Fonctionnement : la méthode cherche des articles eBay **vendus** par mot-clé, GTIN, catégorie ou produit et renvoie l'historique de ventes des **90 derniers jours** — [Spec OpenAPI Marketplace Insights v1 beta (copie)](https://cleo-infoeng.s3.us-east-2.amazonaws.com/API_reference/eBay/buy_marketplace_insights_v1_beta_oas2.html) ; [Get Started on a Buying Application](https://developer.ebay.com/develop/get-started/get-started-on-a-buying-application)
- **ANNONCÉ (secondaire)** — Même quand l'accès était ouvert, il fallait un agrément « Business » via l'Application Growth Check avant que le keyset de production puisse appeler l'API — [SoldComps – alternatives](https://sold-comps.com/alternatives) ; [CompSniper – guide 2026](https://compsniper.com/guides/get-sold-items-ebay-api)
- **ANNONCÉ (forum)** — Un développeur rapporte un refus ; eBay aurait répondu qu'il ne donne plus l'accès sauf aux « major partners » — [eBay Community – Marketplace Insights API access](https://community.ebay.com/forum/talk-to-your-fellow-developers-57970/topic/marketplace-insights-api-access-168586/) ; [eBay Community – scope request issue](https://community.ebay.com/t5/RESTful-Sell-APIs-Marketing/Marketplace-Insights-API-scope-request-issue/td-p/34709120)
- **ANNONCÉ (secondaire)** — L'appel « completed items » de la Finding API a été décommissionné le 4 février 2025 ; la Browse API ne renvoie que des annonces **actives** — [SoldComps – alternatives](https://sold-comps.com/alternatives)
- **ANNONCÉ (secondaire)** — Les pages publiques « sold listings » d'eBay demandent maintenant une connexion (2026) — [Scavio Blog](https://scavio.dev/blog/ebay-sold-listings-api-login-wall-2026)
- **CONFIRMÉ** — Terapeak Product Research est gratuit pour tous les vendeurs Seller Hub depuis avril 2021 — [eBay export – Terapeak free](https://export.ebay.com/en/resources/important-updates/ebay-news-archive/terapeak)
- **ANNONCÉ (secondaire)** — La marque Terapeak a été retirée en mai 2024 (l'outil s'appelle « Product Research ») ; jusqu'à 3 ans de ventes, prix moyen et réel, taux de vente (sell-through) ; « Sourcing Insights » demande un abonnement Store — [Frooition – guide mai 2026](https://www.frooition.com/terapeak/)
- **CONFIRMÉ (ancien)** — En 2021, eBay a présenté une « Terapeak Beta API » sur liste d'attente ; je n'ai trouvé aucune preuve qu'elle soit sortie — [eBay Connect 2021 – selling product updates (PDF)](https://www.developer.ebay.com/cms/files/connect-2021/selling_product_updates_mike.pdf)
- **CONFIRMÉ (contrat)** — Licence API eBay : copies intermédiaires limitées seulement « as necessary », à supprimer quand elles ne servent plus ; dans la version 2017, le contenu eBay affiché publiquement ne doit pas être mélangé avec du contenu non-eBay (il doit être visuellement isolé) ; les clés ne se partagent pas sans accord — [eBay API License Agreement](https://developer.ebay.com/products/license) ; [Version PDF 2017](https://developer.ebay.com/cms/files/api_license_2017-05-25_Final.pdf) ; [Forum – question sur la licence](https://community.ebay.com/t5/eBay-APIs-Talk-to-your-fellow/Questions-about-the-API-license-agreement/m-p/34248154)
- **ANNONCÉ (presse)** — Mise à jour de juin/juillet 2025 : les « Restricted APIs » (tendances de marché, stratégies de prix, volumes de ventes) sont réservées à des développeurs sélectionnés et ne doivent pas alimenter un modèle d'IA générative tiers sans accord écrit d'eBay ; les outils de prix doivent aussi respecter la loi sur les prix trompeurs — [EcommerceBytes, 18/07/2025](https://www.ecommercebytes.com/2025/07/18/ebay-restricts-developers-from-using-its-data-to-train-ai/)

### Inferences
- **HYPOTHÈSE forte** : pour MON STOCK (petit revendeur FR), on ne peut pas obtenir Marketplace Insights en 2026. L'analyse « bonne affaire » doit rester sur la Browse API (prix **affichés**, pas vendus) et l'indiquer clairement dans l'UI (« prix demandés, pas prix réalisés »).
- **HYPOTHÈSE** : la clause « Restricted APIs / IA générative » pourrait concerner le Conseiller IA de MON STOCK si des données eBay de prix passent dans un LLM tiers. La Browse API n'est a priori pas une « Restricted API », mais **à confirmer auprès d'eBay / revue juridique**.
- La règle de stockage limité va contre une base historique durable de prix eBay. Un cache court (TTL) et des agrégats calculés sont plus sûrs. **À confirmer** sur le texte actuel de la licence.
- Une option manuelle légale : l'utilisateur consulte Product Research dans son propre Seller Hub et saisit ou importe le prix vendu médian. Ce n'est pas une API.

### Gaps
- Je n'ai pas pu lire en direct le texte actuel (2026) de la licence ni la page overview de Marketplace Insights (accès bloqué). Je n'ai pas vérifié si Marketplace Insights couvre EBAY_FR pour les partenaires qui y ont accès.
- Rien de trouvé sur une ouverture future de l'API ni sur un export CSV de Product Research.

## Q2. Prix du marché de la revente reconditionnée : Back Market, Refurbed, Swappa, SellCell, indices trade-in (Hyla/Assurant), gsmExchange

### Takeaway
Aucune de ces plateformes ne publie un flux de prix du marché ouvert à des tiers. Back Market et Refurbed n'ont que des **API vendeurs** (gérer ses propres offres ; Back Market y ajoute des données « Backbox » sur ses propres listings). Swappa et SellCell n'ont pas d'API documentée. Les « indices » Hyla/Assurant sont des rapports périodiques, pas des API. gsmExchange (B2B, prix de gros visibles) vend un produit d'études (PriceWatch), sans API publique.

### Cited Findings
- **CONFIRMÉ (portail officiel indexé)** — Back Market Seller API (api.backmarket.dev) : taxonomie, gestion des produits et listings, commandes, BuyBack (reprise), Backship, Care, et **Backbox competitive pricing**. Spec OpenAPI 3.0.3, authentification par token Basic émis depuis le Back Office vendeur, URLs prod/préprod par plateforme régionale (UE : backmarket.fr). Il y a un « cookbook » pour gagner la BackBox avec de petits efforts de prix, et la spec contient des schémas « Backbox » et « Competitor » — [Back Market – API Guidelines](https://api.backmarket.dev/) ; [API Evangelist – profil Back Market (tiers)](https://github.com/api-evangelist/back-market) ; [apis.io – Back Market](https://apis.io/providers/back-market/)
- **ANNONCÉ (tiers)** — La section Backbox ne compterait que 2 opérations — [API Evangelist – profil Back Market](https://github.com/api-evangelist/back-market)
- **CONFIRMÉ (doc officielle Notion)** — Refurbed Seller API : HTTPS ou gRPC, sandbox, offres, commandes, profils d'expédition, retours — [refurbed API (Notion)](https://refurbed.notion.site/refurbed-API-7be4e188412d4ea2bd35ef339dab9e3e)
- **ANNONCÉ (tiers)** — Refurbed : Merchant API (offres, prix, stock, commandes, retours) sur `https://api.refurbed.com`, clé API dans le header ; il existerait aussi une **Affiliate Partner API** qui donne le catalogue aux affiliés, et un service « MarketService » — [API Evangelist – refurbed](https://providers.apievangelist.com/providers/refurbed/) ; [refurbed MarketService API (tiers)](https://apis.apievangelist.com/store/refurbed-marketservice-api/) ; [ChannelEngine – refurbed guide](https://support.channelengine.com/hc/en-us/articles/4409514015261)
- **CONFIRMÉ (négatif)** — Les pages Swappa sont tournées vers le grand public (programme de reprise, partenaires qui fixent leurs offres d'après le marché de la revente, devis valable environ 14 jours). Aucune API ni flux de prix trouvé — [Swappa – Trade-in partners](https://swappa.com/en/trade-in/partners) ; [Swappa – trade-in FAQ](https://swappa.com/en/faq/trade-in)
- **Négatif** — SellCell : aucune documentation d'API trouvée (même recherche).
- **CONFIRMÉ (négatif / contexte)** — Assurant a racheté HYLA Mobile en 2020 (325 M$). HYLA est une plateforme SaaS de reprise pour opérateurs, retailers et OEM aux États-Unis. Les valeurs publiées (ex. reprise moyenne iPhone 2021 = 199,13 $) viennent de rapports, et je n'ai trouvé ni « Hyla price index » en API ni produit d'indice documenté — [Resource Recycling 2020](https://resource-recycling.com/e-scrap/2020/11/12/warranty-firm-buys-phone-refurbisher-for-325-million/) ; [Resource Recycling 2022](https://resource-recycling.com/e-scrap/2022/04/20/trade-in-firm-reports-higher-values-for-used-phones/) ; [GCN – données Assurant 2025](https://gcn.com/traded-smartphones-averaging-close-four-years/22141/)
- **CONFIRMÉ (site officiel)** — gsmExchange : plateforme de négoce B2B pour distributeurs, grossistes et retailers de téléphones, avec des sociétés vérifiées. Les offres publiques affichent des **prix de gros unitaires en EUR/USD/GBP** (ex. « Apple iPhone 16 128GB EUR 613 … 170pcs »). Les coordonnées vendeurs sont réservées aux membres premium — [gsmExchange – About](https://www.gsmexchange.com/en/about) ; [gsmExchange – Recent wholesale offers](https://www.gsmexchange.com/en/phones/buy)
- **ANNONCÉ** — gsmExchange vend « gsmX PriceWatch » (rapports sur les prix et tendances des téléphones, pour opérateurs, distributeurs, institutions financières). Pas d'API ni de licence de données publique trouvée — [gsmExchange – exposant / listing](https://gsmx-gsmexchange.expoplatform.com/exhibitor/b2b-mobile-auction-a906729c) ; [Dealroom – gsmExchange](https://app.dealroom.co/companies/gsmexchange_com)
- **ANNONCÉ** — Il existe des scrapers Apify « Back Market » (prix, grades, stock) ; ils lisent les pages publiques et ne passent pas par l'API — [Apify – Back Market scraper (chimerical_quicklime)](https://apify.com/chimerical_quicklime/backmarket-listings-scraper/api) ; [Apify – Back Market scraper (deprecated)](https://apify.com/studio-amba/back-market-scraper/api)

### Inferences
- **HYPOTHÈSE forte** : la Backbox de Back Market donne au vendeur le **prix à battre sur SES propres listings** (par grade), et non un prix de marché pour tout modèle. Pour s'en servir, MON STOCK devrait connecter le compte vendeur Back Market de l'utilisateur et avoir déjà publié le listing. C'est utile pour la revente, peu utile pour juger une offre fournisseur avant achat. **À confirmer sur la spec OpenAPI** (`bundled_openapi.yaml`).
- **HYPOTHÈSE** : Back Market est le site qui coïncide le mieux avec le besoin (iPhone reconditionné FR, grade, capacité), mais la seule voie officielle passe par le statut de vendeur Back Market (onboarding sélectif, à confirmer).
- **HYPOTHÈSE** : l'API Affiliate Partner de Refurbed pourrait donner des prix catalogue publics (par modèle et état) de façon légale. **À confirmer auprès de Refurbed** (conditions d'affiliation, droit de stocker et d'afficher).
- Les prix gsmExchange sont les seuls **prix d'achat/gros** observés dans cette étude (prix demandés par des vendeurs B2B, pas des transactions). Une adhésion payante et une lecture manuelle sont possibles. Le scraping est à exclure (zone membres, CGU).

### Gaps
- Les endpoints exacts de la Backbox (champs, granularité grade/pays) n'ont pas pu être lus (accès bloqué).
- Coût et conditions d'adhésion gsmExchange, existence d'une API : à confirmer auprès du fournisseur.
- SellCell, Swappa : aucune info sur une offre B2B de données. Swappa et SellCell visent les États-Unis/Royaume-Uni et sont peu pertinents pour la France.

## Q3. SaaS de price intelligence (Prisync, Price2Spy, Minderest, Netrivals/Lengow, Omnia, Competera, Skuuudle, DataWeave, Pricefx)

### Takeaway
Ce sont des outils de **veille de prix publics** (prix de vente affichés). Ils fonctionnent presque tous par scraping des sites marchands et des comparateurs **pour le compte du client**, à partir des URL ou produits que le client fournit. Aucun ne fournit de prix d'achat ou de gros. Seuls Prisync et Price2Spy publient des tarifs accessibles à une petite structure, et leur API est réservée aux plans hauts. Pour MON STOCK, ils servent à surveiller un panier fixe de références, pas à estimer à la demande n'importe quelle offre.

### Cited Findings
- **Prisync — ANNONCÉ (agrégateurs)** — Plans Professional 99 $/mois (100 produits), Premium 199 $, Platinum 399 $ ; essai gratuit — [Capterra – Prisync pricing](https://www.capterra.com/p/153451/Prisync/pricing/). PricingSaaS compte 9 plans (URL-based, channel-based, hybride) de 99 $ à 799 $/mois — [PricingSaaS – Prisync](https://pricingsaas.com/companies/prisync). **Contradiction** sur l'API : incluse dans Premium/Platinum selon Capterra, add-on de +20 % sur Platinum selon ShopSavvy (concurrent) — [ShopSavvy – Prisync alternatives](https://shopsavvy.com/compare/prisync-alternatives.md). La page « Compare plans » a changé plusieurs fois en juin-juillet 2026, notamment le prix de l'add-on API — [Visualping – Prisync pricing](https://visualping.io/pages/prisync-pricing-alerts-4894520)
- **Price2Spy — CONFIRMÉ (FAQ officielle)** — « The Price2Spy API … is available with Premium user account » — [Price2Spy – FAQ commerciale](https://price2spy.com/?p=13117). **ANNONCÉ (tiers)** : Starter 39,95 $/mois (500 URL), Basic 157,95 $/mois (2 000 URL), Premium sur devis, essai 14 jours — [SoftwareFinder – Price2Spy](https://softwarefinder.com/sales-tools/price2spy) ; Price2Spy a annoncé une hausse de tarifs — [Price2Spy – New Prices](https://www.price2spy.com/?p=129998). Un autre comparatif donne des chiffres différents — [ShopSavvy vs Price2Spy](https://shopsavvy.com/compare/shopsavvy-business-vs-price2spy.md)
- **Netrivals (Lengow) — ANNONCÉ (vendeur)** — Plus d'un milliard de produits sur plus de 35 000 sites, matching IA sans EAN, repricing. Les données sont scrapées directement sur les sites marchands, marketplaces et comparateurs (pas via les flux Google Shopping). Rachat par Lengow en avril 2022, équipe à Barcelone — [Lengow – NetRivals vs Minderest](https://www.lengow.com/?p=83738) ; [Lengow – PriceShape vs NetRivals](https://www.lengow.com/get-to-know-more/priceshape-vs-netrivals). Chiffre différent sur OVHcloud : 600 M de produits scannés par jour — [OVHcloud Open Trusted Cloud – Netrivals](https://opentrustedcloud.ovhcloud.com/en/netrivals/). Mise à jour quotidienne selon Siècle Digital — [Siècle Digital – outils de veille tarifaire (2025)](https://siecledigital.fr/2025/10/23/le-guide-des-meilleurs-outils-de-veille-tarifaire/)
- **Minderest — ANNONCÉ (annuaire)** — Price et catalog intelligence pour retailers et fabricants : prix, promos, stock en ligne, sur marketplaces et en magasin. Sources : web scraping/crawling. Siège en Europe. Module de pricing dynamique « Reactev » — [The SI Lab – Minderest](https://www.thesilab.com/vendor-directory/minderest)
- **Omnia Retail — ANNONCÉ (vendeur)** — Collecte directe des prix concurrents et marketplaces (Amazon, eBay, Google Shopping) — [Omnia – vs Competera](https://www.omniaretail.com/omnia-retail-vs-competera-how-omnia-retail-is-outperforming-competera). **HYPOTHÈSE** : plan d'entrée « à partir de 399 € » pour une boutique PME (vient d'un résumé de recherche, page source non lue) — [G2 – comparatif](https://www.g2.com/compare/dataweave-vs-price2spy-vs-omnia-retail)
- **Competera — ANNONCÉ (concurrent)** — Omnia lui reproche de dépendre de prestataires tiers pour le scraping — [Omnia – vs Competera](https://www.omniaretail.com/omnia-retail-vs-competera-how-omnia-retail-is-outperforming-competera) ; trop peu d'avis G2 pour juger — [G2 – Competera](https://www.g2.com/products/competera-ai/reviews)
- **DataWeave — CONFIRMÉ (fiche produit)** — Veille concurrentielle à partir de données web publiques : compétitivité prix par marque et catégorie, remises, disponibilité. Tarifs sur demande — [DataWeave – datasheet pricing intelligence (PDF 2021)](https://dataweave.com/downloads/dataweave-datasheet-pricing-intelligence-aag-2021.pdf)
- **Skuuudle** — Seule info trouvée : une note GetApp de 4,8/5 — [GetApp – Omnia vs Skuuudle](https://www.getapp.com.au/compare/110163/114041/omnia-dynamic-pricing/vs/skuuudle)
- **Pricefx** — Aucune source trouvée dans cette recherche (voir Gaps).

### Inferences
- **HYPOTHÈSE forte** : ces outils fournissent uniquement des **prix publics affichés (listed)**, et aucun prix vendu ni prix de gros. La granularité par condition ou grade dépend de l'URL suivie (une URL Back Market « Très bon état 128 Go » = un produit suivi). Le matching sans EAN existe (Netrivals), mais le grade du reconditionné n'est pas un attribut standard.
- **HYPOTHÈSE** : réutiliser ces données dans un logiciel tiers (MON STOCK revendu à d'autres) n'est sans doute pas couvert par une licence client standard. **À confirmer auprès du fournisseur** (contrat, clause de redistribution).
- **HYPOTHÈSE** : le modèle « liste d'URL surveillées » ne colle pas au besoin « analyser une offre fournisseur nouvelle à la demande ». Il faudrait un compte client, payé par l'utilisateur final, avec un panier fixe de modèles (ex. 100 à 500 combinaisons iPhone modèle × capacité × grade sur Back Market, Amazon, Fnac, Rakuten…).
- Risque juridique : ces prestataires scrapent. En UE, c'est le client et/ou le prestataire qui portent le risque contractuel vis-à-vis des sites (voir Q7).
- Rapport qualité-prix pour un petit revendeur : Price2Spy Starter (~40 $/mois) est le plus accessible pour tester une veille, mais sans API (export ou rapports seulement, à confirmer). Prisync coûte au moins 99 $/mois pour 100 produits.

### Gaps
- Pages de tarifs officielles inaccessibles (proxy) : prix exacts 2026 et inclusion de l'API **à confirmer**.
- Pricefx, Competera, Skuuudle, Minderest, Netrivals, DataWeave : tarifs non publics, à confirmer auprès du fournisseur. Pricefx est un logiciel de pricing enterprise (CPQ/optimisation) et n'est pas un fournisseur de données de marché (hypothèse, non sourcée ici).
- Aucune source sur la couverture spécifique du reconditionné (grades) par ces outils.

## Q4. Comparateurs et Google Shopping (Merchant API, idealo, Ledenicheur/PriceRunner)

### Takeaway
La Merchant API de Google donne un **prix de référence (benchmark) cliqué-pondéré par GTIN**, mais seulement pour les produits que le marchand a lui-même soumis dans son Merchant Center, sous conditions d'éligibilité, avec une couverture souvent faible. C'est légal et officiel, mais cela ne permet pas d'interroger un produit quelconque. idealo n'a pas d'API publique de lecture des offres (l'interface marchand sert à envoyer ses propres offres). Je n'ai trouvé aucune API publique pour Ledenicheur ou PriceRunner.

### Cited Findings
- **CONFIRMÉ (doc Google)** — On interroge `price_competitiveness_product_view` via `accounts.reports.search` (champs id, title, brand, price, report_country_code, benchmark price) pour voir comment d'autres marchands vendent les mêmes produits. C'est réservé aux comptes standalone ou sous-comptes (pas aux comptes avancés), avec des seuils d'éligibilité « Market insights » — [Merchant API – Understand the market](https://developers.google.com/merchant/api/guides/reports/understand-the-market) ; [Merchant Reports API overview](https://developers.google.com/merchant/api/guides/reports/overview)
- **CONFIRMÉ (doc Google Cloud)** — Le benchmark est le prix moyen pondéré par les clics d'un produit, sur tous les marchands qui le diffusent en annonces Shopping. Le rapprochement se fait par GTIN — [BigQuery – Price Competitiveness table](https://docs.cloud.google.com/bigquery/docs/merchant-center-price-competitiveness-schema)
- **CONFIRMÉ (doc Google Cloud)** — L'ancien rapport « price benchmarks » a été déprécié le 1er septembre 2025, remplacé par le rapport price competitiveness — [BigQuery – migration](https://docs.cloud.google.com/bigquery/docs/merchant-center-price-competitiveness-migration)
- **ANNONCÉ (forum)** — Un marchand n'obtenait un benchmark que pour environ 500 produits sur 50 000. La vue ne couvre que les produits soumis et ayant un benchmark — [Google Groups – PriceCompetitiveness Report](https://groups.google.com/g/google-content-api-for-shopping/c/rarXrvUG998)
- **CONFIRMÉ** — La Content API for Shopping est marquée « Deprecated » au profit de la Merchant API — [Content API – Understand the market (Deprecated)](https://developers.google.com/shopping-content/guides/reports/market-insights)
- **ANNONCÉ (tiers)** — idealo n'a pas d'API publique d'offres et ses pages produits sont protégées contre les bots. L'interface marchand (PWS) sert uniquement à envoyer ses propres offres. Des scrapers non officiels existent sur Apify (recherche par EAN, ID, URL, sur 6 marchés dont la France) — [Apify – Idealo Price Data API](https://apify.com/pricepirate/idealo-price-data-api) ; [Apify – Idealo scraper 6 markets](https://apify.com/ahmed_jasarevic/idealo-scraper)

### Inferences
- **HYPOTHÈSE** : le benchmark Google est un prix de vente **neuf** surtout (GTIN). Le reconditionné partage souvent le GTIN du neuf ou n'en a pas, donc le benchmark est peu fiable pour le reconditionné par grade. Il demande aussi que MON STOCK (ou l'utilisateur) ait un Merchant Center avec ces produits en flux, ce qui ne correspond pas au cas « évaluer une offre fournisseur ».
- Usage possible : si le revendeur a déjà une boutique sur Google Shopping, MON STOCK pourrait lire son propre rapport de compétitivité via OAuth. C'est légal, mais réservé à ses produits.
- idealo, Ledenicheur, PriceRunner : on ne peut s'y alimenter légalement qu'avec un accord commercial direct (à confirmer auprès du fournisseur). Les scrapers Apify contreviennent probablement aux CGU (voir Q7).

### Gaps
- Pas d'information sur un programme partenaire ou de données chez Ledenicheur (marque PriceRunner/Klarna en France), PriceRunner ou idealo : à confirmer auprès du fournisseur.
- Couverture réelle du benchmark Google pour les iPhone reconditionnés en France : non documentée.

## Q5. Historique de prix Amazon (Keepa, Rainforest/Traject Data)

### Takeaway
Keepa est l'API la plus complète pour l'**historique des prix Amazon** (dont Amazon.fr, offres neuves/occasion/reconditionnées, Buy Box). Elle est payante par jetons, à partir d'environ 49 €/mois selon des sources tierces. Ses conditions de redistribution sont introuvables publiquement. Rainforest API (Traject Data) vend des requêtes de données produit Amazon en temps réel avec des prix publics. C'est un service tiers d'extraction, avec le risque CGU Amazon qui va avec.

### Cited Findings
- **CONFIRMÉ (doc Keepa)** — Fonctionnement par jetons/minute : chaque requête consomme des jetons (1 par produit par défaut). Les jetons non utilisés expirent après 1 h et le seau est plafonné à 60 × le débit par minute — [Keepa API – How Plans Work](https://keepa.com/api-docs/plans-tokens.html) ; [Keepa API Documentation](https://keepa.com/api-docs/)
- **ANNONCÉ (tiers)** — Tarifs : 49 € (20 jetons/min), 129 € (60), 459 € (250), 879 € (500), et des paliers supérieurs. Les listes de paliers **se contredisent** entre deux pages du même site, et l'existence d'un palier gratuit est contradictoire — [RevenueGeeks – Keepa pricing](https://revenuegeeks.com/keepa-pricing/) ; [RevenueGeeks – Keepa API](https://revenuegeeks.com/software/keepa/api) ; [socket.dev – keepa-mcp](https://socket.dev/npm/package/keepa-mcp)
- **ANNONCÉ (tiers)** — Coût par endpoint : produit = 1 jeton par ASIN, pages d'offres optionnelles = +6 jetons, Best Sellers = 50 jetons — [Nexscope – Keepa API guide](https://www.nexscope.ai/blog/keepa-api-guide)
- **Négatif** — Pas de clause publique trouvée sur la redistribution ou l'usage commercial des données Keepa — [ShopSavvy – Keepa API alternatives](https://shopsavvy.com/compare/keepa-api-alternatives.md)
- **CONFIRMÉ (page tarifs vendeur)** — Rainforest API : Hobbyist 15 $/mois (facturé à l'année, 500 requêtes), Starter 59 $ (10 000), Production 375 $ (250 000), BigData 1 000 $ (1 M), et plus. Seules les requêtes réussies sont facturées. Essai de 100 requêtes sans carte — [Traject Data – Rainforest API Pricing](https://trajectdata.com/?p=1705). Contradiction mineure : 18 $/mois pour 500 crédits selon un tiers — [socialcrawl.dev](https://www.socialcrawl.dev/en/blog/best-amazon-product-data-apis-2026)

### Inferences
- **HYPOTHÈSE forte** : Keepa est très pertinent pour l'iPhone, le MacBook et l'iPad sur Amazon.fr/.de (prix neuf, occasion, « Amazon Renewed », historique 90 jours/1 an, rang de ventes qui sert d'indicateur de demande). Le rapprochement se fait par ASIN, à partir d'un EAN (Keepa accepte des recherches par code, à confirmer dans la doc). Ce sont des prix **affichés**, pas vendus. Pour les pièces détachées, la couverture Amazon est hétérogène.
- **HYPOTHÈSE** : Keepa constitue sa base par collecte automatisée sur Amazon. Le risque contractuel (CGU Amazon) reste chez Keepa et le client, et le droit de réafficher les données dans un logiciel tiers est **à confirmer auprès du fournisseur** (licence Keepa).
- Rainforest et services équivalents : scraping as a service. À éviter pour un produit diffusé à des tiers sans avis juridique.

### Gaps
- Grille tarifaire officielle Keepa 2026, devise, TVA, CGU de l'API : non lues (accès bloqué). À confirmer.
- Je n'ai pas vérifié si Keepa distingue les états de « Renewed » (grades).

## Q6. Données produit / EAN (Icecat, GS1, Barcode Lookup, UPCitemdb, EAN-Search)

### Takeaway
Ces services servent à **normaliser les produits** (EAN vers modèle, capacité, couleur, fiche technique), pas à donner des prix. Open Icecat est gratuit (financé par les marques) avec une licence de contenu ouvert et est très fort sur l'IT et l'électronique en Europe. Les bases de codes-barres (UPCitemdb, EAN-Search, Barcode Lookup) donnent un nom ou une catégorie depuis un EAN, avec des quotas gratuits ou payants.

### Cited Findings
- **CONFIRMÉ (Icecat)** — Open Icecat est gratuit car financé par les fabricants. Le contenu de centaines de marques y est diffusé sous l'« open content license » d'Icecat. Inscription gratuite, puis accès à la base multilingue Open Icecat. Full Icecat (payant) ajoute des marques et des niveaux de service. Une marque peut réserver certaines fiches à des revendeurs autorisés — [Icecat – FAQ for product content users](https://iceclog.com/faq-for-merchants/) ; [Icecat – structured data content users](https://icecat.com/structured-data-content-users) ; [Icecat – subscription plans 2025](https://iceclog.com/icecat-subscription-plans/)
- **ANNONCÉ (tiers, possiblement daté)** — Full Icecat : Starter dès 375 $/mois, 1 Vertical 650 $, Complete 3 750 $ ; facturation annuelle par site. Taille d'Open Icecat contradictoire : 2 M fiches et 350 marques selon FitGap, plus de 18 M selon Icecat — [FitGap – Icecat](https://us.fitgap.com/products/icecat)
- **ANNONCÉ (concurrent)** — UPCitemdb : palier gratuit de 100 requêtes/jour sans inscription, payant à partir de 99 $/mois. Les réponses n'incluent pas les offres Amazon/eBay — [ShopSavvy – vs UPCitemdb](https://shopsavvy.com/compare/shopsavvy-data-api-vs-upcitemdb.md)
- **ANNONCÉ (annuaire)** — EAN-Search.org traduit EAN/UPC/ISBN en nom, catégorie et pays d'émission, sans prix ni stock — [Jentic – EAN-Search](https://jentic.com/apis/ean-search)
- **Négatif** — Barcode Lookup : pas de tarif trouvé — [Zyla Labs – EAN lookup alternatives](https://www.zylalabs.com/blog/top-ean-lookup-api-alternatives-in-2025)

### Inferences
- **HYPOTHÈSE forte** : Open Icecat est le meilleur choix pour enrichir et normaliser le catalogue MON STOCK (Apple, Samsung, MacBook, iPad), avec un EAN fiable comme clé de rapprochement entre l'offre fournisseur et l'annonce de revente. Il ne couvre ni les grades de reconditionnement ni la plupart des pièces détachées génériques (non sourcé, hypothèse).
- Les bases de codes-barres sont utiles en appoint (scan EAN dans l'app mobile), mais elles n'apportent pas de prix.

### Gaps
- Texte exact de la licence Open Icecat (droit d'affichage dans une app SaaS tierce, mention obligatoire) : non lu, à confirmer.
- GS1 (GS1 France Codeonline / « Verified by GS1 ») : non recherché faute de budget de requêtes. À vérifier (accès API, coût adhérent).
- Tarifs officiels EAN-Search et Barcode Lookup : non trouvés.

## Q7. Services de scraping (Apify, ScraperAPI, Rainforest…) : légalité et risques en UE/France

### Takeaway
L'outil n'est pas illégal en soi, mais une source scrapée (Back Market, idealo, Amazon, eBay) apporte des risques **contractuels** (CGU qui interdisent le scraping, opposables d'après l'arrêt Ryanair de la CJUE), un risque **droit sui generis des bases de données** en France, et des obligations RGPD si des données de vendeurs particuliers sont collectées. Pour un produit commercial comme MON STOCK, ces sources sont à classer « risque élevé, à éviter sans avis juridique ».

### Cited Findings
- **CONFIRMÉ (jurisprudence commentée)** — CJUE C-30/14 Ryanair c/ PR Aviation (15/01/2015) : quand une base n'est protégée ni par le droit d'auteur ni par le droit sui generis, la directive ne s'applique pas, et le titulaire peut imposer par contrat (CGU) des restrictions comme l'interdiction du screen-scraping. Le comparateur PR Aviation était lié par ces CGU — [Pinsent Masons – Out-Law](https://www.pinsentmasons.com/out-law/news/cjeu-case-on-screen-scraping-has-potential-to-affect-business-models-says-expert) ; [Law Gazette](https://lawgazette.co.uk/legal-updates/protection-for-unprotected-databases/5046552.article)
- **ANNONCÉ (cabinet)** — France : des moyens existent pour protéger un site contre le scraping illicite (analyse Hogan Lovells) — [Hogan Lovells – France: protecting a website from unlawful data scraping](https://www.engage.hoganlovells.com/knowledgeservices/insights-and-analysis/france-protecting-a-website-from-unlawful-data-scraping)
- **ANNONCÉ (tiers)** — Tarifs Apify contradictoires selon les sources : Starter 29 $ ou 49 $/mois, Scale 199 $ ou 499 $/mois, à l'usage (compute units) ; certains acteurs se paient au résultat — [Automation Atlas – Apify pricing 2026](https://automationatlas.io/answers/apify-pricing-explained-2026/) ; [Toolradar – Apify](https://toolradar.com/tools/apify/pricing) ; [Capterra – Apify pricing](https://www.capterra.com/p/150854/Apify/pricing/)
- **CONFIRMÉ (pages Apify)** — Les acteurs Back Market et idealo sont publiés par des tiers (développeurs indépendants), et certains sont marqués « DEPRECATED » — [Apify – Back Market Scraper (deprecated)](https://apify.com/studio-amba/back-market-scraper/api) ; [Apify – Idealo Price Data API](https://apify.com/pricepirate/idealo-price-data-api)

### Inferences
- **HYPOTHÈSE forte** : un acteur Apify « Back Market » ou « idealo » est une fragilité technique (il casse, il est déprécié) et juridique (CGU, droit sui generis si l'investissement de la base est substantiel, ce qui est probable pour Back Market). MON STOCK en serait coresponsable s'il intègre et redistribue ces données.
- Les SaaS de veille (Q3) font aussi du scraping. Ils mutualisent le risque et l'assument contractuellement en partie (à confirmer dans leurs contrats), ce qui reste préférable à un scraper maison.

### Gaps
- CGU Apify (responsabilité de l'utilisateur) non lues. Jurisprudence française récente (ex. affaires de comparateurs, droit sui generis L.342-1 CPI) non vérifiée dans cette passe.
- ScraperAPI : non recherché (même catégorie de risque).

## Q8. Synthèse : qui fournit des prix d'achat/gros, et quoi intégrer en priorité dans MON STOCK

### Takeaway
**Aucun fournisseur de price intelligence étudié ne donne de prix d'achat/gros.** Ils fournissent tous des prix de vente publics. Les seules sources de prix de gros repérées sont les plateformes B2B membres (gsmExchange, offres publiques en EUR) et les catalogues fournisseurs déjà importés par MON STOCK. Pour le prix de revente, la meilleure combinaison légale et réaliste est : eBay Browse (actuel, prix affichés) + Keepa (Amazon FR/DE, historique) + l'API vendeur Back Market/Refurbed si l'utilisateur est vendeur, avec Open Icecat/EAN comme clé de rapprochement.

### Cited Findings
- Prix de gros visibles en EUR sur les offres publiques gsmExchange (ex. iPhone 16 128 Go à 613 €, 170 pcs) — [gsmExchange – wholesale offers](https://www.gsmexchange.com/en/phones/buy)
- Les outils de veille Netrivals, Minderest, DataWeave et Omnia collectent des prix publics de sites marchands — [Lengow – NetRivals](https://www.lengow.com/?p=83738) ; [The SI Lab – Minderest](https://www.thesilab.com/vendor-directory/minderest) ; [DataWeave datasheet](https://dataweave.com/downloads/dataweave-datasheet-pricing-intelligence-aag-2021.pdf)
- Prix vendus eBay par API : fermé aux nouveaux — [eBay Buy API support](https://developer.ebay.com/api-docs/buy/static/ref-marketplace-supported.html)

### Inferences
Matrice de pertinence pour MON STOCK (confiance : H = haute, M = moyenne, B = basse) :

| Fournisseur | Type de prix | Vendu ou affiché | Granularité reconditionné (grade) | API | Accès petit revendeur FR | Réutilisation dans MON STOCK | Confiance |
|---|---|---|---|---|---|---|---|
| eBay Browse API (actuel) | Revente | Affiché | Condition eBay (neuf, reconditionné, occasion), pas de grade standard | Oui | Oui | Licence eBay : cache limité, pas de mélange en affichage public (à confirmer) | H |
| eBay Marketplace Insights | Revente | **Vendu** (90 j) | Idem | Oui | **Non (fermé)** | n/a | H |
| eBay Product Research (Terapeak) | Revente | Vendu (3 ans) | Idem | Non | Oui (Seller Hub) | Saisie manuelle par l'utilisateur | M |
| Back Market Seller API (Backbox) | Revente | Affiché (prix à battre) | Grade BM, sur ses propres listings | Oui | Vendeur BM seulement | Données du compte de l'utilisateur (à confirmer) | M |
| Refurbed Merchant / Affiliate API | Revente | Affiché | Grade Refurbed (à confirmer) | Oui | Vendeur / affilié | À confirmer | B |
| Keepa | Revente Amazon | Affiché + historique | Neuf / occasion / Renewed | Oui | Oui (~49 €/mois, tiers) | Licence à confirmer | M |
| Rainforest API | Revente Amazon | Affiché | Idem | Oui | Oui (dès 15 $/mois) | Risque CGU Amazon | M |
| Prisync / Price2Spy | Revente (URL suivies) | Affiché | Selon les URL | Plans hauts | Oui (99 $ / 39,95 $ et plus) | Redistribution à confirmer | M |
| Netrivals, Minderest, Omnia, Competera, DataWeave, Skuuudle, Pricefx | Revente | Affiché | Selon config | Sur devis | Peu adapté (enterprise) | À confirmer | B |
| Google Merchant API (benchmark) | Revente (neuf, GTIN) | Prix moyen cliqué | Non | Oui | Ses propres produits seulement | Oui (ses données) | H |
| idealo, Ledenicheur, PriceRunner | Revente | Affiché | Non | Pas d'API publique | Non | n/a | M |
| gsmExchange | **Gros (B2B)** | Prix demandé | Neuf / occasion (à confirmer) | Pas d'API trouvée | Adhésion payante (à confirmer) | Consultation manuelle | M |
| Swappa, SellCell, Hyla/Assurant | Reprise / revente (US/UK) | — | — | Pas d'API trouvée | Non | n/a | M |
| Open Icecat / EAN DB | Aucun (fiche produit) | — | Non | Oui | Oui (gratuit / quotas) | Licence ouverte (à confirmer) | M |
| Apify / scrapers | Selon cible | Affiché | Selon cible | Oui | Oui | **Risque CGU / droit sui generis** | H (sur le risque) |

- **HYPOTHÈSE (recommandation)** :
  1. Garder eBay Browse en précisant « prix affichés », filtrer par condition et par EAN, et ajouter des statistiques robustes (médiane, écart interquartile) plutôt qu'une moyenne sur environ 30 annonces.
  2. Ajouter Keepa (Amazon.fr) comme deuxième source, avec une clé API propre à l'utilisateur pour limiter le problème de redistribution.
  3. Proposer un connecteur Back Market Seller API (Backbox) **pour les utilisateurs déjà vendeurs Back Market**.
  4. Utiliser Open Icecat et l'EAN pour fiabiliser les rapprochements.
  5. Ne pas intégrer de scrapers.
  6. Pour les prix d'achat, continuer avec l'import de catalogues fournisseurs. gsmExchange se consulte à la main, sans automatisation.

### Gaps
- Toutes les grilles tarifaires et CGU doivent être revérifiées sur les sites officiels (inaccessibles pendant cette recherche) et, pour l'usage commercial et la redistribution, auprès de chaque fournisseur.
- Pas de source trouvée sur un indice européen du prix des smartphones reconditionnés accessible par API.
