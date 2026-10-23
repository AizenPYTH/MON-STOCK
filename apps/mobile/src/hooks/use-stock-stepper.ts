import { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { useMovementRunner } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { useToast } from "~/components/ui";
import { StepperQueue } from "~/hooks/stepper-queue";

const FLUSH_DELAY_MS = 700;

/**
 * Stepper de quantité « en direct » : les taps s'affichent tout de suite comme « en cours »
 * (jamais comme enregistrés), puis UN mouvement d'ajustement par rafale (700 ms), envois
 * sérialisés (StepperQueue, M-04). La quantité affichée ensuite est CELLE DE LA BASE
 * (quantity_after). Échec → retour à la valeur serveur + message. Succès → notification avec
 * « Annuler » (mouvement inverse, lui aussi validé par la base, exécuté même si l'écran est fermé).
 * `serverOnHand` null (stock inconnu) : le stepper est désactivé par l'appelant.
 */
export function useStockStepper(skuId: string, serverOnHand: number) {
  const run = useMovementRunner();
  const toast = useToast();
  const [queueState, setQueueState] = useState({ pending: 0, inFlight: 0 });
  // Quantité confirmée par la base, valable tant que les données serveur n'ont pas été relues.
  const [confirmed, setConfirmed] = useState<{ value: number | null; basedOn: number } | null>(null);
  const serverRef = useRef(serverOnHand);
  serverRef.current = serverOnHand;
  const runRef = useRef(run);
  runRef.current = run;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const undo = useCallback(
    (delta: number) => {
      void runRef
        .current({ sku_id: skuId, type: "adjustment", direction: delta > 0 ? "in" : "out", quantity: Math.abs(delta), note: "Annulation d'un ajustement (application mobile)" })
        .then((r) => toastRef.current({ text: `Ajustement annulé : stock ${r.quantityAfter ?? "—"}` }))
        .catch((e) => toastRef.current({ text: `Annulation non enregistrée : ${userMessage(e)}`, tone: "error" }));
    },
    [skuId],
  );

  const [queue] = useState(
    () =>
      new StepperQueue({
        delayMs: FLUSH_DELAY_MS,
        send: async (delta) => {
          const r = await runRef.current({ sku_id: skuId, type: "adjustment", direction: delta > 0 ? "in" : "out", quantity: Math.abs(delta), note: "Ajustement rapide (application mobile)" });
          return r.quantityAfter;
        },
        onConfirmed: (after, delta) => {
          setConfirmed({ value: after, basedOn: serverRef.current });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          toastRef.current({ text: `Stock enregistré : ${after ?? "—"} (${delta > 0 ? "+" : ""}${delta})`, action: { label: "Annuler", onPress: () => undo(-delta) } });
        },
        onError: (e) => toastRef.current({ text: `Ajustement non enregistré : ${userMessage(e)}`, tone: "error" }),
        onState: setQueueState,
      }),
  );

  // Fermeture de l'écran : les derniers taps partent quand même (jamais perdus en silence).
  useEffect(
    () => () => {
      queue.flushNow();
      queue.dispose();
    },
    [queue],
  );

  const base = confirmed && confirmed.basedOn === serverOnHand && confirmed.value !== null ? confirmed.value : serverOnHand;
  const value = base + queueState.inFlight + queueState.pending;

  const onChange = useCallback(
    (next: number) => {
      const s = queue.state();
      queue.tap(next - (base + s.inFlight + s.pending));
    },
    [base, queue],
  );

  const unsaved = queueState.pending + queueState.inFlight;
  return { value, onChange, busy: unsaved !== 0, unsaved };
}
