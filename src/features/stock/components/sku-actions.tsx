"use client";
import { useActionState } from "react";
import { FormError, FormSuccess } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { applyPendingSalesAction, archiveProductAction } from "@/features/stock/actions";

/** Archivage / réactivation d'un produit (le modèle de suppression : l'historique est conservé). */
export function ArchiveProductForm({ productId, archived }: { productId: string; archived: boolean }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(archiveProductAction, null);
  const err = state && !state.ok ? state : null;
  return (
    <form action={action} className="rounded-xl border border-dashed border-border p-4">
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="archive" value={archived ? "false" : "true"} />
      <FormError message={err?.error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{archived ? "Réactiver le produit" : "Archiver le produit"}</div>
          <p className="text-xs text-muted">
            L'archivage masque le produit et toutes ses variantes des listes et des analyses ; les mouvements, ventes et commandes fournisseurs sont conservés. Un produit avec historique ne peut pas être supprimé définitivement.
          </p>
        </div>
        <SubmitButton
          variant={archived ? "secondary" : "danger"}
          size="sm"
          pendingText={archived ? "Réactivation…" : "Archivage…"}
          confirmMessage={archived ? undefined : "Archiver ce produit et toutes ses variantes ? Vous pourrez le réactiver depuis la liste des produits archivés."}
        >
          {archived ? "Réactiver" : "Archiver"}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Déduction explicite des ventes rattachées a posteriori à un SKU. */
export function ApplyPendingSalesForm({ skuId, code }: { skuId: string; code: string }) {
  const [state, action] = useActionState<ActionResult<{ message: string }> | null, FormData>(applyPendingSalesAction, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="sku_id" value={skuId} />
      <input type="hidden" name="code" value={code} />
      <SubmitButton variant="secondary" size="sm" pendingText="Déduction…" confirmMessage="Déduire ces ventes du stock ? Vérifiez d'abord votre stock physique.">
        Déduire ces ventes du stock
      </SubmitButton>
      {state && !state.ok ? <FormError message={state.error} /> : null}
      {state?.ok ? <FormSuccess message={state.data.message} /> : null}
    </form>
  );
}
