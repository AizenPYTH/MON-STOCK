import { Paper, Scene } from "@/components/instrument";
import { LoadingRegion, Skeleton } from "@/components/ui/page";

/** Squelettes de l'écran Stock (scène puis papier) : rien n'est affiché comme une vraie valeur. */
export default function StockLoading() {
  return (
    <>
      <Scene>
        <div aria-hidden="true" className="space-y-4">
          <div className="h-[34px] w-40 rounded-lg bg-night-raised ms-pulse" />
          <div className="flex flex-wrap items-end gap-x-14 gap-y-4">
            <div className="h-[50px] w-56 rounded-lg bg-night-raised ms-pulse" />
            <div className="h-[46px] min-w-0 flex-[1_1_440px] rounded-lg bg-night-raised ms-pulse sm:max-w-[640px]" />
          </div>
          <div className="h-10 rounded-sm bg-night-raised ms-pulse" />
        </div>
      </Scene>
      <Paper>
        <LoadingRegion label="Chargement de la liste…">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-10 w-full sm:w-80" />
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex h-[60px] items-center gap-3 border-b border-line-soft px-4">
                <Skeleton className="h-[18px] w-[18px] rounded-[5px]" />
                <Skeleton className="h-[38px] w-[38px] rounded-[10px]" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className={["h-3.5 w-1/2", "h-3.5 w-2/3", "h-3.5 w-2/5", "h-3.5 w-3/5"][i % 4]} />
                  <Skeleton className="h-2.5 w-28" />
                </div>
                <Skeleton className="hidden h-3 w-2/5 md:block" />
              </div>
            ))}
          </div>
        </LoadingRegion>
      </Paper>
    </>
  );
}
