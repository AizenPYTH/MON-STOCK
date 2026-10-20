import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Commandes v5 pilotées par l'URL (liens, aucun état caché) : puces de filtre, contrôle
 * segmenté, points de niveau. Utilisables dans des composants serveur.
 */

/** Puce de filtre : sélection en bleu nuit, compteur, point coloré optionnel. */
export function FilterChip({ href, selected, children, count, dot }: { href: string; selected: boolean; children: ReactNode; count?: number | string; dot?: string }) {
  return (
    <Link
      href={href as never}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors",
        selected ? "border-night bg-night text-on-night" : "border-border bg-surface text-foreground hover:bg-line-soft",
      )}
    >
      {dot ? <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full" style={{ background: dot }} /> : null}
      <span>{children}</span>
      {count !== undefined ? <span className={cn("tnum", selected ? "text-on-night-muted" : "text-ink-3")}>· {count}</span> : null}
    </Link>
  );
}

/** Contrôle segmenté (pouce blanc sur rail) ; chaque segment est un lien. */
export function Segmented({ options, label, className }: { options: { href: string; label: ReactNode; selected: boolean }[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("inline-flex rounded-xl bg-track p-[3px]", className)}>
      {options.map((o, i) => (
        <Link
          key={i}
          href={o.href as never}
          aria-current={o.selected ? "true" : undefined}
          className={cn("inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] px-4 text-[13.5px] font-semibold transition-colors", o.selected ? "bg-surface text-foreground shadow-[0_2px_6px_rgba(16,28,44,.08)]" : "text-muted hover:text-foreground")}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

const LEVEL_DOT = { ok: "var(--success)", low: "var(--amber)", out: "var(--red)", neutral: "var(--ink-4)", info: "var(--info)" } as const;
export type DotTone = keyof typeof LEVEL_DOT;

/** Point de statut + libellé (niveau de stock, état d'une source…). */
export function LevelDot({ tone, children, className }: { tone: DotTone; children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-semibold", className)}>
      <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: LEVEL_DOT[tone] }} />
      {children}
    </span>
  );
}

/** Pictogramme teinté 32 px (lignes d'action, alertes). */
export function ToneIcon({ tone, children }: { tone: "danger" | "warning" | "success" | "info" | "neutral"; children: ReactNode }) {
  const cls = { danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", success: "bg-success-soft text-success", info: "bg-info-soft text-info", neutral: "bg-line-soft text-muted" }[tone];
  return <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] [&>svg]:h-4 [&>svg]:w-4", cls)}>{children}</span>;
}
