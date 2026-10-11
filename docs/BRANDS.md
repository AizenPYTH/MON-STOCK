# Marques tierces : logos, conditions d'utilisation et affichage

Vérification du 11 octobre 2026. Le registre est dans `apps/mobile/src/brands/registry.ts`.

## 1. Principe retenu

- **Aucun logo n'est embarqué aujourd'hui.** Aucune des marques n'a donné d'autorisation écrite à MON STOCK, et aucune ne publie de licence ouverte qui couvre un logiciel tiers.
- Chaque marque s'affiche donc avec son **nom en typographie neutre** (police et couleurs de l'application) et une **icône générique** selon le type de service :
  - vitrine : canal de vente ;
  - camion : transporteur ;
  - colis : plateforme d'expédition ;
  - radar : suivi.
- Pas de couleur de marque, pas d'imitation de logo. Le nom en texte simple est l'usage que les marques tolèrent sans permission. eBay le dit explicitement.
- Une mention apparaît près des marques (Réglages → Intégrations, écran eBay, comparateur de frais de port) : « Les noms cités sont des marques de leurs propriétaires respectifs. Ils servent uniquement à identifier les services utilisés ; MON STOCK n'est ni partenaire ni approuvé par ces marques. »
- Le composant `BrandMark` affichera automatiquement le logo officiel dès que le registre passe une marque à `authorized` avec un fichier dans `apps/mobile/assets/brands/`. Il respecte :
  - le ratio d'origine (aucune déformation ni recoloration) ;
  - une plaque claire si le logo l'exige (thème sombre) ;
  - le libellé pour le lecteur d'écran.

## 2. Marques et conditions identifiées

**Limite de cette vérification :** les sites des marques sont bloqués par le réseau de cet environnement. Les conditions ont été recherchées par moteur de recherche. Les pages officielles citées sont à relire par vous avant toute demande.

| Marque | Statut | Source officielle identifiée | Conditions trouvées | Pour obtenir le logo |
| --- | --- | --- | --- | --- |
| **eBay** | licence requise | [brandpermission.ebay.com/guidelines](https://brandpermission.ebay.com/guidelines) ; [conditions du Developers Program](https://developer.ebay.com/cms/files/api_license_2018-10-26.pdf) | Le nom et le logo sont des marques déposées. Le logo n'est utilisable qu'avec une **licence écrite**. Une référence en **texte simple** est permise sans autorisation, orthographiée « eBay ». Le badge « eBay Compatible Application » est réservé aux applications approuvées par le Developers Program. | Demande via l'Intellectual Property Permission Center ou ippermissions@ebay.com, ou candidature « Compatible Application » |
| **La Poste** | kit officiel, usage non confirmé | [Brand center du groupe La Poste](https://www.lebrandcenter.lapostegroupe.com) | Règles strictes : fond blanc de référence, taille minimale, zone de protection, aucune altération, interdits sur fond orange ou sombre. Accès et droits d'un éditeur tiers non précisés. | Demande au service marque du groupe La Poste |
| **Colissimo** | kit officiel, usage non confirmé | [Kit de communication Colissimo](https://www.colissimo.entreprise.laposte.fr/en/tools-and-services/communication-kit) | Logothèque, version verticale réservée aux sites e-commerce, usages interdits. Exemples : écrire « Colissimo » dans la typographie du logo, fond nuisant à la lisibilité. Le kit vise les e-commerçants clients ; l'usage dans un logiciel tiers n'est pas confirmé. | Télécharger le kit avec votre compte Colissimo et demander confirmation écrite pour un usage dans MON STOCK |
| **Chronopost** | aucune condition publique | — (seules les CGV sont publiées) | Rien sur l'usage du logo. | Demande à Chronopost (groupe La Poste) |
| **Mondial Relay** | aucune condition publique | — | Pas de kit presse public ; « Points Relais » est une marque déposée. | Demande au service communication (groupe InPost) |
| **Sendcloud** | aucune condition publique | [Programme partenaires](https://www.sendcloud.com/partners) (pas de kit de marque) | Rien de publié ; les téléchargements trouvés sont des sites tiers, **non utilisés**. | Demande via le programme partenaires Sendcloud |
| **Packlink PRO** | aucune condition publique | — | Rien de publié. | Demande à Packlink |
| **Boxtal** | aucune condition publique | — | Rien de publié. | Demande à Boxtal |
| UPS | aucune condition publique | — | Logique de certification, règles de nommage (® sur la mention principale). Aucune licence de logo publique pour un logiciel tiers. | Programme développeur UPS |
| DHL, DPD, FedEx, Colis Privé, Relais Colis, Ship24, Amazon | aucune condition publique | — | Rien trouvé. | Demande à chaque marque |
| GLS | aucune condition publique | — | Seul l'emblème « Klima Protect » est concédé, et seulement dans le cadre d'un contrat. | Demande à GLS |

Écartés volontairement :
- les sites d'agrégation de logos (toolradar, designyourway, stickers…), qui ne sont pas des sources officielles ;
- les bibliothèques d'icônes de marques, qui ne donnent aucun droit sur la marque elle-même.

## 3. Où l'identité des marques est affichée

| Écran | Affichage |
| --- | --- |
| Réglages → Intégrations | eBay : icône de canal + nom ; mention d'identification |
| eBay (connexion, synchronisation) | marque eBay dans l'en-tête ; mention |
| Ventes → Annonces eBay, fiche annonce | marque eBay |
| Détail de commande | canal de la commande (eBay, ou nom libre) + date |
| Comparateur de frais de port | transporteur de chaque offre (Colissimo, Chronopost, Mondial Relay, UPS…), reconnu dans le texte du devis ou de la grille ; badge « Devis réel » avec le nom officiel de la plateforme (Sendcloud, Packlink PRO, Boxtal) ; mention |
| Suivi de colis (liste, détail) | transporteur détecté ou saisi ; source « API La Poste Suivi » ou « Ship24 » |

Non concernés :
- **fournisseurs** : l'annuaire affiche déjà des initiales génériques, et aucune marque fournisseur n'est au registre ;
- **liste des commandes** : le canal n'est pas lu par la liste (requête inchangée) ; il est indiqué dans le détail.

## 4. Démarches à faire (par vous)

1. **eBay** : demander une licence de logo, ou l'agrément « Compatible Application ». C'est le logo le plus utile (connexion, annonces, commandes).
2. **Colissimo / La Poste** : télécharger le kit officiel depuis votre espace Colissimo et obtenir une confirmation écrite pour un affichage dans un logiciel de gestion.
3. **Sendcloud, Packlink, Boxtal** : demander l'accord via leurs programmes partenaires ou intégrateurs.
4. **Chronopost, Mondial Relay** : demander un kit et l'autorisation au service communication.

Une fois l'accord écrit reçu : suivre `apps/mobile/assets/brands/README.md`. Il suffit d'ajouter le fichier et de changer le statut ; aucun écran n'est à modifier.

## 5. Tests

- `apps/mobile/tests/brands.test.tsx` vérifie :
  - le statut et la date de chaque marque ;
  - **aucun logo sans autorisation** (registre et dossier `assets/brands` vides) ;
  - la reconnaissance des noms libres ;
  - une mention sans revendication de partenariat ;
  - l'affichage neutre et l'affichage du logo une fois autorisé.
- `apps/mobile/tests/tools.test.tsx` (frais de port) vérifie : transporteur affiché en présentation neutre, « Devis réel Sendcloud », mention.
