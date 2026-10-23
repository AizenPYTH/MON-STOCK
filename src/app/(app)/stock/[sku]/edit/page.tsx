import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Callout } from "@/components/ui/page";
import { Paper, Scene, SceneHeader } from "@/components/instrument";
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
        <Scene>
          <SceneHeader back={{ href: "/stock", label: "Stock" }} title="Modifier" />
        </Scene>
        <Paper>
          <Callout tone="neutral">Votre rôle (lecture seule) ne permet pas de modifier les produits.</Callout>
        </Paper>
      </>
    );
  }
  const code = detail.row.code ?? "";
  return (
    <>
      <Scene>
        <SceneHeader back={{ href: `/stock/${encodeURIComponent(code)}`, label: code }} eyebrow={`${detail.row.category ?? "Sans catégorie"} · ${code}`} title={`Modifier ${detail.row.product_name ?? code}`} description="Produit, variante et SKU : chaque modification est vérifiée contre les éditions simultanées." />
      </Scene>
      <Paper>
        <div className="max-w-5xl space-y-10">
          {detail.product ? <ProductEditForm product={detail.product} /> : null}
          <SkuEditForm row={detail.row} variant={detail.variant} suppliers={detail.suppliers} updatedAt={detail.skuUpdatedAt} cancelHref={`/stock/${encodeURIComponent(code)}`} />
          {detail.product ? <ArchiveProductForm productId={detail.product.id} archived={detail.product.is_archived} /> : null}
        </div>
      </Paper>
    </>
  );
}
