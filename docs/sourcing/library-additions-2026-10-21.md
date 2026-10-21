# Bibliothèque de sources — ajouts du 21/10/2026

Demande du titulaire : « le plus de fournisseurs possible […] tout ce que tu peux comme source
publique, puis laisse ceux dont il faut un compte pro ».

## Limite de cette passe

Le réseau de l'environnement de développement refuse les sites des fournisseurs (passerelle :
403 sur CONNECT, résolution DNS impossible). **Aucune source ajoutée ici n'a été vérifiée en direct
depuis cet environnement.** Les fiches viennent de la recherche documentaire du 10/10/2026
(`docs/sourcing/supplier-directory.csv`, `src/services/sourcing/data/supplier-directory.json`) :
prix publics signalés, pas de compte requis pour les voir, aucune interdiction connue.

Le garde-fou reste celui du serveur : une source n'est **activable** qu'après une vérification
serveur réussie (`sourcing_library_checks.status = ok` : robots.txt autorisé + produits avec prix ;
l'adaptateur réellement fonctionnel est détecté parmi Shopify / WooCommerce / sitemap + JSON-LD).
Les conditions d'utilisation de chaque site sont à relire avant activation.

## 16 sources ajoutées

| Clé | Fournisseur | Pays | Segment | Adaptateur proposé |
| --- | --- | --- | --- | --- |
| `pieces2mobile` | Pieces2Mobile | FR | pièces | sitemap-jsonld (Magento) |
| `appleparts-pl` | AppleParts | PL | pièces | sitemap-jsonld |
| `a-parts-pl` | A-Parts | PL | pièces | sitemap-jsonld |
| `telehurt-pl` | Telehurt | PL | pièces | sitemap-jsonld |
| `hurtowniagsm-pl` | HurtowniaGSM | PL | pièces | sitemap-jsonld |
| `ms-gsm` | MS GSM | DE | pièces | sitemap-jsonld |
| `phonegigant` | PhoneGigant | NL | pièces (détail) | sitemap-jsonld |
| `teknikdelar-se` | Teknikdelar | SE | pièces | sitemap-jsonld |
| `repair-outlet-uk` | Repair Outlet | GB | pièces (prix trade) | shopify-storefront |
| `fonefunshop-uk` | FoneFunShop | GB | pièces, outils | sitemap-jsonld |
| `thebookyard-uk` | The Bookyard | GB | cartes mères Mac | sitemap-jsonld |
| `mobistock-nl` | Mobistock | NL | reconditionné | sitemap-jsonld |
| `mobiledepot-eu` | Mobile Depot Europe | NL | reconditionné / stock B2B | sitemap-jsonld |
| `pc-portatil-es` | PC Portátil | ES | informatique d'occasion | sitemap-jsonld (PrestaShop) |
| `it-versand-de` | it-versand.com | DE | informatique reconditionnée | shopify-storefront |
| `itjustgood-fr` | ITJustGood | FR | portables reconditionnés (détail) | sitemap-jsonld |

Les fiches de l'annuaire correspondantes (Pieces2Mobile, Mobile Depot Europe, Mobistock,
PC Portátil, Telehurt, HurtowniaGSM, Repair Outlet, FoneFunShop, MS GSM, Teknikdelar) proposent
désormais l'activation depuis la bibliothèque (après vérification serveur).

## Écartés

- **Interdiction / robots.txt** : Utopya (CGV art. 14, déjà bloqué), Jobalots (robots.txt),
  ITP Technologie (robots.txt), Planet Outlet (robots.txt, 403).
- **Compte professionnel requis pour les prix** (selon la recherche) : Foneday, LCD-Phone,
  Dutchspares, Mobilax, Molano (plateforme B2B), GSP Electronics, Merkandi, Destockplus, Restposten,
  Troostwijk / BVA (inscription acheteur).
- **Site introuvable** : Big Brand Depot.
- **Hors périmètre** (États-Unis / Chine, ou grands distributeurs de composants avec API sous
  contrat) : Repairs Universe, Powerbook Medic, eTradeSupply, Mouser, Digi-Key, Farnell, RS, TME.

## Les 5 sources de la bibliothèque en échec (non modifiées)

Foneday (HTTP 404 sur la recherche Shopify), iFixit Pro EU, MobileParts.shop, Rewa (HTML au lieu
de JSON, WooCommerce 404) et Replacebase (HTTP 202 sans contenu, protection anti-robots probable)
n'ont pas pu être diagnostiquées : leurs sites sont inaccessibles depuis cet environnement. Les
fiches restent telles quelles ; la vérification serveur quotidienne tente déjà les trois
adaptateurs. Aucune protection anti-robots ne doit être contournée.
