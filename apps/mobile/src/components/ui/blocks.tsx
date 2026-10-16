import { useState, type ComponentType, type ReactNode } from "react";
import { Animated, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleHelp, Minus, TrendingUp } from "lucide-react-native";
import { color, dealTone, radius, space } from "~/theme/tokens";
import { Txt } from "~/components/ui/text";
import { cardStyle } from "~/components/ui/layout";
import { formatNumber } from "~/lib/format";
import { useAnimatedProgress, useReduceMotion } from "~/components/ui/motion";
import { useLayout } from "~/theme/layout";

/**
 * Blocs v4 (docs/design-system.md) : pictogramme teinté, ligne d'action, raccourci, bande de
 * chiffres, barre de progression, barre de répartition, section repliable, badge de rentabilité.
 * Tous signalent un état par une icône ou un libellé, jamais par la seule couleur.
 */

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
export type BlockTone = "danger" | "warning" | "info" | "success" | "neutral" | "brand";

const TONE: Record<BlockTone, { fg: string; bg: string }> = {
  danger: { fg: color.dangerInk, bg: color.dangerSoft },
  warning: { fg: color.accentInkOnSoft, bg: color.accentSoft },
  info: { fg: color.infoInk, bg: color.infoSoft },
  success: { fg: color.success, bg: color.successSoft },
  neutral: { fg: color.ink2, bg: color.surfaceSunken },
  brand: { fg: color.mint, bg: color.brand },
};

export function toneColors(tone: BlockTone) {
  return TONE[tone];
}

/** Pictogramme dans un carré teinté (rayon 10). */
export function IconBadge({ icon: Icon, tone = "neutral", size = 36 }: { icon: IconType; tone?: BlockTone; size?: number }) {
  const t = TONE[tone];
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}>
      <Icon size={Math.round(size * 0.5)} color={t.fg} strokeWidth={2.1} />
    </View>
  );
}

/**
 * Ligne d'action (alerte, tâche, réglage manquant) : pictogramme teinté, titre, détail, et à droite
 * le libellé de l'action. Toute la ligne mène à la résolution.
 */
export function ActionRow({ icon, tone = "neutral", title, detail, cta, onPress, last = false, testID, value, valueHint, titleLines = 1, detailLines = 2 }: { icon: IconType; tone?: BlockTone; title: string; detail?: string | null; cta?: string; onPress?: () => void; last?: boolean; testID?: string; value?: string; valueHint?: string; titleLines?: number; detailLines?: number }) {
  const { compact } = useLayout();
  const body = (pressed: boolean) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: compact ? space[2] : space[3], paddingVertical: space[3], paddingHorizontal: compact ? space[3] : space[4], minHeight: 64, backgroundColor: pressed ? color.surfacePressed : "transparent", borderBottomWidth: last ? 0 : 1, borderBottomColor: color.lineSoft }}>
      <IconBadge icon={icon} tone={tone} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt variant="body" numberOfLines={titleLines}>
          {title}
        </Txt>
        {detail ? (
          <Txt variant="label" numberOfLines={detailLines} style={{ fontSize: 12.5, lineHeight: 17 }}>
            {detail}
          </Txt>
        ) : null}
      </View>
      {value ? (
        <View style={{ alignItems: "flex-end" }}>
          <Txt variant="price" num style={{ fontSize: 16 }}>
            {value}
          </Txt>
          {valueHint ? (
            <Txt variant="micro" style={{ letterSpacing: 0 }}>
              {valueHint}
            </Txt>
          ) : null}
        </View>
      ) : null}
      {cta && !compact ? (
        <View style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.xs, backgroundColor: color.surfaceSunken }}>
          <Txt variant="micro" color={color.ink} style={{ letterSpacing: 0 }} numberOfLines={1}>
            {cta}
          </Txt>
        </View>
      ) : null}
      {onPress ? <ChevronRight size={18} color={color.ink3} strokeWidth={2} /> : null}
    </View>
  );
  const a11y = `${title}${detail ? `, ${detail}` : ""}${value ? `, ${value}` : ""}${cta ? `. ${cta}` : ""}`;
  if (!onPress)
    return (
      <View accessible accessibilityLabel={a11y} testID={testID}>
        {body(false)}
      </View>
    );
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} testID={testID}>
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

