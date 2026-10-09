import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { MOVEMENT_FIXED_DIRECTION, MOVEMENT_TYPES, signedMovementQuantity, stockMovementInputSchema, type MovementType } from "@/features/mobile-api/contract";
import { useApplyMovement } from "~/data/hooks";
import { useActiveOrg } from "~/org/org-provider";
import { userMessage } from "~/lib/errors";
import { Body, Button, Card, Chip, Muted, Notice, Screen, SectionTitle, TextField } from "~/ui/components";
import { formatNumber, MOVEMENT_TYPE_LABEL } from "~/ui/format";
import { spacing } from "~/ui/theme";

/**
 * Mouvement manuel. Le résultat affiché est CELUI DE LA BASE (stock après mouvement) :
 * aucune mise à jour optimiste, aucune file hors ligne pour une donnée de stock.
 */
export default function MovementScreen() {
  const { skuId, code, available } = useLocalSearchParams<{ skuId: string; code?: string; available?: string }>();
  const { permissions } = useActiveOrg();
  const mutation = useApplyMovement();
  const [type, setType] = useState<MovementType>("adjustment");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const fixed = MOVEMENT_FIXED_DIRECTION[type];
  const effectiveDirection = fixed ?? direction;

  function submit() {
    setFieldError(null);
    const parsed = stockMovementInputSchema.safeParse({ sku_id: skuId, type, direction: effectiveDirection, quantity, note });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Valeur invalide.");
      return;
    }
    mutation.mutate(parsed.data, { onSuccess: (r) => setDone(r.quantityAfter) });
  }

  if (!permissions.canWrite) {
    return (
      <Screen edges={[]}>
        <Notice tone="warning">Votre rôle (lecture seule) ne permet pas d'enregistrer un mouvement.</Notice>
      </Screen>
    );
  }

  if (done !== null || mutation.isSuccess) {
    return (
      <Screen edges={[]}>
        <Notice tone="success" title="Mouvement enregistré">
          Stock disponible après mouvement (confirmé par la base) : {formatNumber(done)}.
        </Notice>
        <Button label="Retour à la fiche" onPress={() => router.back()} />
      </Screen>
    );
  }

  const qty = Number.parseInt(quantity, 10);
  const preview = Number.isFinite(qty) && qty > 0 ? signedMovementQuantity({ type, direction: effectiveDirection, quantity: qty }) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={[]}>
        <Body style={{ fontWeight: "700" }}>{code}</Body>
        <Muted style={{ marginBottom: spacing.md }}>Disponible actuellement : {available ?? "—"}</Muted>
        {mutation.isError ? <Notice tone="danger">{userMessage(mutation.error)}</Notice> : null}

        <SectionTitle>Type</SectionTitle>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }}>
          {MOVEMENT_TYPES.map((t) => (
            <Chip key={t} label={MOVEMENT_TYPE_LABEL[t] ?? t} selected={type === t} onPress={() => setType(t)} />
          ))}
        </View>

        {fixed ? (
          <Muted style={{ marginBottom: spacing.md }}>{fixed === "in" ? "Entrée de stock (sens imposé par le type)." : "Sortie de stock (sens imposé par le type)."}</Muted>
        ) : (
          <>
            <SectionTitle>Sens</SectionTitle>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
              <Chip label="Entrée (+)" selected={direction === "in"} onPress={() => setDirection("in")} />
              <Chip label="Sortie (−)" selected={direction === "out"} onPress={() => setDirection("out")} />
            </View>
          </>
        )}

        <Card>
          <TextField label="Quantité" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" error={fieldError ?? undefined} hint="Nombre entier, 1 à 1 000 000." />
          <TextField label="Note (facultatif)" value={note} onChangeText={setNote} maxLength={500} multiline />
          {preview !== null ? <Muted>Mouvement envoyé : {preview > 0 ? `+${preview}` : preview}. La base refuse tout mouvement qui rendrait le stock négatif.</Muted> : null}
          <Button label="Enregistrer le mouvement" onPress={submit} loading={mutation.isPending} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
