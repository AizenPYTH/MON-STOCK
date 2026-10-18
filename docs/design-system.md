# MON STOCK — design system v5 « Instrument »

Direction issue du handoff Claude Design « MON STOCK v5 Instrument » (prototype HTML + spécification),
intégrée dans l'application réelle (`apps/mobile`). **Le code fait foi** :

- jetons : `apps/mobile/src/theme/tokens.ts` ;
- typographie : `apps/mobile/src/theme/typography.ts` ;
- mouvement : `apps/mobile/src/components/ui/motion.tsx` (Reanimated 4) ;
- composants « instrument » : `apps/mobile/src/components/ui/instrument.tsx` ;
- autres composants : `apps/mobile/src/components/ui/*`.

## 1. Direction : la vitre et le papier

- **La scène nuit** (haut de chaque écran) porte LE chiffre de l'écran en grands chiffres fins et au
  plus un graphique-signature.
- **Le papier** (corps clair `#F2F4F7`) remonte de 24 pt sur la scène (rayon 24) et porte les listes :
  cartes blanches à filet, **sans ombre**.
- **La couleur est un signal** : menthe = action / positif sur nuit ; vert = marge positive sur
  papier ; ambre = demande une action ; rouge = perte, rupture, erreur ; bleu = information.
- **Signature : le code-barres du stock** — une barre par référence, largeur = ventes 30 j, couleur =
  niveau (blanc en stock, ambre faible, rouge rupture).

Données honnêtes (inchangé) : chiffre nu = certain ; « ≈ » = estimation (atténué devant le chiffre) ;
« — » = inconnu, jamais 0 ; « provisoire » = marge sans tous les coûts ; l'âge d'un prix est affiché.

## 2. Couleurs (ajouts v5)

| Jeton | Valeur | Rôle |
| --- | --- | --- |
| `nightLine` / `nightStroke` | rgba(247,248,250,0.10 / 0.14) | Filets et contours sur la scène |
| `ink4` | #9AA6B6 | Chevrons discrets |
| `dangerLine` | #F3D2D2 | Bordure d'un encadré d'erreur |
| `barOk` / `barDay` / `barTodayBg` | blanc 86 % / blanc 26 % / menthe 16 % | Code-barres, 14 jours, jour en cours |
| `demoInk` / `demoBg` | ambre | Badge « DÉMO » |
| `overlay` | rgba(10,20,32,0.45) | Voile des feuilles |

Les clés v4 sont conservées. Menthe jamais en texte sur blanc ; ambre et rouge en texte → `*Ink`.

## 3. Typographie

