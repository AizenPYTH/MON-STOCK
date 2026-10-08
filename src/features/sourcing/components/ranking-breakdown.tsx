import { Badge } from "@/components/ui/badge";
import { RANKING_COMPONENT_LABEL, type RankingComponentKey } from "@/domain/sourcing/ranking";
import type { OfferRankingView } from "@/services/sourcing/search";

/** Score multicritère /100 (rankOpportunities), détaillé par composante ; une donnée inconnue vaut 0 et est listée. */
export function RankingBreakdown({ ranking }: { ranking: OfferRankingView }) {
  const tone = ranking.score >= 70 ? "success" : ranking.score >= 45 ? "info" : "neutral";
  return (
    <details className="group text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <Badge variant={tone}>Score {ranking.score}/100</Badge>
        <span className="text-xs text-muted underline-offset-2 group-open:underline">{ranking.unknownFactors.length === 0 ? "Comparaison complète" : `Comparaison partielle (${ranking.unknownFactors.length} donnée(s) inconnue(s))`}</span>
      </summary>
      <ul className="mt-2 space-y-0.5 text-xs">
        {(Object.keys(ranking.components) as RankingComponentKey[]).map((k) => {
          const c = ranking.components[k];
          return (
            <li key={k} className="flex items-center justify-between gap-3">
              <span className={c.known ? "text-foreground" : "text-muted"}>
                {RANKING_COMPONENT_LABEL[k]} <span className="text-muted">— {c.note}</span>
              </span>
              <span className="tnum font-medium">
                {c.points}/{c.max}
              </span>
            </li>
          );
        })}
        {ranking.unknownFactors.length > 0 ? <li className="pt-1 text-amber-700">Données inconnues (0 point) : {ranking.unknownFactors.join(", ")}.</li> : null}
        {ranking.procurement.notes.length > 0 ? <li className="pt-1 text-muted">Plan d&apos;achat : {ranking.procurement.notes.join(" · ")}.</li> : null}
      </ul>
    </details>
  );
}
