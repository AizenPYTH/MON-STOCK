"use client";
import { useActionState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FormError, FormSuccess, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import type { SalesChannel } from "@/db/types";
import { updateChannelFeesAction } from "@/features/organizations/channel-actions";

const PROVIDER_LABEL: Record<string, string> = { ebay: "eBay", amazon: "Amazon", shopify: "Shopify", woocommerce: "WooCommerce", manual: "Ventes manuelles" };

export function ChannelFeesForm({ channels, disabled }: { channels: SalesChannel[]; disabled: boolean }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(updateChannelFeesAction, null);
  const err = state && !state.ok ? state : null;
  return (
    <Card>
      <CardHeader title="Frais par canal" description="Commission marketplace et frais de paiement. Vide = inconnu : la marge nette sera alors indiquée comme partielle." />
      <CardContent>
        <form action={action} className="space-y-4">
          <FormError message={err?.error} />
          {state?.ok ? <FormSuccess message="Frais enregistrés." /> : null}
          {channels.length === 0 ? <p className="rounded-xl border border-dashed border-border-strong px-3 py-4 text-center text-sm font-semibold text-muted">Aucun canal de vente pour le moment.</p> : null}
          {channels.map((c) => (
            <fieldset key={c.id} className="rounded-xl border border-line-soft bg-surface-2 px-3.5 pb-3.5 pt-1">
              <legend className="flex items-center gap-2 px-1 text-sm font-bold text-foreground">
                {PROVIDER_LABEL[c.provider] ?? c.provider}
                <span className="font-semibold text-ink-3">· {c.name}</span>
              </legend>
              <input type="hidden" name="channel_id" value={c.id} />
              <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-3">
                <label className="block text-[12.5px] font-bold text-muted-strong">
                  Commission (%)
                  <Input name={`fee_percent:${c.id}`} type="number" inputMode="decimal" step="0.01" min="0" max="100" placeholder="—" defaultValue={c.fee_percent ?? ""} disabled={disabled} className="mt-1 tnum" />
                </label>
                <label className="block text-[12.5px] font-bold text-muted-strong">
                  Paiement (%)
                  <Input name={`payment_fee_percent:${c.id}`} type="number" inputMode="decimal" step="0.01" min="0" max="100" placeholder="—" defaultValue={c.payment_fee_percent ?? ""} disabled={disabled} className="mt-1 tnum" />
                </label>
                <label className="block text-[12.5px] font-bold text-muted-strong">
                  Paiement fixe
                  <Input name={`payment_fee_fixed:${c.id}`} type="number" inputMode="decimal" step="0.01" min="0" placeholder="—" defaultValue={c.payment_fee_fixed ?? ""} disabled={disabled} className="mt-1 tnum" />
                </label>
              </div>
            </fieldset>
          ))}
          {!disabled && channels.length > 0 ? <SubmitButton pendingText="Enregistrement…">Enregistrer les frais</SubmitButton> : null}
        </form>
      </CardContent>
    </Card>
  );
}
