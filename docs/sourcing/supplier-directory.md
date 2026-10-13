# Répertoire des fournisseurs — MON STOCK

Vérification du 13/10/2026. Fichier complet (toutes les colonnes, sources) : [`supplier-directory.csv`](supplier-directory.csv) (séparateur `;`, UTF-8).

**Niveaux de vérification** (du plus fort au plus faible) :

1. **Prix réels récupérés** : le serveur MON STOCK a réellement relevé des produits et des prix (table `sourcing_library_checks`, 13/10 04:23 UTC).
2. **Site joint par le serveur** : le site répond, plateforme et robots.txt relevés (table `supplier_directory_checks`, 13/10 05:41 UTC). L'activité commerciale et les conditions ne sont pas pour autant vérifiées.
3. **Extraits de recherche** : informations tirées des extraits des résultats de recherche ; les pages n'ont pas pu être ouvertes depuis l'environnement de travail (accès réseau restreint).
4. **Injoignable / anti-robot** : le serveur a reçu une erreur, un délai dépassé ou un HTTP 403 (protection anti-robot, à consulter à la main).

Les champs inconnus restent « unknown ». Le score n'est calculé que sur les critères pour lesquels une preuve existe : « 42/55 » = 42 points sur 55 points évaluables.

Colonne « Accès » : 1 prix publics · 2 inscription simple · 3 compte client · 4 compte pro (justificatifs) · 5 commercial / devis · 6 API ou flux · 7 marketplace / lots.

## A. Smartphones (100)

