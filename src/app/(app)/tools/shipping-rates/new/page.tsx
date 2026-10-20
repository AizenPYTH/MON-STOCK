import type { Metadata } from "next";
import { canWrite, requireOrgContext } from "@/features/auth/dal";
import { Callout } from "@/components/ui/page";
import { ToolScreen } from "@/features/tools/components/tool-page";
import { RateCardEditor } from "@/features/tools/components/rate-card-form";

export const metadata: Metadata = { title: "Nouvelle grille tarifaire" };

export default async function NewRateCardPage() {
  const ctx = await requireOrgContext();
  const writer = canWrite(ctx.role);
  return (
    <ToolScreen back={{ href: "/tools/shipping-rates", label: "Mes grilles tarifaires" }} title="Nouvelle grille" description="Saisissez vos tarifs réels (contrat ou grille publique du transporteur).">
      {writer ? <RateCardEditor card={null} readOnly={false} /> : <Callout tone="neutral">Votre rôle (lecture seule) ne permet pas d'ajouter une grille.</Callout>}
    </ToolScreen>
  );
}
