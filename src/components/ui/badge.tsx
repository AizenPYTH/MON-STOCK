import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info" | "accent" | "outline";

const styles: Record<BadgeVariant, string> = {
  neutral: "bg-surface-muted text-muted-strong",
  success: "bg-success-soft text-green-700",
  warning: "bg-warning-soft text-amber-700",
  danger: "bg-danger-soft text-red-700",
  info: "bg-info-soft text-blue-700",
  accent: "bg-accent-soft text-indigo-700",
  outline: "border border-border text-muted-strong",
};

export function Badge({ variant = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", styles[variant], className)} {...props} />;
}

export function StatusDot({ tone, className }: { tone: "success" | "warning" | "danger" | "neutral" | "info"; className?: string }) {
  const color = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    neutral: "bg-zinc-400",
    info: "bg-info",
  }[tone];
  return <span aria-hidden className={cn("inline-block h-2 w-2 rounded-full", color, className)} />;
}
