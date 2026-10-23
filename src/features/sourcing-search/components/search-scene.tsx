import type { ReactNode } from "react";
import Link from "next/link";
import { Scene } from "@/components/instrument";
import { SEARCH_EXAMPLES } from "@/features/sourcing-search/display";
import { SearchField } from "@/features/sourcing-search/components/search-field";

/**
 * Scène de la recherche fournisseurs : titre, champ blanc, puis (selon l'état) exemples, attente
 * ou résumé mono ; à droite, la carte « Meilleure opportunité » quand elle existe.
 */
export function SourcingScene({ query, below, aside }: { query: string; below?: ReactNode; aside?: ReactNode }) {
  return (
    <Scene>
      <div className="flex flex-wrap items-end gap-x-12 gap-y-6">
        <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
          <div>
            <div className="ms-mono text-[11px] leading-[14px] tracking-[0.08em] text-on-night-muted">Offres · fournisseurs · rentabilité</div>
            <h1 className="mt-1 text-[28px] font-extrabold leading-[34px] tracking-[-0.6px] text-on-night">Recherche fournisseurs</h1>
          </div>
          <SearchField key={query} query={query} />
          {below}
        </div>
        {aside}
      </div>
    </Scene>
  );
}

/** Exemples de recherche (état sans recherche). */
export function SearchExamples() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="ms-mono text-[10px] leading-[13px] text-on-night-subtle">Essayez</span>
      {SEARCH_EXAMPLES.map((e) => (
        <Link key={e} href={`/sourcing?q=${encodeURIComponent(e)}`} aria-label={`Chercher ${e}`} className="inline-flex min-h-[34px] items-center rounded-full bg-night-raised px-3 text-[13px] font-bold text-on-night hover:bg-night-hover">
          {e}
        </Link>
      ))}
    </div>
  );
}

/** Résumé mono sous le champ : « 16 offres · 14 fournisseurs · 14 comparées · « iPhone 13 » ». */
export function SearchSummary({ children }: { children: ReactNode }) {
  return <p className="ms-mono text-[11px] leading-[14px] tracking-[0.08em] text-on-night-muted tnum">{children}</p>;
}
