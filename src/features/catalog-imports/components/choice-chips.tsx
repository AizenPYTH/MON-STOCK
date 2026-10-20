"use client";
import { cn } from "@/lib/utils";

/**
 * Choix exclusif en puces v5 (sélection nuit) : groupe radio accessible, flèches gauche/droite
 * pour passer d'une option à l'autre. Cibles de 40 px.
 */
export function ChoiceChips<T extends string>({ label, options, value, onChange, disabled, className }: { label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void; disabled?: boolean; className?: string }) {
  const move = (dir: 1 | -1) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    if (next) onChange(next.value);
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(-1);
              }
            }}
            className={cn(
              "inline-flex min-h-10 items-center whitespace-nowrap rounded-full border px-3.5 text-[13.5px] font-bold transition-colors disabled:opacity-50",
              selected ? "border-night bg-night text-on-night" : "border-border bg-surface text-foreground hover:bg-line-soft",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
