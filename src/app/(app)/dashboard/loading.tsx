import { LoadingRegion, Skeleton } from "@/components/ui/page";
import { Paper, Scene } from "@/components/instrument";

/** Squelette de « Aujourd'hui » : scène (chiffre, relevés, 14 jours, stock) puis papier 7/5. */
export default function DashboardLoading() {
  return (
    <LoadingRegion label="Chargement de l'écran Aujourd'hui…" className="flex flex-1 flex-col space-y-0">
      <Scene>
        <div className="flex flex-wrap items-end gap-x-16 gap-y-6">
          <div className="min-w-0 flex-[1_1_520px]">
            <div className="h-3.5 w-64 rounded bg-night-raised" />
            <div className="mt-3 h-[66px] w-56 rounded-xl bg-night-raised" />
            <div className="mt-[18px] h-[58px] max-w-[620px] rounded-xl bg-night-raised/60" />
          </div>
          <div className="h-[110px] max-w-[480px] flex-[1_1_300px] rounded-xl bg-night-raised/60" />
        </div>
        <div className="mt-7 h-[110px] rounded-xl bg-night-raised/60" />
      </Scene>
      <Paper>
        <div className="flex max-w-[1280px] flex-wrap items-start gap-8">
          <div className="flex min-w-0 flex-[7_1_560px] flex-col gap-7">
            <Skeleton className="h-[236px] rounded-2xl" />
            <Skeleton className="h-[300px] rounded-2xl" />
          </div>
          <div className="flex min-w-0 flex-[5_1_340px] flex-col gap-7">
            <Skeleton className="h-[200px] rounded-2xl" />
            <Skeleton className="h-[220px] rounded-2xl" />
          </div>
        </div>
      </Paper>
    </LoadingRegion>
  );
}
