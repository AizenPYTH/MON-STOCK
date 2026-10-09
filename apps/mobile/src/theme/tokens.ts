/**
 * Jetons de design MON STOCK (handoff « Design complet », tokens.json). Valeurs finales : ne pas
 * improviser de couleur. Règle de l'accent : ambre = « demande une action », rouge = rupture /
 * erreur, vert = marge / succès, tout le reste en noir / gris.
 */
export const color = {
  bg: "#F4F3F0",
  surface: "#FFFFFF",
  surfaceDark: "#1A1917",
  ink: "#141413",
  ink2: "#5A5955",
  ink3: "#8A8984",
  inkOnDark: "#F4F3F0",
  inkOnDarkMuted: "#A8A69F",
  line: "#E6E4DF",
  lineSoft: "#EFEDE8",
  lineStrong: "#D6D4CE",
  skeleton: "#ECEAE5",
  accent: "#B8741A",
  accentSoft: "#F6EBDB",
  accentInkOnSoft: "#6E4510",
  success: "#2E7D5B",
  successSoft: "#E3F0E9",
  successOnDark: "#7FC8A0",
  danger: "#B3362B",
  dangerSoft: "#F5E3E0",
  overlay: "rgba(20,20,19,0.35)",
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, screenX: 20, blockGap: 14 } as const;
export const radius = { xs: 5, sm: 8, md: 10, lg: 12, xl: 14, xxl: 16, sheet: 24, pill: 999 } as const;
export const size = { button: 48, touchMin: 44, iconButton: 36, thumb: 44, thumbSm: 40, stepperButton: 36 } as const;
export const motion = { segmented: 150, toast: 200, sheet: 250, toastAutoDismiss: 4000 } as const;

export const shadow = {
  card: { shadowColor: "#141413", shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  toast: { shadowColor: "#141413", shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
} as const;
