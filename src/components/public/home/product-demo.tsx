"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import { Boxes, ChartColumn, Search, ShoppingBag, Sun, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/public/wordmark";
import { ExampleTag } from "@/components/marketing/example-tag";
import { AFTER, BEFORE, SALE, euro0 } from "@/components/public/home/sale-data";
import { useCountUp, useSaleSequence } from "@/components/public/home/use-sale-sequence";

const EASE = "cubic-bezier(.22,1,.36,1)";

type Level = "out" | "low" | "ok";
type Row = { id: string; name: string; sku: string; qty: number; cover: string; level: Level; sales30: number; price: string; bar: number; sale?: boolean };

/** 7 références d'EXEMPLE (sur 48) ; `bar` = indice de leur barre dans le code-barres. */
const ROWS: Row[] = [
  { id: "r1", name: "Écran iPhone 14 OLED", sku: "ECR-IP14-OLED", qty: 0, cover: "rupture", level: "out", sales30: 9, price: "89,00 €", bar: 1 },
  { id: "r2", name: SALE.title, sku: SALE.sku, qty: BEFORE.stock, cover: BEFORE.cover, level: "low", sales30: BEFORE.sales30, price: SALE.price, bar: 47, sale: true },
  { id: "r3", name: "Batterie iPhone 12", sku: "BAT-IP12", qty: 18, cover: "≈ 64 j", level: "ok", sales30: 8, price: "24,90 €", bar: 20 },
  { id: "r4", name: "Coque MagSafe iPhone 15", sku: "CQ-IP15-MS", qty: 9, cover: "≈ 21 j", level: "ok", sales30: 13, price: "14,90 €", bar: 27 },
  { id: "r5", name: "Écran iPhone 12 OLED", sku: "ECR-IP12-OLED", qty: 1, cover: "≈ 4 j", level: "low", sales30: 7, price: "64,00 €", bar: 9 },
  { id: "r6", name: "iPhone 12 64 Go Blanc · Grade B", sku: "IP12-64-BL-B", qty: 0, cover: "rupture", level: "out", sales30: 4, price: "309,00 €", bar: 6 },
  { id: "r7", name: "Câble USB-C vers Lightning 1 m", sku: "CBL-USBC-L1", qty: 42, cover: "≈ 90 j", level: "ok", sales30: 14, price: "9,90 €", bar: 35 },
];

/** 48 barres : 3 ruptures, 5 stocks faibles (dont l'iPhone 13, dernière barre). */
const BARS = Array.from({ length: 48 }, (_, i) => {
  const out = i === 1 || i === 6 || i === 11;
  const low = i === 3 || i === 9 || i === 15 || i === 22 || i === 47;
  const base = ((i * 37) % 23) / 23;
  return { w: i === 47 ? 2.4 : Math.round((base * base * 2.4 + 0.6) * 10) / 10, level: (out ? "out" : low ? "low" : "ok") as Level };
});

const ORDERS = [
  { id: "#E-10479", title: "Écran iPhone 12 OLED", price: "64,00 €", status: "À expédier", tone: "neutral" },
  { id: "#E-10476", title: "Batterie iPhone 12", price: "24,90 €", status: "Expédiée", tone: "ok" },
  { id: "#E-10471", title: "Coque MagSafe iPhone 15", price: "14,90 €", status: "Expédiée", tone: "ok" },
] as const;

