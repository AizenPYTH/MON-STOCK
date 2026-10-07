import type { Metadata } from "next";
import { PageHeader, ComingSoon } from "@/components/ui/page";

export const metadata: Metadata = { title: "Facturation" };

export default function BillingPage() {
  return (
    <>
      <PageHeader title="Facturation" description="Abonnement et factures de votre organisation." />
      <ComingSoon feature="Facturation">La gestion de l'abonnement n'est pas encore disponible. Aucun paiement n'est simulé.</ComingSoon>
    </>
  );
}
