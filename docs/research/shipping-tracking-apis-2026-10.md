# API d'expédition et de suivi de colis — comparatif (10 octobre 2026)

Données brutes : [`shipping-apis-2026-10.json`](./shipping-apis-2026-10.json) et
[`tracking-apis-2026-10.json`](./tracking-apis-2026-10.json).

## Méthode et limites

- Les portails développeurs (Boxtal, Sendcloud, Packlink, La Poste, DHL, UPS, AfterShip, 17TRACK,
  Ship24) n'ont pas pu être ouverts depuis l'environnement de recherche (proxy). Les contrats
  d'interface ont été lus dans le **code officiel publié** par les éditeurs eux-mêmes :
  - Packlink : `packlink-dev/ecommerce_module_core` ;
  - Boxtal : `boxtal/php-library` ;
  - Ship24 : SDK officiel et spécification OpenAPI ;
  - UPS : `UPS-API/api-documentation` ;
  - AfterShip : `tracking-sdk-nodejs`.
- La Poste « Suivi v2 » : forme de réponse issue d'une bibliothèque communautaire
  (`debuss/lapostesuivi`), adresse et en-tête confirmés par le contrôle serveur ci-dessous.
- **Tarifs et quotas : souvent issus de pages tierces**, donc à confirmer à l'inscription.
- **Contrôle réel depuis le serveur** (Edge Function, 10/10/2026, sans identifiants, route
  `/cron/connectors-probe`) :

| API | Réponse | Ce que ça prouve |
| --- | --- | --- |
| Boxtal `www.envoimoinscher.com/api/v1/cotation` | 401 « Full authentication is required » | point d'accès actif, authentification requise |
| La Poste `api.laposte.fr/suivi/v2/idships/…` | 401 « UNAUTHORIZED » | point d'accès actif |
| Ship24 `api.ship24.com/public/v1/trackers/track` | 400 « The Authorization header is missing » | point d'accès actif |
| Packlink `api.packlink.com/v1/services` | 400 « Bad Request » sans clé | hôte actif ; requête à valider avec une clé |

## Tarifs d'expédition

| Solution | Type | Accès | Intérêt pour MON STOCK | Intégré |
| --- | --- | --- | --- | --- |
| **Packlink PRO** | agrégateur multi-transporteurs (Colissimo, Chronopost, Mondial Relay, UPS, DHL, DPD…) | compte pro gratuit annoncé, clé API dans Paramètres | une clé, JSON, prix HT et TTC, délai, dépôt / relais : le plus simple | **oui** (`PACKLINK_API_KEY`) |
| **Boxtal** (API v1) | agrégateur français | compte gratuit (README officiel), identifiants API v1 | HT/TTC, type d'enlèvement et de livraison, date de livraison | **oui** (`BOXTAL_V1_*`) |
| Sendcloud v3 | agrégateur | plans payants, accès API du plan gratuit non confirmé | API moderne ; schéma de réponse non confirmé | non (à ajouter après lecture de la doc) |
| UPS Rating, DHL MyDHL, Chronopost QuickCost | transporteurs | contrat par transporteur | un seul transporteur par API | non |
| Colissimo | — | aucune API de tarifs publique trouvée | grilles PDF uniquement | non |

**Sans plateforme connectée** : l'application utilise les grilles saisies par l'utilisateur
(table `shipping_rate_cards`) et ne propose aucun tarif inventé.

## Suivi de colis

| Solution | Couverture | Gratuit | Payant | Intégré |
| --- | --- | --- | --- | --- |
| **La Poste Suivi v2** (officiel) | La Poste, Colissimo, Chronopost | gratuit selon la communauté (quota ~100 req/s) | — | **oui** (`LAPOSTE_OKAPI_KEY`), prioritaire pour ces numéros |
| **Ship24** | 1 500+ transporteurs annoncés, détection automatique | 10 envois/mois, API incluse | Pro ~39 $/mois pour 1 000 envois (tiers) | **oui** (`SHIP24_API_KEY`) pour tous les autres transporteurs |
| 17TRACK v2.4 | 3 400+ (Colis Privé, Relais Colis, DPD FR confirmés) | 200 numéros une fois (depuis le 07/01/2026) | packs annuels (~119 $ / 5 000, tiers) | non : chemins des événements et de la date estimée non confirmés |
| AfterShip | 1 100+ | plan gratuit sans API | API dès Premium (~59 $/mois, ancien tarif) | non : trop cher pour un petit revendeur |
| TrackingMore, ParcelsApp | 1 000–1 500 | 50 / 3 envois | 9–74 $/mois (tiers, contradictoire) | non |
| **DHL Shipment Tracking - Unified** (officiel) | DHL | gratuit (250 appels/jour, 1 appel / 5 s au départ) | — | **oui** (`DHL_API_KEY`), prioritaire pour DHL (12/10/2026) |
| UPS Track | UPS | gratuit après validation de compte développeur | — | non (couvert par Ship24 + lien public) |
| Pages publiques des transporteurs, 17TRACK web | tous | gratuit, sans clé | — | **oui** : bouton « Suivre sur le site du transporteur » (lien, aucune API) |

**Choix** : La Poste (gratuit, officiel, la majorité des envois d'un revendeur français) +
Ship24 (contrat vérifié dans la spécification officielle, détection automatique). Seul le numéro
de suivi (et le pays de destination) est transmis : aucune donnée client.

**Formats de numéros** : la détection locale (S10 avec clé de contrôle, UPS `1Z…`, Amazon `TBA…`,
Colissimo 13 caractères) n'est qu'une suggestion. Les formats purement numériques (DHL, DPD, GLS,
Mondial Relay, FedEx) sont ambigus : l'utilisateur choisit, ou l'API détecte.
