import { CircleCheck, CircleDashed, CircleX, Clock, PackageSearch } from "lucide-react";
import type { OfferConfidence } from "@/domain/sourcing/confidence";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

/** Niveau de confiance → ton du système de design + pictogramme (jamais la couleur seule). */
const TONE: Record<OfferConfidence["level"], { tone: StatusTone; icon: typeof CircleCheck }> = {
  verified_recently: { tone: "success", icon: CircleCheck },
  unconfirmed: { tone: "neutral", icon: CircleDashed },
  stock_uncertain: { tone: "warning", icon: PackageSearch },
  stale: { tone: "warning", icon: Clock },
  expired: { tone: "danger", icon: CircleX },
};

/** Niveau de confiance de la donnée + « Dernière vérification : il y a … », raisons au survol / dépliées. */
export function ConfidenceBadge({ confidence, className, showReasons = false }: { confidence: OfferConfidence; className?: string; showReasons?: boolean }) {
  const t = TONE[confidence.level] ?? TONE.unconfirmed;
  const Icon = t.icon;
  return (
    <span className={cn("inline-flex min-w-0 flex-col gap-1", className)}>
      <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <StatusBadge tone={t.tone} icon={<Icon strokeWidth={2.25} />} title={confidence.reasons.join(" · ") || undefined}>
          {confidence.label}
        </StatusBadge>
        <span className="font-medium text-muted tnum">{confidence.lastCheckedLabel}</span>
      </span>
      {showReasons && confidence.reasons.length > 0 ? <span className="text-xs font-medium leading-[17px] text-muted">{confidence.reasons.join(" · ")}</span> : null}
    </span>
  );
}
