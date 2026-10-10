import { useState, type ReactNode } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { BadgePercent, Calculator, CircleAlert, Coins, Copy, PackageSearch, Percent, Receipt, Scale, Tag, TrendingUp, Truck, X, type LucideIcon } from "lucide-react-native";
import { sanitizeAmountInput } from "@/domain/tools/decimal";
import type { ToolIcon } from "@/domain/tools/catalog";
import { Card, DetailHeader, FilterChip, Txt, useToast } from "~/components/ui";
import { color, radius, size, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

/** Composants communs aux outils : saisie de montant, résultats, copie. */

export const TOOL_ICONS: Record<ToolIcon, LucideIcon> = {
  percent: Percent,
  calculator: Calculator,
  tag: Tag,
  receipt: Receipt,
  truck: Truck,
  coins: Coins,
  "badge-percent": BadgePercent,
  scale: Scale,
  "package-search": PackageSearch,
  "trending-up": TrendingUp,
};

export function ToolHeader({ title, description }: { title: string; description?: string }) {
  return (
    <>
      <DetailHeader parentLabel="Mes outils" />
      <Txt variant="title2" accessibilityRole="header">
        {title}
      </Txt>
      {description ? <Txt variant="bodyRegular">{description}</Txt> : null}
    </>
  );
}

/**
 * Champ numérique : clavier décimal, virgule française, bouton d'effacement, suffixe (€, %, kg…).
 * La valeur reste du texte : le calcul exact se fait à partir de la saisie, sans conversion flottante.
 */
export function AmountField({
  label,
  value,
  onChangeText,
  suffix,
  error,
  hint,
  large = false,
  placeholder = "0,00",
  testID,
  autoFocus,
  allowNegative = false,
  returnKeyType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  suffix?: string;
  error?: string;
  hint?: string;
  large?: boolean;
  placeholder?: string;
  testID?: string;
  autoFocus?: boolean;
  allowNegative?: boolean;
  returnKeyType?: TextInputProps["returnKeyType"];
}) {
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
        {label}
      </Txt>
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: color.surface, borderWidth: error ? 1.5 : 1, borderColor: error ? color.danger : color.line, borderRadius: radius.md, paddingRight: space[2] }}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={(t) => onChangeText(sanitizeAmountInput(t, allowNegative))}
          keyboardType="decimal-pad"
          inputMode="decimal"
          autoFocus={autoFocus}
          returnKeyType={returnKeyType ?? "done"}
          placeholder={placeholder}
          placeholderTextColor={color.ink3}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          maxFontSizeMultiplier={1.4}
          style={{ flex: 1, paddingVertical: space[3], paddingHorizontal: 14, minHeight: large ? 60 : size.touchMin, fontFamily: fontFamily[800], fontSize: large ? 28 : 17, color: color.ink }}
        />
        {suffix ? (
          <Txt variant="body" color={color.ink3} style={{ marginRight: space[2] }}>
            {suffix}
          </Txt>
        ) : null}
        {value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Effacer ${label}`} hitSlop={8} onPress={() => onChangeText("")} style={{ width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: color.lineSoft }}>
            <X size={16} color={color.ink2} />
          </Pressable>
        ) : null}
        {error ? <CircleAlert size={18} color={color.danger} style={{ marginLeft: space[2] }} /> : null}
      </View>
      {error ? (
        <Txt variant="label" color={color.danger} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="label">{hint}</Txt>
      ) : null}
    </View>
  );
}

export type ResultKind = "input" | "estimate" | "total" | "muted";

export interface ResultLine {
  label: string;
  value: string;
  kind?: ResultKind;
  /** précision sous la ligne */
  note?: string;
}

/** Ligne de résultat : les données saisies sont marquées « saisi », les valeurs calculées « estimé ». */
export function ResultRow({ line, first }: { line: ResultLine; first?: boolean }) {
  const kind = line.kind ?? "estimate";
  const total = kind === "total";
  return (
    <View accessible accessibilityLabel={`${line.label} : ${line.value}${kind === "input" ? ", saisi" : ""}`} style={{ paddingVertical: space[3], borderTopWidth: first ? 0 : 1, borderTopColor: color.lineSoft, gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space[2], flexWrap: "wrap" }}>
          <Txt variant={total ? "body" : "bodyRegular"} color={kind === "muted" ? color.ink3 : total ? color.ink : color.ink2}>
            {line.label}
          </Txt>
          {kind === "input" ? <Tag2 text="saisi" /> : null}
        </View>
        <Txt variant={total ? "kpiSm" : "body"} num color={kind === "muted" ? color.ink3 : color.ink} selectable>
          {line.value}
        </Txt>
      </View>
      {line.note ? <Txt variant="label">{line.note}</Txt> : null}
    </View>
  );
}

function Tag2({ text }: { text: string }) {
  return (
    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.xs, backgroundColor: color.lineSoft }}>
      <Txt variant="micro" color={color.ink2}>
        {text}
      </Txt>
    </View>
  );
}

export function ResultCard({ title, lines, footer, copyText }: { title?: string; lines: ResultLine[]; footer?: ReactNode; copyText?: string }) {
  return (
    <Card padded style={{ gap: 0 }}>
      {title || copyText ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space[1] }}>
          {title ? <Txt variant="overline">{title}</Txt> : <View />}
          {copyText ? <CopyButton text={copyText} /> : null}
        </View>
      ) : null}
      {lines.map((l, i) => (
        <ResultRow key={`${l.label}-${i}`} line={l} first={i === 0} />
      ))}
      {footer}
    </Card>
  );
}

export function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Copier les résultats"
      hitSlop={8}
      onPress={() => {
        Clipboard.setStringAsync(text)
          .then(() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setCopied(true);
            toast({ text: "Résultats copiés." });
          })
          .catch(() => toast({ text: "Copie impossible sur cet appareil.", tone: "error" }));
      }}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space[3], minHeight: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.surface }}
    >
      <Copy size={14} color={color.ink} />
      <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
        {copied ? "Copié" : label}
      </Txt>
    </Pressable>
  );
}

/** Choix exclusif sous forme de pastilles (taux, régime…). */
export function ChoiceChips<T extends string | number | boolean | null>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
          {label}
        </Txt>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
        {options.map((o) => (
          <FilterChip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}

/** Mention « estimation » sous un résultat. */
export function EstimateNote({ text }: { text: string }) {
  return (
    <Txt variant="label" style={{ paddingHorizontal: space[1] }}>
      {text}
    </Txt>
  );
}

/** Liste des éléments non saisis (jamais comptés pour 0). */
export function MissingList({ items, title = "Non renseigné (non déduit)" }: { items: string[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <View style={{ backgroundColor: color.accentSoft, borderRadius: radius.lg, padding: space[3], gap: 4 }}>
      <Txt variant="label" color={color.accentInkOnSoft} style={{ fontFamily: fontFamily[700] }}>
        {title}
      </Txt>
      {items.map((m) => (
        <Txt key={m} variant="label" color={color.accentInkOnSoft}>
          – {m}
        </Txt>
      ))}
    </View>
  );
}
