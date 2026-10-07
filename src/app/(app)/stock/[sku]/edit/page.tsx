import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, Callout } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { getSkuDetail } from "@/features/stock/queries";
import { SkuEditForm, ProductEditForm } from "@/features/stock/components/sku-edit-form";
import { archiveProductAction } from "@/features/stock/actions";

export const metadata: Metadata = { title: "Modifier le SKU" };

export default async function EditSkuPage({ params }: { params: Promise<{ sku: string }> }) {
  const ctx = await requireOrgContext();
  const { sku } = await params;
  const detail = await getSkuDetail(ctx, decodeURIComponent(sku));
  if (!detail) notFound();
  if (!canWrite(ctx.role)) {
    return (
      <>
        <PageHeader title="Modifier" />
        <Callout tone="neutral">Votre rôle (lecture seule) ne permet pas de modifier les produits.</Callout>
      </>
    );
  }
  const code = detail.row.code ?? "";
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/stock/${encodeURIComponent(code)}` as never} className="hover:text-foreground">
            ← {code}
          </Link>
        }
        title={`Modifier ${detail.row.product_name}`}
      />
      <div className="max-w-4xl space-y-6">
        {detail.product ? <ProductEditForm product={detail.product} /> : null}
        <SkuEditForm row={detail.row} variant={detail.variant} suppliers={detail.suppliers} />
        {detail.product ? (
          <form action={archiveProductAction} className="rounded-xl border border-dashed border-border p-4">
            <input type="hidden" name="product_id" value={detail.product.id} />
            <input type="hidden" name="archive" value={detail.product.is_archived ? "false" : "true"} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{detail.product.is_archived ? "Réactiver le produit" : "Archiver le produit"}</div>
                <p className="text-xs text-muted">L'archivage masque le produit et toutes ses variantes des listes ; l'historique est conservé.</p>
              </div>
              <Button type="submit" variant={detail.product.is_archived ? "secondary" : "danger"} size="sm">
                {detail.product.is_archived ? "Réactiver" : "Archiver"}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </>
  );
}
