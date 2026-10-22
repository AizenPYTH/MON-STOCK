import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * État vide : dit ce qui manque et propose LA prochaine action réelle (jamais un faux bouton).
 * `variant="dashed"` (défaut) sur le papier ; `plain` à l'intérieur d'une carte ou d'un tableau.
 */
export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  icon,
  className,
  variant = "dashed",
  size = "md",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  icon?: ReactNode;
  className?: string;
  variant?: "dashed" | "plain";
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === "dashed" && "rounded-2xl border border-dashed border-border-strong bg-surface",
        size === "sm" ? "px-5 py-8" : "px-6 py-14",
        className,
      )}
    >
      {icon ? <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-line-soft text-muted [&>svg]:h-5 [&>svg]:w-5">{icon}</div> : null}
      <h3 className="text-h3 text-foreground">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action || secondaryAction ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
