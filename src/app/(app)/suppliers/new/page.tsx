import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Paper, Scene, SceneHeader } from "@/components/instrument";
import { SupplierForm } from "@/features/suppliers/components/supplier-form";

export const metadata: Metadata = { title: "Nouveau fournisseur" };

export default async function NewSupplierPage() {
  const ctx = await requireOrgContext();
  if (!canWrite(ctx.role)) redirect("/suppliers");
  return (
    <>
      <Scene>
        <SceneHeader back={{ href: "/suppliers", label: "Mes fournisseurs" }} eyebrow="Fournisseurs · nouveau" title="Nouveau fournisseur" description="Seul le nom est obligatoire. Les offres, sources et commandes se gèrent ensuite depuis sa fiche." />
      </Scene>
      <Paper>
        <div className="max-w-4xl">
          <SupplierForm defaultCurrency={ctx.organization.default_currency} />
        </div>
      </Paper>
    </>
  );
}
