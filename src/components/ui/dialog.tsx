"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" } as const;

/**
 * Boîte de dialogue modale sur `<dialog>` natif : Échap ferme (événement `cancel` → `close`),
 * le focus est piégé par le navigateur pendant l'ouverture puis rendu à l'élément déclencheur,
 * le défilement de la page est bloqué (voir `html:has(dialog[open])` dans globals.css).
 * Sous 640 px, elle se présente comme une feuille ancrée en bas de l'écran.
 * `footer` : actions (Annuler à gauche de l'action principale), collées en bas si le contenu défile.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  description,
  footer,
  size,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZES;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
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
      aria-describedby={description ? descriptionId : undefined}
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
        "ms-pop m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto overscroll-contain rounded-3xl border border-border bg-surface p-0 text-foreground shadow-modal backdrop:bg-overlay",
        "max-sm:mb-0 max-sm:max-h-[calc(100dvh-1.5rem)] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]",
        size ? cn("max-w-lg", SIZES[size]) : "max-w-lg",
        className,
      )}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line-soft bg-surface px-6 py-4">
        <div className="min-w-0 pt-1">
          <h2 id={titleId} className="text-h2 text-foreground">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-sm text-muted">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-line-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-10 pointer-coarse:w-10"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="px-6 py-5">{open ? children : null}</div>
      {footer && open ? <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-surface px-6 py-3">{footer}</div> : null}
    </dialog>
  );
}
