"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Building2, Calculator, CircleUserRound, CreditCard, Plug, RefreshCw, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { activeSettingsSection, SETTINGS_SECTIONS, type SettingsSectionId } from "@/features/organizations/components/settings-sections";
import { internalRoute } from "@/lib/routes";

const ICONS: Record<SettingsSectionId, LucideIcon> = {
  organization: Building2,
  users: Users,
  integrations: Plug,
  sync: RefreshCw,
  "radar-costs": Calculator,
  billing: CreditCard,
  account: CircleUserRound,
};

/**
 * Sous-navigation des Réglages (handoff v5) : colonne collante de 232 px sur grand écran,
 * rangée défilante au-dessus du contenu en dessous de 1024 px.
 */
export function SettingsNav() {
  const pathname = usePathname();
  const active = activeSettingsSection(pathname);
  const navRef = useRef<HTMLElement>(null);
  // Rangée défilante (< 1024 px) : la section active est ramenée dans la vue, sans défiler la page.
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = Math.max(0, link.offsetLeft - nav.clientWidth / 2 + link.offsetWidth / 2);
  }, [active]);
  return (
    <nav ref={navRef} aria-label="Sections des réglages" className="relative -mx-4 overflow-x-auto px-4 sm:-mx-8 sm:px-8 lg:sticky lg:top-[76px] lg:mx-0 lg:w-[232px] lg:shrink-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1.5 lg:flex-col lg:gap-0.5">
        {SETTINGS_SECTIONS.map((s) => {
          const Icon = ICONS[s.id];
          const current = s.id === active;
          return (
            <li key={s.id} className="shrink-0">
              <Link
                href={internalRoute(s.href)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-2.5 whitespace-nowrap rounded-[10px] border px-3 text-sm transition-colors",
                  current ? "border-border bg-surface font-bold text-foreground" : "border-transparent font-semibold text-muted hover:bg-surface hover:text-foreground",
                )}
              >
                <Icon aria-hidden="true" className="h-[17px] w-[17px] shrink-0" strokeWidth={current ? 2.2 : 1.8} />
                <span className="flex-1">{s.label}</span>
                {s.external ? <ArrowUpRight aria-hidden="true" className="hidden h-3.5 w-3.5 text-ink-4 lg:block" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
