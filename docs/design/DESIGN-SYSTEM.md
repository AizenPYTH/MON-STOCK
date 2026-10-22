# MON STOCK web — système de design « Instrument »

Référence pour le web (Next.js, Tailwind v4). Le code fait foi :

- jetons : `src/app/globals.css` (blocs `@tokens:*`) ;
- composants : `src/components/ui/*` (génériques) et `src/components/instrument/*` (signatures de la charte) ;
- démonstration : `/dev/design-system` (développement uniquement, 404 en production ; `?view=compare` montre clair et sombre) ;
- garde-fous : `tests/unit/design-tokens.test.ts` (contrastes, parité des thèmes, aucune couleur littérale dans le kit).

L'app iPhone partage l'ADN (`apps/mobile/src/theme/tokens.ts`, en lecture seule ici).

## 1. Direction

- **Scène nuit et papier.** Bleu nuit `#101C2C` pour la scène (en-tête porteur du chiffre de la page) et la navigation ; papier clair `#F2F4F7` pour les listes ; cartes blanches à filet fin **sans ombre**.
- **La couleur est un signal**, jamais une décoration : menthe = bon / action principale, ambre = action requise, rouge = rupture / perte / erreur, bleu = information. Tout le reste est neutre.
- **Chiffres** en `tabular-nums` partout ; **mono** (Geist Mono) pour les codes (SKU), les étiquettes de relevés et les titres de section en capitales.
- **Données honnêtes** : chiffre nu = certain ; « ≈ » = estimation ; « — » = inconnu (jamais 0) ; « provisoire » = marge sans tous les coûts ; âge d'un prix visible ; badge « DÉMO ».

## 2. Thèmes

| Mécanisme | Effet |
| --- | --- |
| aucun attribut | suit `prefers-color-scheme` |
| `<html data-theme="light">` | clair forcé |
| `<html data-theme="dark">` | sombre forcé |
| `data-theme` sur un conteneur | thème local (aperçus, démonstration) |

En sombre, la scène devient plus profonde que le papier (`--night` `#0A111B` < `--background` `#0F1823` < `--surface` `#151F2C`) : la navigation reste « la scène », le contenu remonte vers la lumière. Menthe, ambre et rouge gardent leur teinte ; les encres d'état s'éclaircissent.

