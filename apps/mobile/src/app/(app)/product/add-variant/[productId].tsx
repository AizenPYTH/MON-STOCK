import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useActiveOrg } from "~/org/org-provider";
import { useAddVariants, useEditableProduct } from "~/data/hooks";
import { FormValidationError } from "~/data/products";
import { userMessage } from "~/lib/errors";
import { AlertBanner, Button, DetailHeader, EmptyState, ErrorState, Screen, Skeleton, StickyActions, Txt, useToast } from "~/components/ui";
import { draftToInput, newVariantDraft, VariantCard, withSuggestedCode, type VariantDraft } from "~/components/product-form";
import { radius } from "~/theme/tokens";

/** Ajout de variantes à un produit existant (même transaction et mêmes règles que la création). */
export default function AddVariantScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { permissions } = useActiveOrg();
  const product = useEditableProduct(productId ?? "");
  const add = useAddVariants(productId ?? "");
  const toast = useToast();
  const [variants, setVariants] = useState<VariantDraft[]>(() => [newVariantDraft()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

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

  const p = product.data;
  const identity = { brand: p.brand ?? "", model: p.model ?? "", name: p.name };
  const draftsWithCodes = variants.map((v) => withSuggestedCode(v, identity));

  function patch(i: number, change: Partial<VariantDraft>) {
    setVariants((vs) => vs.map((v, j) => (j === i ? withSuggestedCode({ ...v, ...change }, identity) : v)));
  }

  function submit() {
    setFormError(null);
    add.mutate(draftsWithCodes.map(draftToInput), {
      onSuccess: (r) => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast({ text: `${r.skus.length} variante${r.skus.length > 1 ? "s" : ""} ajoutée${r.skus.length > 1 ? "s" : ""}` });
        router.back();
      },
      onError: (e) => {
        setErrors(e instanceof FormValidationError ? e.fieldErrors : {});
        setFormError(userMessage(e));
      },
    });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        footer={
          <StickyActions>
            <Button label="Annuler" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
            <Button label={`Ajouter ${variants.length > 1 ? `${variants.length} variantes` : "la variante"}`} loading={add.isPending} onPress={submit} style={{ flex: 2 }} testID="variant-add-save" />
          </StickyActions>
        }
      >
        <DetailHeader parentLabel={p.name} />
        <View style={{ gap: 4 }}>
          <Txt variant="title2" accessibilityRole="header">
            Nouvelle variante
          </Txt>
          <Txt variant="label">{p.name}</Txt>
        </View>
        {formError ? <AlertBanner text={formError} tone="dark" /> : null}
        {draftsWithCodes.map((v, i) => (
          <VariantCard
            key={v.key}
            index={i}
            draft={v}
            errors={errors}
            onChange={(c) => patch(i, c)}
            onDuplicate={() => setVariants((vs) => [...vs.slice(0, i + 1), newVariantDraft({ ...vs[i]!, code: "", codeTouched: false, initial_quantity: "" }), ...vs.slice(i + 1)])}
            onRemove={variants.length > 1 ? () => setVariants((vs) => vs.filter((_, j) => j !== i)) : undefined}
          />
        ))}
        <Button label="Ajouter une autre variante" variant="secondary" onPress={() => setVariants((vs) => [...vs, newVariantDraft()])} disabled={variants.length >= 50} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
