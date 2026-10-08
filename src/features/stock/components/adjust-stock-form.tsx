"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/result";
import { adjustStockAction } from "@/features/stock/actions";

export function AdjustStockButton({ skuId, available }: { skuId: string; available: number }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const [state, action] = useActionState<ActionResult<{ quantityAfter: number | null }> | null, FormData>(
    async (prev, fd) => {
      const r = await adjustStockAction(prev, fd);
      if (r.ok) {
        setOpen(false);
        toast.success(r.data.quantityAfter === null ? "Mouvement de stock enregistré." : `Mouvement de stock enregistré : stock en main ${r.data.quantityAfter}.`);
      }
      return r;
    },
    null,
  );
  const err = state && !state.ok ? state : null;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Mouvement de stock
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Nouveau mouvement de stock">
        <form action={action} className="space-y-4">
          <input type="hidden" name="sku_id" value={skuId} />
          <FormError message={err?.error} />
          <p className="text-sm text-muted">Stock disponible actuel : <span className="font-medium text-foreground tnum">{available}</span>. Chaque mouvement est journalisé et irréversible (créez un mouvement inverse pour corriger). Un mouvement manuel ne peut pas rendre le stock négatif.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="mv_type" error={err?.fieldErrors?.type}>
              <Select id="mv_type" name="type" defaultValue="receipt">
                <option value="receipt">Réception fournisseur (+)</option>
                <option value="return">Retour client (+)</option>
                <option value="transfer_in">Transfert entrant (+)</option>
                <option value="transfer_out">Transfert sortant (−)</option>
                <option value="adjustment">Ajustement / inventaire</option>
                <option value="correction">Correction</option>
              </Select>
            </Field>
            <Field label="Sens (ajustement / correction)" htmlFor="mv_direction" error={err?.fieldErrors?.direction}>
              <Select id="mv_direction" name="direction" defaultValue="in">
                <option value="in">Entrée (+)</option>
                <option value="out">Sortie (−)</option>
              </Select>
            </Field>
          </div>
          <Field label="Quantité" htmlFor="mv_qty" error={err?.fieldErrors?.quantity}>
            <Input id="mv_qty" name="quantity" type="number" min="1" max="1000000" step="1" required />
          </Field>
          <Field label="Note" htmlFor="mv_note" error={err?.fieldErrors?.note}>
            <Textarea id="mv_note" name="note" placeholder="Bon de livraison, inventaire, casse…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <SubmitButton pendingText="Enregistrement…">Enregistrer le mouvement</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
