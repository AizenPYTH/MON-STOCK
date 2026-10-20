"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Parties interactives de l'accueil (seul état local : déplié / replié). Le contenu est rendu
 * côté serveur et passé en éléments.
 */

/** Carte priorité : « Calcul » déplie la cascade du radar sous la carte. */
export function PriorityShell({ left, offer, primary, calc }: { left: ReactNode; offer: ReactNode; primary: ReactNode; calc: ReactNode | null }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap">
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-2 p-5">{left}</div>
        <div className="flex min-w-0 flex-[1.1_1_300px] flex-col gap-2 border-line-soft p-3 max-[659px]:border-t min-[660px]:border-l">
          {offer}
          <div className="mt-auto flex gap-2 pt-1">
            {primary}
            {calc ? (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpen((v) => !v)}
                className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3.5 text-[15px] font-extrabold hover:bg-line-soft"
              >
                Calcul
                <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform duration-[160ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none", open && "rotate-180")} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {calc && open ? (
        <div id={id} className="ms-fade border-t border-line-soft px-5 pb-4 pt-3">
          {calc}
        </div>
      ) : null}
    </div>
  );
}

/** Liste « À traiter » : 5 lignes visibles, puis « N autres points ». */
export function TaskRows({ rows, visible = 5 }: { rows: ReactNode[]; visible?: number }) {
  const [all, setAll] = useState(false);
  const extra = rows.length - visible;
  const shown = all || extra <= 0 ? rows : rows.slice(0, visible);
  return (
    <>
      <ul className="divide-y divide-line-soft">{shown}</ul>
      {extra > 0 ? (
        <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)} className="flex min-h-11 w-full items-center justify-center gap-1 border-t border-line-soft text-[13px] font-bold hover:bg-line-soft">
          {all ? "Réduire" : `${extra} ${extra > 1 ? "autres points" : "autre point"}`}
          <ChevronDown aria-hidden="true" className={cn("h-[15px] w-[15px] transition-transform duration-[160ms] motion-reduce:transition-none", all && "rotate-180")} />
        </button>
      ) : null}
    </>
  );
}
