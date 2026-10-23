# MON STOCK — Handoff Claude Code (v2, refonte)

Fichiers de référence : `MON STOCK Site.dc.html` (accueil), `MON STOCK Parcours.dc.html` (inscription, connexion, choix de plateforme, entrée tableau de bord). Ce document décrit exactement ces deux fichiers.
Le dépôt reste la source de vérité pour auth (Supabase, `signUpAction`, `signInAction`), routes, OAuth eBay (`/api/integrations/ebay/connect|callback`, `OAUTH_ERROR_MESSAGES`) et données réelles.

Trois catégories sont séparées partout :
- **Visuel** : à reproduire fidèlement.
- **Simulé (prototype)** : n'existe que dans les maquettes (barre « PROTOTYPE · CONTRÔLES DE REVUE », boutons « Simuler le retour eBay », valeurs EXEMPLE, comptes `deja@exemple.fr` / mot de passe `incorrect`, chronomètres de chargement, vente animée du hero).
- **Réel à connecter** : listé en section G.

## A. Direction artistique définitive

**Concept : « le stock est un bus, chaque canal est un port. »** Le code-barres du mot-symbole devient le motif central. Chaque barre = une référence ; un câble plein = un canal connecté ; un câble ouvert (pointillé qui s'arrête avant la prise) = pas encore disponible. Ce langage est repris au hero (champ de barres), dans les intégrations (panneau de brassage), dans la démo (filtre par niveau) et dans l'inscription (panneau « ports »).

**Ce qui change par rapport à la v1 et pourquoi**
- Hero : plus de colonne texte + carte. Titre pleine largeur 148 px, champ de 96 barres en fond (5 barres menthe = eBay), dock des canaux posé sur le bord de la fenêtre produit, fenêtre rognée par le pli. Raison : composition reconnaissable sans logo, point focal unique.
- Plus de « cartes sombres arrondies sur fond gris » : chaque section est une bande pleine largeur avec son propre fond (nuit / papier chaud / menthe).
- Intégrations : panneau de brassage (8 lignes, bus vertical, prises) au lieu d'une constellation. Raison : hiérarchie explicite disponible / futur, sans logos inventés.
- Problème/solution : une scène collante pilotée au scroll (3 quantités contradictoires convergent vers 1) au lieu de deux blocs statiques.
- Fonctionnalités : 4 récits numérotés, chacun avec un visuel différent, au lieu de 6 cartes semblables.
- Accent typographique : Instrument Serif italique pour 1 à 3 mots par titre. Raison : contraste éditorial avec Manrope 800, signature de marque.
- Papier chaud `#F3F2EE` côté marketing (l'app garde `#F2F4F7`). Menthe pleine en fin de page.
- Parcours : même scène nuit + champ de barres que le hero, panneau « ports » à gauche du formulaire (≥ 1100 px), titres à accent serif.

**Charte conservée** : nuit `#101C2C`, menthe `#8BE8BE`, Manrope, Geist Mono, wordmark 5 barres, ton « données honnêtes ».

## B. Tokens

Couleurs : night `#101C2C` · night-deep `#0A1420` · page-bg `#0C1724` · night-raised `#22324A` · on-night `#F7F8FA` · on-night-muted `#9AA6B6` · on-night-lead `#B4BECB` · on-night-subtle `#7D8AA0` · mint `#8BE8BE` / pressed `#72D9A9` · amber `#E5A34D` · red-on-night `#F2A3A3` · red `#DC5A5A` · **paper-marketing `#F3F2EE`** (bordures `#E1DFD7`, filets `#EEEDE7`, `#DAD8D0`) · paper-app `#F2F4F7` · surface `#FFF` · border `#E6EAF0` / strong `#D5DBE4` · ink `#101C2C` · muted `#5B6676` · ink-3 `#778292` · success `#1E7F57` (soft `#E3F8EE`, tint section `#DDF3E8`, trace `#BFE3D2`) · warning `#8A5A12` (soft `#FBF1E2`, bord. `#F0DDBB`) · danger `#B03A3A` (soft `#FBE9E9`, ligne `#F3D2D2`) · info `#24518F` (soft `#EAF0FB`) · ring `#3567C4`.
Menthe jamais en texte sur fond clair (sauf en grand sur nuit). Sur menthe : texte `#101C2C`.

Typographie : Manrope 300/500/600/700/800 ; Geist Mono 500/600 capitales `.08em` ; **Instrument Serif italique 400** (accents, numéros 01–04) à `1.1em` du texte voisin.
Échelle (desktop / mobile) : H1 `min(148, 9.8vw)` / 56, `line-height .94`, `-.05em` · H2 76 (tablette 56) / 38, `lh 1`, `-.045em` · énoncé 84 / 34, `lh 1.04` · H3 40 / 30 · lead 19 / 17 · corps 15–16.5 · mono 9.5–11 · chiffres de scène 76 / 52 poids 300 · CTA final 132 (tablette 84) / 50.
Espacement : sections 144 / 80 ; marges de page 56 (tablette 32, mobile 18) ; max 1240 (hero 1320). Récits : 120 / 64 entre eux.
Rayons : bouton 14 (CTA 56 px de haut) · carte 16–18 · panneau 26 · fenêtre produit 22–24 · header flottant 16.
Ombres : uniquement fenêtres flottantes (`0 50px 100px -40px rgba(0,0,0,.8)` ; hero ajoute halo menthe `0 -30px 120px -30px rgba(139,232,190,.18)`) et notification (`0 24px 50px -12px rgba(0,0,0,.6)`). Aucune ombre sur le papier.
Points de rupture : < 760 mobile · < 1100 tablette · ≥ 1100 bureau ; scène collante dès 1000 px.

## C0. Hero et démo : interface vivante (révision v3)

**Le hero est l'interface.** Fenêtre d'application complète, 1240 px max, deux « panneaux fantômes » derrière (décalés de 14 et 27 px, rayon 22) pour la profondeur, rognée par le bas de la section (150 px ; 30 px en mobile, largeur 108 %).
- **Barre de fenêtre** (42 px) : points, mention « APERÇU ILLUSTRATIF · VENTE D'EXEMPLE », bouton menthe à droite : « ▶ Simuler une vente » → « ● Vente en cours » → « ↻ Rejouer ».
- **Sidebar** 206 px (≥ 760) : mot-symbole, sélecteur d'organisation (« Ma Boutique Reconditionnée »), 6 entrées avec icône filaire 15 px (Aujourd'hui actif ; Stock 48 ; Ventes avec pastille « à expédier » ; Sourcing ; Fournisseurs ; Analyse), pied « EBAY · SYNCHRONISÉ / DERNIÈRE SYNCHRO ».
- **Barre du haut** 54 px (≥ 760) : recherche ⌘K, cloche (point menthe à l'étape 5), « + Ajouter », avatar.
- **Scène** : CA du jour 76 px poids 300 + « +479 € » menthe ; 14 jours (le 14ᵉ en contour menthe, hauteur 49 % → 65 %) ; Ventes / À expédier / Marge estimée ≈.
- **Papier** (rayon 20) : colonne gauche stock (bande code-barres 48 barres + barre « iPhone 13 » en dernier, 4 lignes : réf., qté, mini-histogramme 14 j, couverture, canal eBay, prix) ; colonne droite « COMMANDES EBAY » (carte de la nouvelle commande, commande existante) et « ACTIVITÉ » (≥ 760).
- **Notification** flottante (blanche, 330 max, barre de temps 2 px menthe) en haut à droite ; **alerte « Stock faible »** (nuit, bordure ambre) débordant à gauche (≥ 1360 : -26 px ; sinon à 14 px, top 395).
- **Dock** : la puce eBay est reliée à la fenêtre par un trait de 34 px ; le point menthe n'y circule qu'à l'étape 1 (la vente arrive d'eBay).

### Séquence (une seule vente : commande #E-10483, iPhone 13 128 Go Noir · Grade A, 479,00 €, SKU IP13-128-NR-A)

| Étape | t (ms) | Ce qui change (et uniquement cela) |
|---|---|---|
| 0 | repos | stock 2, ≈ 5 j, CA 1 486, ventes 6, à expédier 2, marge ≈ 21 % |
| 1 | 500 | point du dock descend (900 ms) ; carte « Nouvelle » (ambre) se déplie (max-height 0 → 84, 700 ms) |
| 2 | 1 600 | statut → « Importée · stock −1 » (vert, bordure menthe) ; ligne ACTIVITÉ « 10:42 Vente eBay · IP13-128-NR-A −1 » ; synchro → « à l'instant » |
| 3 | 2 400 | stock 2 → 1, couverture ≈ 3 j, ventes 30 j 11 → 12 ; ligne en vert menthe puis ambre ; puce « −1 » ; barre du code-barres s'élargit (flex 1,2 → 3,6) et flashe menthe puis ambre |
| 4 | 3 100 | CA compte 1 486 → 1 965 (rAF, 1 000 ms, easeOutCubic), « +479 € », ventes 7, à expédier 3, marge ≈ 22 %, 14ᵉ barre 49 → 65 %, pastille Ventes ambre |
| 5 | 4 000 | notification (y −16, scale .96 → 1, 700 ms) « Nouvelle commande eBay · 479,00 € / iPhone 13 128 Go · stock 2 → 1 », barre de temps 3,6 s, point cloche, alerte « Stock faible · ≈ 3 j » (+250 ms) |
| reset | 9 400 | retour à 0 (fondu), reprise 1 500 ms plus tard |

Boucle : seulement tant que le hero est visible (IntersectionObserver 12 %), jamais en reduced-motion. Hors écran : arrêt et retour à l'état 0. Démarrage automatique 1 800 ms après l'entrée.
**Interaction** : clic n'importe où sur la fenêtre ou sur le bouton = rejoue depuis 0 (anti-double-clic 400 ms). Survol (souris uniquement) : inclinaison de la fenêtre ±5° Y / ±4° X (perspective 1600, transition 600 ms) et étiquette « CLIQUER POUR REJOUER LA VENTE ». Mobile/tactile : pas d'inclinaison.
**Défilement** : la fenêtre se transforme sur les premiers 0,9 × hauteur d'écran : `perspective(2000px) translateY(-46px) rotateX(9°) scale(.94)` (progression linéaire, transform direct via ref, pas de setState) ; le champ de barres a sa parallaxe. Rien ne bloque le scroll.
**Démo produit (#produit)** : même moteur, état indépendant (`ds`, `dCa`). Bouton menthe « Simuler une vente eBay » → « Vente en cours… » → « Rejouer la vente » ; pas de boucle. Effets : ligne iPhone 13 (qté 1, couverture ≈ 3 j, ventes 12, puce −1), fiche SKU (ligne « Vente eBay #E-10483 · à l'instant −1 » en tête), onglet Ventes (carte #E-10483 Nouvelle → Importée), CA du jour dans la scène, notification dans la fenêtre. La ligne iPhone 13 est sélectionnée par défaut.
**Simulé vs réel** : tout ce bloc est une illustration ; en production le hero reste une animation scénarisée (aucune donnée), et la démo n'appelle aucune API.

## C. Écrans et mise en page (Accueil)

1. **Header flottant** : pilule `#101C2C`, bordure `rgba(247,248,250,.12)`, 58 px, à 12 px du haut, hors flux (sticky, hauteur 0). Nav centrée ≥ 1100 ; mobile : bouton 44 px → feuille.
2. **Hero** (nuit, `overflow:hidden`). Haut : eyebrow mono + « eBay disponible · Amazon prochainement » (≥ 760). H1 deux lignes : « Un seul stock. » / « Tous vos *canaux.* » (serif menthe). Ligne lead (≤ 520) + CTA (« Créer un compte » menthe 56 px, « Voir les intégrations » verre) alignés en bas. Dock : puce eBay (bordure menthe, badge DISPONIBLE, trait de 34 px avec point animé) + puces Amazon/Shopify/WooCommerce en pointillés « PROCHAINEMENT » (masquées en mobile). Fenêtre produit « Aujourd'hui » : sidebar 176 (≥ 760), scène (CA 76 px, 14 jours, ventes, marge ≈), papier avec 4 lignes (réf., qté, ventes 14 j, couverture, canal eBay, prix). Fenêtre rognée de 150 px (30 mobile) par le bas de la section ; largeur 108 % en mobile. Champ de barres : `fieldH` 460 (300), 96 barres, `rgba(247,248,250,.07)`, barres 58–62 menthe, 24 et 81 ambre à 55 %.
3. **Énoncé** (papier chaud) : « Vous vendez sur plusieurs canaux. Votre stock, lui, ne devrait exister qu'*une seule fois.* » 84 px, mots révélés au scroll.
4. **Avant/après** : ≥ 1000 px et mouvement autorisé : section 300 vh, contenu collant 100 vh. Gauche : texte A (« Quelle quantité est *juste ?* ») puis B (« Une référence. *Une quantité.* »). Droite : 3 cartes contradictoires (annonce eBay 4, tableur 3, carnet 5 ?) qui convergent vers la fiche SKU (2). Sinon : version statique (3 cartes + fiche).
5. **Intégrations** (nuit pleine largeur) : titre « Un seul câble branché. *Les autres arrivent.* », paragraphe de légende. Panneau de brassage : 8 lignes — eBay (128 px, câble plein menthe, point voyageur, prise pleine), Amazon / Shopify / WooCommerce (84 px, câble pointillé à 56 % puis prise ouverte, « NON CONNECTÉ »), BigBuy / Ingram Micro / Sendcloud / Boxtal (64 px, « PAS DE DATE »). Bus vertical à droite (menthe sur la 1re ligne, gris ensuite) étiqueté STOCK CENTRAL. Sous le panneau : ce que fait la connexion eBay aujourd'hui + 3 puces.
6. **Fonctionnalités** (papier chaud) : récits 01 à 04 en alternance gauche/droite (≥ 1100). 01 panneau nuit : 48 barres + chaîne produit → variante → SKU. 02 panneau blanc : journal de mouvements (5 lignes décalées 90 ms). 03 panneau menthe pâle : règle de marché (−40 % … +20 %, médiane 69,50 €, offre 58,90 €) + cascade de marge. 04 panneau blanc : assistant d'import (Fichier ✓ Aperçu ✓ Colonnes 3 Confirmation 4), table de correspondance, barre répartie. Bandeau défilant des outils (TVA … Suivi de colis).
7. **Le produit** (nuit) : fenêtre complète inclinée (`rotateX 12° → 0` au scroll), sidebar + scène (chiffre, filtres Tous/Ruptures/Faibles, code-barres 48 barres atténuées selon filtre) + papier (7 lignes, fiche SKU latérale ≥ 760). Onglet Ventes (4 commandes). Mobile : onglets en haut, 3 colonnes.
8. **Démarrer** : 4 étapes avec grands numéros serif (110/72), ligne de progression au scroll (≥ 760).
9. **CTA final** (menthe `#8BE8BE`) : « Commencez avec *eBay.* Gardez la place pour la suite. » 132 px, 72 barres encre en pied (`ctaField` 240 / 170), CTA encre + contour.
10. **Footer** (`#0C1724`) : colonnes Produit, Intégrations (statuts), Légal, Compte ; mention marques ; mot-symbole géant `rgba(247,248,250,.09)` rogné.

## D. Parcours

Cadre commun : scène nuit (wordmark, étape, eyebrow, titre à accent serif 64/40, lead, champ de 90 barres en pied, 96 px) ; papier `#F3F2EE` rayon 28 remontant de 28 px.
- **Inscription / Connexion** : ≥ 1100 px, panneau nuit « PORTS DU STOCK CENTRAL » (eBay câble plein DISPONIBLE ; Amazon, Shopify, WooCommerce câbles ouverts PROCHAINEMENT) + 3 assurances, à gauche ; formulaire ≤ 460 à droite. En dessous : formulaire seul. Champs 52 px rayon 12, bouton 52 px menthe, erreur `role=alert`, loader dans le bouton, afficher/masquer le mot de passe, jauge de robustesse indicative (règle réelle : 8 caractères).
- **Choix de plateforme** (max 880) : stepper « ✓ ORGANISATION — 2 · PLATEFORME » ; carte eBay (28 de rayon, logo en emplacement, badge d'état, titre 34, bénéfices, CTA, mention OAuth) avec schéma nuit « APRÈS AUTORISATION » (Annonces → Commandes → Stock central) ; grille « AUTRES PLATEFORMES · PAS ENCORE DISPONIBLES » (cartes pointillées) ; lien « Continuer sans connecter de plateforme ».
- États : aucune · en cours (4 étapes, bandeau « pas terminée tant que le serveur n'a pas confirmé ») · succès (coche tracée, compte renvoyé par le serveur) · erreur (message `OAUTH_ERROR_MESSAGES[code]` + code mono) · futur choisi (panneau explicatif, aucune action de liste d'attente) · passé · déjà connecté (pas de CTA OAuth).
- **Tableau de bord** : checklist (organisation ✓, eBay, import, premier produit) + état vide du code-barres ; aucune valeur chiffrée sans donnée.

## E. Composants

`FloatingHeader` · `Button` (primary menthe, glass, ink sur menthe, outline ink ; 56 px) · `StatusBadge` (DISPONIBLE plein menthe / PROCHAINEMENT ambre / PRÉVU / EN COURS / CONNECTÉ / ERREUR / NON CONNECTÉ ; mono 9–10.5 px) · `ExampleTag` · `BarcodeField` (props : n, seed, litRange, height, parallax) · `ChannelDock` · `ProductWindow` (variantes hero « Aujourd'hui » / démo « Stock-Ventes ») · `ScrubStatement` · `ChaosToOrderScene` · `PatchPanel` / `PortRow` (états lit/open, tailles lg/md/sm) · `Story` (numéro serif, titre, texte, panneau, `side` left/right) · `MarketRuler`, `MarginWaterfall`, `MovementLedger`, `ImportWizard` · `Marquee` · `StepList` · `MintCTA` · `GiantWordmark` · `AuthShell` (scène + papier + `PortsPanel`) · `ConnectionCard` (état) · `ConnectionStepper` · `Checklist`.
Logos : emplacements textuels (nom en Manrope) dans `PortRow`, `ChannelDock`, `ConnectionCard`. Le composant doit accepter `logoSrc` pour l'asset officiel.

## F. Animations (courbes : instrument `cubic-bezier(.22,1,.36,1)` ; sheet `cubic-bezier(.32,.72,0,1)`)

| Animation | Déclencheur | État initial → final | Durée / délai | Mobile | Reduced motion |
|---|---|---|---|---|---|
| Entrée hero | chargement | opacity 0, y +34 → 1, 0 ; eyebrow fondu | titre L1 1100 ms @100, L2 @240, lead @500, CTA @620 | idem | opacité seule |
| Champ de barres | chargement | scaleY 0 → 1 depuis le bas | 1100 ms ; delay 300 + 14 ms × distance à l'indice 60 (rayonne depuis eBay) | 300 px de haut | état final |
| Parallaxe du champ | scroll | translateY = scrollY × 0.14 | rAF | conservée | désactivée |
| Dock + câble | chargement @900 | fondu ; point menthe descend 34 px | 1000 ms ; point 2.4 s en boucle à @1.6 s | seule puce eBay | point masqué, trait fixe |
| Fenêtre produit | chargement @1000 | y +90, scale .97, opacity 0 → final | 1400 ms | idem | final |
| Vente en direct | boucle 9,4 s + 1,5 s de pause, hero visible uniquement | voir tableau « Séquence » (C0) | transitions 400–900 ms ; CA 1 000 ms | sans sidebar, topbar, activité ; notification sous la scène | aucune boucle ; lecture au clic seulement |
| Inclinaison au survol | pointermove (souris) | rotateY ±5°, rotateX ±4° | 600 ms instrument | désactivée | désactivée |
| Transformation au scroll (hero) | scroll 0 → 0,9 vh | none → translateY −46, rotateX 9°, scale .94 | linéaire, rAF | conservée | désactivée |
| Énoncé | scroll | opacité de chaque mot .14 → 1 | progression = (0.88 vh − top) / (0.55 vh) ; fenêtre glissante de 4 mots | conservée | tout visible |
| Avant/après | scroll 0 → 1 sur 300 vh | cartes : décalage (±190, ±150), rotation (±3–6°) → centre, scale .94, opacité 1 → 0 entre p .50 et .72 ; fiche SKU opacité 0 → 1 entre .55 et .80, scale .94 → 1 ; texte A → B entre .38 et .66 ; barre de progression scaleX | easeInOut sur p/0.6 | version statique | version statique |
| Révélation (`data-r`) | entrée viewport (10 %, −5 %) | opacity 0, y +28 → 1, 0 | 900 ms, délais `--d` 0–360 ms | idem | visible |
| Barres de section (`data-g`, `data-gx`) | entrée viewport | scaleY/scaleX 0 → 1 | 800 / 1000 ms ; 60–100 ms entre barres | idem | final |
| Câble eBay (panneau) | boucle | point blanc de gauche à droite | 2.6 s ease `(.4,0,.2,1)` | idem | masqué |
| Fenêtre démo | scroll | `perspective(2000px) rotateX(12°) scale(.95)` → `none` | progression (vh − top)/(0.85 vh) | conservée | `none` |
| Filtres démo | clic | barres non concernées opacité 1 → .14 ; lignes filtrées | 400 ms | idem | immédiat |
| Bandeau outils | boucle | translateX 0 → −50 % | 38 s linéaire | 34 px | figé |
| Ligne « Démarrer » | scroll | scaleX 0 → 1 | progression (0.85 vh − top)/(0.45 vh) | masquée | pleine |
| Menu mobile | clic | y −8, 0 → 1 ; barres → croix | 300 ms sheet | — | immédiat |
| Boutons | hover | y −2, fond pressed | 300 ms | aucun | couleur seule |
| Parcours : arrivée d'écran | navigation | y +16, 0 → 1 | 500 ms | idem | immédiat |
| Parcours : champ de barres, câbles | chargement | scaleY 0 → 1 (`psGrow` 700 ms, delay 150 + 12 ms × distance) ; point voyageur 2.6 s | — | 70 px | final |
| Succès / erreur | état | coche : scale .6 → 1 (500 ms) + tracé 600 ms @250 ; erreur : translateX ±4 sur 400 ms | — | idem | sans mouvement |

Règle : uniquement `transform` et `opacity`. Boucles autorisées : vente du hero, point du dock, point du câble eBay, bandeau outils, spinners. Toutes coupées par `prefers-reduced-motion` (CSS global + `matchMedia` pour le JS : scrub, parallaxe, inclinaison, minuteur de vente).
Implémentation : CSS (keyframes + transitions), un `IntersectionObserver` global (`.in`), un seul écouteur `scroll` passif en `requestAnimationFrame` écrivant directement `style.transform/opacity` via refs (pas de `setState` au scroll). Aucune bibliothèque.

## G. Réel à connecter vs simulé

| Sujet | Réel (dépôt) | Simulé dans la maquette |
|---|---|---|
| Inscription | `signUpAction`, états `needsConfirmation`, erreurs de champ du serveur | validation locale, chargement 1,3 s, `deja@exemple.fr` |
| Connexion | `signInAction`, `next`, redirection | `incorrect`, chargement 1,2 s |
| Connexion eBay | POST `/api/integrations/ebay/connect` ; retour `?connected=1` / `?error=<code>` ; état lu côté serveur | boutons « Simuler le retour eBay » |
| Messages d'erreur | `oauthErrorMessage(code)` | `access_denied` |
| Compte eBay, dernière synchro | valeurs de la connexion en base | « exemple_vendeur », « il y a 2 h » |
| Chiffres, SKU, commandes, prix | aucun sur le site public | tous marqués EXEMPLE |
| Disponibilité des canaux | eBay seul disponible | Amazon, Shopify, WooCommerce « prochainement » ; BigBuy, Ingram Micro, Sendcloud, Boxtal « pas de date » (**à confirmer dans le dépôt**) |
| Futur canal choisi | aucun appel, aucune liste d'attente | panneau explicatif |
| « Passer » | navigation vers `/dashboard` ; mémorisation à décider côté dépôt | état « passé » |

## H. Ressources

- **Polices** : Manrope et Geist Mono déjà dans le dépôt (OFL). **Ajouter Instrument Serif (OFL), italique 400**, auto-hébergée (subset latin). Ne pas charger Google Fonts en production.
- **Logos** : aucun logo officiel fourni, aucun imité. À récupérer auprès de la charte de marque eBay (et Amazon, Shopify, WooCommerce si affichés, avec libellé « prochainement » et sans suggérer un partenariat). Repli : nom en texte (état actuel). Zone de protection et proportions à respecter.
- **Icônes** : formes simples (cercles, traits) ; `lucide-react` pour le reste. Aucune illustration bitmap ni SVG complexe.
- **Données d'exemple** : `src/components/public/example-data.ts`, toujours avec `ExampleTag`.

## I. Guidance technique

- Conserver Next.js App Router, Tailwind v4, tokens de `globals.css` ; ajouter `--paper-marketing: #F3F2EE`, `--font-serif`.
- Serveur : toutes les sections statiques, header/footer, panneau de brassage, récits (visuels purs). Client : menu mobile, `ProductWindow` démo (onglets, filtre, sélection), vente animée du hero (minuteur), `ScrollScenes` (parallaxe, énoncé, avant/après, inclinaison, ligne de progression, un seul écouteur), `RevealObserver`.
- Le tick de vente du hero doit se suspendre quand l'onglet est caché (`document.hidden`) et sous reduced-motion.
- `/onboarding/plateforme` : page serveur sous `proxy.ts`, lit `getOrgContext()` + connexion eBay réelle ; `searchParams` pour `connected` et `error`. « Succès » seulement si la connexion est confirmée en base.
- Aperçu responsive : la maquette expose une propriété `viewport` (full / tablet / mobile) uniquement pour la revue.
- Perf : 0 image, SVG inline minimal, pas de `backdrop-filter`, `will-change` limité au champ de barres et à la fenêtre démo. LCP = H1.

## J. Critères de validation visuelle

- Hero : à 1440 × 900, le titre, le lead, les CTA, le dock et le haut de la fenêtre (barre, scène avec CA) sont visibles sans scroll ; la séquence de vente est cohérente à chaque étape (une seule vente, mêmes montants partout) ; le bouton rejoue ; les barres menthe (eBay) se lisent comme un accent ; aucune barre ne traverse le texte lead.
- Chaque section a un fond propre (nuit, papier chaud, menthe) ; aucune grille de cartes identiques.
- Panneau de brassage : seule la ligne eBay a un câble plein et une prise pleine ; les 7 autres ont un câble ouvert.
- Tous les chiffres de l'accueil portent EXEMPLE ou sont dans un bloc étiqueté.
- 390 px : pas de défilement horizontal ; hero sans dock (sauf eBay) ; démo avec 3 colonnes ; feuille de menu fonctionnelle ; cibles ≥ 44 px.
- Reduced motion : contenu complet immédiatement, aucune boucle, aucune inclinaison, avant/après statique.
- Contraste AA : texte menthe uniquement sur nuit ; texte ambre `#8A5A12` sur fond clair, `#E5A34D` sur nuit.
- Parcours : mêmes scène et palette que l'accueil ; les 7 états de plateforme conformes à la section D ; erreurs annoncées (`role=alert`), champs `aria-invalid`.
- Étiquettes : eBay « DISPONIBLE » ; Amazon, Shopify, WooCommerce « PROCHAINEMENT » ; aucun bouton de connexion sur un canal non disponible ; aucune date.

## K. Ordre d'implémentation

1. Tokens, polices (Instrument Serif), keyframes, `RevealObserver`.
2. `BarcodeField`, `StatusBadge`, `Button`.
3. Header flottant + feuille mobile ; footer + mot-symbole géant.
4. Hero : titre, dock, `ProductWindow` (statique) ; puis vente animée.
5. Énoncé + `ScrollScenes` (un seul écouteur).
6. Avant/après (scène collante + repli statique).
7. Panneau de brassage.
8. Récits 01–04, bandeau outils.
9. Démo produit (filtres, fiche SKU, onglets, inclinaison).
10. Démarrer, CTA menthe.
11. `AuthShell` + panneau « ports » ; habillage inscription/connexion.
12. `/onboarding/plateforme` : carte eBay, états réels, grille « prochainement », saut.
13. Entrée tableau de bord (checklist).
14. E2E (3 largeurs, libellés), audit a11y, performance, reduced motion.

## Limites de la validation

Vérifié visuellement (v3) : séquence de vente du hero à ~909 px (étapes 1 à 5, reset) et à 390 px, démo produit après clic (ligne, fiche, CA, notification). Vérifié (v2) : accueil à ~909 px (tablette), à 390 px (mode `viewport=mobile`), inscription, panneau « ports », choix de plateforme (état initial). Non vérifié : défilement réel (la capture ne scrolle pas : la scène collante et le scrub de l'énoncé n'ont été relus que par code), rendu à 1440 px réel, tous les états de plateforme un par un, reduced motion (relu dans le CSS/JS, non émulé).
