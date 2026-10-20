import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { importBreakdown } from "@/features/catalog-imports/labels";
import type { ImportJobDTO } from "@/features/mobile-api/contract";

/** Barre de répartition des lignes d'un import (vrais comptes) avec légende lisible. */
export function BreakdownBar({ counts, compact = false, className }: { counts: ImportJobDTO["counts"]; compact?: boolean; className?: string }) {
  const parts = importBreakdown(counts);
  const total = parts.reduce((a, p) => a + p.value, 0);
  const summary = parts.map((p) => `${p.label} : ${formatNumber(p.value)}`).join(", ");
  return (
    <div className={cn("space-y-2", className)}>
      <div role="img" aria-label={`Répartition des lignes — ${summary}`} className={cn("flex w-full overflow-hidden rounded-full bg-surface-muted", compact ? "h-1.5" : "h-3")}>
        {total > 0 ? parts.filter((p) => p.value > 0).map((p) => <span key={p.key} className={p.className} style={{ width: `${p.percent}%` }} />) : null}
      </div>
      {compact ? null : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", p.className)} />
              <span className="text-muted">{p.label}</span>
              <span className="ml-auto font-medium tnum">{formatNumber(p.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
