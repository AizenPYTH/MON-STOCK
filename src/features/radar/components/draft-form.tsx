"use client";
import { useActionState, useState } from "react";
import { Field, FormError, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { formatMoney } from "@/lib/format";
import { createRadarDraftAction } from "@/features/radar/actions";

/** Brouillon de commande fournisseur : rien n'est envoyé, le brouillon reste modifiable et supprimable. */
export function RadarDraftForm({ offerId, supplierName, moq, unitPrice, currency, taxLabel }: { offerId: string; supplierName: string; moq: number | null; unitPrice: number; currency: string; taxLabel: string | null }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(createRadarDraftAction, null);
  const min = Math.max(1, moq ?? 1);
  const [qty, setQty] = useState(String(min));
  const n = Number(qty);
  const total = Number.isInteger(n) && n >= min ? unitPrice * n : null;
  const err = state && !state.ok ? state : null;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="offer_id" value={offerId} />
      <FormError message={err?.error} action={err?.action} />
      <Field label={`Quantité (minimum ${min})`} htmlFor="draft_qty" error={err?.fieldErrors?.quantity}>
        <Input id="draft_qty" name="quantity" type="number" min={min} max={100000} step={1} value={qty} onChange={(e) => setQty(e.target.value)} required />
      </Field>
      <p className="text-xs text-muted tnum">
        Total estimé : {total === null ? "—" : formatMoney(total, currency)}
        {taxLabel ? ` ${taxLabel}` : ""} (hors transport)
      </p>
      <SubmitButton pendingText="Création…" className="w-full">
        Créer le brouillon
      </SubmitButton>
      <p className="text-xs text-muted">Rien n&apos;est envoyé à {supplierName} : le brouillon s&apos;ouvre dans les commandes du fournisseur, modifiable et supprimable.</p>
    </form>
  );
}
