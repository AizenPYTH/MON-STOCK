import type { ReactNode } from "react";
import { requireOrgContext } from "@/features/auth/dal";
import { Paper, Scene, SceneHeader } from "@/components/instrument";
import { SettingsNav } from "@/features/organizations/components/settings-nav";

/** Réglages (handoff v5) : scène « Réglages » puis papier avec la sous-navigation à gauche. */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgContext();
  return (
    <>
      <Scene>
        <SceneHeader eyebrow={`${ctx.organization.name} · organisation`} title="Réglages" />
      </Scene>
      <Paper className="lg:pt-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-7">
          <SettingsNav />
          <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
        </div>
      </Paper>
    </>
  );
}