const FILTERS = [
  { key: "all", label: "Tous" },
  { key: "out", label: "Ruptures" },
  { key: "low", label: "Faibles" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const levelText: Record<Level, string> = { out: "text-[#B03A3A]", low: "text-[#8A5A12]", ok: "text-[#5B6676]" };
const levelDot: Record<Level, string> = { out: "bg-[#DC5A5A]", low: "bg-[#E5A34D]", ok: "bg-[#1E7F57]" };

function Swap({ on, a, b }: { on: boolean; a: React.ReactNode; b: React.ReactNode }) {
  return (
    <span className="relative inline-grid">
      <span className="col-start-1 row-start-1 transition-opacity duration-500" style={{ opacity: on ? 0 : 1 }} aria-hidden={on}>
        {a}
      </span>
      <span className="col-start-1 row-start-1 transition-opacity duration-500" style={{ opacity: on ? 1 : 0 }} aria-hidden={!on}>
        {b}
      </span>
    </span>
  );
}

/**
 * Démo produit (handoff v2 §C.7, §C0 « Démo produit ») : même moteur de vente que le hero, état
 * indépendant, sans boucle. Onglets Stock / Ventes, filtres Tous / Ruptures / Faibles (les barres non
 * concernées passent à .14 d'opacité), sélection d'une ligne → fiche SKU latérale (≥ 760 px).
 * Aucune API n'est appelée : tout est illustratif (EXEMPLE).
 */
export function ProductDemo() {
  const uid = useId();
  const [tab, setTab] = useState<"stock" | "sales">("stock");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState("r2");
  const caRef = useRef<HTMLSpanElement>(null);
  const { step: s, run, play, playing, done } = useSaleSequence({ auto: false });
  useCountUp(caRef, { from: BEFORE.revenue, to: AFTER.revenue, active: s >= 4, format: euro0 });

  const sold = s >= 3;
  const rows = ROWS.filter((r) => filter === "all" || r.level === filter);
  const sel = ROWS.find((r) => r.id === selected) ?? ROWS[1]!;
  const label = done ? "Rejouer la vente" : playing ? "Vente en cours…" : "Simuler une vente eBay";
  const tabId = (t: string) => `${uid}-tab-${t}`;
  const panelId = (t: string) => `${uid}-panel-${t}`;

  const tabs = (
    <div role="tablist" aria-label="Vues de la démo" className="flex gap-1 min-[760px]:flex-col">
      {(
        [
          { key: "stock", label: "Stock", icon: Boxes, count: "48" },
          { key: "sales", label: "Ventes", icon: ShoppingBag, count: s >= 1 ? "4" : "3" },
        ] as const
      ).map((t) => (
        <button
          key={t.key}
          id={tabId(t.key)}
          role="tab"
          type="button"
          aria-selected={tab === t.key}
          aria-controls={panelId(t.key)}
          tabIndex={tab === t.key ? 0 : -1}
          onClick={() => setTab(t.key)}
          onKeyDown={(e) => {
            if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) {
              e.preventDefault();
              const next = tab === "stock" ? "sales" : "stock";
              setTab(next);
              document.getElementById(tabId(next))?.focus();
            }
          }}
          className={cn("flex h-11 flex-1 items-center gap-2.5 rounded-[10px] px-3 text-[13.5px] font-bold transition-colors min-[760px]:h-10 min-[760px]:flex-none", tab === t.key ? "bg-on-night/10 text-on-night" : "text-on-night-muted hover:text-on-night")}
        >
          <t.icon aria-hidden="true" className="h-[15px] w-[15px]" strokeWidth={1.6} />
          {t.label}
          <span className="ml-auto font-mono text-[10.5px] text-on-night-subtle">{t.count}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-on-night/12 bg-night-deep text-on-night shadow-[0_50px_100px_-40px_rgba(0,0,0,.8)] min-[760px]:rounded-[24px]">
      {/* Barre de fenêtre. */}
      <div className="flex h-[52px] items-center gap-3 border-b border-on-night/8 bg-night px-3.5 min-[760px]:h-[46px]">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-on-night/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-on-night/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-on-night/15" />
        </span>
        <span className="hidden truncate font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] text-on-night-subtle min-[560px]:inline">Démo interactive · données d&apos;exemple</span>
        <button type="button" onClick={play} className="ml-auto inline-flex h-11 shrink-0 items-center rounded-[10px] bg-mint px-3.5 text-[13px] font-extrabold text-night transition-colors hover:bg-mint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint min-[760px]:h-9">
          {label}
        </button>
      </div>

      <div className="flex flex-col min-[760px]:flex-row">
        {/* Sidebar (≥ 760) ; en mobile : onglets en haut. */}
        <aside className="shrink-0 border-b border-on-night/8 bg-night p-2 min-[760px]:w-[206px] min-[760px]:border-b-0 min-[760px]:border-r min-[760px]:px-3 min-[760px]:py-4">
          <span aria-hidden="true" className="hidden px-2 pb-4 min-[760px]:block">
            <Wordmark />
          </span>
          {tabs}
          <ul aria-hidden="true" className="mt-1 hidden flex-col gap-0.5 min-[760px]:flex">
            {[
              { icon: Sun, label: "Aujourd'hui" },
              { icon: Search, label: "Sourcing" },
              { icon: Truck, label: "Fournisseurs" },
              { icon: ChartColumn, label: "Analyse" },
            ].map((n) => (
              <li key={n.label} className="flex h-10 items-center gap-2.5 rounded-[10px] px-3 text-[13.5px] font-semibold text-on-night-subtle">
                <n.icon className="h-[15px] w-[15px]" strokeWidth={1.6} />
                {n.label}
              </li>
            ))}
          </ul>
        </aside>

        <div className="relative min-w-0 flex-1">
          {/* Scène : chiffre, filtres, code-barres ; CA du jour (mis à jour par la vente). */}
          <div className="bg-night px-4 pb-5 pt-4 min-[760px]:px-6">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div>
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-on-night-muted">
                  Stock <ExampleTag surface="night" />
                </span>
                <p className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-[44px] font-light leading-none tracking-[-0.04em] tabular-nums min-[760px]:text-[56px]">48</span>
                  <span className="text-[14px] font-semibold text-on-night-muted">références · 3 ruptures · 5 faibles</span>
                </p>
              </div>
              <div className="text-right">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-on-night-muted">CA du jour</span>
                <p className="mt-1.5 flex items-baseline justify-end gap-2">
                  <span className={cn("text-[13px] font-extrabold text-mint transition-opacity duration-500", s >= 4 ? "opacity-100" : "opacity-0")}>+479&nbsp;€</span>
                  <span ref={caRef} className="text-[26px] font-light leading-none tracking-[-0.03em] tabular-nums min-[760px]:text-[30px]">
                    {euro0(BEFORE.revenue)}
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer le stock">
              {FILTERS.map((f) => (
                <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={cn("inline-flex h-11 items-center rounded-full border px-3.5 text-[13px] font-bold transition-colors min-[760px]:h-8", filter === f.key ? "border-on-night bg-on-night text-night" : "border-on-night/20 text-on-night-muted hover:text-on-night")}>
                  {f.label}
                </button>
              ))}
            </div>
            <div aria-hidden="true" className="mt-4 flex h-[46px] items-end gap-[2px]">
              {BARS.map((b, i) => {
                const lit = filter === "all" || b.level === filter;
                return <span key={i} className={cn("block h-full rounded-[1px] transition-opacity duration-[400ms]", b.level === "out" ? "bg-red" : b.level === "low" ? "bg-amber" : "bg-on-night/45", i === 47 && sold && "bg-amber")} style={{ flex: `${b.w} 1 0`, opacity: lit ? 1 : 0.14, transitionTimingFunction: EASE }} />;
              })}
            </div>
          </div>

          {/* Papier. */}
          <div className="relative -mt-px rounded-t-[20px] bg-[#F2F4F7] p-3 text-night min-[760px]:p-4">
            <div id={panelId("stock")} role="tabpanel" aria-labelledby={tabId("stock")} hidden={tab !== "stock"} className="grid gap-3 min-[1000px]:grid-cols-[minmax(0,1fr)_280px]">
              <div className="overflow-hidden rounded-[16px] border border-[#E6EAF0] bg-white">
                <div className="grid grid-cols-[minmax(0,1fr)_44px_76px] gap-x-3 border-b border-[#EEF1F5] px-3.5 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#778292] min-[760px]:grid-cols-[minmax(0,1fr)_44px_80px_70px_78px]">
                  <span>Référence</span>
                  <span className="text-right">Qté</span>
                  <span>Couverture</span>
                  <span className="hidden text-right min-[760px]:block">Ventes 30 j</span>
                  <span className="hidden text-right min-[760px]:block">Prix</span>
                </div>
                <ul aria-label="Références (exemple)">
                  {rows.map((r) => {
                    const isSel = r.id === selected;
                    const rs = !!r.sale && sold;
                    return (
                      <li key={r.id} className="border-b border-[#EEF1F5] last:border-b-0">
                        <button type="button" aria-pressed={isSel} onClick={() => setSelected(r.id)} className={cn("relative grid min-h-12 w-full grid-cols-[minmax(0,1fr)_44px_76px] items-center gap-x-3 px-3.5 py-2 text-left transition-colors min-[760px]:grid-cols-[minmax(0,1fr)_44px_80px_70px_78px]", isSel ? "bg-[#E8EBF0]" : "hover:bg-[#F7F8FA]")}>
                          {isSel ? <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-night" /> : null}
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-bold">{r.name}</span>
                            <span className="block truncate font-mono text-[10px] text-[#778292]">{r.sku}</span>
                          </span>
                          <span className="flex items-center justify-end gap-1 text-[14px] font-extrabold tabular-nums">
                            {r.sale ? <span className={cn("rounded-[5px] bg-night px-1 font-mono text-[9.5px] font-semibold text-mint transition-opacity duration-300", rs ? "opacity-100" : "opacity-0")}>−1</span> : null}
                            {r.sale ? <Swap on={rs} a={r.qty} b={AFTER.stock} /> : r.qty}
                          </span>
                          <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-bold", levelText[r.level])}>
                            <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", levelDot[r.level])} />
                            {r.sale ? <Swap on={rs} a={r.cover} b={AFTER.cover} /> : r.cover}
                          </span>
                          <span className="hidden text-right text-[13px] font-semibold tabular-nums text-[#3E4A5B] min-[760px]:block">{r.sale ? <Swap on={rs} a={r.sales30} b={AFTER.sales30} /> : r.sales30}</span>
                          <span className="hidden text-right text-[13px] font-bold tabular-nums min-[760px]:block">{r.price}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="border-t border-[#EEF1F5] px-3.5 py-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#778292]">
                  {rows.length} sur 48 références · exemple
                </p>
              </div>

              {/* Fiche SKU latérale (≥ 760). */}
              <aside aria-label={`Fiche SKU ${sel.sku}`} className="hidden rounded-[16px] border border-[#E6EAF0] bg-white p-4 min-[760px]:block">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5B6676]">Fiche SKU</span>
                <p className="mt-1.5 text-[15px] font-extrabold leading-5">{sel.name}</p>
                <p className="font-mono text-[10.5px] text-[#778292]">{sel.sku}</p>
                <dl className="mt-3 grid grid-cols-3 gap-2 border-y border-[#EEF1F5] py-3">
                  <div>
                    <dt className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#778292]">Stock</dt>
                    <dd className="text-[22px] font-light leading-7 tabular-nums">{sel.sale ? <Swap on={sold} a={sel.qty} b={AFTER.stock} /> : sel.qty}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#778292]">Couverture</dt>
                    <dd className={cn("text-[13px] font-bold leading-7", levelText[sel.level])}>{sel.sale ? <Swap on={sold} a={sel.cover} b={AFTER.cover} /> : sel.cover}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#778292]">Prix</dt>
                    <dd className="text-[13px] font-bold leading-7 tabular-nums">{sel.price}</dd>
                  </div>
                </dl>
                <p className="mt-3 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#5B6676]">Mouvements</p>
                <ul className="relative mt-1.5 h-[108px] overflow-hidden text-[12.5px] font-semibold">
                  {sel.sale ? (
                    <li className="absolute inset-x-0 top-0 flex h-9 items-center justify-between gap-2 transition-[opacity,transform] duration-500" style={{ opacity: s >= 2 ? 1 : 0, transform: s >= 2 ? "none" : "translateY(-8px)" }}>
                      <span className="truncate">Vente eBay {SALE.order} · à l&apos;instant</span>
                      <span className="font-mono text-[11px] font-semibold text-[#8A5A12]">−1</span>
                    </li>
                  ) : null}
                  {[
                    { l: "Inventaire · lun.", d: "+1" },
                    { l: "Réception · 28/03", d: "+3" },
                  ].map((m, i) => (
                    <li key={m.l} className="absolute inset-x-0 flex h-9 items-center justify-between gap-2 text-[#3E4A5B] transition-transform duration-500" style={{ top: 36 * (i + 1), transform: sel.sale && s >= 2 ? "none" : "translateY(-36px)" }}>
                      <span className="truncate">{m.l}</span>
                      <span className="font-mono text-[11px] text-[#1E7F57]">{m.d}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 flex items-center gap-2 border-t border-[#EEF1F5] pt-3 text-[12.5px] font-semibold text-[#3E4A5B]">
                  <span className="rounded-[5px] border border-[#E6EAF0] px-1.5 py-0.5 text-[10.5px] font-bold text-night">eBay</span>
                  Annonce reliée
                </p>
              </aside>
            </div>

            <div id={panelId("sales")} role="tabpanel" aria-labelledby={tabId("sales")} hidden={tab !== "sales"} className="rounded-[16px] border border-[#E6EAF0] bg-white p-3 min-[760px]:p-4">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5B6676]">Commandes eBay · exemple</span>
              <ul className="mt-3 flex flex-col gap-2">
                {s >= 1 ? (
                  <li className="mk-pop relative overflow-hidden rounded-[12px] px-3.5 py-3">
                    <span aria-hidden="true" className="absolute inset-0 rounded-[12px] border border-[#F0DDBB] bg-[#FBF1E2] transition-opacity duration-500" style={{ opacity: s >= 2 ? 0 : 1 }} />
                    <span aria-hidden="true" className="absolute inset-0 rounded-[12px] border border-[#8BE8BE] bg-[#E3F8EE] transition-opacity duration-500" style={{ opacity: s >= 2 ? 1 : 0 }} />
                    <span className="relative flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold">{SALE.order}</span>
                      {s >= 2 ? <span className="rounded-[5px] bg-[#1E7F57] px-1.5 py-0.5 text-[10.5px] font-bold text-white">Importée · stock −1</span> : <span className="rounded-[5px] bg-[#E5A34D] px-1.5 py-0.5 text-[10.5px] font-bold text-night">Nouvelle</span>}
                    </span>
                    <span className="relative mt-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13.5px] font-bold">{SALE.title}</span>
                      <span className="shrink-0 text-[13.5px] font-extrabold tabular-nums">{SALE.price}</span>
                    </span>
                  </li>
                ) : null}
                {ORDERS.map((o) => (
                  <li key={o.id} className="rounded-[12px] border border-[#E6EAF0] px-3.5 py-3">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold">{o.id}</span>
                      <span className={cn("rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-bold", o.tone === "ok" ? "bg-[#E3F8EE] text-[#1E7F57]" : "bg-[#EEF1F5] text-[#3E4A5B]")}>{o.status}</span>
                    </span>
                    <span className="mt-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13.5px] font-bold">{o.title}</span>
                      <span className="shrink-0 text-[13.5px] font-extrabold tabular-nums">{o.price}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Notification dans la fenêtre. */}
          <div aria-hidden="true" className="pointer-events-none absolute right-3 top-3 z-10 w-[300px] max-w-[calc(100%-24px)]">
            <div className="relative overflow-hidden rounded-[14px] bg-white px-3.5 py-3 text-night shadow-[0_24px_50px_-12px_rgba(0,0,0,.6)] transition-[opacity,transform] duration-700" style={{ opacity: s >= 5 ? 1 : 0, transform: s >= 5 ? "none" : "translateY(-16px) scale(.96)", transitionTimingFunction: EASE }}>
              <span className="block truncate text-[13px] font-extrabold">Nouvelle commande eBay · {SALE.price}</span>
              <span className="block truncate text-[12px] font-semibold text-[#5B6676]">
                {SALE.short} · stock {BEFORE.stock} → {AFTER.stock}
              </span>
              <span className="absolute inset-x-0 bottom-0 block h-[2px] bg-[#E6EAF0]">{s >= 5 ? <span key={run} className="block h-full origin-left bg-mint" style={{ animation: "mk-timebar 3.6s linear both" } as CSSProperties} /> : null}</span>
            </div>
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {done ? `Vente d'exemple simulée : commande ${SALE.order}, ${SALE.title}, ${SALE.price}. Stock ${BEFORE.stock} → ${AFTER.stock}.` : ""}
      </p>
    </div>
  );
}
