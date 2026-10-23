import { StatTile } from "@/components/ui/stat-tile";
import { FilterChip, MonoLabel } from "@/components/instrument";
import { formatMoney } from "@/lib/format";
import { RANKING_LABELS, RANKING_MODES, type RankingMode } from "@/domain/sourcing/scoring";
import type { SearchAggregates } from "@/services/sourcing/search";

/** Synthèse chiffrée du résultat (valeurs inconnues → « — ») et classement piloté par l'URL. */
export function ResultsHeader({ aggregates, sort, makeHref }: { aggregates: SearchAggregates; sort: RankingMode; makeHref: (overrides: Record<string, string | null>) => string }) {
  const c = aggregates.currency;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatTile label="Offres trouvées" value={aggregates.count} />
        <StatTile label="Meilleur prix" value={aggregates.bestPrice === null ? null : formatMoney(aggregates.bestPrice, c)} hint={aggregates.bestPrice === null ? "Aucun prix comparable" : "unitaire, base HT si connue"} tone={aggregates.bestPrice === null ? "neutral" : "success"} />
        <StatTile label="Meilleure offre" value={aggregates.bestOfferScore === null ? null : aggregates.bestOfferScore} unit="/100" hint="score transparent" />
        <StatTile
          label="Meilleure marge estimée"
          value={aggregates.bestMargin === null ? null : formatMoney(aggregates.bestMargin, c)}
          approx={aggregates.bestMargin !== null}
          hint={aggregates.bestMargin === null ? "Aucun prix de vente connu" : "par unité, frais connus déduits"}
          tone={aggregates.bestMargin !== null && aggregates.bestMargin < 0 ? "danger" : "neutral"}
        />
        <StatTile label="Prix moyen" value={aggregates.averagePrice === null ? null : formatMoney(aggregates.averagePrice, c)} />
        <StatTile label="Prix le plus élevé" value={aggregates.maxPrice === null ? null : formatMoney(aggregates.maxPrice, c)} />
      </div>
      <nav className="flex flex-wrap items-center gap-1.5" aria-label="Classement">
        <MonoLabel className="mr-1">Classer par</MonoLabel>
        {RANKING_MODES.map((m) => (
          <FilterChip key={m} href={makeHref({ sort: m, page: null })} selected={m === sort}>
            {RANKING_LABELS[m]}
          </FilterChip>
        ))}
      </nav>
    </div>
  );
}
