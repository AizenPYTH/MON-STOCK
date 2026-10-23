"use client";
import { useActionState, useState } from "react";
import { ArrowRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError, FormSuccess } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { formatNumber } from "@/lib/format";
import { pushListingQuantityAction, type PushQuantityData } from "@/features/integrations/actions";

/** Envoi d'une quantité vers eBay : écrit chez le canal, donc variante danger et confirmation explicite. */
export function PushQuantityButton({ listingId, listingTitle, channelQuantity, internalQuantity, disabledReason }: { listingId: string; listingTitle: string; channelQuantity: number | null; internalQuantity: number | null; disabledReason?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult<PushQuantityData> | null, FormData>(async (prev, formData) => {
    const result = await pushListingQuantityAction(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  const target = internalQuantity === null ? null : Math.max(0, internalQuantity);
  const disabled = Boolean(disabledReason) || target === null;
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabledReason ?? (target === null ? "Stock interne inconnu." : undefined)}
        className="border-danger-line text-danger hover:border-danger hover:bg-danger-soft"
      >
        <Upload aria-hidden="true" className="h-3.5 w-3.5" /> Pousser la quantité vers eBay
      </Button>
      {state?.ok ? (
        <FormSuccess message={`Quantité ${state.data.quantity} envoyée à eBay pour « ${state.data.listingTitle} ».${state.data.warnings.length > 0 ? ` Avertissements eBay : ${state.data.warnings.join(" ; ")}` : ""}`} />
      ) : null}
      {state && !state.ok && !open ? <FormError message={state.error} action={state.action} /> : null}
      <Dialog open={open} onClose={() => setOpen(false)} size="sm" title="Pousser la quantité vers eBay ?" description="La quantité de l'annonce est modifiée immédiatement chez eBay.">
        <form action={action} className="space-y-4">
          <input type="hidden" name="listing_id" value={listingId} />
          <input type="hidden" name="confirm" value="yes" />
          <p className="text-sm font-semibold text-foreground">« {listingTitle} »</p>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="ms-mono text-[10.5px] leading-[14px] text-ink-3">Sur eBay</div>
              <div className="text-[22px] font-semibold leading-7 text-muted tnum">{formatNumber(channelQuantity)}</div>
            </div>
            <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-3" />
            <div className="min-w-0 flex-1 text-right">
              <div className="ms-mono text-[10.5px] leading-[14px] text-ink-3">Envoyé (stock disponible)</div>
              <div className="text-[22px] font-bold leading-7 text-foreground tnum">{formatNumber(target)}</div>
            </div>
          </div>
          <p className="text-xs font-medium text-muted">
            L&apos;appel ReviseInventoryStatus est exécuté immédiatement ; les annonces créées avec l&apos;Inventory API eBay peuvent le refuser (l&apos;erreur eBay sera affichée).
          </p>
          {state && !state.ok ? <FormError message={state.error} action={state.action} /> : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <SubmitButton variant="danger" pendingText="Envoi à eBay…">
              Confirmer l&apos;envoi
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
