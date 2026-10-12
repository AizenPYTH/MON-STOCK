import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { formatDec, type Dec } from "@/domain/tools/decimal";
import { readEntry, toEntry, type QuickResult } from "@/domain/tools/quick-calc";
import { applyKey, Keypad, NightHeader, Screen, Txt, useToast, ValueField, type HeaderTabs, type KeypadKey } from "~/components/ui";
import { useLayout } from "~/theme/layout";
import { color, space } from "~/theme/tokens";

export interface CalcField {
  key: string;
  label: string;
  unit?: string;
  /** case résultat (bleu nuit, non saisissable) */
  result?: boolean;
}

/** « 1250,5 » → « 1 250,5 » pendant la saisie (espace fine). */
export function showEntry(e: string): string {
  const [i = "", f] = e.split(",");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return f === undefined ? grouped : `${grouped},${f}`;
}

const goTools = () => (router.canGoBack() ? router.back() : router.replace("/tools"));

/**
 * Écran commun des outils de calcul (maquette v3 « Outils · version simple ») : onglets dans le
 * bandeau (taux, marge voulue, remise, devise), 2 à 4 cases-valeurs, une ligne d'aide et le
 * clavier intégré (aucun clavier système). La chaîne saisie reste la source du calcul ; en mode
 * bidirectionnel, toucher une autre case y reprend la valeur calculée.
 */
export function CalcScreen({
  title,
  tabs,
  fields,
  bidir = false,
  initialActive,
  initialEntries,
  compute,
  hint,
  right,
  testID = "calc",
}: {
  title: string;
  tabs?: HeaderTabs<string>;
  fields: CalcField[];
  bidir?: boolean;
  initialActive?: string;
  initialEntries?: Record<string, string>;
  compute: (values: Record<string, Dec | null>, active: string) => QuickResult;
  hint?: string | null;
  right?: ReactNode;
  testID?: string;
}) {
  const inputs = fields.filter((f) => !f.result);
  const [active, setActive] = useState(initialActive ?? inputs[0]!.key);
  const [entries, setEntries] = useState<Record<string, string>>(initialEntries ?? {});
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { compact, screenX } = useLayout();
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const read: Record<string, Dec | null> = {};
  for (const f of inputs) read[f.key] = bidir ? (f.key === active ? readEntry(entries[f.key]) : null) : readEntry(entries[f.key]);
  const out = compute(read, active);
  const valueOf = (key: string): Dec | null => (key in out.values ? (out.values[key] ?? null) : (read[key] ?? null));
  const fmt = (v: Dec | null) => (v ? formatDec(v) : "—");
  const anyResult = fields.some((f) => (f.result || bidir) && valueOf(f.key) !== null) && !(bidir && read[active] === null);

  function focus(key: string) {
    if (key === active) return;
    if (bidir) setEntries({ [key]: toEntry(valueOf(key)) });
    setActive(key);
    setCopied(false);
  }
  function onKey(k: KeypadKey) {
    setEntries((e) => ({ ...e, [active]: applyKey(e[active] ?? "", k) }));
    setCopied(false);
  }
  async function copy() {
    if (!anyResult) return;
    const lines = fields.map((f) => `${f.label} : ${fmt(valueOf(f.key))}${f.unit ? ` ${f.unit}` : ""}${f.result && out.sub ? ` (${out.sub})` : ""}`);
    await Clipboard.setStringAsync(`${title}\n${lines.join("\n")}\n(estimation)`);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast({ text: "Résultats copiés", tone: "success" });
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }

  const many = fields.length > 3;
  return (
    <Screen
      contentGap={space[2] + 2}
      header={
        <NightHeader
          back={{ label: "Outils", onPress: goTools }}
          title={tabs ? undefined : title}
          right={
            tabs || right ? (
              <>
                {tabs ? (
                  <Txt variant="body" color={color.inkOnDarkMuted} accessibilityRole="header" style={{ fontFamily: "Manrope_800ExtraBold" }}>
                    {title}
                  </Txt>
                ) : null}
                {right}
              </>
            ) : undefined
          }
          tabs={tabs ? { ...tabs, size: "lg" } : undefined}
        />
      }
      footer={
        <View style={{ paddingHorizontal: screenX, paddingTop: space[2], paddingBottom: Math.max(insets.bottom, space[3]) + space[2], backgroundColor: color.surface }}>
          <Keypad onKey={onKey} keyHeight={compact ? 42 : many ? 52 : 58} action={{ label: copied ? "Copié" : "Copier", onPress: () => void copy(), disabled: !anyResult }} />
        </View>
      }
    >
      {fields.map((f) => {
        if (f.result) {
          const v = valueOf(f.key);
          return <ValueField key={f.key} testID={`${testID}-field-${f.key}`} label={f.label} unit={f.unit} value={fmt(v)} sub={out.sub} highlight negative={v !== null && v.n < 0n} />;
        }
        const on = f.key === active;
        const value = on ? showEntry(entries[f.key] ?? "") : fmt(valueOf(f.key));
        return <ValueField key={f.key} testID={`${testID}-field-${f.key}`} label={f.label} unit={f.unit} value={value} active={on} caret={on} onPress={() => focus(f.key)} />;
      })}
      {hint ? (
        <Txt variant="micro" color={color.ink3} style={{ textAlign: "center", fontFamily: "Manrope_600SemiBold" }}>
          {hint}
        </Txt>
      ) : null}
    </Screen>
  );
}

