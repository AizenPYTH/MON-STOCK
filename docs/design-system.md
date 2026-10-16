# MON STOCK — design system v4 « Bleu nuit + menthe, pilotage »

Ce document décrit la direction artistique de l'application mobile et les règles à suivre pour tout
nouvel écran. Le code fait foi :

- jetons : `apps/mobile/src/theme/tokens.ts` ;
- typographie : `apps/mobile/src/theme/typography.ts` ;
- composants : `apps/mobile/src/components/ui/*`.

## 1. Direction

L'identité v3 est conservée : bandeau bleu nuit et action menthe. La v4 lui ajoute la **profondeur
d'un logiciel de pilotage** :

- un fond « canvas » gris bleuté (`bg #F2F4F7`) ;
- des **cartes blanches à filet fin** (`line #E6EAF0`), avec une ombre très légère ;
- un seul bandeau sombre par écran ;
- des chiffres mis en avant par la typographie, pas par la couleur.

Le premium vient de la cohérence et de la hiérarchie. On n'accumule ni effets, ni dégradés, ni
ombres marquées.

Trois principes :

1. **Une action principale par contexte.** Elle prend la forme d'un bouton menthe. Les actions
   secondaires sont des boutons blancs à filet ou des lignes d'action.
2. **L'information d'abord, la technique ensuite.** Les détails (calcul de marge, fiche technique,
   questions au fournisseur) sont repliés ou placés dans un onglet.
3. **Données honnêtes.**
   - Un chiffre nu est certain, « ≈ » marque une estimation, « — » une donnée inconnue (jamais 0).
   - « Provisoire » signale une marge calculée sans tous les coûts.
   - L'âge d'une donnée est toujours affiché (« vu il y a 2 jours »).

## 2. Couleurs (rôle → jeton)

| Rôle | Jeton | Valeur | Règle |
|---|---|---|---|
| Marque, bandeau, navigation | `brand` | #101C2C | Une surface sombre par écran (bandeau, appel à l'action fort) |
| Action principale | `mint` / `onMint` | #8BE8BE / #101C2C | Jamais en texte sur blanc |
| Fond de l'application | `bg` (canvas) | #F2F4F7 | Sous toutes les cartes |
| Carte, panneau | `card` + `line` + `shadow.card` | blanc, filet #E6EAF0 | `cardStyle` |
| Texte principal / secondaire / tertiaire | `ink` / `ink2` / `ink3` | #17212F / #5B6676 / #778292 | |
| Succès, marge positive | `success` / `successSoft` | #1E7F57 | |
| Avertissement (demande une action) | `accent` / `accentSoft` / `accentInkOnSoft` | #E5A34D | En texte : `accentInkOnSoft` (contraste AA) |
| Erreur, rupture | `danger` / `dangerSoft` / `dangerInk` | #DC5A5A | En texte : `dangerInk` |
| Information (neutre) | `info` / `infoSoft` / `infoInk` | #3567C4 | Sources publiques, réapprovisionnement |
| Rail (segmenté, progression) | `track` | #E4E8EE | |
| Chargement | `skeleton` / `skeletonStrong` | | |

