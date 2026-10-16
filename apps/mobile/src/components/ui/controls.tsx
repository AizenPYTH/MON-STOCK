import type { ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Package } from "lucide-react-native";
import { color, radius, shadow, size, space } from "~/theme/tokens";
import { Txt } from "~/components/ui/text";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

const BUTTON: Record<ButtonVariant, { bg: string; bgPressed: string; fg: string; border?: string }> = {
  primary: { bg: color.mint, bgPressed: color.mintPressed, fg: color.onMint },
  secondary: { bg: color.surface, bgPressed: color.surfacePressed, fg: color.ink, border: color.lineStrong },
  ghost: { bg: "transparent", bgPressed: color.lineSoft, fg: color.ink },
  destructive: { bg: color.dangerSoft, bgPressed: "#F6DADA", fg: color.dangerInk },
};

/**
 * Bouton v4 : 52 pt (36 compact), rayon 14 (10 compact). primary = menthe avec texte bleu nuit
 * (une seule grande surface menthe par écran) ; secondary = blanc à filet ; ghost ;
 * destructive. Pressé : couleur plus dense et scale 0,98. Désactivé : gris clair, texte ink3.
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
          borderRadius: compact ? radius.md : radius.xl,
          paddingHorizontal: compact ? space[3] : space[4],
          flexDirection: "row",
          gap: space[2],
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: disabled ? color.surfaceSunken : pressed ? v.bgPressed : v.bg,
          borderWidth: v.border && !disabled ? 1 : 0,
          borderColor: v.border ?? "transparent",
          transform: [{ scale: pressed && !inactive ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon}
          <Txt variant="body" color={fg} style={{ fontFamily: "Manrope_800ExtraBold", fontSize: compact ? 14 : 16, lineHeight: 20, textAlign: "center" }}>
            {label}
          </Txt>
        </>
      )}
    </Pressable>
  );
}

/** Bouton icône 36 dans une zone tactile de 44, rayon 12. `filled` = bleu nuit ; `onDark` = sur bandeau nuit. */
export function IconButton({ icon, label, onPress, filled = false, onDark = false }: { icon: ReactNode; label: string; onPress: () => void; filled?: boolean; onDark?: boolean }) {
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
        borderRadius: radius.lg,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: onDark ? (filled ? color.mint : color.nightRaised) : filled ? color.brand : pressed ? color.surfacePressed : color.surface,
        borderWidth: onDark || filled ? 0 : 1,
        borderColor: color.line,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      {icon}
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: color.track, borderRadius: radius.lg, padding: 3 }}>
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
            style={[{ flex: 1, minHeight: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: space[2], backgroundColor: selected ? color.surface : "transparent" }, selected ? shadow.card : null]}
          >
            <Txt variant="label" color={selected ? color.ink : color.ink2} style={{ fontFamily: "Manrope_700Bold" }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Filtre v4. Sélectionné : bleu nuit, texte clair. Repos : blanc à filet (sur le canvas).
 * `tone` n'ajoute qu'un point coloré (jamais une pastille pleine).
 */
export function FilterChip({ label, count, selected, tone, onPress }: { label: string; count?: number; selected: boolean; tone?: "danger" | "accent"; onPress: () => void }) {
  const text = count === undefined ? label : `${label} · ${count}`;
  const dot = tone === "danger" ? color.danger : tone === "accent" ? color.accent : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={text}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 34,
        paddingHorizontal: space[3],
        borderRadius: radius.pill,
        backgroundColor: selected ? color.brand : pressed ? color.surfacePressed : color.surface,
        borderWidth: 1,
        borderColor: selected ? color.brand : color.line,
      })}
    >
      {dot && !selected && (count ?? 0) > 0 ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} /> : null}
      <Txt variant="label" num color={selected ? color.inkOnDark : color.ink} style={{ fontFamily: "Manrope_700Bold" }}>
        {text}
      </Txt>
    </Pressable>
  );
}

/** Vignette produit 44 (rayon 10) ; sans image : pictogramme « colis » discret (jamais une fausse photo). */
export function Thumb({ uri, size: s = size.thumb }: { uri?: string | null; size?: number }) {
  const safe = typeof uri === "string" && /^https:\/\//i.test(uri) ? uri : null;
  if (!safe)
    return (
      <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: s, height: s, borderRadius: radius.md, backgroundColor: color.surfaceSunken, borderWidth: 1, borderColor: color.lineSoft, alignItems: "center", justifyContent: "center" }}>
        <Package size={Math.round(s * 0.42)} color={color.ink3} strokeWidth={1.6} />
      </View>
    );
  return <Image source={{ uri: safe }} accessibilityIgnoresInvertColors style={{ width: s, height: s, borderRadius: radius.md, backgroundColor: color.skeleton }} />;
}

export function Avatar({ initials, size: s = size.iconButton, dark = true, onPress, label }: { initials: string; size?: number; dark?: boolean; onPress?: () => void; label?: string }) {
  const body = (
    <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: dark ? color.brand : color.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
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
