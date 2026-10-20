import type { Metadata } from "next";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { activeSupplierOptions } from "@/features/catalog-imports/queries";
import { FeedWizard } from "@/features/sources/components/feed-wizard";

export const metadata: Metadata = { title: "Ajouter un flux autorisé" };

export default async function NewFeedPage() {
  const ctx = await requireOrgContext();
  const header = (
    <PageHeader
      eyebrow="Sourcing · Mes sources"
      title="Ajouter un flux autorisé"
      description="Lien CSV, XML ou JSON fourni par votre grossiste (lien partenaire, flux acheteur, export d'un tableur partagé avec son accord). Rien n'est enregistré avant votre confirmation."
      actions={
        <ButtonLink href="/sourcing/sources" variant="secondary">
          Retour à mes sources
        </ButtonLink>
      }
    />
  );
  if (!canWrite(ctx.role)) {
    return (
      <>
        {header}
        <EmptyState title="Lecture seule" description="Votre rôle ne permet pas d'ajouter une source dans cette organisation." />
      </>
    );
  }
  const suppliers = await activeSupplierOptions(ctx);
  return (
    <>
      {header}
      <FeedWizard suppliers={suppliers} orgCurrency={ctx.organization.default_currency} />
    </>
  );
}
