"use client";
import { useActionState, useId } from "react";
import { Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import { scheduleSourceAction, syncSourceAction, type MessageResult } from "@/features/sources/actions";
import { SCHEDULE_FREQUENCIES, type Frequency } from "@/features/sources/labels";

function Message({ state }: { state: MessageResult | null }) {
  if (!state) return null;
  const error = !state.ok || state.data.tone === "error";
  return (
    <p role={error ? "alert" : "status"} className={cn("text-xs", error ? "text-danger" : "text-success")}>
      {state.ok ? state.data.message : state.error}
    </p>
  );
}

/** « Synchroniser maintenant » (rédacteur ; verrou et délai de 2 min côté serveur). */
export function SyncSourceForm({ sourceId, label, disabled, variant = "secondary" }: { sourceId: string; label: string; disabled?: boolean; variant?: "primary" | "secondary" }) {
  const [state, action] = useActionState(syncSourceAction, null);
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="sourceId" value={sourceId} />
      <SubmitButton size="sm" variant={variant} disabled={disabled} pendingText="Synchronisation…">
        {label}
      </SubmitButton>
      <Message state={state} />
    </form>
  );
}

/** Fréquence d'une source planifiable (administrateur). */
export function ScheduleSourceForm({ sourceId, frequency, sourceName }: { sourceId: string; frequency: Frequency; sourceName: string }) {
  const [state, action] = useActionState(scheduleSourceAction, null);
  const id = useId();
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="sourceId" value={sourceId} />
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-freq`} className="sr-only">
          Fréquence de synchronisation de {sourceName}
        </label>
        <Select id={`${id}-freq`} name="frequency" defaultValue={frequency} className="h-8 w-auto text-xs">
          {SCHEDULE_FREQUENCIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
        <SubmitButton size="sm" variant="ghost" pendingText="…">
          Enregistrer
        </SubmitButton>
      </div>
      <Message state={state} />
    </form>
  );
}

/** Désactiver (pause) / réactiver une source (administrateur). */
export function ToggleSourceForm({ sourceId, disabled, sourceName }: { sourceId: string; disabled: boolean; sourceName: string }) {
  const [state, action] = useActionState(scheduleSourceAction, null);
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="sourceId" value={sourceId} />
      <input type="hidden" name="enabled" value={disabled ? "true" : "false"} />
      <SubmitButton size="sm" variant={disabled ? "secondary" : "ghost"} pendingText="…" confirmMessage={disabled ? undefined : `Désactiver la source « ${sourceName} » ? Elle ne sera plus synchronisée ; les offres déjà enregistrées restent dans l'historique.`}>
        {disabled ? "Réactiver" : "Désactiver"}
      </SubmitButton>
      <Message state={state} />
    </form>
  );
}
