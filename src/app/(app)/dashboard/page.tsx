import type { Metadata } from "next";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Paper } from "@/components/instrument";
import { Callout } from "@/components/ui/callout";
import { getTodayDashboard } from "@/features/dashboard/queries";
import { TodayScene } from "@/features/dashboard/components/today-scene";
import { ActivitySection, AdvisorEntry, PrioritySection, RadarSection, SetupSection, ShortcutsSection, StockHealthSection, TasksSection } from "@/features/dashboard/components/today-paper";
import { Checklist } from "@/features/onboarding/components/checklist";
import { firstStepsChecklist } from "@/features/onboarding/checklist";

export const metadata: Metadata = { title: "Aujourd'hui" };

/**
 * Aujourd'hui (v5 « Instrument ») : l'argent du jour, l'état du stock et LA chose à faire.
 * Uniquement des données réelles de l'organisation (RLS) ; une valeur inconnue s'affiche « — ».
 * Espace encore vide (parcours v2) : scène sans chiffre, code-barres à l'état vide et checklist des
 * premiers pas (organisation ✓, eBay, import, premier produit) à la place de « Bien démarrer ».
 */
export default async function DashboardPage() {
  const ctx = await requireOrgContext();
  const d = await getTodayDashboard(ctx);
  const writable = canWrite(ctx.role);

  return (
    <>
      <TodayScene d={d} />
      <Paper>
        {d.unavailable.length > 0 ? (
          <Callout tone="warning" role="status" className="mb-6 max-w-[1280px]" title="Données partiellement indisponibles">
            Indisponible pour le moment : {d.unavailable.join(", ")}. Les blocs concernés sont masqués ou incomplets ; rechargez la page dans quelques instants.
          </Callout>
        ) : null}
        {d.stock.skus > 0 ? (
          <div className="mb-7 max-w-[1280px]">
            <StockHealthSection d={d} />
          </div>
        ) : null}
        <div className="flex max-w-[1280px] flex-wrap items-start gap-8">
          <div className="flex min-w-0 flex-[7_1_560px] flex-col gap-7">
            {d.isEmpty ? <Checklist items={firstStepsChecklist({ organizationName: ctx.organization.name, ...d.firstSteps })} /> : null}
            <PrioritySection d={d} writable={writable} />
            <TasksSection tasks={d.tasks} />
            <ActivitySection d={d} />
          </div>
          <div className="flex min-w-0 flex-[5_1_340px] flex-col gap-7">
            <ShortcutsSection writable={writable} />
            <RadarSection d={d} />
            <AdvisorEntry />
            {d.isEmpty ? null : <SetupSection d={d} />}
          </div>
        </div>
      </Paper>
    </>
  );
}
