import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Carte blanche à filet fin, rayon 16, sans ombre (charte « Instrument »).
 * `interactive` : carte cliquable (survol + focus) — l'élément cliquable reste un lien/bouton à l'intérieur.
 */
export function Card({ className, interactive = false, ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface",
        interactive && "transition-colors duration-150 ease-standard hover:border-border-strong hover:bg-surface-2 focus-within:border-border-strong",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, title, description, actions, eyebrow }: { className?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line-soft px-5 py-4", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="ms-mono mb-1 text-[10.5px] leading-[14px] text-ink-3">{eyebrow}</div> : null}
        <h3 className="text-h3 text-foreground">{title}</h3>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

/** Pied de carte : actions alignées à droite, filet au-dessus. */
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-5 py-3", className)} {...props} />;
}
