"use client";
import { useActionState } from "react";
import { Checkbox, Field, FormError, FormSuccess, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import type { ChannelConnection } from "@/db/types";
import { updateConnectionSettingsAction } from "@/features/integrations/actions";

const INTERVALS = [15, 30, 60, 120, 240, 720, 1440];

export function ConnectionSettingsForm({ connection, disabled }: { connection: Pick<ChannelConnection, "id" | "auto_sync" | "sync_interval_minutes" | "push_inventory">; disabled: boolean }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(updateConnectionSettingsAction, null);
  const err = state && !state.ok ? state : null;
  const id = connection.id.slice(0, 8);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="connection_id" value={connection.id} />
      <FormError message={err?.error} />
      {state?.ok ? <FormSuccess message="Paramètres enregistrés." /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox name="auto_sync" defaultChecked={connection.auto_sync} disabled={disabled} className="mt-0.5" />
          <span>
            <span className="font-medium">Synchronisation automatique</span>
            <span className="block text-xs text-muted">Exécutée par le cron (/api/cron/sync) selon l'intervalle ci-dessous.</span>
          </span>
        </label>
        <Field label="Intervalle" htmlFor={`interval-${id}`} error={err?.fieldErrors?.sync_interval_minutes}>
          <Select id={`interval-${id}`} name="sync_interval_minutes" defaultValue={String(connection.sync_interval_minutes)} disabled={disabled}>
            {INTERVALS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} h`}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <Checkbox name="push_inventory" defaultChecked={connection.push_inventory} disabled={disabled} className="mt-0.5" />
          <span>
            <span className="font-medium">Envoyer automatiquement les quantités vers eBay</span>
            <span className="block text-xs text-muted">
              Désactivé par défaut. Lorsqu'activé, chaque synchronisation pousse le stock disponible des SKU associés vers les annonces dont la quantité diffère (ReviseInventoryStatus). Les annonces créées avec l'Inventory API eBay peuvent refuser cette mise à jour : l'erreur eBay est alors affichée telle quelle.
            </span>
          </span>
        </label>
      </div>
      {!disabled ? <SubmitButton variant="secondary" size="sm" pendingText="Enregistrement…">Enregistrer les paramètres</SubmitButton> : null}
    </form>
  );
}
