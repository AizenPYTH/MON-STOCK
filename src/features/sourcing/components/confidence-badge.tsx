import type { OfferConfidence } from "@/domain/sourcing/confidence";
import { cn } from "@/lib/utils";

const TONE: Record<OfferConfidence["level"], string> = {
  verified_recently: "border-green-200 bg-success-soft text-green-800",
  unconfirmed: "border-border bg-surface-muted text-muted-strong",
  stock_uncertain: "border-orange-200 bg-warning-soft text-orange-800",
  stale: "border-amber-200 bg-warning-soft text-amber-800",
  expired: "border-red-200 bg-danger-soft text-red-800",
};

/** Niveau de confiance de la donnée (🟢 ⚪ 🟡 🟠 🔴) + « Dernière vérification : il y a … », raisons au survol / dépliées. */
export function ConfidenceBadge({ confidence, className, showReasons = false }: { confidence: OfferConfidence; className?: string; showReasons?: boolean }) {
  return (
    <span className={cn("inline-flex flex-col gap-0.5", className)}>
      <span className="inline-flex flex-wrap items-center gap-2 text-xs">
        <span title={confidence.reasons.join(" · ")} className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium", TONE[confidence.level])}>
          <span aria-hidden>{confidence.emoji}</span> {confidence.label}
        </span>
        <span className="text-muted">{confidence.lastCheckedLabel}</span>
      </span>
      {showReasons && confidence.reasons.length > 0 ? <span className="text-[11px] text-muted">{confidence.reasons.join(" · ")}</span> : null}
    </span>
  );
}
