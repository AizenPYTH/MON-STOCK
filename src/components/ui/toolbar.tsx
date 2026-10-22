import type { InputHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/form";

/**
 * Barre d'outils au-dessus d'une liste : filtres / recherche à gauche (`children`), actions à
 * droite (`actions`). Se replie proprement sur mobile.
 */
export function Toolbar({ children, actions, className, label }: { children?: ReactNode; actions?: ReactNode; className?: string; label?: string }) {
  return (
    <div role={label ? "group" : undefined} aria-label={label} className={cn("flex flex-wrap items-center justify-between gap-2", className)}>
      {children ? <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div> : null}
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Groupe de contrôles serrés dans une barre d'outils. */
export function ToolbarGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

/**
 * Bandeau de filtres (puces, listes, recherche) : `summary` résume le résultat (« 124 références »),
 * `resetHref` affiche « Réinitialiser » quand des filtres sont actifs (`active`).
 */
export function FilterBar({
  children,
  summary,
  resetHref,
  active = false,
  resetLabel = "Réinitialiser",
  className,
  label = "Filtres",
}: {
  children: ReactNode;
  summary?: ReactNode;
  resetHref?: string;
  active?: boolean;
  resetLabel?: string;
  className?: string;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-1">{children}</div>
      {summary || (active && resetHref) ? (
        <div className="flex w-full items-center justify-between gap-3 text-sm text-muted sm:w-auto sm:justify-end">
          {summary ? <span className="tnum">{summary}</span> : null}
          {active && resetHref ? (
            <Link href={resetHref as never} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 font-semibold text-interactive hover:text-interactive-hover hover:underline underline-offset-4 pointer-coarse:min-h-10">
              <X aria-hidden="true" className="h-3.5 w-3.5" />
              {resetLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Champ de recherche avec loupe (nom accessible : `aria-label` ou, à défaut, le placeholder). */
export function SearchInput({ className, wrapperClassName, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative min-w-0", wrapperClassName)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
      <Input type="search" className={cn("pl-9", className)} {...props} />
    </div>
  );
}
