import type { ReactNode } from "react";

// Application entièrement authentifiée : rendu dynamique à chaque requête.
export const dynamic = "force-dynamic";
import { requireOrgContext } from "@/features/auth/dal";
import { AppShell } from "@/components/layout/app-shell";
import { getShellData } from "@/features/shell/queries";
import { publicEnvIssues } from "@/lib/env";
import { ConfigMissing } from "@/components/layout/config-missing";

const ROLE_LABEL: Record<string, string> = { owner: "Propriétaire", admin: "Administrateur", member: "Membre", viewer: "Lecture seule" };

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Site déployé sans sa configuration publique : diagnostic explicite, rendu côté serveur (W-31),
  // au lieu d'une erreur masquée par Next en production.
  const missing = publicEnvIssues();
  if (missing.length > 0) {
    return (
      <main id="contenu" className="flex min-h-full flex-1 justify-center bg-background px-4 py-16">
        <div className="w-full max-w-[480px]">
          <ConfigMissing names={missing} />
        </div>
      </main>
    );
  }
  const ctx = await requireOrgContext();
  const shell = await getShellData(ctx);
  return (
    <AppShell
      org={{
        id: ctx.organization.id,
        name: ctx.organization.name,
        isDemo: ctx.organization.is_demo,
        currency: ctx.organization.default_currency,
        roleLabel: ROLE_LABEL[ctx.role] ?? ctx.role,
        options: ctx.memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, isDemo: m.organization.is_demo })),
        fallback: ctx.fallback === true,
      }}
      user={{ name: ctx.profile.full_name ?? ctx.user.email ?? "Mon compte", email: ctx.user.email ?? null }}
      readOnly={ctx.role === "viewer"}
      counts={{
        pendingMatches: shell.counts.pendingMatches,
        // Inconnu si l'un des deux comptages a échoué : jamais une somme partielle (W-14).
        openAlerts: shell.counts.openAlerts === null || shell.counts.outOfStock === null ? null : shell.counts.openAlerts + shell.counts.outOfStock,
        unmappedListings: shell.counts.unmappedListings,
      }}
      lastEbaySync={shell.lastEbaySync}
      alerts={shell.alerts}
      alertTotal={shell.counts.openAlerts}
    >
      {children}
    </AppShell>
  );
}