Rentabilité : `dealTone` associe chaque niveau à une couleur, **une icône et un libellé** (la couleur
n'est jamais seule).

| Niveau | Badge |
|---|---|
| Très intéressant | plein vert, flèche montante |
| Intéressant | vert clair |
| Moyen | gris, tiret |
| Non compétitif | rouge clair, flèche descendante |
| Données insuffisantes | contour pointillé, point d'interrogation |

## 3. Typographie (Manrope embarquée)

| Variante | Taille / interligne / graisse | Usage |
|---|---|---|
| `hero` | 40/44 800 | Chiffre clé du bandeau |
| `title1` | 26/32 800 | Titre d'écran |
| `title2` | 20/26 800 | Titre de fiche (fournisseur) |
| `headline` | 17/22 700 | Titre de bloc |
| `price` | 18/22 800 | Prix et montants mis en avant |
| `kpi` / `kpiSm` | 24 / 17 800 | Indicateurs |
| `body` | 15/20 600 | Texte courant, titres de ligne |
| `label` | 13/18 600 | Métadonnées |
| `section` | 12/16 800, capitales espacées | Titres de section |
| `micro` | 11/14 700 | Libellés de chiffres, badges |

Tous les nombres utilisent des chiffres tabulaires (`num`). Le texte suit la taille système jusqu'à
×1,4.

## 4. Composants

Ils sont exportés par `~/components/ui`.

| Composant | Rôle |
|---|---|
| `Screen`, `TabHeader`, `DetailHeader` | Écran : bandeau nuit + corps canvas qui remonte de 22 pt |
| `Card`, `cardStyle` | Carte blanche à filet. `style` s'applique au contenu (gap, direction) |
| `SectionHeader` (titre, compteur, action) | Titre de section en capitales, avec lien d'action |
| `ActionRow` | Ligne actionnable : pictogramme teinté, titre, détail, valeur, action. Sert aux alertes, tâches, réglages, méthodes d'accès et erreurs d'import |
| `MetricStrip` | Bande de 2 à 4 chiffres réels. En grille 2 × 2 sur petit écran ; « — » si inconnu |
| `ShortcutTile` / `ShortcutGrid` | Raccourcis vers des fonctions réelles. Une seule tuile `accent` (sombre) par grille |
| `IconBadge` | Pictogramme dans un carré teinté (`danger`, `warning`, `info`, `success`, `neutral`, `brand`) |
| `StatusLine` | Point + libellé (le statut n'est jamais un point seul) |
| `DealBadge` | Niveau de rentabilité (icône + libellé) |
| `ProgressBar`, `SplitBar`, `StepBar` | Progression, répartition chiffrée avec légende, étapes d'un parcours |
| `Collapsible` | Section repliable (détails techniques) |
| `Segmented`, `FilterChip` | Onglets et tris ; filtres avec compteurs |
| `Button` | `primary` (menthe), `secondary` (blanc à filet), `ghost`, `destructive` |
| `BottomSheet` | Feuille : confirmations, filtres, configuration d'API |
| `EmptyState`, `ErrorState`, `Skeleton`, `SkeletonList`, `Toast` | États particuliers |
| `OfferCard` / `OfferLine` / `OfferLines` | Vues détaillée et compacte d'une offre fournisseur (`components/offer-result.tsx`) |
| `SupplierLogo` | Logo officiel embarqué sur plaque blanche, ou initiales |

Dimensions :

- bouton 52 pt (36 en compact) ;
- zone tactile ≥ 44 pt ;
- rayons : badge 6, bouton compact 10, carte 14, corps 22, feuille 20 ;
- marges d'écran : 16 (12 sous 360 pt, 20 à partir de 430 pt).

## 5. Composition des écrans

- **Accueil (pilotage)**, dans l'ordre :
  1. chiffre du jour ;
  2. bande du stock (valeur au coût connu, références, ruptures, faibles) ;
  3. **À traiter** (tâches triées par gravité, chacune mène à sa résolution) ;
  4. raccourcis ;
  5. conseiller ;
  6. **Sourcing et opportunités** (origine des prix, opportunités du radar avec marge estimée,
     produits à racheter) ;
  7. activité récente ;
  8. « Bien démarrer » (étapes manquantes uniquement, en tête si la boutique est vide).
- **Sourcing** :
  - recherche en tête ;
  - avant la recherche : sources réelles, problèmes à corriger, exploration ;
  - après la recherche : tri **Prix / Opportunités / Fournisseurs**, filtre d'origine (vos comptes,
    publiques, marché), vue détaillée ou compacte.
- **Bibliothèque** :
  - le bandeau chiffre les fournisseurs étudiés, connectés, connectables, à compte pro et en erreur ;
  - vues rapides avec compteurs ;
  - une carte = logo, statut réel, faits, **une** action.
- **Fiche fournisseur** :
  - carte d'identité avec l'action principale ;
  - onglets Aperçu / Produits / Accès / Fiche ;
  - confirmation avant déconnexion.
- **Imports** :
  - historique chiffré ;
  - rapport avec barre de répartition, erreurs par catégorie filtrables, export CSV et relance ;
  - assistant d'import en cinq étapes visibles.

## 6. Mouvement

Tout le mouvement passe par `components/ui/motion.tsx`. La préférence système **« Réduire les
animations »** est lue une seule fois pour toute l'application.

| Mouvement | Durée | Avec « Réduire les animations » |
|---|---|---|
| Apparition (fondu + 8 pt), décalage par élément | 220 ms, 40 ms plafonné à 8 éléments | Aucune |
| Barres de progression | 420 ms | Valeur immédiate |
| Chevron des sections repliables | 160 ms | Instantané |
| Pulsation des chargements | 1 s | Opacité fixe |
| Notifications | 200 ms | Instantanées |
| Feuilles | Glissement | Fondu |

Aucun rebond appuyé ; l'étoile des favoris a un retour bref.

Retours haptiques : changement d'onglet ou de tri, favori, résultat d'une connexion.

Piège connu : n'écrivez jamais `x.value` dans un objet `style`. Le plugin Babel de Reanimated le
prend pour une valeur animée.

## 7. Accessibilité et petits écrans

- Libellés d'accessibilité sur toutes les actions. Les cartes de chiffres sont lues « libellé :
  valeur, précision ».
- États signalés par icône ou texte, en plus de la couleur.
- Tailles de texte système respectées (×1,4 au plus).
- Sous 360 pt (`useLayout().compact`) :
  - bandes de chiffres en grille ;
  - pastilles d'action masquées (le chevron reste) ;
  - bouton de recherche « OK » ;
  - badges de méthode masqués sur les cartes.
- Listes longues virtualisées (`FlatList`) : stock, bibliothèque.

## 8. Contrôle visuel (aperçu web)

Pour inspecter les écrans sans Supabase ni appareil, utilisez l'aperçu web :

- `apps/mobile/preview/demo-db.ts` : base en mémoire, organisation « Atelier Démo » marquée démo ;
- `scripts/preview-api-fixtures.ts` : réponses de l'API produites par **les vraies fonctions
  serveur** sur cette base ;
- `metro.config.js` : remplace Supabase et l'API **uniquement** si `MONSTOCK_PREVIEW=1`. Une build
  normale n'est pas concernée.

```bash
npx tsx --conditions=react-server scripts/preview-api-fixtures.ts
cd apps/mobile
MONSTOCK_PREVIEW=1 MONSTOCK_PREVIEW_MODULES=<dossier node_modules contenant react-native-web@0.21.2> \
  EXPO_PUBLIC_SUPABASE_URL=https://preview.invalid EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_preview \
  npx expo export --clear --platform web --output-dir /tmp/web-dist
PLAYWRIGHT_MODULE=<chemin de playwright> node preview/capture.mjs /tmp/web-dist /tmp/shots "/today#full" "/sourcing?q=iphone%2013#full"
```

Le rendu web (react-native-web) est proche de l'iOS, sans être identique : polices, ombres et
ajustement automatique de la taille du texte diffèrent. Une vérification sur iPhone reste
nécessaire.
