import type { ReactNode } from "react";

// Application entièrement authentifiée : rendu dynamique à chaque requête.
export const dynamic = "force-dynamic";
import { requireOrgContext } from "@/features/auth/dal";
import { AppShell } from "@/components/layout/app-shell";
import { Topbar } from "@/components/layout/topbar";
import { DemoBanner } from "@/components/layout/demo-banner";
import { getSidebarCounts } from "@/features/dashboard/queries";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgContext();
  const counts = await getSidebarCounts(ctx);
  return (
    <AppShell topbar={<Topbar ctx={ctx} />} counts={counts}>
      {ctx.organization.is_demo ? <DemoBanner /> : null}
      {children}
    </AppShell>
  );
}
