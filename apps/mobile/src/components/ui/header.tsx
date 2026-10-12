import { createContext, useContext, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { ChevronLeft } from "lucide-react-native";
import { color, radius, size, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";
import { Txt } from "~/components/ui/text";

/**
 * Bandeau d'en-tête v3 (« construction commune ») : fond bleu nuit sous la zone de statut,
 * ligne de navigation 44 pt (« ‹ Parent » + action courte), titre 26/32, sur-titre / sous-titre,
 * chiffre clé facultatif (40/44) avec 2 à 4 stats, et onglets intercalaires facultatifs dont
 * l'onglet actif blanc fait corps avec la page. Sans onglets, le corps blanc remonte de 22 pt.
 */

/** Vrai à l'intérieur du bandeau : les boutons icônes passent en style « sur fond sombre ». */
export const OnDarkContext = createContext(false);
export function useOnDark() {
  return useContext(OnDarkContext);
}

export type HeaderStat = { label: string; value: string; tone?: "positive" | "warning" | "negative" };
export type HeaderTabs<T extends string> = { options: { value: T; label: string; unit?: string; a11y?: string }[]; value: T; onChange: (v: T) => void; size?: "md" | "lg" };

const STAT_TONE = { positive: color.mint, warning: color.accent, negative: color.dangerOnDark } as const;

export function NightHeader<T extends string = string>({
  back,
  right,
  over,
  title,
  sub,
  hero,
  tabs,
  topInset = true,
}: {
  back?: { label: string; onPress: () => void };
  right?: ReactNode;
  over?: string;
  title?: string;
  sub?: string;
  hero?: { value: string; label?: string; sub?: string; color?: string; stats?: HeaderStat[] };
  tabs?: HeaderTabs<T>;
  /** gère la zone de statut (désactivé si l'écran la gère déjà) */
  topInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { screenX, compact } = useLayout();
  const lg = tabs?.size === "lg";
  return (
    <OnDarkContext.Provider value>
      <View style={{ backgroundColor: color.brand, paddingTop: topInset ? insets.top : 0 }}>
        <View style={{ paddingHorizontal: screenX, paddingBottom: tabs ? space[3] : space.bodyOverlap + space[4] }}>
          {back || right ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: size.touchMin }}>
              {back ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Retour : ${back.label}`}
                  hitSlop={8}
                  onPress={back.onPress}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 2, minHeight: size.touchMin, paddingRight: space[3], opacity: pressed ? 0.6 : 1 })}
                >
                  <ChevronLeft size={20} color={color.inkOnDarkMuted} strokeWidth={2.2} />
                  <Txt variant="body" color={color.inkOnDarkMuted} numberOfLines={1}>
                    {back.label}
                  </Txt>
                </Pressable>
              ) : (
                <View />
              )}
              {right ? <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>{right}</View> : null}
            </View>
          ) : null}
          {over ? (
            <Txt variant="label" color={color.inkOnDarkMuted} style={{ marginTop: back || right ? 0 : space[3] }}>
              {over}
            </Txt>
          ) : null}
          {title ? (
            <Txt variant="title1" color={color.inkOnDark} accessibilityRole="header" numberOfLines={2} style={compact ? { fontSize: 22, lineHeight: 28 } : null}>
              {title}
            </Txt>
          ) : null}
          {sub ? (
            <Txt variant="label" color={color.inkOnDarkMuted} style={{ marginTop: 2 }}>
              {sub}
            </Txt>
          ) : null}
          {hero ? (
            <View style={{ marginTop: space[3], gap: space[2] }} accessible accessibilityLabel={`${hero.label ? `${hero.label} : ` : ""}${hero.value}${hero.sub ? `, ${hero.sub}` : ""}${hero.stats?.length ? `. ${hero.stats.map((s) => `${s.label} ${s.value}`).join(", ")}` : ""}`}>
              {hero.label ? (
                <Txt variant="label" color={color.inkOnDarkMuted}>
                  {hero.label}
                </Txt>
              ) : null}
              <Txt variant="hero" num color={hero.color ?? color.inkOnDark} adjustsFontSizeToFit numberOfLines={1}>
                {hero.value}
              </Txt>
              {hero.sub ? (
                <Txt variant="label" color={color.inkOnDarkMuted} style={{ marginTop: -space[1] }}>
                  {hero.sub}
                </Txt>
              ) : null}
              {hero.stats?.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space[5], rowGap: space[2] }}>
                  {hero.stats.map((s) => (
                    <View key={s.label}>
                      <Txt variant="micro" color={color.inkOnDarkMuted}>
                        {s.label}
                      </Txt>
                      <Txt variant="kpiSm" num color={s.tone ? STAT_TONE[s.tone] : color.inkOnDark} style={{ fontSize: 16 }}>
                        {s.value}
                      </Txt>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        {tabs ? <HeaderTabsRow tabs={tabs} large={lg} /> : null}
      </View>
    </OnDarkContext.Provider>
  );
}

function HeaderTabsRow<T extends string>({ tabs, large }: { tabs: HeaderTabs<T>; large: boolean }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", paddingHorizontal: space[2] }}>
      {tabs.options.map((o) => {
        const selected = o.value === tabs.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.a11y ?? (o.unit ? `${o.label} ${o.unit}` : o.label)}
            onPress={() => {
              if (selected) return;
              void Haptics.selectionAsync().catch(() => {});
              tabs.onChange(o.value);
            }}
            style={{ flex: 1, height: large ? 70 : 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 2, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: selected ? color.surface : "transparent" }}
          >
            <Txt variant="body" color={selected ? color.ink : color.inkOnDarkSubtle} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2} style={{ fontFamily: "Manrope_800ExtraBold", fontSize: large ? (o.label.length > 4 ? 21 : 28) : 15, lineHeight: large ? 34 : 20, letterSpacing: large ? -0.8 : 0, flexShrink: 1 }}>
              {o.label}
            </Txt>
            {o.unit ? (
              <Txt variant="body" color={selected ? color.ink : color.inkOnDarkSubtle} maxFontSizeMultiplier={1.2} style={{ fontFamily: "Manrope_800ExtraBold", fontSize: large ? 16 : 13, lineHeight: large ? 22 : 18 }}>
                {o.unit}
              </Txt>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Marque les composants d'en-tête que `Screen` place dans le bandeau. */
export const NIGHT_HEADER = Symbol.for("monstock.nightHeader");
export function markHeader<P>(c: (p: P) => ReactNode, overlap = true): (p: P) => ReactNode {
  (c as unknown as Record<symbol, unknown>)[NIGHT_HEADER] = overlap;
  return c;
}

export const bodyRadius = radius.body;
