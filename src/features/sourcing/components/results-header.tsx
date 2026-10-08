import Link from "next/link";
import { Stat } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { RANKING_LABELS, RANKING_MODES, type RankingMode } from "@/domain/sourcing/scoring";
import type { SearchAggregates } from "@/services/sourcing/search";

export function ResultsHeader({ aggregates, sort, makeHref }: { aggregates: SearchAggregates; sort: RankingMode; makeHref: (overrides: Record<string, string | null>) => string }) {
  const c = aggregates.currency;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Offres trouvées" value={aggregates.count} />
        <Stat label="Meilleur prix" value={aggregates.bestPrice === null ? "—" : formatMoney(aggregates.bestPrice, c)} hint={aggregates.bestPrice === null ? "Aucun prix comparable" : "unitaire, base HT si connue"} />
        <Stat label="Meilleure offre" value={aggregates.bestOfferScore === null ? "—" : `${aggregates.bestOfferScore}/100`} hint="score transparent" />
        <Stat label="Meilleure marge estimée" value={aggregates.bestMargin === null ? "—" : formatMoney(aggregates.bestMargin, c)} hint={aggregates.bestMargin === null ? "Aucun prix de vente connu" : "par unité, frais connus déduits"} tone={aggregates.bestMargin !== null && aggregates.bestMargin < 0 ? "danger" : undefined} />
        <Stat label="Prix moyen" value={aggregates.averagePrice === null ? "—" : formatMoney(aggregates.averagePrice, c)} />
        <Stat label="Prix le plus élevé" value={aggregates.maxPrice === null ? "—" : formatMoney(aggregates.maxPrice, c)} />
      </div>
      <nav className="flex flex-wrap items-center gap-1" aria-label="Classement">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted">Classer par</span>
        {RANKING_MODES.map((m) => (
          <Link key={m} href={makeHref({ sort: m, page: null }) as never} className={cn("rounded-lg border px-2.5 py-1 text-xs font-medium", m === sort ? "border-foreground bg-foreground text-white" : "border-border text-muted-strong hover:bg-surface-muted")}>
            {RANKING_LABELS[m]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
