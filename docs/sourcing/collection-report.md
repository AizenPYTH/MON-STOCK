# Rapport des collectes réelles

Ce document ne recense que ce qui a **réellement** fonctionné ou échoué contre les vrais sites, en production. Les tests automatisés sur fixtures n'y figurent pas.

## 1. Tests réels du 13/10/2026 (serveur MON STOCK, Edge Function `api`)

Source : table `sourcing_library_checks`, test de recherche quotidien à 04:23 UTC.

| Source | Méthode | Résultat | Exemple relevé |
| --- | --- | --- | --- |
| Fixje (NL) | catalogue public | **200 produits avec prix** (« iphone 13 ») | iPhone 13 Pro : 252 € |
| Refreshed Apples (NL) | catalogue public (Shopify) | **117 produits avec prix** (« iphone ») | iPhone 8 Used 256 GB grade B : 179 € |
| eBay France | API officielle Browse | **30 produits avec prix** (« iphone 13 128 ») | Apple iPhone 13 128 Go : 182,70 € |
| Brico-phone (FR) | plan du site + JSON-LD | **3 produits avec prix** (« ecran iphone 13 ») | Écran iPhone 13 - Origine Apple : 199,90 € |
| Servisní díly (CZ) | plan du site + JSON-LD | **3 produits avec prix** (« iphone ») | Baterie pro iPhone 7 Plus : 252 CZK |
| Foneday | Shopify | échec : HTTP 404 sur le point d'entrée de recherche | — |
| MobileSentrix EU | Shopify | échec : HTTP 404 | — |
| Mobileparts.shop, iFixit EU, Rewa | WooCommerce | échec : la page renvoie du HTML, pas l'API attendue | — |
| Replace Base | WooCommerce / plan du site | échec : HTTP 202 et plan du site introuvable | — |
| Jobalots | — | refusé : robots.txt interdit l'accès | — |
| Utopya | — | bloqué : CGV article 14 | — |

**Recherches réelles des utilisateurs** (sources activées : Brico-phone, Refreshed Apples, Servisní díly) :
- 13/10, « iphone 12 » : 157 offres trouvées et enregistrées ;
- « iphone 13 » : 93 offres ;
- « iphone 15 pro » : 18 offres.

Durée : de 26 à 46 s, après la correction de l'enregistrement en parallèle (contre 118 s avant).

## 2. Joignabilité de l'annuaire (05:41 UTC, table `supplier_directory_checks`)

- 120 sites contrôlés : **102 joignables** et 18 non.
- Parmi les non joignables : 11 HTTP 403 anti-robot, 3 délais ou erreurs TLS, 1 domaine inexistant, 3 sans site officiel identifié.
- robots.txt interdit tout accès pour 3 sites joignables.
- Plateformes détectées : Shopify, WooCommerce, PrestaShop, Magento, Shopware.

## 3. Vague A : essais réels des connecteurs (13/10/2026, serveur MON STOCK)

**Méthode.** Route protégée `POST /cron/adapter-probe` de l'Edge Function `api` (versions 44 à 50), déclenchée depuis la base par `pg_net`.

- Elle exécute **exactement** le code de collecte (recherche, ou première page du catalogue) contre le vrai site, depuis le serveur.
- robots.txt est vérifié avant toute requête. Une requête à la fois par site, avec au moins 1,5 s d'intervalle.
- Seuls les adaptateurs publics sont autorisés : aucun compte, aucun identifiant.
- **Rien n'est écrit en base** : les réponses ne sont conservées que dans le journal technique `net._http_response`, requêtes 587 à 667.

**Règle de comptage.** Un fournisseur est « fonctionnel » seulement si le connecteur a réellement extrait des produits **avec un prix supérieur à 0**. Ce qui ne compte pas :
- des fiches lues sans prix ;
- un prix lu sur une page qui n'est pas une fiche produit (guide, page d'accueil…).

**Abréviations.** WooCommerce = API publique « Store API » de la boutique. Shopify = `products.json` public. Plan du site = sitemap publié pour les robots, puis données structurées schema.org (JSON-LD) ou balises produit de chaque fiche.

### 3.1 Fournisseurs fonctionnels (26)

Chiffres pour une seule page de collecte ; le catalogue complet est plus grand et se parcourt par lots avec reprise.

