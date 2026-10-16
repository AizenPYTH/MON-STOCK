import type { TextStyle } from "react-native";
import { color } from "~/theme/tokens";

/**
 * Typographie v5 « Instrument » :
 *  - Manrope 300/500/600/700/800 : interface et chiffres (300 = grands chiffres fins de la scène) ;
 *  - Geist Mono 500/600 : SKU, références, âges, étiquettes de section (un code alphanumérique se
 *    lit mieux en chasse fixe).
 * Avec une police personnalisée, React Native choisit la graisse par FAMILLE (pas par fontWeight) :
 * chaque style référence la famille de sa graisse. Polices embarquées (aucun téléchargement).
 */
export const fontFamily = {
  300: "Manrope_300Light",
  500: "Manrope_500Medium",
  600: "Manrope_600SemiBold",
  700: "Manrope_700Bold",
  800: "Manrope_800ExtraBold",
} as const;

export const monoFamily = {
  500: "GeistMono_500Medium",
  600: "GeistMono_600SemiBold",
} as const;

export type Weight = keyof typeof fontFamily;

const t = (fontSize: number, lineHeight: number, weight: Weight, extra: TextStyle = {}): TextStyle => ({
  fontFamily: fontFamily[weight],
  fontSize,
  lineHeight,
  color: color.ink,
  ...extra,
});

const m = (fontSize: number, lineHeight: number, weight: keyof typeof monoFamily, extra: TextStyle = {}): TextStyle => ({
  fontFamily: monoFamily[weight],
  fontSize,
  lineHeight,
  color: color.ink3,
  ...extra,
});

export const type = {
  // Chiffres de la scène (Manrope 300, chiffres fins)
  /** CA du jour (Accueil) */
  figureXL: t(68, 68, 300, { letterSpacing: -2.8 }),
  /** chiffre principal d'une scène (bibliothèque, rapport d'import) */
  figure: t(60, 62, 300, { letterSpacing: -2.4 }),
  /** valeur du stock */
  figureMd: t(48, 50, 300, { letterSpacing: -1.8 }),
  /** marge estimée (feuille d'analyse) */
  figureSheet: t(44, 48, 300, { letterSpacing: -1.4 }),
  /** prix et marge de la meilleure opportunité, relevés de l'historique d'imports */
  figureSm: t(30, 34, 300, { letterSpacing: -1 }),

  /** chiffre clé (v4, conservé) */
  hero: t(40, 44, 800, { letterSpacing: -1 }),
  display: t(34, 38, 800, { letterSpacing: -1 }),
  title1: t(26, 32, 800, { letterSpacing: -0.6 }),
  title2: t(20, 26, 800, { letterSpacing: -0.3 }),
  /** produit de la carte priorité, titre de feuille d'analyse */
  cardTitle: t(18, 24, 700, { letterSpacing: -0.2 }),
  kpi: t(24, 28, 800, { letterSpacing: -0.5 }),
  kpiSm: t(17, 22, 800),
  /** relevé sous le chiffre de la scène */
  stat: t(17, 22, 700),
  /** prix / montant mis en avant dans une ligne ou une carte */
  price: t(17, 22, 800, { letterSpacing: -0.3 }),
  /** titre de section v4 (capitales espacées) — v5 : préférer `mono` */
  section: m(11, 14, 500, { letterSpacing: 0.8, textTransform: "uppercase", color: color.ink2 }),
  headline: t(17, 22, 700),
  body: t(15, 20, 600),
  bodyRegular: t(14, 20, 500, { color: color.ink2 }),
  label: t(13, 18, 600, { color: color.ink3 }),
  /** note de bas de bloc */
  note: t(12, 17, 600, { color: color.ink3 }),
  overline: t(12, 16, 700, { letterSpacing: 0.4, color: color.ink3 }),
  micro: t(11, 14, 700, { letterSpacing: 0.2, color: color.ink3 }),
  tab: t(11, 13, 700),
  button: t(16, 20, 800),
  chip: t(13, 18, 700),
  badge: t(11, 14, 700),

  // Geist Mono
  /** titre de section, en-tête de colonnes (capitales) */
  mono: m(11, 14, 500, { letterSpacing: 0.8, textTransform: "uppercase", color: color.ink2 }),
  /** étiquette de relevé, légende d'axe (capitales) */
  monoSm: m(10, 13, 500, { letterSpacing: 0.6, textTransform: "uppercase" }),
  /** SKU, référence, « il y a 2 h », « L14 » */
  code: m(11, 15, 500),
} as const satisfies Record<string, TextStyle>;

/** Tous les nombres : chiffres tabulaires (colonnes alignées). */
export const tabular: TextStyle = { fontVariant: ["tabular-nums"] };
