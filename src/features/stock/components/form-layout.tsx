import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { internalRoute } from "@/lib/routes";

/**
 * Section de formulaire : intitulé et explication à gauche (au-dessus sur mobile), champs dans une
 * carte à droite. Purement visuel : les champs et leurs noms restent ceux du formulaire.
 */
export function FormSection({ step, title, description, children, className, aside }: { step?: string; title: ReactNode; description?: ReactNode; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={cn("grid gap-x-8 gap-y-3 lg:grid-cols-[240px_minmax(0,1fr)]", className)}>
      <div className="min-w-0 lg:pt-4">
        {step ? <div className="ms-mono mb-1 text-[10.5px] leading-[14px] text-ink-3">{step}</div> : null}
        <h2 className="text-h3 text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        {aside ? <div className="mt-3">{aside}</div> : null}
      </div>
      <div className="min-w-0 rounded-2xl border border-border bg-surface p-5">{children}</div>
    </section>
  );
}

/** Barre d'actions collée en bas de l'écran pendant la saisie : Annuler (discret) puis l'action principale. */
export function FormActions({ cancelHref, cancelLabel = "Annuler", note, children }: { cancelHref?: string; cancelLabel?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 lg:bottom-4 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-8 sm:px-8 lg:ml-[272px] lg:mr-0 lg:rounded-2xl lg:border lg:bg-surface/95 lg:px-5 lg:shadow-floating">
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {note ? <p className="mr-auto min-w-0 flex-1 basis-60 text-xs font-medium text-muted max-sm:hidden">{note}</p> : null}
        {cancelHref ? (
          <Link href={internalRoute(cancelHref)} className={buttonClasses("ghost", "md")}>
            {cancelLabel}
          </Link>
        ) : null}
        {children}
      </div>
    </div>
  );
}
