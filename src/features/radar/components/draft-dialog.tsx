"use client";
import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { RadarDraftForm } from "@/features/radar/components/draft-form";

/** « Préparer un brouillon » → dialogue quantité (rien n'est envoyé au fournisseur). */
export function DraftDialogButton({ offerId, supplierName, moq, unitPrice, currency, taxLabel, disabledReason }: { offerId: string; supplierName: string; moq: number | null; unitPrice: number | null; currency: string; taxLabel: string | null; disabledReason: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={disabledReason !== null} title={disabledReason ?? undefined} className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-mint px-3 text-[15px] font-extrabold text-night hover:bg-mint-pressed disabled:cursor-not-allowed disabled:bg-track disabled:text-ink-3">
        <ClipboardList aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate">Préparer un brouillon</span>
      </button>
      {disabledReason ? <span className="sr-only">{disabledReason}</span> : null}
      <Dialog open={open} onClose={() => setOpen(false)} title="Brouillon de commande fournisseur" className="max-w-[460px] rounded-3xl">
        {unitPrice !== null ? <RadarDraftForm offerId={offerId} supplierName={supplierName} moq={moq} unitPrice={unitPrice} currency={currency} taxLabel={taxLabel} onCancel={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  );
}
