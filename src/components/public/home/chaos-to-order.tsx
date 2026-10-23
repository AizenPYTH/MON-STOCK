import { ArrowRight } from "lucide-react";
import { Accent } from "@/components/marketing/serif-accent";
import { ExampleTag } from "@/components/marketing/example-tag";
import { SALE } from "@/components/public/home/sale-data";

/**
 * Avant / après (handoff v2 §C.4, `ChaosToOrderScene`) : trois quantités contradictoires (annonce eBay
 * 4, tableur 3, carnet « 5 ? ») convergent vers la fiche SKU (2). ≥ 1000 px et mouvement autorisé :
 * piste 300 vh, contenu collant 100 vh, piloté par <ScrollScenes> (data-*). Sinon : version statique
 * (3 cartes → fiche). Toutes les valeurs sont des EXEMPLES.
 */

const CARD = "w-[300px] max-w-full rounded-[18px] border border-paper-marketing-line bg-white p-5";

function ListingCard() {
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5B6676]">Annonce eBay</span>
        <ExampleTag />
      </div>
      <p className="mt-3 text-[15px] font-bold leading-5 text-night">{SALE.title}</p>
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-paper-marketing-rule pt-3">
        <span className="text-[12.5px] font-semibold text-[#5B6676]">Quantité disponible</span>
        <span className="text-[44px] font-light leading-none tracking-[-0.04em] text-night tabular-nums">4</span>
      </div>
      <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#778292]">Modifiée à la main il y a 3 j</p>
    </div>
  );
}

