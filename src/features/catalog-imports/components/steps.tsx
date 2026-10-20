import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Frise d'étapes v5 d'un assistant : faite = pastille menthe + coche, en cours = contour menthe
 * 2 px, à venir = contour clair. `onNight` pour la scène, sinon sur papier. Étape courante annoncée.
 */
export function Steps({ steps, current, label = "Étapes", onNight = false, onSelect, className }: { steps: string[]; current: number; label?: string; onNight?: boolean; onSelect?: (index: number) => void; className?: string }) {
  const done = onNight ? "var(--mint)" : "var(--success)";
  const todo = onNight ? "var(--night-stroke)" : "var(--border-strong)";
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex max-w-[760px] items-start">
        {steps.map((s, i) => {
          const isDone = i < current;
          const active = i === current;
          const circle = (
            <span className="flex items-center self-stretch" aria-hidden="true">
              <span className="h-0.5 flex-1" style={{ background: i === 0 ? "transparent" : i <= current ? done : todo }} />
              <span
                className={cn(
                  "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full transition-colors",
                  isDone ? (onNight ? "bg-mint text-night" : "bg-success text-white") : active ? (onNight ? "border-2 border-mint" : "border-2 border-success") : onNight ? "border-[1.5px] border-night-stroke" : "border-[1.5px] border-border-strong",
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={2.6} /> : <span className={cn("ms-code text-[11px]", active ? (onNight ? "text-on-night" : "text-foreground") : onNight ? "text-on-night-subtle" : "text-ink-3")}>{i + 1}</span>}
              </span>
              <span className="h-0.5 flex-1" style={{ background: i === steps.length - 1 ? "transparent" : i < current ? done : todo }} />
            </span>
          );
          const text = <span className={cn("ms-mono px-1 text-center text-[10px] leading-[13px] tracking-[0.04em]", active ? (onNight ? "text-on-night" : "text-foreground") : isDone ? (onNight ? "text-on-night-muted" : "text-muted") : onNight ? "text-on-night-subtle" : "text-ink-3")}>{s}</span>;
          return (
            <li key={s} aria-current={active ? "step" : undefined} className="min-w-0 flex-1">
              {isDone && onSelect ? (
                <button type="button" onClick={() => onSelect(i)} className="flex min-h-11 w-full flex-col items-center gap-1.5 rounded-lg hover:opacity-80">
                  {circle}
                  {text}
                  <span className="sr-only"> (terminé, revenir à cette étape)</span>
                </button>
              ) : (
                <span className="flex min-h-11 w-full flex-col items-center gap-1.5">
                  {circle}
                  {text}
                  {isDone ? <span className="sr-only"> (terminé)</span> : null}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
