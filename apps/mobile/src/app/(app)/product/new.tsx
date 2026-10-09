import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Plus } from "lucide-react-native";
import { PRODUCT_CATEGORIES, productDisplayName } from "@/features/stock/product-form";
import { useActiveOrg } from "~/org/org-provider";
import { useCreateProduct } from "~/data/hooks";
import { FormValidationError } from "~/data/products";
import { userMessage } from "~/lib/errors";
import { formatNumber } from "~/lib/format";
import { AlertBanner, BottomSheet, Button, Card, DetailHeader, ErrorState, FilterChip, Screen, StickyActions, TextField, Txt, useToast } from "~/components/ui";
import { draftToInput, newVariantDraft, VariantCard, withSuggestedCode, type VariantDraft } from "~/components/product-form";
import { color, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

/**
 * Création d'un produit et de ses variantes (capacité, couleur, grade, état), chacune avec son
 * SKU, ses prix et sa quantité initiale. Enregistrement réel : create_product_with_skus (une
 * transaction, create_sku par variante, mouvement « Stock initial » dans l'historique).
 */
export default function NewProductScreen() {
  const { permissions, active } = useActiveOrg();
  const create = useCreateProduct();
  const toast = useToast();
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [variants, setVariants] = useState<VariantDraft[]>(() => [newVariantDraft()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const identity = { brand, model, name };
  const displayName = productDisplayName(identity);
  const totalQty = variants.reduce((s, v) => s + (/^\d+$/.test(v.initial_quantity.trim()) ? Number(v.initial_quantity.trim()) : 0), 0);

  /** Toute modification de l'identité du produit met à jour les codes SKU suggérés (non modifiés). */
  function setIdentity(patch: { brand?: string; model?: string; name?: string }) {
    const next = { ...identity, ...patch };
    if (patch.brand !== undefined) setBrand(patch.brand);
    if (patch.model !== undefined) setModel(patch.model);
    if (patch.name !== undefined) setName(patch.name);
    setVariants((vs) => vs.map((v) => withSuggestedCode(v, next)));
  }

  function patchVariant(i: number, patch: Partial<VariantDraft>) {
    setVariants((vs) => vs.map((v, j) => (j === i ? withSuggestedCode({ ...v, ...patch }, identity) : v)));
  }

  function duplicate(i: number) {
    setVariants((vs) => {
      const src = vs[i]!;
      const copy = withSuggestedCode(newVariantDraft({ ...src, code: "", codeTouched: false, initial_quantity: "" }), identity);
      return [...vs.slice(0, i + 1), copy, ...vs.slice(i + 1)];
    });
  }

  function remove(i: number) {
    setVariants((vs) => vs.filter((_, j) => j !== i));
    setErrors({});
  }

  function submit() {
    setConfirming(false);
    setFormError(null);
    create.mutate(
      { brand, model, name, category, variants: variants.map(draftToInput) },
      {
        onSuccess: (r) => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          toast({ text: `Produit créé : ${r.skus.length} variante${r.skus.length > 1 ? "s" : ""}` });
          router.replace({ pathname: "/product/[productId]", params: { productId: r.productId } });
        },
        onError: (e) => {
          if (e instanceof FormValidationError) {
            setErrors(e.fieldErrors);
            setFormError(e.message);
          } else {
            setErrors({});
            setFormError(userMessage(e));
          }
        },
      },
    );
  }

  if (!permissions.canWrite)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Stock" />
        <ErrorState title="Lecture seule" description="Votre rôle ne permet pas de créer des produits dans cette organisation." />
      </Screen>
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        footer={
          <StickyActions>
            <Button label="Annuler" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
            <Button label="Créer le produit" loading={create.isPending} onPress={() => setConfirming(true)} style={{ flex: 2 }} testID="product-create" />
          </StickyActions>
        }
      >
        <DetailHeader parentLabel="Stock" />
        <View style={{ gap: 4 }}>
          <Txt variant="title2" accessibilityRole="header">
            Nouveau produit
          </Txt>
          <Txt variant="label">Organisation : {active.organization.name} · prix en {active.organization.currency}</Txt>
        </View>
        {formError ? <AlertBanner text={formError} tone="dark" /> : null}
        <Card padded style={{ gap: space[4] }}>
          <TextField label="Marque" value={brand} onChangeText={(v) => setIdentity({ brand: v })} placeholder="Ex. Apple" maxLength={120} autoCapitalize="words" testID="product-brand" />
          <TextField label="Modèle" value={model} onChangeText={(v) => setIdentity({ model: v })} placeholder="Ex. iPhone 13" maxLength={160} testID="product-model" />
          <TextField
            label="Nom du produit"
            value={name}
            onChangeText={(v) => setIdentity({ name: v })}
            placeholder={displayName || "Ex. Apple iPhone 13"}
            hint={name ? undefined : displayName ? `Laissé vide : « ${displayName} »` : "Facultatif si la marque et le modèle sont renseignés."}
            maxLength={300}
            error={errors.name}
            testID="product-name"
          />
          <View style={{ gap: 6 }}>
            <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
              Catégorie
            </Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} keyboardShouldPersistTaps="handled">
              {PRODUCT_CATEGORIES.map((c) => (
                <FilterChip key={c} label={c} selected={category === c} onPress={() => setCategory(category === c ? "" : c)} />
              ))}
            </ScrollView>
            {!(PRODUCT_CATEGORIES as readonly string[]).includes(category) || category === "" ? (
              <TextField label="Autre catégorie (facultatif)" value={category} onChangeText={setCategory} maxLength={120} placeholder="Ex. Liseuse" />
            ) : null}
          </View>
        </Card>
        <Txt variant="kpiSm" accessibilityRole="header">
          Variantes ({variants.length})
        </Txt>
        {errors.variants ? <Txt variant="label" color={color.danger}>{errors.variants}</Txt> : null}
        {variants.map((v, i) => (
          <VariantCard key={v.key} index={i} draft={v} errors={errors} onChange={(p) => patchVariant(i, p)} onDuplicate={() => duplicate(i)} onRemove={variants.length > 1 ? () => remove(i) : undefined} />
        ))}
        <Button label="Ajouter une variante" variant="secondary" onPress={() => setVariants((vs) => [...vs, withSuggestedCode(newVariantDraft({ condition: vs[vs.length - 1]?.condition ?? "refurbished" }), identity)])} disabled={variants.length >= 50} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          <Plus size={14} color={color.ink2} />
          <Txt variant="label" style={{ flex: 1 }}>
            Une variante = un SKU (ex. 128 Go grade B et 256 Go grade A). Prix inconnus : laissez vide, ils ne sont jamais inventés.
          </Txt>
        </View>
      </Screen>
      <BottomSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Créer ce produit ?"
        description={`${displayName || "Produit sans nom"} · ${variants.length} variante${variants.length > 1 ? "s" : ""} · stock initial ${formatNumber(totalQty)} unité${totalQty > 1 ? "s" : ""}.`}
      >
        <Button label="Confirmer la création" loading={create.isPending} onPress={submit} testID="product-create-confirm" />
        <Button label="Revenir au formulaire" variant="ghost" onPress={() => setConfirming(false)} />
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}
