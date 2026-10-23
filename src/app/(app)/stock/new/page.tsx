import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Callout } from "@/components/ui/page";
import { Paper, Scene, SceneHeader } from "@/components/instrument";
import { ProductForm } from "@/features/stock/components/product-form";

export const metadata: Metadata = { title: "Nouveau produit" };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ product?: string; name?: string; code?: string; sale_price?: string }> }) {
  const ctx = await requireOrgContext();
  const { product: productId, name, code, sale_price } = await searchParams;
  // Pré-remplissage optionnel (ex. « Créer un SKU depuis cette annonce » dans les associations marketplace).
  const defaults = {
    name: name?.slice(0, 300),
    code: code?.slice(0, 64),
    sale_price: sale_price && /^\d+([.,]\d{1,2})?$/.test(sale_price) ? sale_price.replace(",", ".") : undefined,
  };
  const [{ data: suppliers }, product] = await Promise.all([
    ctx.supabase.from("suppliers").select("id, name").eq("organization_id", ctx.organization.id).eq("is_archived", false).order("name"),
    productId ? ctx.supabase.from("products").select("id, name, brand").eq("id", productId).eq("organization_id", ctx.organization.id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ]);
  if (productId && !product) notFound();
  if (!canWrite(ctx.role)) {
    return (
      <>
        <Scene>
          <SceneHeader back={{ href: "/stock", label: "Stock" }} title="Nouveau produit" />
        </Scene>
        <Paper>
          <Callout tone="neutral">Votre rôle (lecture seule) ne permet pas de créer des produits.</Callout>
        </Paper>
      </>
    );
  }
  return (
    <>
      <Scene>
        <SceneHeader
          back={{ href: "/stock", label: "Stock" }}
          eyebrow={product ? "Variante" : "Produit"}
          title={product ? "Nouvelle variante" : "Nouveau produit"}
          description={product ? `Ajouter une variante et un SKU à « ${product.name} ».` : "Créez un produit, sa première variante et son SKU."}
        />
      </Scene>
      <Paper>
        <div className="max-w-5xl">
          <ProductForm product={product} suppliers={suppliers ?? []} currency={ctx.organization.default_currency} defaults={defaults} cancelHref="/stock" />
        </div>
      </Paper>
    </>
  );
}
