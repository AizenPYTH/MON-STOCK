# Analyse « bonne affaire » des offres fournisseurs

Objectif : repérer les offres qui valent réellement la peine d'être achetées pour être revendues,
au lieu de simplement consulter des catalogues.

Règle de base : **une offre n'est une bonne affaire que si elle est comparée à un produit
réellement équivalent ET que la marge reste positive après les coûts.** Dans le doute, l'offre
est classée « Données insuffisantes » : une fausse bonne affaire coûte plus cher qu'une affaire
manquée.

Code :

- `src/domain/sourcing/deal-analysis.ts` : module pur, partagé serveur / application.
- `src/services/sourcing/simple-search.ts` : `computeDeals`, `loadDeals`.
- Écran mobile `apps/mobile/src/app/(app)/(tabs)/sourcing.tsx` : `DealLines`, `bestDeals`.
- Tests :
  - `tests/unit/deal-analysis.test.ts` : 26 tests ;
  - `tests/unit/simple-supplier-search.test.ts` ;
  - `apps/mobile/tests/suppliers-search.test.tsx`.

## Ce que chaque offre affiche (onglet Fournisseurs)

| Donnée | Source | Si inconnue |
|---|---|---|
| Prix fournisseur | Prix relevé, converti dans la devise de l'organisation (taux BCE) | « — » |
| Prix de marché estimé | Médiane des annonces eBay équivalentes (au moins 3), sinon médiane des autres fournisseurs (au moins 2, signalé « prix de gros ») | « — » et « Données insuffisantes » |
| Coût total d'achat | Prix + TVA non récupérable + port fournisseur ÷ quantité minimum + douane hors UE | Coût non ajouté, listé « à compléter » |
| Prix de revente estimé | Vos ventes réelles (moyenne 30 j), sinon votre prix de vente, sinon le bas du marché (1er quartile des annonces eBay) | « Données insuffisantes » |
| Marge € et % | Revente − coût total − TVA sur marge − commission − paiement − expédition − emballage − provision retours | « provisoire » si des coûts manquent |
| Niveau | Très intéressant / Intéressant / Moyen / Non compétitif / Données insuffisantes | — |
| À vérifier | HT ou TTC inconnu, stock inconnu, rupture, occasion et grade, lot, conversion de devise, prix ancien, annonce de place de marché | — |

La vue **« Meilleures affaires »** classe les offres par niveau, puis par score, puis par marge.

## Équivalence stricte

Deux offres ne sont comparées que si tous les points suivants sont identiques :

1. **Marque et modèle.** iPhone 13 ≠ iPhone 13 Pro ≠ iPhone 13 mini.
2. **Type de produit.** Téléphone, écran, batterie, vitre arrière, châssis, caméra, haut-parleur,
   connecteur de charge, nappe, bouton, adhésif, coque, chargeur, outil, tiroir SIM, carte mère,
   clavier, verre trempé, autre pièce. Les mots-clés sont en FR, EN, ES, IT, PL, CS, NL et DE.
3. **Qualité de pièce.** Soft OLED, hard OLED, OLED, Incell, TFT, origine, compatible, haute
   capacité. Un écran OLED n'est jamais comparé à un Incell.
4. **Pour un téléphone :** capacité connue et identique, état connu et identique, grade identique.
   Un grade mixte (« A/B », « A+/A ») est un assortiment : il n'est jamais comparé au grade A.
5. **Pour une pièce :**
   - une pièce neuve se compare à une pièce neuve ou d'état non précisé (usage des grossistes) ;
   - une pièce d'occasion ou reconditionnée se compare uniquement au même état et au même grade ;
   - les pièces au nom générique (nappe, caméra, haut-parleur, etc.) doivent en plus avoir des mots
     descriptifs proches (au moins 50 %). La nappe du flash n'est jamais comparée à celle de
     l'écouteur.
6. **Jamais de lot.** Un prix de lot n'est pas comparable à un prix unitaire.
7. **Jamais de produit hors service.** Un produit hors service, pour pièces, bloqué iCloud, vendu
   « as is » ou non testé n'est jamais comparé à un produit fonctionnel (mots-clés en plusieurs
   langues, mots entiers).
8. **Jamais d'annonce multi-modèles.** Par exemple « Écran pour iPhone X XS XR 11 12 13 14… » : le
   prix affiché est celui de la variante la moins chère du sélecteur.

Corrections apportées après le test sur les données réelles du 14/10/2026 :

