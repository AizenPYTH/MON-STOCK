import { ScrollView, View } from "react-native";
import { Copy, Trash2 } from "lucide-react-native";
import { CONDITION_LABEL, PRODUCT_GRADES, STORAGE_PRESETS, suggestSkuCode, type VariantInput } from "@/features/stock/product-form";
import { Card, FilterChip, IconButton, TextField, Txt } from "~/components/ui";
import { color, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

/** Brouillon d'une variante dans le formulaire (texte saisi tel quel ; validé à l'envoi). */
export interface VariantDraft {
  key: string;
  storage: string;
  color: string;
  grade: "" | (typeof PRODUCT_GRADES)[number];
  condition: keyof typeof CONDITION_LABEL;
  code: string;
  /** l'utilisateur a modifié le code : on ne le régénère plus */
  codeTouched: boolean;
  cost_price: string;
  sale_price: string;
  initial_quantity: string;
}

let draftSeq = 0;
export function newVariantDraft(from?: Partial<VariantDraft>): VariantDraft {
  draftSeq += 1;
  return { storage: "", color: "", grade: "", condition: "refurbished", code: "", codeTouched: false, cost_price: "", sale_price: "", initial_quantity: "", ...from, key: `v${Date.now()}-${draftSeq}` };
}

export type ProductIdentity = { brand?: string; model?: string; name?: string };

/** Code SKU à jour : suggestion tant que l'utilisateur ne l'a pas modifié. */
export function withSuggestedCode(d: VariantDraft, product: ProductIdentity): VariantDraft {
  return d.codeTouched ? d : { ...d, code: suggestSkuCode(product, d) };
}

export function draftToInput(d: VariantDraft): VariantInput {
  return {
    storage: d.storage,
    color: d.color,
    grade: d.grade,
    condition: d.condition,
    code: d.code,
    cost_price: d.cost_price,
    sale_price: d.sale_price,
    initial_quantity: d.initial_quantity,
  } as unknown as VariantInput;
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
      {children}
    </Txt>
  );
}

function ChipRow<T extends string>({ options, value, onChange, label }: { options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <FieldLabel>{label}</FieldLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} keyboardShouldPersistTaps="handled">
        {options.map((o) => (
          <FilterChip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value === value && o.value !== ("" as T) ? ("" as T) : o.value)} />
        ))}
      </ScrollView>
    </View>
  );
}

const GRADE_OPTIONS = [{ value: "" as const, label: "Sans grade" }, ...PRODUCT_GRADES.map((g) => ({ value: g, label: `Grade ${g}` }))];
const CONDITION_OPTIONS = (Object.keys(CONDITION_LABEL) as (keyof typeof CONDITION_LABEL)[]).map((k) => ({ value: k, label: CONDITION_LABEL[k] }));

/** Carte d'édition d'une variante : capacité, couleur, grade, état, SKU, prix, quantité initiale. */
export function VariantCard({
  index,
  draft,
  errors,
  onChange,
  onDuplicate,
  onRemove,
}: {
  index: number;
  draft: VariantDraft;
  errors: Record<string, string>;
  onChange: (patch: Partial<VariantDraft>) => void;
  onDuplicate: () => void;
  onRemove?: () => void;
}) {
  const err = (field: string) => errors[`variants.${index}.${field}`];
  const presetStorage = (STORAGE_PRESETS as readonly string[]).includes(draft.storage);
  return (
    <Card padded style={{ gap: space[4] }} accessibilityLabel={`Variante ${index + 1}`}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Txt variant="body" style={{ fontFamily: fontFamily[800] }}>
          Variante {index + 1}
        </Txt>
        <View style={{ flexDirection: "row", gap: space[2] }}>
          <IconButton icon={<Copy size={18} color={color.ink} />} label={`Dupliquer la variante ${index + 1}`} onPress={onDuplicate} />
          {onRemove ? <IconButton icon={<Trash2 size={18} color={color.danger} />} label={`Supprimer la variante ${index + 1}`} onPress={onRemove} /> : null}
        </View>
      </View>
      <ChipRow label="Capacité" options={[...STORAGE_PRESETS.map((s) => ({ value: s, label: s })), { value: "", label: "Aucune" }]} value={presetStorage ? draft.storage : ""} onChange={(v) => onChange({ storage: v })} />
      {!presetStorage ? <TextField label="Autre capacité (facultatif)" value={draft.storage} onChangeText={(v) => onChange({ storage: v })} placeholder="Ex. 2 To, 16 Go RAM" maxLength={60} error={err("storage")} /> : null}
      <TextField label="Couleur (facultatif)" value={draft.color} onChangeText={(v) => onChange({ color: v })} placeholder="Ex. Noir minuit" maxLength={60} error={err("color")} />
      <ChipRow label="Grade" options={GRADE_OPTIONS} value={draft.grade} onChange={(v) => onChange({ grade: v })} />
      {err("grade") ? <Txt variant="label" color={color.danger}>{err("grade")}</Txt> : null}
      <ChipRow label="État" options={CONDITION_OPTIONS} value={draft.condition} onChange={(v) => onChange({ condition: v || "unknown" })} />
      <TextField
        label="Référence interne (SKU)"
        value={draft.code}
        onChangeText={(v) => onChange({ code: v, codeTouched: true })}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={64}
        hint={draft.codeTouched ? "Unique dans votre organisation." : "Suggéré automatiquement : modifiable."}
        error={err("code")}
        testID={`variant-${index}-code`}
      />
      <View style={{ flexDirection: "row", gap: space[3] }}>
        <View style={{ flex: 1 }}>
          <TextField label="Prix d'achat €" value={draft.cost_price} onChangeText={(v) => onChange({ cost_price: v })} keyboardType="decimal-pad" placeholder="—" error={err("cost_price")} testID={`variant-${index}-cost`} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Prix de vente €" value={draft.sale_price} onChangeText={(v) => onChange({ sale_price: v })} keyboardType="decimal-pad" placeholder="—" error={err("sale_price")} testID={`variant-${index}-sale`} />
        </View>
      </View>
      <TextField
        label="Quantité initiale"
        value={draft.initial_quantity}
        onChangeText={(v) => onChange({ initial_quantity: v })}
        keyboardType="number-pad"
        placeholder="0"
        hint="Enregistrée comme mouvement « Stock initial » dans l'historique."
        error={err("initial_quantity")}
        testID={`variant-${index}-qty`}
      />
    </Card>
  );
}
