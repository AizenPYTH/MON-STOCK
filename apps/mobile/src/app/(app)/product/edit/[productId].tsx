import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { PRODUCT_CATEGORIES } from "@/features/stock/product-form";
import { useActiveOrg } from "~/org/org-provider";
import { useEditableProduct, useUpdateProduct } from "~/data/hooks";
import { FormValidationError, type EditableProduct } from "~/data/products";
import { userMessage } from "~/lib/errors";
import { AlertBanner, Button, Card, DetailHeader, EmptyState, ErrorState, FilterChip, Screen, Skeleton, StickyActions, TextField, Txt, useToast } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

/** Modification des informations du produit (nom, marque, modèle, catégorie, description). */
export default function EditProductScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { permissions } = useActiveOrg();
  const product = useEditableProduct(productId ?? "");

  if (product.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Produit" />
        <Skeleton w="100%" h={320} r={radius.xl} />
      </Screen>
    );
  if (product.isError || !product.data)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Produit" />
        {product.isError ? <ErrorState description={userMessage(product.error)} onRetry={() => void product.refetch()} /> : <EmptyState title="Produit introuvable" description="Il n'appartient pas à l'organisation active." />}
      </Screen>
    );
  if (!permissions.canWrite)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Produit" />
        <ErrorState title="Lecture seule" description="Votre rôle ne permet pas de modifier le catalogue." />
      </Screen>
    );
  // Le formulaire est (re)monté pour chaque version lue : jamais d'état périmé après un conflit.
  return <ProductForm key={product.data.updated_at} current={product.data} onReload={() => void product.refetch()} />;
}

function ProductForm({ current, onReload }: { current: EditableProduct; onReload: () => void }) {
  const update = useUpdateProduct();
  const toast = useToast();
  const [form, setForm] = useState({ name: current.name, brand: current.brand ?? "", model: current.model ?? "", category: current.category ?? "", description: current.description ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  function save() {
    setFormError(null);
    update.mutate(
      { current, input: form },
      {
        onSuccess: () => {
          toast({ text: "Produit mis à jour" });
          router.back();
        },
        onError: (e) => {
          setErrors(e instanceof FormValidationError ? e.fieldErrors : {});
          setFormError(userMessage(e));
          if (!(e instanceof FormValidationError) && /modifié entre-temps/.test(userMessage(e))) onReload();
        },
      },
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        footer={
          <StickyActions>
            <Button label="Annuler" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
            <Button label="Enregistrer" loading={update.isPending} onPress={save} style={{ flex: 2 }} testID="product-edit-save" />
          </StickyActions>
        }
      >
        <DetailHeader parentLabel={current.name} />
        <Txt variant="title2" accessibilityRole="header">
          Modifier le produit
        </Txt>
        {formError ? <AlertBanner text={formError} tone="dark" /> : null}
        <Card padded style={{ gap: space[4] }}>
          <TextField label="Nom du produit" value={form.name} onChangeText={(v) => set({ name: v })} maxLength={300} error={errors.name} />
          <TextField label="Marque" value={form.brand} onChangeText={(v) => set({ brand: v })} maxLength={120} error={errors.brand} />
          <TextField label="Modèle" value={form.model} onChangeText={(v) => set({ model: v })} maxLength={160} error={errors.model} />
          <View style={{ gap: 6 }}>
            <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
              Catégorie
            </Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} keyboardShouldPersistTaps="handled">
              {PRODUCT_CATEGORIES.map((c) => (
                <FilterChip key={c} label={c} selected={form.category === c} onPress={() => set({ category: form.category === c ? "" : c })} />
              ))}
            </ScrollView>
            {!(PRODUCT_CATEGORIES as readonly string[]).includes(form.category) ? <TextField label="Autre catégorie" value={form.category} onChangeText={(v) => set({ category: v })} maxLength={120} /> : null}
          </View>
          <TextField label="Description (facultatif)" value={form.description} onChangeText={(v) => set({ description: v })} maxLength={5000} multiline style={{ minHeight: 96, textAlignVertical: "top" }} error={errors.description} />
        </Card>
        <Txt variant="label">Le code SKU, les prix et la quantité se modifient sur chaque variante.</Txt>
      </Screen>
    </KeyboardAvoidingView>
  );
}