/** Raccourci : carte compacte avec pictogramme, libellé et précision (grille de 2 ou 4). */
export function ShortcutTile({ icon: Icon, label, sub, onPress, testID, accent = false }: { icon: IconType; label: string; sub?: string; onPress: () => void; testID?: string; accent?: boolean }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      onPress={onPress}
      style={({ pressed }) => [cardStyle, { flex: 1, padding: space[3], gap: space[2], minHeight: 92, backgroundColor: accent ? color.brand : pressed ? color.surfacePressed : color.card, borderColor: accent ? color.brand : color.line, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: accent ? color.mint : color.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
        <Icon size={17} color={accent ? color.onMint : color.ink} strokeWidth={2.1} />
      </View>
      <View style={{ gap: 1 }}>
        <Txt variant="body" color={accent ? color.inkOnDark : color.ink} numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontFamily: "Manrope_700Bold" }}>
          {label}
        </Txt>
        {sub ? (
          <Txt variant="label" color={accent ? color.inkOnDarkMuted : color.ink3} numberOfLines={1} style={{ fontSize: 12, lineHeight: 16 }}>
            {sub}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Grille de raccourcis : 2 colonnes, rangées de même hauteur. */
export function ShortcutGrid({ children, columns = 2 }: { children: ReactNode[]; columns?: number }) {
  const rows: ReactNode[][] = [];
  children.filter(Boolean).forEach((c, i) => {
    if (i % columns === 0) rows.push([]);
    rows[rows.length - 1]!.push(c);
  });
  return (
    <View style={{ gap: space[2] }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: space[2] }}>
          {r}
          {r.length < columns ? Array.from({ length: columns - r.length }, (_, k) => <View key={`pad-${k}`} style={{ flex: 1 }} />) : null}
        </View>
      ))}
    </View>
  );
}

export type Metric = { label: string; value: string | null; hint?: string; tone?: "danger" | "warning" | "success"; onPress?: () => void; testID?: string };

const METRIC_FG = { danger: color.dangerInk, warning: color.accentInkOnSoft, success: color.success } as const;

/**
 * Bande de chiffres dans une carte (2 à 4 colonnes séparées par un filet). Une valeur inconnue
 * s'affiche « — », jamais 0.
 */
