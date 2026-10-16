import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import { color, radius, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";
import { Txt } from "~/components/ui/text";

export type QtyLevel = "out" | "low" | "ok";

/**
 * Quantité en liste (v3) : le chiffre reste en encre ; seuls un point coloré et le mot signalent
 * rupture ou faible (la couleur n'est jamais seule, pas de pastille pleine).
 */
export function QtyBadge({ qty, level }: { qty: number; level: QtyLevel }) {
  const label = level === "out" ? "rupture" : level === "low" ? "faible" : "en stock";
  const dot = level === "out" ? color.danger : level === "low" ? color.accent : null;
  const fg = level === "out" ? color.dangerInk : level === "low" ? color.accentInkOnSoft : color.ink3;
  return (
    <View style={{ alignItems: "flex-end", minWidth: 52 }} accessible accessibilityLabel={`${qty} disponible(s), ${label}`}>
      <Txt variant="kpiSm" num>
        {qty}
      </Txt>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} /> : null}
        <Txt variant="label" color={fg} style={{ fontSize: 12, lineHeight: 16 }}>
          {label}
        </Txt>
      </View>
    </View>
  );
}

export type ChipTone = "accent" | "neutral" | "success" | "danger" | "dark";

const CHIP: Record<ChipTone, { fg: string; bg: string }> = {
  accent: { fg: color.accentInkOnSoft, bg: color.accentSoft },
  neutral: { fg: color.ink2, bg: color.surfaceSunken },
  success: { fg: color.success, bg: color.successSoft },
  danger: { fg: color.dangerInk, bg: color.dangerSoft },
  dark: { fg: color.inkOnDark, bg: color.brand },
};

export function StatusChip({ label, tone }: { label: string; tone: ChipTone }) {
  const c = CHIP[tone];
  return (
    <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.xs, backgroundColor: c.bg, alignSelf: "flex-start" }}>
      <Txt variant="micro" color={c.fg} style={{ textTransform: "none", letterSpacing: 0 }}>
        {label}
      </Txt>
    </View>
  );
}

export type TileTone = "dark" | "success" | "accent" | "danger" | "neutral" | "unknown";

const TILE: Record<TileTone, { bg: string; fg: string; label: string; reason: string; border?: string; dashed?: boolean }> = {
  dark: { bg: color.brand, fg: color.inkOnDark, label: color.inkOnDarkMuted, reason: color.inkOnDarkMuted },
  success: { bg: color.successSoft, fg: color.success, label: color.success, reason: color.success },
  accent: { bg: color.accentSoft, fg: color.accentInkOnSoft, label: color.accentInkOnSoft, reason: color.accentInkOnSoft },
  danger: { bg: color.dangerSoft, fg: color.dangerInk, label: color.dangerInk, reason: color.dangerInk },
  neutral: { bg: color.card, fg: color.ink, label: color.ink3, reason: color.ink2, border: color.line },
  unknown: { bg: "transparent", fg: color.ink3, label: color.ink3, reason: color.accentInkOnSoft, border: color.accent, dashed: true },
};

/**
 * Tuile du handoff (remplace KpiCard / HeroCard) : rayon 20, padding 16, overline + valeur kpi +
 * raison. `unknown` = bordure pointillée ambre et valeur « — » (jamais 0).
 */
export function Tile({ label, value, reason, reasonTone, tone = "neutral", onPress, selected, testID }: { label: string; value: string | null; reason?: string; reasonTone?: "success" | "danger"; tone?: TileTone; onPress?: () => void; selected?: boolean; testID?: string }) {
  const t = TILE[value === null ? "unknown" : tone];
  const dark = t.bg === color.brand;
  const reasonColor = reasonTone === "success" ? (dark ? color.successOnDark : color.success) : reasonTone === "danger" ? (dark ? color.dangerOnDark : color.dangerInk) : t.reason;
  const shown = value ?? "—";
  const body = (
    <View
      style={{
        flex: 1,
        minHeight: 88,
        padding: space[4],
        borderRadius: radius.xl,
        backgroundColor: t.bg,
        borderWidth: selected ? 2 : t.dashed ? 1.5 : t.border ? 1 : 0,
        borderStyle: t.dashed ? "dashed" : "solid",
        borderColor: selected ? color.ink : (t.border ?? color.ink),
        justifyContent: "space-between",
        gap: 4,
      }}
    >
      <Txt variant="overline" color={t.label} numberOfLines={2}>
        {label}
      </Txt>
      <Txt variant="kpi" num color={t.fg} adjustsFontSizeToFit numberOfLines={1}>
        {shown}
      </Txt>
      {reason ? (
        <Txt variant="label" color={reasonColor} style={{ fontSize: 12, lineHeight: 16, fontFamily: "Manrope_700Bold" }} numberOfLines={2}>
          {reason}
        </Txt>
      ) : null}
    </View>
  );
  const a11y = `${label} : ${value === null ? "inconnu" : shown}${reason ? `, ${reason}` : ""}`;
  if (!onPress) return <View style={{ flex: 1 }} accessible accessibilityLabel={a11y} testID={testID}>{body}</View>;
  return (
    <Pressable testID={testID} style={({ pressed }) => ({ flex: 1, transform: [{ scale: pressed ? 0.97 : 1 }], opacity: pressed ? 0.9 : 1 })} accessibilityRole="button" accessibilityState={{ selected: Boolean(selected) }} accessibilityLabel={a11y} onPress={onPress}>
      {body}
    </Pressable>
  );
}

