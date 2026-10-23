"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Bell, Boxes, ChartColumn, ChevronDown, Plus, Search, ShoppingBag, Sun, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/public/wordmark";
import { ChannelStatus } from "@/components/marketing/channel-status";
import { ExampleTag } from "@/components/marketing/example-tag";
import { clamp01, prefersReducedMotion, subscribeScroll, watchMedia, REDUCED_MOTION_QUERY } from "@/components/marketing/motion";
import { AFTER, BEFORE, DAYS, DAY_MAX, SALE, STOCK_LINES, euro0 } from "@/components/public/home/sale-data";
import { useCountUp, useSaleSequence } from "@/components/public/home/use-sale-sequence";

const EASE = "cubic-bezier(.22,1,.36,1)";

/** Bande code-barres du stock dans la fenêtre : 48 barres d'exemple + la barre « iPhone 13 » en dernier. */
const STRIP = Array.from({ length: 48 }, (_, i) => {
  const out = i === 1 || i === 6 || i === 11;
  const low = i === 3 || i === 9 || i === 15 || i === 22 || i === 30;
  const base = ((i * 37) % 23) / 23;
  return { w: Math.round((base * base * 2.4 + 0.6) * 10) / 10, level: out ? "out" : low ? "low" : "ok" };
});

const NAV = [
  { icon: Sun, label: "Aujourd'hui", active: true },
  { icon: Boxes, label: "Stock", count: "48" },
  { icon: ShoppingBag, label: "Ventes", badge: true },
  { icon: Search, label: "Sourcing" },
  { icon: Truck, label: "Fournisseurs" },
  { icon: ChartColumn, label: "Analyse" },
] as const;

function T({ show, children, className, delay = 0, ms = 500 }: { show: boolean; children: React.ReactNode; className?: string; delay?: number; ms?: number }) {
  return (
    <span className={cn("transition-[opacity,transform]", show ? "opacity-100" : "pointer-events-none opacity-0", className)} style={{ transitionDuration: `${ms}ms`, transitionTimingFunction: EASE, transitionDelay: show ? `${delay}ms` : "0ms" }}>
      {children}
    </span>
  );
}

/** Deux valeurs superposées : fondu de l'une à l'autre (pas de changement de mise en page). */
function Swap({ on, a, b, className }: { on: boolean; a: React.ReactNode; b: React.ReactNode; className?: string }) {
  return (
    <span className={cn("relative inline-grid", className)}>
      <span className="col-start-1 row-start-1 transition-opacity duration-500" style={{ opacity: on ? 0 : 1 }}>
        {a}
      </span>
      <span className="col-start-1 row-start-1 transition-opacity duration-500" style={{ opacity: on ? 1 : 0 }} aria-hidden={!on}>
        {b}
      </span>
    </span>
  );
}

/**
 * Hero vivant (handoff v2 §C0) : dock des canaux + fenêtre produit « Aujourd'hui » + notification +
 * alerte, pilotés par la séquence de vente d'exemple. Inclinaison au survol (souris), transformation
 * au défilement (écouteur unique), entrée CSS. Tout est illustratif (« APERÇU ILLUSTRATIF »).
 */
