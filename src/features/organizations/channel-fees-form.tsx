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
          {channels.length === 0 ? <p className="text-sm text-muted">Aucun canal de vente.</p> : null}
          {channels.map((c) => (
            <fieldset key={c.id} className="rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium">
                {PROVIDER_LABEL[c.provider] ?? c.provider} · {c.name}
              </legend>
              <input type="hidden" name="channel_id" value={c.id} />
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-muted">
                  Commission (%)
                  <Input name={`fee_percent:${c.id}`} type="number" step="0.01" min="0" max="100" defaultValue={c.fee_percent ?? ""} disabled={disabled} className="mt-1" />
                </label>
                <label className="text-xs text-muted">
                  Paiement (%)
                  <Input name={`payment_fee_percent:${c.id}`} type="number" step="0.01" min="0" max="100" defaultValue={c.payment_fee_percent ?? ""} disabled={disabled} className="mt-1" />
                </label>
                <label className="text-xs text-muted">
                  Paiement fixe
                  <Input name={`payment_fee_fixed:${c.id}`} type="number" step="0.01" min="0" defaultValue={c.payment_fee_fixed ?? ""} disabled={disabled} className="mt-1" />
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
