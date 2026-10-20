import type { Metadata } from "next";
import { SettingsSectionHeader } from "@/features/organizations/components/settings-section-header";

export const metadata: Metadata = { title: "Facturation" };

/** Facturation : pas encore ouverte — aucun plan, aucun prix, aucun paiement simulé. */
export default function BillingPage() {
  return (
    <>
      <SettingsSectionHeader title="Facturation" description="Abonnement et factures de votre organisation." />
      <div className="flex max-w-[620px] flex-col gap-1.5 rounded-2xl border-[1.5px] border-dashed border-border-strong bg-surface p-5">
        <h3 className="text-[17px] font-bold text-foreground">Bientôt disponible</h3>
        <p className="text-sm font-medium leading-5 text-muted">La facturation n&apos;est pas encore ouverte. Aucune carte bancaire n&apos;est demandée et aucun paiement n&apos;est simulé.</p>
      </div>
    </>
  );
}
