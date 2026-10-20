import type { Metadata } from "next";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Paper } from "@/components/instrument";
import { getTodayDashboard } from "@/features/dashboard/queries";
import { TodayScene } from "@/features/dashboard/components/today-scene";
import { ActivitySection, AdvisorEntry, PrioritySection, RadarSection, SetupSection, ShortcutsSection, TasksSection } from "@/features/dashboard/components/today-paper";

export const metadata: Metadata = { title: "Aujourd'hui" };

/**
 * Aujourd'hui (v5 « Instrument ») : l'argent du jour, l'état du stock et LA chose à faire.
 * Uniquement des données réelles de l'organisation (RLS) ; une valeur inconnue s'affiche « — ».
 */
export default async function DashboardPage() {
  const ctx = await requireOrgContext();
  const d = await getTodayDashboard(ctx);
  const writable = canWrite(ctx.role);

  return (
    <>
      <TodayScene d={d} />
      <Paper>
        <div className="flex max-w-[1280px] flex-wrap items-start gap-8">
          <div className="flex min-w-0 flex-[7_1_560px] flex-col gap-7">
            {d.isEmpty ? <SetupSection d={d} /> : null}
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
        {d.unavailable.length > 0 ? (
          <p className="mt-8 text-xs font-semibold text-ink-3" role="status">
            Indisponible pour le moment : {d.unavailable.join(", ")}. Les blocs concernés sont masqués ou incomplets ; rechargez la page dans quelques instants.
          </p>
        ) : null}
      </Paper>
    </>
  );
}
