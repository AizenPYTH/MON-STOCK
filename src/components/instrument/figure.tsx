import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { splitFigure } from "@/components/instrument/pure";
import { Kbd as UiKbd } from "@/components/ui/kbd";

const SIZES = {
  xl: { num: "text-[68px] leading-[72px] tracking-[-2.8px]", unit: "text-[30px] leading-[32px] ml-2" },
  lg: { num: "text-[60px] leading-[64px] tracking-[-2.4px]", unit: "text-[26px] leading-[28px] ml-2" },
  md: { num: "text-[48px] leading-[50px] tracking-[-1.8px]", unit: "text-[22px] leading-[24px] ml-1.5" },
  sm: { num: "text-[44px] leading-[48px] tracking-[-1.6px]", unit: "text-[20px] leading-[22px] ml-1.5" },
  xs: { num: "text-[30px] leading-[34px] tracking-[-0.8px]", unit: "text-[15px] leading-[18px] ml-1" },
} as const;
export type FigureSize = keyof typeof SIZES;

/**
 * Grand chiffre fin (Manrope 300) ; l'unité est réduite, graisse 500, atténuée ; « ≈ » atténué.
 * Le lecteur d'écran lit la valeur complète.
 */
export function StageFigure({ value, size = "md", onNight = true, tone, className }: { value: string; size?: FigureSize; onNight?: boolean; tone?: "success" | "danger" | "mint"; className?: string }) {
  const s = SIZES[size];
  const { approx, number, unit } = splitFigure(value);
  const color = tone === "success" ? "text-success" : tone === "danger" ? (onNight ? "text-danger-on-night" : "text-danger") : tone === "mint" ? "text-mint" : onNight ? "text-on-night" : "text-foreground";
  return (
    <span className={cn("inline-flex min-w-0 items-baseline whitespace-nowrap font-light tnum", color, className)} aria-label={value} role="img">
      {approx ? <span className={cn(s.num, "mr-2 opacity-55")} aria-hidden="true">≈</span> : null}
      <span className={cn(s.num, "truncate")} aria-hidden="true">
        {number}
      </span>
      {unit ? (
        <span className={cn(s.unit, "font-medium", onNight ? "text-on-night-muted" : "text-ink-3", unit === "%" && "ml-0.5")} aria-hidden="true">
          {unit}
        </span>
      ) : null}
    </span>
  );
}

/** Titre de section v5 : mono capitales + compteur + annotation ou lien à droite. */
export function MonoTitle({ title, count, aside, right, onNight = false, as: Tag = "h2", className }: { title: string; count?: number | string; aside?: ReactNode; right?: ReactNode; onNight?: boolean; as?: "h2" | "h3" | "div"; className?: string }) {
  return (
    <div className={cn("flex min-h-[22px] items-center justify-between gap-3", className)}>
      <Tag className="flex min-w-0 items-center gap-2">
        <span className={cn("ms-mono truncate text-[11px] leading-[14px] tracking-[0.08em]", onNight ? "text-on-night-muted" : "text-muted")}>{title}</span>
        {count !== undefined ? <span className={cn("ms-code text-[11px] leading-[14px]", onNight ? "text-on-night" : "text-foreground")}>{count}</span> : null}
      </Tag>
      {right ?? (aside ? <span className={cn("ms-code shrink-0 text-[11px] leading-[15px]", onNight ? "text-on-night-subtle" : "text-ink-3")}>{aside}</span> : null)}
    </div>
  );
}

/** Étiquette mono 10/13 capitales (relevés, colonnes). */
export function MonoLabel({ children, onNight = false, className }: { children: ReactNode; onNight?: boolean; className?: string }) {
  return <span className={cn("ms-mono text-[10px] leading-[13px]", onNight ? "text-on-night-subtle" : "text-ink-3", className)}>{children}</span>;
}

/** Touche de raccourci (« ⌘ K », « N ») ; sur la scène nuit par défaut (voir aussi `Kbd` de components/ui/kbd). */
export function Kbd({ children, onNight = true, className }: { children: ReactNode; onNight?: boolean; className?: string }) {
  return (
    <UiKbd onNight={onNight} className={className}>
      {children}
    </UiKbd>
  );
}

/** Badge « DÉMO » (organisation de démonstration). */
export function DemoBadge({ onNight = true }: { onNight?: boolean }) {
  return (
    <span className={cn("ms-code shrink-0 rounded px-[5px] py-px text-[9.5px] font-semibold leading-[13px] tracking-[0.08em]", onNight ? "bg-amber/14 text-amber" : "bg-warning-soft text-warning-ink")}>DÉMO</span>
  );
}

/** Mention « ≈ » atténuée devant une estimation dans un texte courant. */
export function Approx({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-medium opacity-60">≈</span> {children}
    </span>
  );
}

/** Valeur inconnue : « — » (jamais 0), lue « inconnu ». */
export function Unknown({ label = "inconnu" }: { label?: string }) {
  return <span aria-label={label}>—</span>;
}
