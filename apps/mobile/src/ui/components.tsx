import { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, font, MIN_TOUCH, radius, spacing, toneColors, type Tone } from "~/ui/theme";

export function Screen({ children, scroll = true, refreshControl, edges = ["top"] }: { children: ReactNode; scroll?: boolean; refreshControl?: React.ReactElement; edges?: ("top" | "bottom" | "left" | "right")[] }) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled" refreshControl={refreshControl as never}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screenContent, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.title} accessibilityRole="header">
        {children}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Muted({ children, style, ...props }: TextProps & { children: ReactNode }) {
  return (
    <Text style={[styles.muted, style]} {...props}>
      {children}
    </Text>
  );
}

export function Body({ children, style, ...props }: TextProps & { children: ReactNode }) {
  return (
    <Text style={[styles.body, style]} {...props}>
      {children}
    </Text>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  accessibilityHint,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}) {
  const isDisabled = disabled || loading;
  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.primary, border: colors.border },
    danger: { bg: colors.danger, fg: colors.onPrimary, border: colors.danger },
    ghost: { bg: "transparent", fg: colors.primary, border: "transparent" },
  }[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : <Text style={[styles.buttonLabel, { color: palette.fg }]}>{label}</Text>}
    </Pressable>
  );
}

export const TextField = forwardRef<TextInput, TextInputProps & { label: string; error?: string; hint?: string }>(function TextField({ label, error, hint, style, ...props }, ref) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.textSubtle}
        style={[styles.input, error ? { borderColor: colors.danger } : null, style]}
        {...props}
      />
      {error ? (
        <Text style={styles.fieldError} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.notice, { backgroundColor: c.bg, borderColor: c.fg }]} accessibilityRole="alert">
      {title ? <Text style={[styles.noticeTitle, { color: c.fg }]}>{title}</Text> : null}
      <Text style={[styles.body, { color: colors.text }]}>{children}</Text>
    </View>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: Tone }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label} : ${value}${hint ? `. ${hint}` : ""}`}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: toneColors[tone].fg } : null]}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export function LoadingState({ label = "Chargement…" }: { label?: string }) {
  return (
    <View style={styles.centered} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.muted, { marginTop: spacing.md }]}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.centered}>
      <Text style={[styles.sectionTitle, { textAlign: "center" }]}>Impossible d'afficher ces données</Text>
      <Text style={[styles.body, { textAlign: "center", marginBottom: spacing.lg }]} accessibilityLiveRegion="polite">
        {message}
      </Text>
      {onRetry ? <Button label="Réessayer" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <View style={styles.centered}>
      <Text style={[styles.sectionTitle, { textAlign: "center" }]}>{title}</Text>
      <Text style={[styles.muted, { textAlign: "center", marginBottom: spacing.lg }]}>{message}</Text>
      {action}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: spacing.sm }, style]}>{children}</View>;
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={[styles.chip, selected ? { backgroundColor: colors.primary, borderColor: colors.primary } : null]}
    >
      <Text style={[styles.chipText, selected ? { color: colors.onPrimary } : null]}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: font.headline, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: font.body, color: colors.textMuted, marginTop: spacing.xs },
  sectionTitle: { fontSize: font.title, fontWeight: "600", color: colors.text, marginBottom: spacing.sm, marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: spacing.md },
  muted: { fontSize: font.small, color: colors.textMuted, lineHeight: 18 },
  body: { fontSize: font.body, color: colors.text, lineHeight: 21 },
  button: { minHeight: MIN_TOUCH, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  buttonLabel: { fontSize: font.bodyLarge, fontWeight: "600" },
  label: { fontSize: font.small, fontWeight: "600", color: colors.text, marginBottom: spacing.xs },
  input: { minHeight: MIN_TOUCH, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: font.bodyLarge, color: colors.text, backgroundColor: colors.surface },
  fieldError: { color: colors.danger, fontSize: font.small, marginTop: spacing.xs },
  hint: { color: colors.textSubtle, fontSize: font.small, marginTop: spacing.xs },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, alignSelf: "flex-start" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  notice: { borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 4, marginBottom: spacing.md },
  noticeTitle: { fontWeight: "700", marginBottom: spacing.xs, fontSize: font.body },
  stat: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  statLabel: { fontSize: font.small, color: colors.textMuted },
  statValue: { fontSize: 22, fontWeight: "700", color: colors.text, marginTop: spacing.xs },
  statHint: { fontSize: 12, color: colors.textSubtle, marginTop: 2 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, minHeight: 240 },
  chip: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: "center" },
  chipText: { fontSize: font.small, fontWeight: "600", color: colors.text },
});
