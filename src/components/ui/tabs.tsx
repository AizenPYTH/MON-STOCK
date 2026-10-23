import Link from "next/link";
import { cn } from "@/lib/utils";
import { internalRoute } from "@/lib/routes";

/**
 * Onglets de navigation (liens, pilotés par l'URL) : soulignement de l'onglet courant,
 * compteur tabulaire optionnel, défilement horizontal sur mobile, cible ≥ 40 px.
 */
export function LinkTabs({ items, current, label = "Sections", className }: { items: Array<{ href: string; label: string; count?: number }>; current: string; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("mb-5 border-b border-border", className)}>
      <div className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {items.map((it) => {
          const active = it.href === current;
          return (
            <Link
              key={it.href}
              href={internalRoute(it.href)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-[10px] border-b-2 px-3 text-sm transition-colors duration-150 ease-standard focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                active ? "border-foreground font-bold text-foreground" : "border-transparent font-semibold text-muted hover:border-border-strong hover:text-foreground",
              )}
            >
              {it.label}
              {typeof it.count === "number" ? (
                <span className={cn("rounded-md px-1.5 py-px text-xs font-semibold tnum", active ? "bg-inverse text-on-inverse" : "bg-line-soft text-muted-strong")}>{it.count}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
