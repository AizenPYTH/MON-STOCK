import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CONDITION_LABEL, PRODUCT_GRADES, STORAGE_PRESETS } from "@/features/stock/product-form";
import { useActiveOrg } from "~/org/org-provider";
import { useEditableSku, useUpdateSku } from "~/data/hooks";
import { FormValidationError, type EditableSku, type SkuEditInput } from "~/data/products";
import { userMessage } from "~/lib/errors";
import { AlertBanner, Button, Card, DetailHeader, EmptyState, ErrorState, FilterChip, Screen, Skeleton, StickyActions, TextField, Txt, useToast } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

/**
 * Modification d'une variante : prix d'achat / de vente, capacité, couleur, grade, état,
 * emplacement, seuil d'alerte, EAN. Le code SKU n'est pas modifiable (annonces et historique
 * y sont rattachés) ; la quantité se change par un ajustement (mouvement tracé).
 */
export default function EditSkuScreen() {
  const { skuId } = useLocalSearchParams<{ skuId: string }>();
  const { permissions } = useActiveOrg();
  const sku = useEditableSku(skuId ?? "");

  if (sku.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Variante" />
        <Skeleton w="100%" h={360} r={radius.xl} />
      </Screen>
    );
  if (sku.isError || !sku.data)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Variante" />
        {sku.isError ? <ErrorState description={userMessage(sku.error)} onRetry={() => void sku.refetch()} /> : <EmptyState title="Variante introuvable" description="Elle n'appartient pas à l'organisation active." />}
      </Screen>
    );
  if (!permissions.canWrite)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Variante" />
        <ErrorState title="Lecture seule" description="Votre rôle ne permet pas de modifier le catalogue." />
      </Screen>
    );
  return <SkuForm key={`${sku.data.updated_at}|${sku.data.variant.updated_at}`} current={sku.data} onReload={() => void sku.refetch()} />;
}

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function SkuForm({ current, onReload }: { current: EditableSku; onReload: () => void }) {
  const update = useUpdateSku();
  const toast = useToast();
  const attrs = current.variant.attributes;
  // Grade importé hors A/B/C (ex. « A+ ») : conservé et proposé tel quel, jamais effacé en silence.
  const gradeOptions = [{ value: "", label: "Sans grade" }, ...PRODUCT_GRADES.map((g) => ({ value: g as string, label: `Grade ${g}` }))];
  if (current.variant.grade && !(PRODUCT_GRADES as readonly string[]).includes(current.variant.grade)) gradeOptions.push({ value: current.variant.grade, label: `Grade ${current.variant.grade}` });
  const [form, setForm] = useState<SkuEditInput>({
    cost_price: current.cost_price === null ? "" : String(current.cost_price).replace(".", ","),
    sale_price: current.sale_price === null ? "" : String(current.sale_price).replace(".", ","),
    storage: text(attrs.storage),
    color: text(attrs.color),
    grade: current.variant.grade ?? "",
    condition: (current.variant.condition as SkuEditInput["condition"]) ?? "unknown",
    location: current.location ?? "",
    reorder_point: String(current.reorder_point ?? 0),
    ean: current.variant.ean ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = (patch: Partial<SkuEditInput>) => setForm((f) => ({ ...f, ...patch }));
  const presetStorage = (STORAGE_PRESETS as readonly string[]).includes(form.storage);

  function save() {
    setFormError(null);
    update.mutate(
      { current, input: form },
      {
        onSuccess: () => {
          toast({ text: `Variante ${current.code} mise à jour` });
          router.back();
        },
        onError: (e) => {
          setErrors(e instanceof FormValidationError ? e.fieldErrors : {});
          setFormError(userMessage(e));
          if (e instanceof Error && "code" in e && (e as { code: string }).code === "CONFLICT") onReload();
        },
      },
    );
  }

  const chips = <T extends string>(label: string, options: readonly { value: T; label: string }[], value: T, onChange: (v: T) => void) => (
    <View style={{ gap: 6 }}>
      <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
        {label}
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} keyboardShouldPersistTaps="handled">
        {options.map((o) => (
          <FilterChip key={o.value} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        footer={
          <StickyActions>
            <Button label="Annuler" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
            <Button label="Enregistrer" loading={update.isPending} onPress={save} style={{ flex: 2 }} testID="sku-edit-save" />
          </StickyActions>
        }
      >
        <DetailHeader parentLabel={current.code} />
        <View style={{ gap: 4 }}>
          <Txt variant="title2" accessibilityRole="header">
            Modifier la variante
          </Txt>
          <Txt variant="label">SKU {current.code} · la quantité se modifie par « Ajuster le stock ».</Txt>
        </View>
        {formError ? <AlertBanner text={formError} tone="dark" /> : null}
        <Card padded style={{ gap: space[4] }}>
          <View style={{ flexDirection: "row", gap: space[3] }}>
            <View style={{ flex: 1 }}>
              <TextField label="Prix d'achat €" value={form.cost_price} onChangeText={(v) => set({ cost_price: v })} keyboardType="decimal-pad" placeholder="—" error={errors.cost_price} />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="Prix de vente €" value={form.sale_price} onChangeText={(v) => set({ sale_price: v })} keyboardType="decimal-pad" placeholder="—" error={errors.sale_price} />
            </View>
          </View>
          {chips("Capacité", [...STORAGE_PRESETS.map((s) => ({ value: s as string, label: s })), { value: "", label: "Aucune" }], presetStorage ? form.storage : "", (v) => set({ storage: v }))}
          {!presetStorage ? <TextField label="Autre capacité" value={form.storage} onChangeText={(v) => set({ storage: v })} maxLength={60} error={errors.storage} /> : null}
          <TextField label="Couleur" value={form.color} onChangeText={(v) => set({ color: v })} maxLength={60} error={errors.color} />
          {chips("Grade", gradeOptions, form.grade ?? "", (v) => set({ grade: v }))}
          {chips("État", (Object.keys(CONDITION_LABEL) as (keyof typeof CONDITION_LABEL)[]).map((k) => ({ value: k, label: CONDITION_LABEL[k] })), form.condition ?? "unknown", (v) => set({ condition: v }))}
          <TextField label="Emplacement (facultatif)" value={form.location} onChangeText={(v) => set({ location: v })} maxLength={120} placeholder="Ex. Étagère B2" error={errors.location} />
          <TextField label="Seuil d'alerte" value={form.reorder_point} onChangeText={(v) => set({ reorder_point: v })} keyboardType="number-pad" hint="Alerte « stock faible » à partir de ce niveau." error={errors.reorder_point} />
          <TextField label="EAN / GTIN (facultatif)" value={form.ean} onChangeText={(v) => set({ ean: v })} keyboardType="number-pad" maxLength={14} error={errors.ean} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
