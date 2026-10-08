"use client";
import { useActionState, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError, FormSuccess } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { formatNumber } from "@/lib/format";
import { pushListingQuantityAction, type PushQuantityData } from "@/features/integrations/actions";

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
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={disabled} title={disabledReason ?? (target === null ? "Stock interne inconnu." : undefined)}>
        <Upload className="h-3.5 w-3.5" /> Pousser la quantité vers eBay
      </Button>
      {state?.ok ? (
        <FormSuccess message={`Quantité ${state.data.quantity} envoyée à eBay pour « ${state.data.listingTitle} ».${state.data.warnings.length > 0 ? ` Avertissements eBay : ${state.data.warnings.join(" ; ")}` : ""}`} />
      ) : null}
      {state && !state.ok && !open ? <FormError message={state.error} action={state.action} /> : null}
      <Dialog open={open} onClose={() => setOpen(false)} title="Pousser la quantité vers eBay">
        <form action={action} className="space-y-4">
          <input type="hidden" name="listing_id" value={listingId} />
          <input type="hidden" name="confirm" value="yes" />
          <p className="text-sm">
            Envoyer la quantité <strong className="tnum">{formatNumber(target)}</strong> (stock central disponible) à eBay pour l'annonce « {listingTitle} » ?
          </p>
          <p className="text-xs text-muted">
            Quantité actuellement affichée sur eBay : {formatNumber(channelQuantity)}. L'appel ReviseInventoryStatus est exécuté immédiatement ; les annonces créées avec l'Inventory API eBay peuvent le refuser (l'erreur eBay sera affichée).
          </p>
          {state && !state.ok ? <FormError message={state.error} action={state.action} /> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <SubmitButton pendingText="Envoi à eBay…">Confirmer l'envoi</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
