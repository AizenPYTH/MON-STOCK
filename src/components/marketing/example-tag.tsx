import { cn } from "@/lib/utils";

/**
 * Étiquette « EXEMPLE » (handoff v2 §E `ExampleTag`) : toute valeur chiffrée du site public est une
 * illustration, jamais une donnée réelle. Ambre #E5A34D sur nuit, #8A5A12 sur fond clair.
 */
export function ExampleTag({ surface = "paper", label = "EXEMPLE", className }: { surface?: "night" | "paper"; label?: string; className?: string }) {
  return (
    <span
      data-example-tag=""
      className={cn(
        "inline-flex shrink-0 items-center rounded-[5px] px-[6px] py-[3px] font-mono text-[9.5px] font-semibold uppercase leading-none tracking-[0.08em]",
        surface === "night" ? "bg-amber/14 text-amber" : "bg-[#FBF1E2] text-[#8A5A12]",
        className,
      )}
    >
      {label}
    </span>
  );
}
