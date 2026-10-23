"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, Boxes, FileSpreadsheet, Info, Menu, Plus, Search, Sparkles, Truck, UserPlus } from "lucide-react";
import { DemoBadge, Kbd, ToneIcon } from "@/components/instrument";
import { initials } from "@/components/instrument/pure";
import type { ShellAlert } from "@/features/shell/queries";
import { formatRelativeShort } from "@/components/layout/relative-time";
import { cn } from "@/lib/utils";

export const ADD_ITEMS = [
  { href: "/stock/new", label: "Produit", sub: "Variantes, saisie ou dictée", icon: Boxes, kbd: "P" },
  { href: "/sourcing/imports/new", label: "Import de catalogue", sub: "CSV, XLSX, XML, JSON", icon: FileSpreadsheet, kbd: "I" },
  { href: "/suppliers/new", label: "Fournisseur", sub: "Fiche et conditions", icon: UserPlus, kbd: "F" },
  { href: "/tools/tracking/new", label: "Suivi de colis", sub: "Numéro ou étiquette collée", icon: Truck, kbd: "S" },
] as const;

/** Menu flottant blanc (rayon 14, ombre de ce qui flotte) refermé au clic extérieur / Échap. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const FLOAT = "ms-fade absolute right-0 top-[48px] z-[60] max-sm:fixed max-sm:inset-x-3 max-sm:top-[60px] max-sm:w-auto! rounded-[14px] border border-border bg-surface text-foreground shadow-floating";

function AlertsMenu({ alerts, total }: { alerts: ShellAlert[]; total: number | null }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={total === null ? "Alertes : nombre inconnu" : `Alertes : ${total} à traiter`} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-night-raised text-on-night transition-colors duration-150 ease-standard hover:bg-night-hover">
        <Bell aria-hidden="true" className="h-[18px] w-[18px]" />
        {total !== null && total > 0 ? <span aria-hidden="true" className="absolute right-[9px] top-2 h-2 w-2 rounded-full bg-amber ring-2 ring-night-raised" /> : null}
      </button>
      {open ? (
        <div role="dialog" aria-label="Alertes" className={cn(FLOAT, "w-[400px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl")}>
          <div className="flex items-center justify-between px-4 pb-2.5 pt-3.5">
            <span className="flex items-center gap-2">
              <span className="ms-mono text-[11px] leading-[14px] text-muted">Alertes</span>
              <span className="ms-code text-[11px]">{total ?? "—"}</span>
            </span>
            <span className="ms-code text-[11px] text-ink-3">par gravité</span>
          </div>
          {alerts.length === 0 ? (
            <p className="border-t border-line-soft px-4 py-5 text-sm font-semibold text-muted">Aucune alerte ouverte.</p>
          ) : (
            alerts.map((a) => (
              <Link key={a.id} href={(a.href ?? "/stock/alerts") as never} onClick={() => setOpen(false)} className="flex min-h-14 items-center gap-3 border-t border-line-soft px-4 py-2.5 hover:bg-line-soft">
                <ToneIcon tone={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warning" : "info"}>{a.severity === "info" ? <Info /> : <AlertTriangle />}</ToneIcon>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{a.title}</span>
                  <span className="truncate text-[12.5px] font-semibold text-ink-3">{a.message}</span>
                </span>
                <span className="text-[13px] font-bold">Voir</span>
              </Link>
            ))
          )}
          <Link href="/stock/alerts" onClick={() => setOpen(false)} className="block border-t border-line-soft px-4 py-3 text-[13px] font-bold hover:bg-line-soft">
            Toutes les alertes
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function AddMenu({ readOnly, open, setOpen }: { readOnly: boolean; open: boolean; setOpen: (v: boolean) => void }) {
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={readOnly}
        aria-expanded={open}
        aria-haspopup="menu"
        title={readOnly ? "Votre rôle ne permet pas d'ajouter des données." : "Ajouter (N)"}
        className={cn("flex h-10 shrink-0 items-center gap-2 rounded-[10px] transition-colors duration-150 ease-standard max-sm:w-10 max-sm:justify-center sm:pl-3 sm:pr-2", readOnly ? "cursor-not-allowed bg-night-raised text-on-night-subtle" : "bg-mint text-night hover:bg-mint-pressed")}
      >
        <Plus aria-hidden="true" className="h-[18px] w-[18px]" />
        <span className="text-sm font-extrabold max-sm:sr-only">Ajouter</span>
        {/* Touche posée sur l'aplat menthe : encre nuit dans les deux thèmes (la menthe ne change pas). */}
        <kbd aria-hidden="true" className="ms-code hidden h-5 min-w-5 items-center justify-center rounded-[5px] border border-night/25 px-1.5 text-[10.5px] leading-none text-night lg:inline-flex">
          N
        </kbd>
      </button>
      {open ? (
        <div role="menu" className={cn(FLOAT, "w-[280px] p-1.5")}>
          {ADD_ITEMS.map((a) => (
            <Link key={a.href} role="menuitem" href={a.href as never} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 hover:bg-line-soft">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-background">
                <a.icon aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="flex flex-1 flex-col">
                <span className="text-sm font-bold">{a.label}</span>
                <span className="text-xs font-semibold text-ink-3">{a.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Barre du haut nuit : recherche ⌘K, organisation active (sous 1024 px), état de synchro eBay, Conseiller, Alertes, + Ajouter. */
export function Topbar({
  onToggleAdvisor,
  advisorOpen = false,
  onOpenSearch,
  onOpenMenu,
  addOpen,
  setAddOpen,
  readOnly,
  lastEbaySync,
  alerts,
  alertTotal,
  menuButton,
  org,
}: {
  onToggleAdvisor?: () => void;
  advisorOpen?: boolean;
  onOpenSearch: () => void;
  onOpenMenu: () => void;
  addOpen: boolean;
  setAddOpen: (v: boolean) => void;
  readOnly: boolean;
  lastEbaySync: string | null;
  alerts: ShellAlert[];
  alertTotal: number | null;
  menuButton?: ReactNode;
  /** Organisation affichée : rappelée dans la barre quand la barre latérale est masquée (tiroir). */
  org?: { name: string; isDemo: boolean };
}) {
  const router = useRouter();
  const sync = lastEbaySync ? formatRelativeShort(lastEbaySync) : null;
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-night pl-2 pr-3 sm:gap-2.5 sm:pr-6">
      <button type="button" onClick={onOpenMenu} aria-label="Ouvrir le menu" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-on-night transition-colors duration-150 ease-standard hover:bg-night-raised lg:hidden">
        <Menu aria-hidden="true" className="h-5 w-5" />
      </button>
      {org ? (
        // Sous 1024 px, la barre latérale (et son sélecteur) vit dans le tiroir : l'organisation reste visible ici.
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={`Organisation affichée : ${org.name}${org.isDemo ? " (démonstration)" : ""}. Ouvrir le menu pour en changer`}
          title={org.name}
          className="flex h-10 min-w-0 shrink items-center gap-2 rounded-[10px] pr-1 transition-colors duration-150 ease-standard hover:bg-night-raised sm:max-w-[220px] sm:border sm:border-night-stroke sm:pl-1 sm:pr-2.5 lg:hidden"
        >
          <span aria-hidden="true" className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-night-raised text-[11.5px] font-extrabold tracking-[.3px] text-on-night">
            {initials(org.name)}
          </span>
          <span className="hidden min-w-0 truncate text-[13.5px] font-bold text-on-night sm:block">{org.name}</span>
          {org.isDemo ? (
            <span className="hidden sm:inline-flex">
              <DemoBadge />
            </span>
          ) : null}
        </button>
      ) : null}
      {menuButton}
      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Recherche globale (⌘K)"
        className="flex h-10 w-10 shrink-0 items-center justify-center gap-2.5 rounded-[10px] bg-night-raised text-on-night-muted transition-colors duration-150 ease-standard hover:bg-night-hover hover:text-on-night sm:w-auto sm:max-w-[460px] sm:flex-[0_1_460px] sm:justify-start sm:pl-3 sm:pr-2"
      >
        <Search aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
        <span className="hidden min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold text-on-night-subtle sm:block">Rechercher un produit, un SKU, un fournisseur, une offre…</span>
        <span className="hidden md:inline-flex">
          <Kbd>⌘ K</Kbd>
        </span>
      </button>
      <span className="flex-1" />
      {readOnly ? (
        <span title="Votre rôle ne permet pas de modifier les données de cette organisation." className="ms-mono hidden shrink-0 rounded-md border border-night-stroke px-[7px] py-1 text-[10px] leading-[13px] text-on-night sm:inline">
          Lecture seule
        </span>
      ) : null}
      {sync ? (
        <span title="Dernière synchronisation eBay réussie" className="hidden min-w-0 items-center gap-[7px] overflow-hidden whitespace-nowrap px-1.5 min-[1240px]:flex">
          <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-mint" />
          <span className="ms-mono text-[10px] leading-[13px] text-on-night-subtle">eBay · synchro {sync}</span>
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => (onToggleAdvisor ? onToggleAdvisor() : router.push("/advisor"))}
        aria-expanded={onToggleAdvisor ? advisorOpen : undefined}
        aria-label="Ouvrir le conseiller (⌘J)"
        className="flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-night-raised text-on-night transition-colors duration-150 ease-standard hover:bg-night-hover sm:w-auto sm:pl-3 sm:pr-2.5"
      >
        <Sparkles aria-hidden="true" className="h-[18px] w-[18px] text-mint" />
        <span className="hidden text-[13.5px] font-bold sm:inline">Conseiller</span>
        <span className="hidden lg:inline-flex">
          <Kbd>⌘ J</Kbd>
        </span>
      </button>
      <AlertsMenu alerts={alerts} total={alertTotal} />
      <AddMenu readOnly={readOnly} open={addOpen} setOpen={setAddOpen} />
    </header>
  );
}
