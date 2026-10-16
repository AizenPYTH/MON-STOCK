import { useState, type ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";
import { color, motion, radius, space } from "~/theme/tokens";
import { Txt } from "~/components/ui/text";
import { FillBar, Grow, useCountUp } from "~/components/ui/motion";

/**
 * Composants « Instrument » v5 (docs/design-system.md §6) : chiffre de scène, relevés,
 * mot-symbole, code-barres du stock, barres des 14 jours, règle de marché, cascade de marge,
 * barre de score. Ils n'affichent QUE des données réelles passées en paramètre : une valeur
 * inconnue s'affiche « — », jamais 0 ; une estimation est précédée de « ≈ ».
 */

// ---------------------------------------------------------------------------------------------
// Chiffre de scène
// ---------------------------------------------------------------------------------------------

/** Découpe « ≈ 9 152 € » en préfixe « ≈ », nombre « 9 152 » et unité « € ». */
export function splitFigure(value: string): { approx: boolean; number: string; unit: string } {
  let v = value.trim();
  const approx = v.startsWith("≈");
  if (approx) v = v.slice(1).trim();
  const m = /^(.*?)[\s  ]*([€$£%]|CHF|[A-Z]{3})$/.exec(v);
  if (m && m[1] && /\d/.test(m[1])) return { approx, number: m[1].trim(), unit: m[2]! };
  return { approx, number: v, unit: "" };
}

const FIGURE = {
  xl: { variant: "figureXL", unit: 30 },
  lg: { variant: "figure", unit: 26 },
  md: { variant: "figureMd", unit: 22 },
  sheet: { variant: "figureSheet", unit: 20 },
  sm: { variant: "figureSm", unit: 15 },
} as const;

/**
 * Grand chiffre fin (Manrope 300) ; l'unité monétaire est à ~45 % de la taille, graisse 500,
 * atténuée ; « ≈ » à 55 % d'opacité. Le lecteur d'écran lit la valeur complète.
 */
export function StageFigure({ value, size = "md", tone, onDark = true, numberOverride }: { value: string; size?: keyof typeof FIGURE; tone?: string; onDark?: boolean; numberOverride?: string }) {
  const f = FIGURE[size];
  const { approx, number, unit } = splitFigure(value);
  const fg = tone ?? (onDark ? color.inkOnDark : color.ink);
  const muted = onDark ? color.inkOnDarkMuted : color.ink3;
  return (
    <View accessible accessibilityLabel={value} style={{ flexDirection: "row", alignItems: "baseline", flexShrink: 1 }}>
      {approx ? (
        <Txt variant={f.variant} color={fg} style={{ opacity: 0.55 }} maxFontSizeMultiplier={1.1}>
          ≈{" "}
        </Txt>
      ) : null}
      <Txt variant={f.variant} num color={fg} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.1} style={{ flexShrink: 1 }}>
        {numberOverride ?? number}
      </Txt>
      {unit ? (
        <Txt variant="body" color={muted} maxFontSizeMultiplier={1.1} style={{ fontFamily: "Manrope_500Medium", fontSize: f.unit, lineHeight: f.unit + 2, marginLeft: unit === "%" ? 2 : 6 }}>
          {unit}
        </Txt>
      ) : null}
    </View>
  );
}

