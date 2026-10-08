"use client";
import { useActionState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormError } from "@/components/ui/form";
import type { ActionResult } from "@/lib/result";
import { syncNowAction, type SyncActionData } from "@/features/integrations/actions";
import { formatDuration } from "@/features/integrations/format";

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
        <RefreshCw className="h-4 w-4" /> {label}
      </SubmitButton>
      {disabled && disabledReason ? <p className="text-xs text-muted">{disabledReason}</p> : null}
      {state && !state.ok ? <FormError message={state.error} action={state.action} /> : null}
      {state?.ok ? (
        <div role="status" className={`rounded-lg border px-3 py-2 text-sm ${state.data.status === "success" ? "border-green-200 bg-success-soft text-green-800" : "border-amber-200 bg-warning-soft text-amber-900"}`}>
          <div className="font-medium">{state.data.summary}</div>
          <div className="mt-0.5 text-xs opacity-80">
            Durée {formatDuration(state.data.durationMs)}
            {state.data.errorSummary ? ` · ${state.data.errorSummary}` : ""} ·{" "}
            <Link href={`/settings/sync/${state.data.runId}` as never} className="underline">
              Voir le détail du run
            </Link>
          </div>
        </div>
      ) : null}
    </form>
  );
}
