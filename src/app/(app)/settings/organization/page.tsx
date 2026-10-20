import type { Metadata } from "next";
import { requireOrgContext, isAdmin } from "@/features/auth/dal";
import { Callout } from "@/components/ui/page";
import { OrganizationForm } from "@/features/organizations/organization-form";
import { ChannelFeesForm } from "@/features/organizations/channel-fees-form";
import { SettingsSectionHeader } from "@/features/organizations/components/settings-section-header";

export const metadata: Metadata = { title: "Organisation" };

export default async function OrganizationSettingsPage() {
  const ctx = await requireOrgContext();
  const { data: channels } = await ctx.supabase.from("sales_channels").select("*").eq("organization_id", ctx.organization.id).order("created_at");
  const admin = isAdmin(ctx.role);
  return (
    <>
      <SettingsSectionHeader title="Organisation" description="Identité, devise de référence et paramètres de coûts utilisés pour calculer vos marges. Un champ vide reste inconnu : il n'est jamais compté pour 0." />
      {!admin ? <Callout tone="neutral">Seuls les administrateurs peuvent modifier ces paramètres.</Callout> : null}
      <div className="grid max-w-[900px] gap-4 xl:grid-cols-2 xl:items-start">
        <OrganizationForm organization={ctx.organization} disabled={!admin} />
        <ChannelFeesForm channels={channels ?? []} disabled={!admin} />
      </div>
    </>
  );
}
