import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "success" | "warning" | "danger" | "neutral";

const VALUE_TONE: Record<StatTone, string> = { success: "text-success", warning: "text-warning", danger: "text-danger", neutral: "text-foreground" };

/** Valeur inconnue (null, undefined, NaN, chaîne vide) → « — », jamais 0. */
export function isUnknownValue(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (typeof value === "number" && !Number.isFinite(value));
}

function display(value: ReactNode | number): ReactNode {
  if (isUnknownValue(value)) return <span aria-label="inconnu">—</span>;
  if (typeof value === "number") return new Intl.NumberFormat("fr-FR").format(value);
  return value;
}

export type StatDelta = {
  /** Texte déjà formaté (« +12 % », « −3 »). */
  value: string;
  direction: "up" | "down" | "flat";
  /** Sens du signal (une hausse n'est pas toujours bonne : ruptures, coûts…). */
  tone?: "success" | "danger" | "neutral";
  /** Période de comparaison (« vs 30 j préc. »). */
  label?: string;
};

/**
 * Tuile chiffrée (indicateur) : étiquette mono, valeur tabulaire, unité atténuée, évolution
 * (icône + texte), indice. `approx` préfixe « ≈ » (estimation). Inconnu → « — ».
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  tone = "neutral",
  delta,
  approx = false,
  href,
  size = "md",
  className,
}: {
  label: ReactNode;
  value: ReactNode | number | null | undefined;
  unit?: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  delta?: StatDelta;
  approx?: boolean;
  href?: string;
  size?: "md" | "lg";
  className?: string;
}) {
  const unknown = isUnknownValue(value);
  const DeltaIcon = delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : Minus;
  const deltaTone = delta?.tone === "success" ? "text-success" : delta?.tone === "danger" ? "text-danger" : "text-muted";
  const body = (
    <>
      <div className="ms-mono text-[10.5px] leading-[14px] text-ink-3">{label}</div>
      <div className={cn("mt-2 flex min-w-0 items-baseline gap-1 tnum", size === "lg" ? "text-[32px] leading-[38px] tracking-[-0.8px]" : "text-[26px] leading-8 tracking-[-0.5px]", "font-semibold", unknown ? "text-ink-3" : VALUE_TONE[tone])}>
        {approx && !unknown ? <span className="font-medium opacity-55">≈</span> : null}
        <span className="truncate">{display(value)}</span>
        {unit && !unknown ? <span className={cn("font-medium text-ink-3", size === "lg" ? "text-lg" : "text-base")}>{unit}</span> : null}
      </div>
      {delta || hint ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {delta ? (
            <span className={cn("inline-flex items-center gap-0.5 font-bold tnum", deltaTone)}>
              <DeltaIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {delta.value}
              {delta.label ? <span className="font-medium text-muted"> {delta.label}</span> : null}
            </span>
          ) : null}
          {hint ? <span className="text-muted">{hint}</span> : null}
        </div>
      ) : null}
    </>
  );
  const cls = cn("block min-w-0 rounded-2xl border border-border bg-surface px-5 py-4", className);
  return href ? (
    <Link href={href as never} className={cn(cls, "transition-colors duration-150 ease-standard hover:border-border-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Ancienne API (conservée) : tuile simple. Préférer `StatTile`. */
export function Stat({ label, value, hint, tone, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: StatTone; className?: string }) {
  return <StatTile label={label} value={value} hint={hint} tone={tone ?? "neutral"} className={className} />;
}
