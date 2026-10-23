"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, FileText, Plus, Search, type LucideIcon } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { NAV } from "@/components/layout/sidebar";
import { ADD_ITEMS } from "@/components/layout/topbar";
import { cn } from "@/lib/utils";

type Entry = { group: string; label: string; hint?: string; href: string };

/** Pictogramme du groupe (repère visuel ; le libellé du groupe reste annoncé). */
const GROUP_ICON: Record<string, LucideIcon> = { Actions: Plus, Pages: FileText, Rechercher: Search };

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Pages de la navigation (entrées et sous-entrées), sans doublon. */
function pageEntries(): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const g of NAV)
    for (const it of g.items)
      for (const p of [{ href: it.href, label: it.label }, ...(it.subs ?? []).map((s) => ({ href: s.href, label: `${it.label} · ${s.label}` }))])
        if (!seen.has(p.href)) {
          seen.add(p.href);
          out.push({ group: "Pages", label: p.label, href: p.href });
        }
  out.push({ group: "Pages", label: "Réglages · Organisation", href: "/settings/organization" }, { group: "Pages", label: "Réglages · Intégrations", href: "/settings/integrations" });
  return out;
}

/**
 * Recherche globale ⌘K : actions, pages, et — dès qu'un texte est saisi — recherche dans le
 * stock, chez les fournisseurs (en direct) et dans l'annuaire. ↑↓ pour choisir, ↵ pour ouvrir.
 */
export function CommandPalette({ onClose, readOnly }: { onClose: () => void; readOnly: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const pages = useMemo(() => pageEntries(), []);

  const entries = useMemo<Entry[]>(() => {
    const t = q.trim();
    const actions: Entry[] = readOnly ? [] : ADD_ITEMS.map((a) => ({ group: "Actions", label: `Ajouter : ${a.label}`, hint: a.sub, href: a.href }));
    if (!t) return [...actions, ...pages.slice(0, 8)];
    const enc = encodeURIComponent(t);
    const searches: Entry[] = [
      { group: "Rechercher", label: `« ${t} » dans le stock`, hint: "Produits et SKU", href: `/stock?q=${enc}` },
      { group: "Rechercher", label: `Chercher « ${t} » chez les fournisseurs`, hint: "Offres en direct, analyse « bonne affaire »", href: `/sourcing?q=${enc}` },
      { group: "Rechercher", label: `« ${t} » dans l'annuaire`, hint: "Fournisseurs étudiés", href: `/suppliers/directory?q=${enc}` },
    ];
    const f = fold(t);
    return [...searches, ...pages.filter((p) => fold(p.label).includes(f)), ...actions.filter((a) => fold(a.label).includes(f))];
  }, [q, pages, readOnly]);

  const go = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    router.push(e.href as never);
  };
  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Fermer la recherche" className="absolute inset-0 cursor-default bg-overlay transition-opacity duration-200 ease-standard starting:opacity-0" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Recherche globale" className="ms-fade absolute left-1/2 top-[72px] w-[640px] max-w-[calc(100vw-24px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-modal sm:top-[88px]">
        <div className="flex h-[58px] items-center gap-3 border-b border-border px-4">
          <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(entries.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(entries[index]);
              } else if (e.key === "Escape") onClose();
            }}
            aria-label="Rechercher un produit, un SKU, un fournisseur, une offre ou une page"
            placeholder="Produit, SKU, fournisseur, offre, page…"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-foreground outline-none placeholder:font-medium placeholder:text-ink-3"
          />
          <span className="hidden sm:inline-flex">
            <Kbd>Échap</Kbd>
          </span>
        </div>
        <ul className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5" role="listbox" aria-label="Résultats">
          {entries.map((e, i) => {
            const header = e.group !== lastGroup ? e.group : null;
            lastGroup = e.group;
            return (
              <li key={`${e.group}-${e.href}-${e.label}`}>
                {header ? <div className="ms-mono px-2.5 pb-1 pt-2.5 text-[10px] leading-[13px] text-ink-3">{header}</div> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(e)}
                  className={cn("flex min-h-11 w-full items-center gap-3 rounded-[10px] px-2.5 py-1.5 text-left transition-colors duration-100", i === index ? "bg-selection" : "")}
                >
                  <GroupIcon group={e.group} active={i === index} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">{e.label}</span>
                    {e.hint ? <span className="truncate text-xs font-semibold text-ink-3">{e.hint}</span> : null}
                  </span>
                  {i === index ? <ArrowRight aria-hidden="true" className="h-4 w-4 text-ink-3" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface-2 px-4 py-2.5 text-xs font-semibold text-muted max-sm:hidden">
          <span className="inline-flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> choisir
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>
              <CornerDownLeft aria-hidden="true" className="h-3 w-3" />
            </Kbd>{" "}
            ouvrir
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>Échap</Kbd> fermer
          </span>
        </div>
      </div>
    </div>
  );
}

function GroupIcon({ group, active }: { group: string; active: boolean }) {
  const Icon = GROUP_ICON[group] ?? ArrowRight;
  return (
    <span aria-hidden="true" className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] transition-colors duration-100", active ? "bg-inverse text-on-inverse" : "bg-surface-3 text-muted")}>
      <Icon className="h-4 w-4" />
    </span>
  );
}