/** Action courte du bandeau (36 pt, rayon 12, fond nuit relevé), ex. « Détaillé ». */
export function HeaderAction({ label, onPress, href, testID }: { label: string; onPress?: () => void; href?: string; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress ?? (() => href && router.push(href as Href))}
      style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: space[3], borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: color.nightRaised, opacity: pressed ? 0.7 : 1 })}
    >
      <Txt variant="label" color={color.inkOnDark} style={{ fontFamily: "Manrope_800ExtraBold" }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * Actions du bas (maquette v3) : fond blanc, bouton principal 56 pt rayon 16 (menthe, flex 2) et
 * action secondaire éventuelle (gris clair, flex 1). Zone de sécurité incluse.
 */
export function FooterActions({ primary, secondary }: { primary: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; tone?: "mint" | "soft"; testID?: string }; secondary?: { label: string; onPress: () => void; testID?: string } }) {
  const insets = useSafeAreaInsets();
  const { screenX } = useLayout();
  const soft = primary.tone === "soft" || primary.disabled;
  return (
    <View style={{ flexDirection: "row", gap: space[2] + 2, paddingHorizontal: screenX, paddingTop: space[3], paddingBottom: Math.max(insets.bottom, space[3]) + space[2], backgroundColor: color.surface }}>
      {secondary ? (
        <Pressable testID={secondary.testID} accessibilityRole="button" accessibilityLabel={secondary.label} onPress={secondary.onPress} style={({ pressed }) => ({ flex: 1, minHeight: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: space[2], backgroundColor: pressed ? color.line : color.surfaceSunken })}>
          <Txt variant="body" color={color.brand} numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: "Manrope_800ExtraBold", fontSize: 16 }}>
            {secondary.label}
          </Txt>
        </Pressable>
      ) : null}
      <Pressable
        testID={primary.testID}
        accessibilityRole="button"
        accessibilityLabel={primary.label}
        accessibilityState={{ disabled: Boolean(primary.disabled), busy: Boolean(primary.loading) }}
        disabled={primary.disabled || primary.loading}
        onPress={primary.onPress}
        style={({ pressed }) => ({ flex: 2, minHeight: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: space[2], backgroundColor: soft ? (pressed ? color.line : color.surfaceSunken) : pressed ? color.mintPressed : color.mint, opacity: primary.loading ? 0.7 : 1 })}
      >
        <Txt variant="body" color={primary.disabled ? color.ink3 : color.brand} numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: "Manrope_800ExtraBold", fontSize: 17 }}>
          {primary.loading ? "…" : primary.label}
        </Txt>
      </Pressable>
    </View>
  );
}
