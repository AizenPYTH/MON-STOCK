import { RotateCw } from "lucide-react";
import type { Json } from "@/db/database.types";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatNumber } from "@/lib/format";
import { readStats } from "@/features/integrations/format";
import { connectionStatusView, runIssueCount, runStatusView, runStoppedByBudget } from "@/features/integrations/components/sync-status";

type RunLike = { status: string; stats: Json | null; error_summary?: string | null; error_count?: number | null };

/** Statut d'un passage : icône + texte ; une reprise programmée (budget de temps) se lit comme telle. */
export function RunStatusBadge({ run, variant = "soft", size = "sm" }: { run: RunLike; variant?: "soft" | "plain"; size?: "sm" | "md" }) {
  const view = runStatusView(run);
  return (
    <StatusBadge tone={view.tone} variant={variant} size={size} title={view.hint} icon={runStoppedByBudget(run) ? <RotateCw /> : undefined}>
      {view.label}
    </StatusBadge>
  );
}

/** Statut d'une connexion de canal (Connecté, Autorisation expirée…). */
export function ConnectionStatusBadge({ status, size = "md" }: { status: string | null | undefined; size?: "sm" | "md" }) {
  const view = connectionStatusView(status);
  return (
    <StatusBadge tone={view.tone} size={size}>
      {view.label}
    </StatusBadge>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${n > 1 ? many : one}`;
}

/**
 * Résumé lisible d'un passage : statut + compteurs RÉELS (annonces, commandes, stocks, erreurs).
 * Les erreurs affichées excluent l'arrêt programmé « budget atteint » (qui n'en est pas une).
 */
export function RunSummary({ run, className }: { run: RunLike; className?: string }) {
  const s = readStats(run.stats);
  const issues = runIssueCount(run);
  return (
    <span className={className ?? "inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold text-muted"}>
      <RunStatusBadge run={run} />
      <span className="tnum">{plural(s.listings_fetched, "annonce analysée", "annonces analysées")}</span>
      <span aria-hidden="true" className="text-ink-4">·</span>
      <span className="tnum">{plural(s.orders_fetched, "commande", "commandes")}</span>
      <span aria-hidden="true" className="text-ink-4">·</span>
      <span className="tnum">{plural(s.inventory_changes, "stock modifié", "stocks modifiés")}</span>
      <span aria-hidden="true" className="text-ink-4">·</span>
      <span className={issues > 0 ? "tnum text-danger" : "tnum"}>{plural(issues, "erreur", "erreurs")}</span>
    </span>
  );
}
