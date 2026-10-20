import type { Metadata } from "next";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { activeSupplierOptions } from "@/features/catalog-imports/queries";
import { ImportWizard } from "@/features/catalog-imports/components/import-wizard";

export const metadata: Metadata = { title: "Importer un catalogue" };

function first(v: string | string[] | undefined): string {
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

export default async function NewCatalogImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const header = (
    <PageHeader
      eyebrow="Sourcing · Imports"
      title="Importer un catalogue"
      description="CSV, Excel, XML ou JSON · 15 Mo maximum. Rien n'est enregistré avant votre confirmation ; les prix sont enregistrés comme « prix importés d'un catalogue », datés de l'import."
      actions={
        <ButtonLink href="/sourcing/imports" variant="secondary">
          Historique des imports
        </ButtonLink>
      }
    />
  );
  if (!canWrite(ctx.role)) {
    return (
      <>
        {header}
        <EmptyState title="Lecture seule" description="Votre rôle ne permet pas d'importer un catalogue dans cette organisation." />
      </>
    );
  }
  const suppliers = await activeSupplierOptions(ctx);
  const supplierId = first(sp.supplierId);
  return (
    <>
      {header}
      <ImportWizard suppliers={suppliers} orgCurrency={ctx.organization.default_currency} initialSupplierId={/^[0-9a-f-]{36}$/i.test(supplierId) ? supplierId : null} initialSupplierName={first(sp.supplierName).slice(0, 160)} />
    </>
  );
}
