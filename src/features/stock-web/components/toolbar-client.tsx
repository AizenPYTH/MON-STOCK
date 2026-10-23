"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Columns3, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { stockHref } from "@/features/stock-web/params";
import { STOCK_COLUMNS, toggleColumn, useHiddenColumns } from "@/features/stock-web/components/columns";
import { internalRoute } from "@/lib/routes";

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** Recherche du tableau (« / » la cible : la coquille laisse la main aux pages qui ont `data-page-search`). */
export function StockSearch({ flat, initial }: { flat: Record<string, string>; initial: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(initial);
  const [last, setLast] = useState(initial);
  if (initial !== last) {
    setLast(initial);
    setQ(initial);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector("dialog[open], [aria-modal='true']")) return;
      e.preventDefault();
      ref.current?.focus();
      ref.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const go = (value: string) => router.push(internalRoute(stockHref(flat, { q: value.trim() || null })), { scroll: false });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(q);
  };
  return (
    <form role="search" onSubmit={submit} className="w-full sm:w-72 xl:w-80">
      <label className="flex h-10 items-center gap-2 rounded-xl border border-border-control bg-surface pl-3 pr-2 text-ink-3 transition-[border-color,box-shadow] duration-150 ease-standard hover:border-muted focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25">
        <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
        <input
          ref={ref}
          data-page-search=""
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && q) {
              e.preventDefault();
              setQ("");
            }
          }}
          aria-label="Rechercher dans le stock (nom, SKU, code-barres)"
          placeholder="Nom, SKU, code-barres…"
          maxLength={120}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground placeholder:font-medium placeholder:text-ink-3 focus:outline-none focus-visible:outline-none pointer-coarse:text-base [&::-webkit-search-cancel-button]:hidden"
        />
        {initial ? (
          <button type="button" onClick={() => go("")} aria-label="Effacer la recherche" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-line-soft hover:text-foreground">
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd aria-hidden="true" className="ms-code rounded-[5px] border border-border-strong px-1.5 text-[10.5px] leading-[18px] text-muted max-sm:hidden">/</kbd>
        )}
      </label>
    </form>
  );
}

/** Catégorie : liste déroulante en forme de puce (navigation immédiate). */
export function CategorySelect({ flat, categories, current }: { flat: Record<string, string>; categories: string[]; current: string | null }) {
  const router = useRouter();
  return (
    <label className="relative flex items-center">
      <span className="sr-only">Catégorie</span>
      <select
        value={current ?? ""}
        onChange={(e) => router.push(internalRoute(stockHref(flat, { category: e.target.value || null })), { scroll: false })}
        className={cn("h-9 cursor-pointer appearance-none rounded-full border pl-3.5 pr-8 text-[13.5px] font-semibold transition-colors duration-150 ease-standard pointer-coarse:h-10", current ? "border-inverse bg-inverse text-on-inverse hover:bg-inverse-hover" : "border-border-strong bg-surface text-foreground hover:bg-surface-2")}
      >
        <option value="">Toutes catégories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className={cn("pointer-events-none absolute right-2.5 h-3.5 w-3.5", current ? "text-on-inverse opacity-70" : "text-muted")} />
    </label>
  );
}

/** Menu « Colonnes » (cases à cocher) : préférence d'affichage de ce navigateur. */
export function ColumnsMenu() {
  const hidden = useHiddenColumns();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border-strong bg-surface px-2.5 text-[13px] font-bold text-foreground transition-colors duration-150 ease-standard hover:bg-surface-2 pointer-coarse:h-10">
        <Columns3 aria-hidden="true" className="h-4 w-4" />
        Colonnes
        {hidden.size > 0 ? <span className="ms-code text-[11px] text-ink-3">−{hidden.size}</span> : null}
      </button>
      {open ? (
        <div role="group" aria-label="Colonnes affichées" className="ms-fade absolute right-0 top-11 z-30 w-56 rounded-[14px] border border-border bg-surface p-1.5 text-foreground shadow-floating">
          <div className="ms-mono px-2.5 pb-1.5 pt-2 text-[10px] leading-[13px] text-ink-3">Colonnes affichées</div>
          {STOCK_COLUMNS.map((c) => {
            const on = !hidden.has(c.key);
            return (
              <button key={c.key} type="button" role="checkbox" aria-checked={on} onClick={() => toggleColumn(c.key, hidden)} className="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] font-semibold hover:bg-line-soft">
                <span aria-hidden="true" className={cn("flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px]", on ? "border-inverse bg-inverse text-on-inverse" : "border-border-control bg-surface")}>
                  {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
                {c.label}
              </button>
            );
          })}
          <p className="px-2.5 pb-1.5 pt-1 text-[11.5px] font-semibold leading-4 text-ink-3">Sur un écran étroit, certaines colonnes se masquent d&apos;elles-mêmes.</p>
        </div>
      ) : null}
    </div>
  );
}
