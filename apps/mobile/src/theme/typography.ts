import type { TextStyle } from "react-native";
import { color } from "~/theme/tokens";

/**
 * Typographie Manrope (500/600/700/800). Avec une police personnalisée, React Native choisit la
 * graisse par FAMILLE (pas par fontWeight) : chaque style référence la famille de sa graisse.
 * Les polices sont embarquées dans l'application (aucun téléchargement à l'exécution).
 */
export const fontFamily = {
  500: "Manrope_500Medium",
  600: "Manrope_600SemiBold",
  700: "Manrope_700Bold",
  800: "Manrope_800ExtraBold",
} as const;

export type Weight = keyof typeof fontFamily;

const t = (fontSize: number, lineHeight: number, weight: Weight, extra: TextStyle = {}): TextStyle => ({
  fontFamily: fontFamily[weight],
  fontSize,
  lineHeight,
  color: color.ink,
  ...extra,
});

export const type = {
  display: t(36, 40, 800, { letterSpacing: -1 }),
  title1: t(28, 34, 800, { letterSpacing: -0.5 }),
  title2: t(22, 26, 800, { letterSpacing: -0.4 }),
  kpi: t(26, 30, 800, { letterSpacing: -0.5 }),
  kpiSm: t(18, 24, 800),
  headline: t(18, 22, 800),
  body: t(15, 20, 600),
  bodyRegular: t(14, 20, 500, { color: color.ink2 }),
  label: t(13, 18, 600, { color: color.ink3 }),
  overline: t(13, 16, 700, { letterSpacing: 0.8, textTransform: "uppercase", color: color.ink3 }),
  micro: t(11, 14, 700, { letterSpacing: 0.5, textTransform: "uppercase", color: color.ink3 }),
  tab: t(10, 12, 700),
} as const satisfies Record<string, TextStyle>;

/** Tous les nombres : chiffres tabulaires (colonnes alignées). */
export const tabular: TextStyle = { fontVariant: ["tabular-nums"] };