| Prio | Fournisseur | Pays | Accès | Prix publics | Pro exigé | Flux / API | Vérification | Score | Prochaine action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | [eBay (marketplace + Browse API)](https://www.ebay.fr) | ? | 1, 6, 7 | yes | not_observed | api (Browse API: GET /item_summary/searc… | Prix réels récupérés par le serveur (13/10) | 72/100 | Create eBay developer app; prototype Browse API searches (GTIN/category) on EBAY… |
| P1 | [Refreshed Apples B.V.](https://www.refreshedapples.com/) | NL | 1, 6, 7 | partial | unknown | export: live Google Sheets price list + … | Prix réels récupérés par le serveur (13/10) | 67/100 | Read deals page/Google Sheet regularly; confirm VAT regime (margin?), shipping c… |
| P1 | [Foxway Reseller Store](https://resellers.foxway.com/) | EE | 3, 4, 5, 7 | no | required_verified | unknown (webshop integration into resell… | Site joint par le serveur (13/10) | 51/70 | Apply for reseller account with SIRET/VAT; ask account manager about MOQ 2000 EU… |
| P1 | [Mobilax](https://www.mobilax.fr/) | FR | 3, 4 | no | required_verified | none_seen | Site joint par le serveur (13/10) | 40/50 | Open pro account (Kbis+RIB); ask for CSV/price-list export or API; read CGV data… |
| P1 | [Inrego (trading / IT reseller programme)](https://inrego-nav.inly.app/trading) | SE | 4, 5, 6 | no | unknown | export (stocklists; format unknown) | Extraits de recherche uniquement | 34/45 | Request stocklist + reseller programme sign-up; confirm France shipping cost and… |
| P1 | [LCD-Phone (lcd-phone.com)](https://lcd-phone.com) | FR | 1, 4 | partial | unknown | unknown | Extraits de recherche uniquement | 27/45 | Open pro account; check whether prices visible after login; ask export. |
| P1 | [ThePhoneHub](https://www.thephonehub.eu/) | BE | 5, 6 | no | unknown | csv: 'CSV Live Link' feed with real-time… | Site joint par le serveur (13/10) | 25/45 | Email hello@thephonehub.eu for CSV Live Link + API docs, MOQ, VAT treatment and … |
| P1 | [TelePart Distribution GmbH](https://www.telepart.com/) | DE | 3, 5, 6 | no | unknown | unknown: 'web shop with optional interfa… | Site joint par le serveur (13/10) | 22/35 | Register as new customer; ask about interface (data feed) format, MOQ, shipping … |
| P1 | [Itancia (Again)](https://itancia.com/itancia-technology-grossiste-informatique/) | FR | 4, 5 | no | unknown | unknown | Extraits de recherche uniquement | 17/25 | Contact Itancia Technology for reseller account conditions. |
| P2 | [Mobile Depot Europe (Taqat BV)](https://www.mobiledepot.eu/) | NL | 1, 2, 5 | partial | unknown | export: daily stock list via email; cust… | Site joint par le serveur (13/10) | 40/90 | Subscribe to stock list with business email; verify company on VIES/KvK. |
| P2 | [DistriHUB (Varle.lt)](https://distrihub.eu/) | LT | 4, 6 | no | required_verified | api/xml/json/csv/edi feeds; native BaseL… | Site joint par le serveur (13/10) | 28/45 | Request buyer verification and feed sample; check smartphone depth/prices vs spe… |
| P2 | [avophone B2B](https://avophone.eu/) | DE | 3 | no | unknown | unknown | Extraits de recherche uniquement | 25/50 | Register on b2b.avophone.eu; confirm pro proof needed, MOQ, VAT (margin vs norma… |
| P2 | [AfB social & green IT (B2B shop)](https://www.afbshop.de/b2b) ⚠︎ domaine non confirmé | DE | 1, 4 | yes | unknown | none_seen | Injoignable / anti-robot (serveur, 13/10) | 20/30 | Check afbshop.de/b2b live + AfB France reseller terms; AWIN feed may give produc… |
| P2 | [Recommerce Group](https://www.recommerce-solutions.com/produits-mobiles-reconditionnes/) | FR | 5 | no | unknown | unknown | Site joint par le serveur (13/10) | 19/25 | Contact B2B sales to ask about reseller/wholesale lots for small French reseller… |
| P2 | [Exertis (Europe)](https://www.exertis.fr/) ⚠︎ domaine non confirmé | IE | 4, 5, 6 | no | unknown | csv (price file via SFTP, daily or weekl… | Injoignable / anti-robot (serveur, 13/10) | 15/20 | Identify Exertis entity serving France; request reseller account and SFTP CSV pr… |
| P2 | [ITP Technologie](https://www.itp-technologie.com/) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | 9/10 | Check account/pricing model and stock list. |
| P2 | [Repargsm](https://repargsm.com/fr/2404-devices-smartphone-grossiste-piece-mobile-telephone) | FR | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | 7/10 | Check pricing visibility and pro account requirements. |
| P2 | [Callisto](https://callisto.tech/wholesale-used-smartphones-on-callisto) | ? | 4, 5, 7 | unknown | required_verified | unknown | Site joint par le serveur (13/10) | 6/15 | Check buyer onboarding, fees, EU stock share. |
| P2 | [Infortisa](https://www.infortisa.com/categoria/telefonia-y-fax/moviles-seminuevos/) | ES | 3 | unknown | unknown | unknown | Site joint par le serveur (13/10) | 6/15 | Check registration requirements for French companies and data feed availability … |
| P2 | [Merkandi](https://merkandi.com/categories/smartphones-mobile-phones/87) | PL | 1, 2, 7 | partial | unknown | none_seen | Injoignable / anti-robot (serveur, 13/10) | 6/15 | Check whether prices visible without login; vet individual sellers. |
| P2 | [B-Stock Europe](https://bstock.com/auctions/europe/) | US | 4, 7 | partial | required_verified | none_seen | Site joint par le serveur (13/10) | 5/10 | Apply as approved buyer; filter IT/laptop lots. |
| P2 | [Sellify](https://www.sellify.market/) | ? | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | 5/15 | Check registration requirements and fees. |
| P2 | [HUBX](https://app.dealroom.co/companies/hubx_1_2) | US | 4, 5, 7 | no | required_verified | unknown | Extraits de recherche uniquement | — | Apply for buyer account; check EU shipping / import costs. |
| P2 | [iPremia Group](https://www.refurbed.ie/m/1873) | CZ | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Contact for B2B Apple stock list. |
| P2 | [Minpex](https://minpex.com/) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check location, account model, pulled parts |
| P3 | BVA Auctions ⚠︎ domaine non confirmé | NL | 1, 7 | yes | unknown | unknown | Extraits de recherche uniquement | 18/40 | Check current electronics categories and auction fees |
| P3 | [Westock Europe](https://westock-europe.fr/) | FR | 3 | unknown | unknown | unknown | Extraits de recherche uniquement | 14/35 | Low trust; only check if others fail. |
| P3 | [gsmExchange](https://www.gsmexchange.com/) | GB | 4, 5, 7 | no | required_verified | unknown | Site joint par le serveur (13/10) | 13/30 | Later stage: membership cost vs value; 12-month history requirement may block a … |
| P3 | [Destockplus](https://www.destockplus.com/) | FR | 1, 4, 5, 7 | partial | unknown | unknown (Contentserv connector exists fo… | Site joint par le serveur (13/10) | 12/25 | Use for sourcing leads only; vet each seller. |
| P3 | [Restposten.de](https://www.restposten.de/multimedia-elektro/handy-smartphones/) | DE | 1, 4, 7 | partial | required_verified | unknown | Site joint par le serveur (13/10) | 9/30 | Monitor listings for smartphone lots; vet sellers. |
| P3 | [Rinophone](https://www.rinophone.com/) | FR | 5 | unknown | unknown | none_seen | Extraits de recherche uniquement | 9/10 | Call for pro terms |
| P3 | [GSM Brokers](https://gsmbrokers.com/) | ? | 2, 7 | no | unknown | unknown (stock lists, format unknown) | Extraits de recherche uniquement | 8/25 | Join free, inspect stock list format and identity of warehouses. |
| P3 | [Largo](https://largo-finance.com/fr/) | FR | 5 | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | 8/10 | Verify company status in 2026 before contact. |
| P3 | [Partly](https://www.partly.nl/groothandel/) | NL | 4, 5 | unknown | required_verified | none_seen | Extraits de recherche uniquement | 7/20 | Ask if non-NL businesses accepted |
| P3 | [B2B Mobile Wholesalers](https://www.b2bmobilewholesalers.com/) | GB | 1, 2, 5 | partial | unknown | export: daily stock list by email | Extraits de recherche uniquement | 6/15 | Verify legal entity & VAT; check post-Brexit NI customs/VAT for France. |
| P3 | [Telecomback](https://www.europages.fr/entreprises/france/grossiste/iphone-reconditionne.html) | FR | ? | unknown | unknown | unknown | Extraits de recherche uniquement | 6/10 | Find official site and B2B terms. |
| P3 | [AB S.A.](https://www.ab.pl) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Action S.A.](https://www.action.pl/en/about-action/e-commerce) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Amazon Retourenkauf (Amazon Warehouse DE)](https://www.amazon.de) ⚠︎ domaine non confirmé | DE | 1 | yes | unknown | unknown | Extraits de recherche uniquement | — | Low priority (retail pricing) |
| P3 | [Aseuropa](https://www.aseuropa.com/) | ES | ? | unknown | unknown | unknown | Extraits de recherche uniquement | — | Check account model. |
| P3 | [B2B Mobiles Europe](https://www.b2bmobiles.eu/) | ES | ? | unknown | unknown | unknown | Extraits de recherche uniquement | — | Check VIES and stock offer. |
| P3 | [b2b-grosshaendleradressen.de](https://www.b2b-grosshaendleradressen.de/kategorie/alle-grosshandelsangebote/handy-und-smartphone/) | DE | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Lead source only. |
| P3 | [Back Market Pro](https://pro.backmarket.fr/) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Bestellaptops.nl (Laptop Groothandel)](https://bestellaptops.nl/) | NL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [bluechip Computer AG](https://www.bluechip.de) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Brodos AG](https://brodos.com/) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Certideal](https://eu.certideal.com) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Device Network (B2B trading platform)](https://ae.linkedin.com/company/device-network) | GB | 4, 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Check laptop listings at b2b.devicenetwork.com. |
| P3 | [DMI Computer](https://www.dmi.es/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Easycash](https://www.easycash.fr) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [EB-TECH](https://eb-tech.fr/) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Ecoportátil](https://ecoportatil.es/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Euro Mobile Company](https://euromobilecompany.com/en/parts) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Identify country and terms |
| P3 | [Fixje Zakelijk](https://www.fixje.nl/zakelijk/) | NL | 1, 3, 4, 5 | yes | required_verified | none_seen | Prix réels récupérés par le serveur (13/10) | — | Ask whether they sell to foreign resellers and pricing. |
| P3 | [Flashmac B2B](https://www.flashmac.com/) | IT | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Global ICT Connections](https://globalictconnections.com/gsm-compare) | ? | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Low priority; check traders listed. |
| P3 | [Globomatik](https://www.globomatik.com/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Handelot](https://www.handelot.com/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [HK Refurbished Stock](https://hk-refurbished-stock.com/buy-iphones-wholesale/) | ? | ? | unknown | unknown | unknown | Extraits de recherche uniquement | — | Identify country/entity, check if EU stock. |
| P3 | [Home Screen Distribution](https://b2b.homescreen.pl/en/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Incom Group](https://www.incomgroup.pl/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Ingram Micro (France / Xvantage)](https://fr.ingrammicro.eu/) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Ingrosmart](https://www.ingrosmart.it/outlet/smartphone-ricondizionati-grado-b.html) | IT | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Ask if they ship to France. |
| P3 | [iOutlet Business (The iOutlet, trade)](https://business.theioutlet.com/) | GB | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Jarltech](https://www.jarltech.com) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [KOMSA](https://komsa.com/) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [LDLC.pro](https://www.ldlc.pro) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Liquidation.com (Liquidity Services)](https://www.liquidation.com) ⚠︎ domaine non confirmé | US | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | US-only practicality doubtful for FR; verify export terms |
| P3 | [Megasur](https://www.megasur.es/) | ES | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |
| P3 | [MICHAEL AG (Michael Telecom)](https://www.michael-ag.de/) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Miwo](https://www.miwo.it/ingrosso-iphone-rigenerati) | IT | ? | unknown | unknown | unknown | Extraits de recherche uniquement | — | Verify activity. |
| P3 | Mobile Express (HDE Global Mobile Tech B.V.) ⚠︎ domaine non confirmé | NL | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |
| P3 | [Mobile Phones Factory](https://www.mobilephonesfactory.com/wholesale/marginal-vat) | ? | ? | unknown | unknown | unknown | Extraits de recherche uniquement | — | Verify identity; likely duplicate network of eumobilewholesalers. |
| P3 | [Mobistock BV](https://www.mobistock.nl/) | NL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | MOLOR Electronics ⚠︎ domaine non confirmé | DE | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Contact for surplus phone lots |
| P3 | [Nedis (Nedis Connect)](https://nedis.com/en-us/business) | NL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Omnicomp](https://omnicomp.de/) | DE | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |
| P3 | [Partner Tele.com](https://partnertele.com/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [PC Ricondizionati](https://www.pc-ricondizionati.com/) | IT | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [PC-Portátil (mayorista informática segunda mano)](https://www.pc-portatil.com/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Portatilmovil](https://www.portatilmovil.com/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Prodealee (Wedealee SAS)](https://www.grossiste-telephone.com/) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [RecirQ](https://www.recirqglobal.com/) | US | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Low priority (non-EU). |
| P3 | [Reebelo B2B marketplace](https://www.refurb.me/refurbishers/specs-comparison/wholesale) | ? | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Check EU availability. |
| P3 | [Refurbished Phones & Laptops](https://www.europages.fr/entreprises/france/grossiste/iphone-reconditionne.html) | FR | ? | unknown | unknown | unknown | Extraits de recherche uniquement | — | Find official site; verify SIREN. |
| P3 | [SE Marin Aktiebolag](https://www.europages.es/empresas/tel%C3%A9fonos%20m%C3%B3viles%20reacondicionados.html) | SE | ? | unknown | unknown | unknown | Extraits de recherche uniquement | — | Find official site. |
| P3 | [Selec Sp. z o.o.](https://www.ifa-berlin.com/exhibitors/selec-sp-z-o-o) | PL | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Request stock list and terms; verify company registration. |
| P3 | [Smaaart (groupe Econocom)](https://smaaart.fr/) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [SmartChoice](https://shop.smartchoice.ee/) | EE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Smartphone Italia](https://smartphoneitalia.it/it/) | IT | 4 | no | required_verified | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Ask whether EU (FR) VAT numbers accepted. |
| P3 | [Spectrum International](https://www.europages.fr/entreprises/france/grossiste/iphone.html) | FR | ? | unknown | unknown | unknown | Extraits de recherche uniquement | — | Find official site. |
| P3 | [Swappie (business)](https://business.swappie.com/services/) | FI | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Not a supply source unless they confirm wholesale outflow sales. |
| P3 | [Telefactory (Telefabryka)](https://telefabryka.com/hurtownia.html) | PL | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Ask for stock list and EU shipping. |
| P3 | [The Phone Shopper](https://thephoneshopper.nl/zakelijk) | NL | 3, 4 | unknown | required_verified | unknown | Extraits de recherche uniquement | — | Low: end-user B2B rather than reseller wholesale. |
| P3 | [TR Vertriebs GmbH](https://www.tr-vertrieb.de/) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [WakePhone](https://www.wakephone.com/) | ? | 5 | no | unknown | unknown | Extraits de recherche uniquement | — | Request price list; verify entity. |
| P3 | [Westcoast](https://www.westcoast.co.uk/) ⚠︎ domaine non confirmé | GB | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |
| P3 | [WORTMANN AG](https://portal.wortmann.de) | DE | 4, 5 | no | unknown | unknown (resellers rated price/stock inf… | Site joint par le serveur (13/10) | — | Ask Wortmann whether French resellers can buy and whether a CSV/XML price feed e… |
| P3 | [XMBO Trading](https://www.xmbo.com/de/restposten-handys) | ? | ? | unknown | unknown | unknown | Extraits de recherche uniquement | — | Verify still active. |
| P3 | YesYes ⚠︎ domaine non confirmé | FR | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |

## B. Ordinateurs / tablettes (87)

| Prio | Fournisseur | Pays | Accès | Prix publics | Pro exigé | Flux / API | Vérification | Score | Prochaine action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | [eBay (marketplace + Browse API)](https://www.ebay.fr) | ? | 1, 6, 7 | yes | not_observed | api (Browse API: GET /item_summary/searc… | Prix réels récupérés par le serveur (13/10) | 72/100 | Create eBay developer app; prototype Browse API searches (GTIN/category) on EBAY… |
| P1 | [Refreshed Apples B.V.](https://www.refreshedapples.com/) | NL | 1, 6, 7 | partial | unknown | export: live Google Sheets price list + … | Prix réels récupérés par le serveur (13/10) | 67/100 | Read deals page/Google Sheet regularly; confirm VAT regime (margin?), shipping c… |
| P1 | [TD SYNNEX Europe (ex Tech Data) - real-time P&A](https://www.tdsynnex.com) | US | 4, 5, 6 | no | required_verified | api (Europe real-time price & availabili… | Site joint par le serveur (13/10) | 53/60 | Contact TD SYNNEX France to open reseller account and request real-time P&A cred… |
| P1 | [Foxway Reseller Store](https://resellers.foxway.com/) | EE | 3, 4, 5, 7 | no | required_verified | unknown (webshop integration into resell… | Site joint par le serveur (13/10) | 51/70 | Apply for reseller account with SIRET/VAT; ask account manager about MOQ 2000 EU… |
| P1 | [Ingram Micro (Xvantage) - reseller APIs](https://developer.ingrammicro.com/) | US | 4, 5, 6 | no | required_verified | api (JSON REST: catalog, price & availab… | Extraits de recherche uniquement | 47/50 | Open Ingram Micro France reseller account (SIRET/Kbis), then register on develop… |
| P1 | [Inrego (trading / IT reseller programme)](https://inrego-nav.inly.app/trading) | SE | 4, 5, 6 | no | unknown | export (stocklists; format unknown) | Extraits de recherche uniquement | 34/45 | Request stocklist + reseller programme sign-up; confirm France shipping cost and… |
| P1 | [LCD-Phone (lcd-phone.com)](https://lcd-phone.com) | FR | 1, 4 | partial | unknown | unknown | Extraits de recherche uniquement | 27/45 | Open pro account; check whether prices visible after login; ask export. |
| P1 | [TelePart Distribution GmbH](https://www.telepart.com/) | DE | 3, 5, 6 | no | unknown | unknown: 'web shop with optional interfa… | Site joint par le serveur (13/10) | 22/35 | Register as new customer; ask about interface (data feed) format, MOQ, shipping … |
| P1 | [Itancia (Again)](https://itancia.com/itancia-technology-grossiste-informatique/) | FR | 4, 5 | no | unknown | unknown | Extraits de recherche uniquement | 17/25 | Contact Itancia Technology for reseller account conditions. |
| P2 | [Mobile Depot Europe (Taqat BV)](https://www.mobiledepot.eu/) | NL | 1, 2, 5 | partial | unknown | export: daily stock list via email; cust… | Site joint par le serveur (13/10) | 40/90 | Subscribe to stock list with business email; verify company on VIES/KvK. |
| P2 | [Esprinet (espriCATALOG / espriREALTIME)](https://esprinet.com/en/offer/services/digital-and-e-commerce-services/espricatalog-and-esprirealtime) | IT | 4, 6 | no | unknown | export/api (espriCATALOG database of mas… | Site joint par le serveur (13/10) | 32/45 | Ask Esprinet whether a French company can open an account (IT/ES entity) and shi… |
| P2 | [DistriHUB (Varle.lt)](https://distrihub.eu/) | LT | 4, 6 | no | required_verified | api/xml/json/csv/edi feeds; native BaseL… | Site joint par le serveur (13/10) | 28/45 | Request buyer verification and feed sample; check smartphone depth/prices vs spe… |
| P2 | [avophone B2B](https://avophone.eu/) | DE | 3 | no | unknown | unknown | Extraits de recherche uniquement | 25/50 | Register on b2b.avophone.eu; confirm pro proof needed, MOQ, VAT (margin vs norma… |
| P2 | [AppleParts](https://appleparts.pl/) | PL | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | 21/45 | Confirm EU shipping to France, PLN->EUR, invoice with VAT, B2B terms |
| P2 | [AfB social & green IT (B2B shop)](https://www.afbshop.de/b2b) ⚠︎ domaine non confirmé | DE | 1, 4 | yes | unknown | none_seen | Injoignable / anti-robot (serveur, 13/10) | 20/30 | Check afbshop.de/b2b live + AfB France reseller terms; AWIN feed may give produc… |
| P2 | [Recommerce Group](https://www.recommerce-solutions.com/produits-mobiles-reconditionnes/) | FR | 5 | no | unknown | unknown | Site joint par le serveur (13/10) | 19/25 | Contact B2B sales to ask about reseller/wholesale lots for small French reseller… |
| P2 | [Exertis (Europe)](https://www.exertis.fr/) ⚠︎ domaine non confirmé | IE | 4, 5, 6 | no | unknown | csv (price file via SFTP, daily or weekl… | Injoignable / anti-robot (serveur, 13/10) | 15/20 | Identify Exertis entity serving France; request reseller account and SFTP CSV pr… |
| P2 | [it-versand.com (NET Online-Versand GmbH & Co. KG)](https://it-versand.com/en/collections/b2b) | DE | 1 | yes | not_observed | none_seen (Shopify .oembed endpoints exi… | Extraits de recherche uniquement | 14/20 | Ask service@it-versand.com for reseller pricing/volume terms; public catalog rea… |
| P2 | Sens Technologies ⚠︎ domaine non confirmé | FR | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | 10/10 | Find site; ask whether resellers (not only end-business) can buy. |
| P2 | [Callisto](https://callisto.tech/wholesale-used-smartphones-on-callisto) | ? | 4, 5, 7 | unknown | required_verified | unknown | Site joint par le serveur (13/10) | 6/15 | Check buyer onboarding, fees, EU stock share. |
| P2 | [Infortisa](https://www.infortisa.com/categoria/telefonia-y-fax/moviles-seminuevos/) | ES | 3 | unknown | unknown | unknown | Site joint par le serveur (13/10) | 6/15 | Check registration requirements for French companies and data feed availability … |
| P2 | [Merkandi](https://merkandi.com/categories/smartphones-mobile-phones/87) | PL | 1, 2, 7 | partial | unknown | none_seen | Injoignable / anti-robot (serveur, 13/10) | 6/15 | Check whether prices visible without login; vet individual sellers. |
| P2 | [Repairbase EU](https://repairbase.eu/) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | 6/10 | Check price visibility, account |
| P2 | [B-Stock Europe](https://bstock.com/auctions/europe/) | US | 4, 7 | partial | required_verified | none_seen | Site joint par le serveur (13/10) | 5/10 | Apply as approved buyer; filter IT/laptop lots. |
| P2 | [Komputronik (B2B wholesale)](https://www.ifa-berlin.com/exhibitors/komputronik) | PL | 4, 6 | partial | unknown | xml/csv/api (stated on IFA exhibitor pro… | Extraits de recherche uniquement | 4/5 | Contact Komputronik B2B for EU export terms, ex-lease/refurb range and feed spec… |
| P2 | [ALSO (ALSO Holding)](https://www.also.com/ec/cms5/en_5110/5110/services/digital-services/index.jsp) | CH | 4, 5 | no | unknown | unknown (only cloud marketplace document… | Site joint par le serveur (13/10) | — | Ask ALSO France account manager about hardware price/stock export or API. |
| P2 | [HUBX](https://app.dealroom.co/companies/hubx_1_2) | US | 4, 5, 7 | no | required_verified | unknown | Extraits de recherche uniquement | — | Apply for buyer account; check EU shipping / import costs. |
| P2 | [iPremia Group](https://www.refurbed.ie/m/1873) | CZ | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Contact for B2B Apple stock list. |
| P3 | BVA Auctions ⚠︎ domaine non confirmé | NL | 1, 7 | yes | unknown | unknown | Extraits de recherche uniquement | 18/40 | Check current electronics categories and auction fees |
| P3 | [ITJustGood](https://www.itjustgood.com/pc-portable/ordinateur-portable-occasion/prix-200,3999.html) | FR | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | 14/15 | Use as French price benchmark; ask about pro volume pricing. |
| P3 | [gsmExchange](https://www.gsmexchange.com/) | GB | 4, 5, 7 | no | required_verified | unknown | Site joint par le serveur (13/10) | 13/30 | Later stage: membership cost vs value; 12-month history requirement may block a … |
| P3 | [Destockplus](https://www.destockplus.com/) | FR | 1, 4, 5, 7 | partial | unknown | unknown (Contentserv connector exists fo… | Site joint par le serveur (13/10) | 12/25 | Use for sourcing leads only; vet each seller. |
| P3 | Ecodair ⚠︎ domaine non confirmé | FR | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | 10/10 | Ask whether they sell to resellers in volume. |
| P3 | Okamac ⚠︎ domaine non confirmé | FR | 1 | yes | not_observed | none_seen (AWIN/FlexOffers affiliate) | Extraits de recherche uniquement | 10/10 | Price benchmark only; ask about volume pricing. |
| P3 | [Largo](https://largo-finance.com/fr/) | FR | 5 | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | 8/10 | Verify company status in 2026 before contact. |
| P3 | [B2B Mobile Wholesalers](https://www.b2bmobilewholesalers.com/) | GB | 1, 2, 5 | partial | unknown | export: daily stock list by email | Extraits de recherche uniquement | 6/15 | Verify legal entity & VAT; check post-Brexit NI customs/VAT for France. |
| P3 | [ComputerG (B2B programme)](https://www.computerg.shop/apple-devices) | ? | 1, 4, 5 | yes | unknown | none_seen | Extraits de recherche uniquement | 3/5 | Verify company; request B2B tiers. |
| P3 | [4Repair.pl](https://4repair.pl/) | PL | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check EU shipping |
| P3 | ABCLAP ⚠︎ domaine non confirmé | PL | 1 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Retail shop; ask for wholesale pricing. |
| P3 | [Alibaba.com (used/refurbished laptops & accessorie…](https://electronics.alibaba.com/product/used-laptops-europe) | CN | 1, 2, 5, 7 | yes | not_observed | none_seen | Extraits de recherche uniquement | — | Only for accessories/chargers sampling; verify sellers and customs/VAT. |
| P3 | [Amazon Retourenkauf (Amazon Warehouse DE)](https://www.amazon.de) ⚠︎ domaine non confirmé | DE | 1 | yes | unknown | unknown | Extraits de recherche uniquement | — | Low priority (retail pricing) |
| P3 | [api Computerhandels GmbH (Shop2go)](https://www.api.de) | DE | 4 | no | unknown | unknown (Shop2go reseller shop; no expor… | Extraits de recherche uniquement | — | Check whether api sells to French resellers and whether Shop2go offers CSV/XML. |
| P3 | [Aseuropa](https://www.aseuropa.com/) | ES | ? | unknown | unknown | unknown | Extraits de recherche uniquement | — | Check account model. |
| P3 | [Back Market Pro](https://pro.backmarket.fr/) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Bestellaptops.nl (Laptop Groothandel)](https://bestellaptops.nl/) | NL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [BigBuy](https://www.bigbuy.eu/fr/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Cerona](https://www.cerona.de/?p=66) | DE | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Ask for buyer list / stock offers. |
| P3 | [Certideal](https://eu.certideal.com) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Copaco (BE/NL)](https://www.copaco.com) | NL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Delwi IT Remarketing GmbH](https://www.ebay.com/str/delwiitr) | DE | 1, 7 | yes | not_observed | none_seen | Extraits de recherche uniquement | — | Ask for B2B stock list. |
| P3 | [dexxIT](https://www.ifa-berlin.com/exhibitors/dexxit) | ? | 4 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Identify official site and reseller terms. |
| P3 | [DSL-Tech B.V.](https://www.refurbed.de/m/327d166d-04db-43c9-a27d-56b9028ebb19/) | NL | 5 | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Ask whether B2B wholesale stocklists exist. |
| P3 | [Easycash](https://www.easycash.fr) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | Econocom (remarketing / end-of-lease) ⚠︎ domaine non confirmé | FR | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Ask Econocom remarketing whether they sell ex-lease lots to resellers. |
| P3 | [Ecoportátil](https://ecoportatil.es/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [ELKO Group (eCom)](https://www.elkogroup.com/products/) | LV | 4 | no | unknown | unknown (eCom wholesale online shop; no … | Extraits de recherche uniquement | — | Ask ELKO whether France is served and whether eCom provides XML export. |
| P3 | [Fixje Zakelijk](https://www.fixje.nl/zakelijk/) | NL | 1, 3, 4, 5 | yes | required_verified | none_seen | Prix réels récupérés par le serveur (13/10) | — | Ask whether they sell to foreign resellers and pricing. |
| P3 | [Flashmac B2B](https://www.flashmac.com/) | IT | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Global Sources (used laptops suppliers)](https://www.globalsources.com/category/used-laptops-manufacturer-supplier_50678/) | HK | 5, 7 | partial | unknown | none_seen | Extraits de recherche uniquement | — | Low priority. |
| P3 | [Handelot](https://www.handelot.com/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Hurtel](https://hurtel.com) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [iOutlet Business (The iOutlet, trade)](https://business.theioutlet.com/) | GB | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Kosatec](https://kosatec.de) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Life365](https://www.life365.eu) | IT | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Liquidation.com (Liquidity Services)](https://www.liquidation.com) ⚠︎ domaine non confirmé | US | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | US-only practicality doubtful for FR; verify export terms |
| P3 | MDM Komputery ⚠︎ domaine non confirmé | PL | 1 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Ask for B2B/wholesale terms. |
| P3 | Mobile Express (HDE Global Mobile Tech B.V.) ⚠︎ domaine non confirmé | NL | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |
| P3 | [Mobistock BV](https://www.mobistock.nl/) | NL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Molano B.V. (Buy Molano)](https://buymolano.com/) | NL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | Nelro Data ⚠︎ domaine non confirmé | PL | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Verify existence/site and B2B terms. |
| P3 | [neXchance](https://nexchance.de/en/dienstleistungen/remarketing) | DE | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Ask whether they sell lots to resellers (they mainly buy from companies). |
| P3 | [Notebookgalerie (Eppelheim)](https://www.ebay.com/usr/notebookgalerie) | DE | 1, 7 | yes | not_observed | none_seen | Extraits de recherche uniquement | — | Ask for wholesale terms. |
| P3 | [Omnicomp](https://omnicomp.de/) | DE | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |
| P3 | [PC Ricondizionati](https://www.pc-ricondizionati.com/) | IT | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [PC-Portátil (mayorista informática segunda mano)](https://www.pc-portatil.com/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [PhoneMad (Renova PhoneMadrid S.L.)](https://www.phonemadrid.com/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Portatilmovil](https://www.portatilmovil.com/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Reebelo B2B marketplace](https://www.refurb.me/refurbishers/specs-comparison/wholesale) | ? | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Check EU availability. |
| P3 | [Refurbished Phones & Laptops](https://www.europages.fr/entreprises/france/grossiste/iphone-reconditionne.html) | FR | ? | unknown | unknown | unknown | Extraits de recherche uniquement | — | Find official site; verify SIREN. |
| P3 | Revalor ⚠︎ domaine non confirmé | BE | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Find site; ask about reseller volumes. |
| P3 | [Selec Sp. z o.o.](https://www.ifa-berlin.com/exhibitors/selec-sp-z-o-o) | PL | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Request stock list and terms; verify company registration. |
| P3 | [Smaaart (groupe Econocom)](https://smaaart.fr/) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [SmartChoice](https://shop.smartchoice.ee/) | EE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [TR Vertriebs GmbH](https://www.tr-vertrieb.de/) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [WORTMANN AG](https://portal.wortmann.de) | DE | 4, 5 | no | unknown | unknown (resellers rated price/stock inf… | Site joint par le serveur (13/10) | — | Ask Wortmann whether French resellers can buy and whether a CSV/XML price feed e… |
| P3 | [x-kom B2B](https://www.x-kom.pl/aktualnosci/6688-planujesz-wieksze-zakupy-b2b-x-kom-poleca-sprzet-dla-firm.html) | PL | 1, 5 | yes | not_observed | none_seen | Extraits de recherche uniquement | — | Low priority; retail pricing, PL-focused. |
| P3 | YesYes ⚠︎ domaine non confirmé | FR | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |

## C. Pièces Apple (97)

| Prio | Fournisseur | Pays | Accès | Prix publics | Pro exigé | Flux / API | Vérification | Score | Prochaine action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | [eBay (marketplace + Browse API)](https://www.ebay.fr) | ? | 1, 6, 7 | yes | not_observed | api (Browse API: GET /item_summary/searc… | Prix réels récupérés par le serveur (13/10) | 72/100 | Create eBay developer app; prototype Browse API searches (GTIN/category) on EBAY… |
| P1 | [MobileSentrix Europe](https://www.mobilesentrix.eu/) | NL | 1, 3, 4 | yes | unknown | unknown - RepairDesk integration exists … | Site joint par le serveur (13/10) | 65/85 | Create account, confirm FR shipping costs/VAT (reverse charge), ask about API/fe… |
| P1 | [Replace Base](https://www.replacebase.eu/iphone-parts) | GB | 1, 3, 4 | yes | not_observed | none_seen | Site joint par le serveur (13/10) | 44/70 | Check trade discounts, FR shipping cost, ToS |
| P1 | [Mobilax](https://www.mobilax.fr/) | FR | 3, 4 | no | required_verified | none_seen | Site joint par le serveur (13/10) | 40/50 | Open pro account (Kbis+RIB); ask for CSV/price-list export or API; read CGV data… |
| P1 | [Pulled Mac Parts](https://www.pulledmacparts.nl/) | NL | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | 37/75 | Check shipping to France, VAT handling (margin vs normal), B2B discount, ToS on … |
| P1 | [4Phones (4phones.eu)](https://4phones.eu) | ES | 4 | unknown | required_verified | unknown | Site joint par le serveur (13/10) | 35/50 | Apply for pro account; request price list and data export; confirm France shippi… |
| P1 | [iParts4u (UK + Europe/Ireland)](https://www.iparts-4u.eu/) | IE | 3, 4 | partial | unknown | none_seen - note data.iparts-4u.eu subdo… | Extraits de recherche uniquement | 35/50 | Apply for EU trade account (avoid UK customs); ask about data feed |
| P1 | [Pieces2Mobile](https://www.pieces2mobile.com/apple.html) | FR | 1, 3, 4 | yes | unknown | none_seen | Site joint par le serveur (13/10) | 34/45 | Verify current pro account conditions, ToS on catalogue reuse |
| P1 | [SOSav Pro](https://pro.sosav.fr/) | FR | 1, 5 | partial | unknown | none_seen | Site joint par le serveur (13/10) | 29/40 | Contact sales for pro activation; ask for export/API |
| P1 | [Sifar Group (Esprinet group)](https://www.sifar.it) | IT | 4, 5 | unknown | unknown | unknown | Site joint par le serveur (13/10) | 28/30 | Ask whether Sifar sells to French repair shops; request B2B platform access and … |
| P1 | [LCD-Phone (lcd-phone.com)](https://lcd-phone.com) | FR | 1, 4 | partial | unknown | unknown | Extraits de recherche uniquement | 27/45 | Open pro account; check whether prices visible after login; ask export. |
| P1 | [DutchSpares / EuropeSpares](https://www.dutchspares.com/en/) | NL | 3 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | 23/40 | Register, check pulled-OEM pricing and FR shipping |
| P2 | [iFixit (EU store / iFixit Pro)](https://www.ifixit.com/en-eu) | US | 1, 4 | yes | unknown | unknown | Site joint par le serveur (13/10) | 60/100 | Apply to iFixit Pro (EU) for Pixel genuine part wholesale pricing. |
| P2 | [Ekolow](https://ekolow.fr/) | FR | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | 33/70 | Check stock depth on recent models (mostly older Intel models seen), pro pricing… |
| P2 | [GSM Parts Center (GPC)](https://www.gsmpartscenter.com/en/) | NL | 3 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | 24/40 | Register; check price visibility and FR shipping |
| P2 | [AppleParts](https://appleparts.pl/) | PL | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | 21/45 | Confirm EU shipping to France, PLN->EUR, invoice with VAT, B2B terms |
| P2 | [Horepa](https://horepa.fr/fr/) | FR | 3 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | 20/25 | Check pro signup requirements and price visibility |
| P2 | [BestinMac](https://www.ebay.com/str/bestinmac) | FR | 1, 7 | yes | not_observed | none_seen | Extraits de recherche uniquement | 18/30 | Check bestinmac.com directly for pro pricing; eBay API possible for store listin… |
| P2 | [MacTastic_EU (eBay seller)](https://www.ebay.de/itm/357095111927) | NL | 1, 7 | yes | not_observed | none_seen | Extraits de recherche uniquement | 16/30 | eBay Browse API (official) could read listings; check seller store |
| P2 | [CDX](https://www.cdx.de/store/IPHONE-ERSATZTEILE) | DE | 1, 5 | unknown | unknown | none_seen | Extraits de recherche uniquement | 15/25 | Request dealer access; ask FR shipping |
| P2 | [Foneday](https://foneday.shop) | NL | 4 | unknown | unknown | unknown | Site joint par le serveur (13/10) | 15/25 | Check brand coverage (Samsung/Xiaomi), pro-account rules, France shipping. |
| P2 | [iPartsPro](https://ipartspro.eu/) | ? | 3 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | 15/25 | Check company country, price visibility, signup proof |
| P2 | [Mobileparts.shop](https://mobileparts.shop/) | ? | 4, 5 | unknown | unknown | unknown | Site joint par le serveur (13/10) | 12/15 | Verify site, country, access requirements (likely IRP / repair business validati… |
| P2 | [Preciosadictos](https://www.preciosadictos.com/) | ES | 1, 3, 5 | unknown | unknown | none_seen | Extraits de recherche uniquement | 12/15 | Check FR shipping and pro signup |
| P2 | [iShoptor](https://ishoptor.pl/) | PL | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | 10/15 | Check EU shipping to France and B2B terms |
| P2 | [5G-M](https://www.5g-m.com/en/brand/3-apple) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | 9/15 | Identify country, prices, shipping to FR |
| P2 | [cPix](https://cpix.fr/) | FR | 3 | unknown | unknown | none_seen | Extraits de recherche uniquement | 9/10 | Check public prices and pro conditions |
| P2 | [ITP Technologie](https://www.itp-technologie.com/) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | 9/10 | Check account/pricing model and stock list. |
| P2 | [Repargsm](https://repargsm.com/fr/2404-devices-smartphone-grossiste-piece-mobile-telephone) | FR | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | 7/10 | Check pricing visibility and pro account requirements. |
| P2 | [Merkandi](https://merkandi.com/categories/smartphones-mobile-phones/87) | PL | 1, 2, 7 | partial | unknown | none_seen | Injoignable / anti-robot (serveur, 13/10) | 6/15 | Check whether prices visible without login; vet individual sellers. |
| P2 | [Repairbase EU](https://repairbase.eu/) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | 6/10 | Check price visibility, account |
| P2 | [AMDETECH](https://www.amdetech.de/b2b-info-de/) | BG | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Verify provenance of 'original' parts and B2B terms |
| P2 | [Minpex](https://minpex.com/) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check location, account model, pulled parts |
| P2 | [mparts24](https://www.mparts24.de/) | DE | 3, 4 | no | unknown | none_seen | Extraits de recherche uniquement | — | Register; check FR delivery |
| P2 | [TechToro](https://techtoro.io/macbook/) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Identify location and EU shipping (Mac logic boards are scarce) |
| P2 | [UW GSM Parts](https://uwgsmparts.shop/) | NL | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check prices and EU shipping |
| P3 | [Utopya](https://www.utopya.fr/) | FR | 4 | no | required_verified | none_seen - FAQ explicitly states no Exc… | Site joint par le serveur (13/10) | 34/55 | Ne pas automatiser. Demander un contrat d'API officiel (exception art. 14) ; sin… |
| P3 | [iFixit EU Store](https://eu-store.ifixit.com/collections/apple-parts) | DE | 1 | yes | not_observed | unknown - iFixit has public API for guid… | Extraits de recherche uniquement | 32/45 | Retail benchmark; check Pro/business program |
| P3 | [Apple Self Service Repair Store](https://www.apple.com/fr/newsroom/2022/12/apple-launches-self-service-repair-in-europe/) | EU | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | 30/55 | Use as genuine-part price ceiling benchmark |
| P3 | [Mobinova](https://mobinova.eu/) | ? | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | 22/60 | Identify legal entity/country, catalogue breadth beyond chassis, shipping to Fra… |
| P3 | [Replayce (LaPommeDiscount)](https://www.lapommediscount.com/replayce-fournisseur-francais-pieces-detachees-votre-espace-pro.htm) | FR | 5 | unknown | unknown | none_seen | Extraits de recherche uniquement | 15/25 | Call to get pro conditions |
| P3 | [Injured Gadgets](https://www.injuredgadgets.com/apple/iphone) | US | 1 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | 14/25 | Only if price gap covers import VAT/duties |
| P3 | [gsmExchange](https://www.gsmexchange.com/) | GB | 4, 5, 7 | no | required_verified | unknown | Site joint par le serveur (13/10) | 13/30 | Later stage: membership cost vs value; 12-month history requirement may block a … |
| P3 | [Spareka (Apple)](https://www.spareka.fr/m/apple) | FR | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | 13/15 | Reference retail price benchmark only |
| P3 | [MacWay (pieces iPhone)](https://www.macway.com/piece-detachee/n200018/) | FR | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | 10/10 | Retail benchmark only |
| P3 | [Rinophone](https://www.rinophone.com/) | FR | 5 | unknown | unknown | none_seen | Extraits de recherche uniquement | 9/10 | Call for pro terms |
| P3 | [PRO GSM (ecrans-telephone.com)](https://ecrans-telephone.com/) | FR | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | 8/10 | Check access model |
| P3 | [ScreenGrade](https://screengrade.fr/) | FR | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | 8/10 | Check grades, prices, account |
| P3 | [Partly](https://www.partly.nl/groothandel/) | NL | 4, 5 | unknown | required_verified | none_seen | Extraits de recherche uniquement | 7/20 | Ask if non-NL businesses accepted |
| P3 | [Fixez](https://www.fixez.com/) | US | 1, 3 | unknown | unknown | none_seen | Injoignable / anti-robot (serveur, 13/10) | 2/10 | Import cost check |
| P3 | [Mobilex (Serviphone)](https://www.serviphone.net/) | ES | 1, 4 | unknown | unknown | none_seen | Injoignable / anti-robot (serveur, 13/10) | 2/10 | Low - ES/PT only |
| P3 | [Parts4Repair](https://www.parts4repair.com/) | US | 1, 5 | unknown | unknown | none_seen | Extraits de recherche uniquement | 2/10 | Low priority (import) |
| P3 | [The Bookyard](https://www.thebookyard.com/mac-logic-boards.php?manufacturers_id=12) | GB | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | 2/10 | Post-Brexit customs; low priority |
| P3 | [Phone LCD Parts](https://www.phonelcdparts.com/) | US | 1, 7 | unknown | unknown | none_seen | Extraits de recherche uniquement | 1/10 | Low priority (import) |
| P3 | [4Repair.pl](https://4repair.pl/) | PL | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check EU shipping |
| P3 | [A-Parts](https://www.a-parts.com.pl/) | PL | 1 | yes | unknown | none_seen | Extraits de recherche uniquement | — | Check EU export |
| P3 | [BigBuy](https://www.bigbuy.eu/fr/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Brico-phone](https://www.brico-phone.com) | FR | ? | unknown | unknown | unknown | Prix réels récupérés par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Copaco (BE/NL)](https://www.copaco.com) | NL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [DA Pieces](https://da-pieces.com/products/ecran-iphone-11-incell-jk) | FR | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | — | Check if B2B pricing exists |
| P3 | [Dutch Mobile Parts B.V.](https://dutchmobileparts.nl/) | NL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [E-Lab](https://www.e-lab.store/) | IT | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check terms |
| P3 | [Euro Mobile Company](https://euromobilecompany.com/en/parts) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Identify country and terms |
| P3 | [Fixje Zakelijk](https://www.fixje.nl/zakelijk/) | NL | 1, 3, 4, 5 | yes | required_verified | none_seen | Prix réels récupérés par le serveur (13/10) | — | Ask whether they sell to foreign resellers and pricing. |
| P3 | [FixShop](https://www.fixshop.eu/) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check wholesale terms |
| P3 | [GBI Shop](https://gbishop.de/de/) | DE | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check terms |
| P3 | [GSMOK.com](https://gsmok.com/en/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [GSP Electronics Großhandel](https://gspelectronics-grosshandel.de/) | DE | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |
| P3 | [Hurtel](https://hurtel.com) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [hurtowniagsm.pl](https://www.hurtowniagsm.pl/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Koopjeonderdelen](https://www.koopjeonderdelen.nl/) | NL | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check FR shipping |
| P3 | [Kosatec](https://kosatec.de) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Life365](https://www.life365.eu) | IT | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Mobilepart.pl](https://mobilepart.pl/pl/) | PL | 3, 4 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | — | Check B2B signup requirements |
| P3 | [MobileWorld (Linz)](https://www.mobileworld.at/info/handyzubehoer-firmenkunden-grosshandel-b2b.html) | AT | ? | unknown | unknown | none_seen | Site joint par le serveur (13/10) | — | Check terms |
| P3 | [Mobiltec 24 GmbH](https://www.mobiltec24.de/) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Mobiparts / GSMnet](https://www.mobiparts.ro) ⚠︎ domaine non confirmé | RO | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |
| P3 | [Molano B.V. (Buy Molano)](https://buymolano.com/) | NL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [mpsmobile GmbH](https://mpsmobile.de/en) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Nowacell](https://nowacell.pl/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Part Expert](https://www.partexpert.nl/nl/) | NL | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check access model |
| P3 | [Parts-Store.pl](https://parts-store.pl/pol_m_Czesci-GSM_Czesci-serwisowe-iPhone-584.html) | PL | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check terms |
| P3 | Parts4cells ⚠︎ domaine non confirmé | US | 1 | unknown | unknown | unknown | Extraits de recherche uniquement | 0/10 | Low priority. |
| P3 | [PhoneGigant](https://www.phonegigant.nl/onderdelen/apple-onderdelen/iphone-onderdelen/) | NL | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | — | Retail benchmark |
| P3 | [PhoneMad (Renova PhoneMadrid S.L.)](https://www.phonemadrid.com/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Punto Ingrosso](https://www.puntoingrosso.it/categoria-prodotto/ricambi-smartphone/ricambi-smartphone-apple/) | IT | 4 | unknown | required_verified | none_seen | Site joint par le serveur (13/10) | — | Ask if French VAT number accepted |
| P3 | [RepuestosMovil](https://repuestosmovil.es/) | ES | 5 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | — | Check FR shipping |
| P3 | [REWA Technology (shop.rewa.tech)](https://shop.rewa.tech) | US | 1 | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Low priority. |
| P3 | [ScreenShelf](https://screenshelf.ie/) | IE | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check access model and FR shipping |
| P3 | [Servisní díly (servisnidily.cz)](https://www.servisnidily.cz/) | CZ | ? | unknown | unknown | unknown | Prix réels récupérés par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [SmartGrade (Samsung Service Pack)](https://smartgrade.fr) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [smartpart4u](https://www.smartpart4u.de/) | DE | ? | unknown | unknown | none_seen | Site joint par le serveur (13/10) | — | Check access model, FR shipping |
| P3 | [Spainsellers (Microrepuestos S.L.U.)](https://www.spainsellers.com/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Technoworld Reseller](https://www.shop-technoworld.eu/) | IT | 4 | unknown | required_verified | none_seen | Site joint par le serveur (13/10) | — | Ask if EU VAT (non-IT) accepted |
| P3 | [Tecnofix Informática (Alicante)](https://www.tecnofixinformatica.com/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Telehurt](https://telehurt.pl/czesci-do-iphone) | PL | ? | unknown | unknown | none_seen | Site joint par le serveur (13/10) | — | Check EU shipping |
| P3 | [World-iTech](https://www.world-itech.com/fr/3-iphone) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Identify country, B2B terms |

## D. Pièces autres marques (90)

| Prio | Fournisseur | Pays | Accès | Prix publics | Pro exigé | Flux / API | Vérification | Score | Prochaine action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | [eBay (marketplace + Browse API)](https://www.ebay.fr) | ? | 1, 6, 7 | yes | not_observed | api (Browse API: GET /item_summary/searc… | Prix réels récupérés par le serveur (13/10) | 72/100 | Create eBay developer app; prototype Browse API searches (GTIN/category) on EBAY… |
| P1 | [2repair.parts](https://2repair.parts) | GB | 1, 3 | yes | unknown | unknown | Extraits de recherche uniquement | 65/100 | Check EU shipping from NL warehouse (avoid UK customs), trade-account terms, EUR… |
| P1 | [MobileSentrix Europe](https://www.mobilesentrix.eu/) | NL | 1, 3, 4 | yes | unknown | unknown - RepairDesk integration exists … | Site joint par le serveur (13/10) | 65/85 | Create account, confirm FR shipping costs/VAT (reverse charge), ask about API/fe… |
| P1 | [Replace Base](https://www.replacebase.eu/iphone-parts) | GB | 1, 3, 4 | yes | not_observed | none_seen | Site joint par le serveur (13/10) | 44/70 | Check trade discounts, FR shipping cost, ToS |
| P1 | [Mobilax](https://www.mobilax.fr/) | FR | 3, 4 | no | required_verified | none_seen | Site joint par le serveur (13/10) | 40/50 | Open pro account (Kbis+RIB); ask for CSV/price-list export or API; read CGV data… |
| P1 | [4Phones (4phones.eu)](https://4phones.eu) | ES | 4 | unknown | required_verified | unknown | Site joint par le serveur (13/10) | 35/50 | Apply for pro account; request price list and data export; confirm France shippi… |
| P1 | [iParts4u (UK + Europe/Ireland)](https://www.iparts-4u.eu/) | IE | 3, 4 | partial | unknown | none_seen - note data.iparts-4u.eu subdo… | Extraits de recherche uniquement | 35/50 | Apply for EU trade account (avoid UK customs); ask about data feed |
| P1 | [Pieces2Mobile](https://www.pieces2mobile.com/apple.html) | FR | 1, 3, 4 | yes | unknown | none_seen | Site joint par le serveur (13/10) | 34/45 | Verify current pro account conditions, ToS on catalogue reuse |
| P1 | GSMnet (Mobiparts SRL) ⚠︎ domaine non confirmé | RO | 4 | unknown | unknown | unknown | Extraits de recherche uniquement | 30/40 | Open B2B account; confirm shipping to France and feed availability; strong for H… |
| P1 | [SOSav Pro](https://pro.sosav.fr/) | FR | 1, 5 | partial | unknown | none_seen | Site joint par le serveur (13/10) | 29/40 | Contact sales for pro activation; ask for export/API |
| P1 | [Sifar Group (Esprinet group)](https://www.sifar.it) | IT | 4, 5 | unknown | unknown | unknown | Site joint par le serveur (13/10) | 28/30 | Ask whether Sifar sells to French repair shops; request B2B platform access and … |
| P1 | [LCD-Phone (lcd-phone.com)](https://lcd-phone.com) | FR | 1, 4 | partial | unknown | unknown | Extraits de recherche uniquement | 27/45 | Open pro account; check whether prices visible after login; ask export. |
| P1 | [DutchSpares / EuropeSpares](https://www.dutchspares.com/en/) | NL | 3 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | 23/40 | Register, check pulled-OEM pricing and FR shipping |
| P2 | [iFixit (EU store / iFixit Pro)](https://www.ifixit.com/en-eu) | US | 1, 4 | yes | unknown | unknown | Site joint par le serveur (13/10) | 60/100 | Apply to iFixit Pro (EU) for Pixel genuine part wholesale pricing. |
| P2 | Destock Access (marketplace seller) ⚠︎ domaine non confirmé | FR | 1, 7 | yes | unknown | unknown | Extraits de recherche uniquement | 34/75 | Identify Destock Access own B2B channel; compare marketplace prices as price ben… |
| P2 | [GSM Parts Center (GPC)](https://www.gsmpartscenter.com/en/) | NL | 3 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | 24/40 | Register; check price visibility and FR shipping |
| P2 | [Horepa](https://horepa.fr/fr/) | FR | 3 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | 20/25 | Check pro signup requirements and price visibility |
| P2 | [Foneday](https://foneday.shop) | NL | 4 | unknown | unknown | unknown | Site joint par le serveur (13/10) | 15/25 | Check brand coverage (Samsung/Xiaomi), pro-account rules, France shipping. |
| P2 | [iPartsPro](https://ipartspro.eu/) | ? | 3 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | 15/25 | Check company country, price visibility, signup proof |
| P2 | ASWO ⚠︎ domaine non confirmé | DE | 3, 4 | unknown | unknown | unknown | Extraits de recherche uniquement | 13/15 | Check ASWO France presence and trade account; Samsung genuine pricing vs Service… |
| P2 | [Mobileparts.shop](https://mobileparts.shop/) | ? | 4, 5 | unknown | unknown | unknown | Site joint par le serveur (13/10) | 12/15 | Verify site, country, access requirements (likely IRP / repair business validati… |
| P2 | [Preciosadictos](https://www.preciosadictos.com/) | ES | 1, 3, 5 | unknown | unknown | none_seen | Extraits de recherche uniquement | 12/15 | Check FR shipping and pro signup |
| P2 | [iShoptor](https://ishoptor.pl/) | PL | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | 10/15 | Check EU shipping to France and B2B terms |
| P2 | [cPix](https://cpix.fr/) | FR | 3 | unknown | unknown | none_seen | Extraits de recherche uniquement | 9/10 | Check public prices and pro conditions |
| P2 | [ITP Technologie](https://www.itp-technologie.com/) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | 9/10 | Check account/pricing model and stock list. |
| P2 | SmartGrade (Nice) - seller on Destockplus ⚠︎ domaine non confirmé | FR | 5, 7 | unknown | unknown | unknown | Extraits de recherche uniquement | 8/10 | Request quote + proof of Samsung sourcing/invoices. |
| P2 | [Repargsm](https://repargsm.com/fr/2404-devices-smartphone-grossiste-piece-mobile-telephone) | FR | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | 7/10 | Check pricing visibility and pro account requirements. |
| P2 | [Merkandi](https://merkandi.com/categories/smartphones-mobile-phones/87) | PL | 1, 2, 7 | partial | unknown | none_seen | Injoignable / anti-robot (serveur, 13/10) | 6/15 | Check whether prices visible without login; vet individual sellers. |
| P2 | [Repairbase EU](https://repairbase.eu/) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | 6/10 | Check price visibility, account |
| P2 | [Minpex](https://minpex.com/) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check location, account model, pulled parts |
| P2 | [mparts24](https://www.mparts24.de/) | DE | 3, 4 | no | unknown | none_seen | Extraits de recherche uniquement | — | Register; check FR delivery |
| P2 | [UW GSM Parts](https://uwgsmparts.shop/) | NL | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check prices and EU shipping |
| P3 | [Utopya](https://www.utopya.fr/) | FR | 4 | no | required_verified | none_seen - FAQ explicitly states no Exc… | Site joint par le serveur (13/10) | 34/55 | Ne pas automatiser. Demander un contrat d'API officiel (exception art. 14) ; sin… |
| P3 | [i-StoreParts (eBay seller, Catania)](https://www.ebay.de/itm/146231817998) | IT | 1, 7 | yes | unknown | unknown | Extraits de recherche uniquement | 20/50 | Price benchmark for Xiaomi SP. |
| P3 | [Replayce (LaPommeDiscount)](https://www.lapommediscount.com/replayce-fournisseur-francais-pieces-detachees-votre-espace-pro.htm) | FR | 5 | unknown | unknown | none_seen | Extraits de recherche uniquement | 15/25 | Call to get pro conditions |
| P3 | [Injured Gadgets](https://www.injuredgadgets.com/apple/iphone) | US | 1 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | 14/25 | Only if price gap covers import VAT/duties |
| P3 | [gsmExchange](https://www.gsmexchange.com/) | GB | 4, 5, 7 | no | required_verified | unknown | Site joint par le serveur (13/10) | 13/30 | Later stage: membership cost vs value; 12-month history requirement may block a … |
| P3 | [Destockplus](https://www.destockplus.com/) | FR | 1, 4, 5, 7 | partial | unknown | unknown (Contentserv connector exists fo… | Site joint par le serveur (13/10) | 12/25 | Use for sourcing leads only; vet each seller. |
| P3 | [Rinophone](https://www.rinophone.com/) | FR | 5 | unknown | unknown | none_seen | Extraits de recherche uniquement | 9/10 | Call for pro terms |
| P3 | Distriphone ⚠︎ domaine non confirmé | FR | 5, 7 | unknown | unknown | unknown | Extraits de recherche uniquement | 8/10 | Phone check whether still active before any effort. |
| P3 | MobileRepair Center (eBay.fr seller) ⚠︎ domaine non confirmé | FR | 1, 7 | yes | unknown | unknown | Extraits de recherche uniquement | 8/10 | Benchmark only. |
| P3 | [PRO GSM (ecrans-telephone.com)](https://ecrans-telephone.com/) | FR | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | 8/10 | Check access model |
| P3 | [Fixez](https://www.fixez.com/) | US | 1, 3 | unknown | unknown | none_seen | Injoignable / anti-robot (serveur, 13/10) | 2/10 | Import cost check |
| P3 | [Mobilex (Serviphone)](https://www.serviphone.net/) | ES | 1, 4 | unknown | unknown | none_seen | Injoignable / anti-robot (serveur, 13/10) | 2/10 | Low - ES/PT only |
| P3 | [Parts4Repair](https://www.parts4repair.com/) | US | 1, 5 | unknown | unknown | none_seen | Extraits de recherche uniquement | 2/10 | Low priority (import) |
| P3 | [Phone LCD Parts](https://www.phonelcdparts.com/) | US | 1, 7 | unknown | unknown | none_seen | Extraits de recherche uniquement | 1/10 | Low priority (import) |
| P3 | [4Repair.pl](https://4repair.pl/) | PL | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check EU shipping |
| P3 | [A-Parts](https://www.a-parts.com.pl/) | PL | 1 | yes | unknown | none_seen | Extraits de recherche uniquement | — | Check EU export |
| P3 | [Alibaba.com (used/refurbished laptops & accessorie…](https://electronics.alibaba.com/product/used-laptops-europe) | CN | 1, 2, 5, 7 | yes | not_observed | none_seen | Extraits de recherche uniquement | — | Only for accessories/chargers sampling; verify sellers and customs/VAT. |
| P3 | [Brico-phone](https://www.brico-phone.com) | FR | ? | unknown | unknown | unknown | Prix réels récupérés par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Dutch Mobile Parts B.V.](https://dutchmobileparts.nl/) | NL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [E-Lab](https://www.e-lab.store/) | IT | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check terms |
| P3 | [Euro Mobile Company](https://euromobilecompany.com/en/parts) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Identify country and terms |
| P3 | [Fixje Zakelijk](https://www.fixje.nl/zakelijk/) | NL | 1, 3, 4, 5 | yes | required_verified | none_seen | Prix réels récupérés par le serveur (13/10) | — | Ask whether they sell to foreign resellers and pricing. |
| P3 | [FixShop](https://www.fixshop.eu/) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check wholesale terms |
| P3 | [GBI Shop](https://gbishop.de/de/) | DE | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check terms |
| P3 | GeaTech Store / Smartness (eBay seller, Napoli) ⚠︎ domaine non confirmé | IT | 1, 7 | yes | unknown | unknown | Extraits de recherche uniquement | — | Benchmark only. |
| P3 | [Global Sources (used laptops suppliers)](https://www.globalsources.com/category/used-laptops-manufacturer-supplier_50678/) | HK | 5, 7 | partial | unknown | none_seen | Extraits de recherche uniquement | — | Low priority. |
| P3 | [GSMOK.com](https://gsmok.com/en/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [GSP Electronics Großhandel](https://gspelectronics-grosshandel.de/) | DE | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |
| P3 | Guangzhou BiaoFeng ⚠︎ domaine non confirmé | CN | 5, 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Low priority. |
| P3 | Guangzhou CVT-SRVI ⚠︎ domaine non confirmé | CN | 5, 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Low priority. |
| P3 | [hurtowniagsm.pl](https://www.hurtowniagsm.pl/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | iShine Trade ⚠︎ domaine non confirmé | IE | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Low priority; check EU shipping. |
| P3 | [Koopjeonderdelen](https://www.koopjeonderdelen.nl/) | NL | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check FR shipping |
| P3 | [Made-in-China.com (B2B marketplace)](https://www.made-in-china.com) | CN | 5, 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Lead source only. |
| P3 | [Mobilepart.pl](https://mobilepart.pl/pl/) | PL | 3, 4 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | — | Check B2B signup requirements |
| P3 | [MobileWorld (Linz)](https://www.mobileworld.at/info/handyzubehoer-firmenkunden-grosshandel-b2b.html) | AT | ? | unknown | unknown | none_seen | Site joint par le serveur (13/10) | — | Check terms |
| P3 | [Mobiltec 24 GmbH](https://www.mobiltec24.de/) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Mobiparts / GSMnet](https://www.mobiparts.ro) ⚠︎ domaine non confirmé | RO | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |
| P3 | [Morele.net (retailer)](https://www.morele.net) | PL | 1 | yes | unknown | unknown | Extraits de recherche uniquement | — | Benchmark only. |
| P3 | [mpsmobile GmbH](https://mpsmobile.de/en) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Nowacell](https://nowacell.pl/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | Originalsat (Repuestos Inteligentes) ⚠︎ domaine non confirmé | ES | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Verify site and B2B terms. |
| P3 | [Part Expert](https://www.partexpert.nl/nl/) | NL | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check access model |
| P3 | Parts4cells ⚠︎ domaine non confirmé | US | 1 | unknown | unknown | unknown | Extraits de recherche uniquement | 0/10 | Low priority. |
| P3 | [Punto Ingrosso](https://www.puntoingrosso.it/categoria-prodotto/ricambi-smartphone/ricambi-smartphone-apple/) | IT | 4 | unknown | required_verified | none_seen | Site joint par le serveur (13/10) | — | Ask if French VAT number accepted |
| P3 | Re-Teck (Breda) ⚠︎ domaine non confirmé | NL | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Ask if parts/graded lots sold B2B |
| P3 | [RepuestosMovil](https://repuestosmovil.es/) | ES | 5 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | — | Check FR shipping |
| P3 | [REWA Technology (shop.rewa.tech)](https://shop.rewa.tech) | US | 1 | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Low priority. |
| P3 | [Servisní díly (servisnidily.cz)](https://www.servisnidily.cz/) | CZ | ? | unknown | unknown | unknown | Prix réels récupérés par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Shenzhen Haode Electronics](https://haode-electronics.manufacturer.globalsources.com/company-profile_6003002378329.htm) | CN | 5, 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Request catalogue/price list if aftermarket screens needed. |
| P3 | [Shenzhen Jingzhimei Technology](https://m.made-in-china.com/company-jingzhimei/) | CN | 5, 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Only for aftermarket bulk; request samples. |
| P3 | [SmartGrade (Samsung Service Pack)](https://smartgrade.fr) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [smartpart4u](https://www.smartpart4u.de/) | DE | ? | unknown | unknown | none_seen | Site joint par le serveur (13/10) | — | Check access model, FR shipping |
| P3 | [Spainsellers (Microrepuestos S.L.U.)](https://www.spainsellers.com/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Technoworld Reseller](https://www.shop-technoworld.eu/) | IT | 4 | unknown | required_verified | none_seen | Site joint par le serveur (13/10) | — | Ask if EU VAT (non-IT) accepted |
| P3 | [Tecnofix Informática (Alicante)](https://www.tecnofixinformatica.com/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Telehurt](https://telehurt.pl/czesci-do-iphone) | PL | ? | unknown | unknown | none_seen | Site joint par le serveur (13/10) | — | Check EU shipping |
| P3 | [webspareparts](https://webspareparts.com) | PT | 4 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Confirm phone-parts range and brands (not confirmed in results). |

## E. Électronique / informatique (95)

| Prio | Fournisseur | Pays | Accès | Prix publics | Pro exigé | Flux / API | Vérification | Score | Prochaine action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | [eBay (marketplace + Browse API)](https://www.ebay.fr) | ? | 1, 6, 7 | yes | not_observed | api (Browse API: GET /item_summary/searc… | Prix réels récupérés par le serveur (13/10) | 72/100 | Create eBay developer app; prototype Browse API searches (GTIN/category) on EBAY… |
| P1 | [2repair.parts](https://2repair.parts) | GB | 1, 3 | yes | unknown | unknown | Extraits de recherche uniquement | 65/100 | Check EU shipping from NL warehouse (avoid UK customs), trade-account terms, EUR… |
| P1 | [MobileSentrix Europe](https://www.mobilesentrix.eu/) | NL | 1, 3, 4 | yes | unknown | unknown - RepairDesk integration exists … | Site joint par le serveur (13/10) | 65/85 | Create account, confirm FR shipping costs/VAT (reverse charge), ask about API/fe… |
| P1 | [TD SYNNEX Europe (ex Tech Data) - real-time P&A](https://www.tdsynnex.com) | US | 4, 5, 6 | no | required_verified | api (Europe real-time price & availabili… | Site joint par le serveur (13/10) | 53/60 | Contact TD SYNNEX France to open reseller account and request real-time P&A cred… |
| P1 | [Ingram Micro (Xvantage) - reseller APIs](https://developer.ingrammicro.com/) | US | 4, 5, 6 | no | required_verified | api (JSON REST: catalog, price & availab… | Extraits de recherche uniquement | 47/50 | Open Ingram Micro France reseller account (SIRET/Kbis), then register on develop… |
| P1 | [Replace Base](https://www.replacebase.eu/iphone-parts) | GB | 1, 3, 4 | yes | not_observed | none_seen | Site joint par le serveur (13/10) | 44/70 | Check trade discounts, FR shipping cost, ToS |
| P1 | [Mobilax](https://www.mobilax.fr/) | FR | 3, 4 | no | required_verified | none_seen | Site joint par le serveur (13/10) | 40/50 | Open pro account (Kbis+RIB); ask for CSV/price-list export or API; read CGV data… |
| P1 | [4Phones (4phones.eu)](https://4phones.eu) | ES | 4 | unknown | required_verified | unknown | Site joint par le serveur (13/10) | 35/50 | Apply for pro account; request price list and data export; confirm France shippi… |
| P1 | [Pieces2Mobile](https://www.pieces2mobile.com/apple.html) | FR | 1, 3, 4 | yes | unknown | none_seen | Site joint par le serveur (13/10) | 34/45 | Verify current pro account conditions, ToS on catalogue reuse |
| P1 | GSMnet (Mobiparts SRL) ⚠︎ domaine non confirmé | RO | 4 | unknown | unknown | unknown | Extraits de recherche uniquement | 30/40 | Open B2B account; confirm shipping to France and feed availability; strong for H… |
| P1 | [Sifar Group (Esprinet group)](https://www.sifar.it) | IT | 4, 5 | unknown | unknown | unknown | Site joint par le serveur (13/10) | 28/30 | Ask whether Sifar sells to French repair shops; request B2B platform access and … |
| P1 | Stocklear | FR | 7 | unknown | unknown | unknown (seller-side Contentserv connect… | Site joint par le serveur (13/10) | 26/40 | Visit site; register with SIRET; check electronics/phones lots frequency |
| P1 | [ThePhoneHub](https://www.thephonehub.eu/) | BE | 5, 6 | no | unknown | csv: 'CSV Live Link' feed with real-time… | Site joint par le serveur (13/10) | 25/45 | Email hello@thephonehub.eu for CSV Live Link + API docs, MOQ, VAT treatment and … |
| P1 | [Itancia (Again)](https://itancia.com/itancia-technology-grossiste-informatique/) | FR | 4, 5 | no | unknown | unknown | Extraits de recherche uniquement | 17/25 | Contact Itancia Technology for reseller account conditions. |
| P2 | [iFixit (EU store / iFixit Pro)](https://www.ifixit.com/en-eu) | US | 1, 4 | yes | unknown | unknown | Site joint par le serveur (13/10) | 60/100 | Apply to iFixit Pro (EU) for Pixel genuine part wholesale pricing. |
| P2 | [Farnell / element14 (Newark)](https://partner.element14.com/) | GB | 1, 2, 6 | yes | not_observed | api (Product Search API: pricing, stock,… | Extraits de recherche uniquement | 53/60 | Register on partner.element14.com and get key; use storeId fr.farnell.com. |
| P2 | [Mouser Electronics](https://www.mouser.com/en/apihome/) | US | 1, 2, 6 | yes | not_observed | api (Search API keyword/part number; Car… | Extraits de recherche uniquement | 45/50 | Create MyMouser account and request Search API key; useful for chargers/cables/c… |
| P2 | [TME (Transfer Multisort Elektronik)](https://developers.tme.eu/) | PL | 1, 3, 6 | yes | unknown | api (Product API: catalog, stocks, price… | Extraits de recherche uniquement | 44/50 | Create tme.eu + developer account; generate key. |
| P2 | [Esprinet (espriCATALOG / espriREALTIME)](https://esprinet.com/en/offer/services/digital-and-e-commerce-services/espricatalog-and-esprirealtime) | IT | 4, 6 | no | unknown | export/api (espriCATALOG database of mas… | Site joint par le serveur (13/10) | 32/45 | Ask Esprinet whether a French company can open an account (IT/ES entity) and shi… |
| P2 | [DistriHUB (Varle.lt)](https://distrihub.eu/) | LT | 4, 6 | no | required_verified | api/xml/json/csv/edi feeds; native BaseL… | Site joint par le serveur (13/10) | 28/45 | Request buyer verification and feed sample; check smartphone depth/prices vs spe… |
| P2 | [GSM Parts Center (GPC)](https://www.gsmpartscenter.com/en/) | NL | 3 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | 24/40 | Register; check price visibility and FR shipping |
| P2 | [AppleParts](https://appleparts.pl/) | PL | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | 21/45 | Confirm EU shipping to France, PLN->EUR, invoice with VAT, B2B terms |
| P2 | [Jobalots](https://jobalots.com) | GB | 7 | unknown | unknown | unknown | Site joint par le serveur (13/10) | 20/40 | Check EU (PL warehouse) shipping to FR and B2B terms |
| P2 | [Exertis (Europe)](https://www.exertis.fr/) ⚠︎ domaine non confirmé | IE | 4, 5, 6 | no | unknown | csv (price file via SFTP, daily or weekl… | Injoignable / anti-robot (serveur, 13/10) | 15/20 | Identify Exertis entity serving France; request reseller account and SFTP CSV pr… |
| P2 | [Foneday](https://foneday.shop) | NL | 4 | unknown | unknown | unknown | Site joint par le serveur (13/10) | 15/25 | Check brand coverage (Samsung/Xiaomi), pro-account rules, France shipping. |
| P2 | [it-versand.com (NET Online-Versand GmbH & Co. KG)](https://it-versand.com/en/collections/b2b) | DE | 1 | yes | not_observed | none_seen (Shopify .oembed endpoints exi… | Extraits de recherche uniquement | 14/20 | Ask service@it-versand.com for reseller pricing/volume terms; public catalog rea… |
| P2 | ASWO ⚠︎ domaine non confirmé | DE | 3, 4 | unknown | unknown | unknown | Extraits de recherche uniquement | 13/15 | Check ASWO France presence and trade account; Samsung genuine pricing vs Service… |
| P2 | [Mobileparts.shop](https://mobileparts.shop/) | ? | 4, 5 | unknown | unknown | unknown | Site joint par le serveur (13/10) | 12/15 | Verify site, country, access requirements (likely IRP / repair business validati… |
| P2 | [Preciosadictos](https://www.preciosadictos.com/) | ES | 1, 3, 5 | unknown | unknown | none_seen | Extraits de recherche uniquement | 12/15 | Check FR shipping and pro signup |
| P2 | [cPix](https://cpix.fr/) | FR | 3 | unknown | unknown | none_seen | Extraits de recherche uniquement | 9/10 | Check public prices and pro conditions |
| P2 | [Infortisa](https://www.infortisa.com/categoria/telefonia-y-fax/moviles-seminuevos/) | ES | 3 | unknown | unknown | unknown | Site joint par le serveur (13/10) | 6/15 | Check registration requirements for French companies and data feed availability … |
| P2 | [Merkandi](https://merkandi.com/categories/smartphones-mobile-phones/87) | PL | 1, 2, 7 | partial | unknown | none_seen | Injoignable / anti-robot (serveur, 13/10) | 6/15 | Check whether prices visible without login; vet individual sellers. |
| P2 | [B-Stock Europe](https://bstock.com/auctions/europe/) | US | 4, 7 | partial | required_verified | none_seen | Site joint par le serveur (13/10) | 5/10 | Apply as approved buyer; filter IT/laptop lots. |
| P2 | [Komputronik (B2B wholesale)](https://www.ifa-berlin.com/exhibitors/komputronik) | PL | 4, 6 | partial | unknown | xml/csv/api (stated on IFA exhibitor pro… | Extraits de recherche uniquement | 4/5 | Contact Komputronik B2B for EU export terms, ex-lease/refurb range and feed spec… |
| P2 | [ALSO (ALSO Holding)](https://www.also.com/ec/cms5/en_5110/5110/services/digital-services/index.jsp) | CH | 4, 5 | no | unknown | unknown (only cloud marketplace document… | Site joint par le serveur (13/10) | — | Ask ALSO France account manager about hardware price/stock export or API. |
| P2 | [HUBX](https://app.dealroom.co/companies/hubx_1_2) | US | 4, 5, 7 | no | required_verified | unknown | Extraits de recherche uniquement | — | Apply for buyer account; check EU shipping / import costs. |
| P2 | [Minpex](https://minpex.com/) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check location, account model, pulled parts |
| P3 | [Utopya](https://www.utopya.fr/) | FR | 4 | no | required_verified | none_seen - FAQ explicitly states no Exc… | Site joint par le serveur (13/10) | 34/55 | Ne pas automatiser. Demander un contrat d'API officiel (exception art. 14) ; sin… |
| P3 | [iFixit EU Store](https://eu-store.ifixit.com/collections/apple-parts) | DE | 1 | yes | not_observed | unknown - iFixit has public API for guid… | Extraits de recherche uniquement | 32/45 | Retail benchmark; check Pro/business program |
| P3 | [RS Components (RS Group)](https://www.rs-online.com) ⚠︎ domaine non confirmé | GB | 1, 3, 6 | yes | unknown | api (by application: client ID/secret, s… | Extraits de recherche uniquement | 17/20 | Request API access via RS account manager if components needed. |
| P3 | [Westock Europe](https://westock-europe.fr/) | FR | 3 | unknown | unknown | unknown | Extraits de recherche uniquement | 14/35 | Low trust; only check if others fail. |
| P3 | [gsmExchange](https://www.gsmexchange.com/) | GB | 4, 5, 7 | no | required_verified | unknown | Site joint par le serveur (13/10) | 13/30 | Later stage: membership cost vs value; 12-month history requirement may block a … |
| P3 | [Spareka (Apple)](https://www.spareka.fr/m/apple) | FR | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | 13/15 | Reference retail price benchmark only |
| P3 | [Destockplus](https://www.destockplus.com/) | FR | 1, 4, 5, 7 | partial | unknown | unknown (Contentserv connector exists fo… | Site joint par le serveur (13/10) | 12/25 | Use for sourcing leads only; vet each seller. |
| P3 | [MacWay (pieces iPhone)](https://www.macway.com/piece-detachee/n200018/) | FR | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | 10/10 | Retail benchmark only |
| P3 | [Restposten.de](https://www.restposten.de/multimedia-elektro/handy-smartphones/) | DE | 1, 4, 7 | partial | required_verified | unknown | Site joint par le serveur (13/10) | 9/30 | Monitor listings for smartphone lots; vet sellers. |
| P3 | [B2B Mobile Wholesalers](https://www.b2bmobilewholesalers.com/) | GB | 1, 2, 5 | partial | unknown | export: daily stock list by email | Extraits de recherche uniquement | 6/15 | Verify legal entity & VAT; check post-Brexit NI customs/VAT for France. |
| P3 | [ComputerG (B2B programme)](https://www.computerg.shop/apple-devices) | ? | 1, 4, 5 | yes | unknown | none_seen | Extraits de recherche uniquement | 3/5 | Verify company; request B2B tiers. |
| P3 | [Reichelt Elektronik](https://www.reichelt.de) ⚠︎ domaine non confirmé | DE | 1, 6 | yes | not_observed | csv (affiliate product data via AWIN onl… | Extraits de recherche uniquement | 3/5 | Optional: join AWIN to obtain CSV product feed for price benchmarking. |
| P3 | [A-Parts](https://www.a-parts.com.pl/) | PL | 1 | yes | unknown | none_seen | Extraits de recherche uniquement | — | Check EU export |
| P3 | [AB S.A.](https://www.ab.pl) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Action S.A.](https://www.action.pl/en/about-action/e-commerce) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Alibaba.com (used/refurbished laptops & accessorie…](https://electronics.alibaba.com/product/used-laptops-europe) | CN | 1, 2, 5, 7 | yes | not_observed | none_seen | Extraits de recherche uniquement | — | Only for accessories/chargers sampling; verify sellers and customs/VAT. |
| P3 | [Amazon Retourenkauf (Amazon Warehouse DE)](https://www.amazon.de) ⚠︎ domaine non confirmé | DE | 1 | yes | unknown | unknown | Extraits de recherche uniquement | — | Low priority (retail pricing) |
| P3 | [api Computerhandels GmbH (Shop2go)](https://www.api.de) | DE | 4 | no | unknown | unknown (Shop2go reseller shop; no expor… | Extraits de recherche uniquement | — | Check whether api sells to French resellers and whether Shop2go offers CSV/XML. |
| P3 | [Aseuropa](https://www.aseuropa.com/) | ES | ? | unknown | unknown | unknown | Extraits de recherche uniquement | — | Check account model. |
| P3 | [bluechip Computer AG](https://www.bluechip.de) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Brodos AG](https://brodos.com/) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Conrad Electronic / Conrad Business](https://www.conrad.com) | DE | 1, 4 | yes | unknown | api (Price & Availability API exists in … | Extraits de recherche uniquement | — | Ask Conrad Business whether buyer accounts can get P&A API. |
| P3 | [dexxIT](https://www.ifa-berlin.com/exhibitors/dexxit) | ? | 4 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Identify official site and reseller terms. |
| P3 | [DMI Computer](https://www.dmi.es/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [E-Lab](https://www.e-lab.store/) | IT | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check terms |
| P3 | [EB-TECH](https://eb-tech.fr/) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [ELKO Group (eCom)](https://www.elkogroup.com/products/) | LV | 4 | no | unknown | unknown (eCom wholesale online shop; no … | Extraits de recherche uniquement | — | Ask ELKO whether France is served and whether eCom provides XML export. |
| P3 | [Fixje Zakelijk](https://www.fixje.nl/zakelijk/) | NL | 1, 3, 4, 5 | yes | required_verified | none_seen | Prix réels récupérés par le serveur (13/10) | — | Ask whether they sell to foreign resellers and pricing. |
| P3 | [FixShop](https://www.fixshop.eu/) | ? | ? | unknown | unknown | none_seen | Extraits de recherche uniquement | — | Check wholesale terms |
| P3 | [Global Sources (used laptops suppliers)](https://www.globalsources.com/category/used-laptops-manufacturer-supplier_50678/) | HK | 5, 7 | partial | unknown | none_seen | Extraits de recherche uniquement | — | Low priority. |
| P3 | [Globomatik](https://www.globomatik.com/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Home Screen Distribution](https://b2b.homescreen.pl/en/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Incom Group](https://www.incomgroup.pl/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Ingram Micro (France / Xvantage)](https://fr.ingrammicro.eu/) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | iShine Trade ⚠︎ domaine non confirmé | IE | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Low priority; check EU shipping. |
| P3 | [Jarltech](https://www.jarltech.com) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [KOMSA](https://komsa.com/) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Kunz Retouren (eBay store)](https://www.ebay.de/str/kunzretourenstore) | DE | 1, 6, 7 | yes | unknown | api (via eBay Browse API) | Extraits de recherche uniquement | — | Monitor via eBay API seller filter |
| P3 | [LDLC.pro](https://www.ldlc.pro) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Liquidation.com (Liquidity Services)](https://www.liquidation.com) ⚠︎ domaine non confirmé | US | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | US-only practicality doubtful for FR; verify export terms |
| P3 | [Made-in-China.com (B2B marketplace)](https://www.made-in-china.com) | CN | 5, 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Lead source only. |
| P3 | [Megasur](https://www.megasur.es/) | ES | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |
| P3 | [MICHAEL AG (Michael Telecom)](https://www.michael-ag.de/) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [MobileWorld (Linz)](https://www.mobileworld.at/info/handyzubehoer-firmenkunden-grosshandel-b2b.html) | AT | ? | unknown | unknown | none_seen | Site joint par le serveur (13/10) | — | Check terms |
| P3 | [Morele.net (retailer)](https://www.morele.net) | PL | 1 | yes | unknown | unknown | Extraits de recherche uniquement | — | Benchmark only. |
| P3 | [Nedis (Nedis Connect)](https://nedis.com/en-us/business) | NL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | Nelro Data ⚠︎ domaine non confirmé | PL | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Verify existence/site and B2B terms. |
| P3 | [Partner Tele.com](https://partnertele.com/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [PhoneGigant](https://www.phonegigant.nl/onderdelen/apple-onderdelen/iphone-onderdelen/) | NL | 1 | yes | not_observed | none_seen | Extraits de recherche uniquement | — | Retail benchmark |
| P3 | [Prodealee (Wedealee SAS)](https://www.grossiste-telephone.com/) | FR | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Proks](https://www.ifa-berlin.com/exhibitors/proks) | LV | 4 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Check delivery to France and data feed. |
| P3 | [RepuestosMovil](https://repuestosmovil.es/) | ES | 5 | unknown | unknown | none_seen | Site joint par le serveur (13/10) | — | Check FR shipping |
| P3 | [REWA Technology (shop.rewa.tech)](https://shop.rewa.tech) | US | 1 | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Low priority. |
| P3 | [Selec Sp. z o.o.](https://www.ifa-berlin.com/exhibitors/selec-sp-z-o-o) | PL | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Request stock list and terms; verify company registration. |
| P3 | [Technoworld Reseller](https://www.shop-technoworld.eu/) | IT | 4 | unknown | required_verified | none_seen | Site joint par le serveur (13/10) | — | Ask if EU VAT (non-IT) accepted |
| P3 | [Westcoast](https://www.westcoast.co.uk/) ⚠︎ domaine non confirmé | GB | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |
| P3 | [WORTMANN AG](https://portal.wortmann.de) | DE | 4, 5 | no | unknown | unknown (resellers rated price/stock inf… | Site joint par le serveur (13/10) | — | Ask Wortmann whether French resellers can buy and whether a CSV/XML price feed e… |
| P3 | [x-kom B2B](https://www.x-kom.pl/aktualnosci/6688-planujesz-wieksze-zakupy-b2b-x-kom-poleca-sprzet-dla-firm.html) | PL | 1, 5 | yes | not_observed | none_seen | Extraits de recherche uniquement | — | Low priority; retail pricing, PL-focused. |

## F. Lots / déstockage (47)

| Prio | Fournisseur | Pays | Accès | Prix publics | Pro exigé | Flux / API | Vérification | Score | Prochaine action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | [eBay (marketplace + Browse API)](https://www.ebay.fr) | ? | 1, 6, 7 | yes | not_observed | api (Browse API: GET /item_summary/searc… | Prix réels récupérés par le serveur (13/10) | 72/100 | Create eBay developer app; prototype Browse API searches (GTIN/category) on EBAY… |
| P1 | [Foxway Reseller Store](https://resellers.foxway.com/) | EE | 3, 4, 5, 7 | no | required_verified | unknown (webshop integration into resell… | Site joint par le serveur (13/10) | 51/70 | Apply for reseller account with SIRET/VAT; ask account manager about MOQ 2000 EU… |
| P1 | Stocklear | FR | 7 | unknown | unknown | unknown (seller-side Contentserv connect… | Site joint par le serveur (13/10) | 26/40 | Visit site; register with SIRET; check electronics/phones lots frequency |
| P2 | [Jobalots](https://jobalots.com) | GB | 7 | unknown | unknown | unknown | Site joint par le serveur (13/10) | 20/40 | Check EU (PL warehouse) shipping to FR and B2B terms |
| P2 | [MacTastic_EU (eBay seller)](https://www.ebay.de/itm/357095111927) | NL | 1, 7 | yes | not_observed | none_seen | Extraits de recherche uniquement | 16/30 | eBay Browse API (official) could read listings; check seller store |
| P2 | [Callisto](https://callisto.tech/wholesale-used-smartphones-on-callisto) | ? | 4, 5, 7 | unknown | required_verified | unknown | Site joint par le serveur (13/10) | 6/15 | Check buyer onboarding, fees, EU stock share. |
| P2 | [Merkandi](https://merkandi.com/categories/smartphones-mobile-phones/87) | PL | 1, 2, 7 | partial | unknown | none_seen | Injoignable / anti-robot (serveur, 13/10) | 6/15 | Check whether prices visible without login; vet individual sellers. |
| P2 | [B-Stock Europe](https://bstock.com/auctions/europe/) | US | 4, 7 | partial | required_verified | none_seen | Site joint par le serveur (13/10) | 5/10 | Apply as approved buyer; filter IT/laptop lots. |
| P2 | [Sellify](https://www.sellify.market/) | ? | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | 5/15 | Check registration requirements and fees. |
| P2 | [HUBX](https://app.dealroom.co/companies/hubx_1_2) | US | 4, 5, 7 | no | required_verified | unknown | Extraits de recherche uniquement | — | Apply for buyer account; check EU shipping / import costs. |
| P3 | [Troostwijk Auctions](https://www.troostwijkauctions.com) | NL | 1, 7 | yes | unknown | unknown | Site joint par le serveur (13/10) | 23/40 | Set saved search for laptops/smartphones from bankruptcies |
| P3 | BVA Auctions ⚠︎ domaine non confirmé | NL | 1, 7 | yes | unknown | unknown | Extraits de recherche uniquement | 18/40 | Check current electronics categories and auction fees |
| P3 | [Via Trading](https://www.viatrading.com) | US | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | 16/40 | Low priority: US import costs/customs |
| P3 | [gsmExchange](https://www.gsmexchange.com/) | GB | 4, 5, 7 | no | required_verified | unknown | Site joint par le serveur (13/10) | 13/30 | Later stage: membership cost vs value; 12-month history requirement may block a … |
| P3 | [Destockplus](https://www.destockplus.com/) | FR | 1, 4, 5, 7 | partial | unknown | unknown (Contentserv connector exists fo… | Site joint par le serveur (13/10) | 12/25 | Use for sourcing leads only; vet each seller. |
| P3 | [Restposten.de](https://www.restposten.de/multimedia-elektro/handy-smartphones/) | DE | 1, 4, 7 | partial | required_verified | unknown | Site joint par le serveur (13/10) | 9/30 | Monitor listings for smartphone lots; vet sellers. |
| P3 | Distriphone ⚠︎ domaine non confirmé | FR | 5, 7 | unknown | unknown | unknown | Extraits de recherche uniquement | 8/10 | Phone check whether still active before any effort. |
| P3 | [GSM Brokers](https://gsmbrokers.com/) | ? | 2, 7 | no | unknown | unknown (stock lists, format unknown) | Extraits de recherche uniquement | 8/25 | Join free, inspect stock list format and identity of warehouses. |
| P3 | [Alibaba.com (used/refurbished laptops & accessorie…](https://electronics.alibaba.com/product/used-laptops-europe) | CN | 1, 2, 5, 7 | yes | not_observed | none_seen | Extraits de recherche uniquement | — | Only for accessories/chargers sampling; verify sellers and customs/VAT. |
| P3 | Avides ⚠︎ domaine non confirmé | DE | 5 | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Ask whether B2B lots sold to traders |
| P3 | [b2b-grosshaendleradressen.de](https://www.b2b-grosshaendleradressen.de/kategorie/alle-grosshandelsangebote/handy-und-smartphone/) | DE | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Lead source only. |
| P3 | [Big Brand Depot](https://bigbranddepot.fr/) | FR | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |
| P3 | [BitStockz](https://www.bitstockz.pl/) | PL | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [BULQ](https://www.bulq.com) ⚠︎ domaine non confirmé | US | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Skip unless EU shipping confirmed |
| P3 | [Cerona](https://www.cerona.de/?p=66) | DE | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Ask for buyer list / stock offers. |
| P3 | [comprarlotesydevoluciones.com](https://comprarlotesydevoluciones.com) ⚠︎ domaine non confirmé | ES | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Verify active |
| P3 | [Device Network (B2B trading platform)](https://ae.linkedin.com/company/device-network) | GB | 4, 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Check laptop listings at b2b.devicenetwork.com. |
| P3 | Direct Liquidation ⚠︎ domaine non confirmé | US | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Skip (US) |
| P3 | Econocom (remarketing / end-of-lease) ⚠︎ domaine non confirmé | FR | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Ask Econocom remarketing whether they sell ex-lease lots to resellers. |
| P3 | [EspaceAgro](https://www.espaceagro.com) | ? | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Low relevance; verify seller identity if used |
| P3 | [EuroLots](https://www.eurolots.com/en) | BG | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Global ICT Connections](https://globalictconnections.com/gsm-compare) | ? | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Low priority; check traders listed. |
| P3 | [import eksport (IFA Berlin exhibitor)](https://www.ifa-berlin.com/exhibitors/import-eksport) | ? | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Identify legal entity and website |
| P3 | [Kunz Retouren (eBay store)](https://www.ebay.de/str/kunzretourenstore) | DE | 1, 6, 7 | yes | unknown | api (via eBay Browse API) | Extraits de recherche uniquement | — | Monitor via eBay API seller filter |
| P3 | [LiquiBiz (Liquidity Services Europe)](https://www.liquibiz.com) ⚠︎ domaine non confirmé | EU | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Verify site still active |
| P3 | [Liquidation.com (Liquidity Services)](https://www.liquidation.com) ⚠︎ domaine non confirmé | US | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | US-only practicality doubtful for FR; verify export terms |
| P3 | [neXchance](https://nexchance.de/en/dienstleistungen/remarketing) | DE | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Ask whether they sell lots to resellers (they mainly buy from companies). |
| P3 | [Planet Outlet](https://planetoutlet.es/) | ES | ? | unknown | unknown | unknown | Injoignable / anti-robot (serveur, 13/10) | — | Vérifier conditions d'accès |
| P3 | Re-Teck (Breda) ⚠︎ domaine non confirmé | NL | 5 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Ask if parts/graded lots sold B2B |
| P3 | [Restposten24](https://www.restposten24.de) ⚠︎ domaine non confirmé | DE | 4 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Check electronics range |
| P3 | [RetourenDirekt (Auctum GmbH)](https://retourendirekt.de/en) | DE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Retourenwelt Oberfranken (eBay seller)](https://www.ebay.com/usr/retourenweltoberfranken) | DE | 1, 6, 7 | yes | unknown | api (via eBay Browse API) | Extraits de recherche uniquement | — | Monitor via eBay API |
| P3 | [Subastalotes](https://subastalotes.com/) | ES | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Surplex](https://www.surplex.com) | DE | 7 | unknown | unknown | unknown | Extraits de recherche uniquement | — | Deprioritize (machinery focus) |
| P3 | [Vavato](https://vavato.com) | BE | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [Wholesale Clearance UK](https://www.wholesaleclearance.co.uk/) | GB | ? | unknown | unknown | unknown | Site joint par le serveur (13/10) | — | Vérifier conditions d'accès |
| P3 | [XMBO Trading](https://www.xmbo.com/de/restposten-handys) | ? | ? | unknown | unknown | unknown | Extraits de recherche uniquement | — | Verify still active. |

## Exclus

| Nom | Raison |
| --- | --- |
| French Mac | 'French Mac - Specialiste Apple, Vente et Reparation a Distance' (https://www.frenchmac.fr/) |
| Piecesorama | 'Pieces detachees pour PC portables : batterie, ecran, clavier' (https://piecesorama.fr/pieces) |
| Apple Spare Market (UNVERIFIED) | No search result for 'applesparemarket.com' or 'Apple Spare Market' (2026-10-13) |
| iDevice.Parts (UNVERIFIED) | No search result for 'idevice.parts' (2026-10-13) |
