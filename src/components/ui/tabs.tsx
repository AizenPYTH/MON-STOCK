import Link from "next/link";
import { cn } from "@/lib/utils";

export function LinkTabs({ items, current, label = "Sections" }: { items: Array<{ href: string; label: string; count?: number }>; current: string; label?: string }) {
  return (
    <nav aria-label={label} className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
      {items.map((it) => {
        const active = it.href === current;
        return (
          <Link
            key={it.href}
            href={it.href as never}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              active ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {it.label}
            {typeof it.count === "number" ? <span className="ml-1.5 rounded-md bg-surface-muted px-1.5 py-0.5 text-xs tnum">{it.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