| Fournisseur | Méthode | Produits avec prix (1 page) | Devise | Stock | Exemple réel relevé |
| --- | --- | --- | --- | --- | --- |
| Refreshed Apples (NL) | Shopify / plan du site | 1 463 / 121 | EUR (confirmé par JSON-LD) | statut (6 sur 121 via JSON-LD) | iPhone 8 Used 256 GB Gold grade B/C : 159 € |
| Fixje (NL) | WooCommerce | 200 (recherche), 100/page | EUR | statut | Verre de confidentialité iPhone 16 Plus : 14,95 € |
| Repuestosmovil (ES) | WooCommerce | 200, 100/page | EUR | statut | Écran LCD iPhone 15 Pro Max : 54,60 € |
| Ekolow (FR) | WooCommerce | 200 (« macbook ») | EUR | statut, **21 avec quantité** | Carte fille jack/audio MacBook : 49,90 € |
| Flashmac (IT) | WooCommerce | 100/page | EUR | statut, **41 avec quantité** | contient des devis « Preventivo » à exclure (ex. 13 559 €) |
| Subastalotes (ES) | WooCommerce | 100 lots/page | EUR | **quantité sur 100 lots** | Carton de jouets : 152,09 € (épuisé) |
| PC Ricondizionati (IT) | WooCommerce | 18 MacBook | EUR | statut | MacBook Pro 2021 reconditionné : 974,78 € |
| Pulled Mac Parts (NL) | Shopify / plan du site | 253 / 21 | EUR (confirmé par JSON-LD) | statut | Écran MacBook Pro 14 M1 d'origine : 445 € (rupture) |
| iFixit EU Store | Shopify | 380 | **non fournie** (le JSON public n'a pas de devise ; les fiches n'ont pas de données structurées) | statut | Ruban Tesa 1 mm : 5,95 (devise à confirmer) |
| Mobinova | plan du site | 22 | EUR | statut | Châssis iPhone 14 Pro Max argent : 75 € (rupture) |
| DA Pièces (FR) | plan du site | 8 | EUR | statut | Haut-parleur iPhone 11 : 2 € |
| Bestellaptops (NL) | plan du site | 8 | EUR | statut | Dell Latitude 5480 i5 8 Go : 199,99 € |
| MobileSentrix EU (NL) | plan du site | 8 | EUR | statut | Joystick PS5 TMR : 2,21 € |
| Servisní díly (CZ) | plan du site | 8 | CZK | statut (6) | Coque arrière Xiaomi Mi4 : 63 CZK |
| 2repair.parts | plan du site | 8 | GBP | statut | Écran HTC One M8 : 21,35 £ (rupture) |
| GSMOK (PL) | plan du site compressé (.gz) | 7 | EUR | statut | Écran Xiaomi Poco X5 Pro : 26,22 € (stock faible) |
| Hurtel (PL) | plan du site compressé (.gz) | 8 | EUR, PLN | statut | Support vélo mural Rockbros : 22,81 € (généraliste) |
| Mobilepart.pl (PL) | plan du site | 8 | PLN | statut | Écran Samsung A10 : 48 PLN (en stock) |
| Portatilmovil (ES) | plan du site | 8, **EAN sur 8** | EUR | statut | 100 vis de clavier portable : 14,62 € |
| ComputerG | plan du site (fiches de plus de 4 Mo lues en partie) | 3 | EUR | statut | Seagate IronWolf Pro 10 To : 524,36 € |
| Shop Technoworld (IT) | plan du site | 4 | EUR | statut | Écran iPhone 4 blanc : 4,99 € |
| Brico-phone (FR) | plan du site | 5 | EUR | statut | Nappe jack iPhone 4 : 0,39 € |
| Eurolots | plan du site | 8 | EUR | statut | Lot 3B Scientific : 200 € |
| Bitstockz (PL) | plan du site | 8 | PLN | statut | Palette Amazon MIX : 1 629,51 PLN |
| It Just Good (FR) | plan du site | 2 (**partiel** : la plupart des URL du plan répondent 404) | EUR | statut | Écran LG Flatron 19" : 149,90 € (rupture) |
| eBay France | API officielle Browse | 30 (contrôle quotidien) | EUR | — | iPhone 13 128 Go : 182,70 € |

« Statut » = disponibilité en stock / rupture. « Quantité » = nombre d'unités disponibles. La quantité n'est fournie que par les boutiques WooCommerce qui l'exposent : Ekolow, Flashmac, Subastalotes.

### 3.2 Échecs et raisons exactes

**Prix réservés aux comptes professionnels.** Le connecteur lit les fiches, mais aucun prix public n'y figure. Ils ne sont **pas** comptés.

