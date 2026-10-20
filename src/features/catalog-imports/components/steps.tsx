import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Indicateur d'étapes d'un assistant (étape courante annoncée aux lecteurs d'écran). */
export function Steps({ steps, current, label = "Étapes" }: { steps: string[]; current: number; label?: string }) {
  return (
    <nav aria-label={label} className="mb-5">
      <ol className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s} aria-current={active ? "step" : undefined} className={cn("flex items-center gap-2", active ? "font-semibold text-foreground" : done ? "text-muted-strong" : "text-muted")}>
              <span aria-hidden="true" className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs tnum", done ? "border-success bg-success-soft text-green-700" : active ? "border-foreground bg-foreground text-white" : "border-border bg-surface")}>
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {s}
              {done ? <span className="sr-only"> (terminé)</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
