import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info" | "accent" | "outline";
export type BadgeSize = "sm" | "md";

/** Pastille de texte : fond doux + filet intérieur du même ton (lisible en clair comme en sombre). */
const styles: Record<BadgeVariant, string> = {
  neutral: "bg-line-soft text-muted-strong ring-border",
  success: "bg-success-soft text-success-ink ring-success-line",
  warning: "bg-warning-soft text-warning-ink ring-warning-line",
  danger: "bg-danger-soft text-danger-ink ring-danger-line",
  info: "bg-info-soft text-info-ink ring-info-line",
  accent: "bg-inverse text-on-inverse ring-transparent",
  outline: "bg-transparent text-muted-strong ring-border-strong",
};

const sizes: Record<BadgeSize, string> = {
  sm: "h-5 px-1.5 text-[11.5px] leading-4",
  md: "h-6 px-2 text-xs leading-4",
};

/**
 * Étiquette courte (catégorie, compteur, état simple). Pour un STATUT (stock, synchronisation,
 * commande…), préférer `StatusBadge` : icône + texte, jamais la couleur seule.
 */
export function Badge({ variant = "neutral", size = "sm", className, ...props }: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant; size?: BadgeSize }) {
  return <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md font-semibold ring-1 ring-inset tnum [&>svg]:h-3 [&>svg]:w-3", sizes[size], styles[variant], className)} {...props} />;
}

const DOT: Record<"success" | "warning" | "danger" | "neutral" | "info", string> = {
  success: "bg-success-strong",
  warning: "bg-amber",
  danger: "bg-red",
  neutral: "bg-ink-4",
  info: "bg-info-strong",
};

/** Point de couleur décoratif : toujours accompagné d'un libellé texte à côté. */
export function StatusDot({ tone, className }: { tone: "success" | "warning" | "danger" | "neutral" | "info"; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", DOT[tone], className)} />;
}
