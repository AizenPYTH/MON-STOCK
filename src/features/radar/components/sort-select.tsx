"use client";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { RadarSort } from "@/features/mobile-api/contract";
import { SORT_OPTIONS, radarHref, type RadarFilter } from "@/features/radar/labels";

/** Tri des offres évaluées (Pertinence, Bénéfice, Marge, Disponibilité, Fraîcheur) : change l'URL. */
export function RadarSortSelect({ sort, filter, offer }: { sort: RadarSort; filter: RadarFilter; offer: string | null }) {
  const router = useRouter();
  return (
    <label className="relative flex items-center gap-1.5 text-[12.5px] font-semibold text-muted">
      Tri
      <select
        value={sort}
        onChange={(e) => router.push(radarHref({ sort: e.target.value as RadarSort, filter, offer }) as never, { scroll: false })}
        className="h-10 cursor-pointer appearance-none rounded-full border border-border-control bg-surface pl-3 pr-8 text-[12.5px] font-bold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 h-3.5 w-3.5" />
    </label>
  );
}