export function HeroStage({ dockCenter }: { dockCenter: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const caRef = useRef<HTMLSpanElement>(null);
  const { step, run, play, playing, done } = useSaleSequence({ auto: true, targetRef: rootRef });
  const s = step;

  useCountUp(caRef, { from: BEFORE.revenue, to: AFTER.revenue, active: s >= 4, format: euro0 });

  // Transformation au défilement (0 → 0,9 × hauteur d'écran), via l'écouteur unique.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let off: (() => void) | null = null;
    const on = () => {
      if (off) return;
      off = subscribeScroll(({ y, vh }) => {
        const p = clamp01(y / (0.9 * vh));
        el.style.transform = p === 0 ? "" : `perspective(2000px) translateY(${(-46 * p).toFixed(2)}px) rotateX(${(9 * p).toFixed(3)}deg) scale(${(1 - 0.06 * p).toFixed(4)})`;
      });
    };
    const unwatch = watchMedia(REDUCED_MOTION_QUERY, (reduce) => {
      if (reduce) {
        off?.();
        off = null;
        el.style.transform = "";
      } else on();
    });
    return () => {
      unwatch();
      off?.();
    };
  }, []);

  // Inclinaison au survol : souris uniquement, jamais sous « réduire les animations ».
  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const el = tiltRef.current;
    if (!el || e.pointerType !== "mouse" || prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1600px) rotateY(${(x * 10).toFixed(2)}deg) rotateX(${(-y * 8).toFixed(2)}deg)`;
    el.dataset.hover = "1";
  }, []);
  const onPointerLeave = useCallback(() => {
    const el = tiltRef.current;
    if (!el) return;
    el.style.transform = "";
    delete el.dataset.hover;
  }, []);

  const buttonLabel = done ? "↻ Rejouer" : playing ? "● Vente en cours" : "▶ Simuler une vente";
  const dayPct = s >= 4 ? AFTER.dayPct : BEFORE.dayPct;

  return (
    <div ref={rootRef} className="relative">
      {/* Dock des canaux : posé sur le bord de la fenêtre ; la puce eBay est reliée par un trait de 34 px. */}
      <div className="mk-fade-in relative z-20 h-[74px]" style={{ animationDelay: "900ms", animationDuration: "1000ms" }}>
        <ul aria-label="Canaux" className="absolute bottom-[34px] left-[var(--dock-l-m)] flex items-end gap-2 min-[1100px]:left-[var(--dock-l)]" style={{ "--dock-l-m": `clamp(18px, calc(${dockCenter}% - 75px), calc(100% - 18px - 152px))`, "--dock-l": `clamp(56px, calc(${dockCenter}% - 75px), calc(100% - 56px - 540px))` } as CSSProperties}>
          <li className="relative">
            <span className="flex h-11 items-center gap-2.5 rounded-[12px] border border-mint bg-night pl-3.5 pr-2 shadow-[0_0_0_4px_rgba(139,232,190,.08)]">
              <span className="text-[15px] font-extrabold tracking-[-0.01em] text-on-night">eBay</span>
              <ChannelStatus state="available" size="sm" />
            </span>
            {/* Trait vers la fenêtre + point qui descend à l'étape 1 (masqué sous « réduire les animations »). */}
            <span aria-hidden="true" className="absolute left-[30px] top-full block h-[34px] w-[2px] bg-mint/70">
              {s >= 1 ? <span key={run} className="mk-loop-hide absolute -left-[3px] top-0 block h-2 w-2 rounded-full bg-mint shadow-[0_0_10px_rgba(139,232,190,.9)]" style={{ animation: `mk-dock-dot 900ms ${EASE} both`, "--mk-dot-travel": "30px" } as CSSProperties} /> : null}
            </span>
          </li>
          {["Amazon", "Shopify", "WooCommerce"].map((n) => (
            <li key={n} className="hidden min-[1100px]:block">
              <span className="flex h-11 min-w-[112px] flex-col justify-center gap-[3px] rounded-[12px] border border-dashed border-on-night/25 px-3">
                <span className="text-[13px] font-bold leading-none text-on-night/80">{n}</span>
                <span className="font-mono text-[8.5px] font-semibold uppercase leading-none tracking-[0.08em] text-amber">Prochainement</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Fenêtre produit : entrée (CSS) → transformation au défilement (ref) → inclinaison (ref). */}
      <div className="relative z-10 min-[760px]:px-8 min-[1100px]:px-14">
      <div className="relative ml-[-4%] w-[108%] min-[760px]:mx-auto min-[760px]:w-auto min-[760px]:max-w-[1240px]" style={{ animation: `mk-window-in 1400ms ${EASE} 1000ms both` }}>
        <div ref={scrollRef} className="origin-top">
          <div ref={tiltRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onClick={play} className="group relative cursor-pointer transition-transform duration-[600ms] ease-[cubic-bezier(.22,1,.36,1)]">
            {/* Panneaux fantômes (profondeur). */}
            <span aria-hidden="true" className="absolute inset-x-[3%] -top-[14px] h-10 rounded-[22px] border border-on-night/8 bg-night-raised/50" />
            <span aria-hidden="true" className="absolute inset-x-[6%] -top-[27px] h-10 rounded-[22px] border border-on-night/6 bg-night-raised/25" />

            <figure aria-label="Aperçu illustratif de MON STOCK : une vente eBay d'exemple met à jour le stock et le chiffre du jour." className="relative overflow-hidden rounded-[22px] border border-on-night/12 bg-night-deep shadow-[0_50px_100px_-40px_rgba(0,0,0,.8),0_-30px_120px_-30px_rgba(139,232,190,.18)] min-[760px]:rounded-[24px]">
              {/* Barre de fenêtre (42 px). */}
              <div className="flex h-[42px] items-center gap-3 border-b border-on-night/8 bg-night px-3.5">
                <span aria-hidden="true" className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-on-night/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-on-night/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-on-night/15" />
                </span>
                <span className="truncate font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] text-on-night-subtle">
                  Aperçu illustratif<span className="hidden min-[480px]:inline"> · vente d&apos;exemple</span>
                </span>
                <span aria-hidden="true" className="ml-auto hidden font-mono text-[9.5px] uppercase tracking-[0.08em] text-on-night-subtle opacity-0 transition-opacity duration-300 min-[760px]:inline group-data-[hover]:opacity-100 [@media(hover:none)]:hidden">
                  Cliquer pour rejouer la vente
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    play();
                  }}
                  className="ml-auto inline-flex h-8 shrink-0 items-center rounded-[9px] bg-mint px-3 text-[12.5px] font-extrabold text-night transition-colors hover:bg-mint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint min-[760px]:ml-0 pointer-coarse:h-11"
                >
                  {buttonLabel}
                </button>
              </div>

              <div aria-hidden="true" className="flex">
                {/* Sidebar 206 px (≥ 760). */}
                <aside className="hidden w-[206px] shrink-0 flex-col border-r border-on-night/8 bg-night px-3 pb-4 pt-4 min-[760px]:flex">
                  <span className="px-2">
                    <Wordmark />
                  </span>
                  <span className="mt-4 flex h-10 items-center gap-2 rounded-[10px] bg-on-night/6 px-2.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-mint text-[10px] font-extrabold text-night">MB</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-on-night">Ma Boutique Reconditionnée</span>
                    <ChevronDown className="h-3.5 w-3.5 text-on-night-muted" strokeWidth={2} />
                  </span>
                  <ul className="mt-4 flex flex-col gap-0.5">
                    {NAV.map((n) => (
                      <li key={n.label} className={cn("flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] font-semibold", "active" in n ? "bg-on-night/8 text-on-night" : "text-on-night-muted")}>
                        <n.icon className="h-[15px] w-[15px]" strokeWidth={1.6} />
                        {n.label}
                        {"count" in n ? <span className="ml-auto font-mono text-[10.5px] text-on-night-subtle">{n.count}</span> : null}
                        {"badge" in n ? (
                          <span className="relative ml-auto inline-grid">
                            <span className="col-start-1 row-start-1 rounded-[6px] bg-on-night/10 px-1.5 py-0.5 text-[10.5px] font-bold text-on-night transition-opacity duration-500" style={{ opacity: s >= 4 ? 0 : 1 }}>
                              {BEFORE.toShip} à expédier
                            </span>
                            <span className="col-start-1 row-start-1 rounded-[6px] bg-amber px-1.5 py-0.5 text-[10.5px] font-bold text-night transition-opacity duration-500" style={{ opacity: s >= 4 ? 1 : 0 }}>
                              {AFTER.toShip} à expédier
                            </span>
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto rounded-[10px] border border-on-night/8 px-2.5 py-2.5">
                    <span className="flex items-center gap-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-mint">
                      <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                      eBay · synchronisé
                    </span>
                    <span className="mt-1.5 flex items-baseline justify-between gap-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-on-night-subtle">
                      Dernière synchro
                      <Swap on={s >= 2} a={<span className="normal-case tracking-normal text-on-night-muted">il y a 4 min</span>} b={<span className="normal-case tracking-normal text-mint">à l&apos;instant</span>} />
                    </span>
                  </div>
                </aside>

                <div className="min-w-0 flex-1">
                  {/* Barre du haut 54 px (≥ 760). */}
                  <div className="hidden h-[54px] items-center gap-2.5 border-b border-on-night/8 bg-night px-4 min-[760px]:flex">
                    <span className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-on-night/6 px-3 text-[12.5px] font-medium text-on-night-subtle min-[1100px]:max-w-[360px]">
                      <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                      <span className="truncate">Rechercher un produit, un SKU…</span>
                      <span className="ml-auto rounded-[5px] border border-on-night/12 px-1.5 py-px font-mono text-[10px]">⌘K</span>
                    </span>
                    <span className="relative ml-auto flex h-9 w-9 items-center justify-center rounded-[10px] text-on-night-muted">
                      <Bell className="h-4 w-4" strokeWidth={1.7} />
                      <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-mint ring-2 ring-night transition-[opacity,transform] duration-500" style={{ opacity: s >= 5 ? 1 : 0, transform: s >= 5 ? "scale(1)" : "scale(.4)" }} />
                    </span>
                    <span className="hidden h-9 items-center gap-1.5 rounded-[10px] bg-on-night/8 px-3 text-[12.5px] font-bold text-on-night min-[1000px]:flex">
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                      Ajouter
                    </span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-night-raised text-[11px] font-bold text-on-night">AL</span>
                  </div>

                  {/* Scène : CA du jour, 14 jours, ventes / à expédier / marge. */}
                  <div className="relative bg-night px-4 pb-5 pt-4 min-[760px]:px-6 min-[760px]:pb-6 min-[760px]:pt-5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-on-night-muted">Aujourd&apos;hui · chiffre d&apos;affaires</span>
                      <ExampleTag surface="night" />
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-6">
                      <div className="flex items-baseline gap-3">
                        <span ref={caRef} className="text-[52px] font-light leading-none tracking-[-0.04em] text-on-night tabular-nums min-[760px]:text-[76px]">
                          {euro0(BEFORE.revenue)}
                        </span>
                        <T show={s >= 4} className="inline-block text-[15px] font-extrabold text-mint min-[760px]:text-[18px]" ms={600}>
                          +479&nbsp;€
                        </T>
                      </div>
                      {/* 14 jours ; le 14ᵉ en contour menthe (49 % → 65 %). */}
                      <span className="hidden h-[64px] items-end gap-[5px] min-[560px]:flex">
                        {DAYS.map((d, i) => (
                          <span key={i} className="block w-[9px] rounded-[2px] bg-on-night/16" style={{ height: `${(d / DAY_MAX) * 100}%` }} />
                        ))}
                        <span className="relative block h-full w-[9px]">
                          <span className="absolute bottom-0 left-0 right-0 rounded-[2px] border-[1.5px] border-mint bg-mint/15 transition-transform duration-700" style={{ height: `${AFTER.dayPct}%`, transformOrigin: "bottom", transform: `scaleY(${dayPct / AFTER.dayPct})`, transitionTimingFunction: EASE }} />
                        </span>
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-on-night/8 pt-3.5 min-[760px]:max-w-[520px]">
                      {[
                        { k: "Ventes", a: String(BEFORE.sales), b: String(AFTER.sales) },
                        { k: "À expédier", a: String(BEFORE.toShip), b: String(AFTER.toShip), amber: true },
                        { k: "Marge estimée", a: BEFORE.margin, b: AFTER.margin },
                      ].map((m) => (
                        <div key={m.k} className="min-w-0">
                          <dt className="truncate font-mono text-[9.5px] uppercase tracking-[0.08em] text-on-night-subtle">{m.k}</dt>
                          <dd className="mt-1 text-[19px] font-bold leading-none text-on-night tabular-nums min-[760px]:text-[22px]">
                            <Swap on={s >= 4} a={m.a} b={<span className={m.amber ? "text-amber" : undefined}>{m.b}</span>} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  {/* Mobile : la notification se place sous la scène (emplacement réservé). */}
                  <div className="bg-night px-3 pb-3 min-[760px]:hidden">
                    <Notification show={s >= 5} run={run} />
                  </div>

                  {/* Papier (rayon 20). */}
                  <div className="relative -mt-px rounded-t-[20px] bg-[#F2F4F7] p-3 min-[760px]:p-4">
                    <div className="grid gap-3 min-[1000px]:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
                      <StockCard s={s} run={run} />
                      <div className="flex flex-col gap-3">
                        <OrdersCard s={s} />
                        <ActivityCard s={s} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notification flottante (≥ 760), en haut à droite. */}
              <div aria-hidden="true" className="pointer-events-none absolute right-3 top-[50px] z-10 hidden w-[330px] max-w-[45%] min-[760px]:block">
                <Notification show={s >= 5} run={run} />
              </div>
            </figure>

            {/* Alerte « Stock faible » : déborde à gauche (≥ 1360 : −26 px ; sinon 14 px), top 395. */}
            <div aria-hidden="true" className="pointer-events-none absolute left-[14px] top-[395px] z-10 hidden min-[760px]:block min-[1360px]:-left-[26px]">
              <div className="w-[236px] rounded-[14px] border border-amber/70 bg-night px-3.5 py-3 shadow-[0_24px_50px_-12px_rgba(0,0,0,.6)] transition-[opacity,transform] duration-700" style={{ opacity: s >= 5 ? 1 : 0, transform: s >= 5 ? "none" : "translateY(-16px) scale(.96)", transitionDelay: s >= 5 ? "250ms" : "0ms", transitionTimingFunction: EASE }}>
                <span className="flex items-center gap-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-amber">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber" />
                  Stock faible · {AFTER.cover}
                </span>
                <span className="mt-1.5 block text-[13px] font-bold leading-[17px] text-on-night">{SALE.title}</span>
                <span className="mt-0.5 block text-[12px] font-medium text-on-night-muted">{AFTER.stock} en stock · {AFTER.sales30} ventes sur 30 j</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {done ? `Vente d'exemple : commande eBay ${SALE.order}, ${SALE.title}, ${SALE.price}. Stock ${BEFORE.stock} → ${AFTER.stock}, chiffre du jour ${euro0(AFTER.revenue)}.` : ""}
      </p>
    </div>
  );
}

