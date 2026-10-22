"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LogOut, X } from "lucide-react";
import { Sidebar, type SidebarCounts } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { AdvisorPanel } from "@/features/advisor/components/advisor-panel";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { DisplayedOrganizationGuard } from "@/components/layout/displayed-organization-guard";
import { DemoBadge } from "@/components/instrument/figure";
import { initials } from "@/components/instrument/pure";
import { ToastProvider } from "@/components/ui/toast";
import { signOutAction } from "@/features/auth/actions";
import { switchOrganizationAction } from "@/features/organizations/actions";
import type { ShellAlert } from "@/features/shell/queries";
import { cn } from "@/lib/utils";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const COLLAPSE_KEY = "monstock.sidebar.collapsed";
const COLLAPSE_EVENT = "monstock:sidebar";

/** Préférence « barre repliée » mémorisée dans le navigateur (dépliée côté serveur et si indisponible). */
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}
function subscribeCollapsed(cb: () => void) {
  window.addEventListener(COLLAPSE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export interface ShellProps {
  children: ReactNode;
  org: {
    id: string;
    name: string;
    isDemo: boolean;
    currency: string;
    roleLabel: string;
    options: { id: string; name: string; isDemo: boolean }[];
    /** l'organisation mémorisée n'est plus accessible : celle-ci a été retenue à sa place (W-28) */
    fallback?: boolean;
  };
  user: { name: string; email: string | null };
  readOnly: boolean;
  counts: SidebarCounts;
  lastEbaySync: string | null;
  alerts: ShellAlert[];
  alertTotal: number;
}

/** La saisie en cours (champ, zone de texte, liste) ne déclenche aucun raccourci à une touche. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/**
 * Coquille v5 « Instrument » : barre latérale nuit (repliable, « [ »), barre du haut nuit,
 * recherche ⌘K (et « / » hors pages qui ont leur propre recherche), N = Ajouter, ⌘J = Conseiller.
 * Chaque page pose sa scène nuit puis son papier ; une page sans scène est posée sur le papier.
 */
export function AppShell({ children, org, user, readOnly, counts, lastEbaySync, alerts, alertTotal }: ShellProps) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const [search, setSearch] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const onAdvisorPage = pathname === "/advisor" || pathname.startsWith("/advisor/");
  const [lastPathname, setLastPathname] = useState(pathname);
  const panelRef = useRef<HTMLDivElement>(null);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (drawer) setDrawer(false);
    if (search) setSearch(false);
    if (advisorOpen && (pathname === "/advisor" || pathname.startsWith("/advisor/"))) setAdvisorOpen(false);
  }

  // Conseiller : panneau ⌘J depuis n'importe quelle page ; sur la page du conseiller, rien à ouvrir.
  const toggleAdvisor = useCallback(() => {
    if (onAdvisorPage) return;
    setAdvisorOpen((v) => !v);
  }, [onAdvisorPage]);

  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, readCollapsed() ? "0" : "1");
    } catch {
      // préférence non mémorisée (navigation privée…) : rien à faire
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggleAdvisor();
        return;
      }
      if (mod || e.altKey || typing(e.target) || document.querySelector("dialog[open], [aria-modal='true']")) return;
      if (e.key === "[") {
        e.preventDefault();
        toggle();
      } else if (e.key === "/" && !document.querySelector("[data-page-search]")) {
        e.preventDefault();
        setSearch(true);
      } else if (e.key.toLowerCase() === "n" && !readOnly) {
        e.preventDefault();
        setAddOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle, toggleAdvisor, readOnly]);

  // Tiroir mobile : Échap, défilement bloqué, piège à focus minimal.
  useEffect(() => {
    if (!drawer) return;
    const root = document.documentElement;
    root.setAttribute("data-scroll-locked", "");
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      root.removeAttribute("data-scroll-locked");
    };
  }, [drawer]);
  const trapFocus = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const orgSwitcher = (isCollapsed: boolean) => <OrgSwitcher options={org.options} currentId={org.id} roleLabel={org.roleLabel} currency={org.currency} collapsed={isCollapsed} />;
  const account = (isCollapsed: boolean) => (
    <div title={user.name} className={cn("flex min-h-[52px] items-center gap-2.5 px-1.5 py-2", isCollapsed && "justify-center")}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-night-raised text-xs font-extrabold text-on-night">{initials(user.name)}</span>
      {isCollapsed ? null : (
        <>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13.5px] font-bold leading-[18px] text-on-night">{user.name}</span>
            {user.email ? <span className="truncate text-xs font-semibold text-on-night-subtle">{user.email}</span> : null}
          </span>
          <form action={signOutAction}>
            <button type="submit" aria-label="Se déconnecter" title="Se déconnecter" className="flex h-8 w-8 items-center justify-center rounded-[10px] text-on-night-muted hover:bg-night-raised hover:text-on-night">
              <LogOut aria-hidden="true" className="h-4 w-4" />
            </button>
          </form>
        </>
      )}
    </div>
  );

  return (
    <div className="flex min-h-full flex-1 bg-night">
      <DisplayedOrganizationGuard organizationId={org.id} />
      <a href="#contenu" className="sr-only z-50 rounded-lg bg-mint px-3 py-2 text-sm font-bold text-night focus:not-sr-only focus:fixed focus:left-4 focus:top-3">
        Aller au contenu
      </a>
      <aside aria-label="Barre latérale" className={cn("sticky top-0 hidden h-screen shrink-0 bg-night transition-[width] duration-[280ms] ease-[cubic-bezier(.22,1,.36,1)] lg:block", collapsed ? "w-[72px]" : "w-[248px]")}>
        <Sidebar collapsed={collapsed} onToggle={toggle} counts={counts} header={orgSwitcher(collapsed)} footer={account(collapsed)} />
      </aside>

      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Fermer le menu" className="absolute inset-0 cursor-default bg-overlay" onClick={() => setDrawer(false)} />
          <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Menu de navigation" onKeyDown={trapFocus} className="ms-fade absolute inset-y-0 left-0 w-[280px] max-w-[85vw] overflow-y-auto bg-night">
            <button type="button" onClick={() => setDrawer(false)} aria-label="Fermer le menu" className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] text-on-night-muted hover:bg-night-raised">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
            <Sidebar counts={counts} header={orgSwitcher(false)} footer={account(false)} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onToggleAdvisor={onAdvisorPage ? undefined : toggleAdvisor} advisorOpen={advisorOpen} onOpenSearch={() => setSearch(true)} onOpenMenu={() => setDrawer(true)} addOpen={addOpen} setAddOpen={setAddOpen} readOnly={readOnly} lastEbaySync={lastEbaySync} alerts={alerts} alertTotal={alertTotal} />
        <main id="contenu" tabIndex={-1} className="flex min-w-0 flex-1 flex-col focus:outline-none">
          {org.fallback ? (
            <div role="status" className="flex flex-wrap items-center gap-2.5 px-4 pb-2.5 pt-1 sm:px-8 lg:pl-8 lg:pr-10">
              <span className="text-[13px] font-semibold text-on-night">
                Votre organisation habituelle n&apos;est plus accessible (accès retiré ou organisation supprimée) : MON STOCK affiche « {org.name} ».
              </span>
              <form action={switchOrganizationAction}>
                <input type="hidden" name="organization_id" value={org.id} />
                <button type="submit" className="rounded-lg px-2 py-1 text-[13px] font-bold text-mint underline underline-offset-2 hover:text-on-night">
                  Continuer avec cette organisation
                </button>
              </form>
            </div>
          ) : null}
          {org.isDemo ? (
            <div className="flex flex-wrap items-center gap-2.5 px-4 pb-2.5 pt-1 sm:px-8 lg:pl-8 lg:pr-10">
              <DemoBadge />
              <span className="text-[13px] font-semibold text-on-night-muted">Organisation de démonstration — données fictives. Aucun chiffre affiché ici ne provient d&apos;une vraie marketplace ni d&apos;un vrai fournisseur.</span>
            </div>
          ) : null}
          <div className="ms-content flex min-w-0 flex-1 flex-col">
            <ToastProvider>{children}</ToastProvider>
          </div>
        </main>
      </div>
      {search ? <CommandPalette onClose={() => setSearch(false)} readOnly={readOnly} /> : null}
      {advisorOpen && !onAdvisorPage ? <AdvisorPanel onClose={() => setAdvisorOpen(false)} /> : null}
    </div>
  );
}
