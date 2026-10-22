"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Panneau latéral droit (fiche SKU, analyse d'offre…) piloté par l'URL : il s'ouvre quand la page
 * le rend et se ferme en revenant à `closeHref` (bouton, Échap, clic sur le voile). Le focus entre
 * dans le panneau à l'ouverture. La liste reste visible derrière.
 */
export function SidePanel({ closeHref, label, width = 540, children, header, footer }: { closeHref: string; label: string; width?: number; children: ReactNode; header?: ReactNode; footer?: ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) router.push(closeHref as never, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeHref, router]);
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Fermer le panneau" className="absolute inset-0 cursor-default bg-overlay" onClick={() => router.push(closeHref as never, { scroll: false })} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn("ms-slide absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden bg-background shadow-modal focus:outline-none")}
        style={{ maxWidth: width }}
      >
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <div className="border-t border-border bg-surface px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Bouton « Fermer · Échap » pour l'en-tête nuit d'un panneau. */
export function PanelClose({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} className="inline-flex h-8 items-center gap-2 rounded-[10px] px-2 text-[13px] font-semibold text-on-night-muted transition-colors hover:bg-night-raised hover:text-on-night focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-10">
      <X aria-hidden="true" className="h-4 w-4" /> Fermer <kbd className="ms-code rounded-[5px] border border-night-stroke px-1.5 text-[10.5px]">Échap</kbd>
    </button>
  );
}
