import { forwardRef } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import * as Haptics from "expo-haptics";
import { CircleAlert, Minus, Plus, Search } from "lucide-react-native";
import { color, radius, size, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";
import { Txt } from "~/components/ui/text";

export const TextField = forwardRef<TextInput, TextInputProps & { label: string; error?: string; hint?: string }>(function TextField({ label, error, hint, style, ...props }, ref) {
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
        {label}
      </Txt>
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: color.surface, borderWidth: error ? 1.5 : 1, borderColor: error ? color.danger : color.line, borderRadius: radius.md }}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={color.ink3}
          maxFontSizeMultiplier={1.6}
          style={[{ flex: 1, paddingVertical: space[3], paddingHorizontal: 14, minHeight: size.touchMin, fontFamily: fontFamily[700], fontSize: 17, color: color.ink }, style]}
          {...props}
        />
        {error ? <CircleAlert size={18} color={color.danger} style={{ marginRight: space[3] }} /> : null}
      </View>
      {error ? (
        <Txt variant="label" color={color.danger} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="label">{hint}</Txt>
      ) : null}
    </View>
  );
});

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], height: size.touchMin, backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, paddingHorizontal: space[3] }}>
      <Search size={18} color={color.ink3} strokeWidth={2} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.ink3}
        accessibilityLabel={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        maxFontSizeMultiplier={1.6}
        style={{ flex: 1, fontFamily: fontFamily[600], fontSize: 15, color: color.ink, paddingVertical: 0 }}
      />
    </View>
  );
}

/** Stepper : « − » bordé, « + » plein ; haptique légère à chaque tap. */
export function Stepper({ value, onChange, min = 0, disabled = false, busy = false }: { value: number; onChange: (next: number) => void; min?: number; disabled?: boolean; busy?: boolean }) {
  const step = (delta: number) => {
    const next = value + delta;
    if (next < min || disabled) return;
    void Haptics.selectionAsync().catch(() => {});
    onChange(next);
  };
  const btn = (delta: number, filled: boolean, label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || (delta < 0 && value <= min) }}
      onPress={() => step(delta)}
      hitSlop={4}
      style={({ pressed }) => ({
        width: size.stepperButton,
        height: size.stepperButton,
        margin: (size.touchMin - size.stepperButton) / 2,
        borderRadius: size.stepperButton / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: filled ? color.ink : color.surface,
        borderWidth: filled ? 0 : 1,
        borderColor: color.line,
        opacity: disabled || (delta < 0 && value <= min) ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      {delta < 0 ? <Minus size={16} color={color.ink} strokeWidth={2.4} /> : <Plus size={16} color={color.inkOnDark} strokeWidth={2.4} />}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }} accessible={false}>
      {btn(-1, false, "Retirer une unité")}
      <Txt variant="title2" num style={{ fontSize: 24, minWidth: 40, textAlign: "center", opacity: busy ? 0.6 : 1 }} accessibilityLiveRegion="polite">
        {value}
      </Txt>
      {btn(1, true, "Ajouter une unité")}
    </View>
  );
}