function Notification({ show, run }: { show: boolean; run: number }) {
  return (
    <div className="relative overflow-hidden rounded-[14px] bg-white px-3.5 pb-3 pt-3 shadow-[0_24px_50px_-12px_rgba(0,0,0,.6)] transition-[opacity,transform] duration-700" style={{ opacity: show ? 1 : 0, transform: show ? "none" : "translateY(-16px) scale(.96)", transitionTimingFunction: EASE }}>
      <span className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#101C2C] text-[10px] font-extrabold text-[#8BE8BE]">eB</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-extrabold text-[#101C2C]">
            Nouvelle commande eBay · {SALE.price}
          </span>
          <span className="block truncate text-[12px] font-semibold text-[#5B6676]">
            {SALE.short} · stock {BEFORE.stock} → {AFTER.stock}
          </span>
        </span>
        <span className="font-mono text-[9.5px] text-[#5B6676]">{SALE.time}</span>
      </span>
      <span className="absolute inset-x-0 bottom-0 block h-[2px] bg-[#E6EAF0]">
        {show ? <span key={run} className="block h-full origin-left bg-[#8BE8BE]" style={{ animation: "mk-timebar 3.6s linear both" }} /> : null}
      </span>
    </div>
  );
}

/** Colonnes de la liste de stock (grille : les colonnes masquées n'occupent pas de piste). */
const STOCK_GRID = "grid grid-cols-[minmax(0,1fr)_44px_62px_68px] min-[560px]:grid-cols-[minmax(0,1fr)_44px_62px_46px_68px] min-[1280px]:grid-cols-[minmax(0,1fr)_44px_60px_62px_46px_68px] items-center gap-x-2";