| Fournisseur | Constat réel |
| --- | --- |
| MPS Mobile (DE) | 8 fiches lues avec **quantité et EAN**, mais 0 prix |
| Mobistock (NL) | 8 fiches avec quantité et EAN, 0 prix |
| Dutch Mobile Parts (NL) | 100 produits WooCommerce, 0 prix |
| 4Phones | fiches lues, 0 prix |
| LCD-Phone (FR) | fiches lues, 0 prix |
| Mobilax (FR) | fiches lues, 0 prix (Kbis exigé) |
| Hurtowniagsm (PL) | fiches lues, 0 prix |
| TR-Vertrieb (DE) | 24 fiches « wholesale » lues avec statut de stock, 0 prix |
| A-Parts (PL), Buymolano, B2B Mobile Wholesalers | fiches ou offres sans prix structuré |

**Pages lues sans prix structuré** (ni JSON-LD, ni balise produit) :
- iFixit EU : les fiches n'en ont pas, seul `products.json` fonctionne ;
- Phonegigant (NL) ;
- Wholesale Clearance UK : pages de catégories ;
- Horepa (FR), IPartsPro, Nowacell (PL), Sifar (IT), Dutchspares, Smartchoice (EE) : catégories ou pages de modèles. Nowacell et Sifar ont été essayés sur 20 pages, sans aucune fiche produit atteinte ;
- Spareka : électroménager, hors sujet.

**Prix trouvés mais non comptés :**
- Retourendirekt.de : prix de 600 € lus sur des pages de présentation multilingues, pas sur des fiches produit.
- Smartgrade.fr : tarifs de **rachat**, pas de vente.

**Plan du site absent ou introuvable :**
- 404 : Macway, Ecoportatil, GSM Parts Center, Mobileworld.at, Mobiltec24, Smaaart, AppleParts.pl, PC-Portatil ;
- introuvable ou vide : Foneday, Replace Base EU, Mobileparts.shop, PhoneMadrid, SOSav, TheBookYard, Tecnofix, Smartpart4u ;
- Rewa : seulement un plan local, au format KML.

**Refus ou blocage, sans contournement :**
- robots.txt interdit l'accès : Certideal, Injured Gadgets, Ingrosmart, ITP Technologie, Pieces2Mobile, Spainsellers, IT-Versand.
- Telehurt (PL) : HTTP 415 au second passage.
- Replace Base (UK) : HTTP 202 (page anti-robot).
- iParts4u : délai dépassé.
- pro.sosav.fr : le domaine n'existe pas.
- Utopya : CGV article 14, aucun essai. B-Stock : CGU, aucun essai.

**Hors collecte automatique :**
- Mobile Depot : pages « devis » et listes de stock par e-mail ;
- Life365 : site institutionnel, sans boutique.

### 3.3 Corrections faites pendant les essais (code, sans base de données)

- Plans du site compressés `.gz` : lecture avec une taille maximale après décompression. Cela a débloqué GSMOK et Hurtel.
- Plans du site géants (plus de 10 Mo) et fiches de plus de 4 Mo : le début est lu au lieu d'échouer. Cela a débloqué ComputerG.
- Mémoire bornée (25 Mo de plans du site par boutique) : le serveur saturait (« Memory limit exceeded ») quand plusieurs essais tournaient ensemble.
- robots.txt vérifié par lot de fiches au lieu des 40 000 URL d'un plan du site, avec les règles compilées une seule fois.
- Ordre des URL : fiches produit d'abord. Les pages de service, catégories (`-c-12.html`, `/k882,…`), guides et tutoriels sont écartés.
- Repli sur les balises produit Open Graph et microdonnées quand une fiche n'a pas de JSON-LD.
- HTTP 429/503 : une seule nouvelle tentative après 10 s.
- Shopify 429 sur `products.json` (4Phones, Mobinova, Bestellaptops, DA Pièces) : passage par le plan du site du même site. Trois sur quatre fonctionnent.

## 4. Ce qui n'a PAS été fait

- Aucune modification de la base de production, aucune migration appliquée.
  - Les 18 nouveaux fournisseurs fonctionnels sont ajoutés **dans le code** de la bibliothèque (commit poussé, **non déployé**).
  - Leur activation dans l'application exige la vérification quotidienne, qui écrit son résultat en base : elle attend ton accord.
- Aucun compte créé, aucun devis, aucune commande, aucun contournement (CAPTCHA, anti-robot, connexion).
- Ingram Micro et BigBuy : adaptateurs testés sur données de test seulement (aucun compte).

## 5. Étape 1 : première collecte réelle enregistrée en base (13/10/2026, organisation Snowolff)

