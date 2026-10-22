import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Échec de chargement ou d'action : dit ce qui n'a pas marché, ce qui est conservé, et propose
 * une issue (réessayer, revenir). Ne jamais masquer une erreur par des valeurs à 0.
 * `details` : référence technique discrète (ex. digest d'erreur) que l'utilisateur peut transmettre au support.
 */
export function ErrorState({
  title = "Impossible d'afficher ces données",
  description = "Une erreur est survenue. Vos données ne sont pas modifiées ; réessayez dans un instant.",
  action,
  details,
  className,
  variant = "card",
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  details?: ReactNode;
  className?: string;
  variant?: "card" | "plain";
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", variant === "card" && "rounded-2xl border border-danger-line bg-surface", className)}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-danger-soft text-danger-ink">
        <TriangleAlert aria-hidden="true" className="h-5 w-5" />
      </div>
      <h3 className="text-h3 text-foreground">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
      {details ? <p className="ms-code mt-4 text-[11px] text-ink-3">{details}</p> : null}
    </div>
  );
}
