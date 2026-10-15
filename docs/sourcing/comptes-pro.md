# « Connectez vos comptes » : vos prix pro d'abord, les sources publiques ensuite

Les meilleurs prix d'achat ne sont pas publics : ils sont réservés aux comptes revendeur (prix HT,
par grade, parfois négociés). MON STOCK organise donc le sourcing en deux étages.

1. **Vos comptes fournisseurs.** Vous connectez vos comptes pro (API, flux ou liste de stock). Leurs
   offres passent en premier dans la recherche, avec la mention « Votre compte ».
2. **Sources publiques et places de marché.** Les catalogues publics déjà collectés et les annonces
   eBay complètent la liste. Chaque offre garde son lien vers la page du produit.

Étude à l'origine de ce choix : [external-platforms-report.md](external-platforms-report.md).

## Dans l'application

- **Onglet Fournisseurs.** Une carte « Connectez vos comptes fournisseurs » mène à l'écran dédié.
  Les résultats « du moins cher au plus cher » sont présentés en deux blocs :
  - « Vos comptes fournisseurs » ;
  - « Sources publiques et places de marché ».

  Si aucun de vos comptes ne propose le produit, un bandeau invite à les connecter.
- **Mes comptes fournisseurs** (aussi accessible depuis « Mes sources »). Pour chaque compte pro
  prioritaire, l'écran affiche :
  - le logo, l'apport du compte, les conditions d'ouverture et les éventuelles restrictions ;
  - le statut réel : Connecté, En attente, Erreur ou Non connecté. « Connecté » n'apparaît que sur
    preuve, soit une connexion API testée, soit des offres réellement reçues ;
  - les actions possibles, détaillées dans le tableau suivant.

| Action | Quand | Comment |
|---|---|---|
| Connecter avec mes identifiants API | Ingram Micro, BigBuy (connecteurs existants) | Identifiants envoyés au serveur, chiffrés (AES-256-GCM, `supplier_connection_secrets`), puis test réel ; jamais conservés sur le téléphone ni réaffichés |
| Synchroniser mes prix | Compte API connecté | Catalogue du compte → offres (`syncSupplierConnection`) |
| Importer ma liste de stock | Foxway, Callisto, Foneday, MobileSentrix EU, 2Service, Mobilax… | Import de fichier existant (CSV / XLSX / XML / JSON), fournisseur pré-rempli |
| Ajouter le lien de mon flux | DistriHUB, ThePhoneHub, Foxway, Foneday | Flux distant autorisé existant (en-tête d'authentification chiffré) |
| Créer mon compte / Demander l'accès | Comptes non connectés | Page d'inscription du fournisseur ; e-mail de demande prêt à envoyer (aucun envoi automatique) |
| Consulter sur leur site | gsmExchange, Merkandi | Aucun accès automatisé : consultation manuelle |
| Déconnecter | Administrateur | Identifiants supprimés ; les offres déjà reçues restent dans l'historique |

## Logos

Le logo est l'icône que le fournisseur publie lui-même sur son site (favicon). Il est servi par le
service public d'icônes de Google (`google.com/s2/favicons`), sans aucun fichier de logo copié dans
l'application. À défaut d'icône, l'application affiche les initiales du fournisseur. Une mention
précise que les logos servent uniquement à identifier les fournisseurs : ils restent la propriété de
leurs titulaires et n'indiquent aucun partenariat.

## Serveur

| Route | Rôle |
|---|---|
| `GET /sourcing/accounts` | Comptes pro avec leur statut réel, sources publiques actives, totaux d'offres par origine |
| `POST /sourcing/accounts/connect` | `{ key, credentials }` : connexion API (rédacteur) |
| `POST /sourcing/accounts/sync` | `{ connectionId }` : synchronisation (rédacteur) |
| `POST /sourcing/accounts/disconnect` | `{ connectionId }` : déconnexion (administrateur) |

Fichiers :

- `src/domain/sourcing/pro-accounts.ts` : liste et ordre des comptes, origine d'une offre, logo.
- `src/services/sourcing/pro-accounts.ts` : statut, connexion, synchronisation, déconnexion.
- `simpleSupplierSearch` : ajoute `access` et `domain` à chaque offre.

Aucune table ni migration n'a été ajoutée : tout repose sur les tables existantes
(`suppliers`, `supplier_sources`, `supplier_connections`, `supplier_connection_secrets`,
`sourcing_offers`).

## Limites

- Les conditions affichées (Kbis, TVA, minimum de commande…) viennent de l'étude du 15/10/2026, qui
  s'appuie sur des extraits de recherche. Elles sont à confirmer avec chaque fournisseur.
- Foxway, Callisto, Foneday et MobileSentrix n'ont pas d'API documentée publiquement. On passe par
  leur liste de stock ou leur flux tant qu'ils ne fournissent pas de documentation.
- Un fournisseur est rattaché à son compte par son site, sinon par son nom. Un fournisseur créé à la
  main sous un autre nom et sans site ne sera pas reconnu.
