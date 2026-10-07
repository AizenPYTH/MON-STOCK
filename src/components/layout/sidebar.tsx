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

function isActive(pathname: string, href: string): boolean {
  if (href === "/stock") return pathname === "/stock" || (pathname.startsWith("/stock/") && !pathname.startsWith("/stock/alerts"));
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ counts, className, onNavigate }: { counts?: Partial<Record<string, number>>; className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const render = (items: Item[]) =>
    items.map((it) => {
      const active = isActive(pathname, it.href);
      const Icon = it.icon;
      const badge = counts?.[it.href];
      return (
        <Link
          key={it.href}
          href={it.href as never}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
            active ? "bg-surface-muted font-medium text-foreground" : "text-muted-strong hover:bg-surface-muted hover:text-foreground",
          )}
        >
          <Icon className={cn("h-4 w-4 shrink-0", active ? "text-foreground" : "text-muted")} />
          <span className="flex-1 truncate">{it.label}</span>
          {badge ? <span className="rounded-md bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-red-700 tnum">{badge}</span> : null}
        </Link>
      );
    });

  return (
    <nav className={cn("flex h-full flex-col gap-6 px-3 py-4", className)}>
      <div>
        <div className="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">MON STOCK</div>
        <div className="space-y-0.5">{render(MAIN)}</div>
      </div>
      <div>
        <div className="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Paramètres</div>
        <div className="space-y-0.5">{render(SETTINGS)}</div>
      </div>
    </nav>
  );
}
