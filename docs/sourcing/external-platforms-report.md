# Plateformes externes de sourcing B2B — étude détaillée

Étude du 15/10/2026 pour MON STOCK (organisation Snowolff). Aucune intégration n'a été faite : ce document décrit et évalue, il ne modifie ni le code, ni la base, ni la configuration.

| Document | Contenu |
|---|---|
| **Ce fichier** | Fiches des solutions en 15 points, évaluation économique, conclusion en 8 points |
| [external-platforms-comparison.md](external-platforms-comparison.md) | Tableau comparatif, classement pondéré, exclusions |
| [external-platforms-integration.md](external-platforms-integration.md) | Architecture d'intégration proposée (non implémentée) |
| [external-platforms-test-plan.md](external-platforms-test-plan.md) | Protocole de test, seuils de décision, questions aux fournisseurs |
| [Rapport de synthèse](../../reports/Plateformes%20externes%20sourcing%20B2B.md) | Source de vérité de cette étude |
| [Notes de recherche](../../research_notes/Plateformes%20externes%20sourcing%20B2B/) | 6 fichiers de constats sourcés (URL) |

---

## En bref

- **Aucune plateforme unique** ne réunit beaucoup de fournisseurs, de vrais prix d'achat pro, des grades, des capacités, des EAN et un flux officiel pour les catégories de Snowolff.
- Le marché se divise en trois familles qui ne se recoupent pas :
  - **agrégateurs avec API ou flux** (ITscope, Stock in the Channel, DistriHUB) : **neuf seulement** ;
  - **places de marché multi-vendeurs du reconditionné** (Callisto, gsmExchange, Merkandi) : grades et prix de gros réels, **aucune API publique** ;
  - **grossistes uniques à flux officiel** (Foxway, Foneday, ThePhoneHub, Ingram Micro).
- Meilleure source à tester : **Foxway** (grossiste unique). Alternatives : **Callisto** et **DistriHUB**. Pièces : **Foneday**.
- Recommandation : **tester davantage** sur un panel de références réelles avant toute intégration.

---

## 1. Méthode et limites

| Point | Détail |
|---|---|
| Mode de recherche | **Extraits de moteur de recherche uniquement.** Le proxy de sortie de la session a refusé toute lecture directe des pages (`getaddrinfo ENOTFOUND`, `CONNECT tunnel failed, response 403`, `connect_rejected`) sur gsmexchange.com, callisto.tech, foxway.com, itscope.com, icecat.com, stockinthechannel.com, foneday.shop, merkandi.com, bigbuy.eu, developer.ebay.com, etc. |
| Portée des URL | Les URL citées sont exactes, mais le texte n'a pas été relu sur la page en direct. |
| À revérifier | **Tous les chiffres, tarifs et clauses de CGU** (stockage, fréquence de synchronisation, usage dans un logiciel tiers) sur la page officielle, puis par écrit auprès du fournisseur avant toute intégration. |
| Comptes | **Aucun compte créé, rien souscrit**, aucune zone membre contournée. |
| Prix | Aucune donnée comparative de prix réels n'existe dans cette étude : **aucune affirmation de « meilleurs prix »** n'est faite. |
| Données internes | Les informations DistriHUB, ThePhoneHub et une partie de Foxway viennent de l'annuaire MON STOCK du 12–13/10 ([supplier-directory.csv](supplier-directory.csv), [b2b-profiles.ts](../../src/services/sourcing/data/b2b-profiles.ts)), lui aussi construit sur extraits de recherche. |

**Légende des niveaux de preuve**

| Étiquette | Sens |
|---|---|
| **CONFIRMÉ** | La page officielle de l'éditeur le dit (lue en extrait de recherche). |
| **ANNONCÉ** | Affirmation marketing de l'éditeur, ou information rapportée seulement par un tiers. |
| **HYPOTHÈSE** | Déduction de l'auteur. |
| **À CONFIRMER** | « À confirmer auprès du fournisseur » : l'information n'est pas publique. |

Une case « non trouvé » signifie que l'information n'apparaît dans aucune source publique consultée. Rien n'a été inventé pour la remplir.

---

## 2. DistriHUB : de quelle plateforme parle-t-on ?

