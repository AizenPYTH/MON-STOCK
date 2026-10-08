"use client";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { ToastProvider } from "@/components/ui/toast";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AppShell({ children, topbar, counts }: { children: ReactNode; topbar: ReactNode; counts?: Partial<Record<string, number>> }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Navigation (lien, retour arrière…) : le tiroir mobile se referme.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (open) setOpen(false);
  }

  // Tiroir ouvert : focus initial, Échap pour fermer, défilement de la page bloqué,
  // puis focus rendu au bouton « menu » à la fermeture.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.setAttribute("data-scroll-locked", "");
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const menuButton = menuButtonRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      root.removeAttribute("data-scroll-locked");
      if (menuButton && menuButton.offsetParent !== null) menuButton.focus();
    };
  }, [open]);

  // Piège à focus minimal : Tab / Maj+Tab bouclent dans le tiroir.
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

  return (
    <div className="flex min-h-full flex-1">
      <a
        href="#contenu"
        className="sr-only z-50 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Aller au contenu
      </a>

      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <div className="flex h-14 items-center border-b border-border px-5">
            <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
              MON STOCK
            </Link>
          </div>
          <Sidebar counts={counts} />
        </div>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            id="menu-mobile"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navigation"
            onKeyDown={trapFocus}
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto overscroll-contain bg-surface shadow-xl"
          >
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Link href="/dashboard" className="text-sm font-semibold tracking-tight" onClick={() => setOpen(false)}>
                MON STOCK
              </Link>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Fermer le menu"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <Sidebar counts={counts} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            aria-label="Ouvrir le menu"
            aria-expanded={open}
            aria-controls="menu-mobile"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">{topbar}</div>
        </header>
        <main id="contenu" tabIndex={-1} className="flex-1 scroll-mt-14 px-4 py-6 focus:outline-none sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <ToastProvider>{children}</ToastProvider>
          </div>
        </main>
      </div>
    </div>
  );
}
