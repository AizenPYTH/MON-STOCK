import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * En-tête de section sur le papier : titre (h2 par défaut), compteur, description, actions à droite.
 * Pour un titre mono en capitales (relevés, listes de la charte), voir `MonoTitle` (instrument).
 */
export function SectionHeader({
  title,
  description,
  actions,
  eyebrow,
  count,
  as: Tag = "h2",
  id,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  count?: number | string;
  as?: "h2" | "h3";
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="ms-mono mb-1 text-[10.5px] leading-[14px] text-ink-3">{eyebrow}</div> : null}
        <Tag id={id} className="flex items-baseline gap-2 text-base font-extrabold leading-6 tracking-[-0.01em] text-foreground">
          <span className="min-w-0">{title}</span>
          {count !== undefined ? <span className="ms-code text-xs font-medium text-ink-3 tnum">{count}</span> : null}
        </Tag>
        {description ? <p className="mt-0.5 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
