import { Paper, Scene } from "@/components/instrument";
import { LoadingRegion, Skeleton } from "@/components/ui/page";

export default function SourcingCatalogLoading() {
  return (
    <>
      <Scene>
        <div className="ms-mono text-[11px] leading-[14px] tracking-[0.08em] text-on-night-muted">Sourcing</div>
        <h1 className="mt-1 text-[28px] font-extrabold leading-[34px] tracking-[-0.6px] text-on-night">Offres collectées</h1>
      </Scene>
      <Paper>
        <LoadingRegion label="Chargement des offres collectées…">
          <Skeleton className="h-28 rounded-2xl" />
          <div className="grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        </LoadingRegion>
      </Paper>
    </>
  );
}
