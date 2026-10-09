import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import type { MovementType } from "@/features/mobile-api/contract";
import { useActiveOrg } from "~/org/org-provider";
import { useApplyMovement, useSkuDetail } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { formatNumber } from "~/lib/format";
import { BottomSheet, Button, Card, DetailHeader, ErrorState, FilterChip, Screen, Skeleton, StickyActions, TextField, Txt, useToast } from "~/components/ui";
import { variantTitle } from "~/components/stock";
import { radius, space } from "~/theme/tokens";

/** Motifs proposés → type de mouvement (même modèle que le web : la base contrôle le sens et le stock négatif). */
const REASONS: { key: string; label: string; type: MovementType; sign: "any" | "in" | "out" }[] = [
  { key: "count", label: "Inventaire", type: "correction", sign: "any" },
  { key: "receipt", label: "Réception", type: "receipt", sign: "in" },
  { key: "return", label: "Retour client", type: "return", sign: "in" },
  { key: "loss", label: "Casse / perte", type: "adjustment", sign: "out" },
];

/** Écran modal « Ajuster » : nouvelle quantité, motif, confirmation, puis mouvement réel (annulable 4 s). */
export default function AdjustScreen() {
  const { skuId } = useLocalSearchParams<{ skuId: string }>();
  const { permissions } = useActiveOrg();
  const detail = useSkuDetail(skuId ?? "");
  const movement = useApplyMovement();
  const toast = useToast();
  const [raw, setRaw] = useState("");
  const [reasonKey, setReasonKey] = useState("count");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  const current = detail.data?.view.row.quantity_on_hand ?? 0;
  const reason = REASONS.find((r) => r.key === reasonKey) ?? REASONS[0]!;
  const validation = useMemo(() => {
    if (raw.trim() === "") return { error: undefined, delta: null as number | null };
    if (!/^-?\d+$/.test(raw.trim())) return { error: "Nombre entier attendu.", delta: null };
    const next = Number.parseInt(raw, 10);
    if (next < 0) return { error: "La quantité ne peut pas être négative.", delta: null };
    if (next > 1_000_000_000) return { error: "Quantité trop élevée.", delta: null };
    const delta = next - current;
    if (delta === 0) return { error: "La quantité est identique au stock actuel.", delta: null };
    if (reason.sign === "in" && delta < 0) return { error: `${reason.label} : la quantité doit augmenter.`, delta: null };
    if (reason.sign === "out" && delta > 0) return { error: `${reason.label} : la quantité doit diminuer.`, delta: null };
    if (Math.abs(delta) > 1_000_000) return { error: "Un mouvement est limité à 1 000 000 d'unités.", delta: null };
    return { error: undefined, delta };
  }, [raw, current, reason]);

  if (detail.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Retour" />
        <Skeleton w="100%" h={160} r={radius.xl} />
      </Screen>
    );
  if (detail.isError || !detail.data)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Retour" />
        <ErrorState description={detail.isError ? userMessage(detail.error) : "Variante introuvable."} onRetry={() => void detail.refetch()} />
      </Screen>
    );

  const v = detail.data.view;

  function apply(delta: number, undo = false) {
    movement.mutate(
      { sku_id: skuId ?? "", type: undo ? "correction" : reason.type, direction: delta > 0 ? "in" : "out", quantity: Math.abs(delta), note: undo ? "Annulation d'un ajustement (application mobile)" : note.trim() || `${reason.label} (application mobile)` },
      {
        onSuccess: (r) => {
          setConfirming(false);
          if (undo) {
            toast({ text: `Ajustement annulé : stock ${r.quantityAfter ?? "—"}` });
            return;
          }
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          toast({ text: `Stock mis à jour : ${r.quantityAfter ?? "—"}`, action: { label: "Annuler", onPress: () => apply(-delta, true) } });
          router.back();
        },
        onError: (e) => {
          setConfirming(false);
          toast({ text: userMessage(e), tone: "error" });
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
            <Button label="Enregistrer" disabled={!permissions.canWrite || validation.delta === null} onPress={() => setConfirming(true)} style={{ flex: 2 }} testID="adjust-save" />
          </StickyActions>
        }
      >
        <DetailHeader parentLabel="Retour" />
        <View style={{ gap: 4 }}>
          <Txt variant="title2" accessibilityRole="header">
            Ajuster le stock
          </Txt>
          <Txt variant="label">
            {v.row.product_name} · {variantTitle(v)} · SKU {v.row.code}
          </Txt>
        </View>
        {!permissions.canWrite ? (
          <ErrorState title="Lecture seule" description="Votre rôle ne permet pas de modifier le stock." />
        ) : (
          <Card padded style={{ gap: space[4] }}>
            <Txt variant="bodyRegular">
              Stock actuel : <Txt variant="body" num>{formatNumber(current)}</Txt>
            </Txt>
            <View style={{ gap: 6 }}>
              <Txt variant="label" color="#141413" style={{ fontFamily: "Manrope_700Bold" }}>
                Motif
              </Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
                {REASONS.map((r) => (
                  <FilterChip key={r.key} label={r.label} selected={r.key === reasonKey} onPress={() => setReasonKey(r.key)} />
                ))}
              </ScrollView>
            </View>
            <TextField label="Nouvelle quantité" value={raw} onChangeText={setRaw} keyboardType="number-pad" placeholder={String(current)} error={validation.error} testID="adjust-quantity" />
            <TextField label="Note (facultatif)" value={note} onChangeText={setNote} maxLength={500} placeholder="Ex. inventaire du 9 octobre" />
          </Card>
        )}
      </Screen>
      <BottomSheet
        visible={confirming && validation.delta !== null}
        onClose={() => setConfirming(false)}
        title="Confirmer l'ajustement ?"
        description={`Le stock de ${v.row.code} passera de ${formatNumber(current)} à ${formatNumber(current + (validation.delta ?? 0))} (${reason.label.toLowerCase()}). Le mouvement est enregistré dans l'historique.`}
      >
        <Button label="Confirmer" loading={movement.isPending} onPress={() => validation.delta !== null && apply(validation.delta)} testID="adjust-confirm" />
        <Button label="Annuler" variant="ghost" onPress={() => setConfirming(false)} />
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}
