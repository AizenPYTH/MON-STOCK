/**
 * Jetons de design MON STOCK — handoff « refonte, direction Atelier, vert pomme » (tokens.json,
 * le README du handoff fait foi en cas d'écart). Ne pas improviser de couleur.
 * Règle des accents : ambre = « demande une action », rouge = rupture / erreur, vert = marge /
 * succès ; le vert pomme est AUSSI la couleur de marque : une marge est toujours accompagnée du
 * mot (« marge », « bénéfice ») et de « ≈ » si elle est estimée.
 */
export const color = {
  bg: "#F1FAEA",
  surface: "#FFFFFF",
  /** fond enfoncé : segmented, ligne appuyée */
  surfaceSunken: "#E1F2D6",
  /** tuile « CA », hero, toasts, barre d'onglets (vert pomme foncé) */
  surfaceDark: "#23861C",
  /** fond sombre profond */
  surfaceDeep: "#155F12",
  /** couleur de marque = texte principal, bouton principal, sélection */
  ink: "#1E7A1A",
  ink2: "#3E5A36",
  ink3: "#62805A",
  inkOnDark: "#FFFFFF",
  inkOnDarkMuted: "#D4F2C4",
  line: "#DDEED3",
  lineSoft: "#EAF6E2",
  lineStrong: "#C3E0B4",
  skeleton: "#E2F2D8",
  skeletonStrong: "#D0EAC2",
  accent: "#B8741A",
  accentSoft: "#F6EBDB",
  accentInkOnSoft: "#6E4510",
  success: "#2E8B1F",
  successSoft: "#E3F5D8",
  successInk: "#1F5C14",
  successOnDark: "#A6E687",
  danger: "#B3362B",
  dangerSoft: "#F5E3E0",
  dangerInk: "#8A2A21",
  overlay: "rgba(20,20,19,0.40)",
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, screenX: 16, blockGap: 12, tabBarClearance: 100 } as const;
/** badge 6 · champ/icône 12 · ligne 16 · tuile 20 · feuille 28 · pilule */
export const radius = { xs: 6, sm: 10, md: 12, lg: 14, xl: 16, xxl: 20, sheet: 28, pill: 999 } as const;
export const size = { button: 52, buttonCompact: 44, touchMin: 44, iconButton: 40, thumb: 44, thumbSm: 40, stepperButton: 36, stepper: 64, input: 52, tabBar: 64, tabBarBottom: 22 } as const;
export const motion = { press: 80, segmented: 150, chip: 120, toast: 200, sheet: 260, toastAutoDismiss: 4000, undoWindow: 5000, skeletonPulse: 1000 } as const;

/** Aucune ombre sur les cartes (le contraste vient du fond) ; seulement barre d'onglets et toasts. */
export const shadow = {
  card: { shadowColor: "#1E7A1A", shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  toast: { shadowColor: "#1E7A1A", shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  tabBar: { shadowColor: "#1E7A1A", shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
} as const;
