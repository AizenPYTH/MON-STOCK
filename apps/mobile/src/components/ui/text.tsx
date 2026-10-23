import { Text, type TextProps, type TextStyle } from "react-native";
import { type as typeScale, tabular } from "~/theme/typography";

export type TextVariant = keyof typeof typeScale;

/**
 * Agrandissement maximal suivant la taille du texte (réglage iOS « Texte plus grand », M-15) :
 * le texte courant suit jusqu'à ×2 (AX1–AX2 environ) ; les titres jusqu'à ×1,6 ; les grands
 * chiffres de la scène (déjà 34 à 68 pt) restent bornés à ×1,25 pour ne pas sortir de l'écran.
 */
const MAX_SCALE: Partial<Record<TextVariant, number>> = {
  figureXL: 1.2,
  figure: 1.2,
  figureMd: 1.25,
  figureSheet: 1.25,
  figureSm: 1.3,
  hero: 1.25,
  display: 1.3,
  title1: 1.5,
  title2: 1.6,
  cardTitle: 1.6,
  kpi: 1.5,
  tab: 1.4,
};
const DEFAULT_MAX_SCALE = 2;

export function maxScaleFor(variant: TextVariant): number {
  return MAX_SCALE[variant] ?? DEFAULT_MAX_SCALE;
}

/** Texte typé par l'échelle typographique du design ; `num` active les chiffres tabulaires. */
export function Txt({ variant = "body", num = false, color, style, ...props }: TextProps & { variant?: TextVariant; num?: boolean; color?: string }) {
  const extra: TextStyle | null = color ? { color } : null;
  return <Text maxFontSizeMultiplier={maxScaleFor(variant)} {...props} style={[typeScale[variant], num ? tabular : null, extra, style]} />;
}
