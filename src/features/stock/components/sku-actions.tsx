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
    <form action={action} className="grid gap-x-8 gap-y-3 lg:grid-cols-[240px_minmax(0,1fr)]">
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="archive" value={archived ? "false" : "true"} />
      <div className="min-w-0 lg:pt-4">
        <div className="ms-mono mb-1 text-[10.5px] leading-[14px] text-ink-3">Zone sensible</div>
        <h2 className="text-h3 text-foreground">{archived ? "Réactiver le produit" : "Archiver le produit"}</h2>
      </div>
      <div className={archived ? "rounded-2xl border border-border bg-surface p-5" : "rounded-2xl border border-danger-line bg-surface p-5"}>
        <FormError message={err?.error} />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="min-w-0 flex-1 basis-72 text-sm text-muted">
            L&apos;archivage masque le produit et toutes ses variantes des listes et des analyses ; les mouvements, ventes et commandes fournisseurs sont conservés. Un produit avec historique ne peut pas être supprimé définitivement.
          </p>
          <SubmitButton
            variant={archived ? "secondary" : "danger"}
            pendingText={archived ? "Réactivation…" : "Archivage…"}
            confirmMessage={archived ? undefined : "Archiver ce produit et toutes ses variantes ? Vous pourrez le réactiver depuis la liste des produits archivés."}
          >
            {archived ? "Réactiver" : "Archiver le produit"}
          </SubmitButton>
        </div>
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
