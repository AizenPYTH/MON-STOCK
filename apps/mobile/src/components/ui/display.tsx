import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import { color, radius, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";
import { Txt } from "~/components/ui/text";

export type QtyLevel = "out" | "low" | "ok";

/** Quantité en liste : 0 / rupture → `danger`, faible → `accent`, sinon `ink`. */
export function QtyBadge({ qty, level }: { qty: number; level: QtyLevel }) {
  const fg = level === "out" ? color.danger : level === "low" ? color.accent : color.ink;
  const label = level === "out" ? "rupture" : level === "low" ? "faible" : "en stock";
  return (
    <View style={{ alignItems: "flex-end" }} accessible accessibilityLabel={`${qty} disponible(s), ${label}`}>
      <Txt variant="kpiSm" num color={fg} style={{ fontSize: 20 }}>
        {qty}
      </Txt>
      <Txt variant="label" style={{ fontSize: 11, lineHeight: 14 }}>
        {label}
      </Txt>
    </View>
  );
}

export type ChipTone = "accent" | "neutral" | "success" | "danger" | "dark";

const CHIP: Record<ChipTone, { fg: string; bg: string }> = {
  accent: { fg: color.accentInkOnSoft, bg: color.accentSoft },
  neutral: { fg: color.ink2, bg: color.lineSoft },
  success: { fg: color.success, bg: color.successSoft },
  danger: { fg: color.danger, bg: color.dangerSoft },
  dark: { fg: color.inkOnDark, bg: color.ink },
};

export function StatusChip({ label, tone }: { label: string; tone: ChipTone }) {
  const c = CHIP[tone];
  return (
    <View style={{ paddingVertical: 3, paddingHorizontal: 7, borderRadius: radius.xs, backgroundColor: c.bg, alignSelf: "flex-start" }}>
      <Txt variant="micro" color={c.fg} style={{ textTransform: "none", letterSpacing: 0 }}>
        {label}
      </Txt>
    </View>
  );
}

export function KpiCard({ label, value, hint, hintTone, dark = false, onPress, selected }: { label: string; value: string; hint?: string; hintTone?: "success" | "danger"; dark?: boolean; onPress?: () => void; selected?: boolean }) {
  const hintColor = hintTone === "success" ? (dark ? color.successOnDark : color.success) : hintTone === "danger" ? color.danger : dark ? color.inkOnDarkMuted : color.ink2;
  const body = (
    <View style={{ flex: 1, minHeight: 74, padding: space[3], borderRadius: radius.lg, backgroundColor: dark ? color.surfaceDark : color.surface, borderWidth: dark ? 0 : selected ? 1.5 : 1, borderColor: selected ? color.ink : color.line }}>
      <Txt variant="micro" color={dark ? color.inkOnDarkMuted : color.ink3} numberOfLines={2}>
        {label}
      </Txt>
      <Txt variant="kpiSm" num color={dark ? color.inkOnDark : color.ink} style={{ fontSize: 20, marginTop: 4 }} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Txt>
      {hint ? (
        <Txt variant="label" color={hintColor} style={{ fontSize: 12, fontFamily: "Manrope_700Bold" }} numberOfLines={2}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
  if (!onPress) return <View style={{ flex: 1 }} accessible accessibilityLabel={`${label} : ${value}${hint ? `, ${hint}` : ""}`}>{body}</View>;
  return (
    <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityState={{ selected: Boolean(selected) }} accessibilityLabel={`${label} : ${value}`} onPress={onPress}>
      {body}
    </Pressable>
  );
}

/** Grille de KPI : 3 colonnes (2 sur petit écran / grande police), gap 8. */
export function KpiGrid({ children, columns }: { children: ReactNode[]; columns?: number }) {
  const { kpiColumns } = useLayout();
  const cols = columns ?? kpiColumns;
  const rows: ReactNode[][] = [];
  children.forEach((c, i) => {
    if (i % cols === 0) rows.push([]);
    rows[rows.length - 1]!.push(c);
  });
  return (
    <View style={{ gap: space[2] }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: space[2] }}>
          {r}
          {r.length < cols ? Array.from({ length: cols - r.length }, (_, k) => <View key={`pad-${k}`} style={{ flex: 1 }} />) : null}
        </View>
      ))}
    </View>
  );
}

