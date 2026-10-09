import type { ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { color, radius, shadow, size, space } from "~/theme/tokens";
import { Txt } from "~/components/ui/text";

type ButtonVariant = "primary" | "secondary" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  compact = false,
  style,
  accessibilityHint,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}) {
  const inactive = disabled || loading;
  const bg = disabled ? color.line : variant === "primary" ? color.ink : variant === "secondary" ? color.surface : "transparent";
  const fg = disabled ? color.ink3 : variant === "primary" ? color.inkOnDark : color.ink;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: compact ? 40 : size.button,
          borderRadius: radius.lg,
          paddingHorizontal: compact ? space[4] : space[4],
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
          borderWidth: variant === "secondary" && !disabled ? 1 : 0,
          borderColor: color.lineStrong,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Txt variant="body" color={fg} style={{ fontFamily: "Manrope_700Bold", textAlign: "center" }}>{label}</Txt>}
    </Pressable>
  );
}

/** Bouton icône 36 px dans une zone tactile de 44 (surface bordée, ou plein `ink`). */
export function IconButton({ icon, label, onPress, filled = false }: { icon: ReactNode; label: string; onPress: () => void; filled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: size.iconButton,
        height: size.iconButton,
        margin: (size.touchMin - size.iconButton) / 2,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: filled ? color.ink : color.surface,
        borderWidth: filled ? 0 : 1,
        borderColor: color.line,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon}
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: color.line, borderRadius: radius.md, padding: 3 }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => {
              if (selected) return;
              void Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={[{ flex: 1, minHeight: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: space[2] }, selected ? [{ backgroundColor: color.surface }, shadow.card] : null]}
          >
            <Txt variant="label" color={selected ? color.ink : color.ink2} style={{ fontFamily: "Manrope_700Bold" }} numberOfLines={1}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FilterChip({ label, count, selected, tone, onPress }: { label: string; count?: number; selected: boolean; tone?: "danger" | "accent"; onPress: () => void }) {
  const fg = selected ? color.inkOnDark : tone === "danger" ? color.danger : tone === "accent" ? color.accent : color.ink;
  const text = count === undefined ? label : `${label} · ${count}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={text}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        paddingVertical: 7,
        paddingHorizontal: space[3],
        borderRadius: radius.pill,
        backgroundColor: selected ? color.ink : color.surface,
        borderWidth: selected ? 0 : 1,
        borderColor: color.line,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Txt variant="label" num color={fg} style={{ fontFamily: "Manrope_700Bold" }}>
        {text}
      </Txt>
    </Pressable>
  );
}

/** Vignette produit (rayon 10) ; placeholder `skeleton` sans image. */
export function Thumb({ uri, size: s = size.thumb }: { uri?: string | null; size?: number }) {
  const safe = typeof uri === "string" && /^https:\/\//i.test(uri) ? uri : null;
  if (!safe) return <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: s, height: s, borderRadius: radius.md, backgroundColor: color.skeleton }} />;
  return <Image source={{ uri: safe }} accessibilityIgnoresInvertColors style={{ width: s, height: s, borderRadius: radius.md, backgroundColor: color.skeleton }} />;
}

export function Avatar({ initials, size: s = 36, dark = true, onPress, label }: { initials: string; size?: number; dark?: boolean; onPress?: () => void; label?: string }) {
  const body = (
    <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: dark ? color.ink : color.line, alignItems: "center", justifyContent: "center" }}>
      <Txt variant="label" color={dark ? color.inkOnDark : color.ink} style={{ fontFamily: "Manrope_800ExtraBold" }}>
        {initials}
      </Txt>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? "Compte"} onPress={onPress} hitSlop={6}>
      {body}
    </Pressable>
  );
}

/** Initiales (2 lettres) d'un nom ou d'un email. */
export function initialsOf(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t) return "?";
  const base = t.includes("@") ? t.split("@")[0]!.replace(/[._-]+/g, " ") : t;
  const parts = base.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : base.slice(0, 2);
  return letters.toUpperCase();
}