function StockCard({ s, run }: { s: number; run: number }) {
  return (
    <div className="rounded-[16px] border border-[#E6EAF0] bg-white p-3 min-[760px]:p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5B6676]">Stock · 48 réf.<span className="hidden min-[480px]:inline"> · une barre par référence</span></span>
        <ExampleTag />
      </div>
      {/* Bande code-barres : la dernière barre (iPhone 13) s'élargit et flashe menthe puis ambre. */}
      <div className="mt-2.5 flex h-[34px] items-end gap-[2px]">
        {STRIP.map((b, i) => (
          <span key={i} className={cn("block h-full rounded-[1px]", b.level === "out" ? "bg-[#DC5A5A]" : b.level === "low" ? "bg-[#E5A34D]" : "bg-[#101C2C]/80")} style={{ flex: `${b.w} 1 0` }} />
        ))}
        <span className="relative block h-full" style={{ flex: "3.6 1 0" }}>
          <span className="absolute inset-y-0 left-0 block w-full origin-left overflow-hidden rounded-[1px] transition-transform duration-700" style={{ transform: s >= 3 ? "none" : "scaleX(.333)", transitionTimingFunction: EASE }}>
            <span className="absolute inset-0 bg-[#E5A34D]" />
            {s >= 3 ? <span key={run} className="absolute inset-0 bg-[#8BE8BE]" style={{ animation: "mk-flash 1200ms ease-out both" }} /> : null}
          </span>
        </span>
      </div>

      <div className="mt-3">
        <div className={cn(STOCK_GRID, "pb-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[#778292]")}>
          <span>Référence</span>
          <span className="text-right">Qté</span>
          <span className="hidden min-[1280px]:block">Ventes 14 j</span>
          <span>Couv.</span>
          <span className="hidden min-[560px]:block">Canal</span>
          <span className="text-right">Prix</span>
        </div>
        {STOCK_LINES.map((l) => {
          const sold = !!l.sale && s >= 3;
          return (
            <div key={l.sku} className={cn(STOCK_GRID, "relative border-t border-[#EEF1F5] py-2")}>
              {l.sale ? (
                <span className="pointer-events-none absolute -inset-x-1.5 inset-y-[2px] rounded-[8px]">
                  <span className="absolute inset-0 rounded-[8px] bg-[#FBF1E2] transition-opacity duration-700" style={{ opacity: sold ? 1 : 0 }} />
                  {sold ? <span key={run} className="absolute inset-0 rounded-[8px] bg-[#DDF3E8]" style={{ animation: "mk-flash 1200ms ease-out both" }} /> : null}
                </span>
              ) : null}
              <span className="relative min-w-0">
                <span className="block truncate text-[12.5px] font-bold text-[#101C2C]">{l.name}</span>
                <span className="block truncate font-mono text-[9.5px] text-[#778292]">{l.sku}</span>
              </span>
              <span className="relative flex items-center justify-end gap-1">
                {l.sale ? (
                  <T show={sold} className="inline-block rounded-[5px] bg-[#101C2C] px-1 py-px font-mono text-[9.5px] font-semibold text-[#8BE8BE]" ms={400}>
                    −1
                  </T>
                ) : null}
                <span className="text-[14px] font-extrabold tabular-nums text-[#101C2C]">{l.sale ? <Swap on={sold} a={l.qty} b={AFTER.stock} /> : l.qty}</span>
              </span>
              <span className="relative hidden h-[16px] items-end gap-[2px] min-[1280px]:flex">
                {l.sales14.map((v, i) => (
                  <span key={i} className={cn("block w-[3px] rounded-[1px]", v ? "bg-[#101C2C]/55" : "bg-[#D5DBE4]")} style={{ height: `${Math.max(14, v * 33)}%` }} />
                ))}
              </span>
              <span className={cn("relative inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-bold", l.tone === "out" ? "text-[#B03A3A]" : l.tone === "low" ? "text-[#8A5A12]" : "text-[#5B6676]")}>
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", l.tone === "out" ? "bg-[#DC5A5A]" : l.tone === "low" ? "bg-[#E5A34D]" : "bg-[#1E7F57]")} />
                {l.sale ? <Swap on={sold} a={l.cover} b={AFTER.cover} /> : l.cover}
              </span>
              <span className="relative hidden min-[560px]:block">
                <span className="rounded-[5px] border border-[#E6EAF0] px-1.5 py-0.5 text-[10.5px] font-bold text-[#101C2C]">eBay</span>
              </span>
              <span className="relative text-right text-[12.5px] font-bold tabular-nums text-[#101C2C]">{l.price}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-right font-mono text-[9px] uppercase tracking-[0.08em] text-[#778292]">
        Ventes 30 j · iPhone 13 : <Swap on={s >= 3} a={BEFORE.sales30} b={AFTER.sales30} />
      </p>
    </div>
  );
}

function OrdersCard({ s }: { s: number }) {
  return (
    <div className="rounded-[16px] border border-[#E6EAF0] bg-white p-3 min-[760px]:p-4">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5B6676]">Commandes eBay</span>
      {/* Deux emplacements : la commande existante glisse vers le bas quand la nouvelle se déplie. */}
      <div className="relative mt-2.5 h-[148px] overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[70px] origin-top transition-[opacity,transform] duration-700" style={{ opacity: s >= 1 ? 1 : 0, transform: s >= 1 ? "none" : "scaleY(.4) translateY(-12px)", transitionTimingFunction: EASE }}>
          <span className="absolute inset-0 rounded-[12px] border border-[#F0DDBB] bg-[#FBF1E2] transition-opacity duration-500" style={{ opacity: s >= 2 ? 0 : 1 }} />
          <span className="absolute inset-0 rounded-[12px] border border-[#8BE8BE] bg-[#E3F8EE] transition-opacity duration-500" style={{ opacity: s >= 2 ? 1 : 0 }} />
          <span className="relative block px-3 py-2.5">
            <span className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold text-[#101C2C]">{SALE.order}</span>
              <Swap
                on={s >= 2}
                a={<span className="rounded-[5px] bg-[#E5A34D] px-1.5 py-0.5 text-[10px] font-bold text-[#101C2C]">Nouvelle</span>}
                b={<span className="whitespace-nowrap rounded-[5px] bg-[#1E7F57] px-1.5 py-0.5 text-[10px] font-bold text-white">Importée · stock −1</span>}
                className="justify-items-end"
              />
            </span>
            <span className="mt-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-[12.5px] font-bold text-[#101C2C]">{SALE.title}</span>
              <span className="shrink-0 text-[12.5px] font-extrabold tabular-nums text-[#101C2C]">{SALE.price}</span>
            </span>
          </span>
        </div>
        <div className="absolute inset-x-0 top-[78px] h-[70px] rounded-[12px] border border-[#E6EAF0] px-3 py-2.5 transition-transform duration-700" style={{ transform: s >= 1 ? "none" : "translateY(-78px)", transitionTimingFunction: EASE }}>
          <span className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] font-semibold text-[#101C2C]">#E-10479</span>
            <span className="rounded-[5px] bg-[#EEF1F5] px-1.5 py-0.5 text-[10px] font-bold text-[#3E4A5B]">À expédier</span>
          </span>
          <span className="mt-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-[12.5px] font-bold text-[#101C2C]">Écran iPhone 12 OLED</span>
            <span className="shrink-0 text-[12.5px] font-extrabold tabular-nums text-[#101C2C]">64,00&nbsp;€</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function ActivityCard({ s }: { s: number }) {
  return (
    <div className="hidden rounded-[16px] border border-[#E6EAF0] bg-white p-3 min-[760px]:block min-[760px]:p-4">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5B6676]">Activité</span>
      <ul className="relative mt-2 h-[78px] overflow-hidden text-[12px] font-semibold text-[#3E4A5B]">
        <li className="absolute inset-x-0 top-0 flex h-[26px] items-center gap-2 transition-[opacity,transform] duration-500" style={{ opacity: s >= 2 ? 1 : 0, transform: s >= 2 ? "none" : "translateY(-8px)" }}>
          <span className="font-mono text-[10px] text-[#778292]">{SALE.time}</span>
          <span className="truncate">
            Vente eBay · <span className="font-mono text-[10.5px]">{SALE.sku}</span>
          </span>
          <span className="ml-auto font-mono text-[10.5px] font-semibold text-[#8A5A12]">−1</span>
        </li>
        {[
          { t: "10:31", l: "Synchro eBay · 3 annonces à jour", d: "" },
          { t: "09:58", l: "Réception · BAT-IP12", d: "+20" },
        ].map((a, i) => (
          <li key={a.t} className="absolute inset-x-0 flex h-[26px] items-center gap-2 transition-transform duration-500" style={{ top: 26 * (i + 1), transform: s >= 2 ? "none" : "translateY(-26px)" }}>
            <span className="font-mono text-[10px] text-[#778292]">{a.t}</span>
            <span className="truncate">{a.l}</span>
            {a.d ? <span className="ml-auto font-mono text-[10.5px] font-semibold text-[#1E7F57]">{a.d}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
