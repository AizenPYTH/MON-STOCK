import type { ImportProgressDTO } from "@/features/mobile-api/contract";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Avancement d'un import découpé en lots (S-04) : lignes traitées sur le total et lots terminés,
 * tels que renvoyés par le serveur. Total inconnu → « — » et barre indéterminée (aucune progression
 * simulée). `resumable` : plus aucun traitement actif, la tâche planifiée reprendra les lots restants.
 */
export function ImportProgress({ progress, resumable = false, compact = false, className }: { progress: ImportProgressDTO | null | undefined; resumable?: boolean; compact?: boolean; className?: string }) {
  const total = progress && progress.rowsTotal > 0 ? progress.rowsTotal : null;
  const done = progress ? progress.rowsProcessed : null;
  const percent = total !== null && done !== null ? Math.min(100, Math.max(0, Math.floor((done / total) * 100))) : null;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div
        role="progressbar"
        aria-label="Avancement de l'import"
        aria-valuemin={0}
        aria-valuemax={total ?? undefined}
        aria-valuenow={total !== null && done !== null ? Math.min(done, total) : undefined}
        aria-valuetext={total !== null && done !== null ? `${formatNumber(done)} lignes traitées sur ${formatNumber(total)}` : "Avancement inconnu"}
        className={cn("relative w-full overflow-hidden rounded-full bg-track", compact ? "h-2" : "h-2.5")}
      >
        {percent !== null ? (
          <span className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-[420ms] ease-standard", resumable ? "bg-amber" : "bg-info-strong")} style={{ width: `${percent}%` }} />
        ) : (
          <span className="ms-pulse absolute inset-0 rounded-full bg-line-soft" />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-semibold leading-[17px] text-muted tnum">
        {resumable ? (
          <StatusBadge tone="warning">En attente de reprise</StatusBadge>
        ) : (
          <StatusBadge tone="pending">Traitement par lots</StatusBadge>
        )}
        <span>
          {done !== null ? formatNumber(done) : "—"} / {total !== null ? formatNumber(total) : "—"} lignes
          {progress && progress.chunksTotal > 0 ? ` · lot ${formatNumber(progress.chunksDone)} / ${formatNumber(progress.chunksTotal)}` : ""}
          {percent !== null ? ` · ${percent} %` : ""}
        </span>
      </div>
      {!compact ? (
        <p className="text-xs font-medium leading-[17px] text-muted">
          {resumable
            ? "Le traitement s'est interrompu : les lots restants seront repris automatiquement par la tâche planifiée."
            : "Le fichier est traité par lots ; la suite est reprise automatiquement. Rechargez la page pour voir l'avancement."}
        </p>
      ) : null}
    </div>
  );
}
