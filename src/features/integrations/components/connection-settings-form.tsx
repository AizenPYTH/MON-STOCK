"use client";
import { useActionState, useState } from "react";
import { FormError, FormSuccess, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { cn } from "@/lib/utils";
import type { ChannelConnection } from "@/db/types";
import { updateConnectionSettingsAction } from "@/features/integrations/actions";
import { intervalLabel } from "@/features/integrations/components/labels";

const INTERVALS = [15, 30, 60, 120, 240, 720, 1440];

/**
 * Interrupteur v5 (44 × 26, pouce blanc) porté par une vraie case à cocher : le formulaire
 * envoie la valeur « on » comme avant, le lecteur d'écran annonce un interrupteur.
 */
function Switch({ name, checked, onChange, disabled, label, describedBy }: { name: string; checked: boolean; onChange: (v: boolean) => void; disabled: boolean; label: string; describedBy?: string }) {
  return (
    <span className="relative inline-flex h-10 w-11 shrink-0 items-center">
      <input
        type="checkbox"
        role="switch"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={label}
        aria-describedby={describedBy}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span aria-hidden="true" className={cn("pointer-events-none block h-[26px] w-11 rounded-full transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-50", checked ? "bg-inverse" : "bg-border-control/60")}>
        <span className={cn("block h-5 w-5 translate-y-[3px] rounded-full bg-surface shadow-raised transition-transform duration-[240ms] ease-[cubic-bezier(.22,1,.36,1)]", checked ? "translate-x-[21px]" : "translate-x-[3px]")} />
      </span>
    </span>
  );
}

/**
 * Paramètres d'une connexion de canal : envoi des quantités vers eBay (opt-in, réglage réel
 * `push_inventory`), synchronisation automatique et intervalle. Rien n'est enregistré avant
 * « Enregistrer les paramètres ».
 */
export function ConnectionSettingsForm({ connection, disabled }: { connection: Pick<ChannelConnection, "id" | "auto_sync" | "sync_interval_minutes" | "push_inventory">; disabled: boolean }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(updateConnectionSettingsAction, null);
  const [push, setPush] = useState(connection.push_inventory);
  const [auto, setAuto] = useState(connection.auto_sync);
  const [interval, setIntervalValue] = useState(String(connection.sync_interval_minutes));
  const err = state && !state.ok ? state : null;
  const id = connection.id.slice(0, 8);
  const dirty = push !== connection.push_inventory || auto !== connection.auto_sync || interval !== String(connection.sync_interval_minutes);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="connection_id" value={connection.id} />
      <FormError message={err?.error} />
      {state?.ok && !dirty ? <FormSuccess message="Paramètres enregistrés." /> : null}

      <div className="flex items-center gap-3 rounded-xl border border-line-soft bg-surface-2 px-3.5 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-bold text-foreground">Envoyer les quantités vers eBay</span>
          <span id={`push-hint-${id}`} className="mt-0.5 block text-[12.5px] font-semibold leading-[17px] text-ink-3">
            Désactivé par défaut. Une fois activé, chaque synchronisation envoie le stock disponible des SKU associés aux annonces dont la quantité diffère (ReviseInventoryStatus). Une annonce créée avec l&apos;Inventory API eBay peut refuser la mise à jour : l&apos;erreur eBay est alors affichée telle quelle.
          </span>
        </span>
        <Switch name="push_inventory" checked={push} onChange={setPush} disabled={disabled} label="Envoyer les quantités vers eBay" describedBy={`push-hint-${id}`} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line-soft bg-surface-2 px-3.5 py-3">
        <span className="min-w-0 flex-1 basis-60">
          <span className="block text-[14.5px] font-bold text-foreground">Synchronisation automatique</span>
          <span id={`auto-hint-${id}`} className="mt-0.5 block text-[12.5px] font-semibold leading-[17px] text-ink-3">
            Annonces et commandes relues par la tâche planifiée du serveur selon l&apos;intervalle choisi.
          </span>
        </span>
        <label className="flex items-center gap-2 text-[13px] font-bold text-muted">
          <span>Intervalle</span>
          <Select id={`interval-${id}`} name="sync_interval_minutes" value={interval} onChange={(e) => setIntervalValue(e.target.value)} disabled={disabled} className="h-10 w-28">
            {INTERVALS.map((m) => (
              <option key={m} value={m}>
                {intervalLabel(m)}
              </option>
            ))}
          </Select>
        </label>
        <Switch name="auto_sync" checked={auto} onChange={setAuto} disabled={disabled} label="Synchronisation automatique" describedBy={`auto-hint-${id}`} />
      </div>
      {err?.fieldErrors?.sync_interval_minutes ? <p role="alert" className="text-xs font-semibold text-danger">{err.fieldErrors.sync_interval_minutes.join(" ")}</p> : null}

      {disabled ? (
        <p className="text-xs font-semibold text-ink-3">Modifiables par les administrateurs uniquement.</p>
      ) : (
        <SubmitButton variant="secondary" size="sm" pendingText="Enregistrement…" disabled={!dirty} title={dirty ? undefined : "Aucune modification à enregistrer"}>
          Enregistrer les paramètres
        </SubmitButton>
      )}
    </form>
  );
}