**Branchement (layout racine, à faire par le lot « layout »)** : `<html … suppressHydrationWarning>` puis `<head><ThemeScript /></head>` (`src/components/ui/theme-script.tsx`) — script bloquant, aucun flash, autorisé par la CSP actuelle (`'unsafe-inline'`). Le sélecteur `<ThemeToggle />` (`src/components/ui/theme-toggle.tsx`, `variant="segmented" | "icon"`, `onNight`) enregistre le choix dans localStorage **et** dans le cookie `ms-theme` (accès protégés par try/catch) et se synchronise entre onglets. `viewport.themeColor` (#101C2C) reste valable dans les deux thèmes.

Les deux blocs sombres de `globals.css` (media query et attribut) doivent rester identiques : le test le vérifie.

## 3. Jetons

Classe Tailwind = `bg-`/`text-`/`border-` + nom. Les noms historiques sont conservés (≈ 70 pages) ; les alias sémantiques sont ajoutés.

### Fonds et surfaces

| Jeton | Clair | Sombre | Usage |
| --- | --- | --- | --- |
| `background` | #F2F4F7 | #0F1823 | papier (fond de page) |
| `surface` | #FFFFFF | #151F2C | surface 1 : cartes, tableaux, champs |
| `surface-2` | #F7F8FA | #19242F | surface 2 : en-tête de tableau, ligne survolée, zone en retrait |
| `surface-3` (= `surface-muted`, `line-soft`) | #EEF1F5 | #1F2B3A | surface 3 : pastilles neutres, survol discret |
| `selection` | #E8EBF0 | #22324A | ligne / élément sélectionné |
| `inverse` / `on-inverse` | #101C2C / #F7F8FA | #E9EEF4 / #0F1823 | aplat contrasté sur papier (puce sélectionnée, bouton `dark`) |
| `night`, `night-deep`, `night-raised`, `night-hover` | #101C2C… | #0A111B… | scène et navigation |
| `overlay` | nuit 45 % | noir 66 % | voile des modales |

### Bordures

`border` (filet fin des cartes), `border-strong` (séparation, boutons secondaires), `border-control` (contour des champs, **≥ 3:1**), `line-soft` (filet intérieur), `night-line` / `night-stroke` (sur la scène).

### Texte

| Rôle | Jeton (alias) | Clair | Sombre |
| --- | --- | --- | --- |
| primaire | `foreground` (`fg`) | #17212F | #E9EEF4 |
| secondaire appuyé | `muted-strong` | #3E4A5B | #C7D0DB |
| secondaire | `muted` (`fg-muted`) | #566272 | #A6B1BF |
| tertiaire (étiquettes mono, métadonnées) | `ink-3` (`fg-subtle`) | #5F6B7C | #95A1B2 |
| désactivé / décoratif | `ink-4` (`fg-disabled`) | #9AA6B6 | #5E6B7D |

`ink-3` a été assombri (#778292 → #5F6B7C) : il passait sous 4,5:1 alors qu'il porte de vrais libellés.

### Interaction

`interactive` / `interactive-hover` (liens dans le texte, variante `link`), `interactive-soft` (fond de sélection de texte), `ring` (focus, ≥ 3:1), `accent` (historique : marque de sélection).

### États

Pour `success`, `warning`, `danger`, `info` : `<ton>` = `<ton>-ink` (texte), `<ton>-soft` (fond), `<ton>-line` (bordure), `<ton>-strong` + `on-<ton>-strong` (aplat plein, texte dessus). Signaux (points, barres, jamais du texte sur papier) : `mint`, `amber`, `red`, `danger-on-night`.

### Élévations, rayons, espacement, typographie, mouvement

- **Ombres** (seulement ce qui flotte) : `shadow-raised` (pouce, barre collante), `shadow-floating` (menu, toast), `shadow-modal` (dialogue, panneau). En sombre, elles s'accompagnent d'un filet clair à 3–6 %.
- **Rayons** (échelle de l'app iPhone) : `rounded-badge` 6 · `rounded-control` 10 · `rounded-field` 12 · `rounded-card` 16 · `rounded-sheet` 24. Les rayons Tailwind par défaut (`rounded-md` 6, `rounded-xl` 12, `rounded-2xl` 16, `rounded-3xl` 24) restent valides et équivalents.
- **Espacement** : grille de 4 px de Tailwind ; `px-gutter` (16 px, 32 dès 640 px) pour la marge de page, `gap-section` / `space-y-section` (24 → 32 px) entre sections.
- **Typographie** : `text-display` 40/46 · `text-h1` 28/34 · `text-h2` 20/26 · `text-h3` 15/20 · `text-body` 14/20 · `text-small` 13/18 · `text-caption` 12/16 · `text-mono-label` 10,5/14 (+ `ms-mono`). Les classes de titre portent graisse et approche ; ne pas les combiner avec `leading-*`/`tracking-*` (ces derniers gagneraient).
- **Mouvement** : `--duration-press` 90 · `fast` 160 · `base` 240 · `slow` 320 · `sheet` 360 · `progress` 420 ms ; courbes `ease-instrument` (entrées), `ease-sheet` (panneaux), `ease-standard` (états). Animations prêtes : `ms-fade`, `ms-pop`, `ms-slide`, `ms-grow-x/y`, `ms-pulse`, `ms-skeleton`.

## 4. Contrastes mesurés (WCAG 2.2)

Calculés à partir de `globals.css` (même calcul que le test unitaire). Texte : 4,5:1 ; focus et contour de champ : 3:1.

| Texte / élément | Fond | Clair | Sombre | Seuil |
| --- | --- | --- | --- | --- |
| `foreground` | `background` | 14.72 | 15.32 | 4,5 |
| `foreground` | `surface` | 16.22 | 14.24 | 4,5 |
| `muted-strong` | `surface` | 8.99 | 10.66 | 4,5 |
| `muted` | `surface` | 6.20 | 7.64 | 4,5 |
| `muted` | `surface-3` | 5.47 | 6.60 | 4,5 |
| `ink-3` | `surface` | 5.41 | 6.34 | 4,5 |
| `ink-3` | `background` | 4.91 | 6.82 | 4,5 |
| `ink-3` | `surface-3` | 4.78 | 5.47 | 4,5 |
| `ink-3` | `selection` | 4.53 | 4.94 | 4,5 |
| `interactive` | `surface` | 6.59 | 7.78 | 4,5 |
| `interactive` | `background` | 5.98 | 8.36 | 4,5 |
| `success` | `surface` | 5.67 | 10.02 | 4,5 |
| `success` | `success-soft` | 5.04 | 9.20 | 4,5 |
| `warning` | `surface` | 6.30 | 9.30 | 4,5 |
| `warning` | `warning-soft` | 5.63 | 8.93 | 4,5 |
| `danger` | `surface` | 6.22 | 8.52 | 4,5 |
| `danger` | `danger-soft` | 5.31 | 8.57 | 4,5 |
| `info` | `surface` | 7.93 | 8.99 | 4,5 |
| `info` | `info-soft` | 6.93 | 8.49 | 4,5 |
| `on-success-strong` | `success-strong` | 4.97 | 12.97 | 4,5 |
| `on-warning-strong` | `warning-strong` | 7.90 | 8.73 | 4,5 |
| `on-danger-strong` | `danger-strong` | 5.98 | 5.00 | 4,5 |
| `on-info-strong` | `info-strong` | 6.09 | 5.06 | 4,5 |
| `on-inverse` | `inverse` | 16.14 | 15.32 | 4,5 |
| `night` | `mint` | 11.75 | 12.97 | 4,5 |
| `on-night` | `night` | 16.14 | 17.82 | 4,5 |
| `on-night-muted` | `night` | 6.94 | 7.67 | 4,5 |
| `on-night-subtle` | `night` | 5.51 | 6.09 | 4,5 |
| `mint` | `night` | 11.75 | 12.97 | 4,5 |
| `amber` | `night` | 7.90 | 8.73 | 4,5 |
| `danger-on-night` | `night` | 8.61 | 9.51 | 4,5 |
| `on-night` | `night-raised` | 12.18 | 14.18 | 4,5 |
| `ring` | `surface` | 5.40 | 6.52 | 3 |
| `ring` | `background` | 4.90 | 7.02 | 3 |
| `ring` | `night` | 3.18 | 7.44 | 3 |
| `border-control` | `surface` | 3.44 | 3.55 | 3 |
| `border-control` | `background` | 3.12 | 3.81 | 3 |

`ink-4` (désactivé) n'est pas tenu au contraste : ne jamais lui confier une information.

## 5. Composants

| Composant | Fichier | Quand l'utiliser |
| --- | --- | --- |
| `Button`, `ButtonLink`, `buttonClasses` | ui/button | Variantes `primary` (une par zone) · `secondary` · `ghost` · `danger` · `link` · `dark` (plein contrasté sur papier) · `night` (sur la scène). Tailles `sm` 32 (40 au doigt) · `md` 40 · `lg` 48 · `xl` 52. `loading` + `loadingText` (désactivé, `aria-busy`), `iconOnly` (+ `aria-label`). |
| `SubmitButton` | ui/submit-button | Soumission d'une Server Action ; attente gérée par `useFormStatus` ; `confirmMessage` pour les actions destructives. |
| `Badge`, `StatusDot` | ui/badge | Étiquette courte (catégorie, compteur). `size` `sm`/`md`. |
| `StatusBadge` | ui/status-badge | **Tout statut** (stock, synchro, commande) : icône + texte. Tons `success`/`warning`/`danger`/`info`/`neutral`/`pending`, `variant="plain"` en cellule. |
| `Card`, `CardHeader`, `CardContent`, `CardFooter` | ui/card | Bloc de contenu sur le papier ; `interactive` pour une carte cliquable. |
| `Table`, `THead`, `TBody`, `TR`, `TH`, `TD` | ui/table | Listes. `density` `comfortable`/`compact`, `stickyHeader` (true ou hauteur CSS), `stackOnMobile` (cartes sous 640 px : `TD label` + `TD primary`), `caption`. Chiffres : `align="right"` ou `numeric`. Sélection : `TR aria-selected`. |
| `Field`, `Input`, `Select`, `Textarea`, `Checkbox`, `Label`, `FormError`, `FormSuccess` | ui/form | Formulaires ; `Field` relie indice / erreur au contrôle. |
| `Toolbar`, `ToolbarGroup`, `FilterBar`, `SearchInput` | ui/toolbar | Au-dessus d'une liste : recherche et filtres à gauche, actions à droite ; `FilterBar` résume (`summary`) et propose « Réinitialiser » (`resetHref` + `active`). |
| `LinkTabs` | ui/tabs | Sous-pages d'une section (liens). |
| `Pagination` | ui/pagination | Bas de tableau paginé. |
| `Dialog` | ui/dialog | Modale native ; `description`, `footer` (actions collées en bas), `size` `sm`–`xl` ; feuille en bas d'écran sous 640 px. |
| `ToastProvider`, `useToast` | ui/toast | `success` / `error` / `info` après réponse du serveur seulement. |
| `PageHeader`, `Section`, `DescriptionList`, `ComingSoon` | ui/page | Motifs de page (réexporte aussi les composants ci-dessous). |
| `SectionHeader` | ui/section-header | Titre de section sur le papier (+ `count`, `actions`, `eyebrow`). Titre mono capitales : `MonoTitle`. |
| `StatTile` (+ `Stat` historique) | ui/stat-tile | Indicateur : valeur, `unit`, `approx`, `delta` (icône + texte, ton explicite), `hint`, `href`. Inconnu → « — ». |
| `Callout`, `Alert` | ui/callout | Encadré contextuel statique (`Callout`) ou message consécutif à une action (`Alert`, annoncé). Icône par ton. |
| `EmptyState` | ui/empty-state | Liste vide : ce qui manque + LA prochaine action réelle (`action`, `secondaryAction`), `variant="plain"` dans une carte. |
| `ErrorState` | ui/error-state | Échec de chargement : quoi, ce qui est conservé, `action` (réessayer), `details` (référence). |
| `Skeleton`, `SkeletonText`, `TableSkeleton`, `PageHeaderSkeleton`, `StatTileSkeleton`, `LoadingRegion` | ui/skeleton | `loading.tsx` : forme du contenu, région annoncée. |
| `Kbd` | ui/kbd | Raccourci clavier (papier ; `onNight` sur la scène). |
| `ThemeToggle`, `ThemeScript`, `useThemePreference` | ui/theme-toggle, ui/theme-script | Préférence de thème. |
| `Scene`, `Paper`, `SceneHeader`, `StageStats`, `Panel`, `StageFigure`, `CountingFigure`, `MonoTitle`, `MonoLabel`, `FilterChip`, `Segmented`, `LevelDot`, `ToneIcon`, `StockBarcode`, `DayBars`, `MarketRuler`, `MarginWaterfall`, `ScoreBar`, `SplitBar`, `SidePanel` | instrument/* | Signatures de la charte (inchangées dans leur API). |

## 6. Motifs de page

1. **Page avec scène** : `<Scene><SceneHeader … /><StageFigure /> + un graphique</Scene><Paper>…</Paper>`.
2. **Page liste sur papier** : `PageHeader` → `LinkTabs` (si sous-pages) → `Toolbar` / `FilterBar` (+ `FilterChip`) → `Table` (`stackOnMobile` si les colonnes s'y prêtent) → `Pagination`. Vide : `EmptyState` à la place du tableau ; erreur : `ErrorState` ; chargement : `LoadingRegion` + `PageHeaderSkeleton` + `TableSkeleton`.
3. **Tableau de bord** : rangée de `StatTile` (`grid sm:grid-cols-2 lg:grid-cols-4 gap-3`), puis `Card`/`Panel` par sujet avec `SectionHeader` ou `MonoTitle`.
4. **Formulaire** : `Card` + `CardHeader` + `Field`s en grille + `CardFooter` (Annuler en `ghost`, puis `SubmitButton`). Erreur globale : `FormError` en tête.

## 7. Règles

**Couleur et thème.** Aucune couleur littérale (`#…`, `rgba()`, `text-red-800`, `bg-white`…) : uniquement les jetons. Pour un aplat contrasté sur papier, `bg-inverse text-on-inverse` (et non `bg-night`, réservé à la scène, ni `bg-foreground text-on-night`, illisible en sombre). Texte sur un aplat d'état : `bg-<ton>-strong text-on-<ton>-strong` (et non `text-white`).

**Accessibilité.** Focus visible partout (contour `ring`, décalé de 2 px). Cibles ≥ 40 px au doigt (`pointer-coarse:`). Champs à 16 px au doigt (pas de zoom iOS). Un statut n'est jamais porté par la seule couleur (icône + texte). Les erreurs de champ sont reliées (`aria-describedby`) et annoncées. Les icônes décoratives ont `aria-hidden`. Les boutons-icônes ont un `aria-label`.

**Mouvement.** Uniquement `transform` et `opacity` ; 90–420 ms ; tout devient immédiat avec « réduire les animations ». Pas d'animation en boucle, sauf indicateur d'attente.

**Données honnêtes.** Inconnu = « — » (`StatTile`, `Unknown`), jamais 0. Estimation = « ≈ » (`approx`, `Approx`). Un succès ne s'affiche qu'après la réponse du serveur (`loading` / `aria-busy` pendant l'attente). Aucun faux bouton : une action indisponible est absente ou désactivée avec sa raison (`title`).