export function HeroCard({ label, value, stats }: { label: string; value: string; stats: { label: string; value: string; tone?: "success" | "danger" }[] }) {
  return (
    <View style={{ backgroundColor: color.surfaceDark, borderRadius: radius.xxl, paddingVertical: 18, paddingHorizontal: 20 }} accessible accessibilityLabel={`${label} : ${value}. ${stats.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
      <Txt variant="bodyRegular" color={color.inkOnDarkMuted}>
        {label}
      </Txt>
      <Txt variant="display" num color={color.inkOnDark} style={{ marginTop: space[2] }} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space[5], rowGap: space[1], marginTop: space[3] }}>
        {stats.map((s) => (
          <Txt key={s.label} variant="label" color={color.inkOnDarkMuted}>
            {s.label}{" "}
            <Txt variant="label" num color={s.tone === "success" ? color.successOnDark : s.tone === "danger" ? "#F0A59C" : color.inkOnDark} style={{ fontFamily: "Manrope_800ExtraBold" }}>
              {s.value}
            </Txt>
          </Txt>
        ))}
      </View>
    </View>
  );
}

export function AlertBanner({ text, tone = "accent", onPress }: { text: string; tone?: "accent" | "dark"; onPress?: () => void }) {
  const dark = tone === "dark";
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: space[3], paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: dark ? color.surfaceDark : color.accentSoft }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent }} />
      <Txt variant="bodyRegular" color={dark ? color.inkOnDark : color.accentInkOnSoft} style={{ flex: 1, fontFamily: "Manrope_600SemiBold" }}>
        {text}
      </Txt>
    </View>
  );
  if (!onPress) return <View accessibilityRole="alert">{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={text} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {body}
    </Pressable>
  );
}

export type TimelineStep = { label: string; meta?: string; state: "done" | "current" | "todo"; metaTone?: "accent" };

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View style={{ gap: space[3] }}>
      {steps.map((s) => (
        <View key={s.label} style={{ flexDirection: "row", alignItems: "center", gap: space[3] }} accessible accessibilityLabel={`${s.label}${s.meta ? `, ${s.meta}` : ""}, ${s.state === "done" ? "terminé" : s.state === "current" ? "en cours" : "à venir"}`}>
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: s.state === "done" ? color.ink : s.state === "current" ? color.accentSoft : "transparent",
              borderWidth: s.state === "done" ? 0 : s.state === "current" ? 2 : 1.5,
              borderColor: s.state === "current" ? color.accent : color.line,
            }}
          >
            {s.state === "done" ? <Check size={12} color={color.inkOnDark} strokeWidth={3} /> : null}
          </View>
          <Txt variant="body" color={s.state === "todo" ? color.ink3 : color.ink} style={{ flex: 1 }}>
            {s.label}
          </Txt>
          {s.meta ? (
            <Txt variant="label" num color={s.metaTone === "accent" ? color.accent : color.ink3} style={s.metaTone === "accent" ? { fontFamily: "Manrope_700Bold" } : null}>
              {s.meta}
            </Txt>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Histogramme simple : barres `lineStrong`, dernière `ink`, sans axe ni grille. */
export function BarChart({ data, height = 64 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space[2] }} accessibilityRole="image" accessibilityLabel={data.map((d) => `${d.label} : ${Math.round(d.value)}`).join(", ")}>
      {data.map((d, i) => (
        <View key={d.label} style={{ flex: 1, alignItems: "center", gap: 6 }}>
          <View style={{ height, width: "100%", justifyContent: "flex-end" }}>
            <View style={{ height: Math.max(2, (d.value / max) * height), backgroundColor: i === data.length - 1 ? color.ink : color.lineStrong, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
          </View>
          <Txt variant="tab" color={color.ink3}>
            {d.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** Point coloré 8 px (lignes « À faire »). */
export function Dot({ tone }: { tone: "accent" | "danger" | "neutral" }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone === "accent" ? color.accent : tone === "danger" ? color.danger : color.ink3 }} />;
}
