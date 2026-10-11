# Audit Karrio et Sendcloud pour MON STOCK (11 octobre 2026)

Objectif : réduire les abonnements et les clés API payantes sans renoncer à de **vrais tarifs** ni à un **suivi fiable**.

Rien n'est remplacé et rien n'est branché. Le prototype vit dans `src/integrations/shipping/prototypes/` :
- aucune route ni aucun écran ne l'importe ;
- l'Edge Function ne l'embarque pas.

## 1. Conclusion

| Question | Réponse vérifiée |
| --- | --- |
| Karrio donne-t-il de vrais tarifs Colissimo, Mondial Relay, DPD, GLS ? | **Non.** Mondial Relay, Colis Privé et Relais Colis n'existent pas dans Karrio. Pour Colissimo, DPD, GLS, Hermes et DHL Parcel DE, il ne lit qu'une grille figée dans le code, souvent à 0,00 €. Test local : la demande de tarif Colissimo plante, et GLS renvoie « 0.0 EUR ». |
| Karrio peut-il tourner dans nos Edge Functions Supabase ? | **Non.** C'est une application Python / Django (166 paquets, 479 Mo). Elle a besoin de PostgreSQL, Redis et d'un processus de tâches. Le seul serveur API occupe environ 300 Mo de mémoire. Il faut un serveur séparé ; l'Edge Function l'appellerait en HTTPS. |
| Karrio réduit-il les coûts ? | Logiciel gratuit (LGPL-3.0), mais il faut payer et maintenir l'hébergement. Il **faut aussi un contrat chez chaque transporteur**. Les seuls tarifs réels (Chronopost, UPS, DHL Express, FedEx) passent par ces contrats. |
| Sendcloud donne-t-il de vrais tarifs ? | **Oui, vérifié** sur votre compte (lecture seule, aucune étiquette créée). Colissimo et Mondial Relay sont tarifés sans contrat transporteur à vous, avec leurs tarifs négociés par Sendcloud. |
| Recommandation | **Sendcloud** pour les devis (et plus tard les étiquettes, sur confirmation). **La Poste Suivi + Ship24** pour le suivi. **Karrio : pas maintenant.** À reconsidérer seulement si vous signez des contrats directs Chronopost, UPS ou DHL et voulez éviter tout frais SaaS. |

## 2. Méthode

- **Code de Karrio lu à la source :**
  - dépôt `karrioapi/karrio`, commit `deea10f` du 23/06/2026, version **2026.1.32** ;
  - dépôt `karrioapi/community` (plugins communautaires, dont Colissimo).
- **Serveur Karrio réellement lancé dans la sandbox de développement**, sur une base SQLite jetable :
  - installation de **karrio.server 2026.1.32**, de ses dépendances figées et des connecteurs officiels ;
  - les images Docker ont été refusées (Docker Hub : 429, registre Scarf : 403, GHCR : non autorisé) ;
  - le module de génération de documents a été retiré : il télécharge une feuille de style sur Internet à son chargement, ce que le proxy bloque.
- **Appels réels à l'API locale :**
  - `/v1/references` ;
  - `/v1/connections` (identifiants volontairement faux) ;
  - `/v1/proxy/rates` ;
  - `/v1/proxy/tracking`.
- **Sendcloud, par le connecteur MCP en lecture seule :**
  - compte, contrats ;
  - `shipping-options` avec `calculate_quotes=true`, qui calcule un devis sans rien facturer ;
  - suivi d'un numéro fictif.
- **Limites :**
  - la sandbox ne peut pas joindre les API des transporteurs (proxy 403). Les appels Chronopost et La Poste passés par Karrio n'ont donc pas pu aller jusqu'au transporteur ;
  - les pages de prix officielles de Sendcloud et Karrio étaient injoignables. Leurs prix viennent de sources tierces, à confirmer.

## 3. Licence de Karrio

