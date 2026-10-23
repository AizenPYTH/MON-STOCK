import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { EmptyState } from "@/components/ui/page";
import { SettingsSectionHeader } from "@/features/organizations/components/settings-section-header";

export const metadata: Metadata = { title: "Facturation" };

/** Facturation : pas encore ouverte — aucun plan, aucun prix, aucun paiement simulé. */
export default function BillingPage() {
  return (
    <>
      <SettingsSectionHeader title="Facturation" description="Abonnement et factures de votre organisation." />
      <EmptyState
        className="max-w-[680px] items-start text-left [&>p]:max-w-none"
        icon={<CreditCard />}
        title="Bientôt disponible"
        description="La facturation n'est pas encore ouverte. Aucune carte bancaire n'est demandée, aucun plan payant n'est proposé et aucun paiement n'est simulé."
      />
    </>
  );
}
