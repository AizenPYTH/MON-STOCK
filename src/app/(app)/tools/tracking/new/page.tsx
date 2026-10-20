import type { Metadata } from "next";
import { canWrite, requireOrgContext } from "@/features/auth/dal";
import { Callout } from "@/components/ui/page";
import { fetchToolsStatus } from "@/features/tools/queries";
import { ToolScreen } from "@/features/tools/components/tool-page";
import { TrackingNewForm } from "@/features/tools/components/tracking-new-form";

export const metadata: Metadata = { title: "Suivre un colis" };

export default async function NewParcelPage() {
  const ctx = await requireOrgContext();
  const writer = canWrite(ctx.role);
  const status = writer ? await fetchToolsStatus(ctx) : null;
  const noApi = status !== null && "status" in status && !status.status.tracking.laposte && !status.status.tracking.ship24 && !status.status.tracking.dhl;
  return (
    <ToolScreen back={{ href: "/tools/tracking", label: "Colis" }} title="Suivre un colis" description="Saisissez ou collez le numéro de suivi : le transporteur est détecté quand c'est possible.">
      {writer ? (
        <div className="space-y-4">
          {noApi ? <Callout tone="warning">Suivi automatique pas encore activé sur le serveur : le colis sera ajouté avec le statut « Non vérifié » et pourra être suivi sur le site du transporteur.</Callout> : null}
          <TrackingNewForm />
        </div>
      ) : (
        <Callout tone="neutral">Votre rôle (lecture seule) ne permet pas d'ajouter un colis.</Callout>
      )}
    </ToolScreen>
  );
}
