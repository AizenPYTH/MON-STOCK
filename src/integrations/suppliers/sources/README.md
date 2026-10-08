# Sources publiques : ajouter un parser dédié

Chaque source publique autorisée dispose d'un dossier `src/integrations/suppliers/sources/<source-key>/` :

| Fichier       | Rôle                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `crawler.ts`  | (optionnel) liste des URLs / pagination propre à la source. Par défaut, `config.urls` de la source.    |
| `parser.ts`   | `SourceParser` : `parse(html, url) → RawOffer[]`. Pur, sans réseau, testé sur un HTML d'exemple.       |
| `mapper.ts`   | (optionnel) transformation des champs spécifiques (ex. libellés de grade de la source → grade canonique). |

Déclarez ensuite le parser dans `registry.ts` (`SOURCE_PARSERS`). Il devient sélectionnable
dans l'interface (« Sources & flux » → source publique → parser).

## Règles non négociables

1. **Accès autorisé uniquement.** L'utilisateur atteste dans l'interface avoir vérifié que les
   conditions d'utilisation du site autorisent l'accès automatisé (`automated_access_confirmed`).
   Sans attestation, la source n'est jamais crawlée.
2. **robots.txt respecté** (`services/sourcing/crawler/robots.ts`) : interdiction = refus, délai
   `Crawl-delay` appliqué, minimum 2 s entre deux requêtes, 1 requête à la fois par hôte.
3. **Jamais** de login, de cookies de session, de contournement de CAPTCHA, de paywall ou de
   protection anti-bot. Le crawler envoie un `User-Agent` identifiable (`SOURCING_USER_AGENT`).
4. **Rien n'est inventé.** Un champ absent de la page reste `null` (« Non communiqué »).
5. Les offres passent toujours par `ProductNormalizer → DataValidationService → OfferStorage`.

Le dossier `_template/` contient un squelette commenté. Le parser générique `jsonld`
(`services/sourcing/crawler/parsers/jsonld-parser.ts`) couvre les pages qui déclarent leurs
produits en JSON-LD schema.org et sert de parser par défaut.
