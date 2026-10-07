import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, Callout } from "@/components/ui/page";
import { ProductForm } from "@/features/stock/components/product-form";

export const metadata: Metadata = { title: "Nouveau produit" };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const ctx = await requireOrgContext();
  const { product: productId } = await searchParams;
  const [{ data: suppliers }, product] = await Promise.all([
    ctx.supabase.from("suppliers").select("id, name").eq("organization_id", ctx.organization.id).eq("is_archived", false).order("name"),
    productId ? ctx.supabase.from("products").select("id, name, brand").eq("id", productId).eq("organization_id", ctx.organization.id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ]);
  if (productId && !product) notFound();
  if (!canWrite(ctx.role)) {
    return (
      <>
        <PageHeader title="Nouveau produit" />
        <Callout tone="neutral">Votre rôle (lecture seule) ne permet pas de créer des produits.</Callout>
      </>
    );
  }
  return (
    <>
      <PageHeader title={product ? "Nouvelle variante" : "Nouveau produit"} description={product ? `Ajouter une variante et un SKU à « ${product.name} ».` : "Créez un produit, sa première variante et son SKU."} />
      <div className="max-w-4xl">
        <ProductForm product={product} suppliers={suppliers ?? []} currency={ctx.organization.default_currency} />
      </div>
    </>
  );
}
