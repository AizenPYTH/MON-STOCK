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
  /** chiffre clé du bandeau nuit */
  hero: t(40, 44, 800, { letterSpacing: -1 }),
  display: t(34, 38, 800, { letterSpacing: -1 }),
  title1: t(26, 32, 800, { letterSpacing: -0.6 }),
  title2: t(20, 26, 800, { letterSpacing: -0.3 }),
  kpi: t(24, 28, 800, { letterSpacing: -0.5 }),
  kpiSm: t(17, 22, 800),
  /** prix / montant mis en avant dans une ligne ou une carte */
  price: t(18, 22, 800, { letterSpacing: -0.3 }),
  /** titre de section (capitales espacées) */
  section: t(12, 16, 800, { letterSpacing: 0.9, textTransform: "uppercase", color: color.ink3 }),
  headline: t(17, 22, 700),
  body: t(15, 20, 600),
  bodyRegular: t(14, 20, 500, { color: color.ink2 }),
  label: t(13, 18, 600, { color: color.ink3 }),
  overline: t(12, 16, 700, { letterSpacing: 0.4, color: color.ink3 }),
  micro: t(11, 14, 700, { letterSpacing: 0.2, color: color.ink3 }),
  tab: t(11, 13, 700),
} as const satisfies Record<string, TextStyle>;

/** Tous les nombres : chiffres tabulaires (colonnes alignées). */
export const tabular: TextStyle = { fontVariant: ["tabular-nums"] };
