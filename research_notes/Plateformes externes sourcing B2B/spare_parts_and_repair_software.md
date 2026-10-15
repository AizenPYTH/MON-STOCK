# Fournisseurs de pièces détachées (smartphone/tablette/MacBook) avec API/flux, et logiciels de réparation agrégateurs multi-fournisseurs

> **Méthode et limites (à lire d'abord).** Recherche faite le 2026-10-15, en lecture seule sur des pages publiques, sans inscription. **Le proxy de sortie de cette session a refusé les connexions directes** (WebFetch/curl) vers foneday.shop, repairdesk.co, chromewebstore.google.com, etc. (erreur `connect_rejected` / ENOTFOUND). Toutes les constatations ci-dessous viennent donc de **résumés et extraits de pages renvoyés par le moteur de recherche** (WebSearch), avec l'URL de la page d'origine. Les citations sont fidèles aux extraits, mais **chaque point mérite une relecture humaine de la page en direct** avant toute décision contractuelle. Niveaux utilisés : **CONFIRMÉ** (page officielle du fournisseur ou de l'éditeur), **ANNONCÉ** (marketing, blog d'un partenaire ou page tierce), **HYPOTHÈSE** (déduction), « à confirmer auprès du fournisseur » (non public).

## Q1 — Fournisseurs européens : lesquels ont une API ou un flux prix/stock réellement utilisable ?

### Takeaway
Aucun grossiste européen de pièces mobiles n'a trouvé de **documentation d'API publique**. Pourtant **Foneday** (NL) expose bien une API par clé client : un outil tiers l'utilise, et RepairPlugin comme Repender s'y connectent. **MobileSentrix Europe** a une API, mais la réserve à des partenaires logiciels (RepairDesk, MyRepairApp). **Mobileparts.shop/2Service** (distributeur officiel des Samsung Service Packs) est branché sur RepairPlugin. **Utopya** n'a aucune API publique et ses CGV interdisent l'extraction.

### Cited Findings

**Foneday (NL, Tilburg) — foneday.shop**
- Grossiste « total service » basé à Tilburg, spécialisé en pièces smartphone/tablette — [werkzoeken.nl](https://www.werkzoeken.nl/bedrijf/8729-foneday). D'après une interview relayée sur LinkedIn : fondé en 2015, présent dans plus de 14 pays — [LinkedIn](https://nl.linkedin.com/in/beeke-pachali) (ANNONCÉ).
- Plus de 15 000 références de pièces mobiles ; se présente comme « the one-stop parts supplier in Europe » — [Foneday About us](https://foneday.shop/about/about-us) (CONFIRMÉ via extrait de recherche).
- **API : CONFIRMÉE en pratique, sans documentation publique.** L'extension Chrome tierce « Foneday Prijscalculator » « récupère les produits via l'API Foneday » à partir d'un SKU. Elle obtient le statut de stock, la marque, les codes modèle et le **prix d'achat**, puis calcule un prix de vente (marge, taux horaire, TVA). La clé API est stockée localement dans le navigateur — [Chrome Web Store](https://chromewebstore.google.com/detail/foneday-prijscalculator/andbakcpndhnkaccilaapgghdmcladci). Le moteur n'a trouvé ni portail développeur, ni endpoints, ni CGU d'API (deux recherches : [1](https://www.werkzoeken.nl/bedrijf/8729-foneday), [2](https://chromewebstore.google.com/detail/foneday-prijscalculator/andbakcpndhnkaccilaapgghdmcladci)).
- **Logiciel maison Repender** (CRM/POS/prise de RDV pour réparateurs). On peut y envoyer des pièces dans le panier Foneday et ajouter au stock les commandes Foneday. Les prix de réparation suivent les prix d'achat Foneday — [Repender Integrations](https://repender.nl/en/integrations), [Repender Features](https://repender.nl/en/features). Selon le blog Foneday, ces prix sont ajustés chaque jour et la commande se fait en un clic si le compte Foneday est lié — [Foneday blog Repender](https://foneday.shop/blog/repender-platform-for-repair-professionals). L'intégration Foneday figure dans le plan Basic de Repender, à tarif mensuel forfaitaire non chiffré dans l'extrait — [GetApp Repender](https://www.getapp.com/retail-consumer-services-software/a/repender/) (ANNONCÉ).
- Foneday s'élargit en « full-service partner » pour les réparateurs — [Secondary Market News](https://secondarymarket.news/blog/foneday-expands-from-spare-parts-supplier-to-full-service-partner-for-repair-shops/) (ANNONCÉ).
- Couverture : pièces, accessoires et **appareils reconditionnés**, livrés aux réparateurs dans toute l'Europe — [RepairPlugin suppliers](https://repairplugin.com/suppliers). Catégorie « For Apple » (iPhone, etc.) — [Foneday For Apple](https://foneday.shop/assortment/brands/for-apple), [Foneday iPhone parts](https://foneday.shop/catalog/parts/For-Apple/iPhone).
- Livraison : la page Shipping cite la France parmi les destinations, les transporteurs PostNL/UPS/DHL et l'extrait « + €6.50 Free From €150.00 Or NOVANL > €50.00 ». L'extrait est fragmentaire : seuil et conditions exactes pour la France à vérifier — [Foneday Shipping](https://foneday.shop/support/shipping).
- Contact support : support@foneday.com, selon la fiche — [Trustpilot](https://www.trustpilot.com/review/foneday.shop).

**MobileSentrix Europe (NL) — mobilesentrix.eu**
- Grossiste B2B : « we will require business documentation in order for our onboarding team to approve your account ». Les prix ne sont visibles qu'après approbation (« contact us to get your account approved to see price! »). Le formulaire demande un numéro de TVA, qui ouvre droit à l'exonération ; prix affichés HT — [MobileSentrix EU](https://www.mobilesentrix.eu/), [Création de compte](https://www.mobilesentrix.eu/customer/account/retail/), [FAQ EU](https://www.mobilesentrix.eu/frequently-asked-questions) (CONFIRMÉ via extraits).
- Livraison annoncée vers les Pays-Bas, la France, l'Allemagne, l'Italie et toute l'Europe ; Chronopost et DHL cités. Tarifs France non trouvés — [MobileSentrix EU](https://www.mobilesentrix.eu/).
- **API : CONFIRMÉE mais réservée aux partenaires.** Extrait de la FAQ : « Do you have an API? Yes, we do have an API. We are partnered with RepairDesk and MyRepairApp to manage all our API-related processes. » — [MobileSentrix FAQ](https://www.mobilesentrix.com/frequently-asked-questions).
- Le dépôt GitHub « Mobilesentrix/ms-product-upload-backend » est un service interne d'envoi d'images par SKU (« no authentication. Run it behind the internal gateway »). Ce n'est pas une API partenaire — [GitHub](https://github.com/Mobilesentrix/ms-product-upload-backend).
- RepairDesk (mise à jour produit d'août 2026) : OrderSync prend désormais en charge MobileSentrix EU dans tous les pays membres de l'UE. ScanPro reconnaît les SKU du catalogue EU et récupère « details, pricing, and stock information » — [RepairDesk feedback/updates](https://feedback.repairdesk.co/updates) (ANNONCÉ). Dans un article d'aide RepairDesk, OrderSync ne liste MobileSentrix que pour les US, le Canada et le UK. **Contradiction entre les pages** — [RepairDesk OrderSync](https://help.repairdesk.co/portal/en/kb/articles/ordersync).
- MobileSentrix EU propose la livraison gratuite sur la commande suivante quand on lie son compte à RepairDesk — [MobileSentrix EU](https://www.mobilesentrix.eu/) (ANNONCÉ).
- RepairPlugin cite MobileSentrix « EU/USA/UK/CA » parmi ses intégrations — [RepairPlugin suppliers](https://repairplugin.com/suppliers).

**Mobileparts.shop / 2Service (NL) — distributeur officiel Samsung**
- « Mobileparts.shop is een initiatief van 2Service, officieel partner van Samsung voor de onderdelendistributie » ; c'est la boutique B2B de 2Service — [2Service Mobileparts.shop](https://2service.nl/mobileparts-shop/), [2Service](https://2service.nl/).
- Accès : « Please mail to sales@2service.nl for our wholesale stock list or request for a dealer login on www.mobileparts.shop for smaller orders » ; un compte B2B est requis pour les prix revendeur ; offres sur mesure pour les gros volumes — [2Service](https://2service.nl/), [2Service Mobileparts.shop](https://2service.nl/mobileparts-shop/). Une **liste de stock grossiste par e-mail** existe donc (CONFIRMÉ) ; son format est à confirmer auprès du fournisseur.
- Samsung confie la vente des kits de self-repair en Europe à des distributeurs agréés, dont ASWO et 2Service — [Samsung Mobile Press](https://www.samsungmobilepress.com/articles/samsung-electronics-expands-the-self-repair-program-to-europe). Le site samsungselfrepair.shop est opéré par 2Service. Mobileparts.shop revendique plus de 500 ateliers aux Pays-Bas et 5 000 en Europe — [samsungselfrepair.shop about](https://samsungselfrepair.shop/en/about-us), [partner](https://samsungselfrepair.shop/en/partner) (ANNONCÉ).
- Qualité : position publique sur les « Service Packs » (100 % original, neuf, venant directement du fabricant) et contrôles anti-contrefaçon — [blog Mobileparts.shop](https://blog.mobileparts.shop/en/transparency-first-ensuring-genuine-samsung-service-packs-in-the-market).
- Aucune API publique trouvée — [recherche](https://2service.nl/mobileparts-shop/). Il est pourtant branché sur le flux de prix de RepairPlugin — [RepairPlugin suppliers](https://repairplugin.com/suppliers).

**Autres grossistes UE connectés à RepairPlugin (ANNONCÉ, non vérifiés individuellement)**
- Euro Mobile Company, 4Phones, Fixje, MobileAdds — [RepairPlugin suppliers](https://repairplugin.com/suppliers). 4Phones (4phones.eu) publie un glossaire des qualités : Service pack, Refurbished, Pulled, OLED-SOFT, OLED-HARD, IN-CELL, COMPATIBLE — [4phones.eu produit](https://4phones.eu/products/for-iphone-13-front-camera).
- REWA annonce une entité « REWA EU » avec une chaîne d'approvisionnement locale — [rewa.tech](https://rewa.tech/es/?p=41837). Pas d'information sur une API.

**Utopya (FR)**
- Grossiste B2B (smartphone, iPhone, Samsung) avec tarifs pro et livraison 24 h — [utopya.fr](https://www.utopya.fr/). Le LinkedIn mentionne des logiciels internes — [LinkedIn Utopya](https://fr.linkedin.com/company/utopya).
- **Aucune API ni aucun flux B2B public trouvé** — [recherche](https://www.utopya.fr/).
- CGV art. 14 : interdiction d'extraire tout ou partie substantielle de la base, et d'extraire de façon répétée et systématique même des parties non substantielles (CPI art. L342-1 et L342-2). Marqueurs de traçage dans la base (14.7). L'interdiction survit à la clôture du compte, sans limite de durée (14.14) — [CGV Utopya](https://www.utopya.fr/c-g-v) (CONFIRMÉ via extrait).

### Inferences
- HYPOTHÈSE forte : Foneday délivre une clé API à ses clients pros, puisqu'un outil tiers demande à l'utilisateur de saisir « sa » clé. C'est la piste la plus directe pour un connecteur MON STOCK prix/stock/prix d'achat. Les conditions d'usage restent à confirmer auprès du fournisseur : droits de stockage, fréquence, usage dans un logiciel tiers.
- HYPOTHÈSE : avec MobileSentrix EU, un éditeur tiers comme MON STOCK n'a sans doute pas d'accès direct à l'API. Il faudrait demander un partenariat, ou passer par RepairDesk ou MyRepairApp.
- Pour les pièces Samsung d'origine (Service Packs), la liste de stock grossiste de 2Service est la source la plus « officielle » en Europe.

### Gaps
- Format, endpoints, CGU, limites de débit, champs (EAN, qualité, paliers) de l'API Foneday : non publics, à confirmer auprès du fournisseur.
- Prix par paliers (tier pricing) chez Foneday, MobileSentrix EU et Mobileparts.shop : non publics (prix après connexion).
- Frais de port exacts vers la France chez MobileSentrix EU et Mobileparts.shop : non trouvés.
- Conditions d'accès exactes de Foneday (TVA, KvK/Kbis, minimum d'achat) : non trouvées.
- Euro Mobile Company, Fixje, MobileAdds, 4Phones : rien sur une API ou sur leurs conditions.
- Non recherchés ou introuvables, faute de budget : Mobile-Parts.nl, Fixpart, Prylar, GSM Parts Center, Parts4Repair.

## Q2 — Fournisseurs américains : API et intégrations ; utiles pour la France ?

### Takeaway
Aux US, la norme est l'intégration de fournisseurs dans les logiciels de réparation : MobileSentrix, Injured Gadgets, Phone LCD Parts, Wholesale Gadget Parts, Parts4Cells, One Source Supplier, Mobilenzo, Nexus Cellular, Balaji Wireless. On n'a trouvé **aucune documentation d'API publique** chez ces fournisseurs. Les accès passent par les éditeurs de logiciels, ou par des identifiants propres à chaque client.

### Cited Findings
- **MobileSentrix US/CA** : avec RepairDesk, import du catalogue complet (storefronts Canada ou US) « in just three clicks », avec images et prix à jour. Pendant la création d'un bon de commande, affichage de l'inventaire et du coût unitaire en temps réel, et envoi des articles dans le panier MobileSentrix d'un clic. Le statut de commande se synchronise — [RepairDesk blog 2020](https://blog.repairdesk.co/2020/01/07/5-reasons-why-you-should-enable-mobilesentrix-integration-with-repairdesk/), [RepairDesk blog 2021](https://blog.repairdesk.co/2021/05/04/8-reasons-your-repair-shop-software-should-have-mobilesentrix-integration/), [RepairDesk blog 2018](https://blog.repairdesk.co/2018/08/15/mobilesentrix-an-improved-integration/) (ANNONCÉ, posts datés). Article d'aide « MobileSentrix Integration For US & Canada » (7-7-2025) — [RepairDesk help](https://help.repairdesk.co/portal/en/kb/articles/mobilesentrix-integration-for-us-canada-7-7-2025).
- **Injured Gadgets** (Norcross, Géorgie ; fondé en 2011) — [about](https://www.injuredgadgets.com/about-injured-gadgets/). Dans RepairDesk : vue de l'inventaire en temps réel, import du catalogue avec correspondance une fois pour toutes vers les catégories, fabricants et appareils, synchronisation des images. Ajout au panier IG via l'API RepairDesk, et application OrderSync qui récupère une commande à partir de son ID IG — [RepairDesk IG integration](https://repairdesk.co/injured-gadgets-integration), [RepairDesk blog 2021](https://blog.repairdesk.co/2021/05/12/injured-gadgets-one-of-the-top-repair-shop-software-integration/), [RepairDesk help IG](https://help.repairdesk.co/portal/en/kb/articles/injured-gadgets-integration). Remise de 3 % pour les membres NWIDA — [NWIDA](https://nwida.org/member-benefits/discounts/ig). Pas de doc d'API publique trouvée ; contact Support@InjuredGadgets.com — [about](https://www.injuredgadgets.com/about-injured-gadgets/).
- **Liste officielle des intégrations fournisseurs de RepairDesk** : MobileSentrix, Phone LCD Parts, Parts4Cells, Nexus Cellular, OneSource Supplier, Balaji Wireless, Wholesale Gadget Parts — [RepairDesk help Vendor Integrations](https://help.repairdesk.co/portal/en/kb/integrations/vendor-integrations). Le blog de novembre 2025 ajoute Injured Gadgets et Mobileenzo — [RepairDesk blog 2025](https://blog.repairdesk.co/2025/11/03/top-integrations-to-look-for-in-a-repair-shop-management-software/). Les deux listes divergent.
- **Wholesale Gadget Parts** : dans RepairDesk, saisie d'un ID de commande WGP qui crée un bon de commande — [RepairDesk help WGP](https://help.repairdesk.co/portal/en/kb/articles/wholesale-gadget-parts-integration). RepairShopr la décrit comme une recherche de pièces avec prix courants — [RepairShopr integrations](https://www.repairshopr.com/integrations).
- **PHP Point Of Sale** : intégrations Injured Gadgets, Wholesale Gadget Parts et Parts4cells, chacune avec son réglage et **ses propres identifiants** — [PHP POS help](https://support.phppointofsale.com/hc/en-us/articles/53260895642132).
- **Phone LCD Parts (PLP)** : partenaire clé de RepairDesk — [RepairDesk Partner](https://www.repairdesk.co/partner-with-us/). Aucune API publique ni information sur la livraison UE trouvées — [recherche](https://blog.repairdesk.co/?p=4398).
- **eTrade Supply, Fixez, GSM Parts Center** : aucune source pertinente trouvée sur une API ou un flux — [recherche eTrade](https://help.flxpoint.com/kb/electronics) (résultats sans rapport).

### Inferences
- HYPOTHÈSE : ces « API » sont des intégrations bilatérales entre fournisseur et éditeur, activées par le compte client du réparateur. Un éditeur tiers doit négocier un partenariat avec chaque fournisseur.
- Pour un réparateur français, les fournisseurs US ajoutent douane, TVA à l'import et délais. Seul MobileSentrix a une entité UE ; les autres présentent un intérêt faible (HYPOTHÈSE, aucune politique UE trouvée).

### Gaps
- Conditions de livraison UE et France d'Injured Gadgets, PLP, WGP, Parts4Cells : non trouvées.
- Existence d'API publiques chez eTrade Supply, Fixez, GSM Parts Center : non trouvée.

## Q3 — Canaux constructeurs (Apple, Samsung) : qui accède aux pièces d'origine, et y a-t-il des données exploitables ?

### Takeaway
Apple vend ses pièces d'origine via Self Service Repair (grand public, France incluse depuis décembre 2022) et via GSX pour les IRP et AASP. Ces derniers doivent avoir un technicien certifié, et l'adhésion IRP est gratuite. Aucun flux de prix ou de stock ouvert à des tiers n'a été trouvé. Côté Samsung, les pièces passent en Europe par des distributeurs agréés (2Service/Mobileparts.shop, ASWO). GSPN est intégré à RepairQ (US) et à Fixably.

### Cited Findings
- Apple Self Service Repair lancé en décembre 2022 dans 8 pays européens dont la France (iPhone 12/13, Mac Apple silicon). Mêmes pièces et mêmes prix que pour le réseau agréé. Location du kit d'outils : 59,95 € pour 7 jours — [Apple Newsroom 2022](https://www.apple.com/newsroom/2022/12/apple-launches-self-service-repair-in-europe/), [MacRumors](https://www.macrumors.com/2022/12/06/apple-self-service-repair-europe/). Diagnostics étendus à 32 pays européens, dont la France, en juin 2024 — [Apple Newsroom 2024](https://www.apple.com/newsroom/2024/06/apple-expands-self-service-repair-diagnostics-support-to-europe/).
- Programme IRP : « no cost to join » ; un technicien certifié Apple est exigé ; pièces et outils d'origine aux mêmes prix que les AASP — [Apple Newsroom 2021](https://www.apple.com/newsroom/2021/03/apples-independent-repair-provider-program-expands-globally/), [MacRumors 2021](https://www.macrumors.com/2021/03/29/apple-expands-independent-repair-program-worldwide/), [Apple IRP](https://support.apple.com/en-in/irp-program). Les IRP passent par GSX pour les manuels et les commandes de pièces. Le périmètre est plus étroit que l'AASP : pas de mail-in, pas de compensation garantie — [Fixably blog AASP](https://www.fixably.com/blog/what-you-need-to-know-if-you-want-to-be-an-apple-authorized-service-provider). Le Self-Servicing Account Program existe en France — [Apple Self-Servicing](https://support.apple.com/self-servicing-account-program).
- Fixably s'intègre à GSX : bons de commande créés et mis à jour automatiquement, liste des pièces par appareil via « View Parts », gestion des substitutions de références par Apple. Les pièces non Apple passent par des bons de commande manuels. Intégration GSPN également — [Fixably KB ordering](https://kb.fixably.com/en_US/stock-management/how-parts-move-through-a-repair-ordering-stock), [Fixably GSX](https://www.fixably.com/features/gsx-integration), [Fixably Part Requests](https://kb.fixably.com/part-requests/part-requests-detailed-overview). Note de version de juin 2026 : suggestions de réapprovisionnement réparties par fournisseur en brouillons de bons de commande — [Fixably KB](https://kb.fixably.com/en_US/stock-management/how-parts-move-through-a-repair-ordering-stock) (ANNONCÉ).
- Samsung Self-Repair en Europe (juin 2023 ; France incluse ; Galaxy S20–S22, Galaxy Book Pro). Distributeurs agréés : ASWO et 2Service — [Samsung Mobile Press](https://www.samsungmobilepress.com/articles/samsung-electronics-expands-the-self-repair-program-to-europe).
- Intégration GSPN pour les Independent Repair Partners via RepairQ (annonce US, 2022) — [ServiceCentral](https://www.servicecentral.com/2022/11/01/gspn-integration/).

### Inferences
- GSX et GSPN sont des portails transactionnels réservés aux prestataires agréés et liés à des dossiers de réparation. Ils ne fournissent pas un catalogue de prix exploitable par une application tierce (HYPOTHÈSE, aucune source ne décrit un tel flux).
- Pour MON STOCK, les pièces Apple « genuine » de façon fiable passent soit par une adhésion IRP (technicien certifié), soit par les prix publics du Self Service Repair Store.

### Gaps
- Statut et conditions actuelles du programme IRP spécifiquement en France, et grille de prix GSX : non trouvés.
- Accès des réparateurs indépendants européens à GSPN : non trouvé.

## Q4 — Logiciels de réparation agrégateurs multi-fournisseurs : lesquels, comment, à quel prix ?

### Takeaway
L'agrégateur européen le plus pertinent est **RepairPlugin** (plugin WordPress, NL/UE). Il synchronise **toutes les 60 min** les prix d'achat, pièces et stocks de plus de 10 grossistes, dont MobileSentrix EU, Foneday, Mobileparts.shop, Euro Mobile Company, 4Phones, Fixje et MobileAdds. Il est conçu pour fixer les prix de réparation d'un site, **pas comme API de données pour un tiers**. **RepairDesk** est l'agrégateur le plus riche aux US et commence à couvrir l'UE via MobileSentrix EU. **Repender** est le logiciel maison de Foneday.

### Cited Findings
- **RepairPlugin** : « RepairPlugin syncs prices, parts and stock from your favourite wholesalers ». Dynamic Pricing récupère les prix fournisseurs toutes les 60 minutes. Règles possibles : moins cher, plus cher ou moyenne entre fournisseurs, plus une marge en % ou en montant fixe, avec plafonds min/max. Si le prix fournisseur manque : prix manuel, sinon « price on request » — [RepairPlugin suppliers](https://repairplugin.com/suppliers), [Dynamic Pricing docs](https://help.repairplugin.com/docs/pricing-and-discounts/dynamic-pricing), [feature page](https://repairplugin.com/features/dynamic-pricing).
  - Taille annoncée : 1 891 modèles et 114 413 pièces (page Suppliers) contre 1 887 modèles et 112 530 pièces (page Dynamic Pricing). Chiffres légèrement contradictoires — mêmes sources.
  - Fournisseurs : MobileSentrix (EU/USA/UK/CA), Mobileparts.shop, Foneday, Euro Mobile Company, 4Phones, Fixje, MobileAdds ; « 10+ » au total. Un fournisseur peut postuler, et un atelier peut inviter le sien (sales@repairplugin.com) — [RepairPlugin suppliers](https://repairplugin.com/suppliers), [features](https://repairplugin.com/features).
  - Prix contradictoires : la page Pricing indique 24 € (Essentials), 49 € (Growth) et 79 € (Scale) par mois en facturation annuelle, avec 30 jours d'essai pour 1 € — [Pricing](https://repairplugin.com/pricing). La doc indique 29 €, 55 € et 95 € par mois en facturation semestrielle, HT — [Plans & Pricing docs](https://help.repairplugin.com/docs/about-repairplugin/plans-and-pricing). Dynamic Pricing n'est inclus que dans Growth et Scale.
  - La méthode de connexion (clé API fournie par l'atelier, ou flux partenaire) n'est pas documentée publiquement — [recherche](https://help.repairplugin.com/docs/about-repairplugin/what-is-repairplugin).
- **RepairDesk** : intégrations fournisseurs (catalogue, coûts et stock en temps réel dans les bons de commande, envoi au panier, OrderSync par ID de commande, ScanPro) — voir Q1 et Q2. Tarifs en USD : Essential à partir de 99 $/mois par boutique, Growth à partir de 149 $/mois par boutique, Advanced sur devis ; essai 14 jours ; plus de 40 intégrations — [Capterra](https://www.capterra.com/p/146659/RepairDesk/), [Software Advice](https://www.softwareadvice.com/retail/repair-desk-profile/), [GetApp](https://www.getapp.com/customer-management-software/a/repairdesk/). Un avis utilisateur juge frustrants les changements de l'intégration MobileSentrix — [Capterra review](https://www.capterra.com/p/146659/RepairDesk/reviews/3089791/). Selon RepairDesk, RepairShopr n'a pas d'intégrations fournisseurs : affirmation de concurrent, contredite par les pages de RepairShopr — [RepairDesk vs RepairShopr](https://www.repairdesk.co/repairdesk-vs-repairshopr/).
- **Repender** (Foneday) : intégration Foneday (panier, réception en stock, prix suivant le coût Foneday) — voir Q1. Aucune autre intégration fournisseur trouvée — [Repender Integrations](https://repender.nl/en/integrations).
- **MyRepairApp** : commande auprès de fournisseurs intégrés comme MobileSentrix et Injured Gadgets ; partenaire officiel de l'API MobileSentrix — [MyRepairApp](https://www.myrepairapp.com/), [MobileSentrix FAQ](https://www.mobilesentrix.com/frequently-asked-questions).
- **RepairShopr** : a commencé à intégrer les catalogues de fournisseurs connus. Cite Wholesale Gadget Parts (recherche avec prix courants) et iFixit (« huge parts supply chain & wholesale pricing ») — [RepairShopr integrations](https://www.repairshopr.com/integrations), [RepairShopr iFixit](https://www.repairshopr.com/ifixit). Intégration eTech Parts historique (2016) — [RepairShopr blog](https://www.repairshopr.com/blog/posts/feature-friday-new-etech-parts-integration). Une demande d'utilisateurs pour des catalogues de fournisseurs UK est restée une simple suggestion — [RepairShopr feedback](https://feedback.repairshopr.com/forums/165658-general/suggestions/10074219-uk-supplier-catalogs).
- **Fixably** : GSX, GSPN, bons de commande manuels pour le non-Apple. Aucune intégration Foneday trouvée — [Fixably KB integrations](https://kb.fixably.com/integrations/what-integrations-does-fixably-have-available).
- **RepairQ** : intégration GSPN Samsung (US) — [ServiceCentral](https://www.servicecentral.com/2022/11/01/gspn-integration/). Aucune intégration de catalogue de pièces aftermarket trouvée.
- **CellSmart POS** : gestion des bons de commande et du réapprovisionnement, à partir de 80 USD. Aucune intégration de catalogue fournisseur trouvée — [Capterra CellSmart](https://www.capterra.co.uk/software/150535/cellsmart-pos).
- **MyGadgetRepairs (MGR)** : page « Third Party Integration » existante — [MGR](https://www.mygadgetrepairs.com/app-integration/). Son contenu (fournisseurs ou non) n'a pas pu être lu.
- **Orderry** : aucun résultat pertinent (résultats sur des pièces auto/industrie) — [recherche](https://automa.net/company/partbase).

### Inferences
- Aucune de ces plateformes ne semble vendre un **accès de données** (API sortante) aux catalogues agrégés. Elles consomment les flux fournisseurs pour leurs propres clients ; la redistribution à un tiers n'est pas évoquée (HYPOTHÈSE, à confirmer auprès de l'éditeur). RepairPlugin connaît manifestement les connecteurs Foneday, MobileSentrix EU et Mobileparts.shop. C'est le meilleur interlocuteur pour savoir *comment* ces grossistes exposent leurs données.
- HYPOTHÈSE : si MON STOCK se présentait comme logiciel intégrateur (à la manière de RepairPlugin, avec bouton « inviter votre fournisseur »), la même voie de partenariat s'ouvrirait auprès de Foneday et MobileSentrix EU.

### Gaps
- Droits d'export ou de réutilisation des données chez RepairPlugin et RepairDesk (API sortante ? CGU ?) : non trouvés.
- Prix de Repender, détail des intégrations de MGR et d'Orderry : non trouvés.
- Phonecheck : non recherché faute de budget, à vérifier séparément.

## Q5 — Synthèse pour MON STOCK : quelle voie pour obtenir prix pro (paliers), stock, qualité et compatibilité ?

### Takeaway
Il n'existe pas de plateforme unique ouverte à un tiers. Voies réalistes, par ordre de confiance : (1) **demander une clé API à Foneday** (API existante, accès client confirmé en pratique) ; (2) **la liste de stock grossiste 2Service/Mobileparts.shop** par e-mail (Samsung d'origine) ; (3) **un partenariat API avec MobileSentrix EU**, aujourd'hui géré par RepairDesk et MyRepairApp ; (4) contacter **RepairPlugin** pour un éventuel accès aux données ou une mise en relation. Utopya reste exclu sauf accord écrit.

### Cited Findings
- L'API Foneday renvoie stock, marque, codes modèle et prix d'achat par SKU — [Chrome Web Store](https://chromewebstore.google.com/detail/foneday-prijscalculator/andbakcpndhnkaccilaapgghdmcladci).
- La liste de stock grossiste 2Service est sur demande (sales@2service.nl) — [2Service](https://2service.nl/).
- L'API MobileSentrix passe par RepairDesk et MyRepairApp — [MobileSentrix FAQ](https://www.mobilesentrix.com/frequently-asked-questions).
- RepairPlugin agrège plus de 10 grossistes UE avec une synchronisation horaire — [RepairPlugin suppliers](https://repairplugin.com/suppliers), [Dynamic Pricing docs](https://help.repairplugin.com/docs/pricing-and-discounts/dynamic-pricing).
- Les CGV Utopya interdisent toute extraction systématique — [CGV Utopya](https://www.utopya.fr/c-g-v).

### Inferences
- Les données de qualité (Service Pack, OLED soft/hard, Incell, Pulled, Compatible) sont standardisées dans le marketing de grossistes UE comme 4Phones — [4phones.eu](https://4phones.eu/products/for-iphone-13-front-camera). Leur présence comme champs structurés dans les API reste une HYPOTHÈSE.
- Questions à envoyer à chaque fournisseur : champs de l'API (EAN, qualité, compatibilité, paliers), droit de stockage et d'affichage dans un logiciel tiers, fréquence ou limites de synchronisation, commande par API, conditions d'ouverture de compte (TVA intracommunautaire, Kbis).

### Gaps
- Aucun prix par palier, MOQ ni tarif France confirmé publiquement chez aucun des candidats.
- Possibilité de commander par API : confirmée seulement indirectement (panier envoyé depuis RepairDesk ou Repender). Rien pour une application tierce indépendante.