/** Chiffre de scène qui « se relève » (comptage 600 ms) à l'ouverture ou quand la valeur change. */
export function CountingFigure({ amount, format, size = "xl", animate = true }: { amount: number | null; format: (n: number) => string; size?: keyof typeof FIGURE; animate?: boolean }) {
  const shown = useCountUp(amount ?? 0, animate && amount !== null);
  if (amount === null) return <StageFigure value="—" size={size} />;
  const final = format(amount);
  const now = splitFigure(format(Math.round(shown)));
  return (
    <View accessible accessibilityLabel={final}>
      <StageFigure value={final} size={size} numberOverride={now.number} />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Relevés de la scène (2 à 4 colonnes séparées par un filet)
// ---------------------------------------------------------------------------------------------
export type StageStat = { label: string; value: string | null; note?: string; tone?: "mint" | "warning" | "danger"; onPress?: () => void; testID?: string; a11y?: string };

const STAT_FG = { mint: color.mint, warning: color.accent, danger: color.dangerOnDark } as const;

export function StageStats({ stats, size = 17, style }: { stats: StageStat[]; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", borderTopWidth: 1, borderTopColor: color.nightLine }, style]}>
      {stats.map((s, i) => {
        const { approx, number, unit } = splitFigure(s.value ?? "—");
        const body = (
          <View style={{ paddingTop: space[3], paddingLeft: i ? 14 : 0, paddingRight: 6, gap: 4, borderLeftWidth: i ? 1 : 0, borderLeftColor: color.nightLine, flex: 1 }}>
            <Txt variant="monoSm" color={color.inkOnDarkSubtle} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {s.label}
            </Txt>
            <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 5 }}>
              <Txt variant="stat" num color={s.value === null ? color.inkOnDarkMuted : s.tone ? STAT_FG[s.tone] : color.inkOnDark} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: size, lineHeight: size + 5 }}>
                {approx ? <Txt variant="stat" color={color.inkOnDarkSubtle} style={{ fontFamily: "Manrope_500Medium", fontSize: size, lineHeight: size + 5 }}>≈ </Txt> : null}
                {number}
                {unit ? ` ${unit}` : ""}
              </Txt>
              {s.note ? (
                <Txt variant="note" color={color.accent} numberOfLines={1}>
                  {s.note}
                </Txt>
              ) : null}
            </View>
          </View>
        );
        const a11y = s.a11y ?? `${s.label} : ${s.value ?? "inconnu"}${s.note ? `, ${s.note}` : ""}`;
        return s.onPress ? (
          <Pressable key={s.label} testID={s.testID} accessibilityRole="button" accessibilityLabel={a11y} onPress={s.onPress} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
            {body}
          </Pressable>
        ) : (
          <View key={s.label} testID={s.testID} accessible accessibilityLabel={a11y} style={{ flex: 1 }}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Mot-symbole « MON STOCK » (5 barres, la 3ᵉ menthe) — pas de fichier image
// ---------------------------------------------------------------------------------------------
export function Wordmark({ small = false }: { small?: boolean }) {
  const h = 14;
  const widths = [3, 1.5, 4, 1.5, 2.5];
  return (
    <View accessible accessibilityLabel="MON STOCK" style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
      <View style={{ flexDirection: "row", gap: 1.5, height: h }}>
        {widths.map((w, i) => (
          <View key={i} style={{ width: w, height: h, borderRadius: 1, backgroundColor: i === 2 ? color.mint : color.inkOnDark }} />
        ))}
      </View>
      {small ? null : (
        <Txt variant="label" color={color.inkOnDark} style={{ fontFamily: "Manrope_800ExtraBold", fontSize: 13, lineHeight: 16, letterSpacing: 2.4 }} maxFontSizeMultiplier={1.2}>
          MON STOCK
        </Txt>
      )}
    </View>
  );
}

/** Badge « DÉMO » (organisation de démonstration). */
export function DemoBadge() {
  return (
    <View accessibilityLabel="Organisation de démonstration" style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: color.demoBg }}>
      <Txt variant="monoSm" color={color.demoInk} style={{ fontFamily: "GeistMono_600SemiBold", fontSize: 9.5, letterSpacing: 0.8 }}>
        DÉMO
      </Txt>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Code-barres du stock — une barre par référence, largeur ∝ ventes 30 j, couleur = niveau
// ---------------------------------------------------------------------------------------------
export type BarcodeLevel = "ok" | "low" | "out";
export type BarcodeItem = { id: string; weight: number; level: BarcodeLevel };

const BAR_FILL: Record<BarcodeLevel, string> = { ok: color.barOk, low: color.accent, out: color.dangerOnDark };
const MAX_BARS = 60;

/**
 * Prépare les barres : tri par ventes décroissantes ; une référence sans vente garde une barre
 * fine (poids 0,4) pour rester visible ; au-delà de 60 barres, les plus petites sont regroupées en
 * une barre « autres » (couleur de leur pire niveau).
 */
export function barcodeBars(items: BarcodeItem[]): BarcodeItem[] {
  const sorted = [...items].sort((a, b) => b.weight - a.weight).map((i) => ({ ...i, weight: Math.max(i.weight, 0.4) }));
  if (sorted.length <= MAX_BARS) return sorted;
  const head = sorted.slice(0, MAX_BARS - 1);
  const tail = sorted.slice(MAX_BARS - 1);
  const worst: BarcodeLevel = tail.some((t) => t.level === "out") ? "out" : tail.some((t) => t.level === "low") ? "low" : "ok";
  return [...head, { id: "others", weight: tail.reduce((a, t) => a + t.weight, 0), level: worst }];
}

/** Remplissage hachuré vertical (traits de 2 pt espacés de 1,5 pt) dessiné en SVG. */
function Hatch({ fill, id }: { fill: string; id: string }) {
  return (
    <Svg width="100%" height="100%" style={{ position: "absolute" }}>
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={3.5} height={10}>
          <Rect x={0} y={0} width={2} height={10} fill={fill} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

export function StockBarcode({ items, height = 42, animate = true, onPress, onPressLevel, accessibilityLabel, testID }: { items: BarcodeItem[]; height?: number; animate?: boolean; onPress?: () => void; onPressLevel?: (level: BarcodeLevel) => void; accessibilityLabel: string; testID?: string }) {
  const bars = barcodeBars(items);
  const content = (
    <View style={{ flexDirection: "row", height, gap: bars.length > 40 ? 2 : 3 }}>
      {bars.map((b, i) => {
        const bar = (
          <Grow axis="y" delay={animate ? 160 + Math.min(i, 30) * motion.staggerBars : 0} duration={animate ? motion.progress : 0} style={{ flex: 1, overflow: "hidden" }}>
            <Hatch fill={BAR_FILL[b.level]} id={`h-${b.level}`} />
          </Grow>
        );
        return (
          <View key={b.id} style={{ flexGrow: b.weight, flexBasis: 0 }}>
            {onPressLevel ? (
              <Pressable accessibilityElementsHidden importantForAccessibility="no" onPress={() => onPressLevel(b.level)} style={{ flex: 1 }}>
                {bar}
              </Pressable>
            ) : (
              bar
            )}
          </View>
        );
      })}
    </View>
  );
  if (onPress && !onPressLevel)
    return (
      <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}>
        {content}
      </Pressable>
    );
  return (
    <View testID={testID} accessible={!onPressLevel} accessibilityLabel={accessibilityLabel}>
      {content}
    </View>
  );
}

/** Carré de légende + libellé (touchable si `onPress`). */
export function LegendKey({ fill, label, onPress }: { fill: string; label: string; onPress?: () => void }) {
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: fill }} />
      <Txt variant="monoSm" color={color.inkOnDark} maxFontSizeMultiplier={1.2}>
        {label}
      </Txt>
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={onPress}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

// ---------------------------------------------------------------------------------------------
// Barres des 14 jours (CA quotidien) — le jour en cours en contour menthe
// ---------------------------------------------------------------------------------------------
export function DayBars({ days, height = 44, animate = true, accessibilityLabel }: { days: { day: string; amount: number }[]; height?: number; animate?: boolean; accessibilityLabel: string }) {
  const max = Math.max(...days.map((d) => d.amount), 0);
  return (
    <View accessible accessibilityLabel={accessibilityLabel} style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height, gap: 3 }}>
        {days.map((d, i) => {
          const today = i === days.length - 1;
          const h = max > 0 ? Math.max(3, Math.round((d.amount / max) * height)) : 3;
          return (
            <Grow key={d.day} axis="y" delay={animate ? 80 + i * motion.staggerBars : 0} duration={animate ? motion.progress : 0} style={{ flex: 1, height: today ? Math.max(h, 10) : h, borderRadius: 2, backgroundColor: today ? color.barTodayBg : color.barDay, borderWidth: today ? 1.5 : 0, borderColor: color.mint }} />
          );
        })}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Txt variant="monoSm" color={color.inkOnDarkSubtle} style={{ fontSize: 9.5 }} maxFontSizeMultiplier={1.2}>
          {days.length} J
        </Txt>
        <Txt variant="monoSm" color={color.mint} style={{ fontSize: 9.5 }} maxFontSizeMultiplier={1.2}>
          Auj. en cours
        </Txt>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Règle de marché — position du coût rendu face au prix de marché médian (−40 % … +20 %)
// ---------------------------------------------------------------------------------------------

/** Position (0–1) d'un coût face au marché sur l'échelle −40 % … +20 % (marché à 2/3). */
export function rulerPosition(cost: number, market: number): number {
  if (!(market > 0) || !Number.isFinite(cost)) return 0.6667;
  return Math.max(0, Math.min(1, (cost / market - 1 + 0.4) / 0.6));
}

export function MarketRuler({ cost, market, resale, caption, emptyCaption, large = false, onDark = false }: { cost: number | null; market: number | null; resale?: number | null; caption?: string; emptyCaption?: string; large?: boolean; onDark?: boolean }) {
  const [w, setW] = useState(0);
  const rail = large ? 6 : 4;
  const h = large ? 58 : 30;
  const has = cost !== null && market !== null && market > 0;
  const capColor = onDark ? color.inkOnDarkMuted : color.ink3;
  if (!has)
    return (
      <View style={{ gap: 6 }}>
        <View style={{ height: rail, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: onDark ? color.nightStroke : color.lineStrong, marginTop: 6 }} />
        {emptyCaption ? (
          <Txt variant="code" color={capColor} style={{ fontSize: 10, letterSpacing: 0.3, textTransform: "uppercase" }} numberOfLines={2}>
            {emptyCaption}
          </Txt>
        ) : null}
      </View>
    );
  const pc = rulerPosition(cost, market);
  const pm = rulerPosition(market, market);
  const pr = resale ? rulerPosition(resale, market) : null;
  const below = cost <= market;
  const dot = large ? 16 : 10;
  const tick = large ? 18 : 12;
  const ink = onDark ? color.inkOnDark : color.ink;
  const railTop = (large ? 24 : 10) - rail / 2;
  return (
    <View style={{ gap: large ? 2 : 6 }}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: large ? 48 : 20 }} accessible accessibilityLabel={`Coût rendu ${caption ?? ""}`}>
        <View style={{ position: "absolute", left: 0, right: 0, top: railTop, height: rail, borderRadius: rail / 2, backgroundColor: onDark ? color.nightStroke : color.track }} />
        {w > 0 ? (
          <>
            <View style={{ position: "absolute", top: railTop, height: rail, left: Math.min(pc, pm) * w, width: Math.abs(pm - pc) * w, backgroundColor: below ? (onDark ? color.mint : color.success) : color.danger }} />
            <View style={{ position: "absolute", top: railTop + rail / 2 - tick / 2, left: pm * w - 1, width: 2, height: tick, backgroundColor: ink }} />
            {pr !== null ? <View style={{ position: "absolute", top: railTop + rail / 2 - 6, left: pr * w - 6, width: 12, height: 12, backgroundColor: color.mint, transform: [{ rotate: "45deg" }], borderWidth: 2, borderColor: onDark ? color.surfaceDeep : color.card }} /> : null}
            <View style={{ position: "absolute", top: railTop + rail / 2 - dot / 2, left: pc * w - dot / 2, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: ink, borderWidth: 2.5, borderColor: onDark ? color.surfaceDeep : color.card }} />
          </>
        ) : null}
      </View>
      {caption ? (
        <Txt variant="code" color={capColor} style={{ fontSize: 10, letterSpacing: 0.3, textTransform: "uppercase" }} numberOfLines={1} adjustsFontSizeToFit>
          {caption}
        </Txt>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Barre de score /100
// ---------------------------------------------------------------------------------------------
export function ScoreBar({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }} accessible accessibilityLabel={`Score ${s} sur 100`}>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: color.track, overflow: "hidden" }}>
        <FillBar ratio={s / 100} style={{ backgroundColor: color.ink, borderRadius: 3 }} />
      </View>
      <Txt variant="code" num color={color.ink2} style={{ fontSize: 10.5 }}>
        SCORE {s}/100
      </Txt>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Cascade de marge — chaque ligne avec une barre ∝ |montant| / revente
// ---------------------------------------------------------------------------------------------
export type WaterfallLine = { label: string; note?: string; amount: number | null; kind: "base" | "minus" | "result" };

export function MarginWaterfall({ lines, format }: { lines: WaterfallLine[]; format: (n: number) => string }) {
  const base = Math.abs(lines.find((l) => l.kind === "base")?.amount ?? 0);
  return (
    <View style={{ backgroundColor: color.card, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, paddingVertical: 4, paddingHorizontal: 14 }}>
      {lines.map((l, i) => {
        const v = l.amount;
        const text = v === null ? "—" : l.kind === "minus" ? `− ${format(Math.abs(v))}` : l.kind === "result" ? `${v >= 0 ? "≈ +" : "≈ −"}${format(Math.abs(v))}` : format(v);
        const fill = l.kind === "base" ? color.ink : l.kind === "result" ? (v !== null && v < 0 ? color.danger : color.success) : color.lineStrong;
        const ratio = base > 0 && v !== null ? Math.abs(v) / base : 0;
        return (
          <View key={`${l.label}-${i}`} accessible accessibilityLabel={`${l.label}${l.note ? ` (${l.note})` : ""} : ${text}`} style={{ paddingVertical: 9, gap: 6, borderTopWidth: i ? 1 : 0, borderTopColor: color.lineSoft }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Txt variant="body" style={{ flexShrink: 1, fontSize: 14, fontFamily: l.kind === "minus" ? "Manrope_600SemiBold" : "Manrope_700Bold" }} color={l.kind === "minus" ? color.ink2 : color.ink} numberOfLines={1}>
                {l.label}
              </Txt>
              {l.note ? (
                <Txt variant="code" style={{ fontSize: 10 }} numberOfLines={1}>
                  {l.note}
                </Txt>
              ) : null}
              <View style={{ flex: 1 }} />
              <Txt variant="body" num style={{ fontSize: 14, fontFamily: l.kind === "minus" ? "Manrope_600SemiBold" : "Manrope_800ExtraBold" }} color={l.kind === "result" ? fill : l.kind === "minus" ? color.ink2 : color.ink}>
                {text}
              </Txt>
            </View>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: color.bg, overflow: "hidden" }}>
              <FillBar ratio={ratio} delay={160 + Math.min(i, 8) * motion.staggerCards} style={{ backgroundColor: fill, borderRadius: 2 }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Titre de section v5 (mono capitales + compteur + annotation ou lien à droite)
// ---------------------------------------------------------------------------------------------
export function MonoTitle({ title, count, aside, onDark = false, right }: { title: string; count?: number | string; aside?: string; onDark?: boolean; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 22, gap: space[2] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
        <Txt variant="mono" color={onDark ? color.inkOnDarkMuted : color.ink2} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Txt>
        {count !== undefined ? (
          <Txt variant="mono" num color={onDark ? color.inkOnDark : color.ink}>
            {count}
          </Txt>
        ) : null}
      </View>
      {right ?? (aside ? (
        <Txt variant="code" color={onDark ? color.inkOnDarkSubtle : color.ink3} numberOfLines={1}>
          {aside}
        </Txt>
      ) : null)}
    </View>
  );
}
