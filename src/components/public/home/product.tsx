import { Accent } from "@/components/marketing/serif-accent";
import { ProductDemo } from "@/components/public/home/product-demo";

/**
 * Le produit (handoff v2 §C.7) : nuit, fenêtre complète inclinée qui se redresse au défilement
 * (`perspective(2000px) rotateX(12°) scale(.95)` → `none`, piloté par <ScrollScenes>).
 */
export function Product() {
  return (
    <section id="produit" aria-labelledby="produit-titre" className="scroll-mt-20 overflow-hidden bg-night text-on-night">
      <div className="mx-auto w-full max-w-[1352px] px-[18px] py-20 min-[760px]:px-8 min-[760px]:py-28 min-[1100px]:px-14 min-[1100px]:py-36">
        <div className="grid gap-6 min-[1100px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] min-[1100px]:items-end">
          <div>
            <p data-r="" className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-on-night-muted">Le produit</p>
            <h2 id="produit-titre" data-r="" style={{ "--d": "80ms" } as React.CSSProperties} className="mt-4 text-[38px] font-extrabold leading-none tracking-[-0.045em] min-[760px]:text-[56px] min-[1100px]:text-[76px]">
              Une vente eBay, <Accent className="text-mint">de bout en bout.</Accent>
            </h2>
          </div>
          <p data-r="" style={{ "--d": "160ms" } as React.CSSProperties} className="max-w-[440px] text-[17px] font-medium leading-[1.55] text-[#B4BECB] min-[760px]:text-[19px]">
            Démo interactive aux données d&apos;exemple&nbsp;: filtrez le stock, ouvrez une fiche, simulez la vente. Rien n&apos;est envoyé nulle part.
          </p>
        </div>
        <div data-scene="tilt" className="mt-12 min-[760px]:mt-16">
          <div data-tilt-target="" className="origin-top" style={{ willChange: "transform" }}>
            <ProductDemo />
          </div>
        </div>
      </div>
    </section>
  );
}
