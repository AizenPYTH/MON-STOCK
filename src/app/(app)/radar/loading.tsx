import { Paper, Scene } from "@/components/instrument";
import { LoadingRegion } from "@/components/ui/page";

export default function RadarLoading() {
  return (
    <>
      <Scene>
        <div className="ms-mono text-[11px] leading-[14px] tracking-[0.08em] text-on-night-muted">Sourcing · ventes réelles × offres fournisseurs</div>
        <h1 className="mt-1 text-[28px] font-extrabold leading-[34px] tracking-[-0.6px] text-on-night">Radar d&apos;opportunités</h1>
        <div className="mt-4 flex flex-wrap items-end gap-x-14 gap-y-5">
          <div className="ms-pulse h-[50px] w-48 rounded-xl bg-night-raised" />
          <div className="ms-pulse h-[10px] max-w-[640px] flex-[1_1_440px] rounded-full bg-night-raised" />
        </div>
      </Scene>
      <Paper>
        <LoadingRegion label="Calcul du radar d'opportunités…">
          <div className="flex flex-col gap-7 xl:flex-row">
            <div className="flex flex-col gap-2.5 xl:w-[520px]">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="ms-pulse h-[104px] rounded-2xl bg-track" />
              ))}
            </div>
            <div className="ms-pulse hidden h-[560px] flex-1 rounded-2xl bg-line-soft xl:block" />
          </div>
        </LoadingRegion>
      </Paper>
    </>
  );
}