Polices embarquées (imports par graisse : seules les graisses utilisées entrent dans l'application) :
Manrope 300/500/600/700/800 et Geist Mono 500/600 (OFL, `@expo-google-fonts/geist-mono`).

| Variante | Style | Usage |
| --- | --- | --- |
| `figureXL` / `figure` / `figureMd` / `figureSheet` / `figureSm` | Manrope 300, 68 → 30 | Chiffres de scène et de feuille (`StageFigure`) |
| `title1` / `title2` / `cardTitle` / `headline` | Manrope 800/700 | Titres |
| `stat` / `price` | 700 / 800 | Relevés, prix |
| `body` / `bodyRegular` / `label` / `note` | 600 / 500 / 600 / 600 | Texte |
| `mono` / `monoSm` / `code` | Geist Mono 500, capitales pour `mono*` | Titres de section, étiquettes de relevés, SKU, âges |

Chiffres tabulaires partout (`num`). Taille système jusqu'à ×1,4 (×1,1–1,2 pour les chiffres de scène).

## 4. Espace, rayons, élévation

Grille 4 pt ; marge d'écran 16 (12 sous 360 pt, 20 dès 430 pt). Rayons : badge 6 · contrôle 12
(compact 10) · carte 16 · papier et feuille 24. Ombres uniquement sur ce qui flotte (feuille, toast,
pouce du contrôle segmenté). Zones tactiles ≥ 44 pt ; bouton principal 52 pt.

## 5. Composants

| Composant | Rôle | Données |
| --- | --- | --- |
| `NightHeader` / `TabHeader` / `DetailHeader` (+ `stage`, `left`) | Scène : navigation, sur-titre mono, titre, chiffre, relevés, graphique | — |
| `StageFigure`, `CountingFigure` | Grand chiffre fin, unité réduite, « ≈ » atténué ; comptage 600 ms | Valeur réelle |
| `StageStats` | 2 à 4 relevés séparés par des filets, touchables | Valeurs réelles, « — » sinon |
| `Wordmark`, `DemoBadge` | Mot-symbole 5 barres ; organisation de démonstration | `organization.isDemo` |
| `StockBarcode` | Code-barres du stock ; > 60 barres → barre « autres » ; toucher filtre | `v_stock_overview.units_30d` |
| `DayBars` | CA des 14 derniers jours ; jour en cours en contour menthe | `v_daily_sales` |
| `MarketRuler` | Coût rendu face à la médiane du marché (−40 % … +20 %), revente ; pointillé sans comparaison | `deal.totalCost`, `marketPrice`, `resalePrice` |
| `MarginWaterfall` | Cascade de marge, barres ∝ montant / revente | `e.breakdown` (radar) ou analyse « bonne affaire » |
| `ScoreBar` | Score /100 | `deal.score` / `evaluation.score` |
| `PriorityCard` | Rupture la plus coûteuse + meilleure offre rapprochée + brouillon (confirmé) | `radar.restock`, `radar.items` |
| `Segmented` | Contrôle segmenté à pouce unique glissant | — |
| `SplitBar` | Répartition animée vers les vrais comptes ; immobile sur un échec | Comptes d'import |
| `Timeline` | Frise verticale : fait / en cours / échec / à venir | États confirmés par le serveur |
| `OfferCard` / `OfferAnalysisSheet` | Offre à règle de marché ; feuille d'analyse | `SimpleRankedOfferDTO` + `deal` |
| `MonoTitle` | Titre de section mono + compteur + lien | — |

## 6. Mouvement (`motion.tsx`, Reanimated 4)

Courbes : `instrument` (0.22,1,0.36,1), `sheet` (0.32,0.72,0,1), `press` (0.3,0,0.5,1), `exit`.
Durées : press 90 · quick 160 · base 240 · indicateur d'onglet 280 · move 320 · sheet 360 ·
progress 420 · figure 600 · décalage 18/30/40 ms plafonné à 8 éléments.

- Barre d'onglets : indicateur menthe unique qui glisse ; écran entrant en fondu + 6 pt.
- Appui : `PressScale` (0,98 ; tuiles 0,96) ; favori : rebond 1,3 → 1 + haptique + confirmation.
- Barres (code-barres, 14 jours, répartition, cascade, score) : `scaleX` / `scaleY` depuis la base.
- « Réduire les animations » : tout est immédiat ; feuilles en fondu ; aucun comptage.
- Seuls `transform` et `opacity` sont animés ; aucune boucle hors chargement.

Écart assumé : la courbe `pop` du handoff (dépassement y > 1) n'est pas utilisée — elle bloque
l'animation sous Jest et rien ne garantit son comportement ; le rebond utilise `instrument`.
Piège connu : jamais `x.value` dans un objet `style` hors `useAnimatedStyle` ; utiliser `.set()`
dans les gestionnaires (compatibilité React Compiler).

## 7. Adaptations aux données réelles (aucune donnée inventée)

- « Hier à la même heure » n'existe pas côté serveur : l'accueil affiche « Hier, journée ».
- Couverture en jours : calculée sur l'appareil (stock ÷ ventes 30 j / 30), « — » sans vente.
- Rachat sur les lignes de stock : seulement si `radar.restock` a une offre rapprochée.
- La feuille d'analyse du Sourcing n'a ni « enregistrer » ni « brouillon » : ces actions exigent
  une offre rapprochée d'un SKU (écran Radar). Elle propose « Voir l'offre » et la fiche fournisseur.
- Le brouillon de commande ouvre toujours la feuille de quantité (rien n'est envoyé au fournisseur).
- Pendant une recherche, aucune progression par source n'est simulée (l'API ne la renvoie qu'à la fin).

## 8. Accessibilité et petits écrans

Libellés sur toutes les actions ; le code-barres est annoncé (« Stock : N références, X en rupture
représentant Y % des ventes… ») ; les chiffres animés annoncent leur valeur finale. Sous 360 pt :
chiffre de scène réduit, raccourcis en 2 × 2, libellés de relevés abrégés, « Brouillon » court.

## 9. Contrôle visuel

Aperçu web (react-native-web) avec base de démonstration et réponses produites par les vraies
fonctions serveur — voir `docs/MOBILE.md`. Proche d'iOS sans être identique (polices, flous,
ajustement automatique du texte) : une vérification sur iPhone reste nécessaire.

```bash
npx tsx --conditions=react-server scripts/preview-api-fixtures.ts
cd apps/mobile
bash preview/export-web.sh <node_modules contenant react-native-web@0.21.2> /tmp/web-dist
node preview/capture.mjs /tmp/web-dist /tmp/shots "/today#full" "/sourcing?q=iphone%2013#full"
```

`metro.config.js` ne remplace Supabase et l'API que si `MONSTOCK_PREVIEW=1` : une build normale
n'est pas concernée.
