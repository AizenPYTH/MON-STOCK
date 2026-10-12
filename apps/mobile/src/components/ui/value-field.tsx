import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Delete } from "lucide-react-native";
import { color, radius, size, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";
import { Txt } from "~/components/ui/text";

/**
 * Champ-valeur v3 (motif « calculatrice ») : 64 pt, libellé à gauche, valeur alignée à droite
 * (26/32 tabulaire) et unité. Aucun TextInput : la valeur est saisie avec le `Keypad`.
 *  - active : fond blanc, bordure 2 bleu nuit ;
 *  - missing : bordure pointillée ambre, valeur « — » ;
 *  - highlight : résultat mis en avant (fond bleu nuit, valeur 30/36 en menthe, négatif en rose) ;
 *  - caret : curseur après la valeur (case en cours de saisie) ; badge : pastille menthe à droite.
 */
export function ValueField({
  label,
  value,
  unit,
  active = false,
  missing = false,
  highlight = false,
  tag,
  sub,
  badge,
  caret = false,
  negative = false,
  error,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  unit?: string;
  active?: boolean;
  missing?: boolean;
  highlight?: boolean;
  tag?: string;
  /** ligne sous le libellé (« marge 25 % ») */
  sub?: string | null;
  /** pastille menthe à droite (« moins cher ») */
  badge?: string;
  caret?: boolean;
  /** résultat négatif (rose sur fond nuit) */
  negative?: boolean;
  error?: string;
  onPress?: () => void;
  testID?: string;
}) {
  const { compact } = useLayout();
  const shown = missing && !value ? "—" : value || "0";
  const bg = highlight ? color.brand : active ? color.surface : color.bg;
  const blank = !value || value === "—";
  const fg = highlight ? (blank ? color.inkOnDarkSubtle : negative ? color.dangerOnDark : color.mint) : blank ? color.ink3 : color.ink;
  const labelColor = highlight ? color.inkOnDarkMuted : active ? color.brand : color.ink3;
  const body = (
    <View
      style={{
        minHeight: size.valueField,
        borderRadius: radius.xl,
        backgroundColor: bg,
        borderWidth: active ? 2 : missing ? 1.5 : error ? 1.5 : 0,
        borderStyle: missing && !active ? "dashed" : "solid",
        borderColor: error ? color.danger : active ? color.brand : color.accent,
        paddingHorizontal: space[4],
        paddingVertical: space[2],
        flexDirection: compact ? "column" : "row",
        alignItems: compact ? "flex-start" : "center",
        justifyContent: "space-between",
        gap: compact ? 2 : space[3],
      }}
    >
      <View style={{ flexShrink: 1 }}>
        <Txt variant="body" color={labelColor} style={{ fontFamily: "Manrope_800ExtraBold" }}>
          {label}
        </Txt>
        {tag ? (
          <Txt variant="micro" color={highlight ? color.inkOnDarkMuted : color.ink3}>
            {tag}
          </Txt>
        ) : null}
        {sub ? (
          <Txt variant="micro" color={highlight ? color.inkOnDarkMuted : color.ink3} style={{ fontFamily: "Manrope_700Bold" }}>
            {sub}
          </Txt>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, flexShrink: 1, alignSelf: compact ? "flex-end" : "auto" }}>
        <Txt variant="title1" num color={fg} adjustsFontSizeToFit numberOfLines={1} style={{ fontSize: highlight ? 30 : 26, lineHeight: highlight ? 36 : 32 }}>
          {shown}
        </Txt>
        {caret ? <View style={{ width: 2, height: 24, backgroundColor: color.brand, alignSelf: "center" }} /> : null}
        {unit ? (
          <Txt variant="body" color={highlight ? color.inkOnDarkMuted : color.ink3} style={{ fontFamily: "Manrope_700Bold" }}>
            {unit}
          </Txt>
        ) : null}
        {badge ? (
          <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: color.mint, alignSelf: "center", marginLeft: 4 }}>
            <Txt variant="micro" color={color.onMint} style={{ fontFamily: "Manrope_800ExtraBold" }}>
              {badge}
            </Txt>
          </View>
        ) : null}
      </View>
    </View>
  );
  const a11y = `${label} : ${missing && !value ? "non renseigné" : `${value || "0"}${unit ? ` ${unit}` : ""}`}${sub ? `, ${sub}` : ""}${badge ? `, ${badge}` : ""}${active ? ", champ en cours de saisie" : ""}${error ? `, ${error}` : ""}`;
  return (
    <View style={{ gap: 4 }}>
      {onPress ? (
        <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected: active }} onPress={onPress}>
          {body}
        </Pressable>
      ) : (
        <View testID={testID} accessible accessibilityLabel={a11y}>
          {body}
        </View>
      )}
      {error ? (
        <Txt variant="label" color={color.dangerInk} accessibilityLiveRegion="polite" style={{ fontSize: 12, lineHeight: 16 }}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "00" | "," | "back" | "clear";

/** Applique une touche à une saisie décimale française (au plus `maxDecimals` après la virgule). */
export function applyKey(current: string, key: KeypadKey, maxDecimals = 2, maxLength = 12): string {
  if (key === "clear") return "";
  if (key === "back") return current.slice(0, -1);
  if (key === ",") return current.includes(",") ? current : current === "" ? "0," : `${current},`;
  const next = current === "0" && key !== "00" ? key : `${current}${key === "00" && current === "" ? "0" : key}`;
  const dec = next.split(",")[1];
  if (dec !== undefined && dec.length > maxDecimals) return current;
  if (next.replace(",", "").length > maxLength) return current;
  return next;
}

/**
 * Clavier intégré v3 : grille 4×4, touches 58 pt (rayon 14), ⌫ et C plus foncés, une seule touche
 * menthe (action) sur deux rangées en colonne 4. Haptique légère à chaque touche.
 */
export function Keypad({ onKey, action, keyHeight }: { onKey: (k: KeypadKey) => void; action: { label: string; onPress: () => void; disabled?: boolean }; keyHeight?: number }) {
  const { compact } = useLayout();
  const h = keyHeight ?? (compact ? 44 : 56);
  const press = (k: KeypadKey) => {
    void Haptics.selectionAsync().catch(() => {});
    onKey(k);
  };
  const key = (k: KeypadKey, label: string, dark = false) => (
    <Pressable
      key={k}
      testID={`key-${k}`}
      accessibilityRole="button"
      accessibilityLabel={k === "back" ? "Effacer le dernier chiffre" : k === "clear" ? "Tout effacer" : label}
      onPress={() => press(k)}
      style={({ pressed }) => ({ flex: 1, height: h, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? color.line : dark ? color.brandSoft : color.surfaceSunken })}
    >
      {k === "back" ? (
        <Delete size={24} color={color.ink} strokeWidth={2} />
      ) : (
        <Txt variant="title1" num style={{ fontSize: compact ? 22 : 26, lineHeight: compact ? 28 : 32 }}>
          {label}
        </Txt>
      )}
    </Pressable>
  );
  const rows: [KeypadKey, string][][] = [
    [["7", "7"], ["8", "8"], ["9", "9"]],
    [["4", "4"], ["5", "5"], ["6", "6"]],
    [["1", "1"], ["2", "2"], ["3", "3"]],
    [["00", "00"], ["0", "0"], [",", ","]],
  ];
  return (
    <View style={{ flexDirection: "row", gap: space[2] }}>
      <View style={{ flex: 3, gap: space[2] }}>
        {rows.map((r, i) => (
          <View key={i} style={{ flexDirection: "row", gap: space[2] }}>
            {r.map(([k, l]) => key(k, l))}
          </View>
        ))}
      </View>
      <View style={{ flex: 1, gap: space[2] }}>
        {key("back", "⌫", true)}
        {key("clear", "C", true)}
        <Pressable
          testID="key-action"
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: Boolean(action.disabled) }}
          disabled={action.disabled}
          onPress={action.onPress}
          style={({ pressed }) => ({ flex: 1, minHeight: h * 2 + space[2], borderRadius: radius.xl, alignItems: "center", justifyContent: "center", backgroundColor: action.disabled ? color.surfaceSunken : pressed ? color.mintPressed : color.mint })}
        >
          <Txt variant="body" color={action.disabled ? color.ink3 : color.onMint} style={{ fontFamily: "Manrope_800ExtraBold", fontSize: 16 }}>
            {action.label}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

/** Tuiles de choix v3 : grille de 2 ou 4 colonnes, 48 pt, rayon 14 ; sélection bleu nuit. */
export function ChoiceTiles<T extends string>({ options, value, onChange, columns = 2 }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; columns?: 2 | 4 }) {
  const rows: { value: T; label: string }[][] = [];
  options.forEach((o, i) => {
    if (i % columns === 0) rows.push([]);
    rows[rows.length - 1]!.push(o);
  });
  return (
    <View style={{ gap: space[2] }} accessibilityRole="radiogroup">
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: space[2] }}>
          {r.map((o) => {
            const selected = o.value === value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={o.label}
                onPress={() => {
                  if (selected) return;
                  void Haptics.selectionAsync().catch(() => {});
                  onChange(o.value);
                }}
                style={({ pressed }) => ({ flex: 1, minHeight: 48, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", paddingHorizontal: space[2], backgroundColor: selected ? color.brand : pressed ? color.line : color.surfaceSunken })}
              >
                <Txt variant="body" color={selected ? color.inkOnDark : color.ink} numberOfLines={1} style={{ fontFamily: "Manrope_700Bold" }}>
                  {o.label}
                </Txt>
              </Pressable>
            );
          })}
          {r.length < columns ? Array.from({ length: columns - r.length }, (_, k) => <View key={`pad-${k}`} style={{ flex: 1 }} />) : null}
        </View>
      ))}
    </View>
  );
}
