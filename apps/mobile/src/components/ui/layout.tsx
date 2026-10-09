import type { ReactElement, ReactNode } from "react";
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { color, radius, shadow, size, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";
import { Txt } from "~/components/ui/text";

/** Écran : SafeArea, fond `bg`, marge horizontale 20 (24 si ≥ 430), contenu centré sur tablette. */
export function Screen({
  children,
  scroll = true,
  refreshControl,
  footer,
  contentGap = space.blockGap,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: ReactElement;
  footer?: ReactNode;
  contentGap?: number;
}) {
  const { screenX, maxWidth } = useLayout();
  const inner: ViewStyle = { paddingHorizontal: screenX, gap: contentGap, width: "100%", maxWidth, alignSelf: "center" };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { paddingTop: space[2], paddingBottom: space[8] }]} keyboardShouldPersistTaps="handled" refreshControl={refreshControl as never}>
          {children}
        </ScrollView>
      ) : (
        <View style={[inner, { flex: 1, paddingTop: space[2] }]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

/** En-tête d'onglet : titre `title1` (+ sur-titre éventuel) et actions à droite. */
export function TabHeader({ title, overline, right }: { title: string; overline?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingTop: space[3] }}>
      <View style={{ flexShrink: 1 }}>
        {overline ? <Txt variant="label">{overline}</Txt> : null}
        <Txt variant="title1" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Txt>
      </View>
      {right ? <View style={{ flexDirection: "row", gap: space[2] }}>{right}</View> : null}
    </View>
  );
}

/** En-tête d'écran de détail : chevron + libellé du parent, action à droite. */
export function DetailHeader({ parentLabel, right, onBack }: { parentLabel: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: size.touchMin }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Retour : ${parentLabel}`}
        hitSlop={8}
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/intelligence")))}
        style={{ flexDirection: "row", alignItems: "center", gap: 2, minHeight: size.touchMin, paddingRight: space[3] }}
      >
        <ChevronLeft size={22} color={color.ink} strokeWidth={2} />
        <Txt variant="body">{parentLabel}</Txt>
      </Pressable>
      {right}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space[1] }}>
      <Txt variant="overline" accessibilityRole="header">
        {title}
      </Txt>
      {action ? (
        <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={10}>
          <Txt variant="label" color={color.ink} style={{ fontFamily: "Manrope_700Bold" }}>
            {action.label}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({ children, padded = false, style, accessibilityLabel }: { children: ReactNode; padded?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[{ backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.xl, overflow: "hidden" }, padded ? { paddingVertical: 14, paddingHorizontal: 16 } : null, style]}
    >
      {children}
    </View>
  );
}

/** Ligne de liste : vignette éventuelle, titre, sous-titre, élément droit ; fond `lineSoft` à l'appui. */
export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  chevron = false,
  last = false,
  accessibilityLabel,
  testID,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  last?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const content = (pressed: boolean) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[3],
        paddingVertical: space[3],
        paddingHorizontal: space[4],
        minHeight: 56,
        backgroundColor: pressed ? color.lineSoft : "transparent",
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: color.lineSoft,
      }}
    >
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="body" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="label" numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
      {chevron ? <ChevronRight size={18} color={color.ink3} strokeWidth={2} /> : null}
    </View>
  );
  if (!onPress) return <View accessible accessibilityLabel={accessibilityLabel}>{content(false)}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? `${title}${subtitle ? `, ${subtitle}` : ""}`} onPress={onPress}>
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

/** Barre d'actions fixée en bas (fond `bg`, bordure haute), safe area incluse. */
export function StickyActions({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { screenX } = useLayout();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        paddingTop: space[3],
        paddingHorizontal: screenX,
        paddingBottom: Math.max(insets.bottom, space[3]) + space[2],
        backgroundColor: color.bg,
        borderTopWidth: 1,
        borderTopColor: color.line,
      }}
    >
      {children}
    </View>
  );
}

/** Cadre de carte continu autour d'une suite de lignes d'une liste virtualisée (FlatList / SectionList). */
export function RowFrame({ children, first, last }: { children: ReactNode; first: boolean; last: boolean }) {
  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderColor: color.line,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderTopWidth: first ? 1 : 0,
        borderBottomWidth: last ? 1 : 0,
        borderTopLeftRadius: first ? radius.xl : 0,
        borderTopRightRadius: first ? radius.xl : 0,
        borderBottomLeftRadius: last ? radius.xl : 0,
        borderBottomRightRadius: last ? radius.xl : 0,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: color.lineSoft }} />;
}

export { shadow };
