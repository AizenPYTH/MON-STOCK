"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { HOME_NAV } from "@/components/public/home/nav-links";

/**
 * Feuille de navigation mobile (handoff v2 §C.1, §F « Menu mobile ») : bouton 44 px, barres → croix,
 * feuille y −8 → 0 et opacité 0 → 1 en 300 ms (courbe sheet). Échap ou un lien referment.
 * Fermée : `inert` + invisible (hors de l'ordre de tabulation). Masquée ≥ 1100 px.
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!sheetRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    sheetRef.current?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-[12px] text-on-night transition-colors hover:bg-night-raised min-[1100px]:hidden"
      >
        <span aria-hidden="true" className="relative block h-[12px] w-[18px]">
          <span className={cn("absolute left-0 top-0 block h-[2px] w-full rounded-full bg-current transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)]", open && "translate-y-[5px] rotate-45")} />
          <span className={cn("absolute bottom-0 left-0 block h-[2px] w-full rounded-full bg-current transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)]", open && "-translate-y-[5px] -rotate-45")} />
        </span>
      </button>

      <div
        ref={sheetRef}
        id={id}
        inert={!open}
        className={cn(
          "absolute inset-x-0 top-[66px] origin-top rounded-2xl border border-on-night/12 bg-night p-2 shadow-[0_24px_50px_-12px_rgba(0,0,0,.6)] transition-[opacity,transform] duration-300 ease-[cubic-bezier(.32,.72,0,1)] min-[1100px]:hidden",
          open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0",
        )}
      >
        <nav aria-label="Menu">
          <ul className="flex flex-col">
            {HOME_NAV.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={close} className="flex min-h-12 items-center rounded-[12px] px-3.5 text-[16px] font-bold text-on-night hover:bg-night-raised">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-on-night/10 pt-2">
            <Link href="/login" prefetch={false} onClick={close} className="flex h-12 items-center justify-center rounded-[12px] border border-on-night/16 text-[15px] font-bold text-on-night hover:bg-night-raised">
              Se connecter
            </Link>
            <Link href="/signup" prefetch={false} onClick={close} className="flex h-12 items-center justify-center rounded-[12px] bg-mint text-[15px] font-extrabold text-night hover:bg-mint-pressed">
              Créer un compte
            </Link>
          </div>
        </nav>
      </div>
    </>
  );
}
