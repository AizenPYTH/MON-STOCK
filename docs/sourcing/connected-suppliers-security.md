# Sourcing B2B — sécurité et conformité

## Identifiants et secrets

| Règle | Mise en œuvre | Vérifié |
|---|---|---|
| Aucun mot de passe fournisseur demandé | Le formulaire de l'application ne demande que les champs déclarés par le connecteur (clé API, Client ID / Secret). Aucun formulaire générique « identifiant / mot de passe du site » | Code (`ConnectApiSheet`, `credentialFields`) |
| Chiffrement | AES-256-GCM (`encryptSecret`) dans `supplier_connection_secrets` / `supplier_feed_secrets` | Code ; tables sans politique RLS ni privilège pour `anon` / `authenticated` |
| Jamais renvoyés | Aucune route ne retourne les identifiants. Le DTO expose seulement les noms des champs | Tests `pro-accounts.test.ts` |
| Jamais sur l'appareil | Identifiants envoyés une seule fois au serveur, non conservés dans l'état ni dans AsyncStorage | Code |
| Pas dans les journaux | Aucun `log` du corps des requêtes ; les messages d'erreur passent par `scrubSecrets` (eBay) | Revue de `server/edge/api.ts` |
| Pas dans Git | Aucun secret ajouté ; workflow des logos sans secret | `git diff` |
| Déconnexion | Identifiants supprimés et connexion marquée déconnectée (administrateur). Les offres déjà reçues restent dans l'historique | Test mobile `entry-disconnect` |

## Isolation multi-organisation

- Le registre global (`supplier-directory.json`) ne contient aucune donnée privée.
- Fournisseurs, sources, connexions, offres et historiques portent un `organization_id`. La RLS est
  active sur ces tables, et chaque lecture du sourcing filtre en plus explicitement par
  organisation.
- `GET /sourcing/supplier-offers` : filtre par organisation **et** par fournisseur. Un identifiant
  de fournisseur d'une autre organisation ne renvoie rien (test `supplier-registry.test.ts`).
- Les tarifs d'un compte connecté ne servent qu'à son organisation. Aucun indice ni agrégat n'est
  partagé entre organisations.
- Rôles :
  - lecture pour les membres ;
  - connexion, synchronisation et import pour les rédacteurs ;
  - déconnexion pour les administrateurs.

## Collecte et conditions d'utilisation

- Pas de scraping contraire aux CGU.
  - Écartés : Utopya (CGV art. 14), B-Stock (robots interdits).
  - Consultation seule : gsmExchange, Merkandi.
- Pas de contournement de CAPTCHA, d'anti-bot ni de mur de connexion. Les sources publiques passent
  par robots.txt et une attestation des CGU à l'activation.
- Flux distants : HTTPS uniquement, protection SSRF (adresses privées, métadonnées cloud et
  redirections contrôlées : `http-ssrf.test.ts`), 20 Mo au plus.
- Fichiers importés : format détecté par le contenu et non par l'extension, taille limitée, aucune
  macro exécutée (XLSX lu comme données).

## Logos

- Récupérés uniquement sur le **site officiel** de chaque fournisseur, avec la source exacte notée
  dans `supplier-logos-manifest.json`.
- Aucun logo dessiné, généré ou approximatif. Les icônes trop pixellisées ou génériques sont
  écartées et remplacées par les initiales.
- Usage d'identification uniquement, avec une mention « aucun partenariat » dans l'application.
  Risque résiduel : les conditions de marque de chaque fournisseur ne sont pas lues
  individuellement. Retirer un logo sur demande se fait par la liste `REJECTED` du script.

## RGPD

- Aucune donnée personnelle dans le registre : uniquement des fiches d'entreprises.
- Favoris : clés de fournisseurs sur l'appareil, sans donnée personnelle.
- Journaux : identifiant d'organisation et de connexion, jamais de contenu d'identifiants.

## Ce qui n'a pas été fait (et pourquoi)

- **Aucune migration** créée ni appliquée.
- **Aucun déploiement** en production pendant cette mission (consigne). Les routes et l'annuaire
  enrichi attendent votre validation.
- **Aucun compte fournisseur** créé, aucun abonnement, aucune commande, aucun e-mail envoyé.
