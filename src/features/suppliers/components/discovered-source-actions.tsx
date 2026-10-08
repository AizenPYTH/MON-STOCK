"use client";
import { useActionState } from "react";
import { Checkbox, FormError, FormSuccess } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/result";
import { dismissDiscoveredSourceAction, validateDiscoveredSourceAction } from "@/features/suppliers/discovered-actions";

type Msg = ActionResult<{ message: string }> | null;

function Feedback({ state }: { state: Msg }) {
  if (!state) return null;
  return state.ok ? <FormSuccess message={state.data.message} /> : <FormError message={state.error} />;
}

/** « Valider et activer » (attestation obligatoire) et « Ignorer » pour une source découverte. */
export function DiscoveredSourceActions({ sourceId, canActivate, blockedReason, siteUrl }: { sourceId: string; canActivate: boolean; blockedReason: string | null; siteUrl: string | null }) {
  const [validateState, validate] = useActionState<Msg, FormData>(validateDiscoveredSourceAction, null);
  const [dismissState, dismiss] = useActionState<Msg, FormData>(dismissDiscoveredSourceAction, null);
  return (
    <div className="space-y-2">
      {canActivate ? (
        <form action={validate} className="space-y-2 rounded-lg border border-border bg-surface-muted/40 px-3 py-2">
          <input type="hidden" name="source_id" value={sourceId} />
          <label className="flex items-start gap-2 text-xs">
            <Checkbox name="attestation" required className="mt-0.5" />
            <span>
              J&apos;atteste avoir lu les conditions d&apos;utilisation{siteUrl ? (
                <>
                  {" "}de{" "}
                  <a href={siteUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                    {siteUrl.replace(/^https?:\/\//, "")}
                  </a>
                </>
              ) : null}{" "}
              et qu&apos;elles autorisent la lecture automatisée de ses pages publiques (robots.txt revérifié à chaque interrogation, aucune connexion ni contournement).
            </span>
          </label>
          <SubmitButton size="sm" pendingText="Activation…">
            Valider et activer
          </SubmitButton>
          <Feedback state={validateState} />
        </form>
      ) : (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-amber-800">{blockedReason}</p>
      )}
      <form action={dismiss} className="space-y-1">
        <input type="hidden" name="source_id" value={sourceId} />
        <SubmitButton size="sm" variant="ghost" pendingText="…">
          Ignorer
        </SubmitButton>
        <Feedback state={dismissState} />
      </form>
    </div>
  );
}
