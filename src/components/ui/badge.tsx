import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info" | "accent" | "outline";

const styles: Record<BadgeVariant, string> = {
  neutral: "bg-line-soft text-muted-strong",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  accent: "bg-night text-on-night",
  outline: "border border-border text-muted-strong",
};

export function Badge({ variant = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold", styles[variant], className)} {...props} />;
}

export function StatusDot({ tone, className }: { tone: "success" | "warning" | "danger" | "neutral" | "info"; className?: string }) {
  const color = {
    success: "bg-success",
    warning: "bg-amber",
    danger: "bg-red",
    neutral: "bg-ink-4",
    info: "bg-info",
  }[tone];
  return <span aria-hidden className={cn("inline-block h-2 w-2 rounded-full", color, className)} />;
}
