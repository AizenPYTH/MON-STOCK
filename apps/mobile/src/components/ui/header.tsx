import { createContext, useContext, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { ChevronLeft } from "lucide-react-native";
import { color, radius, size, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";
import { Txt } from "~/components/ui/text";
import { StageFigure, StageStats } from "~/components/ui/instrument";

/**
 * Scène nuit v5 (« vitre de l'instrument ») : fond bleu nuit sous la zone de statut, rangée de
 * navigation 44 pt (« ‹ Parent » + actions), sur-titre en capitales mono, titre 26/32, chiffre
 * fin facultatif (Manrope 300) avec 2 à 4 relevés séparés par des filets, emplacement `stage`
 * pour un graphique-signature, onglets intercalaires facultatifs. Sans onglets, le papier
 * remonte de 24 pt.
 */

/** Vrai à l'intérieur du bandeau : les boutons icônes passent en style « sur fond sombre ». */
export const OnDarkContext = createContext(false);
export function useOnDark() {
  return useContext(OnDarkContext);
}

export type HeaderStat = { label: string; value: string; tone?: "positive" | "warning" | "negative"; onPress?: () => void };
export type HeaderTabs<T extends string> = { options: { value: T; label: string; unit?: string; a11y?: string }[]; value: T; onChange: (v: T) => void; size?: "md" | "lg" };

const STAT_TONE = { positive: "mint", warning: "warning", negative: "danger" } as const;
export type HeaderHero = { value: string; label?: string; sub?: string; color?: string; stats?: HeaderStat[]; size?: "xl" | "lg" | "md"; aside?: ReactNode };

export function NightHeader<T extends string = string>({
  back,
  right,
  over,
  title,
  sub,
  hero,
  tabs,
  stage,
  topInset = true,
}: {
  back?: { label: string; onPress: () => void };
  right?: ReactNode;
  over?: string;
  title?: string;
  sub?: string;
  hero?: HeaderHero;
  tabs?: HeaderTabs<T>;
  /** graphique-signature ou contenu libre de la scène (sous le chiffre) */
  stage?: ReactNode;
  /** gère la zone de statut (désactivé si l'écran la gère déjà) */
  topInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { screenX, compact } = useLayout();
  const lg = tabs?.size === "lg";
  return (
    <OnDarkContext.Provider value>
      <View style={{ backgroundColor: color.brand, paddingTop: topInset ? insets.top : 0 }}>
        <View style={{ paddingHorizontal: screenX, paddingBottom: tabs ? space[3] : space.bodyOverlap + space[5] }}>
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
            <Txt variant="mono" color={color.inkOnDarkMuted} numberOfLines={1} style={{ marginTop: back || right ? 0 : space[3], marginBottom: 4 }}>
              {over}
            </Txt>
          ) : null}
          {title ? (
            <Txt variant="title1" color={color.inkOnDark} accessibilityRole="header" numberOfLines={2} style={compact ? { fontSize: 22, lineHeight: 28 } : null}>
              {title}
            </Txt>
          ) : null}
          {sub ? (
            <Txt variant="label" color={color.inkOnDarkMuted} style={{ marginTop: 2, fontSize: 13.5, lineHeight: 19 }}>
              {sub}
            </Txt>
          ) : null}
          {hero ? (
            <View style={{ marginTop: space[4], gap: space[2] }} accessible={!hero.stats?.some((x) => x.onPress)} accessibilityLabel={`${hero.label ? `${hero.label} : ` : ""}${hero.value}${hero.sub ? `, ${hero.sub}` : ""}${hero.stats?.length ? `. ${hero.stats.map((x) => `${x.label} ${x.value}`).join(", ")}` : ""}`}>
              {hero.label ? (
                <Txt variant="monoSm" color={color.inkOnDarkMuted} numberOfLines={1}>
                  {hero.label}
                </Txt>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space[3] }}>
                <StageFigure value={hero.value} size={hero.size ?? (compact ? "md" : "md")} tone={hero.color} />
                {hero.aside}
              </View>
              {hero.sub ? (
                <Txt variant="label" color={color.inkOnDarkMuted}>
                  {hero.sub}
                </Txt>
              ) : null}
              {hero.stats?.length ? <StageStats style={{ marginTop: space[2] }} stats={hero.stats.map((x) => ({ label: x.label, value: x.value, tone: x.tone ? STAT_TONE[x.tone] : undefined, onPress: x.onPress }))} /> : null}
            </View>
          ) : null}
          {stage}
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
