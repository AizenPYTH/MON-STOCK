"use client";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, RotateCw } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormError } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ActionResult } from "@/lib/result";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { syncNowAction, type SyncActionData } from "@/features/integrations/actions";
import { formatDuration } from "@/features/integrations/format";
import { extraErrorsAfterResume, isBudgetResume } from "@/features/integrations/components/sync-status";

export function SyncNowForm({
  connectionId,
  scope = "full",
  trigger = "manual",
  label = "Synchroniser maintenant",
  pendingText = "Synchronisation en cours…",
  variant = "primary",
  size = "md",
  disabled,
  disabledReason,
}: {
  connectionId: string;
  scope?: "full" | "listings" | "orders";
  trigger?: "manual" | "initial";
  label?: string;
  pendingText?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, action] = useActionState<ActionResult<SyncActionData> | null, FormData>(syncNowAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="connection_id" value={connectionId} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="trigger" value={trigger} />
      <SubmitButton pendingText={pendingText} variant={variant} size={size} disabled={disabled} title={disabled ? disabledReason : undefined}>
        <RefreshCw aria-hidden="true" className="h-4 w-4" /> {label}
      </SubmitButton>
      {disabled && disabledReason ? <p className="text-xs font-semibold text-ink-3">{disabledReason}</p> : null}
      {state && !state.ok ? <FormError message={state.error} action={state.action} /> : null}
      {state?.ok ? <SyncResult data={state.data} /> : null}
    </form>
  );
}

/**
 * Résultat RÉEL du passage (affiché seulement après la réponse du serveur) : succès, reprise
 * programmée (budget de temps atteint : normal, pas une erreur) ou partiel avec erreurs.
 */
function SyncResult({ data }: { data: SyncActionData }) {
  const resume = data.status === "partial" && isBudgetResume(data.errorSummary);
  const extra = extraErrorsAfterResume(data.errorSummary);
  const tone = data.status === "success" ? "success" : resume ? "info" : "warning";
  const box = { success: "border-success-line bg-success-soft", info: "border-info-line bg-info-soft", warning: "border-warning-line bg-warning-soft" }[tone];
  const s = data.stats;
  return (
    <div role="status" className={cn("ms-fade max-w-xl space-y-1.5 rounded-xl border px-3.5 py-3 text-sm", box)}>
      <div className="flex flex-wrap items-center gap-2">
        {resume ? (
          <StatusBadge tone="info" icon={<RotateCw />}>
            Reprise au prochain passage
          </StatusBadge>
        ) : (
          <StatusBadge tone={tone === "success" ? "success" : "warning"}>{data.status === "success" ? "Synchronisation réussie" : "Synchronisation partielle"}</StatusBadge>
        )}
        <span className="text-xs font-semibold text-muted tnum">Durée {formatDuration(data.durationMs)}</span>
      </div>
      <p className="font-semibold text-foreground tnum">
        {formatNumber(s.listings_fetched)} annonce(s) analysée(s) · {formatNumber(s.orders_fetched)} commande(s) récupérée(s) · {formatNumber(s.inventory_changes)} stock(s) modifié(s)
      </p>
      {resume ? (
        <p className="text-[13px] font-medium text-info-ink">
          Le passage s&apos;est arrêté proprement après la dernière étape confirmée, faute de temps : aucune donnée n&apos;est perdue et la suite est reprise automatiquement au prochain passage.
          {extra > 0 ? ` ${extra} autre(s) erreur(s) signalée(s) : voir le détail.` : ""}
        </p>
      ) : data.errorSummary ? (
        <p className="text-[13px] font-medium text-warning-ink">{data.errorSummary}</p>
      ) : null}
      <Link href={`/settings/sync/${data.runId}`} className="inline-flex min-h-8 items-center gap-1 text-[13px] font-bold text-interactive underline-offset-4 hover:underline">
        Voir le détail du passage
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
