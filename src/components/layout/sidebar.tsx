"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, LayoutDashboard, Library, PanelLeftClose, PanelLeftOpen, ScanSearch, Settings, Sparkles, Tag, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { activeHref } from "@/components/layout/active-href";

/**
 * Barre latérale v5 « Instrument » (handoff web) : fond nuit, groupes Pilotage · Achats ·
 * Assistance, UN seul indicateur menthe qui glisse vers l'élément actif, sous-éléments de la
 * section active (filet vertical, compteur mono — jamais de pastille rouge), Réglages et compte
 * en pied. Repliable (72 px) avec la touche « [ ».
 */
type Sub = { href: string; label: string; countKey?: keyof SidebarCounts };
type Item = { href: string; label: string; icon: LucideIcon; match: string[]; subs?: Sub[] };
type Group = { label: string; items: Item[] };

/** null = comptage indisponible (affiché « — », jamais 0). */
export type SidebarCounts = { pendingMatches?: number | null; openAlerts?: number | null; unmappedListings?: number | null };

export const NAV: Group[] = [
  {
    label: "Pilotage",
    items: [
      { href: "/dashboard", label: "Aujourd'hui", icon: LayoutDashboard, match: ["/dashboard"] },
      { href: "/stock", label: "Stock", icon: Boxes, match: ["/stock"], subs: [{ href: "/stock", label: "Références" }, { href: "/stock/alerts", label: "Alertes", countKey: "openAlerts" }] },
      { href: "/sales", label: "Ventes", icon: Tag, match: ["/sales"] },
      {
        href: "/analysis",
        label: "Analyse",
        icon: BarChart3,
        match: ["/analysis", "/margins", "/insights", "/opportunities"],
        subs: [
          { href: "/analysis", label: "Vue d'ensemble" },
          { href: "/margins", label: "Marges" },
          { href: "/insights", label: "À faire" },
          { href: "/opportunities", label: "Opportunités" },
        ],
      },
    ],
  },
  {
    label: "Achats",
    items: [
      {
        href: "/sourcing",
        label: "Sourcing",
        icon: ScanSearch,
        match: ["/sourcing", "/radar"],
        subs: [
          { href: "/sourcing", label: "Recherche" },
          { href: "/radar", label: "Radar" },
          { href: "/sourcing/matches", label: "Correspondances", countKey: "pendingMatches" },
          { href: "/sourcing/imports", label: "Imports" },
          { href: "/sourcing/sources", label: "Sources & flux" },
          { href: "/sourcing/catalog", label: "Offres collectées" },
        ],
      },
      {
        href: "/suppliers/directory",
        label: "Fournisseurs",
        icon: Library,
        match: ["/suppliers"],
        subs: [
          { href: "/suppliers/directory", label: "Annuaire" },
          { href: "/suppliers/accounts", label: "Mes comptes pro" },
          { href: "/suppliers", label: "Mes fournisseurs" },
        ],
      },
    ],
  },
  {
    label: "Assistance",
    items: [
      { href: "/tools", label: "Outils", icon: Wrench, match: ["/tools"] },
      { href: "/advisor", label: "Conseiller", icon: Sparkles, match: ["/advisor"] },
    ],
  },
];

