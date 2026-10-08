"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { evaluateAlertsNowAction } from "@/features/sourcing/actions";

export function EvaluateAlertsButton() {
  const [state, action] = useActionState<ActionResult<{ message: string }> | null, FormData>(evaluateAlertsNowAction, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <SubmitButton variant="secondary" pendingText="Évaluation…">
        Évaluer maintenant
      </SubmitButton>
      {state ? <span className={`text-xs ${state.ok ? "text-muted" : "text-danger"}`}>{state.ok ? state.data.message : state.error}</span> : null}
    </form>
  );
}
