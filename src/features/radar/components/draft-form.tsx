"use client";
import { useActionState, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { FormError } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { formatMoney, formatNumber } from "@/lib/format";
import { createRadarDraftAction } from "@/features/radar/actions";

/** Brouillon de commande fournisseur : rien n'est envoyé, le brouillon reste modifiable et supprimable. */
export function RadarDraftForm({ offerId, supplierName, moq, unitPrice, currency, taxLabel, onCancel }: { offerId: string; supplierName: string; moq: number | null; unitPrice: number; currency: string; taxLabel: string | null; onCancel?: () => void }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(createRadarDraftAction, null);
  const min = Math.max(1, moq ?? 1);
  const [qty, setQty] = useState(String(min));
  const n = Number(qty);
  const valid = Number.isInteger(n) && n >= min && n <= 100_000;
  const total = valid ? unitPrice * n : null;
  const err = state && !state.ok ? state : null;
  const step = (d: number) => setQty(String(Math.min(100_000, Math.max(min, (valid ? n : min) + d))));
  return (
    <form action={action} className="space-y-3.5">
      <input type="hidden" name="offer_id" value={offerId} />
      <p className="-mt-1 text-sm font-medium text-muted">
        {formatMoney(unitPrice, currency)}
        {taxLabel ? ` ${taxLabel}` : ""} l&apos;unité chez {supplierName}.
      </p>
      <FormError message={err?.error} action={err?.action} />
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="draft_qty" className="text-[15px] font-semibold">
          Quantité {min > 1 ? <span className="text-sm font-medium text-muted">(MOQ {formatNumber(min)})</span> : null}
        </label>
        <span role="group" aria-label="Quantité" className="flex items-center gap-1 rounded-[14px] bg-background p-1">
          <button type="button" onClick={() => step(-1)} disabled={valid && n <= min} aria-label="Retirer une unité" className="flex h-11 w-11 items-center justify-center rounded-[11px] border border-border bg-surface disabled:opacity-40">
            <Minus aria-hidden="true" className="h-4 w-4" />
          </button>
          <input id="draft_qty" name="quantity" type="number" inputMode="numeric" min={min} max={100000} step={1} value={qty} onChange={(e) => setQty(e.target.value)} required aria-describedby="draft_total" className="h-11 w-16 bg-transparent text-center text-[22px] font-extrabold tnum [appearance:textfield] focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-inner-spin-button]:appearance-none" />
          <button type="button" onClick={() => step(1)} aria-label="Ajouter une unité" className="flex h-11 w-11 items-center justify-center rounded-[11px] border border-border bg-surface">
            <Plus aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
        </span>
      </div>
      {err?.fieldErrors?.quantity ? <p className="text-sm font-semibold text-danger">{err.fieldErrors.quantity.join(" ")}</p> : null}
      <p id="draft_total" className="text-[13px] font-semibold text-ink-3 tnum">
        Total {total === null ? "—" : formatMoney(total, currency)}
        {taxLabel ? ` ${taxLabel}` : ""} hors transport{valid ? "" : ` · minimum ${formatNumber(min)}`}
      </p>
      <SubmitButton pendingText="Création…" size="lg" className="h-[52px] w-full text-base">
        Créer le brouillon
      </SubmitButton>
      {onCancel ? (
        <button type="button" onClick={onCancel} className="h-11 w-full rounded-xl text-[15px] font-extrabold hover:bg-line-soft">
          Annuler
        </button>
      ) : null}
      <p className="text-xs font-semibold text-ink-3">Rien n&apos;est envoyé à {supplierName} : le brouillon s&apos;ouvre dans les commandes du fournisseur, modifiable et supprimable.</p>
    </form>
  );
}
