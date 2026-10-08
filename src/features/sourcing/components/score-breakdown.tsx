import { Badge } from "@/components/ui/badge";
import { SCORE_COMPONENT_LABEL, type OfferScore } from "@/domain/sourcing/scoring";

export function ScoreBreakdown({ score, compact = false }: { score: OfferScore; compact?: boolean }) {
  const tone = score.total >= 70 ? "success" : score.total >= 45 ? "info" : "neutral";
  return (
    <details className="group text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <Badge variant={tone}>Score {score.total}/100</Badge>
        <span className="text-xs text-muted underline-offset-2 group-open:underline">{score.coverageLabel}</span>
      </summary>
      <ul className={compact ? "mt-2 space-y-0.5 text-xs" : "mt-2 space-y-1 text-xs"}>
        {(Object.keys(score.breakdown) as Array<keyof typeof score.breakdown>).map((k) => {
          const c = score.breakdown[k];
          return (
            <li key={k} className="flex items-center justify-between gap-3">
              <span className={c.known ? "text-foreground" : "text-muted"}>
                {SCORE_COMPONENT_LABEL[k]} <span className="text-muted">— {c.note}</span>
              </span>
              <span className="tnum font-medium">
                {c.points}/{c.max}
              </span>
            </li>
          );
        })}
        {score.unknownFactors.length > 0 ? <li className="pt-1 text-amber-700">Données inconnues (0 point) : {score.unknownFactors.join(", ")}.</li> : null}
      </ul>
    </details>
  );
}
