import Link from "next/link";
import type { ImportJobDTO } from "@/features/mobile-api/contract";
import { SplitBar } from "@/components/instrument";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fileSizeLabel, historyLine, IMPORT_MODE_LABEL, IMPORT_STATUS_SHORT, IMPORT_STATUS_TONE, importSegments } from "@/features/catalog-imports/labels";
import { StatusPill } from "@/features/catalog-imports/components/status-pill";
import { ImportProgress } from "@/features/catalog-imports/components/import-progress";
import { SupplierBadge } from "@/features/directory/components/supplier-badge";

/**
 * Historique des imports (v5) : fournisseur, fichier · date, statut, répartition 8 px et ligne de
 * résultat. Chaque ligne ouvre le rapport de l'import. Vrais comptes uniquement.
 */
export function ImportHistory({ jobs, currentId, className, wide = false }: { jobs: ImportJobDTO[]; currentId?: string; className?: string; wide?: boolean }) {
  return (
    <ul className={cn("overflow-hidden rounded-2xl border border-border bg-surface", className)}>
      {jobs.map((j, i) => {
        const line = historyLine(j);
        const empty = j.status === "failed" || j.status === "quarantined" || j.status === "skipped_duplicate";
        const running = j.status === "running" && Boolean(j.progress);
        return (
          <li key={j.id} className={cn(i > 0 && "border-t border-line-soft")}>
            <Link
              href={`/sourcing/imports/${j.id}`}
              aria-current={j.id === currentId ? "page" : undefined}
              className={cn("flex flex-col gap-2 px-3.5 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring", wide && "lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_150px] lg:items-center lg:gap-6 lg:px-5 lg:py-3.5", j.id === currentId && "bg-selection")}
            >
              <span className="flex w-full min-w-0 items-center gap-2.5">
                <SupplierBadge name={j.supplierName ?? "Fournisseur"} size={wide ? "md" : "sm"} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-bold leading-[19px]">{j.supplierName ?? "Fournisseur inconnu"}</span>
                  <span className="ms-code truncate text-[10.5px] leading-[14px] text-ink-3" title={j.fileName ?? undefined}>
                    {j.origin === "remote_feed" ? "Flux distant" : (j.fileName ?? "Fichier")} · {wide ? `${j.format.toUpperCase()} · ${fileSizeLabel(j.fileSize)} · ` : ""}
                    {formatRelative(j.startedAt)}
                  </span>
                </span>
                <StatusPill tone={IMPORT_STATUS_TONE[j.status]} className={wide ? "lg:hidden" : undefined}>
                  {IMPORT_STATUS_SHORT[j.status]}
                </StatusPill>
              </span>
              <span className="flex min-w-0 flex-col gap-2">
                {running ? (
                  <ImportProgress progress={j.progress} resumable={j.resumable} compact />
                ) : (
                  <>
                    {empty ? <span aria-hidden="true" className="block h-2 w-full rounded-full bg-track" /> : <SplitBar segments={importSegments(j.counts)} height={8} legend={false} />}
                    <span className={cn("text-[12.5px] font-semibold leading-[17px]", line.tone === "danger" ? "text-danger" : line.tone === "warning" ? "text-warning" : "text-muted")}>{line.text}</span>
                  </>
                )}
              </span>
              {wide ? (
                <span className="hidden flex-col items-end gap-1 lg:flex">
                  <StatusPill tone={IMPORT_STATUS_TONE[j.status]}>{IMPORT_STATUS_SHORT[j.status]}</StatusPill>
                  <span className="ms-code text-[10.5px] text-ink-3">{IMPORT_MODE_LABEL[j.mode]}</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
