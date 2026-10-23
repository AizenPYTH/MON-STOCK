/**
 * Jetons de design MON STOCK v5 — « Instrument » (docs/design-system.md fait foi).
 * v5 garde l'identité v4 (bleu nuit, menthe, données honnêtes) : une scène nuit par écran qui
 * porte un seul chiffre, un papier clair pour les listes, des cartes à filet SANS ombre, la
 * couleur réservée aux signaux. Les clés des versions précédentes sont conservées.
 *
 * Rôles :
 *  - brand (bleu nuit #101C2C) : bandeau d'en-tête, navigation, une surface sombre rare par écran, toasts.
 *  - mint (#8BE8BE) : action principale (texte bleu nuit), onglet actif, positif SUR FOND SOMBRE.
 *    Jamais en texte sur blanc (contraste insuffisant).
 *  - accent (#E5A34D) : « demande une action » ; en texte → accentInkOnSoft (AA).
 *  - danger (#DC5A5A) : rupture, erreur ; en texte → dangerInk (AA).
 *  - success (#1E7F57) : marge / succès en texte sur fond clair ; sur fond sombre → successOnDark (= mint).
 */
export const color = {
  // Fonds et surfaces (web : background, surface, surface-2, surface-3, selection)
  /** papier : fond de l'application sous les cartes */
  bg: "#F2F4F7",
  /** surface 1 : cartes, champs */
  surface: "#FFFFFF",
  /** carte / panneau posé sur le canvas (blanc + filet `line`) */
  card: "#FFFFFF",
  /** surface 2 : zone en retrait dans une carte */
  surface2: "#F7F8FA",
  /** surface 3 : pastilles neutres, appui discret */
  surface3: "#EEF1F5",
  /** bloc de liste / champ-valeur posé sur le corps blanc */
  surfaceSunken: "#F2F4F7",
  surfacePressed: "#EEF1F5",
  /** ligne / élément sélectionné */
  selection: "#E8EBF0",
  surfaceDark: "#101C2C",
  surfaceDeep: "#0A1420",
  /** bouton secondaire / touche sur bandeau nuit */
  nightRaised: "#22324A",

  // Texte (contrastes AA mesurés : tests/design-tokens.test.ts)
  /** primaire — 16,2:1 sur blanc */
  ink: "#17212F",
  /** secondaire appuyé — 9,0:1 */
  inkStrong: "#3E4A5B",
  /** secondaire — 6,2:1 sur blanc, 5,5:1 sur surface 3 */
  ink2: "#566272",
  /** tertiaire (étiquettes, métadonnées) — assombri (#778292 → #5F6B7C, M-12) : 4,9:1 sur papier */
  ink3: "#5F6B7C",
  inkOnDark: "#F7F8FA",
  inkOnDarkMuted: "#9AA6B6",
  /** onglet intercalaire inactif sur bandeau nuit — 5,5:1 sur nuit */
  inkOnDarkSubtle: "#8693A8",
  /** désactivé / chevrons décoratifs : JAMAIS porteur d'information */
  ink4: "#9AA6B6",

  // Lignes
  line: "#E6EAF0",
  lineSoft: "#EEF1F5",
  lineStrong: "#D5DBE4",
  /** contour des champs : ≥ 3:1 sur surface et papier (WCAG 1.4.11) */
  borderControl: "#818B9B",
  /** rail de contrôle segmenté / barre de progression */
  track: "#E4E8EE",
  /** filet / contour sur la scène nuit */
  nightLine: "rgba(247,248,250,0.10)",
  nightStroke: "rgba(247,248,250,0.14)",
  skeleton: "#EBEEF3",
  skeletonStrong: "#E1E5EB",

  // Interaction
  /** liens dans le texte — 6,6:1 sur blanc */
  interactive: "#2A5AB0",
  /** anneau de focus / sélection clavier — ≥ 3:1 */
  ring: "#3567C4",
  /** aplat contrasté sur papier (puce sélectionnée) */
  inverse: "#101C2C",
  onInverse: "#F7F8FA",

  // Marque
  brand: "#101C2C",
  brandSoft: "#E8EBF0",
  mint: "#8BE8BE",
  mintPressed: "#72D9A9",
  mintSoft: "#E3F8EE",
  onMint: "#101C2C",

  // Avertissement : `accent` = signal ambre (points, barres) ; texte → warningInk / accentInkOnSoft
  accent: "#E5A34D",
  accentSoft: "#FBF1E2",
  accentInkOnSoft: "#85560F",
  warningInk: "#85560F",
  warningSoft: "#FBF1E2",
  warningLine: "#EFD8B0",
  warningStrong: "#E5A34D",
  onWarningStrong: "#101C2C",

  // Succès / marge (texte AA sur blanc et sur fond doux)
  success: "#1A7550",
  successSoft: "#E3F6EC",
  successInk: "#1A7550",
  successLine: "#BFE3CF",
  successStrong: "#1E7F57",
  onSuccessStrong: "#FFFFFF",
  successOnDark: "#8BE8BE",

  // Erreur / rupture : `danger` = signal (points, barres) ; texte → dangerInk
  danger: "#DC5A5A",
  dangerInk: "#AC3838",
  dangerSoft: "#FBE9E9",
  dangerOnDark: "#F2A3A3",
  /** bordure d'un encadré d'erreur */
  dangerLine: "#F0CDCD",
  dangerStrong: "#B03A3A",
  onDangerStrong: "#FFFFFF",

  // Information (neutre, jamais une alerte)
  info: "#3567C4",
  infoSoft: "#EAF0FB",
  infoInk: "#24518F",
  infoLine: "#CDDBF2",

  // Graphiques de la scène (code-barres du stock, 14 jours)
  barOk: "rgba(247,248,250,0.86)",
  barDay: "rgba(247,248,250,0.26)",
  barTodayBg: "rgba(139,232,190,0.16)",
  /** badge « DÉMO » sur la scène */
  demoInk: "#E5A34D",
  demoBg: "rgba(229,163,77,0.14)",

  overlay: "rgba(10,20,32,0.45)",
} as const;

