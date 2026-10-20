import { Paper, Scene } from "@/components/instrument";
import { LoadingRegion } from "@/components/ui/page";

export default function SourcingLoading() {
  return (
    <>
      <Scene>
        <div className="ms-mono text-[11px] leading-[14px] tracking-[0.08em] text-on-night-muted">Offres · fournisseurs · rentabilité</div>
        <h1 className="mt-1 text-[28px] font-extrabold leading-[34px] tracking-[-0.6px] text-on-night">Recherche fournisseurs</h1>
        <div className="ms-pulse mt-3.5 h-14 max-w-[760px] rounded-[14px] bg-night-raised" />
      </Scene>
      <Paper>
        <LoadingRegion label="Chargement du sourcing…">
          <div className="ms-pulse h-[38px] max-w-[420px] rounded-xl bg-track" />
          <div className="ms-pulse h-44 rounded-2xl bg-track" />
        </LoadingRegion>
      </Paper>
    </>
  );
}
