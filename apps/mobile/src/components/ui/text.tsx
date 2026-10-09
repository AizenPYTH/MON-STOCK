import { Text, type TextProps, type TextStyle } from "react-native";
import { type as typeScale, tabular } from "~/theme/typography";

export type TextVariant = keyof typeof typeScale;

/** Texte typé par la échelle typographique du design ; `num` active les chiffres tabulaires. */
export function Txt({ variant = "body", num = false, color, style, ...props }: TextProps & { variant?: TextVariant; num?: boolean; color?: string }) {
  const extra: TextStyle | null = color ? { color } : null;
  return <Text maxFontSizeMultiplier={1.6} {...props} style={[typeScale[variant], num ? tabular : null, extra, style]} />;
}
