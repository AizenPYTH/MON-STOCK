import type { ReactNode } from "react";
import { CircleCheck, CircleDashed, CircleX, Clock, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "pending";

const ICON: Record<StatusTone, LucideIcon> = {
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
  info: Info,
  neutral: CircleDashed,
  pending: Clock,
};

const SOFT: Record<StatusTone, string> = {
  success: "bg-success-soft text-success-ink ring-success-line",
  warning: "bg-warning-soft text-warning-ink ring-warning-line",
  danger: "bg-danger-soft text-danger-ink ring-danger-line",
  info: "bg-info-soft text-info-ink ring-info-line",
  neutral: "bg-line-soft text-muted-strong ring-border",
  pending: "bg-surface text-muted-strong ring-border-strong",
};

const PLAIN: Record<StatusTone, string> = {
  success: "text-success-ink",
  warning: "text-warning-ink",
  danger: "text-danger-ink",
  info: "text-info-ink",
  neutral: "text-muted",
  pending: "text-muted",
};

/**
 * Statut lisible sans la couleur : icône + texte, toujours. `variant="plain"` pour une cellule de
 * tableau dense (sans fond). `pending` = en attente / en cours (jamais un succès anticipé).
 */
export function StatusBadge({
  tone,
  children,
  icon,
  variant = "soft",
  size = "sm",
  className,
  title,
}: {
  tone: StatusTone;
  children: ReactNode;
  /** Icône de remplacement ; `false` pour la masquer (déconseillé : le texte seul reste alors porteur). */
  icon?: ReactNode | false;
  variant?: "soft" | "plain";
  size?: "sm" | "md";
  className?: string;
  title?: string;
}) {
  const Icon = ICON[tone];
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold",
        variant === "soft" ? cn("rounded-md ring-1 ring-inset", size === "md" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-[11.5px]", SOFT[tone]) : cn(size === "md" ? "text-sm" : "text-[13px]", PLAIN[tone]),
        className,
      )}
    >
      {icon === false ? null : icon ? <span aria-hidden="true" className="inline-flex [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span> : <Icon aria-hidden="true" className={size === "md" || variant === "plain" ? "h-3.5 w-3.5" : "h-3 w-3"} strokeWidth={2.25} />}
      <span className="truncate">{children}</span>
    </span>
  );
}
