import type { ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { color, radius, size, space } from "~/theme/tokens";
import { Txt } from "~/components/ui/text";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

const BUTTON: Record<ButtonVariant, { bg: string; fg: string; border: number }> = {
  primary: { bg: color.ink, fg: color.inkOnDark, border: 0 },
  secondary: { bg: color.surface, fg: color.ink, border: 0 },
  ghost: { bg: "transparent", fg: color.ink, border: 0 },
  destructive: { bg: color.surface, fg: color.danger, border: 0 },
};

/**
 * Bouton « Pill » du handoff : 52 pt (44 compact), rayon pilule, libellé 16/20 ×700 porteur de
 * valeur (« Enregistrer +2 ») ; « … » final = ouvre une confirmation. Appui : scale 0,97.
 */
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
  icon,
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
  icon?: ReactNode;
}) {
  const inactive = disabled || loading;
  const v = BUTTON[variant];
  const bg = disabled ? color.lineStrong : v.bg;
  const fg = disabled ? color.ink3 : v.fg;
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
          minHeight: compact ? size.buttonCompact : size.button,
          borderRadius: radius.pill,
          paddingHorizontal: compact ? space[4] : space[5],
          flexDirection: "row",
          gap: space[2],
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
          borderWidth: v.border,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon}
          <Txt variant="body" color={fg} style={{ fontFamily: "Manrope_700Bold", fontSize: compact ? 15 : 16, lineHeight: 20, textAlign: "center" }}>
            {label}
          </Txt>
        </>
      )}
    </Pressable>
  );
}

/** Bouton icône 40 pt (zone tactile 44) : surface blanche, ou plein `ink`. */
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
        opacity: pressed ? 0.9 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {icon}
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: color.surfaceSunken, borderRadius: radius.lg, padding: 3 }}>
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
            style={[{ flex: 1, minHeight: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: space[2] }, selected ? { backgroundColor: color.surface } : null]}
          >
            <Txt variant="label" color={selected ? color.ink : color.ink2} style={{ fontFamily: "Manrope_700Bold", fontSize: 14 }} numberOfLines={1}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Chip du handoff : 9×14, pilule, 13/18 ×700 ; sélectionnée `ink` / blanc ; tons ambre / rouge. */
export function FilterChip({ label, count, selected, tone, onPress }: { label: string; count?: number; selected: boolean; tone?: "danger" | "accent"; onPress: () => void }) {
  const fg = selected ? color.inkOnDark : tone === "danger" ? color.dangerInk : tone === "accent" ? color.accentInkOnSoft : color.ink;
  const bg = selected ? color.ink : tone === "danger" ? color.dangerSoft : tone === "accent" ? color.accentSoft : color.surface;
  const text = count === undefined ? label : `${label} · ${count}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={text}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        backgroundColor: bg,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Txt variant="label" num color={fg} style={{ fontFamily: "Manrope_700Bold" }}>
        {text}
      </Txt>
    </Pressable>
  );
}

/** Vignette produit 44 (rayon 12) ; placeholder `skeletonStrong` sans image. */
export function Thumb({ uri, size: s = size.thumb }: { uri?: string | null; size?: number }) {
  const safe = typeof uri === "string" && /^https:\/\//i.test(uri) ? uri : null;
  if (!safe) return <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: s, height: s, borderRadius: radius.md, backgroundColor: color.skeletonStrong }} />;
  return <Image source={{ uri: safe }} accessibilityIgnoresInvertColors style={{ width: s, height: s, borderRadius: radius.md, backgroundColor: color.skeleton }} />;
}

export function Avatar({ initials, size: s = size.iconButton, dark = true, onPress, label }: { initials: string; size?: number; dark?: boolean; onPress?: () => void; label?: string }) {
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