**Ce qui a été fait :**
- Edge Function `api` déployée en v51 à v53.
- Contrôle réel (robots.txt + produits avec prix) des 18 nouveaux fournisseurs et de MobileSentrix : 19 sur 19 « ok » dans `sourcing_library_checks`.
- Activation sur l'organisation, avec mention dans `access_conditions` : « Activation demandée par le titulaire du compte (session Claude Code du 13/10/2026) ; conditions du fournisseur non relues individuellement par le titulaire, à relire ».
- Collecte partielle bornée par source. Une collecte partielle n'expire **aucune** offre.

**Comptage** : offres réellement persistées dans `sourcing_offers` et lisibles par le titulaire du compte. La lisibilité a été vérifiée avec la sécurité par ligne (RLS) sous son identité : 113 candidates pour « iphone 13 », triées par prix.

| Fournisseur | Offres en base | Prix > 0 | Devise | En stock / faible / rupture / inconnu | Quantité | EAN | Dernier passage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Subastalotes | 300 | 300 | EUR | 0 / 50 / 250 / 0 | 300 | 0 | succès |
| Ekolow | 243 | 243 | EUR | 212 / 27 / 4 / 0 | 28 | 0 | coupé par la limite de 150 s (écriture en cours) |
| Repuestosmovil | 208 | 208 | EUR | 208 / 0 / 0 / 0 | 0 | 0 | coupé par la limite de 150 s |
| PC Ricondizionati | 198 | 198 | EUR | 197 / 0 / 1 / 0 | 0 | 0 | coupé par la limite de 150 s |
| Flashmac | 127 | 127 | EUR | 82 / 45 / 0 / 0 | 45 | 1 | succès (catalogue complet ; contient des devis « Preventivo ») |
| Mobinova | 22 | 22 | EUR | 14 / 0 / 8 / 0 | 0 | 0 | succès (partiel) |
| Pulled Mac Parts | 21 | 21 | EUR | 7 / 0 / 14 / 0 | 0 | 0 | succès (partiel) |
| 2repair | 16 | 16 | GBP | 4 / 0 / 12 / 0 | 0 | 0 | succès (partiel) |
| Mobilepart.pl | 16 | 16 | PLN | 11 / 0 / 5 / 0 | 0 | 0 | succès (partiel) |
| Bitstockz | 16 | 16 | PLN | 12 / 0 / 4 / 0 | 0 | 0 | succès (partiel) |
| MobileSentrix EU | 14 | 14 | EUR | 14 / 0 / 0 / 0 | 0 | 0 | partiel (pages en erreur) |
| GSMOK | 9 | 9 | EUR | 2 / 5 / 2 / 0 | 0 | 0 | partiel (7 pages sur 20 en erreur) |
| DA Pièces | 8 | 8 | EUR | 8 / 0 / 0 / 0 | 0 | 0 | succès (partiel) |
| Bestellaptops | 8 | 8 | EUR | 8 / 0 / 0 / 0 | 0 | 0 | succès (partiel) |
| Portatilmovil | 8 | 8 | EUR | 8 / 0 / 0 / 0 | 0 | 8 | succès (partiel) |
| Eurolots | 8 | 8 | EUR | 8 / 0 / 0 / 0 | 0 | 0 | succès (partiel) |
| Hurtel | 6 | 6 | EUR | 5 / 0 / 1 / 0 | 0 | 0 | succès (partiel) |
| Shop Technoworld | 4 | 4 | EUR | 4 / 0 / 0 / 0 | 0 | 0 | partiel (1er essai : erreur réseau) |
| ComputerG | 3 | 3 | EUR | 3 / 0 / 0 / 0 | 0 | 0 | succès (fiches de plus de 4 Mo) |

**Total : 1 225 nouvelles offres**, toutes avec un prix > 0, un lien vers la fiche et un prix converti en EUR (taux BCE).

Les 3 sources existantes (Refreshed Apples, Brico-phone, Servisní díly) n'ont pas été recollectées : 396 offres inchangées. Leurs stocks « inconnu » sont restés « inconnu » (349 chez Refreshed Apples).

**Garde-fous constatés :**
- Aucun doublon : contrainte unique (organisation, source, identifiant externe).
- Aucune offre expirée pendant ces collectes partielles.
- Les ruptures enregistrées sont celles déclarées par le fournisseur : quantité 0 chez Subastalotes, disponibilité schema.org ailleurs.

**Limites constatées :**
- L'ancien parcours écrivait tout après avoir lu toutes les pages : 4 passages ont dépassé 150 s et ont été coupés pendant l'écriture. Les offres déjà écrites restent valides et rien n'a expiré.
- Corrigé dans la collecte hebdomadaire : écriture page par page, 4 à la fois, budget vérifié pendant l'écriture, reprise au bon rang.
