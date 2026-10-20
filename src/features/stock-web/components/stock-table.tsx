"use client";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Download, Minus, PackagePlus, ScanSearch, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryGlyph } from "@/features/stock-web/components/glyph";
import { useHiddenColumns, type StockColumn } from "@/features/stock-web/components/columns";
import { AdjustDialog, type AdjustTarget } from "@/features/stock-web/components/adjust-dialog";
import type { Tone } from "@/features/stock-web/list.pure";

/** Ligne prête à afficher (calculée côté serveur : aucune donnée inventée, « — » si inconnu). */
export interface StockRowDTO {
  skuId: string;
  code: string;
  title: string;
  productName: string;
  category: string | null;
  qty: string;
  qtyNegative: boolean;
  onHand: number;
  available: number;
  cover: { text: string; tone: Tone; dot: boolean; title: string };
  sales: string;
  cost: string;
  price: string;
  margin: { text: string; tone: Tone; title: string | undefined };
  channel: { text: string; muted: boolean };
  level: { label: string; tone: "out" | "low" | "ok"; title: string };
  restock: { text: string; title: string } | null;
  openHref: string;
}

export interface SortHeader {
  href: string;
  active: boolean;
  dir: "ascending" | "descending";
}

/** Masquage automatique par priorité quand la largeur manque (canal, catégorie, coût, ventes, couverture, marge). */
const RESPONSIVE: Record<StockColumn, string> = {
  channel: "hidden min-[1400px]:table-cell",
  category: "hidden xl:table-cell",
  cost: "hidden min-[1180px]:table-cell",
  sales: "hidden min-[1100px]:table-cell",
  cover: "hidden md:table-cell",
  margin: "hidden sm:table-cell",
  price: "hidden sm:table-cell",
  qty: "table-cell",
  level: "table-cell",
};

const TONE_TEXT: Record<Tone, string> = { danger: "text-danger", warning: "text-warning", success: "text-success", muted: "text-ink-3", default: "text-foreground" };
const LEVEL_DOT = { out: "var(--red)", low: "var(--amber)", ok: "var(--success)" } as const;
const LEVEL_TEXT = { out: "text-danger", low: "text-warning", ok: "text-foreground" } as const;

function Box({ checked, mixed }: { checked: boolean; mixed?: boolean }) {
  return (
    <span aria-hidden="true" className={cn("flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] transition-colors", checked || mixed ? "border-night bg-night text-white" : "border-border-strong bg-surface")}>
      {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : mixed ? <Minus className="h-3 w-3" strokeWidth={3} /> : null}
    </span>
  );
}