| Constat | Preuve |
|---|---|
| La recherche web du 15/10 n'a trouvé **aucune plateforme française « DistriHUB »** qui agrège des grossistes IT ou téléphonie (deux recherches FR, dont « informatique revendeurs catalogue grossistes »). | Absence constatée ([notes IT](../../research_notes/Plateformes%20externes%20sourcing%20B2B/it_distribution_aggregators.md)) |
| Le seul « DistriHub » indexé est un **ERP/caisse kényan** (commerçants, grossistes, pharmacies, hôtels), en anglais seulement, 0 avis, avec un module « DistriMarket ». Sans rapport avec le besoin. | CONFIRMÉ (fiche annuaire) — [Capterra](https://www.capterra.com/p/10043767/DistriHub/), [Capterra AU](https://www.capterra.com.au/software/1099095/DistriHub) |
| L'annuaire fournisseurs de MON STOCK (13/10) référence un **DistriHUB lituanien opéré par Varle**, sur [distrihub.eu](https://distrihub.eu/). | ANNONCÉ — [supplier-directory.csv](supplier-directory.csv) (ligne « DistriHUB (Varle.lt) ») |
| L'outil français historique qui correspond à « consulter les stocks des grossistes IT » est **compuBase.biz / EasyStockOnLine**. Rien ne permet d'affirmer que c'est lui. | HYPOTHÈSE |

**À faire par l'utilisateur :** préciser d'où vient le nom « DistriHUB » (URL, salon, contact commercial, SIREN). La fiche DistriHUB ci-dessous porte sur **distrihub.eu (Varle, LT)**, avec une confiance faible tant que l'identité n'est pas confirmée.

---

## 3. Grille d'évaluation en 15 points

Chaque fiche suit la même grille :

1. Nom / site
2. Fonctionnement
3. Fournisseurs / catégories
4. Couverture reconditionné, pièces Apple, IT, lots
5. Prix d'achat pro
6. Stocks, grades, capacités, EAN
7. API / flux
8. Documentation
9. Conditions d'accès
10. Coûts
11. Usage dans un logiciel tiers
12. CGU : stockage, fréquence
13. Commande
14. Géographie / devises
15. Avantages, limites, confiance

Familles : [A. Agrégateurs IT neuf](#a-agrégateurs-it-neuf) · [B. Places de marché du reconditionné](#b-places-de-marché-du-reconditionné) · [C. Grossistes à flux officiel](#c-grossistes-à-flux-officiel) · [D. Pièces détachées et logiciels de réparation](#d-pièces-détachées-et-logiciels-de-réparation) · [E. Lots, palettes, déstockage](#e-lots-palettes-déstockage) · [F. Dropshipping et agrégateurs de flux](#f-dropshipping-et-agrégateurs-de-flux) · [G. Données de marché et veille tarifaire](#g-données-de-marché-et-veille-tarifaire) · [H. Exclus](#h-exclus)

---

## A. Agrégateurs IT neuf

Point commun : multi-fournisseurs et flux officiel, mais **neuf seulement**, et pour ITscope / Stock in the Channel, des prix pro **seulement avec un compte approuvé chez chaque distributeur**. Ils agrègent l'ouverture de comptes, ils ne la remplacent pas.

### A1. DistriHUB (distrihub.eu, Varle, Lituanie)

Toutes les informations viennent de l'annuaire MON STOCK (recherche du 12–13/10, extraits de distrihub.eu et de ses pages marques). La recherche du 15/10 ne les a pas recoupées : tout est au mieux **ANNONCÉ**.

| Point | Constat | Statut / source |
|---|---|---|
| 1. Nom / site | DistriHUB, [distrihub.eu](https://distrihub.eu/), opéré par Varle (LT). Ni le DistriHub kényan, ni une plateforme française | ANNONCÉ ; identité à confirmer par l'utilisateur |
| 2. Fonctionnement | Catalogue de biens techniques grand public pour acheteurs pro vérifiés ; disponibilité en direct dans le flux acheteur après ouverture du compte ; paiement à 30–60 jours pour acheteurs vérifiés ; dropshipping « blind » | ANNONCÉ — [annuaire](supplier-directory.csv) |
| 3. Fournisseurs / catégories | « 1M SKUs from 400+ suppliers » : smartphones, tablettes, portables, TV, électroménager ; marques Samsung, Apple, Xiaomi, Realme, Poco, Sony, Sharp, ADATA | ANNONCÉ, non vérifiable — [distrihub.eu/brands](https://distrihub.eu/brands) |
| 4. Couverture | **Neuf seulement** (aucun reconditionné vu) ; ni pièces ni lots ; les smartphones ne sont qu'une partie d'un catalogue généraliste | ANNONCÉ ; reconditionné À CONFIRMER |
| 5. Prix pro | Prix et stock dans le flux après validation du compte ; grille unique ou personnalisée : inconnu | ANNONCÉ ; À CONFIRMER |
| 6. Données | EAN comme référence ; quantités « live » ; grades sans objet (neuf) ; capacité à déduire de l'EAN ou du titre | ANNONCÉ |
| 7. API / flux | XML, JSON, CSV, EDI et API ; connecteurs natifs BaseLinker et ChannelEngine | ANNONCÉ |
| 8. Documentation | Non publique | Constat du 12/10 ([SOURCING-B2B.md](../SOURCING-B2B.md)) |
| 9. Accès | « We verify every buyer » : ni consommateurs ni vendeurs non enregistrés ; ouverture en 1 à 2 semaines | ANNONCÉ |
| 10. Coûts | **Commande minimale 300 €** ; dropshipping « blind » 3 € par colis ; frais de 39 € sous 1 500 € ; aucun abonnement trouvé | ANNONCÉ ; 39 € À CONFIRMER ([b2b-profiles.ts](../../src/services/sourcing/data/b2b-profiles.ts)) |
| 11. Logiciel tiers | Les connecteurs BaseLinker / ChannelEngine montrent un flux conçu pour alimenter des logiciels | HYPOTHÈSE |
| 12. CGU | Non lues | À CONFIRMER |
| 13. Commande | Via DistriHUB, qui semble vendre en son nom (paiement à terme) | HYPOTHÈSE |
| 14. Géographie / devises | UE ; EUR | ANNONCÉ |
| 15. Bilan | **+** multi-fournisseurs, flux standard, minimum bas, EAN fiable pour le rapprochement. **−** neuf seulement, compétitivité inconnue face aux distributeurs français, identité non confirmée. **Confiance : faible** | — |

### A2. ITscope (Karlsruhe, DE)

| Point | Constat | Statut / source |
|---|---|---|
| 1. Nom / site | ITscope GmbH, filiale de weclapp SE depuis 2021 ; [itscope.com](https://www.itscope.com/) | CONFIRMÉ (presse) — [ChannelPartner](https://www.channelpartner.de/article/3902764/weclapp-se-uebernimmt-itscope.html) |
| 2. Fonctionnement | Comparateur prix/stock de distributeurs, commande EDI, API, intégration ERP, boutique B2B ; prix standard publiés **ou vos prix individuels** si vous renseignez vos identifiants distributeur | CONFIRMÉ — [IT-Distributoren vergleichen](https://www.itscope.com/it-distributoren-vergleichen/), [Guide prix individuels](https://guide.itscope.com/kb/wie-kann-ich-meine-individuellen-preise-in-itscope-hinterlegen/) |
| 3. Fournisseurs / catégories | « Plus de 400 » distributeurs (2021), « environ 340 » (2018), « plus de 350 » (page EN) ; 7 M ou 3 M de produits selon la page ; EDI avec plus de 80 distributeurs ; environ 5 000 entreprises clientes | ANNONCÉ, contradictoire — [pressetext 2021](https://www.pressetext.com/news/20210712004), [ITscope EN](https://www.itscope.com/en/), [Guide EN](https://guide.itscope.com/en/) |
| 4. Couverture | IT et électronique neufs, Apple via les distributeurs broadline ; aucun reconditionné gradé, aucune pièce Apple, aucun lot trouvé | HYPOTHÈSE (absence dans les sources) |
| 5. Prix pro | Oui, personnalisés, **seulement avec un numéro client chez chaque distributeur** ; sans compte, il faut d'abord s'inscrire chez le distributeur via son commercial | CONFIRMÉ — [Lieferantenkonten](https://guide.itscope.com/kb/einrichten-von-lieferantenkonten/) |
| 6. Données | Prix, stock, EAN et MPN (deeplink par EAN ou MPN), fiches ; rien sur grades ou états | CONFIRMÉ pour EAN/MPN — [ChannelPartner](https://www.channelpartner.de/article/3897282/arbeitserleichterung-fuer-fachhaendler.html) |
| 7. API / flux | API XML ou JSON (produit, prix, marché) ; API de commande avec récupération des documents EDI ; prix tirés en direct si le distributeur a une interface, sinon synchronisés plusieurs fois par heure | CONFIRMÉ — [Individuelle API](https://www.itscope.com/loesungen/itscope-erp-integration/individuelle-api/) ; fréquence ANNONCÉ — [IT procurement](https://www.itscope.com/en/solutions/it-procurement/) |
| 8. Documentation | Guide en ligne avec méthodes (ex. `business/deals/send`) ; pas de portail développeur complet ; un éditeur tiers (Equipme) documente « Company Key » et une synchronisation chaque matin | CONFIRMÉ en partie — [Guide](https://guide.itscope.com/en/kb/business-deals-send-method/), [Equipme](https://hub.equipme.io/documentation/administration/integrations/it-scope/automatic-price-synchronization-with-itscope.md) |
| 9. Accès | Réservé aux professionnels ; extrait de registre ou Gewerbeschein ; ITscope peut ajouter des conditions | CONFIRMÉ — [CGV mai 2023 (PDF)](https://www.itscope.com/wp-content/uploads/2023/05/ITscope-AGB-Mai-2023.pdf) |
| 10. Coûts | Mensuel, **facturation annuelle seulement** : Essential 51 €, Essential+ 72 €, ERP Integration 189 €, B2B Commerce 369 € ; utilisateur supplémentaire dès 20 € ; **API 104 €/mois pour 5 000 appels/mois au plus**. Une page brouillon affiche 49/69/179/349 € ; anciens chiffres tiers (49 €, API gratuite 100 appels) obsolètes | CONFIRMÉ — [Preise](https://www.itscope.com/preise/), [Individual API](https://www.itscope.com/en/solutions/itscope-erp-integration/individual-api/) ; HT et cumul Essential + API À CONFIRMER |
| 11. Logiciel tiers | Oui, c'est le but de l'API (Equipme, Synesty) | CONFIRMÉ — [Equipme](https://hub.equipme.io/documentation/administration/integrations/it-scope.md) |
| 12. CGU | Stockage et redistribution non trouvés ; le quota de 5 000 appels limite de fait à environ 166 appels/jour | À CONFIRMER |
| 13. Commande | Depuis ITscope vers les distributeurs connectés ; facture émise par le distributeur | CONFIRMÉ — [Optimiert bestellen](https://www.itscope.com/loesungen/optimiert-bestellen/) |
| 14. Géographie / devises | Ancrage DACH ; ambition « Kerneuropa » incluant la France annoncée en 2020 ; EUR ; liste des distributeurs français connectés non trouvée | ANNONCÉ — [ChannelPartner COP](https://www.channelpartner.de/article/3899408/itscope-uebernimmt-cop-software.html) |
| 15. Bilan | **+** prix réels par compte, API et commande, tarifs publics. **−** comptes distributeurs préalables, interface en allemand, couverture France inconnue, aucun reconditionné, quota serré. **Confiance : moyenne-haute** sur la technique, faible sur l'utilité pour Snowolff | — |

### A3. Stock in the Channel (Royaume-Uni, version FR)

| Point | Constat | Statut / source |
|---|---|---|
| 1. Nom / site | Stock in the Channel ; [fr.stockinthechannel.com](https://fr.stockinthechannel.com/Distributor/Flex-IT-Distribution/11) | CONFIRMÉ |
| 2. Fonctionnement | Agrège les stocks de nombreux fournisseurs en une recherche, « with accurate stock and prices personalised to you » ; export vers boutique ou devis ; commande EDI avec suivi | ANNONCÉ — [fr.SITC Tech Data](https://fr.stockinthechannel.com/Distributor/Tech-Data-/8) |
| 3. Fournisseurs / catégories | France : **35 fournisseurs, 2,0 M de produits** ; « plus de 130 distributeurs » (FAQ ancienne) ; « plus de 300 » dans le monde (PDF 2018) ; 22 pays, 25 000+ clients | ANNONCÉ, dates différentes — [fr.SITC ALSO](https://fr.stockinthechannel.com/Distributor/Also-International/27), [FAQ](https://discover.stockinthechannel.com/frequently-asked-questions/) |
| 4. Couverture | Distribution IT, bureautique, consommables (Tech Data, ALSO, Flex IT, FLP…) ; rien de spécifique au reconditionné, aux pièces Apple ou aux lots. Liste aussi « Foxway (FKA DCC) » sur d'autres pays | HYPOTHÈSE — [annuaire FR](https://ww3.fr.stockinthechannel.com/Distributors/Open), [SITC DK Foxway](https://dk.stockinthechannel.com/Distributor/Foxway-FKA-DCC-/16) |
| 5. Prix pro | Oui, personnalisés, **à condition d'être approuvé par chaque fournisseur** ; environ 20 fournisseurs (surtout de pièces) approuvent automatiquement ; les non-revendeurs ne voient en général pas les prix | CONFIRMÉ, FAQ ancienne — [FAQ](https://discover.stockinthechannel.com/frequently-asked-questions/) |
| 6. Données | Stock, prix, descriptions normalisées, mis à jour chaque jour ; grades, état, capacité, EAN non documentés | CONFIRMÉ pour stock et prix |
| 7. API / flux | Datafeed « flat file » ou « multi-file », quotidien ou horaire ; couvre Ingram Micro, Exertis, Arrow, TD SYNNEX… ; pas d'API REST trouvée | ANNONCÉ — [discover.SITC](https://discover.stockinthechannel.com/?p=1135) |
| 8. Documentation | PDF « Distributor Feed Instructions and Notes (Revision 4.0) » | CONFIRMÉ, daté 2018 — [PDF](https://discover.stockinthechannel.com/wp-content/uploads/2018/07/Datafeed-setup-information-1.pdf) |
| 9. Accès | Inscription gratuite pour voir le stock ; comptes distributeurs nécessaires pour les prix | CONFIRMÉ — [FAQ](https://discover.stockinthechannel.com/frequently-asked-questions/) |
| 10. Coûts | Comparaison de vos prix **£30/mois** après 2 mois gratuits (FAQ) contre « from £50/month » (PDF 2018) ; **datafeed / Web Store dès £300/mois** ; 12 mois pour 10 en annuel | CONFIRMÉ mais ancien, en GBP — [PDF 2018](https://discover.stockinthechannel.com/wp-content/uploads/2018/07/Reseller-Services-and-Indicative-Pricing.pdf) ; tarifs 2026 en EUR À CONFIRMER |
| 11. Logiciel tiers | Datafeed prévu pour e-commerce, devis, service client | ANNONCÉ |
| 12. CGU | Licence du datafeed non trouvée | À CONFIRMER |
| 13. Commande | EDI vers les fournisseurs | ANNONCÉ |
| 14. Géographie / devises | 22 pays dont France et Espagne ; EUR en France | HYPOTHÈSE pour la devise |
| 15. Bilan | **+** interface française, essai gratuit, révèle quels distributeurs accepteraient Snowolff. **−** neuf seulement, datafeed cher, sources anciennes. **Confiance : moyenne** | — |

### A4. compuBase.biz / EasyStockOnLine (France)

| Point | Constat | Statut / source |
|---|---|---|
| 1. Nom / site | EasyStockOnLine, intégré à la place de marché [compuBase.biz](http://content.compubase.biz/fr/qui-sommes-nous/easystockonline) | CONFIRMÉ |
| 2. Fonctionnement | Consultation des stocks et prix des grossistes IT ; choisi en avril 2023 par la FRP2I (200 revendeurs indépendants) | ANNONCÉ — [Solutions Numériques](https://www.solutions-numeriques.com/la-federation-des-revendeurs-et-prestataires-informatiques-independants-choisit-compubase-biz-easystock-comme-plateforme-dacces-aux-disponibilites-de-stocks-des-grossistes-it/) |
| 3. Fournisseurs / catégories | **16 distributeurs partenaires**, plus de 450 000 références (page non datée citant Actebis et TechData, noms changés depuis → page ancienne) ; 20 grossistes consultables gratuitement en 2011 ; compuBase.biz : 13 000+ abonnés | CONFIRMÉ (page éditeur ancienne) ; [ChannelBiz 2011](https://www.channelbiz.fr/2011/01/25/la-plateforme-revendeurs-compubasebiz-easystockonline-accueille-7-nouveaux-grossistes/) |
| 4. Couverture | IT neuf seulement | HYPOTHÈSE |
| 5. Prix pro | Probablement génériques, pas vos conditions | HYPOTHÈSE |
| 6. Données | Non documentées | non trouvé |
| 7. API / flux | Aucune API ni flux trouvé | absence constatée |
| 8. Documentation | Aucune | — |
| 9. Accès | Non trouvé | À CONFIRMER |
| 10. Coûts | Aucun tarif public | À CONFIRMER |
| 11. Logiciel tiers | Non trouvé | À CONFIRMER |
| 12. CGU | Non trouvées | À CONFIRMER |
| 13. Commande | Non trouvé | À CONFIRMER |
| 14. Géographie / devises | France et Europe annoncées ; devises non trouvées | ANNONCÉ |
| 15. Bilan | Outil de consultation web plutôt que flux intégrable. Peut-être le « DistriHUB français » évoqué, sans preuve. **Confiance : faible** | — |

---

## B. Places de marché du reconditionné

Point commun : beaucoup de vendeurs, grades et prix de gros réels, **aucune API publique trouvée**.

### B1. Callisto (callisto.tech)

| Point | Constat | Statut / source |
|---|---|---|
| 1. Nom / site | Callisto, [callisto.tech](https://callisto.tech/) | CONFIRMÉ |
| 2. Fonctionnement | Vendeurs en enchère, catalogue à prix fixe ou offres ; enchères hebdomadaires en direct ou silencieuses gérées par un vendor manager ; **séquestre** libéré quand l'acheteur confirme la conformité | CONFIRMÉ — [How it works](https://callisto.tech/how-it-works), [Buy with confidence](https://callisto.tech/blog/how-to-buy-wholesale-used-electronics-with-confidence) |
| 3. Fournisseurs / catégories | Nombre de vendeurs non publié ; acheteurs « 2 500+ » ou « 3 500+ » selon la page, 50+ pays ; stock d'OEM, opérateurs, distributeurs | ANNONCÉ, incohérent — [Wholesale used smartphones](https://callisto.tech/wholesale-used-smartphones-on-callisto), [Become a seller](https://callisto.tech/blog/expand-your-business-reach-become-a-seller-on-callisto) |
| 4. Couverture | Téléphones, portables, tablettes d'occasion, reconditionnés, retournés, off-lease, retours garantie ; accessoires ; **pas de pièces** ; lots via le grade W | CONFIRMÉ — [For buyers](https://callisto.tech/for-buyers) |
| 5. Prix pro | Prix de gros entre professionnels, à prix fixe ou aux enchères ; pas de grille personnalisée | HYPOTHÈSE (modèle de place de marché) |
| 6. Données | Grades **A, B, Z, C, W (lot mixte), D, Dx**, appuyés sur tests fonctionnels, effacement et contrôle esthétique (technologie Alchemy) ; capacité, quantité, IMEI par lot : inconnus | ANNONCÉ — [Callisto grading](https://callisto.tech/blog/how-grading-works-for-wholesale-smartphones-laptops-and-tablets) |
| 7. API / flux | Aucune API, aucun export, aucun flux trouvé | absence constatée ; À CONFIRMER |
| 8. Documentation | Base de connaissances acheteur ; aucune doc technique | CONFIRMÉ (base de connaissances) |
| 9. Accès | Compte « Under Review » pendant le KYC ; n° d'immatriculation, n° fiscal, **n° de TVA**, adresses, 2FA, documents supplémentaires selon la région | CONFIRMÉ — [How to register](https://callisto.tech/knowledge-centre/en/how-to-register-your-business-on-callisto) |
| 10. Coûts | « No sign-up fees » pour les acheteurs ; commission non publiée ; MOQ variable par lot | CONFIRMÉ pour l'inscription — [For buyers](https://callisto.tech/for-buyers) ; commission À CONFIRMER |
| 11. Logiciel tiers | Aucune mention | À CONFIRMER |
| 12. CGU | Clauses sur l'automatisation non trouvées | À CONFIRMER |
| 13. Commande | Sur la plateforme, avec séquestre | CONFIRMÉ |
| 14. Géographie / devises | Mondial ; devises et TVA sur marge non trouvées | À CONFIRMER |
| 15. Bilan | **+** multi-vendeurs, grades standard, séquestre, inscription gratuite. **−** pas de flux, commission inconnue, aucun avis indépendant trouvé. **Confiance : moyenne** (modèle), faible (intégration) | — |

### B2. gsmExchange et TradeTrust (Dublin)

| Point | Constat | Statut / source |
|---|---|---|
| 1. Nom / site | [gsmexchange.com](https://www.gsmexchange.com/en/about) ; site associé [TradeTrust](https://tradetrust.com/other/watches) | CONFIRMÉ |
| 2. Fonctionnement | « Trading Floor » temps réel : offres WTS, demandes WTB, stock publié « live », moteur de rapprochement sur les spécifications | CONFIRMÉ — [Services](https://www.gsmexchange.com/en/services) |
| 3. Fournisseurs / catégories | Téléphones, tablettes, accessoires ; environ 1 M€ de stock proposé par heure selon une interview ancienne ; nombre de membres actuel non publié | ANNONCÉ, daté — [Mobile News](https://mobilenewscwp.co.uk/features/article/grey-matters-work-for-gsmexchange/) |
| 4. Couverture | Neuf et occasion en téléphones et tablettes ; lots ; ni pièces ni Mac | CONFIRMÉ en partie |
| 5. Prix pro | Offres publiques avec prix unitaires de gros, ex. « Apple iPhone 16 128GB EUR 613… 170pcs » ; **prix demandés, pas transactions** | CONFIRMÉ — [Recent wholesale offers](https://www.gsmexchange.com/en/phones/buy) |
| 6. Données | Grades en texte libre (« A/B », « ASIS », « CPO ») ; EAN non vu ; TradeTrust affiche « ROP Grade A » sans définition | HYPOTHÈSE |
| 7. API / flux | Aucune API ni export trouvé | absence constatée |
| 8. Documentation | Aucune | — |
| 9. Accès | **Deux références de grossistes en téléphonie** + volume d'échange minimum ; appel de validation d'un account manager | CONFIRMÉ — [Terms](https://www.gsmexchange.com/en/terms) |
| 10. Coûts | Adhésion + frais prélevés sur chaque transaction ; aucun montant public ; « gsmX PriceWatch » = rapport payant | CONFIRMÉ sans chiffres — [Terms](https://www.gsmexchange.com/en/terms) |
| 11. Logiciel tiers | Rien | À CONFIRMER |
| 12. CGU | Texte complet non lu ; usage automatisé à faire autoriser par écrit | HYPOTHÈSE |
| 13. Commande | Entre membres ; séquestre annoncé par un site lié, sans certitude pour tradetrust.com | ANNONCÉ — [Trade-Trust service](http://www.tradetrustservice.com/) |
| 14. Géographie / devises | Mondial ; EUR, USD, GBP | CONFIRMÉ |
| 15. Bilan | **+** prix de gros réels visibles, gros volumes ; TradeTrust : ~4,5/5 sur ~29 avis Trustpilot ([Trustpilot](https://ie.trustpilot.com/review/tradetrust.com)). **−** barrière d'entrée quasi infranchissable pour un nouveau micro-revendeur, pas d'API, marché « gris ». **Confiance : moyenne** ; à viser plus tard, avec Foxway comme référence | — |

### B3. Autres réseaux et places de marché téléphonie (fiche groupée)

| Point | GSM-B2B / gsmfeed | Sellify / Giggle Trade | HUBX |
|---|---|---|---|
| 1. Nom / site | [gsm-b2b.com](https://gsm-b2b.com/) (Globo Service GmbH), [gsmfeed](https://gsmfeed.com/) | [sellify.market](https://www.sellify.market/), [giggletrade.com](https://giggletrade.com/) | [hubx.com](https://hubx.com/guest/home) |
| 2. Fonctionnement | Réseau WTS/WTB | Plateforme B2B de négoce de téléphones (« verified traders ») | « Anonymous B2B marketplace » ; HUBX prend la propriété et gère la logistique |
| 3. Fournisseurs / catégories | « 5 000+ membres vérifiés », « 10 000 offres par jour » ; gsmfeed « 157 000+ companies » — ANNONCÉ | Téléphones occasion / reconditionnés gradés — ANNONCÉ | Neuf, reconditionné usine, grade A — ANNONCÉ ([PR Newswire 2019](https://www.prnewswire.com/news-releases/hubx-the-worlds-first-anonymous-b2b-marketplace-platform-surpasses-200-million-in-revenue-in-first-year-hires-industry-veteran-as-chief-revenue-officer-300846615.html)) |
| 4. Couverture | Téléphones, accessoires, consoles | Téléphones | Téléphones neufs et reconditionnés |
| 5. Prix pro | Offres en texte libre | Prix de gros annoncés | Inventaire « changes by the minute » |
| 6. Données | Texte libre | non trouvé | non trouvé |
| 7. API / flux | non trouvé | non trouvé | non trouvé |
| 8. Documentation | aucune | aucune | aucune |
| 9. Accès | Adhésion, prix non publié | non trouvé | non trouvé |
| 10. Coûts | non trouvé | non trouvé | non trouvé |
| 11. Logiciel tiers | À CONFIRMER | À CONFIRMER | À CONFIRMER |
| 12. CGU | non trouvées | non trouvées | non trouvées |
| 13. Commande | Entre membres, sans séquestre trouvé | Sur la plateforme (HYPOTHÈSE) | Via HUBX |
| 14. Géographie | Mondial | UE et au-delà | **Centré États-Unis** |
| 15. Bilan | Pistes manuelles seulement. **Confiance : faible** | À vérifier à la main. **Confiance : faible** | Hors cible UE. **Confiance : faible** |

Autres noms cherchés sans résultat fiable : Kardz, Interdeal, Phonebid, Reebelo B2B, Tradeling ([notes reconditionné](../../research_notes/Plateformes%20externes%20sourcing%20B2B/refurbished_phone_b2b.md), Q8).

---

## C. Grossistes à flux officiel

Point commun : **un seul vendeur**, mais des données structurées et un flux officiel ou proposé. Ils se branchent sur MON STOCK sans casser la règle « un fournisseur par source ».

### C1. Foxway (Reseller Store, Wholesale, enchères)

| Point | Constat | Statut / source |
|---|---|---|
| 1. Nom / site | Foxway (ex-Xllnc AB, détenu par Nordic Capital et Norvestor) ; [resellers.foxway.com](https://resellers.foxway.com/), [wholesale.foxway.com](https://wholesale.foxway.com/faqs), [auction.foxway.shop](https://auction.foxway.shop/) | ANNONCÉ (tiers) — [PitchBook](https://pitchbook.com/profiles/company/338513-32) |
| 2. Fonctionnement | Boutique revendeurs avec stock temps réel ; plateforme de lots « take-all » (on achète la feuille entière au prix moyen annoncé) ; enchères chaque semaine, du mardi au jeudi | CONFIRMÉ — [Wholesale FAQ](https://wholesale.foxway.com/faqs), [Live auctions](https://resellers.foxway.com/knowledge/live-auctions/) |
| 3. Fournisseurs / catégories | Un seul vendeur, plus de 1,5 M d'appareils par an ; smartphones, tablettes, montres, portables ; « plus de 1 000 revendeurs B2B » selon une page, environ 800 selon une autre | CONFIRMÉ (catégories), ANNONCÉ (volumes) — [Reseller Store](https://resellers.foxway.com/), [Why Foxway?](https://resellers.foxway.com/why-foxway/) |
| 4. Couverture | iPhone neufs, retours 14 jours, occasion, reconditionnés, à reconditionner ; portables ; **pas de pièces** ; lots via « take-all » et enchères | CONFIRMÉ — [Used mobile phones](https://resellers.foxway.com/used-mobile-phones/), [Used computers](https://resellers.foxway.com/used-computers-and-laptops/) |
| 5. Prix pro | Prix revendeur après ouverture du compte, **hors TVA et Ex Works** ; prix personnalisés par compte : inconnu | CONFIRMÉ (HT / EXW) — [Sales terms](https://wholesale.foxway.com/sales-terms) ; personnalisation HYPOTHÈSE |
| 6. Données | Chaque appareil testé et gradé individuellement, guide de grades ; feuille Excel sans grade ≈ 80 % A/B et 20 % C ; quantité minimale « souvent 50 unités » sur certaines références. L'annuaire interne relève 7 grades visuels (Brand New, Swap, A+, A, B, C+, C). IMEI, santé batterie, capacité, EAN par ligne : inconnus | CONFIRMÉ — [Wholesale FAQ](https://wholesale.foxway.com/faqs) ; grades détaillés ANNONCÉ ([annuaire](supplier-directory.csv)) ; champs par ligne À CONFIRMER |
| 7. API / flux | Listes de stock en Excel ; invite « Need a customized API? » sur le site ; un éditeur Magento affirme que Foxway fournit API, JSON/XML ou FTP/SFTP | CONFIRMÉ (Excel, existence de l'offre d'API) — [Why Foxway?](https://resellers.foxway.com/why-foxway/) ; formats ANNONCÉ (tiers) — [AALOGICS](https://www.aalogics.com/magento-2-product-import-guide-integrating-foxway-magento-2-using-aalogics-supplier-feed-extension) |
| 8. Documentation | Aucune doc d'API publique | absence constatée ; À CONFIRMER |
| 9. Accès | Personnes morales seulement ; registre, adresse, n° de TVA (24 % de TVA appliqués sans n° de TVA) ; account manager qui valide | ANNONCÉ ([annuaire](supplier-directory.csv)) ; critères À CONFIRMER |
| 10. Coûts | Commande minimale **≈ 2 000 €** (pages portables et téléphones, à vérifier par catégorie) ; frais bancaires à la charge de l'acheteur ; port ajouté aux lots d'enchères ; aucun abonnement trouvé | CONFIRMÉ — [Used computers](https://resellers.foxway.com/used-computers-and-laptops/), [Payment details](https://foxway.zendesk.com/hc/en-us/articles/22467865758865-Payment-details) |
| 11. Logiciel tiers | API « personnalisée » proposée : usage logiciel prévu | HYPOTHÈSE ; droit de stocker / afficher dans MON STOCK À CONFIRMER |
| 12. CGU | Stockage, fréquence, redistribution non trouvés | À CONFIRMER |
| 13. Commande | Directement chez Foxway (portail, lots, enchères) | CONFIRMÉ |
| 14. Géographie / devises | Europe ; paiement GBP, EUR ou USD ; enchères en **autoliquidation de TVA** ; l'annuaire interne relève « prices ex-VAT unless marked 'VAT Margin' », ce qui suggère des lignes sous TVA sur marge | CONFIRMÉ — [Payment details](https://foxway.zendesk.com/hc/en-us/articles/22467865758865-Payment-details), [auction.foxway.shop](https://auction.foxway.shop/) ; TVA sur marge ANNONCÉ, À CONFIRMER |
| 15. Bilan | **+** catégories cœur, grades structurés, prix HT connus, garantie 90 jours y compris esthétique, taux de retour annoncé sous 2 % ([Why Foxway?](https://resellers.foxway.com/why-foxway/)). **−** un seul vendeur, MOQ élevé pour un micro-revendeur, lots « take-all » à grades mélangés. **Confiance : moyenne-haute** (fonctionnement), faible (API) | — |

### C2. ThePhoneHub (Belgique)

| Point | Constat | Statut / source |
|---|---|---|
| 1. Nom / site | [thephonehub.eu](https://www.thephonehub.eu/) | CONFIRMÉ |
| 2. Fonctionnement | Grossiste unique ; prix via l'équipe commerciale (hello@thephonehub.eu), qui fournit prix de gros, CSV, API ou dropshipping | ANNONCÉ — [annuaire](supplier-directory.csv) |
| 3. Fournisseurs / catégories | 1 ; smartphones, montres, accessoires, gaming ; Apple, Samsung, Xiaomi, Google Pixel, Sony PlayStation ; « 300+ business customers » | ANNONCÉ |
| 4. Couverture | **Neuf** ; reconditionné / gradé non confirmé | ANNONCÉ ; À CONFIRMER |
| 5. Prix pro | Prix unitaires dans le flux | ANNONCÉ |
| 6. Données | « CSV Live Link » : stock temps réel, prix unitaires, MOQ ; colonnes exactes inconnues | ANNONCÉ ; À CONFIRMER |
| 7. API / flux | CSV Live Link ; API mentionnée sur la page contact | ANNONCÉ — [contact](https://www.thephonehub.eu/contact) |
| 8. Documentation | Non publique | À CONFIRMER |
| 9. Accès | Via contact commercial | À CONFIRMER |
| 10. Coûts | Non trouvés | À CONFIRMER |
| 11. Logiciel tiers | Non précisé | À CONFIRMER |
| 12. CGU | Non trouvées | À CONFIRMER |
| 13. Commande | Directe | HYPOTHÈSE |
| 14. Géographie / devises | UE (15+ pays annoncés), DHL/UPS, « EU VAT ready » | ANNONCÉ |
| 15. Bilan | **+** flux CSV branchable sans code (voie « flux distant »). **−** neuf seulement, rien de vérifié. **Confiance : faible-moyenne** | — |

### C3. Ingram Micro (Xvantage / XI Reseller API)

| Point | Constat | Statut / source |
|---|---|---|
| 1. Nom / site | [developer.ingrammicro.com](https://developer.ingrammicro.com/) | CONFIRMÉ |
| 2. Fonctionnement | Distributeur unique ; API catalogue, prix, remises, stock, commandes, factures, notifications | CONFIRMÉ |
| 3. Fournisseurs / catégories | 1 ; IT neuf broadline | CONFIRMÉ |
| 4. Couverture | Neuf ; Apple selon l'agrément Apple du revendeur ; ni reconditionné ni pièces trouvés | HYPOTHÈSE |
| 5. Prix pro | **Prix et disponibilité liés à votre numéro de compte** | CONFIRMÉ — [Getting Started](https://developer.ingrammicro.com/reseller/getting-started) |
| 6. Données | Stock par entrepôt, temps réel | CONFIRMÉ |
| 7. API / flux | REST, **JSON seulement**, OAuth ; `/resellers/v6/` ; en-tête `IM-CountryCode` obligatoire ; webhooks de statut ; v5 → v6 change les formats | CONFIRMÉ — [FAQ](https://developer.ingrammicro.com/reseller/faq) |
| 8. Documentation | OpenAPI et SDK officiels (C#, Java, Node, Python, Go) ; serveur MCP annoncé en août 2026 | CONFIRMÉ — [GitHub](https://github.com/ingrammicro-xvantage/xi-sdk-openapispec) ; MCP ANNONCÉ |
| 9. Accès | Compte Ingram actif et en règle ; un compte développeur par partenaire ; approbation ≈ 2 jours ouvrés | CONFIRMÉ — [Getting Started](https://developer.ingrammicro.com/reseller/getting-started) |
| 10. Coûts | Aucun tarif d'API public (probablement gratuit pour les clients) | HYPOTHÈSE ; À CONFIRMER |
| 11. Logiciel tiers | Oui (Zomentum, QuoteWerks…) | CONFIRMÉ |
| 12. CGU | Conditions d'usage, quotas | À CONFIRMER |
| 13. Commande | Directe via l'API | CONFIRMÉ |
| 14. Géographie / devises | France ouverte en v6 (Products Search/Details, Quotes) | CONFIRMÉ — [APIs Update](https://developer.ingrammicro.com/reseller/new) |
| 15. Bilan | **+** meilleure qualité technique ; **l'adaptateur existe déjà dans MON STOCK** ([ingram-micro](../../src/integrations/sourcing/ingram-micro/index.ts)). **−** un seul distributeur, compte requis, conditions d'ouverture France non publiques. **Confiance : haute** (technique) | — |

### C4. Autres distributeurs et grossistes uniques (fiche groupée)

| Point | TD SYNNEX | ALSO | Exertis France / WE.CONNECT | Esprinet / V-Valley | Komsa | iOutlet Business / Mobile Depot |
|---|---|---|---|---|---|---|
| 1. Site | [Digital Bridge EU](https://developer.api.tdsynnex.com/eu) | [also.com](https://also.com/ec/cms5/en_5710/5710/services/digital-services/also-cloud-marketplace/index.jsp) | [WE.CONNECT](https://www.businesswire.com/news/home/20250901110121/fr) | [esprinet.com](https://esprinet.com/en/v-valley/) | (presse) | [business.theioutlet.com](https://business.theioutlet.com/), [mobiledepot.eu](https://www.mobiledepot.eu/) |
| 2. Fonctionnement | Catalogue API (produit, prix, dispo) + commandes | API publiques = cloud seulement | Rachat par WE.CONNECT (sept. 2025), nouveau nom prévu | E-commerce + télévente | Reconditionne/répare > 1 M appareils/an | Grossistes uniques reconditionné |
| 3. Catégories | IT neuf | IT neuf | IT, connectique | ~130 000 produits, 650+ fabricants | Télécoms | Téléphones reconditionnés |
| 4. Couverture | Neuf | Neuf | Neuf | Neuf | Reconditionné (intérêt) | Reconditionné gradé |
| 5. Prix pro | Compte revendeur | Compte | Compte | Compte | non trouvé | iOutlet : feuilles de prix quotidiennes ; Mobile Depot : prix unitaires affichés |
| 6. Données | Prix/dispo | non trouvé | Flux via clé API (côté UK, Zigaflow) | non trouvé | non trouvé | iOutlet : grade A ≥ 85 % batterie, B ≥ 80 % |
| 7. API / flux | Oui (approbation du représentant) | Matériel : non trouvé | Pas d'API revendeur publique | non trouvé | non trouvé | non trouvé |
| 8. Doc | Procédures publiques surtout US | — | — | — | — | — |
| 9. Accès | Compte TD SYNNEX France | Compte | Compte | « Become customer » | À CONFIRMER | Compte |
| 10. Coûts | non trouvé | non trouvé | non trouvé | non trouvé | non trouvé | non trouvé |
| 11. Logiciel tiers | Oui (D-Tools, CloudRadial) | — | Oui (Zigaflow) | — | — | — |
| 12. CGU | À CONFIRMER | À CONFIRMER | À CONFIRMER | À CONFIRMER | À CONFIRMER | À CONFIRMER |
| 13. Commande | Directe | Directe | Directe | Directe | — | Directe ; Mobile Depot : listes par e-mail |
| 14. Géographie | France (SIREN 722065638) | France via SITC | France | Italie, Espagne, Portugal | Allemagne | UK / UE |
| 15. Bilan | Même logique qu'Ingram. **Moyenne** | **Faible** | **Faible** | Peu présent en France. **Faible** | Pas de donnée d'intégration. **Faible** | Un adaptateur par fournisseur. **Faible-moyenne** |

Sources : [notes IT](../../research_notes/Plateformes%20externes%20sourcing%20B2B/it_distribution_aggregators.md), [notes reconditionné](../../research_notes/Plateformes%20externes%20sourcing%20B2B/refurbished_phone_b2b.md), [notes déstockage](../../research_notes/Plateformes%20externes%20sourcing%20B2B/wholesale_liquidation_and_feed_aggregators.md).

---

## D. Pièces détachées et logiciels de réparation

Point commun : **aucun grossiste européen de pièces n'a publié de documentation d'API**. Les connexions qui existent sont bilatérales, négociées entre un fournisseur et un éditeur de logiciel.

### D1. Foneday (Tilburg, NL)

| Point | Constat | Statut / source |
|---|---|---|
| 1. Nom / site | [foneday.shop](https://foneday.shop/about/about-us) ; fondé en 2015, plus de 14 pays (interview) | CONFIRMÉ (site) ; historique ANNONCÉ |
| 2. Fonctionnement | Grossiste pièces smartphone et tablette ; logiciel maison **Repender** : panier Foneday, prix de réparation qui suivent le coût Foneday, ajustés chaque jour | ANNONCÉ — [Repender](https://repender.nl/en/integrations), [blog Foneday](https://foneday.shop/blog/repender-platform-for-repair-professionals) |
| 3. Fournisseurs / catégories | 1 ; plus de 15 000 références | CONFIRMÉ (extrait) |
| 4. Couverture | Pièces Apple et autres, accessoires, quelques appareils reconditionnés | CONFIRMÉ — [For Apple](https://foneday.shop/assortment/brands/for-apple), [RepairPlugin suppliers](https://repairplugin.com/suppliers) |
| 5. Prix pro | L'API renvoie le **prix d'achat** du compte | CONFIRMÉ en pratique (outil tiers) — [Foneday Prijscalculator](https://chromewebstore.google.com/detail/foneday-prijscalculator/andbakcpndhnkaccilaapgghdmcladci) |
| 6. Données | Stock, marque, codes modèle, prix par SKU ; EAN et qualité (OLED, Incell…) inconnus ; prix par paliers non publics | CONFIRMÉ en pratique ; EAN/qualité/paliers À CONFIRMER |
| 7. API / flux | **API par clé client**, non documentée ; l'outil tiers demande « votre » clé | CONFIRMÉ en pratique ; endpoints À CONFIRMER |
| 8. Documentation | Aucune publique | absence constatée |
| 9. Accès | TVA, KvK/Kbis, minimum d'achat : non trouvés | À CONFIRMER |
| 10. Coûts | Port vers la France « + €6.50 Free From €150.00 » (extrait fragmentaire) | ANNONCÉ — [Shipping](https://foneday.shop/support/shipping) ; À CONFIRMER |
| 11. Logiciel tiers | Oui en pratique (Repender, RepairPlugin, extension Chrome) ; pour MON STOCK : inconnu | CONFIRMÉ en pratique ; À CONFIRMER |
| 12. CGU | Non trouvées (droits de stockage, fréquence, limites de débit) | À CONFIRMER |
| 13. Commande | Directe (panier Foneday) | CONFIRMÉ |
| 14. Géographie / devises | Europe dont France ; EUR ; PostNL / UPS / DHL | CONFIRMÉ (extrait) |
| 15. Bilan | **Meilleure piste API pour les pièces.** **−** aucune doc, conditions inconnues. Note : le site n'a pas de plan du site exploitable ([RAPPORT-SOURCING](RAPPORT-SOURCING.md) §4), la clé API est donc la seule voie propre. **Confiance : moyenne** | — |

### D2. MobileSentrix Europe (NL)

| Point | Constat | Statut / source |
|---|---|---|
| 1. Nom / site | [mobilesentrix.eu](https://www.mobilesentrix.eu/) | CONFIRMÉ |
| 2. Fonctionnement | Grossiste B2B ; prix visibles seulement après approbation du compte (« contact us to get your account approved to see price! ») | CONFIRMÉ — [création de compte](https://www.mobilesentrix.eu/customer/account/retail/) |
| 3. Fournisseurs / catégories | 1 ; pièces | CONFIRMÉ |
| 4. Couverture | Pièces Apple | CONFIRMÉ |
| 5. Prix pro | Oui, après approbation ; HT ; n° de TVA → exonération | CONFIRMÉ — [FAQ EU](https://www.mobilesentrix.eu/frequently-asked-questions) |
| 6. Données | « details, pricing, and stock » via ScanPro (RepairDesk) | ANNONCÉ — [RepairDesk updates](https://feedback.repairdesk.co/updates) |
| 7. API / flux | **API confirmée mais réservée aux partenaires** : « We are partnered with RepairDesk and MyRepairApp to manage all our API-related processes » | CONFIRMÉ — [FAQ](https://www.mobilesentrix.com/frequently-asked-questions) |
| 8. Documentation | Aucune publique (le dépôt GitHub trouvé est un service interne d'images) | CONFIRMÉ — [GitHub](https://github.com/Mobilesentrix/ms-product-upload-backend) |
| 9. Accès | Documents d'entreprise ; n° de TVA | CONFIRMÉ |
| 10. Coûts | Port France non trouvé | À CONFIRMER |
| 11. Logiciel tiers | Partenaires seulement ; MON STOCK devrait demander un partenariat | HYPOTHÈSE |
| 12. CGU | Non trouvées | À CONFIRMER |
| 13. Commande | Directe ; panier envoyé depuis RepairDesk | CONFIRMÉ (RepairDesk) |
| 14. Géographie / devises | NL, FR, DE, IT, toute l'Europe ; Chronopost, DHL ; EUR | CONFIRMÉ |
| 15. Bilan | MON STOCK la lit déjà en public (**14 offres**, [RAPPORT-SOURCING](RAPPORT-SOURCING.md)). Contradiction : OrderSync couvre l'UE selon une mise à jour d'août 2026, seulement US/CA/UK selon un article d'aide. **Confiance : moyenne** | — |

### D3. RepairPlugin (NL, logiciel)

| Point | Constat | Statut / source |
|---|---|---|
| 1. Nom / site | [repairplugin.com](https://repairplugin.com/suppliers) | CONFIRMÉ |
| 2. Fonctionnement | Plugin WordPress qui synchronise prix, pièces et stocks de grossistes **toutes les 60 minutes** pour fixer les prix de réparation d'un site ; règles moins cher / plus cher / moyenne + marge, plafonds min/max | CONFIRMÉ — [Dynamic Pricing](https://help.repairplugin.com/docs/pricing-and-discounts/dynamic-pricing) |
| 3. Fournisseurs / catégories | « 10+ » grossistes : MobileSentrix (EU/USA/UK/CA), Mobileparts.shop, Foneday, Euro Mobile Company, 4Phones, Fixje, MobileAdds ; 1 891 modèles et 114 413 pièces, ou 1 887 et 112 530 selon la page | ANNONCÉ, légère contradiction |
| 4. Couverture | Pièces seulement | CONFIRMÉ |
| 5. Prix pro | Oui, pour son propre client ; **pas redistribués** | CONFIRMÉ (usage) ; redistribution HYPOTHÈSE |
| 6. Données | Prix et stock fournisseur | CONFIRMÉ |
| 7. API / flux | **Aucune API sortante trouvée** ; méthode de connexion aux grossistes non documentée | absence constatée |
| 8. Documentation | Doc utilisateur seulement | CONFIRMÉ |
| 9. Accès | Abonnement ; essai 30 jours pour 1 € | CONFIRMÉ — [Pricing](https://repairplugin.com/pricing) |
| 10. Coûts | 24 / 49 / 79 €/mois en annuel, ou 29 / 55 / 95 €/mois HT en semestriel ; Dynamic Pricing seulement en Growth et Scale | CONFIRMÉ, contradictoire — [Pricing](https://repairplugin.com/pricing), [Plans](https://help.repairplugin.com/docs/about-repairplugin/plans-and-pricing) |
| 11. Logiciel tiers | Non prévu (consommateur de flux, pas fournisseur) | HYPOTHÈSE |
| 12. CGU | Redistribution non évoquée | À CONFIRMER |
| 13. Commande | Chez chaque grossiste | CONFIRMÉ |
| 14. Géographie / devises | UE ; EUR | CONFIRMÉ |
| 15. Bilan | **Interlocuteur, pas source** : il sait comment Foneday, MobileSentrix EU et Mobileparts.shop exposent leurs données. **Confiance : moyenne-haute** (fonctionnement) | — |

### D4. 2Service / Mobileparts.shop (NL)

| Point | Constat | Statut / source |
|---|---|---|
| 1. Nom / site | [2service.nl](https://2service.nl/), [mobileparts.shop](https://2service.nl/mobileparts-shop/) | CONFIRMÉ |
| 2. Fonctionnement | Boutique B2B de 2Service, **partenaire officiel Samsung** pour la distribution des pièces | CONFIRMÉ |
| 3. Fournisseurs / catégories | 1 ; Samsung Service Packs (100 % origine) ; « 500+ ateliers NL, 5 000 en Europe » | CONFIRMÉ ; volumes ANNONCÉ |
| 4. Couverture | Pièces **Samsung** d'origine ; pas Apple | CONFIRMÉ |
| 5. Prix pro | Compte B2B requis ; offres sur mesure en volume | CONFIRMÉ |
| 6. Données | Format de la liste de stock inconnu | À CONFIRMER |
| 7. API / flux | **Liste de stock grossiste par e-mail** (sales@2service.nl) ; aucune API publique ; branché sur RepairPlugin | CONFIRMÉ |
| 8. Documentation | Aucune | — |
| 9. Accès | Dealer login pour petites commandes | CONFIRMÉ |
| 10. Coûts | Non trouvés | À CONFIRMER |
| 11. Logiciel tiers | Oui en pratique (RepairPlugin) | ANNONCÉ |
| 12. CGU | Non trouvées | À CONFIRMER |
| 13. Commande | Directe | CONFIRMÉ |
| 14. Géographie / devises | Europe ; EUR | ANNONCÉ |
| 15. Bilan | Source la plus « officielle » pour Samsung d'origine ; voie « import de fichier ». **Confiance : moyenne** | — |

### D5. Logiciels de réparation et canaux constructeurs (fiche groupée)

| Point | RepairDesk / MyRepairApp | Repender (Foneday) | Fixably / RepairQ | Apple IRP / GSX, Self Service Repair | Samsung GSPN / Self-Repair |
|---|---|---|---|---|---|
| 1. Site | [RepairDesk](https://help.repairdesk.co/portal/en/kb/integrations/vendor-integrations), [MyRepairApp](https://www.myrepairapp.com/) | [repender.nl](https://repender.nl/en/integrations) | [Fixably](https://www.fixably.com/features/gsx-integration) | [Apple Newsroom 2021](https://www.apple.com/newsroom/2021/03/apples-independent-repair-provider-program-expands-globally/) | [Samsung Mobile Press](https://www.samsungmobilepress.com/articles/samsung-electronics-expands-the-self-repair-program-to-europe) |
| 2. Fonctionnement | Catalogue, coût et stock fournisseur dans les bons de commande, panier, OrderSync | CRM/POS avec panier Foneday | GSX/GSPN intégrés, bons de commande | Portails transactionnels pour réparateurs agréés | Distributeurs agréés (ASWO, 2Service) |
| 3. Fournisseurs | Surtout US (MobileSentrix, Injured Gadgets, PLP, WGP…) + MobileSentrix EU | Foneday seul | Apple, Samsung | Apple | Samsung |
| 4. Couverture | Pièces | Pièces | Pièces d'origine | Pièces Apple d'origine | Pièces Samsung |
| 5. Prix pro | Pour le client du logiciel | Coût Foneday | Prix constructeur | Mêmes prix que les AASP | Prix distributeur |
| 6. Données | Prix, stock | Prix | Liste de pièces par appareil | — | — |
| 7. API sortante | Aucune trouvée | Aucune | Aucune | Aucun flux de prix ouvert trouvé | Aucun |
| 8. Doc | Utilisateur | Utilisateur | Utilisateur | — | — |
| 9. Accès | Abonnement | Abonnement (Basic) | Abonnement | IRP gratuit **avec technicien certifié** | Agrément |
| 10. Coûts | RepairDesk dès 99 $/mois/boutique ([Capterra](https://www.capterra.com/p/146659/RepairDesk/)) | Non chiffré | non trouvé | IRP « no cost to join » ; location du kit Self Service 59,95 € / 7 j | non trouvé |
| 11–12. Tiers / CGU | Redistribution non évoquée | — | — | — | — |
| 13. Commande | Chez le fournisseur | Foneday | GSX | GSX | Distributeur |
| 14. Géographie | US surtout | NL / UE | UE / US | France incluse (Self Service depuis déc. 2022) | Europe dont France |
| 15. Bilan | Pas de source. **Moyenne** | Preuve que l'API Foneday existe. **Moyenne** | Pas de catalogue exploitable. **Moyenne** | Pas de catalogue exploitable. **Moyenne** | Idem. **Faible** |

Sources : [notes pièces](../../research_notes/Plateformes%20externes%20sourcing%20B2B/spare_parts_and_repair_software.md). Utopya (FR) est exclu : voir [H](#h-exclus).

---

## E. Lots, palettes, déstockage

### E1. Merkandi (Pologne, annuaire de lots)

| Point | Constat | Statut / source |
|---|---|---|
| 1. Nom / site | [merkandi.com](https://merkandi.com/register) | CONFIRMÉ |
| 2. Fonctionnement | Annonces de vendeurs ; les acheteurs les contactent directement ; la « demande de commande » n'est « pas un achat automatique » ; Merkandi « ne porte aucune responsabilité » sur les transactions | CONFIRMÉ — [FAQ](https://merkandi.us/faq), [Terms](https://merkandi.us/conditions) |
| 3. Fournisseurs / catégories | Nombre de vendeurs non trouvé ; lots, retours, palettes, téléphones | absence de chiffre |
| 4. Couverture | iPhone d'occasion et reconditionnés gradés A/B, lots multimarques, stock UE sous **TVA sur marge**, lots endommagés | CONFIRMÉ (annonces existantes) — [smartphones](https://merkandi.com/categories/smartphones-mobile-phones/87), [refurbished phones](https://merkandi.com/ware/refurbished/phones-mobile-phones) |
| 5. Prix pro | Prix et quantités « négociés directement avec le fournisseur », souvent sur demande | CONFIRMÉ |
| 6. Données | Grades A/B/C par annonce, qualité variable selon le vendeur | CONFIRMÉ / HYPOTHÈSE |
| 7. API / flux | Seulement un import XML **côté vendeur** ; aucune API acheteur | CONFIRMÉ (tiers) — [AdTribes](https://adtribes.io/knowledge-base/how-to-set-up-a-merkandi-product-feed/) |
| 8. Documentation | Aucune pour les acheteurs | — |
| 9. Accès | Abonnement payant pour voir les coordonnées ; pas de compte d'essai acheteur | CONFIRMÉ — [register](https://merkandi.com/register) |
| 10. Coûts | Incohérents selon le domaine : 239 € ou 279 €/an (remisés à 191,20 € et 223,20 €) ; 329, 549 ou 869 € HT/an (page packages) ; GBP 209 / 249 HT (UK) ; 100 à 200 USD/an (.us) | CONFIRMÉ mais incohérent — [packages](https://merkandi.com/packages), [US](https://merkandi.us/welcome) |
| 11. Logiciel tiers | Rien | À CONFIRMER |
| 12. CGU | Aucune clause anti-automatisation trouvée, mais aucune autorisation non plus | À CONFIRMER par écrit |
| 13. Commande | Directement chez chaque vendeur, sans séquestre trouvé | CONFIRMÉ |
| 14. Géographie / devises | UE ; EUR (.com), USD (.us) | CONFIRMÉ |
| 15. Bilan | **+** coût faible, stock sous TVA sur marge, lots. **−** pas de prix lisibles par machine, risque de fraude porté par l'acheteur. **Confiance : moyenne-faible** | — |

### E2. Lots de retours : Jobalots et palettes françaises (fiche groupée)

| Point | Jobalots (UK/UE, JLI Trading) | Easy Destocks et vendeurs FR de palettes |
|---|---|---|
| 1. Site | [jobalots.com](https://jobalots.com/en) | [easydestock.com](https://easydestock.com/a-propos), [wholesaleclearancepallets.fr](https://wholesaleclearancepallets.fr/product/amazon-warehouse-clearance-pallets-france/), [grossiste-destockage-lots.fr](https://www.grossiste-destockage-lots.fr/lots-grossiste/palette-retours-amazon-electronique-destockage-high-tech-pour-professionnels/) |
| 2. Fonctionnement | Enchères de retours et liquidations ; manifeste par lot ; retours **non testés** | Palettes par catégorie avec valeur de revente estimée |
| 3. Catégories | Électronique en catégorie principale | High-tech : 200–250 articles par palette (tablettes, casques, montres, accessoires) |
| 4. Couverture | Lots | Lots ; pas d'iPhone gradé |
| 5. Prix | Enchère | Easy Destocks dès 350 € ; un guide cite 200–800 € par palette ([Margeo](https://margeoapp.com/blog/sourcing-palettes-amazon-retours)) |
| 6. Données | Manifeste sans état ; plaintes d'articles manquants ([Trustpilot](https://www.trustpilot.com/review/jobalots.com)) | **Pas de manifeste détaillé** ; certains vendent par camion entier, non testé |
| 7. API / flux | Aucune | Aucune |
| 8–12. Doc, accès, coûts, tiers, CGU | Non trouvés | Non trouvés |
| 13. Commande | Sur la plateforme | Directe |
| 14. Géographie | UK / UE (entrepôts : informations incohérentes) | France |
| 15. Bilan | Valorisation automatique impossible. **Faible** | Idem ; risque d'arnaque signalé. **Faible** |

B-Stock (dont les liquidations Amazon UE) et Liquidity Services sont exclus : leurs CGU interdisent l'automatisation (voir [H](#h-exclus)).

---

## F. Dropshipping et agrégateurs de flux

Point commun : prix de dropshipping (vente au détail moins une remise), **ni reconditionné gradé ni pièces Apple**. Les logiciels d'intégration (Flxpoint, Inventory Source) n'apportent aucun fournisseur : on y branche ses propres comptes.

| Point | BigBuy (ES) | Syncee (HU) | Flxpoint (US) | Brandsdistribution (IT) | VidaXL (NL) | Spocket / Wholesale2B | Ankorstore (FR) |
|---|---|---|---|---|---|---|---|
| 1. Site | [BigBuy](https://www.bigbuy.eu/en/wholesaler-packs.html) | [syncee.com](https://syncee.com/faq) | [flxpoint.com](https://flxpoint.com/pricing) | [developers](https://www.brandsdistribution.com/en/cms/developers) | [guide PDF](https://www.dropshippingxl.com/on/demandware.static/-/Library-Sites-vidaXLSharedLibrary/default/B2B_documents/seller_guide/EN.pdf) | [Spocket](https://dodropshipping.com/spocket-review/) | [ECOSIRE](https://ecosire.com/fr/products/ankorstore-store-management) |
| 2. Fonctionnement | Grossiste unique + API | Place de marché de fournisseurs | Logiciel : vos comptes fournisseurs | Dropshipping | Dropshipping | Dropshipping | Marketplace de marques |
| 3. Catégories | « +400 000 références » (électronique, maison, jouets) — CONFIRMÉ | « 12 000+ fournisseurs, 6 M+ produits » — ANNONCÉ | — | Mode | Maison, jardin | Généraliste | Pas d'électronique prouvée |
| 4. Couverture Snowolff | Électronique générique ; Apple en stock : inconnu | Faible | Sans objet | Aucune | Aucune | Faible | Aucune |
| 5. Prix | Prix grossiste BigBuy | Prix dropship | — | Dropship | Dropship | Dropship | — |
| 6. Données | Produits, taxonomies, attributs, stock — CONFIRMÉ | — | — | — | Prix 0,00 = retiré ; stock 0 = reviendra | — | — |
| 7. API / flux | API Bearer, sandbox — CONFIRMÉ ([PDF](https://www.bigbuy.eu/public/doc/Guia_API_BigBuy_EN.pdf)) | API sur demande au support ; DataFeed Manager limité à Shopify et autres — CONFIRMÉ | API v1 : 500 enregistrements / requête, 2 Mo — CONFIRMÉ | Fichiers toutes les 15 min (complet) / 4 min (incrément) — CONFIRMÉ | CSV/XML par pays — CONFIRMÉ (daté) | Wholesale2B : CSV/XML/API — ANNONCÉ | API côté **marque** |
| 8. Doc | `api.bigbuy.eu/rest/doc` | Centre d'aide | [Apiary](https://flxpoint.docs.apiary.io/) | Page développeurs | PDF | — | — |
| 9. Accès | Clé via formulaire | Abonnement | Abonnement | Dropshippers authentifiés | Compte | Abonnement | — |
| 10. Coûts | Tiers, contradictoires : 69 à 99 €/mois + 90 € d'inscription — ANNONCÉ | Free à ~299 $/mois, contradictoire — ANNONCÉ | 699 $/mois (annuel) à 799 $/mois — CONFIRMÉ | 49 ou 99 €/mois — CONFIRMÉ | ~30 €/mois (ancienne FAQ) | 39,99 à 99,99 $/mois ; Wholesale2B 99,99 $/mois + 3 % | Commande initiale 300 € (2020) |
| 11–12. Tiers / CGU | Limites de débit non publiées | Stockage, fréquence : À CONFIRMER | — | — | — | — | — |
| 13. Commande | API | Plateforme | Vers vos fournisseurs | Plateforme | API | Plateforme | — |
| 14. Géographie | UE | US, UE, UK, AU | US | UE | UE | US/UE ; Wholesale2B US/CA | FR/UE |
| 15. Bilan | **Déjà un adaptateur MON STOCK** ([bigbuy](../../src/integrations/sourcing/bigbuy/index.ts)) ; mono-fournisseur. **Moyenne-haute** | **Faible** | Redondant avec la couche d'adaptateurs. **Haute** (sur le prix) | Hors catégorie | Hors catégorie | Hors catégorie, US | Hors catégorie |

Sources : [notes déstockage et flux](../../research_notes/Plateformes%20externes%20sourcing%20B2B/wholesale_liquidation_and_feed_aggregators.md), Q3.

---

## G. Données de marché et veille tarifaire

**Aucun de ces outils ne fournit de prix d'achat.** Ils servent uniquement le côté revente (prix de marché, prix de revente estimé dans l'[analyse bonnes affaires](analyse-bonnes-affaires.md)).

| Point | eBay Browse (actuel) | eBay Marketplace Insights / Product Research | Keepa (Amazon) | Back Market / Refurbed Seller API | Prisync / Price2Spy (veille) | Google Merchant API (benchmark) | Open Icecat / bases EAN |
|---|---|---|---|---|---|---|---|
| 1. Site | [developer.ebay.com](https://developer.ebay.com/api-docs/buy/static/ref-marketplace-supported.html) | idem ; Seller Hub | [keepa.com/api-docs](https://keepa.com/api-docs/) | [api.backmarket.dev](https://api.backmarket.dev/), [refurbed (Notion)](https://refurbed.notion.site/refurbed-API-7be4e188412d4ea2bd35ef339dab9e3e) | [Capterra Prisync](https://www.capterra.com/p/153451/Prisync/pricing/), [Price2Spy FAQ](https://price2spy.com/?p=13117) | [Merchant API](https://developers.google.com/merchant/api/guides/reports/understand-the-market) | [Icecat FAQ](https://iceclog.com/faq-for-merchants/) |
| 2. Fonctionnement | Annonces **actives** | Articles **vendus** (90 j API ; 3 ans dans Product Research) | Historique des prix Amazon, jetons/minute | API vendeur ; Backbox = prix à battre sur **ses** listings | Veille d'URL suivies (scraping pour le client) | Prix moyen pondéré par clics, par GTIN, **sur ses propres produits** | Fiches produit, EAN → specs |
| 3–4. Couverture | Revente FR | Revente | Amazon.fr/.de, neuf / occasion / Renewed | Reconditionné FR | Selon URL | Neuf surtout | IT, électronique |
| 5. Prix d'achat | **Non** | **Non** | **Non** | **Non** | **Non** | **Non** | **Non** |
| 6. Données | Condition eBay, pas de grade standard | Idem | ASIN | Grade Back Market | Selon URL | GTIN | EAN, MPN, specs |
| 7. API | Oui (déjà intégrée) | **« restricted and not open to new users »** — CONFIRMÉ ; Product Research : pas d'API | Oui | Oui (vendeurs) | Plans hauts seulement | Oui | Oui |
| 8. Doc | Officielle | Officielle | Officielle | Officielle | — | Officielle | Officielle |
| 9. Accès | Clés serveur | Fermé (API) ; Seller Hub (manuel) | Abonnement | Statut vendeur | Abonnement | Merchant Center | Inscription gratuite (Open) |
| 10. Coûts | Gratuit | Product Research gratuit | Dès ~49 €/mois (tiers, contradictoire) — ANNONCÉ | — | Prisync dès 99 $/mois ; Price2Spy dès 39,95 $/mois — ANNONCÉ | Gratuit | Open gratuit ; Full payant |
| 11–12. Tiers / CGU | Licence : copies « as necessary », pas de mélange affiché avec du non-eBay (version 2017) — CONFIRMÉ ([licence](https://developer.ebay.com/products/license)) | — | Redistribution : non trouvée | Données du compte de l'utilisateur | Redistribution À CONFIRMER | Ses données | Licence ouverte, à relire |
| 13. Commande | — | — | — | — | — | — | — |
| 14. Géographie | FR | FR | FR/DE | FR/UE | Selon URL | Pays du compte | UE |
| 15. Bilan | **Prix affichés**, à garder. **Haute** | Le prix de marché MON STOCK restera un prix **affiché**. **Haute** | Bonne 2ᵉ source de revente. **Moyenne** | Utile si l'utilisateur vend déjà. **Moyenne** | Panier fixe seulement. **Moyenne** | Peu fiable pour le reconditionné. **Haute** (doc) | Fiabilise le rapprochement EAN. **Moyenne** |

Scrapers (Apify, Rainforest, scrapers idealo / Back Market) : risque contractuel (CGU opposables, arrêt CJUE C-30/14 Ryanair) et droit sui generis des bases de données : **à ne pas intégrer** ([notes veille](../../research_notes/Plateformes%20externes%20sourcing%20B2B/price_intelligence_and_market_data.md), Q7).

---

## H. Exclus

| Candidat | Raison principale | Preuve |
|---|---|---|
| **B-Stock** (dont liquidations Amazon UE) | CGU : interdiction de « any robot, spider, scraper, data mining tool… » | CONFIRMÉ — [B-Stock ToS](https://bstock.com/terms-of-use/), [Amazon EU](https://bstock.com/amazoneu/) |
| **Liquidity Services / Liquidation.com** | CGU : interdiction des « spiders, crawlers, robots » et du data mining ; API côté vendeur seulement | CONFIRMÉ — [User Agreement](https://liquidityservices.com/user-agreement) |
| **Utopya (FR)** | CGV art. 14 : extraction interdite, même non substantielle et répétée, y compris après clôture du compte ; déjà marqué `blocked` dans la bibliothèque | CONFIRMÉ — [CGV Utopya](https://www.utopya.fr/c-g-v) |
| **Assurant / HYLA ASP** | Source unique, centrée US, vendu « as-is », grades modifiables | CONFIRMÉ — [ASP terms](https://www.assurant.com/asp-authorized-resellers) |
| **Recommerce, Swappie B2B, Brightstar/Likewize** | Pas de flux de stock ; services de rachat ; volumes requis | CONFIRMÉ — [Recommerce](https://www.recommerce-solutions.com/produits-mobiles-reconditionnes/), [Swappie](https://business.swappie.com/services/) |
| **Back Market, Refurbed** (comme sources d'achat) | Places de marché grand public ; API vendeurs : Snowolff y serait vendeur, pas acheteur | CONFIRMÉ — [Back Market API](https://api.backmarket.dev/) |
| **AliExpress / Alibaba.com** | Pas de stock UE gradé ni de TVA UE ; extraction systématique interdite sans permission | ANNONCÉ (tiers) — [Ecosire](https://docs.ecosire.com/odoo-modules/alibaba) |
| **Fournisseurs US** (RecirQ, BidAllies, Injured Gadgets, PLP…) | Douane, TVA import, pas de TVA sur marge UE | HYPOTHÈSE |
| **Icecat Connect, 1WorldSync, Etilize** (comme sources de prix) | Données produit ; Icecat Connect normalise **vos** flux | CONFIRMÉ — [Icecat Stock & Pricing](https://icecat.com/stock-and-pricing/) |
| **Nexar / Octopart** | Composants électroniques, hors périmètre | CONFIRMÉ — [Nexar API](https://nexar.com/api) |
| **Brandsdistribution, VidaXL, Ankorstore, Wholesale2B** | Hors catégories (mode, maison, US) | CONFIRMÉ / HYPOTHÈSE |
| **Flxpoint, Inventory Source** | Redondants avec les adaptateurs MON STOCK ; 699 à 799 $/mois | CONFIRMÉ — [Flxpoint pricing](https://flxpoint.com/pricing) |
| **Scrapers tiers** (Apify, Rainforest…) | Risque CGU et droit sui generis | ANNONCÉ / CONFIRMÉ (jurisprudence) |

Détail et raisons complètes : [external-platforms-comparison.md](external-platforms-comparison.md#exclus-et-pourquoi).

---

## 4. Évaluation économique

### 4.1 Prix de gros compétitifs : aucune donnée comparative n'existe

Cette étude **ne dispose d'aucune donnée de prix réels comparables** entre candidats et sourcing actuel. Elle ne permet donc **pas** de dire qu'un candidat a « les meilleurs prix ». Les rares prix de gros visibles ne sont pas comparables entre eux :

| Offre observée | Prix | Ce qui l'empêche d'être comparée | Source |
|---|---|---|---|
| gsmExchange : iPhone 16 128 Go, 170 pièces | 613 € | État non précisé ; prix demandé, pas transaction | [gsmExchange](https://www.gsmexchange.com/en/phones/buy) |
| Refreshed Apples : iPhone 16 **256 Go** UE, occasion, MOQ 20 | 420 € | Capacité et état différents | [annuaire interne](supplier-directory.csv) |
| Mobile Depot : iPhone 14 Pro 128 Go | 407 € | Modèle différent ; page vieille d'environ 540 jours | [Mobile Depot](https://www.mobiledepot.eu/) |
| Mobile Depot : Galaxy Z Flip 4 128 Go grade A | 156 € | Autre marque ; page ancienne | [Mobile Depot](https://www.mobiledepot.eu/) |

Conclure « X est 30 % moins cher » à partir de ce tableau serait exactement la fausse bonne affaire que le moteur MON STOCK cherche à éviter.

### 4.2 Équivalence stricte : le vrai goulot d'étranglement

- Règles MON STOCK : même modèle, même capacité, même état, même grade, même qualité de pièce ; jamais de grade mixte « A/B » face à un grade A ; jamais de lot face à un prix unitaire ([analyse-bonnes-affaires.md](analyse-bonnes-affaires.md)).
- En production (14/10), la recherche « iPhone 13 » a renvoyé **270 offres**, dont **12** avec des équivalents eBay et **258** en « données insuffisantes », parce que les téléphones viennent presque tous d'un seul grossiste aux grades mixtes.
- Conséquence pour le choix :
  - une source qui ajoute des **lignes unitaires gradées** (Foxway boutique, Callisto catalogue) fait progresser l'analyse ;
  - une source qui ajoute des feuilles « take-all » (≈ 80 % A/B, 20 % C chez Foxway quand le grade manque, [Wholesale FAQ](https://wholesale.foxway.com/faqs)) ou des lots Callisto grade W la fait à peine bouger : ces lignes sont des lots, jamais comparés ;
  - le **prix HT explicite** a une valeur : une offre au régime HT/TTC inconnu ne peut pas atteindre « Très intéressant », et c'est la norme des sources actuelles ([RAPPORT-SOURCING](RAPPORT-SOURCING.md) §6).

### 4.3 Coût total et marge

| Candidat | Éléments connus du coût rendu | Inconnus |
|---|---|---|
| Foxway | Ex Works ; port ajouté aux lots d'enchères ; frais bancaires à l'acheteur ; enchères en autoliquidation de TVA | Port vers la France ; stock sous TVA sur marge (ANNONCÉ par l'annuaire, à confirmer) |
| DistriHUB | Minimum 300 € ; frais de 39 € sous 1 500 € (ANNONCÉ, à confirmer) ; dropshipping 3 €/colis | Port, TVA |
| Foneday | Port France 6,50 €, offert dès 150 € (extrait fragmentaire) | Paliers de prix |
| Merkandi | Stock sous TVA sur marge visible ; abonnement annuel | Pas de séquestre ; port par vendeur |
| Callisto | Inscription gratuite | Commission, port, TVA |
| ITscope / SITC | Abonnements publics | Port et prix des distributeurs |

Le **régime de TVA change la marge** : un iPhone reconditionné acheté sous TVA sur marge ne se revend pas avec la même marge qu'un iPhone acheté en autoliquidation. Le champ `vat_regime` de `sourcing_offers` ([migration B2B](../../supabase/migrations/20261013000100_sourcing_b2b.sql)) doit être renseigné pour chaque nouvelle source. Le coût rendu suit la formule existante : prix + TVA non récupérable + port ÷ MOQ + douane hors UE ([analyse-bonnes-affaires.md](analyse-bonnes-affaires.md)), à compléter par les frais de plateforme et bancaires.

### 4.4 Prix personnalisés

| Type | Candidats |
|---|---|
| Prix explicitement propres au compte (après approbation de chaque distributeur) | ITscope, Stock in the Channel, Ingram Micro — CONFIRMÉ |
| Prix « compte », personnalisation inconnue | Foxway, DistriHUB, Foneday, MobileSentrix EU |
| Offre, enchère ou négociation | Callisto, gsmExchange, Merkandi |

### 4.5 Fraîcheur annoncée (à mesurer)

| Candidat | Fraîcheur annoncée | Statut |
|---|---|---|
| ITscope | Direct, ou plusieurs synchronisations par heure | ANNONCÉ |
| Stock in the Channel | Quotidienne ou horaire | ANNONCÉ |
| RepairPlugin | Toutes les 60 minutes | CONFIRMÉ |
| Foxway | Stock temps réel ; enchères hebdomadaires | CONFIRMÉ |
| DistriHUB | Quantités « live » | ANNONCÉ |

Ce sont des chiffres d'éditeurs. Le radar MON STOCK marque une offre « ancienne » après **7 jours** ([radar.ts](../../src/domain/sourcing/radar.ts)) : une source rafraîchie chaque semaine y glisse juste avant chaque passage. Le test J0 / J+1 / J+7 doit mesurer la fraîcheur réelle ([plan de test](external-platforms-test-plan.md)).

### 4.6 Rentabilité de l'accès face au sourcing actuel

Le sourcing actuel ne coûte **aucun abonnement** : 22 sources publiques, 1 763 offres réelles ([RAPPORT-SOURCING](RAPPORT-SOURCING.md)).

| Candidat | Coût d'accès annuel connu | Commentaire |
|---|---|---|
| ITscope (Essential + API, si cumulables) | ≈ **1 860 €/an** (155 €/mois × 12) | Cumul et HT à confirmer |
| Stock in the Channel (datafeed) | ≥ **£3 000 à £3 600/an** (tarifs 2018 ; 12 mois pour 10 en annuel) | Tarifs 2026 inconnus |
| Merkandi | ≈ 190 € à 870 €/an selon le domaine | Incohérent |
| RepairPlugin Growth | ≈ 590 €/an (49 € × 12) | Pas une source |
| Foxway, Callisto, DistriHUB | **Aucun abonnement trouvé** | Coût = minimum de commande et trésorerie |

Calcul illustratif (sans donnée de marché) : 1 860 €/an ne se rentabilisent que si ITscope fait gagner au moins **155 € de marge par mois**, soit environ 8 € sur une vingtaine d'appareils neufs par mois. C'est un pari risqué pour un revendeur dont le cœur est le reconditionné. À l'inverse, un compte Foxway ou Callisto ne coûte rien tant qu'on n'achète pas : le test est presque gratuit.

---

## 5. Compatibilité avec MON STOCK (résumé)

Détail complet dans [external-platforms-integration.md](external-platforms-integration.md).

| Voie existante | Candidats qui y entrent sans code | Limite principale |
|---|---|---|
| Import de fichier (CSV, XLSX, XML, JSON ≤ 15 Mo) — [catalog-import.ts](../../src/services/sourcing/catalog-import.ts) | Foxway (Excel), 2Service (liste e-mail), lots Callisto si export autorisé | Manuel |
| Flux distant autorisé (URL HTTPS + en-tête chiffré) — [remote-feeds.ts](../../src/services/sourcing/remote-feeds.ts) | DistriHUB (flux filtré), ThePhoneHub (CSV Live Link) | 5 000 lignes / exécution ; un fournisseur par source ; expiration immédiate |
| Adaptateur « account » — [registry.ts](../../src/integrations/sourcing/registry.ts) | Ingram Micro (existe), BigBuy (existe) ; Foneday, API Foxway, ITscope = **nouveau code** | 20 pages par synchronisation ; pas de quarantaine ; pas de route Edge de création |
| Places de marché multi-vendeurs | Aucun aujourd'hui | Règle « un fournisseur par source » |

---

## 6. Conclusion : huit réponses pour décider

**1. Meilleure solution identifiée et preuves : Foxway, en grossiste et non en agrégateur.**
- Catégories cœur de Snowolff : iPhone neufs, d'occasion et reconditionnés, tablettes, portables, appareils testés et gradés individuellement — CONFIRMÉ ([Used mobile phones](https://resellers.foxway.com/used-mobile-phones/)).
- Prix **hors TVA et Ex Works** — CONFIRMÉ ([Sales terms](https://wholesale.foxway.com/sales-terms)).
- Stock temps réel, liste exportable en Excel, API « personnalisée » proposée — CONFIRMÉ pour l'existence ([Why Foxway?](https://resellers.foxway.com/why-foxway/)).
- Se branche sur l'import de fichier existant sans code, et sans le problème « un fournisseur par source ».
- Ce choix ne répond pas à « un maximum de fournisseurs » : aucun candidat multi-fournisseurs n'apporte aujourd'hui des données comparables en équivalent strict. **Confiance : moyenne-haute** sur le fonctionnement, faible sur l'API.

**2. Les deux meilleures alternatives : Callisto et DistriHUB.**
- **Callisto** : seule place de marché **multi-vendeurs** du reconditionné, grades standard (A à Dx), séquestre, inscription gratuite après KYC avec n° de TVA ([How to register](https://callisto.tech/knowledge-centre/en/how-to-register-your-business-on-callisto)). Aucun flux trouvé.
- **DistriHUB** (distrihub.eu, Varle) : seul agrégateur multi-fournisseurs à flux CSV/XML/JSON accessible sans compte distributeur préalable, minimum 300 € (ANNONCÉ). Neuf seulement ; identité à confirmer.
- Pour les pièces : **Foneday** (API par clé client, CONFIRMÉE en pratique). ITscope n'a de sens qu'après l'ouverture de comptes distributeurs.

**3. Coûts connus et à confirmer.**
- Connus : ITscope 51 €/mois (Essential) et 104 €/mois (API, 5 000 appels), facturés à l'année ; Stock in the Channel £30/mois (comparaison) et dès £300/mois (datafeed), tarifs anciens ; Merkandi ≈ 190 à 870 €/an selon le domaine ; RepairPlugin 24 à 95 €/mois ; Foxway minimum ≈ 2 000 € par commande ; DistriHUB minimum 300 € (ANNONCÉ) ; Callisto sans frais d'inscription acheteur ; Foneday port France 6,50 €, offert dès 150 € (extrait).
- À confirmer auprès du fournisseur : commission Callisto ; adhésion et frais de transaction gsmExchange ; frais DistriHUB sous 1 500 € ; coût d'une API Foxway ; conditions de la clé Foneday ; tous les frais de port vers la France ; caractère HT des prix ITscope et cumul Essential + API.

**4. Catégories réellement couvertes.**

| Catégorie | Candidats | Agrégateur ouvert à un tiers ? |
|---|---|---|
| Smartphones et tablettes reconditionnés | Foxway, Callisto, gsmExchange, Merkandi | Non (places de marché sans flux) |
| MacBook reconditionnés | Foxway, Callisto | Non |
| Neuf (smartphones, Mac, iPad, IT, électronique) | DistriHUB, ITscope, Stock in the Channel, ThePhoneHub, Ingram et distributeurs sous compte | Oui (neuf seulement) |
| Pièces Apple | Foneday, MobileSentrix EU, grossistes reliés à RepairPlugin | **Non** |
| Lots et palettes | Merkandi, Callisto (grade W), feuilles « take-all » Foxway | Non ; les grandes plateformes interdisent l'automatisation |

Aucun candidat ne couvre les cinq catégories.

**5. Avantages par rapport au sourcing actuel.**
Le gain n'est pas le volume (MON STOCK a déjà 1 763 offres réelles), c'est la **qualité exploitable** :
- grades structurés par appareil au lieu des grades mixtes « A/B » qui bloquent l'analyse ;
- prix explicitement HT, qui débloquent le niveau « Très intéressant » ;
- accès à des prix pro aujourd'hui cachés derrière un compte (Foxway, MobileSentrix EU, Mobilax…) ;
- un flux officiel ne casse pas quand un site change de thème, et retire le risque juridique de la lecture publique.

**6. Limites et risques.**
- Toutes les preuves viennent d'extraits de recherche et doivent être revérifiées.
- Accès : Kbis et surtout **n° de TVA intracommunautaire**, qu'une micro-entreprise n'a pas par défaut ([Excilio](https://www.excilio.fr/post/numero-tva-intracommunautaire-obtention)).
- MOQ et lots « take-all » : risque de grades mélangés.
- Aucune CGU lue n'autorise explicitement le stockage ou l'affichage dans MON STOCK.
- Code : règle « un fournisseur par source » pour tout multi-vendeur ; expiration immédiate sans quarantaine sur la voie « account » ; limites de 5 000 lignes et de 20 pages ; pas de route Edge pour créer une connexion.
- Identité de DistriHUB non établie.

**7. Étapes pour obtenir un accès réel.**
1. L'utilisateur confirme l'origine du nom « DistriHUB » et réunit Kbis et n° de TVA.
2. Ouvrir un compte revendeur **Foxway** ; demander la liste de stock Excel, la documentation de l'API, l'autorisation écrite d'usage dans un logiciel tiers et le régime de TVA sur marge.
3. En parallèle, inscrire Snowolff sur **Callisto** ; demander s'il existe un export ou un flux, et la commission.
4. Demander à **DistriHUB** une vérification acheteur et un échantillon de flux filtré « smartphones / Apple » sous 5 000 lignes, avec jeton dans un en-tête et non dans l'URL.
5. Demander à **Foneday** une clé API et ses conditions.
6. Faire passer le panel de 45 références ([plan de test](external-platforms-test-plan.md)), puis, sur décision de l'utilisateur, une commande d'essai.
7. ITscope et Stock in the Channel seulement après des comptes distributeurs approuvés ; l'essai gratuit de Stock in the Channel sert à savoir lesquels approuveraient Snowolff.

**8. Recommandation : TESTER DAVANTAGE.**
- **Ne rien intégrer** avant d'avoir des données réelles. Deux comptes gratuits (Foxway, Callisto) et un échantillon de flux (DistriHUB) suffisent à trancher en quelques semaines, sans abonnement.
- **Abandonner** : l'idée d'une plateforme unique ; l'automatisation de B-Stock, Liquidity Services, Utopya et gsmExchange ; les agrégateurs de dropshipping et les outils de veille comme sources de prix d'achat.
- Seul chantier de code à préparer dès maintenant (sur validation) : la route Edge de création de connexion. La résolution du fournisseur offre par offre n'est à engager que si Callisto ouvre un flux.
- Snowolff ne manque pas de fournisseurs, il manque d'**offres comparables**. La bonne solution externe est celle qui rend chaque ligne comparable (grade, capacité, HT, EAN), pas celle qui affiche le plus de vendeurs ou la plus grosse API.
