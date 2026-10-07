import type { Metadata } from "next";
import { requireOrgContext } from "@/features/auth/dal";
import { PageHeader } from "@/components/ui/page";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requireOrgContext();
  return <PageHeader title="Bonjour, voici ce qui se passe aujourd'hui." description={`Organisation : ${ctx.organization.name}`} />;
}
