import type { Metadata } from "next";
import { requireOrgContext, isAdmin } from "@/features/auth/dal";
import { PageHeader, Callout } from "@/components/ui/page";
import { OrganizationForm } from "@/features/organizations/organization-form";
import { ChannelFeesForm } from "@/features/organizations/channel-fees-form";

export const metadata: Metadata = { title: "Organisation" };

export default async function OrganizationSettingsPage() {
  const ctx = await requireOrgContext();
  const { data: channels } = await ctx.supabase.from("sales_channels").select("*").eq("organization_id", ctx.organization.id).order("created_at");
  const admin = isAdmin(ctx.role);
  return (
    <>
      <PageHeader title="Organisation" description="Identité, devise par défaut et paramètres de coûts utilisés pour calculer vos marges." />
      {!admin ? <Callout tone="neutral" className="mb-5">Seuls les administrateurs peuvent modifier ces paramètres.</Callout> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <OrganizationForm organization={ctx.organization} disabled={!admin} />
        <ChannelFeesForm channels={channels ?? []} disabled={!admin} />
      </div>
    </>
  );
}
