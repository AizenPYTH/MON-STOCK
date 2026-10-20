"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Boîte de dialogue modale sur `<dialog>` natif : Échap ferme (événement `cancel` → `close`),
 * le focus est piégé par le navigateur pendant l'ouverture puis rendu à l'élément déclencheur,
 * le défilement de la page est bloqué (voir `html:has(dialog[open])` dans globals.css).
 */
export function Dialog({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        onClose();
        const target = returnFocus.current;
        returnFocus.current = null;
        if (target && target.isConnected) target.focus();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-border bg-surface p-0 text-foreground shadow-[0_12px_32px_rgba(10,20,32,.35)] backdrop:bg-overlay",
        className,
      )}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line-soft bg-surface px-6 py-4">
        <h2 id={titleId} className="text-[20px] font-extrabold leading-[26px] tracking-[-0.3px]">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted hover:bg-line-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="px-6 py-5">{open ? children : null}</div>
    </dialog>
  );
}
