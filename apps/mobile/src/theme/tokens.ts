/**
 * Jetons de design MON STOCK v3 — « Bleu nuit + menthe » (handoff design_handoff_mon_stock_v3 ;
 * le README fait foi). Les clés des versions précédentes sont conservées (aucun écran ne casse).
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
  // Fonds et surfaces
  bg: "#F7F8FA",
  surface: "#FFFFFF",
  /** bloc de liste / champ-valeur posé sur le corps blanc */
  surfaceSunken: "#F2F4F7",
  surfacePressed: "#EEF1F5",
  surfaceDark: "#101C2C",
  surfaceDeep: "#0A1420",
  /** bouton secondaire / touche sur bandeau nuit */
  nightRaised: "#22324A",

  // Texte
  ink: "#17212F",
  ink2: "#5B6676",
  ink3: "#778292",
  inkOnDark: "#F7F8FA",
  inkOnDarkMuted: "#9AA6B6",
  /** onglet intercalaire inactif sur bandeau nuit */
  inkOnDarkSubtle: "#7D8AA0",

  // Lignes
  line: "#E6EAF0",
  lineSoft: "#EEF1F5",
  lineStrong: "#D5DBE4",
  skeleton: "#EBEEF3",
  skeletonStrong: "#E1E5EB",

  // Marque
  brand: "#101C2C",
  brandSoft: "#E8EBF0",
  mint: "#8BE8BE",
  mintPressed: "#72D9A9",
  mintSoft: "#E3F8EE",
  onMint: "#101C2C",

  // Avertissement (clé historique « accent »)
  accent: "#E5A34D",
  accentSoft: "#FBF1E2",
  accentInkOnSoft: "#8A5A12",

  // Succès / marge
  success: "#1E7F57",
  successSoft: "#E3F8EE",
  successInk: "#1E7F57",
  successOnDark: "#8BE8BE",

  // Erreur / rupture
  danger: "#DC5A5A",
  dangerInk: "#B03A3A",
  dangerSoft: "#FBE9E9",
  dangerOnDark: "#F2A3A3",

  overlay: "rgba(16,28,44,0.40)",
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, screenX: 16, blockGap: 10, tabBarClearance: 0, bodyOverlap: 22 } as const;
/** badge 6 · bouton compact 10 · bouton / champ / liste 14 · corps 22 · feuille 20 */
export const radius = { xs: 6, sm: 8, md: 10, lg: 12, xl: 14, xxl: 14, body: 22, sheet: 20, pill: 999 } as const;
export const size = {
  button: 52,
  buttonCompact: 36,
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
export const motion = { press: 90, segmented: 150, chip: 120, toast: 200, sheet: 250, toastAutoDismiss: 4000, undoWindow: 5000, skeletonPulse: 1000 } as const;

/** Ombres quasi inexistantes : les surfaces se distinguent par le fond. */
export const shadow = {
  card: { shadowColor: "#101C2C", shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  toast: { shadowColor: "#101C2C", shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  tabBar: { shadowColor: "#101C2C", shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
} as const;
