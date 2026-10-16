import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { color, radius, shadow, size, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";
import { Txt } from "~/components/ui/text";
import { initialsOf } from "~/components/ui/controls";
import { useInTabs, useTabBarClearance } from "~/components/ui/tab-bar";
import { markHeader, NIGHT_HEADER, NightHeader, type HeaderHero, type HeaderTabs } from "~/components/ui/header";
import { TabFocusFade } from "~/components/ui/tab-focus";
import { useUser } from "~/auth/session-provider";

function headerOf(children: ReactNode): { header: ReactElement | null; rest: ReactNode[] } {
  const arr = Children.toArray(children);
  const i = arr.findIndex((c) => isValidElement(c) && typeof c.type === "function" && (c.type as unknown as Record<symbol, unknown>)[NIGHT_HEADER] !== undefined);
  if (i < 0) return { header: null, rest: arr };
  return { header: arr[i] as ReactElement, rest: arr.filter((_, k) => k !== i) };
}

/**
 * Écran v5 : scène nuit (premier `TabHeader` / `DetailHeader` / `ToolHeader` des enfants, ou
 * `header`) puis papier clair qui remonte de 24 pt (rayon 24) ; marge 16 (12 sous 360 pt, 20 à
 * partir de 430), contenu centré sur tablette. Dans un onglet, l'écran entre en fondu + 6 pt.
 * Sans en-tête : papier plein écran.
 */
export function Screen({
  children,
  scroll = true,
  refreshControl,
  footer,
  contentGap = space.blockGap,
  header: explicitHeader,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: ReactElement;
  footer?: ReactNode;
  contentGap?: number;
  header?: ReactElement;
}) {
  const { screenX, maxWidth } = useLayout();
  const clearance = useTabBarClearance();
  const inTabs = useInTabs();
  const found = explicitHeader ? { header: explicitHeader, rest: Children.toArray(children) } : headerOf(children);
  const header = found.header;
  const props = (header?.props ?? {}) as { tabs?: unknown; hero?: unknown };
  const overlap = Boolean(header) && !props.tabs;
  const inner: ViewStyle = { paddingHorizontal: screenX, gap: contentGap, width: "100%", maxWidth, alignSelf: "center" };
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[inner, { paddingTop: overlap ? 22 : space[4], paddingBottom: space[8] + clearance }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      refreshControl={refreshControl as never}
    >
      {found.rest}
    </ScrollView>
  ) : (
    <View style={[inner, { flex: 1, paddingTop: overlap ? 22 : space[4] }]}>{found.rest}</View>
  );
  if (!header)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={["top", "left", "right"]}>
        <StatusBar style="dark" />
        <TabFocusFade enabled={inTabs}>
          {body}
          {footer}
        </TabFocusFade>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.brand }} edges={["left", "right"]}>
      <StatusBar style="light" />
      <TabFocusFade enabled={inTabs}>
        {header}
        <View style={{ flex: 1, backgroundColor: color.bg, marginTop: overlap ? -space.bodyOverlap : 0, borderTopLeftRadius: overlap ? radius.body : 0, borderTopRightRadius: overlap ? radius.body : 0, overflow: "hidden" }}>
          {body}
          {footer}
        </View>
      </TabFocusFade>
    </SafeAreaView>
  );
}

/**
 * En-tête d'onglet (bandeau nuit) : titre 26/32, sur-titre, chiffre clé et onglets facultatifs,
 * actions à droite et, dans un onglet, l'avatar qui ouvre Réglages et Diagnostic.
 */
export const TabHeader = markHeader(function TabHeader<T extends string = string>({
  title,
  overline,
  sub,
  right,
  avatar,
  hero,
  tabs,
  stage,
}: {
  title: string;
  overline?: string;
  sub?: string;
  right?: ReactNode;
  avatar?: boolean;
  hero?: HeaderHero;
  tabs?: HeaderTabs<T>;
  stage?: ReactNode;
}) {
  const inTabs = useInTabs();
  const showAvatar = avatar ?? inTabs;
  const actions =
    right || showAvatar ? (
      <>
        {right}
        {showAvatar ? <AccountAvatar /> : null}
      </>
    ) : undefined;
  return <NightHeader right={actions} over={overline} title={title} sub={sub} hero={hero} tabs={tabs} stage={stage} />;
});

export function AccountAvatar() {
  const user = useUser();
  const name = (user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? user?.email;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Compte, réglages et diagnostic" onPress={() => router.push("/settings")} hitSlop={6}>
      <View style={{ width: size.iconButton, height: size.iconButton, borderRadius: size.iconButton / 2, backgroundColor: color.nightRaised, alignItems: "center", justifyContent: "center" }}>
        <Txt variant="label" color={color.inkOnDark} style={{ fontFamily: "Manrope_800ExtraBold" }}>
          {initialsOf(name)}
        </Txt>
      </View>
    </Pressable>
  );
}

/** En-tête d'écran de détail (bandeau nuit) : « ‹ Parent », action à droite, titre et sous-titre facultatifs. */
export const DetailHeader = markHeader(function DetailHeader({ parentLabel, right, onBack, title, sub, hero, over, stage }: { parentLabel: string; right?: ReactNode; onBack?: () => void; title?: string; sub?: string; hero?: HeaderHero; over?: string; stage?: ReactNode }) {
  return <NightHeader back={{ label: parentLabel, onPress: onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/today"))) }} right={right} over={over} title={title} sub={sub} hero={hero} stage={stage} />;
});

export function SectionHeader({ title, action, count }: { title: string; action?: { label: string; onPress: () => void }; count?: number }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space[4], minHeight: 24 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
        <Txt variant="section" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Txt>
        {count !== undefined ? (
          <Txt variant="section" num color={color.ink}>
            {count}
          </Txt>
        ) : null}
      </View>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${action.label} : ${title}`} onPress={action.onPress} hitSlop={12} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 2, opacity: pressed ? 0.6 : 1 })}>
          <Txt variant="label" color={color.ink} style={{ fontFamily: "Manrope_700Bold" }}>
            {action.label}
          </Txt>
          <ChevronRight size={14} color={color.ink} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Carte v5 : blanche, filet fin, SANS ombre, rayon 16. */
export const cardStyle: ViewStyle = { backgroundColor: color.card, borderRadius: radius.card, borderWidth: 1, borderColor: color.line };

export function Card({ children, padded = false, style, accessibilityLabel, testID }: { children: ReactNode; padded?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; testID?: string }) {
  // L'ombre est portée par le cadre extérieur ; le contenu (et `style` : gap, direction…) est
  // découpé à l'intérieur, pour que l'appui d'une ligne respecte les coins arrondis.
  return (
    <View accessibilityLabel={accessibilityLabel} testID={testID} style={cardStyle}>
      <View style={[{ borderRadius: radius.xl - 1, overflow: "hidden" }, padded ? { padding: space[4] } : null, style]}>{children}</View>
    </View>
  );
}

/** Ligne de liste v3 : 60 pt, filet blanc de 2 pt entre les lignes, fond `surfacePressed` à l'appui. */
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
        minHeight: 60,
        backgroundColor: pressed ? color.surfacePressed : "transparent",
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
        backgroundColor: color.surface,
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
        backgroundColor: color.card,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderTopWidth: first ? 1 : 0,
        borderBottomWidth: last ? 1 : 0,
        borderColor: color.line,
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
