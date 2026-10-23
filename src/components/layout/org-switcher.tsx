"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { switchOrganizationAction } from "@/features/organizations/actions";
import { DemoBadge } from "@/components/instrument/figure";
import { initials } from "@/components/instrument/pure";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string; isDemo: boolean };

/**
 * Sélecteur d'organisation (barre latérale nuit) : carré d'initiales, nom, badge DÉMO, rôle ·
 * devise ; menu blanc des organisations, le choix est envoyé au serveur (formulaire), et entrée
 * « Nouvelle organisation » (W-28 : /onboarding sait créer une organisation supplémentaire).
 */
export function OrgSwitcher({ options, currentId, roleLabel, currency, collapsed = false }: { options: Option[]; currentId: string; roleLabel: string; currency: string; collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === currentId) ?? options[0];
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!current) return null;
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Organisation active : ${current.name}. Changer ou créer une organisation`}
        title={current.name}
        className={cn("flex min-h-[52px] w-full items-center gap-2.5 rounded-xl border border-night-stroke py-2 text-left transition-colors duration-150 ease-standard hover:bg-night-raised", open && "bg-night-raised", collapsed ? "justify-center px-1.5" : "px-2.5")}
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-night-raised text-[11.5px] font-extrabold tracking-[.3px] text-on-night">{initials(current.name)}</span>
        {collapsed ? null : (
          <>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[13.5px] font-bold leading-[18px] text-on-night">{current.name}</span>
                {current.isDemo ? <DemoBadge /> : null}
              </span>
              <span className="ms-mono truncate text-[10px] leading-[13px] text-on-night-subtle">
                {roleLabel} · {currency}
              </span>
            </span>
            <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 text-on-night-subtle" />
          </>
        )}
      </button>
      {open ? (
        <div role="menu" className="ms-fade absolute left-0 top-[58px] z-[60] w-[272px] max-w-[calc(100vw-24px)] rounded-[14px] border border-border bg-surface p-1.5 text-foreground shadow-floating">
          <div className="ms-mono px-2.5 pb-1.5 pt-2 text-[10px] leading-[13px] text-ink-3">Mes organisations</div>
          {options.map((o) => (
            <form key={o.id} action={switchOrganizationAction}>
              <input type="hidden" name="organization_id" value={o.id} />
              <button type="submit" role="menuitem" aria-current={o.id === currentId ? "true" : undefined} className="flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left hover:bg-line-soft">
                <span aria-hidden="true" className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold", o.id === currentId ? "bg-inverse text-on-inverse" : "bg-selection")}>{initials(o.name)}</span>
                <span className={cn("flex-1 truncate text-sm", o.id === currentId ? "font-bold" : "font-semibold")}>{o.name}</span>
                {o.isDemo ? <DemoBadge onNight={false} /> : null}
                {o.id === currentId ? <Check aria-label="Organisation active" className="h-4 w-4 text-success" /> : null}
              </button>
            </form>
          ))}
          <div className="my-1 border-t border-line-soft" />
          {/* prefetch={false} : /onboarding dépend de l'état du compte (voir W-01). */}
          <Link href="/onboarding" prefetch={false} role="menuitem" onClick={() => setOpen(false)} className="flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left text-sm font-semibold hover:bg-line-soft">
            <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-selection">
              <Plus aria-hidden="true" className="h-4 w-4" />
            </span>
            Nouvelle organisation
          </Link>
        </div>
      ) : null}
    </div>
  );
}
