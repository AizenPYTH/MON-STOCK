# Plan d'implémentation — collecte hebdomadaire des prix fournisseurs

Proposition du 13/10/2026. **À valider avant toute modification du code ou de la base.** Fondée sur `supplier-directory.md`, `access-methods.md`, `collection-report.md` et `collection-architecture.md`.

## 0. Gains immédiats, sans code (à faire par toi dans l'application)

Fixje et l'API eBay **fonctionnent déjà réellement** (200 et 30 prix relevés le 13/10), mais ils ne sont pas activés dans ton compte.

Activation : Fournisseurs → Gérer mes fournisseurs → bibliothèque des sources → « Activer ». L'activation te demande d'attester avoir lu leurs conditions : je ne peux pas le faire à ta place.

## 1. Classement des fournisseurs à intégrer en premier

### Vague A — collecte automatique sans compte (catalogue public)

Prérequis pour chaque source : robots.txt autorisé, CGU relues, **une collecte réelle réussie** avant de la déclarer opérationnelle.

| Fournisseur | Catégorie | Déjà prouvé | Travail |
| --- | --- | --- | --- |
| Refreshed Apples (NL) | iPhone d'occasion par lots | 117 prix réels | passer en collecte hebdomadaire du catalogue complet |
| Fixje (NL) | iPhone et pièces | 200 prix réels | idem |
| Brico-phone (FR), Servisní díly (CZ) | pièces | prix réels | mode catalogue par le plan du site (aujourd'hui recherche directe seulement) |
| MobileSentrix Europe (NL) | pièces Apple d'origine, prix HT publics | site joint ; test catalogue en échec (404) | connecteur spécifique à écrire après inspection du site |
| Replace Base (UK/NL) | pièces d'origine récupérées, prix et stock publics | site joint ; test en échec | connecteur spécifique |
| Pulled Mac Parts (NL), Ekolow (FR) | pièces MacBook d'origine | extraits de recherche | vérification serveur puis connecteur |
| 2repair.parts (UK/NL) | Samsung Service Pack (GH82) | extraits de recherche | idem |
| LCD-Phone (FR), Mobinova, AppleParts.pl (prix en PLN) | pièces | extraits de recherche | idem |
| Pieces2Mobile (Magento), iFixit EU (Shopify) | pièces | site joint | connecteur Magento / Shopify catalogue |
| it-versand.com (DE) | PC ex-leasing avec stock affiché | extraits de recherche | idem |

### Vague B — API officielles (un compte est nécessaire)

| Fournisseur | Ce qu'il te faut | État dans MON STOCK |
| --- | --- | --- |
| eBay Browse | rien de plus (clé déjà configurée) | adaptateur opérationnel, 30 prix réels |
| Mouser, TME, Farnell | compte développeur gratuit (composants, SSD, RAM, connectique) | à écrire d'après leur documentation officielle |
| Ingram Micro, TD SYNNEX | compte revendeur actif | Ingram écrit (fixtures seulement) ; TD SYNNEX à écrire |
| BigBuy | abonnement | écrit (fixtures seulement) |
| KOMSA, Esprinet, Exertis, MICHAEL AG, Brodos | compte revendeur | à écrire selon la documentation fournie |

### Vague C — flux autorisés après ouverture d'un compte

Ces flux passent par « Ajouter un flux autorisé » ou par l'import de fichier, **qui existent déjà**.

| Fournisseur | Flux annoncé |
| --- | --- |
| ThePhoneHub | CSV live link |
| DistriHUB | XML, JSON, CSV |
| Refreshed Apples | Google Sheet |
| Foxway | export de la stocklist |
| Mobile Depot, EU Mobile Wholesalers | listes de stock par e-mail |
| Home Screen | CSV, XML |

### Vague D — accès manuel ou commercial (affichés comme tâches à faire)

| Fournisseurs | Raison |
| --- | --- |
| Mobilax | Kbis exigé |
| 4Phones, SOSav Pro, Itancia, Sifar, GSMnet | compte pro ou commercial |
| Utopya | automatisation interdite par les CGU |
| Merkandi | 403 anti-robot, abonnement payant |
| B-Stock | robots interdits par les CGU |
| gsmExchange | adhésion avec références commerciales |

## 2. Étapes techniques

Chaque étape : code, tests automatisés, puis migration appliquée en production **avec ton autorisation**, puis déploiement et collecte réelle.

1. **Vérification réelle par le serveur des fournisseurs à extraits seulement**
   - Ajouter les candidats de la vague A à la bibliothèque, inactifs par défaut.
   - Le contrôle quotidien existant (04:23 UTC) teste leur catalogue depuis le serveur : robots.txt, plateforme, produits avec prix.
   - Ces tests remplacent l'ouverture des pages, que l'environnement de travail bloque.
2. **Migration `sourcing_weekly_collection`** (additive) :
   - fréquence `weekly`, jour et heure ;
   - `collect_cursor`, `last_full_collection_at`, `last_collection_stats` et `directory_key` sur `supplier_sources` ;
   - `missing_since` et `missed_collections` sur `sourcing_offers`.
   - Script de retour arrière fourni.
3. **Collecte par tranches et reprise**
   - Curseur persistant, budget de 100 s par passage du cron, une requête à la fois par hôte, au plus 3 sources par passage.
   - Le passage existant toutes les 6 h devient toutes les 15 min pendant la fenêtre de collecte.
4. **Règle de disparition** : « absente » seulement après 2 collectes **complètes** réussies sans l'offre ; jamais après une erreur ou une collecte tronquée.
5. **Mode catalogue pour le plan du site + JSON-LD** (Brico-phone, Servisní díly…), par lots, avec reprise.
6. **Connecteurs individuels de la vague A**, un par un : fixtures réelles enregistrées, tests de parsing, pagination, devises, doublons, panne, reprise, puis collecte réelle.
7. **Connecteurs API de la vague B**, dès qu'un compte existe ; secrets uniquement côté serveur, chiffrés.
8. **Interface** :
   - filtres de « Mes sources » (catégorie, pays, méthode, statut) ;
   - fiche fournisseur avec la dernière collecte, « Collecter maintenant » et les erreurs ;
   - écran « Cette semaine » : nouvelles offres, baisses de 10 % ou plus, moins cher par produit ;
   - correspondances à valider (écran existant).
9. **Tâches humaines** : liste « à faire » par fournisseur (créer le compte, envoyer le Kbis, demander le flux), avec le modèle d'e-mail existant. Aucun envoi automatique.

## 3. Tests prévus

- **Par connecteur** :
  - parsing sur page réelle enregistrée (fixture) ;
  - devises et HT/TTC ;
  - produits incomplets rejetés ;
  - doublons ;
  - pagination et curseur ;
  - délai dépassé et HTTP 403/429 ;
  - reprise après coupure.
- **Règles métier** :
  - une erreur de collecte ne crée jamais de rupture de stock ni de faux prix ;
  - une collecte tronquée ne fait disparaître aucune offre.
- **Sécurité** :
  - matrices RLS et isolation entre organisations déjà en place, étendues aux nouvelles colonnes ;
  - aucun secret dans le mobile.
- **Rapport** : une source n'est « opérationnelle » qu'après une collecte réelle réussie, consignée dans `collection-report.md`.

## 4. Ce qui reste hors périmètre sans accord explicite

- Créer des comptes, envoyer des justificatifs ou des demandes de devis à ta place.
- Naviguer automatiquement avec une session connectée.
- Toute collecte sur un site dont les CGU ou robots.txt l'interdisent.
