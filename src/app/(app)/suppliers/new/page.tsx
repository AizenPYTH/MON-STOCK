import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader } from "@/components/ui/page";
import { SupplierForm } from "@/features/suppliers/components/supplier-form";

export const metadata: Metadata = { title: "Nouveau fournisseur" };

export default async function NewSupplierPage() {
  const ctx = await requireOrgContext();
  if (!canWrite(ctx.role)) redirect("/suppliers");
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/suppliers" className="hover:text-foreground">
            Fournisseurs
          </Link>
        }
        title="Nouveau fournisseur"
        description="Seul le nom est obligatoire. Les offres, sources et commandes se gèrent ensuite depuis sa fiche."
      />
      <div className="max-w-4xl">
        <SupplierForm defaultCurrency={ctx.organization.default_currency} />
      </div>
    </>
  );
}