const SETTINGS_SUBS: Sub[] = [
  { href: "/settings/organization", label: "Organisation" },
  { href: "/settings/users", label: "Membres et invitations" },
  { href: "/settings/integrations", label: "Intégrations", countKey: "unmappedListings" },
  { href: "/settings/sync", label: "Synchronisation" },
  { href: "/radar/settings", label: "Coûts du radar" },
  { href: "/settings/billing", label: "Facturation" },
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

/** Section active : préfixe le plus long parmi les correspondances de chaque entrée. */
export function activeItem(pathname: string): string | null {
  if (under(pathname, "/settings") || pathname === "/radar/settings") return "/settings";
  let best: { href: string; len: number } | null = null;
  for (const g of NAV)
    for (const it of g.items)
      for (const m of it.match)
        if (under(pathname, m) && (!best || m.length > best.len)) best = { href: it.href, len: m.length };
  return best?.href ?? null;
}

export function Sidebar({ collapsed = false, onToggle, counts, footer, header, onNavigate }: { collapsed?: boolean; onToggle?: () => void; counts?: SidebarCounts; footer?: ReactNode; header?: ReactNode; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = activeItem(pathname);
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<number | null>(null);

  // Indicateur unique : il glisse (translateY) vers l'icône de l'élément actif.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>("[data-nav-active='true']");
    setIndicator(el && nav ? el.offsetTop + (el.offsetHeight - 28) / 2 : null);
  }, [current, pathname, collapsed]);

  const subActive = (subs: Sub[]) => activeHref(pathname, subs.map((s) => s.href));

  const renderSubs = (subs: Sub[]) => {
    const active = subActive(subs);
    return (
      <ul className="mb-1 mt-0.5 space-y-0.5">
        {subs.map((s) => {
          const on = s.href === active;
          const n = s.countKey ? counts?.[s.countKey] : undefined;
          return (
            <li key={s.href}>
              <Link href={s.href as never} onClick={onNavigate} aria-current={on ? "page" : undefined} className={cn("flex h-8 items-center gap-3 rounded-lg pl-[23px] pr-2.5 hover:bg-[rgba(247,248,250,.06)]", on ? "text-on-night" : "text-on-night-muted")}>
                <span aria-hidden="true" className={cn("h-[18px] w-0.5 shrink-0 rounded-[1px]", on ? "bg-mint" : "bg-night-stroke")} />
                <span className={cn("flex-1 truncate text-[13.5px] leading-[18px]", on ? "font-bold" : "font-semibold")}>{s.label}</span>
                {n === null ? (
                  <span className="ms-code text-[11px] text-on-night-muted" aria-label="nombre inconnu">
                    —
                  </span>
                ) : n ? (
                  <span className="ms-code text-[11px] text-on-night-muted">{n}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  };

  const navLink = (href: string, label: string, Icon: LucideIcon, on: boolean) => (
    <Link
      href={href as never}
      onClick={onNavigate}
      aria-current={on ? "page" : undefined}
      data-nav-active={on ? "true" : undefined}
      title={collapsed ? label : undefined}
      className={cn("relative flex h-[38px] items-center gap-1.5 rounded-[10px] pl-1 pr-2.5 hover:bg-[rgba(247,248,250,.06)]", on ? "text-on-night" : "text-on-night-muted")}
    >
      <span className={cn("relative z-10 flex h-7 w-10 shrink-0 items-center justify-center transition-colors duration-150", on ? "text-night" : "")}>
        <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={on ? 2.2 : 1.8} />
      </span>
      {collapsed ? <span className="sr-only">{label}</span> : <span className={cn("flex-1 truncate text-sm leading-5", on ? "font-bold" : "font-semibold")}>{label}</span>}
    </Link>
  );

  return (
    <div className="flex h-full flex-col px-3 pb-3">
      <div className={cn("flex h-14 shrink-0 items-center px-1", collapsed ? "justify-center" : "justify-between pl-2.5")}>
        <Link href="/dashboard" onClick={onNavigate} aria-label="MON STOCK — Aujourd'hui" className="flex h-9 items-center gap-[7px] rounded-lg">
          <span aria-hidden="true" className="flex h-3.5 gap-[1.5px]">
            <span className="h-3.5 w-[3px] rounded-[1px] bg-on-night" />
            <span className="h-3.5 w-[1.5px] rounded-[1px] bg-on-night" />
            <span className="h-3.5 w-1 rounded-[1px] bg-mint" />
            <span className="h-3.5 w-[1.5px] rounded-[1px] bg-on-night" />
            <span className="h-3.5 w-[2.5px] rounded-[1px] bg-on-night" />
          </span>
          {collapsed ? null : <span className="whitespace-nowrap text-[13px] font-extrabold leading-4 tracking-[2.4px] text-on-night">MON STOCK</span>}
        </Link>
        {!collapsed && onToggle ? (
          <button type="button" onClick={onToggle} aria-label="Replier la barre latérale" title="Replier  [" className="flex h-8 w-8 items-center justify-center rounded-[10px] text-on-night-muted hover:bg-night-raised hover:text-on-night">
            <PanelLeftClose aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
        ) : null}
      </div>
      {header}
      <nav ref={navRef} aria-label="Navigation principale" className="relative mt-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden [scrollbar-width:none]">
        <span aria-hidden="true" className="pointer-events-none absolute left-1 top-0 h-7 w-10 rounded-[14px] bg-mint transition-[transform,opacity] duration-[280ms] ease-[cubic-bezier(.22,1,.36,1)]" style={{ transform: `translateY(${indicator ?? 0}px)`, opacity: indicator === null ? 0 : 1 }} />
        {NAV.map((g) => (
          <div key={g.label}>
            <div className="ms-mono flex h-[30px] items-end px-2.5 pb-1.5 text-[10px] leading-[13px] text-on-night-subtle">{collapsed ? <span aria-hidden="true" className="mb-1.5 h-px w-full bg-night-line" /> : g.label}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const on = it.href === current;
                return (
                  <li key={it.href}>
                    {navLink(it.href, it.label, it.icon, on)}
                    {on && it.subs && !collapsed ? renderSubs(it.subs) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex shrink-0 flex-col gap-0.5 border-t border-night-line pt-2">
        <div>
          <Link
            href="/settings/organization"
            onClick={onNavigate}
            aria-current={current === "/settings" ? "page" : undefined}
            title={collapsed ? "Réglages" : undefined}
            className={cn("flex h-[38px] items-center gap-1.5 rounded-[10px] pl-1 pr-2.5 hover:bg-[rgba(247,248,250,.06)]", current === "/settings" ? "text-on-night" : "text-on-night-muted")}
          >
            <span className={cn("flex h-7 w-10 items-center justify-center rounded-[14px]", current === "/settings" ? "bg-mint text-night" : "")}>
              <Settings aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={current === "/settings" ? 2.2 : 1.8} />
            </span>
            {collapsed ? <span className="sr-only">Réglages</span> : <span className={cn("flex-1 text-sm", current === "/settings" ? "font-bold" : "font-semibold")}>Réglages</span>}
          </Link>
          {current === "/settings" && !collapsed ? renderSubs(SETTINGS_SUBS) : null}
        </div>
        {footer}
        {collapsed && onToggle ? (
          <button type="button" onClick={onToggle} aria-label="Déplier la barre latérale" title="Déplier  [" className="flex h-9 items-center justify-center rounded-[10px] text-on-night-muted hover:bg-night-raised hover:text-on-night">
            <PanelLeftOpen aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
