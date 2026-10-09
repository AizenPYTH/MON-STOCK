import { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { useApplyMovement } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { useToast } from "~/components/ui";

const FLUSH_DELAY_MS = 700;

/**
 * Stepper de quantité « en direct » (design 1c) : affichage immédiat (optimiste), puis UN SEUL
 * mouvement d'ajustement pour la rafale de taps (regroupée 700 ms). La quantité affichée ensuite
 * est CELLE DE LA BASE (quantity_after). Échec → retour à la valeur serveur + toast d'erreur.
 * Succès → toast avec « Annuler » (mouvement inverse, lui aussi validé par la base).
 */
export function useStockStepper(skuId: string, serverOnHand: number) {
  const movement = useApplyMovement();
  const toast = useToast();
  const [pending, setPending] = useState(0);
  // Quantité confirmée par la base, valable tant que les données serveur n'ont pas été relues.
  const [confirmed, setConfirmed] = useState<{ value: number | null; basedOn: number } | null>(null);
  const pendingRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const undo = useCallback(
    (delta: number, basedOn: number) => {
      movement.mutate(
        { sku_id: skuId, type: "adjustment", direction: delta > 0 ? "in" : "out", quantity: Math.abs(delta), note: "Annulation d'un ajustement (application mobile)" },
        {
          onSuccess: (r) => {
            setConfirmed({ value: r.quantityAfter, basedOn });
            toast({ text: `Ajustement annulé : stock ${r.quantityAfter ?? "—"}` });
          },
          onError: (e) => toast({ text: userMessage(e), tone: "error" }),
        },
      );
    },
    [movement, skuId, toast],
  );

  const send = useCallback(
    (delta: number) => {
      if (delta === 0) return;
      const basedOn = serverOnHand;
      movement.mutate(
        { sku_id: skuId, type: "adjustment", direction: delta > 0 ? "in" : "out", quantity: Math.abs(delta), note: "Ajustement rapide (application mobile)" },
        {
          onSuccess: (r) => {
            pendingRef.current = 0;
            setPending(0);
            setConfirmed({ value: r.quantityAfter, basedOn });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            toast({ text: `Stock mis à jour : ${r.quantityAfter ?? "—"} (${delta > 0 ? "+" : ""}${delta})`, action: { label: "Annuler", onPress: () => undo(-delta, basedOn) } });
          },
          onError: (e) => {
            pendingRef.current = 0;
            setPending(0);
            toast({ text: userMessage(e), tone: "error" });
          },
        },
      );
    },
    [movement, skuId, toast, undo, serverOnHand],
  );

  const base = confirmed && confirmed.basedOn === serverOnHand && confirmed.value !== null ? confirmed.value : serverOnHand;
  const value = base + pending;

  const onChange = useCallback(
    (next: number) => {
      const delta = next - (base + pendingRef.current);
      pendingRef.current += delta;
      setPending(pendingRef.current);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => send(pendingRef.current), FLUSH_DELAY_MS);
    },
    [base, send],
  );

  return { value, onChange, busy: movement.isPending || pending !== 0 };
}