function SheetCard() {
  const rows = [
    ["IP13-128-NR-A", "3", "02/04"],
    ["IP13-128-BL-B", "1", "28/03"],
    ["BAT-IP12", "18", "02/04"],
  ];
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5B6676]">Tableur · stock.xlsx</span>
        <ExampleTag />
      </div>
      <div className="mt-3 overflow-hidden rounded-[10px] border border-paper-marketing-line font-mono text-[11px]">
        <div className="grid grid-cols-[1fr_44px_56px] bg-paper-marketing text-[9.5px] uppercase tracking-[0.06em] text-[#5B6676]">
          <span className="border-r border-paper-marketing-line px-2 py-1.5">SKU</span>
          <span className="border-r border-paper-marketing-line px-2 py-1.5">Qté</span>
          <span className="px-2 py-1.5">Màj</span>
        </div>
        {rows.map((r, i) => (
          <div key={r[0]} className="grid grid-cols-[1fr_44px_56px] border-t border-paper-marketing-line text-night">
            <span className="truncate border-r border-paper-marketing-line px-2 py-1.5">{r[0]}</span>
            <span className={i === 0 ? "border-r border-paper-marketing-line bg-[#FBF1E2] px-2 py-1.5 text-[15px] font-semibold leading-[15px] text-[#8A5A12] outline-2 -outline-offset-2 outline-[#E5A34D]" : "border-r border-paper-marketing-line px-2 py-1.5"}>{r[1]}</span>
            <span className="px-2 py-1.5 text-[#5B6676]">{r[2]}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#778292]">Onglet « avril » · copie du 02/04</p>
    </div>
  );
}

function NotebookCard() {
  return (
    <div className={`${CARD} bg-[repeating-linear-gradient(180deg,#fff_0_27px,#EEEDE7_27px_28px)]`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5B6676]">Carnet de la boutique</span>
        <ExampleTag />
      </div>
      <p className="mt-4 font-serif text-[24px] italic leading-[28px] text-night">iPhone 13 noir 128 — grade A</p>
      <p className="mt-1 flex items-baseline gap-2 font-serif text-[24px] italic leading-[28px] text-night">
        reste <span className="text-[48px] leading-none">5&nbsp;?</span>
      </p>
      <p className="mt-2 font-serif text-[18px] italic leading-[28px] text-[#5B6676] line-through decoration-[#DC5A5A]">vendu 1 samedi</p>
    </div>
  );
}

function SkuFiche() {
  return (
    <div className="w-[340px] max-w-full rounded-[18px] bg-night p-6 text-on-night shadow-[0_50px_100px_-40px_rgba(16,28,44,.55)]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-on-night-muted">Fiche SKU · {SALE.sku}</span>
        <ExampleTag surface="night" />
      </div>
      <p className="mt-3 text-[16px] font-bold leading-5">{SALE.title}</p>
      <div className="mt-5 flex items-end gap-3 border-t border-on-night/10 pt-4">
        <span className="text-[76px] font-light leading-[0.8] tracking-[-0.05em] tabular-nums">2</span>
        <span className="pb-1 text-[14px] font-semibold text-on-night-muted">en stock, une seule fois</span>
      </div>
      <ul className="mt-5 flex flex-col gap-2 text-[13px] font-semibold">
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-mint" />
            Annonce eBay reliée
          </span>
          <span className="font-mono text-[11px] text-mint">quantité 2</span>
        </li>
        <li className="flex items-center justify-between gap-3 text-on-night-muted">
          <span>Dernier mouvement</span>
          <span className="font-mono text-[11px]">réception +3</span>
        </li>
      </ul>
    </div>
  );
}

export function ChaosToOrder() {
  const cards = [
    { node: <ListingCard />, x: -190, y: -150, rot: -6 },
    { node: <SheetCard />, x: 190, y: -120, rot: 5 },
    { node: <NotebookCard />, x: 40, y: 160, rot: -3 },
  ];
  return (
    <section aria-labelledby="avant-titre" className="bg-paper-marketing [overflow-x:clip]">
      <div data-scene="chaos" className="mk-chaos-track relative">
        <div className="mk-chaos-pin">
          <div className="mx-auto grid w-full max-w-[1352px] gap-10 px-[18px] py-12 min-[760px]:px-8 min-[760px]:py-16 min-[1000px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] min-[1000px]:items-center min-[1000px]:py-0 min-[1100px]:px-14">
            <div className="relative">
              <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#5B6676]">Avant · après</p>
              <div className="relative mt-4">
                <div data-chaos-a="">
                  <h2 id="avant-titre" className="text-[30px] font-extrabold leading-[1.04] tracking-[-0.04em] text-night min-[760px]:text-[40px]">
                    Quelle quantité est <Accent>juste&nbsp;?</Accent>
                  </h2>
                  <p className="mt-4 max-w-[440px] text-[16.5px] font-medium leading-[1.55] text-[#5B6676]">L&apos;annonce eBay dit 4, le tableur dit 3, le carnet hésite. Au moment de vendre, aucune source ne fait foi, et la survente arrive.</p>
                </div>
                <div data-chaos-b="" className="mk-chaos-b mt-10">
                  <h3 className="text-[30px] font-extrabold leading-[1.04] tracking-[-0.04em] text-night min-[760px]:text-[40px]">
                    Une référence. <Accent>Une quantité.</Accent>
                  </h3>
                  <p className="mt-4 max-w-[440px] text-[16.5px] font-medium leading-[1.55] text-[#5B6676]">Une fiche par SKU, déduite à chaque vente eBay importée. C&apos;est elle qui fait foi ; l&apos;annonce suit.</p>
                </div>
              </div>
              {/* Progression de la scène (version collante uniquement). */}
              <div aria-hidden="true" className="mk-chaos-sticky-only mt-12 h-[2px] w-[220px] overflow-hidden rounded-full bg-paper-marketing-rule-strong">
                <span data-chaos-bar="" className="block h-full origin-left bg-night [transform:scaleX(0)]" />
              </div>
            </div>

            <div data-chaos-stage="" className="mk-chaos-stage">
              {/* Collante : cartes superposées au centre. Statique : rangée de cartes, flèche, fiche. */}
              <div className="mk-chaos-cards">
                {cards.map((c, i) => (
                  <div key={i} data-chaos-card="" data-x={c.x} data-y={c.y} data-rot={c.rot} className="mk-chaos-card w-[300px] max-w-full">
                    {c.node}
                  </div>
                ))}
              </div>
              <div className="mk-chaos-static-only my-6 flex items-center justify-center gap-3 text-[#5B6676]">
                <span className="h-px w-10 bg-paper-marketing-rule-strong" />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.08em]">Après</span>
                <ArrowRight aria-hidden="true" className="h-4 w-4 rotate-90" />
                <span className="h-px w-10 bg-paper-marketing-rule-strong" />
              </div>
              <div data-chaos-fiche="" className="mk-chaos-fiche mx-auto flex w-fit max-w-full justify-center">
                <SkuFiche />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
