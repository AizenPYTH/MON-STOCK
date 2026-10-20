import type { Metadata } from "next";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { EmptyState } from "@/components/ui/page";
import { Paper, Scene, SceneHeader } from "@/components/instrument";
import { activeSupplierOptions } from "@/features/catalog-imports/queries";
import { FeedWizard } from "@/features/sources/components/feed-wizard";

export const metadata: Metadata = { title: "Ajouter un flux autorisé" };

export default async function NewFeedPage() {
  const ctx = await requireOrgContext();
  const writer = canWrite(ctx.role);
  const suppliers = writer ? await activeSupplierOptions(ctx) : [];
  return (
    <>
      <Scene>
        <SceneHeader
          back={{ href: "/sourcing/sources", label: "Mes sources" }}
          eyebrow="Sourcing · sources & flux"
          title="Ajouter un flux autorisé"
          description="Lien CSV, XML ou JSON fourni par votre grossiste (lien partenaire, flux acheteur, export d'un tableur partagé avec son accord). Rien n'est enregistré avant votre confirmation."
        />
      </Scene>
      <Paper>
        <div className="max-w-[1100px]">
          {writer ? <FeedWizard suppliers={suppliers} orgCurrency={ctx.organization.default_currency} /> : <EmptyState title="Lecture seule" description="Votre rôle ne permet pas d'ajouter une source dans cette organisation." />}
        </div>
      </Paper>
    </>
  );
}
