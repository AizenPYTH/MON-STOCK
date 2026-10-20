import { cn } from "@/lib/utils";
import { rulerMarks } from "@/features/sourcing-search/display";

/**
 * Position face au marché : coût rendu (point plein), médiane des offres équivalentes (trait) et,
 * en grand format, prix de revente (losange), sur une même échelle. Sans comparaison possible, la
 * légende l'indique — aucune position n'est dessinée.
 */
export function MarketRuler({ cost, market, resale = null, caption, emptyCaption, large = false, className }: { cost: number | null; market: number | null; resale?: number | null; caption: string | null; emptyCaption: string; large?: boolean; className?: string }) {
  const marks = rulerMarks(cost, market, large ? resale : null);
  if (!marks) {
    return <p className={cn("text-xs text-muted", className)}>{emptyCaption}</p>;
  }
  const h = large ? 28 : 16;
  const mid = h / 2;
  const below = cost !== null && market !== null && cost <= market;
  return (
    <figure className={cn("min-w-0", className)}>
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className={cn("w-full", large ? "h-7" : "h-4")} role="img" aria-label={caption ?? emptyCaption}>
        <rect x="0" y={mid - 1.5} width="100" height="3" rx="1.5" className="fill-surface-muted" />
        {marks.cost !== null && marks.market !== null ? (
          <rect x={Math.min(marks.cost, marks.market)} y={mid - 1.5} width={Math.abs(marks.market - marks.cost)} height="3" className={below ? "fill-success" : "fill-danger"} opacity="0.55" />
        ) : null}
        {marks.market !== null ? <rect x={marks.market - 0.4} y={1} width="0.8" height={h - 2} className="fill-muted-strong" /> : null}
        {marks.resale !== null ? <rect x={marks.resale - 1.2} y={mid - 3.5} width="2.4" height="7" className="fill-info" /> : null}
        {marks.cost !== null ? <rect x={marks.cost - 1.2} y={mid - 3.5} width="2.4" height="7" rx="1.2" className={below ? "fill-success" : "fill-danger"} /> : null}
      </svg>
      {caption ? <figcaption className="mt-0.5 truncate text-[11px] text-muted tnum">{caption}</figcaption> : null}
      {large ? (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className={cn("inline-block h-2 w-2 rounded-full", below ? "bg-success" : "bg-danger")} /> Coût rendu
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block h-2.5 w-0.5 bg-muted-strong" /> Médiane du marché
          </span>
          {marks.resale !== null ? (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="inline-block h-2 w-2 bg-info" /> Revente
            </span>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}
