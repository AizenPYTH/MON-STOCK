# Sourcing B2B — matrice d'intégration (15/10/2026)

La matrice complète des 196 fiches est dans
[connected-suppliers-directory.csv](connected-suppliers-directory.csv) : méthodes, statut par
défaut, priorité, documentation API, fiabilité, logo. Ce document détaille les fournisseurs
prioritaires et la décision prise pour chacun.

Légende de la fiabilité :

- **C** = confirmé par une documentation officielle ;
- **A** = annoncé par le fournisseur, non testé ;
- **D** = déduit, à confirmer avec le service commercial.

## Réellement connectables aujourd'hui dans MON STOCK

| Fournisseur | Méthode | Ce qui est implémenté | Testé |
|---|---|---|---|
| Ingram Micro (FR) | API officielle (OAuth2 client credentials) | Connecteur `ingram-micro` : configuration de l'API, test, synchronisation du catalogue, déconnexion | Sur réponses simulées uniquement : aucun compte Ingram disponible |
| BigBuy | API officielle (clé) | Connecteur `bigbuy` : idem, bac à sable pris en charge | Sur réponses simulées uniquement : aucun abonnement BigBuy |
| eBay France | API Browse officielle | Annonces de revente (prix de marché) | **Oui, en production** (88 annonces) |
| 22 catalogues publics (Brico-phone, Refreshed Apples, Repuestosmovil…) | Catalogue public intégré | Collecte autorisée, avec lien vers chaque produit | **Oui, en production** (1 856 offres) |
| Tout fournisseur qui fournit un fichier | Import de fichier | Aperçu, correspondance mémorisée, sans doublon, historique, rapport d'erreurs CSV | Oui (tests automatisés) |
| Tout fournisseur qui fournit un lien de flux | Flux distant autorisé | HTTPS, en-tête d'authentification chiffré, anti-SSRF | Oui (tests automatisés) |

## Fournisseurs demandés : décision

| Fournisseur | Méthodes réelles | Statut | Décision | Fiabilité |
|---|---|---|---|---|
| Foxway | Export espace client, import de fichier, compte pro | Compte pro requis | Import de la liste de stock dès l'ouverture du compte. API « personnalisée » sur demande : connecteur seulement après réception de la documentation | A |
| ThePhoneHub | Flux CSV partenaire, API annoncée | Compte pro requis | Flux distant dès réception du lien partenaire | A |
| DistriHUB (distrihub.eu, Varle) | Flux CSV / XML / JSON, API, EDI annoncés | Compte pro requis | Flux distant dès validation du compte acheteur | A |
| Mobilax | Portail pro, import de fichier | Compte pro requis | Import d'export ; pas d'API publique | A |
| mpsmobile | Portail pro | Import de fichier | Import d'export | D |
| Mobistock | Catalogue, liste de prix par e-mail | Import de fichier | Import de la liste reçue | A |
| TR Vertriebs GmbH | Portail pro | Compte pro requis | Import d'export | D |
| 4Phones | Portail pro | Compte pro requis | Import d'export | D |
| LCD-Phone | Portail pro (Kbis, SIRET, TVA) | Compte pro requis | Import d'export | A |
| Ingram Micro | API officielle intégrée | Compte pro requis | **Connecteur prêt** : il faut un compte revendeur et une application développeur | C |
| BigBuy | API officielle intégrée | Compte pro requis | **Connecteur prêt** : il faut un abonnement avec accès API | C |
| TD SYNNEX (FR) | Flux, API Digital Bridge (EU) | Compte pro requis | Connecteur à développer après compte et accès développeur (documentation : developer.api.tdsynnex.com/eu) | C/A |
| Esprinet | espriCATALOG / espriREALTIME | Compte pro requis | Flux après ouverture du compte | A |
| Exertis France (WE.CONNECT) | Web services annoncés | Compte pro requis | Flux après ouverture du compte (rachat 2025 à confirmer) | A |
| KOMSA | EDI, flux XML / JSON, API | Compte pro requis | Flux ou EDI après accord | A |
| MobileSentrix EU | Catalogue public intégré, compte pro | Disponible publiquement | API réservée à des logiciels partenaires (RepairDesk, MyRepairApp) | A |
| Foneday | Catalogue public intégré, compte pro | Disponible publiquement | API par clé client non documentée publiquement : demander la documentation | A |
| Callisto | Portail pro, place de marché multi-vendeurs | Compte pro requis | Import d'export s'ils en fournissent un | A |
| gsmExchange | Consultation seule | Compte pro requis | **Non automatisable** (aucune API, aucun export) | A |
| Merkandi | Consultation seule | Compte pro requis | **Non automatisable** sans accord écrit | A |
| Utopya | — | **Écarté** | CGV art. 14 : extraction interdite | C |
| B-Stock | — | **Écarté** | Conditions d'utilisation : robots interdits | C |

## API officielles documentées, connecteurs non développés

Sur ces fournisseurs, l'étude a trouvé une documentation développeur officielle. Aucun connecteur
n'est écrit tant que la documentation n'a pas été lue en entier et qu'une clé de test n'est pas
disponible : on n'invente aucun endpoint.

| Fournisseur | Documentation | Authentification | Intérêt |
|---|---|---|---|
| TD SYNNEX (Digital Bridge EU) | developer.api.tdsynnex.com/eu | Compte revendeur | Élevé (informatique, Apple) |
| Mouser | mouser.com/api-search | Clé API gratuite | Moyen (composants) |
| DigiKey | developer.digikey.com | OAuth2 | Moyen (composants) |
| Farnell / element14 | partner.element14.com | Clé API gratuite | Moyen (composants) |
| TME | developers.tme.eu | Clé API | Moyen (composants) |
| Nexar / Octopart | support.nexar.com | OAuth2, offre gratuite de 100 pièces | Agrégateur de composants |

## Prochaines étapes (par priorité)

1. Ouvrir les comptes Foxway, LCD-Phone et Mobilax (Kbis + n° de TVA), puis importer leurs listes
   de stock.
2. Demander les flux partenaires de DistriHUB et ThePhoneHub, puis les ajouter comme flux.
3. Demander à Foneday la documentation de son API par clé client. Connecteur dès réception.
4. Si un compte Ingram ou BigBuy est ouvert : configurer l'API depuis la fiche. Ce sera le premier
   test réel de ces connecteurs.
5. Composants : développer un connecteur Mouser ou TME à partir de leur documentation officielle,
   si cette catégorie devient prioritaire.