export function StockTableV5({
  rows,
  sortHeaders,
  density,
  openCode,
  writable,
  exportBase,
  footer,
}: {
  rows: StockRowDTO[];
  sortHeaders: Partial<Record<"product" | "qty" | "cover" | "sales" | "margin" | "level", SortHeader>>;
  density: "confort" | "compacte";
  openCode: string | null;
  writable: boolean;
  exportBase: string;
  footer: ReactNode;
}) {
  const router = useRouter();
  const hidden = useHiddenColumns();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [rowKey, setRowKey] = useState(rows.map((r) => r.skuId).join());
  const key = rows.map((r) => r.skuId).join();
  // Nouvelle page / nouveaux filtres : la sélection ne porte que sur les lignes visibles.
  if (key !== rowKey) {
    setRowKey(key);
    setSelected((s) => new Set(rows.filter((r) => s.has(r.skuId)).map((r) => r.skuId)));
  }

  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open], [aria-modal='true']")) setSelected(new Set());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected.size]);

  const col = (c: StockColumn) => (hidden.has(c) ? "hidden" : RESPONSIVE[c]);
  const compact = density === "compacte";
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.skuId));
  const someChecked = !allChecked && rows.some((r) => selected.has(r.skuId));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const chosen = rows.filter((r) => selected.has(r.skuId));
  const targets: AdjustTarget[] = chosen.map((r) => ({ skuId: r.skuId, code: r.code, label: r.title, onHand: r.onHand, available: r.available }));
  const exportHref = `${exportBase}${exportBase.includes("?") ? "&" : "?"}codes=${encodeURIComponent(chosen.map((r) => r.code).join(","))}`;
  const single = chosen.length === 1 ? chosen[0] : null;

  const th = "ms-mono sticky top-14 z-[5] h-10 bg-surface px-1.5 text-[10.5px] font-medium leading-[13px] text-ink-3 border-b border-border whitespace-nowrap";
  const head = (id: keyof typeof sortHeaders, label: string, align: "left" | "right", extra = "") => {
    const s = sortHeaders[id];
    return (
      <th scope="col" aria-sort={s?.active ? s.dir : undefined} className={cn(th, align === "right" ? "text-right" : "text-left", extra)}>
        {s ? (
          <Link href={s.href as never} scroll={false} className={cn("inline-flex h-10 items-center gap-1 rounded hover:text-foreground", s.active && "text-foreground", align === "right" && "flex-row-reverse")}>
            {label}
            <span aria-hidden="true" className={cn("flex", s.active ? "opacity-100" : "opacity-0")}>
              {s.dir === "ascending" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            </span>
          </Link>
        ) : (
          label
        )}
      </th>
    );
  };

  const openRow = (e: MouseEvent<HTMLTableRowElement>, href: string) => {
    const t = e.target as HTMLElement;
    if (t.closest("a, button, input, label")) return;
    router.push(href as never, { scroll: false });
  };

  return (
    <div className="overflow-clip rounded-2xl border border-border bg-surface">
      <table className="w-full table-auto border-separate border-spacing-0" aria-label="Références en stock">
        <thead>
          <tr>
            <th scope="col" className={cn(th, "w-11 pl-2")}>
              <button type="button" role="checkbox" aria-checked={allChecked ? true : someChecked ? "mixed" : false} aria-label="Tout sélectionner sur la page" onClick={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.skuId)))} className="flex h-10 w-9 items-center justify-center rounded-lg">
                <Box checked={allChecked} mixed={someChecked} />
              </button>
            </th>
            {head("product", "Produit", "left")}
            <th scope="col" className={cn(th, "text-left", col("category"))}>
              Catégorie
            </th>
            {hidden.has("qty") ? null : head("qty", "Qté", "right")}
            {head("cover", "Couverture", "right", col("cover"))}
            {head("sales", "Ventes 30 j", "right", col("sales"))}
            <th scope="col" className={cn(th, "text-right", col("cost"))}>
              Coût
            </th>
            <th scope="col" className={cn(th, "text-right", col("price"))}>
              Prix
            </th>
            {head("margin", "Marge", "right", col("margin"))}
            <th scope="col" className={cn(th, "pl-4 text-left", col("channel"))}>
              Canal
            </th>
            {head("level", "Niveau", "left", cn(col("level"), "pl-3 pr-3"))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const open = r.code === openCode;
            const checked = selected.has(r.skuId);
            const td = cn("border-b border-line-soft px-1.5 align-middle", compact ? "h-11" : "h-[60px]");
            return (
              <tr key={r.skuId} aria-selected={open || undefined} onClick={(e) => openRow(e, r.openHref)} className={cn("cursor-pointer transition-colors", open ? "bg-selection" : checked ? "bg-background" : "hover:bg-background/70")}>
                <td className={cn(td, "pl-2")} style={open ? { boxShadow: "inset 3px 0 0 var(--night)" } : undefined}>
                  <button type="button" role="checkbox" aria-checked={checked} aria-label={`Sélectionner ${r.title}`} onClick={() => toggle(r.skuId)} className="flex h-10 w-9 items-center justify-center rounded-lg">
                    <Box checked={checked} />
                  </button>
                </td>
                <td className={cn(td, "max-w-0 w-full")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <CategoryGlyph category={r.category} productName={r.productName} size={compact ? 30 : 38} />
                    <div className="flex min-w-0 flex-col gap-px">
                      <Link href={r.openHref as never} scroll={false} title={r.title} className="truncate rounded text-sm font-semibold leading-[19px] text-foreground hover:underline">
                        {r.title}
                      </Link>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="ms-code shrink-0 whitespace-nowrap text-[10.5px] leading-[14px] text-ink-3">{r.code}</span>
                        {r.restock && !compact ? (
                          <span title={r.restock.title} className="hidden min-w-0 items-center gap-1 sm:flex rounded-md bg-success-soft px-1.5 py-px text-[11.5px] font-bold leading-4 text-success">
                            <PackagePlus aria-hidden="true" className="h-3 w-3 shrink-0" />
                            <span className="truncate">{r.restock.text}</span>
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                </td>
                <td className={cn(td, "whitespace-nowrap text-[13px] font-semibold text-muted", col("category"))}>{r.category ?? "—"}</td>
                {hidden.has("qty") ? null : <td className={cn(td, "text-right text-[15px] font-bold tnum", r.qtyNegative && "text-danger")}>{r.qty}</td>}
                <td className={cn(td, "whitespace-nowrap text-right text-[13px] font-semibold tnum", TONE_TEXT[r.cover.tone], col("cover"))} title={r.cover.title}>
                  <span className="flex items-center justify-end gap-1.5">
                    {r.cover.dot ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: r.cover.tone === "danger" ? "var(--red)" : "var(--amber)" }} /> : null}
                    {r.cover.text}
                  </span>
                </td>
                <td className={cn(td, "text-right text-[13.5px] font-semibold tnum", col("sales"))}>{r.sales}</td>
                <td className={cn(td, "whitespace-nowrap text-right text-[13.5px] font-semibold tnum", r.cost === "—" && "text-ink-3", col("cost"))} title={r.cost === "—" ? "Coût d'achat inconnu" : undefined}>
                  {r.cost}
                </td>
                <td className={cn(td, "whitespace-nowrap text-right text-[13.5px] font-bold tnum", col("price"))}>{r.price}</td>
                <td className={cn(td, "whitespace-nowrap text-right text-[13.5px] font-bold tnum", TONE_TEXT[r.margin.tone], col("margin"))} title={r.margin.title}>
                  {r.margin.text}
                </td>
                <td className={cn(td, "max-w-[150px] truncate whitespace-nowrap pl-4 text-[13px] font-semibold", r.channel.muted ? "text-ink-3" : "text-foreground", col("channel"))} title={r.channel.text}>
                  {r.channel.text}
                </td>
                <td className={cn(td, "whitespace-nowrap pl-3 pr-3", col("level"))} title={r.level.title}>
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: LEVEL_DOT[r.level.tone] }} />
                    <span className={cn("text-[13px] font-bold", LEVEL_TEXT[r.level.tone])}>{r.level.label}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer}

      {chosen.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div role="toolbar" aria-label="Actions groupées" className="ms-fade pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl border border-night-stroke bg-night py-2 pl-4 pr-2 shadow-[0_12px_32px_rgba(10,20,32,.35)]">
            <span className="mr-2 whitespace-nowrap text-sm font-bold text-on-night">
              {chosen.length} sélectionnée{chosen.length > 1 ? "s" : ""}
            </span>
            {writable ? (
              <button type="button" onClick={() => setAdjustOpen(true)} className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-mint px-3 text-[13.5px] font-extrabold text-night hover:bg-mint-pressed">
                <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
                Ajuster le stock
              </button>
            ) : null}
            <a href={exportHref} download className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-night-raised px-3 text-[13.5px] font-bold text-on-night hover:bg-night-hover">
              <Download aria-hidden="true" className="h-4 w-4" />
              Exporter
            </a>
            {single ? (
              <Link href={`/sourcing?q=${encodeURIComponent(single.productName)}` as never} className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-night-raised px-3 text-[13.5px] font-bold text-on-night hover:bg-night-hover">
                <ScanSearch aria-hidden="true" className="h-4 w-4" />
                Chercher des offres
              </Link>
            ) : null}
            <button type="button" onClick={() => setSelected(new Set())} aria-label="Désélectionner (Échap)" title="Désélectionner (Échap)" className="flex h-10 w-10 items-center justify-center rounded-[10px] text-on-night-muted hover:bg-night-raised hover:text-on-night">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
      {writable && targets.length > 0 ? <AdjustDialog open={adjustOpen} onClose={() => setAdjustOpen(false)} targets={targets} onDone={() => setSelected(new Set())} /> : null}
    </div>
  );
}