- « (100% battery) » décrit l'état d'un téléphone, pas une batterie.
- Les tiroirs SIM tchèques et espagnols, les blindages et les verres trempés sont reconnus comme
  des pièces.
- Les grades mixtes de Refreshed Apples ne sont plus confondus avec le grade A.

## Niveaux

| Niveau | Conditions |
|---|---|
| Non compétitif | Marge ≤ 0 après les coûts, ou coût au-dessus du marché |
| Très intéressant | Marge ≥ 20 % **et** ≥ 20 % sous le marché **et** prix récent **et** pas de rupture **et** HT/TTC connu **et** tous les coûts renseignés |
| Intéressant | Marge ≥ 10 % et ≥ 8 % sous le marché, ou « très intéressant » avec une offre peu fiable (rupture, prix ancien) |
| Moyen | Marge positive sous les seuils, **ou marge provisoire** : un coût n'est pas renseigné, donc la marge « après les coûts » n'est pas établie |
| Données insuffisantes | Pas d'équivalent fiable, pas de prix de revente, lot ou produit mal identifié |

## Score de rentabilité (0 à 100)

Le score se compose de quatre parts :

- Marge : jusqu'à 35 points (plein à 40 % de marge).
- Écart au marché : jusqu'à 25 points.
- Fiabilité : jusqu'à 20 points (prix récent, HT/TTC connu, stock communiqué, source API ou flux).
- Disponibilité réelle : jusqu'à 20 points.

Pénalités : −4 si la marge est provisoire, −5 si le marché est estimé sur des prix de gros.

## Exploitation

- `POST /cron/deal-check` (secret cron) accepte `{organizationId, userId, query, live}`. Il exécute
  la recherche au nom d'un membre et résume les niveaux et les 15 meilleures offres.
- La source **eBay France** (API officielle Buy Browse) a été activée le 14/10/2026. Elle fournit
  les annonces de revente qui servent de prix de marché et de prix de revente.
- Les paramètres de coûts se renseignent dans l'application : Radar → Paramètres (TVA, commission,
  paiement, expédition, emballage, retours, douane). Tant qu'ils sont vides, toutes les marges sont
  « provisoires » et aucune offre ne dépasse « Moyen ».

## Vérification en production (14/10/2026, projet `ccywsegdowikeirbsfae`, organisation Snowolff)

Contrôles exécutés par `/cron/deal-check` sur des recherches réelles, avec eBay France activé.

| Recherche | Offres | Comparées à des équivalents eBay | Résultat |
|---|---|---|---|
| iPhone 13 | 270 | 12 | 4 « moyen » (marges provisoires de 3 à 16 %), 8 « non compétitif », 258 « données insuffisantes » |
| Écran iPhone 12 | 32 | 0 | Annonces eBay multi-modèles écartées ; aucun équivalent fiable |
| Batterie iPhone 11 | 26 | 6 | Batterie Brico-phone à 28,90 € « non compétitive » face aux batteries d'origine eBay (environ 21,50 €) |

Chaque piège ci-dessous a été corrigé puis couvert par un test :

| Piège constaté | Correction |
|---|---|
| Un iPhone « hors service » ressortait « intéressant » face à des téléphones fonctionnels | Détection des produits hors service, pour pièces, bloqués ou vendus en l'état |
| Des annonces « Écran pour iPhone X … 16 » se comparaient entre elles | Exclusion des annonces multi-modèles |
| « (100% battery) » classait un téléphone parmi les batteries | L'état de batterie d'un appareil n'est plus lu comme une batterie |
| Les grades mixtes « A/B » étaient lus comme un grade A | Grades mixtes traités comme un assortiment |
| « Batterie prime … réglages d'origine » était lue comme une batterie d'origine | « prime » reconnu comme une qualité compatible |
| eBay n'était jamais interrogé (limite de 10 sources par recherche) | Places de marché interrogées en premier |

Limites connues :

- La plupart des offres restent « Données insuffisantes ». Les téléphones viennent presque tous d'un
  seul grossiste (Refreshed Apples, dont les grades sont mixtes), et eBay ne renvoie qu'une trentaine
  d'annonces par recherche.
- Les paramètres de coûts ne sont pas encore renseignés : toutes les marges sont provisoires et
  plafonnées à « Moyen ». **À compléter dans Radar → Paramètres.**
- Le prix de marché eBay est le prix affiché, sans les frais de port de l'acheteur.
