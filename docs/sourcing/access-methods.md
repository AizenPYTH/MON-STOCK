# Modalités d'accès et niveaux de vérification

Vérification du 13/10/2026 sur 261 fournisseurs retenus (détail : `supplier-directory.csv`).

## 1. Comment les informations ont été vérifiées

| Niveau | Nombre | Ce qui est réellement prouvé |
| --- | ---: | --- |
| Prix réels récupérés par le serveur MON STOCK | 5 | des produits avec prix ont été relevés automatiquement le 13/10 (04:23 UTC) |
| Site joint par le serveur MON STOCK | 101 | le site répond (HTTP 200), plateforme et robots.txt relevés le 13/10 (05:41 UTC). Ne prouve **ni** les conditions commerciales **ni** les prix |
| Injoignable ou anti-robot | 17 | erreur, délai dépassé ou HTTP 403 côté serveur : à consulter à la main |
| Extraits de recherche uniquement | 138 | informations lues dans les extraits des résultats de recherche (FR, EN, DE, NL, ES, IT, PL). Les pages elles-mêmes **n'ont pas pu être ouvertes** : l'environnement de travail bloque l'accès direct aux sites |

Le domaine officiel n'a pas pu être confirmé par une source pour 39 fournisseurs (marqués ⚠︎ dans le répertoire).

Limite rencontrée : la recherche a atteint le plafond de 200 requêtes de recherche. Restent peu couverts : distributeurs polonais, grossistes allemands et néerlandais de matériel ex-leasing, sources françaises de pièces MacBook, Catawiki et Interencheres.

## 2. Répartition par type d'accès

Un fournisseur peut cumuler plusieurs types. Type « non classé » = information absente des sources.

| Type | Définition | Nombre |
| --- | --- | ---: |
| 1 | Prix publics sans connexion | 65 |
| 2 | Inscription simple par e-mail, sans justificatif constaté | 7 |
| 3 | Compte client, conditions connues | 25 |
| 4 | Compte professionnel (TVA, SIRET, Kbis, validation) | 50 |
| 5 | Prix par un commercial, un devis ou un compte négocié | 58 |
| 6 | API ou flux de données | 18 |
| 7 | Marketplace ou lots | 49 |

Prix publics : « oui » pour 46 fournisseurs, « partiellement » pour 12, inconnu pour la majorité.

Justificatif professionnel **constaté** (et non supposé) pour 18 fournisseurs, dont :
- Mobilax : Kbis de moins de 3 mois et RIB ;
- Utopya : SIRET et vérification manuelle ;
- Foxway : numéro de registre et numéro de TVA ;
- 4Phones : compte validé avant tout achat ;
- Fixje et Partly : numéro KvK ;
- Smartphone Italia, Technoworld et Punto Ingrosso : numéro de TVA italien ;
- B-Stock : licence commerciale et numéro de TVA ;
- gsmExchange : 12 mois d'historique commercial et adhésion payante.

## 3. API et flux identifiés

| Fournisseur | Nature | Documentation | Accès |
| --- | --- | --- | --- |
| eBay | API officielle Buy Browse (recherche par mot-clé, GTIN, catégorie) | https://developer.ebay.com/api-docs/buy/browse/overview.html | clé d'application ; **déjà intégrée** dans MON STOCK, 30 prix relevés le 13/10 |
| Ingram Micro | API REST JSON : catalogue, prix, stock ; fichier SFTP en secours | https://developer.ingrammicro.com/reseller/getting-started | compte revendeur actif ; **adaptateur déjà écrit** (non testé en réel) |
| BigBuy | API REST catalogue et stock | https://api.bigbuy.eu/rest/doc | abonnement BigBuy ; **adaptateur déjà écrit** (non testé en réel) |
| TD SYNNEX Europe | prix et disponibilité en temps réel, fichier de prix | pas de documentation publique (guide tiers QuoteWerks) | identifiants fournis par le commercial, adresses IP autorisées |
| Exertis | fichier CSV de prix par SFTP, quotidien ou hebdomadaire | guide tiers Kaseya ; exertis.fr/web-services.php | activé par le chargé de compte |
| Esprinet | espriCATALOG / espriREALTIME | esprinet.com (page services) | compte revendeur |
| KOMSA | API de stock en temps réel (spécification PDF) | komsa.com (PDF EDI) | compte revendeur |
| MICHAEL AG | services EDI | michael-ag.de (PDF EDI) | compte revendeur |
| Brodos | espace développeur | forms.brodos.com/brodos-developer-area | compte revendeur |
| Home Screen Distribution (PL) | CSV, XML, BL Connect | b2b.homescreen.pl | compte |
| Westcoast | commerce électronique | westcoast.co.uk | compte |
| Mouser | API de recherche (30 appels/min, 1 000/jour) | https://www.mouser.com/en/apihome/ | compte gratuit |
| Farnell / element14 | API de recherche | https://partner.element14.com/Search_API | clé gratuite |
| TME | API | https://developers.tme.eu/ | compte ; nouvelle version requise depuis le 14/05/2026 |
| Conrad | API pour vendeurs de la marketplace | présentation Conrad | aucune preuve d'un usage côté acheteur |
| Reichelt | pas d'API ; CSV affilié via AWIN | AWIN | programme d'affiliation |
| ThePhoneHub | « CSV live link » (stock, prix, minimums) et API via l'équipe commerciale | non publique | compte partenaire |
| DistriHUB | flux XML, JSON, CSV, EDI, API ; BaseLinker et ChannelEngine | non publique | compte acheteur validé |
| Refreshed Apples | Google Sheet de prix partagé | — | accord du fournisseur |
| Mobile Depot, EU Mobile Wholesalers | listes de stock quotidiennes par e-mail | — | inscription |

Aucune API ni aucun flux public n'a été trouvé chez les grossistes de pièces détachées (MobileSentrix, Mobilax, Utopya, Replace Base, iParts4u…), ni chez les grossistes de reconditionné hors ThePhoneHub et DistriHUB.

## 4. Conditions d'utilisation qui interdisent l'automatisation

- **Utopya** : CGV article 14. Le catalogue est une base protégée et tout accès automatisé est strictement interdit (robots, crawlers, scrapers, scripts, extensions, IA). La FAQ indique qu'il n'y a ni export ni API. Collecte possible : saisie manuelle ou import des factures de l'utilisateur.
- **B-Stock** : conditions du 21/08/2025. Robots, spiders, scrapers et outils de data mining sont interdits.
- **eBay** : les conditions d'utilisation interdisent le scraping ; seule l'API officielle est utilisée.
- **Jobalots** : robots.txt refuse l'accès (constaté par le serveur).
- **Globomatik, iOutlet Business et Smartphone Italia** : robots.txt interdit tout accès (constaté par le serveur).
- **Merkandi, Fixez, Megasur, Westcoast, Largo et d'autres** : HTTP 403 anti-robot côté serveur. Aucun contournement ; consultation manuelle.
- **Merkandi, gsmExchange et DestockPlus** : conditions non trouvées. Les vérifier avant toute lecture automatisée.

## 5. Méthode de collecte retenue par fournisseur

Ordre de préférence : API officielle → flux autorisé → export de catalogue → lecture du catalogue public (si robots.txt et CGU le permettent) → import de fichier → saisie manuelle.

La navigation automatisée avec une session connectée n'est **pas** proposée à ce stade. Il faudrait l'accord explicite de chaque fournisseur et des identifiants créés par l'utilisateur, et le risque de contourner des protections est réel.