export type ColorToken = keyof typeof color;

/**
 * Thème SOMBRE — valeurs du design system commun (src/app/globals.css, bloc @tokens:dark), mêmes
 * clés que `color`, contrastes vérifiés par tests/design-tokens.test.ts.
 *
 * PAS ENCORE BRANCHÉ (choix documenté dans docs/MOBILE.md §10) :
 *  - app.json fixe `userInterfaceStyle: "light"` : iOS déclare alors l'application « claire » et
 *    `useColorScheme()` renvoie toujours "light" ; passer à "automatic" exige une nouvelle build
 *    (modification d'app.json hors du périmètre de ce lot) ;
 *  - ~2 000 lectures de `color.*` sont figées au chargement des modules (styles et tables de tons) :
 *    basculer à chaud imposerait de remonter tout l'arbre (perte de la navigation) ou de migrer
 *    chaque écran vers un hook de thème. Les clés sont prêtes pour ce passage.
 */
export const colorDark: Record<ColorToken, string> = {
  bg: "#0F1823",
  surface: "#151F2C",
  card: "#151F2C",
  surface2: "#19242F",
  surface3: "#1F2B3A",
  surfaceSunken: "#0F1823",
  surfacePressed: "#1F2B3A",
  selection: "#22324A",
  surfaceDark: "#0A111B",
  surfaceDeep: "#060B12",
  nightRaised: "#1B2738",
  ink: "#E9EEF4",
  inkStrong: "#C7D0DB",
  ink2: "#A6B1BF",
  ink3: "#95A1B2",
  inkOnDark: "#F7F8FA",
  inkOnDarkMuted: "#9AA6B6",
  inkOnDarkSubtle: "#8693A8",
  ink4: "#5E6B7D",
  line: "#253244",
  lineSoft: "#1F2B3A",
  lineStrong: "#324257",
  borderControl: "#66758B",
  track: "#263446",
  nightLine: "rgba(247,248,250,0.08)",
  nightStroke: "rgba(247,248,250,0.13)",
  skeleton: "#222E3E",
  skeletonStrong: "#2A3748",
  interactive: "#8FB2F3",
  ring: "#78A2F2",
  inverse: "#E9EEF4",
  onInverse: "#0F1823",
  brand: "#0A111B",
  brandSoft: "#22324A",
  mint: "#8BE8BE",
  mintPressed: "#72D9A9",
  mintSoft: "#112A20",
  onMint: "#0A111B",
  accent: "#E5A34D",
  accentSoft: "#2B2011",
  accentInkOnSoft: "#F0B868",
  warningInk: "#F0B868",
  warningSoft: "#2B2011",
  warningLine: "#4F3A1B",
  warningStrong: "#E5A34D",
  onWarningStrong: "#0A111B",
  success: "#79DCAE",
  successSoft: "#112A20",
  successInk: "#79DCAE",
  successLine: "#1F4D39",
  successStrong: "#8BE8BE",
  onSuccessStrong: "#0A111B",
  successOnDark: "#8BE8BE",
  danger: "#E06666",
  dangerInk: "#F4A5A5",
  dangerSoft: "#2F1719",
  dangerOnDark: "#F2A3A3",
  dangerLine: "#5A2A2E",
  dangerStrong: "#C24444",
  onDangerStrong: "#FFFFFF",
  info: "#78A2F2",
  infoSoft: "#14233D",
  infoInk: "#A1C0F4",
  infoLine: "#27416B",
  barOk: "rgba(247,248,250,0.86)",
  barDay: "rgba(247,248,250,0.26)",
  barTodayBg: "rgba(139,232,190,0.16)",
  demoInk: "#E5A34D",
  demoBg: "rgba(229,163,77,0.14)",
  overlay: "rgba(3,7,12,0.66)",
};

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, screenX: 16, blockGap: 10, sectionGap: 24, tabBarClearance: 0, bodyOverlap: 24 } as const;
/** badge 6 · contrôle / bouton 12 (compact 10) · carte 16 · papier 24 · feuille 24 */
export const radius = { xs: 6, sm: 8, md: 10, lg: 12, xl: 16, xxl: 16, card: 16, body: 24, sheet: 24, pill: 999 } as const;
export const size = {
  button: 52,
  /** bouton compact : 44 pt, la cible tactile minimale d'Apple (HIG) */
  buttonCompact: 44,
  touchMin: 44,
  iconButton: 36,
  thumb: 44,
  thumbSm: 40,
  stepperButton: 44,
  stepper: 64,
  input: 52,
  valueField: 64,
  tabBar: 56,
  tabBarBottom: 0,
  icon: 20,
  iconSm: 16,
  tabIcon: 22,
} as const;
/**
 * Durées v5 (ms). « Réduire les animations » les ramène toutes à 0 (voir components/ui/motion.tsx).
 * Les anciennes clés v4 restent disponibles.
 */