/** Ancienne API (KPI) : rendue comme une tuile du handoff. */
export function KpiCard({ label, value, hint, hintTone, dark = false, onPress, selected }: { label: string; value: string; hint?: string; hintTone?: "success" | "danger"; dark?: boolean; onPress?: () => void; selected?: boolean }) {
  return <Tile label={label} value={value} reason={hint} reasonTone={hintTone} tone={dark ? "dark" : "neutral"} onPress={onPress} selected={selected} />;
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
    <View style={{ backgroundColor: color.brand, borderRadius: radius.xl, padding: space[5] }} accessible accessibilityLabel={`${label} : ${value}. ${stats.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
      <Txt variant="bodyRegular" color={color.inkOnDarkMuted}>
        {label}
      </Txt>
      <Txt variant="hero" num color={color.inkOnDark} style={{ marginTop: space[2] }} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space[5], rowGap: space[1], marginTop: space[3] }}>
        {stats.map((s) => (
          <Txt key={s.label} variant="label" color={color.inkOnDarkMuted}>
            {s.label}{" "}
            <Txt variant="label" num color={s.tone === "success" ? color.mint : s.tone === "danger" ? color.dangerOnDark : color.inkOnDark} style={{ fontFamily: "Manrope_800ExtraBold" }}>
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
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: space[3], paddingHorizontal: 14, borderRadius: radius.xl, backgroundColor: dark ? color.brand : color.accentSoft }}>
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
              backgroundColor: s.state === "done" ? color.brand : s.state === "current" ? color.accentSoft : "transparent",
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
            <Txt variant="label" num color={s.metaTone === "accent" ? color.accentInkOnSoft : color.ink3} style={s.metaTone === "accent" ? { fontFamily: "Manrope_700Bold" } : null}>
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
            <View style={{ height: Math.max(2, (d.value / max) * height), backgroundColor: i === data.length - 1 ? color.brand : color.lineStrong, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
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

// ---------------------------------------------------------------------------------------------
// Langage de confiance : chiffre nu = certain · « ≈ » = estimé · « — » = inconnu (jamais 0)
// ---------------------------------------------------------------------------------------------
export type TrustKind = "api" | "manual" | "file" | "public" | "unverified" | "missing" | "freshness";

/**
 * Badge d'origine / de fiabilité (rayon 6, 11/14 ×700, 4×8). `freshness` : neutre ≤ 7 j, ambre
 * au-delà ; `missing` : bordure pointillée ambre, fond transparent.
 */
export function TrustBadge({ kind, label, ageDays }: { kind: TrustKind; label?: string; ageDays?: number }) {
  const text =
    label ??
    (kind === "api" ? "API connectée" : kind === "manual" ? "Saisie manuelle" : kind === "file" ? "Fichier importé" : kind === "public" ? "Catalogue public" : kind === "unverified" ? "Non vérifié" : kind === "missing" ? "Donnée manquante" : `observé il y a ${ageDays ?? "?"} j`);
  const stale = kind === "freshness" && (ageDays === undefined || ageDays > 7);
  const st =
    kind === "api"
      ? { bg: color.brand, fg: color.inkOnDark }
      : kind === "unverified" || stale
        ? { bg: color.accentSoft, fg: color.accentInkOnSoft }
        : kind === "missing"
          ? { bg: "transparent", fg: color.accentInkOnSoft, border: color.accent }
          : { bg: color.lineSoft, fg: color.ink2 };
  return (
    <View
      accessible
      accessibilityLabel={text}
      style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.xs, backgroundColor: st.bg, borderWidth: "border" in st ? 1.5 : 0, borderStyle: "dashed", borderColor: "border" in st ? st.border : "transparent" }}
    >
      {kind === "api" ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.inkOnDark }} /> : null}
      <Txt variant="micro" color={st.fg} style={{ textTransform: "none", letterSpacing: 0 }}>
        {text}
      </Txt>
    </View>
  );
}

/** Valeur estimée : préfixe « ≈ » ; un appui affiche la raison (coût manquant, taux supposé…). */
export function Estimate({ value, reason, variant = "body", color: fg = color.ink }: { value: string | null; reason: string; variant?: "body" | "kpi" | "kpiSm" | "headline"; color?: string }) {
  const [open, setOpen] = useState(false);
  if (value === null)
    return (
      <Txt variant={variant} num color={color.ink3} accessibilityLabel={`inconnu : ${reason}`}>
        —
      </Txt>
    );
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`environ ${value}, estimé : ${reason}`} accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} hitSlop={8}>
      <Txt variant={variant} num color={fg}>
        ≈ {value}
      </Txt>
      {open ? (
        <Txt variant="label" color={color.accentInkOnSoft} style={{ fontSize: 12, lineHeight: 16 }}>
          {reason}
        </Txt>
      ) : null}
    </Pressable>
  );
}

/** Qualité des données : 4 segments 14×6 (prix · fraîcheur · port · TVA), pleins en `ink`. */
export function QualityBars({ filled, total = 4, label }: { filled: number; total?: number; label?: string }) {
  const n = Math.max(0, Math.min(total, Math.round(filled)));
  return (
    <View style={{ flexDirection: "row", gap: 3 }} accessible accessibilityLabel={label ?? `Qualité des données : ${n} sur ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ width: 14, height: 6, borderRadius: 3, backgroundColor: i < n ? color.brand : color.line }} />
      ))}
    </View>
  );
}
