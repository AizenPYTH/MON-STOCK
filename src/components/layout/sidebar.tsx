"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  Search,
  Factory,
  Sparkles,
  Percent,
  Bell,
  Plug,
  RefreshCw,
  Building2,
  Users,
  CreditCard,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { activeHref } from "@/components/layout/active-href";

type Item = { href: string; label: string; icon: typeof LayoutDashboard; badge?: number };

const MAIN: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/stock", label: "Stock", icon: Boxes },
  { href: "/sales", label: "Ventes", icon: ShoppingCart },
  { href: "/sourcing", label: "Sourcing", icon: Search },
  { href: "/suppliers", label: "Fournisseurs", icon: Factory },
  { href: "/opportunities", label: "Opportunités", icon: Sparkles },
  { href: "/margins", label: "Marges", icon: Percent },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/stock/alerts", label: "Alertes", icon: Bell },
];

const SETTINGS: Item[] = [
  { href: "/settings/integrations", label: "Intégrations", icon: Plug },
  { href: "/settings/sync", label: "Synchronisation", icon: RefreshCw },
  { href: "/settings/organization", label: "Organisation", icon: Building2 },
  { href: "/settings/users", label: "Utilisateurs", icon: Users },
  { href: "/settings/billing", label: "Facturation", icon: CreditCard },
];

/** Libellé lisible du compteur (lecteurs d'écran). */
const BADGE_LABEL: Record<string, string> = {
  "/stock/alerts": "alerte(s) ou rupture(s)",
  "/settings/integrations": "annonce(s) à associer",
};

const ALL_HREFS = [...MAIN, ...SETTINGS].map((i) => i.href);

export function Sidebar({ counts, className, onNavigate }: { counts?: Partial<Record<string, number>>; className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = activeHref(pathname, ALL_HREFS);
  const render = (items: Item[]) =>
    items.map((it) => {
      const active = it.href === current;
      const Icon = it.icon;
      const badge = counts?.[it.href];
      return (
        <li key={it.href}>
          <Link
            href={it.href as never}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-surface-muted font-medium text-foreground" : "text-muted-strong hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", active ? "text-foreground" : "text-muted")} />
            <span className="flex-1 truncate">{it.label}</span>
            {badge ? (
              <span className="rounded-md bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-red-700 tnum">
                {badge}
                <span className="sr-only"> {BADGE_LABEL[it.href] ?? "élément(s) à traiter"}</span>
              </span>
            ) : null}
          </Link>
        </li>
      );
    });

  return (
    <nav aria-label="Navigation principale" className={cn("flex h-full flex-col gap-6 px-3 py-4", className)}>
      <div>
        <div className="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Pilotage</div>
        <ul className="space-y-0.5">{render(MAIN)}</ul>
      </div>
      <div>
        <div className="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Paramètres</div>
        <ul className="space-y-0.5">{render(SETTINGS)}</ul>
      </div>
    </nav>
  );
}