export function MetricStrip({ metrics }: { metrics: Metric[] }) {
  const { compact } = useLayout();
  const grid = compact && metrics.length > 3;
  return (
    <View style={[cardStyle, { flexDirection: "row", flexWrap: grid ? "wrap" : "nowrap", paddingVertical: space[3], rowGap: space[3] }]}>
      {metrics.map((m, i) => {
        const fg = m.tone ? METRIC_FG[m.tone] : color.ink;
        const content = (
          <View style={{ paddingHorizontal: space[3], gap: 2, borderLeftWidth: i === 0 || (grid && i % 2 === 0) ? 0 : 1, borderLeftColor: color.lineSoft }}>
            <Txt variant="micro" numberOfLines={1}>
              {m.label}
            </Txt>
            <Txt variant="kpiSm" num color={m.value === null ? color.ink3 : fg} adjustsFontSizeToFit numberOfLines={1}>
              {m.value ?? "—"}
            </Txt>
            {m.hint ? (
              <Txt variant="label" numberOfLines={1} style={{ fontSize: 11, lineHeight: 14 }}>
                {m.hint}
              </Txt>
            ) : null}
          </View>
        );
        const a11y = `${m.label} : ${m.value ?? "inconnu"}${m.hint ? `, ${m.hint}` : ""}`;
        return m.onPress ? (
          <Pressable key={m.label} testID={m.testID} style={({ pressed }) => ({ flexBasis: grid ? "50%" : undefined, flex: grid ? undefined : 1, opacity: pressed ? 0.6 : 1 })} accessibilityRole="button" accessibilityLabel={a11y} onPress={m.onPress}>
            {content}
          </Pressable>
        ) : (
          <View key={m.label} testID={m.testID} style={grid ? { flexBasis: "50%" } : { flex: 1 }} accessible accessibilityLabel={a11y}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

/** Barre de progression (rail `track`) ; remplissage animé sauf si l'animation est réduite. */
export function ProgressBar({ value, max = 1, tone = "brand", label, height = 6 }: { value: number; max?: number; tone?: BlockTone; label?: string; height?: number }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const v = useAnimatedProgress(ratio);
  const fill = tone === "brand" ? color.brand : TONE[tone].fg;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }} style={{ height, borderRadius: height / 2, backgroundColor: color.track, overflow: "hidden" }}>
      <Animated.View style={{ height, borderRadius: height / 2, backgroundColor: fill, width: v.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
    </View>
  );
}

/** Barre de répartition (ex. lignes créées / mises à jour / ignorées) avec légende chiffrée. */
export function SplitBar({ parts, label }: { parts: { label: string; value: number; tone: BlockTone }[]; label: string }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <View style={{ gap: space[2] }} accessible accessibilityLabel={`${label} : ${parts.map((p) => `${p.label} ${p.value}`).join(", ")}`}>
      <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: color.track, gap: total ? 2 : 0 }}>
        {shown.map(({ label: key, value: weight, tone }) => (
          // (pas de `x.value` dans un style : le plugin Reanimated le prendrait pour une valeur animée)
          <View key={key} style={{ flex: weight, backgroundColor: tone === "brand" ? color.brand : tone === "neutral" ? color.lineStrong : TONE[tone].fg }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space[4], rowGap: 4 }}>
        {parts.map((p) => (
          <View key={p.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: p.tone === "brand" ? color.brand : p.tone === "neutral" ? color.lineStrong : TONE[p.tone].fg }} />
            <Txt variant="label" num>
              {p.label} <Txt variant="label" num color={color.ink} style={{ fontFamily: "Manrope_800ExtraBold" }}>{formatNumber(p.value)}</Txt>
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Section repliable dans une carte : titre + résumé visibles, détail à la demande (les
 * informations techniques ne prennent pas la place au premier affichage).
 */
export function Collapsible({ title, summary, children, defaultOpen = false, icon, testID }: { title: string; summary?: string; children: ReactNode; defaultOpen?: boolean; icon?: IconType; testID?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReduceMotion();
  const [rot] = useState(() => new Animated.Value(defaultOpen ? 1 : 0));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    void Haptics.selectionAsync().catch(() => {});
    if (reduce) rot.setValue(next ? 1 : 0);
    else Animated.timing(rot, { toValue: next ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  };
  return (
    <View style={cardStyle} testID={testID}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${title}${summary ? `, ${summary}` : ""}`} onPress={toggle} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space[3], padding: space[4], opacity: pressed ? 0.7 : 1 })}>
        {icon ? <IconBadge icon={icon} size={32} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="body">{title}</Txt>
          {summary ? (
            <Txt variant="label" numberOfLines={open ? undefined : 1}>
              {summary}
            </Txt>
          ) : null}
        </View>
        <Animated.View style={{ transform: [{ rotate: rot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) }] }}>
          <ChevronDown size={18} color={color.ink3} strokeWidth={2.2} />
        </Animated.View>
      </Pressable>
      {open ? <View style={{ paddingHorizontal: space[4], paddingBottom: space[4], gap: space[2], borderTopWidth: 1, borderTopColor: color.lineSoft, paddingTop: space[3] }}>{children}</View> : null}
    </View>
  );
}

export type DealLevel = "very_good" | "good" | "average" | "not_competitive" | "insufficient_data";

const DEAL_ICON: Record<DealLevel, IconType> = { very_good: TrendingUp, good: ArrowUpRight, average: Minus, not_competitive: ArrowDownRight, insufficient_data: CircleHelp };

/** Niveau de rentabilité (analyse « bonne affaire ») : couleur + icône + libellé, sobre. « Provisoire » est annoncé (lecteur d'écran) et affiché à côté de la marge. */
export function DealBadge({ level, label, provisional = false, size = "md" }: { level: DealLevel; label: string; provisional?: boolean; size?: "sm" | "md" }) {
  const t = dealTone[level];
  const Icon = DEAL_ICON[level];
  const sm = size === "sm";
  return (
    <View
      accessible
      accessibilityLabel={`${label}${provisional ? ", marge provisoire" : ""}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: sm ? 2 : 4, paddingHorizontal: sm ? 6 : 8, borderRadius: radius.xs, backgroundColor: t.bg, borderWidth: 1, borderColor: t.border, borderStyle: level === "insufficient_data" ? "dashed" : "solid" }}
    >
      <Icon size={sm ? 11 : 13} color={t.fg} strokeWidth={2.6} />
      <Txt variant="micro" color={t.fg} style={{ letterSpacing: 0, fontSize: sm ? 10 : 11 }} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

/** Statut en texte précédé d'un point (le point n'est jamais seul). */
export function StatusLine({ tone, label }: { tone: BlockTone; label: string }) {
  const fg = TONE[tone].fg;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tone === "neutral" ? color.ink3 : tone === "brand" ? color.brand : fg }} />
      <Txt variant="label" color={tone === "neutral" ? color.ink2 : fg} style={{ fontFamily: "Manrope_700Bold" }} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

/** Étapes d'un parcours (horizontal) : faites (coche), en cours (bleu nuit), à venir (gris). */
export function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={`Étape ${Math.min(current + 1, steps.length)} sur ${steps.length} : ${steps[Math.min(current, steps.length - 1)]}`} style={{ flexDirection: "row", alignItems: "flex-start" }}>
      {steps.map((label, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <View key={label} style={{ flex: 1, alignItems: "center", gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "stretch" }}>
              <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? "transparent" : done || now ? color.brand : color.track }} />
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: done ? color.brand : now ? color.mint : color.surface, borderWidth: done || now ? 0 : 1.5, borderColor: color.lineStrong }}>
                {done ? <Check size={12} color={color.inkOnDark} strokeWidth={3} /> : <Txt variant="micro" num color={now ? color.onMint : color.ink3} style={{ letterSpacing: 0 }}>{i + 1}</Txt>}
              </View>
              <View style={{ flex: 1, height: 2, backgroundColor: i === steps.length - 1 ? "transparent" : done ? color.brand : color.track }} />
            </View>
            <Txt variant="micro" color={now ? color.ink : color.ink3} numberOfLines={1} style={{ letterSpacing: 0, fontSize: 10.5 }}>
              {label}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}
