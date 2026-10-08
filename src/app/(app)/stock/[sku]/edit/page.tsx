import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, Callout } from "@/components/ui/page";
import { getSkuDetail } from "@/features/stock/queries";
import { SkuEditForm, ProductEditForm } from "@/features/stock/components/sku-edit-form";
import { ArchiveProductForm } from "@/features/stock/components/sku-actions";

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
        <SkuEditForm row={detail.row} variant={detail.variant} suppliers={detail.suppliers} updatedAt={detail.skuUpdatedAt} />
        {detail.product ? <ArchiveProductForm productId={detail.product.id} archived={detail.product.is_archived} /> : null}
      </div>
    </>
  );
}