- **Tout le code hors du dossier `ee/` est sous GNU LGPL-3.0** (fichier `LICENSE`). On peut l'utiliser gratuitement, l'héberger soi-même et l'appeler depuis MON STOCK par son API REST. Le fait d'appeler un service ne propage pas la licence au code de MON STOCK. Si on modifie Karrio et qu'on le distribue, ces modifications doivent être publiées sous LGPL.
- **Le dossier `ee/` est sous licence « Karrio Enterprise »** (fichier `LICENSE_EE`) :
  - usage en production réservé aux abonnés payants ;
  - usage gratuit seulement pour le développement et les tests ;
  - cela concerne `ee/platform` et `ee/insiders`, des sous-modules privés absents du clone public.
- **Karrio Cloud (offre hébergée) : tarifs non publiés** dans les sources accessibles ([EasyPost – partenaire Karrio](https://www.easypost.com/partners/karrio), [modèle Railway](https://railway.com/deploy/karrio-shipping)).

## 4. Transporteurs de Karrio utiles en France et en Europe

Capacités renvoyées par le serveur lancé (`/v1/references`) et contrôlées dans le code (`providers/<transporteur>/rate.py`) :

| Transporteur | Capacités annoncées | Tarif réel ? | Accès nécessaire |
| --- | --- | --- | --- |
| La Poste (suivi) | suivi seulement | — | clé Okapi La Poste (la même que notre connecteur actuel) |
| Colissimo (plugin communautaire, absent de l'image Docker officielle) | tarifs, étiquettes, suivi | **non** : grille statique à 0,00 € ; demande de tarif en erreur `parse_rate_response` en 2026.1.32 | contrat Colissimo Entreprise (n° de contrat + mot de passe) |
| Chronopost | tarifs, étiquettes, suivi | **oui** (QuickCost) | contrat Chronopost |
| DPD (DE) | tarifs, étiquettes, suivi | **non** : grille à 0,00 € ; « ne dessert pas l'origine FR » | compte DPD Delis |
| GLS | tarifs, étiquettes, suivi, enlèvement | **non** : grille statique ; « ne dessert pas l'origine FR » ; 0,00 € renvoyé en Allemagne | compte GLS |
| UPS | tarifs, étiquettes, suivi, enlèvement | **oui** | compte UPS |
| DHL Express / MyDHL | tarifs, étiquettes, suivi, enlèvement | **oui** | compte DHL Express |
| DHL Parcel DE, Hermes, Spring, bpost, Post AT | étiquettes, suivi ; tarifs par grille | **non** | contrat chez chaque transporteur |
| DHL Universal | suivi seulement | — | clé DHL (gratuite selon DHL, avec quota) |
| Easyship, EasyPost (agrégateurs) | tarifs, étiquettes, suivi | oui, aux tarifs de l'agrégateur | compte chez l'agrégateur |
| **Mondial Relay, Colis Privé, Relais Colis, Boxtal, Packlink, Sendcloud** | **absents** | — | — |

Le prototype en tient compte : `KARRIO_LIVE_RATING_CARRIERS` n'accepte que les connecteurs qui appellent une vraie API de tarifs. Tout prix nul ou issu d'une grille est écarté et affiché comme tel, jamais comme une offre.

## 5. Résultats du test local de Karrio

Colis : 1 kg, 30 × 20 × 10 cm, de 75011 vers 69003. Identifiants factices.

| Connecteur | Réponse réelle du serveur Karrio |
| --- | --- |
| Colissimo | `SHIPPING_SDK_INTERNAL_ERROR` : le module `karrio.providers.colissimo` n'a pas d'attribut `parse_rate_response` |
| DPD | `SHIPPING_SDK_ORIGIN_NOT_SERVICED_ERROR` : ce compte ne peut pas expédier depuis la France, même avec le pays du compte réglé sur FR |
| GLS | même erreur ; depuis l'Allemagne, il renvoie **`gls_parcel 0.0 EUR`** présenté comme un tarif |
| Chronopost | appel réseau bloqué par le proxy de la sandbox (contrat nécessaire de toute façon) |
| La Poste (suivi) | appel réseau bloqué par le proxy de la sandbox |

Les réponses sont conservées dans `tests/fixtures/shipping-prototypes/karrio-*.json`. Les tests unitaires vérifient qu'aucune ne produit de prix.

## 6. Sendcloud : vérification réelle

**Contrats visibles sur votre compte :**
- type « broker », c'est-à-dire les tarifs de Sendcloud ;
- Colissimo FR, Andorre et Monaco ;
- Mondial Relay FR, BE, ES et NL ;
- Sendcloud dans 13 pays.

État affiché : `validating`.

**Devis réels du 11/10/2026**, même colis de 1 kg de 75011 vers 69003. Montants exacts renvoyés par l'API, facturés seulement à la création d'une étiquette (`charging_type: label_creation`). L'API ne précise pas s'ils sont HT ou TTC.

| Service | Total | Détail |
| --- | --- | --- |
| Mondial Relay Locker Delivery (consigne) | 4,29 € | délai annoncé 48 h |
| Mondial Relay Point Relais | 4,39 € | e-mail du destinataire requis |
| Mondial Relay Home Domestic (domicile) | 6,03 € | — |
| Colissimo Service Point | 8,85 € | dont 1,09 € de surcharge carburant (14,02 %) ; téléphone requis |
| Colissimo Home (domicile) | 10,71 € | dont 1,32 € de surcharge carburant ; délai annoncé 48 h |
| « Unstamped letter » | 0 € | **non suivi : écarté** par le prototype |

**Suivi :**
- `parcel-tracking` ne connaît que les colis créés dans Sendcloud ou enregistrés chez lui (test : « Parcel does not exist ») ;
- l'enregistrement d'un colis créé ailleurs (étiquette eBay, par exemple) est une fonction **bêta**, réservée aux comptes inscrits au programme. Elle exige aussi un contrat transporteur actif ([documentation Sendcloud](https://sendcloud.dev/docs/parcel-tracking/create-an-external-tracking-parcel), [aide Sendcloud](https://support.sendcloud.com/hc/en-us/articles/39544570816145-External-Parcel-Tracking-track-parcels-without-outgoing-shipments)).
- Sendcloud ne remplace donc pas Ship24 ni La Poste pour les colis expédiés hors de Sendcloud.

## 7. Comparatif des coûts, séparés

Les prix d'abonnement ci-dessous viennent de sources tierces, qui se contredisent parfois. **Ils sont à confirmer** sur les pages officielles avant toute décision.

| Solution | Logiciel | Hébergement | Transport (étiquettes) | Clés à gérer |
| --- | --- | --- | --- | --- |
| **Packlink PRO** (intégré) | compte pro annoncé gratuit | 0 € (appelé depuis l'Edge Function) | payé par étiquette, aux tarifs Packlink | 1 clé |
| **Boxtal** (intégré) | compte gratuit (README officiel) | 0 € | payé par étiquette | identifiant + mot de passe |
| **La Poste Suivi v2** (intégré) | compte développeur gratuit ; quota et prix de l'abonnement **non confirmés** ([annuaire APIs.io](https://apis.io/providers/la-poste-groupe/)) | 0 € | — | 1 clé |
| **Ship24** (intégré) | 10 envois par mois gratuits, puis payant (environ 39 $ par mois pour 1 000 selon une source tierce) | 0 € | — | 1 clé |
| **Karrio auto-hébergé** | 0 € (LGPL, hors `ee/`) | serveur à payer : au moins 2 Go de mémoire pour l'API, le worker, PostgreSQL et Redis. Prix VPS 2026 contradictoires ([comparatif 2026-08](https://kimmo.suominen.com/stuff/cpc-2026-08.txt), [Hetzner 2026](https://www.vincentschmalbach.com/hetzner-cheap-cloud-unavailable-price-increases/)). S'y ajoutent mises à jour, sauvegardes et sécurité. | **contrat payant chez chaque transporteur** ; aucun tarif réel sans contrat | 1 clé Karrio + les identifiants de chaque transporteur |
| **Sendcloud** | formule gratuite annoncée (20 étiquettes par mois, environ 0,10 € de frais par étiquette). Formules payantes d'environ 28 à 299 € par mois. **L'accès API sur la formule gratuite est contradictoire selon les sources** ([PricingSaaS](https://pricingsaas.com/companies/sendcloud), [Hackceleration](https://www.hackceleration.com/labs/sendcloud-pricing), [AuthenCIO](https://www.authencio.com/blog/sendcloud-pricing-compare-plans-hidden-costs)). Votre compte répond déjà à l'API. | 0 € | payé à la création d'une étiquette (ex. 4,29 € à 10,71 € pour 1 kg en France) ; un devis est gratuit | 2 clés (publique et secrète) |

**Aucune de ces solutions ne rend l'expédition gratuite.** Les étiquettes restent payantes partout. Ce qui change, c'est le coût logiciel, le coût d'hébergement et le nombre de comptes à gérer.

## 8. Architecture proposée (en attente de votre accord)

```
iPhone (MON STOCK) ──► Edge Function « api » (Supabase, secrets côté serveur)
                         ├─ Devis :
                         │    1. Sendcloud shipping-options  (SENDCLOUD_PUBLIC_KEY / SENDCLOUD_SECRET_KEY)
                         │    2. Packlink / Boxtal            (déjà intégrés, facultatifs)
                         │    3. vos grilles manuelles        (toujours disponibles)
                         ├─ Suivi :
                         │    1. La Poste Suivi v2 (Colissimo, Chronopost, La Poste)
                         │    2. Ship24 (tous les autres transporteurs)
                         │    3. Sendcloud parcel-tracking (seulement pour les étiquettes créées via Sendcloud)
                         └─ Étiquettes : jamais automatiques. Création Sendcloud uniquement après confirmation
                            explicite, prix affiché avant.
```

- **Aucune nouvelle machine.** Tout passe par l'Edge Function existante (Deno `fetch` + secrets Supabase). C'est exactement le modèle de Packlink et Boxtal aujourd'hui.
- Le comparateur ajouterait la source « Sendcloud » à côté de Packlink et Boxtal. Pour chaque offre, il afficherait :
  - le prix exact, avec la surcharge carburant détaillée ;
  - « HT/TTC non précisé » ;
  - les conditions (point relais, e-mail ou téléphone requis).
- **Ensuite, on pourrait supprimer Packlink et Boxtal** si Sendcloud couvre vos besoins. Cela fait 1 compte au lieu de 2.
- **Karrio, seulement si** vous signez des contrats directs Chronopost, UPS ou DHL Express. Il tournerait alors sur un petit serveur Docker séparé (API + worker + PostgreSQL + Redis), accessible en HTTPS et protégé par une clé, que l'Edge Function appellerait (`prototypes/karrio.ts`). Le module de documents devrait embarquer ses feuilles de style localement.

## 9. Ce qui demande votre accord avant d'aller plus loin

1. **Brancher Sendcloud dans le comparateur.** Il faudrait :
   - ajouter `"sendcloud"` aux fournisseurs du contrat ;
   - ajouter la route serveur ;
   - ajouter les secrets `SENDCLOUD_PUBLIC_KEY` et `SENDCLOUD_SECRET_KEY` dans Supabase (vous les y mettez vous-même) ;
   - afficher l'offre dans l'app.

   Aucune migration de base n'est nécessaire.
2. **Retirer ou garder Packlink et Boxtal.**
3. **Plus tard, la création d'étiquettes Sendcloud**, toujours avec confirmation et prix affiché avant achat.
4. **Confirmer votre formule Sendcloud** : nombre d'étiquettes inclus, frais par étiquette, accès API.

## 10. Fichiers du prototype

- `src/integrations/shipping/prototypes/types.ts` : format commun des devis prototypes (prix exact, TVA non supposée, offres écartées).
- `src/integrations/shipping/prototypes/karrio.ts` : client REST d'un serveur Karrio auto-hébergé, filtre des tarifs réels, correspondance des statuts de suivi.
- `src/integrations/shipping/prototypes/sendcloud.ts` : devis Sendcloud v3, uniquement des envois suivis, prix strictement positifs.
- `tests/unit/shipping-prototypes.test.ts` : 14 tests sur les vraies réponses enregistrées.
- `tests/fixtures/shipping-prototypes/` : réponses Sendcloud et Karrio réelles, sans aucune donnée personnelle.
