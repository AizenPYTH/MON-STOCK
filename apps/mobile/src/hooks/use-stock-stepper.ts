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
  // Dernières valeurs lues par la file (mises à jour après le rendu, jamais pendant).
  const latest = useRef({ serverOnHand, run, toast });
  useEffect(() => {
    latest.current = { serverOnHand, run, toast };
  });

  const queueRef = useRef<StepperQueue | null>(null);
  const getQueue = useCallback((): StepperQueue => {
    if (queueRef.current) return queueRef.current;
    const movement = (delta: number, note: string) => latest.current.run({ sku_id: skuId, type: "adjustment", direction: delta > 0 ? "in" : "out", quantity: Math.abs(delta), note });
    const undo = (delta: number) =>
      void movement(delta, "Annulation d'un ajustement (application mobile)")
        .then((r) => latest.current.toast({ text: `Ajustement annulé : stock ${r.quantityAfter ?? "—"}` }))
        .catch((e) => latest.current.toast({ text: `Annulation non enregistrée : ${userMessage(e)}`, tone: "error" }));
    queueRef.current = new StepperQueue({
      delayMs: FLUSH_DELAY_MS,
      send: async (delta) => (await movement(delta, "Ajustement rapide (application mobile)")).quantityAfter,
      onConfirmed: (after, delta) => {
        setConfirmed({ value: after, basedOn: latest.current.serverOnHand });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        latest.current.toast({ text: `Stock enregistré : ${after ?? "—"} (${delta > 0 ? "+" : ""}${delta})`, action: { label: "Annuler", onPress: () => undo(-delta) } });
      },
      onError: (e) => latest.current.toast({ text: `Ajustement non enregistré : ${userMessage(e)}`, tone: "error" }),
      onState: setQueueState,
    });
    return queueRef.current;
  }, [skuId]);

  // Fermeture de l'écran : les derniers taps partent quand même (jamais perdus en silence).
  useEffect(
    () => () => {
      const q = queueRef.current;
      if (!q) return;
      q.flushNow();
      q.dispose();
    },
    [],
  );

  const base = confirmed && confirmed.basedOn === serverOnHand && confirmed.value !== null ? confirmed.value : serverOnHand;
  const value = base + queueState.inFlight + queueState.pending;

  const onChange = useCallback(
    (next: number) => {
      const q = getQueue();
      const st = q.state();
      q.tap(next - (base + st.inFlight + st.pending));
    },
    [base, getQueue],
  );

  const unsaved = queueState.pending + queueState.inFlight;
  return { value, onChange, busy: unsaved !== 0, unsaved };
}