export const motion = {
  press: 90,
  quick: 160,
  base: 240,
  tabIndicator: 280,
  move: 320,
  sheet: 360,
  progress: 420,
  figure: 600,
  staggerBars: 18,
  staggerCards: 30,
  staggerSections: 40,
  enter: 240,
  stagger: 30,
  segmented: 240,
  chip: 160,
  toast: 280,
  toastAutoDismiss: 6000,
  undoWindow: 5000,
  skeletonPulse: 1000,
} as const;

/**
 * Élévation v5 : les cartes posées n'ont PAS d'ombre (filet seul). Seul ce qui flotte (feuille,
 * notification, pouce du contrôle segmenté, barre collante) porte une ombre.
 */
export const shadow = {
  card: { shadowColor: "#101C2C", shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  thumb: { shadowColor: "#101C2C", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  sheet: { shadowColor: "#0A1420", shadowOpacity: 0.25, shadowRadius: 40, shadowOffset: { width: 0, height: -12 }, elevation: 12 },
  raised: { shadowColor: "#101C2C", shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  toast: { shadowColor: "#0A1420", shadowOpacity: 0.35, shadowRadius: 32, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  tabBar: { shadowColor: "#101C2C", shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
} as const;

/**
 * Rentabilité d'une offre (analyse « bonne affaire », src/domain/sourcing/deal-analysis.ts) :
 * chaque niveau a une couleur ET un libellé ET une icône (jamais la couleur seule).
 */
export const dealTone = {
  very_good: { fg: color.onSuccessStrong, bg: color.successStrong, border: color.successStrong },
  good: { fg: color.successInk, bg: color.successSoft, border: color.successSoft },
  average: { fg: color.ink2, bg: color.surfaceSunken, border: color.surfaceSunken },
  not_competitive: { fg: color.dangerInk, bg: color.dangerSoft, border: color.dangerSoft },
  insufficient_data: { fg: color.ink3, bg: "transparent", border: color.lineStrong },
} as const;
