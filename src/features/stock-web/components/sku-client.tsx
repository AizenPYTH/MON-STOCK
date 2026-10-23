"use client";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Maximize2, Minus, Pencil, Plus, SlidersHorizontal, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { stepPlan } from "@/features/stock-web/adjust.pure";
import { recordMovement } from "@/features/stock-web/components/movements-client";
import { AdjustDialog, type AdjustTarget } from "@/features/stock-web/components/adjust-dialog";
import { internalRoute } from "@/lib/routes";

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

const iconBtn = "flex h-10 w-10 items-center justify-center rounded-xl bg-night-raised text-on-night hover:bg-night-hover";

/**
 * Barre de tête de la fiche SKU (sur la scène nuit) : Fermer · Échap, ↑ ↓ référence précédente /
 * suivante de la liste filtrée, pleine page, modifier. Échap est géré par le panneau.
 */
export function SkuPanelBar({ closeHref, prevHref, nextHref, fullHref, editHref }: { closeHref: string; prevHref: string | null; nextHref: string | null; fullHref: string; editHref: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector("dialog[open]")) return;
      const href = e.key === "ArrowDown" ? nextHref : prevHref;
      if (!href) return;
      e.preventDefault();
      router.push(internalRoute(href), { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [prevHref, nextHref, router]);
  return (
    <div className="flex min-h-11 items-center justify-between gap-2">
      <button type="button" onClick={() => router.push(internalRoute(closeHref), { scroll: false })} aria-label="Fermer la fiche (Échap)" className="flex h-10 items-center gap-2 rounded-[10px] pl-1.5 pr-2.5 text-on-night-muted hover:bg-night-raised hover:text-on-night">
        <X aria-hidden="true" className="h-[18px] w-[18px]" />
        <span className="text-sm font-semibold">Fermer</span>
        <kbd className="ms-code hidden rounded-[5px] border border-night-stroke px-1.5 text-[10.5px] leading-[18px] sm:inline">Échap</kbd>
      </button>
      <span className="flex items-center gap-1.5">
        {prevHref || nextHref ? (
          <>
            <span className="ms-mono mr-1 hidden whitespace-nowrap text-[10px] leading-[13px] text-on-night-subtle md:inline">↑ ↓ référence suivante</span>
            <Link href={internalRoute((prevHref ?? closeHref))} scroll={false} aria-label="Référence précédente (↑)" aria-disabled={!prevHref} tabIndex={prevHref ? undefined : -1} className={cn(iconBtn, "md:hidden", !prevHref && "pointer-events-none opacity-40")}>
              <ArrowUp aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link href={internalRoute((nextHref ?? closeHref))} scroll={false} aria-label="Référence suivante (↓)" aria-disabled={!nextHref} tabIndex={nextHref ? undefined : -1} className={cn(iconBtn, "md:hidden", !nextHref && "pointer-events-none opacity-40")}>
              <ArrowDown aria-hidden="true" className="h-4 w-4" />
            </Link>
          </>
        ) : null}
        <Link href={internalRoute(fullHref)} aria-label="Ouvrir en pleine page" title="Ouvrir en pleine page" className={iconBtn}>
          <Maximize2 aria-hidden="true" className="h-4 w-4" />
        </Link>
        {editHref ? (
          <Link href={internalRoute(editHref)} aria-label="Modifier la variante" title="Modifier la variante" className={iconBtn}>
            <Pencil aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : null}
      </span>
    </div>
  );
}

/** Pas à pas 44 px : chaque appui crée un vrai mouvement d'ajustement (± 1) via l'action existante. */
export function QuantityStepper({ skuId, code, available }: { skuId: string; code: string; available: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [shown, addDelta] = useOptimistic(available, (s: number, d: number) => s + d);
  const step = (direction: "in" | "out") =>
    start(async () => {
      addDelta(direction === "in" ? 1 : -1);
      const r = await recordMovement({ skuId, code }, stepPlan(direction), "Pas à pas (fiche SKU)");
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  const btn = "flex h-11 w-11 items-center justify-center rounded-[11px] border border-border bg-surface hover:bg-line-soft disabled:pointer-events-none disabled:opacity-40";
  return (
    <span role="group" aria-label="Ajuster la quantité d'une unité" className="flex items-center gap-1 rounded-[14px] bg-background p-1">
      <button type="button" onClick={() => step("out")} disabled={pending || shown <= 0} aria-label="Retirer une unité (crée un mouvement)" className={btn}>
        <Minus aria-hidden="true" className="h-[18px] w-[18px]" />
      </button>
      <span aria-live="polite" className={cn("min-w-14 text-center text-[22px] font-extrabold leading-7 tnum", pending && "opacity-60")}>
        {shown}
      </span>
      <button type="button" onClick={() => step("in")} disabled={pending} aria-label="Ajouter une unité (crée un mouvement)" className={btn}>
        <Plus aria-hidden="true" className="h-[18px] w-[18px]" />
      </button>
    </span>
  );
}

/** « Ajuster le stock » (pied de fiche) → dialogue Ajouter · Retirer · Définir + motif. */
export function AdjustStockLauncher({ target, className, label = "Ajuster le stock" }: { target: AdjustTarget; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-mint px-4 text-[15px] font-extrabold text-night hover:bg-mint-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
        <SlidersHorizontal aria-hidden="true" className="h-[18px] w-[18px]" />
        {label}
      </button>
      <AdjustDialog open={open} onClose={() => setOpen(false)} targets={[target]} />
    </>
  );
}
