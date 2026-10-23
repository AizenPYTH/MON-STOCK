import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepperStep = { label: string; state: "done" | "current" | "todo" };

/**
 * Étapes du parcours après l'inscription (handoff v2 §D, §E `ConnectionStepper`) :
 * « ✓ ORGANISATION — 2 · PLATEFORME ». Mono capitales ; l'étape franchie porte une coche ET le mot
 * « terminée » pour les lecteurs d'écran ; l'étape en cours a `aria-current="step"`.
 */
export function ConnectionStepper({ steps, className }: { steps: StepperStep[]; className?: string }) {
  return (
    <ol aria-label="Étapes de la configuration" className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      {steps.map((s, i) => (
        <li key={s.label} aria-current={s.state === "current" ? "step" : undefined} className="flex items-center gap-3">
          {i > 0 ? <span aria-hidden="true" className={cn("block h-px w-8 sm:w-12", s.state === "todo" ? "bg-paper-marketing-rule-strong" : "bg-foreground/40")} /> : null}
          <span
            className={cn(
              "ms-mono inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-[10.5px] leading-[14px] tracking-[0.08em]",
              s.state === "done" && "border-success-line bg-success-soft text-success-ink",
              s.state === "current" && "border-inverse bg-inverse text-on-inverse",
              s.state === "todo" && "border-paper-marketing-rule-strong text-ink-3",
            )}
          >
            {s.state === "done" ? <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.6} /> : <span aria-hidden="true">{i + 1} ·</span>}
            {s.label}
            {s.state === "done" ? <span className="sr-only"> (terminée)</span> : s.state === "current" ? <span className="sr-only"> (en cours)</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
