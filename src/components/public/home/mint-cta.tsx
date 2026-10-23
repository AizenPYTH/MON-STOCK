import { ArrowRight } from "lucide-react";
import { Accent } from "@/components/marketing/serif-accent";
import { BarcodeField } from "@/components/marketing/barcode-field";
import { CtaLink } from "@/components/marketing/cta-link";

/**
 * CTA final (handoff v2 §C.9, `MintCTA`) : menthe pleine #8BE8BE, texte encre, 132 px (84 tablette,
 * 50 mobile), 72 barres encre en pied (240 / 170), CTA encre + contour.
 */
export function MintCta() {
  return (
    <section aria-labelledby="cta-titre" className="relative overflow-hidden bg-mint text-night">
      <div className="relative z-10 mx-auto w-full max-w-[1352px] px-[18px] pb-[210px] pt-20 min-[760px]:px-8 min-[760px]:pb-[290px] min-[760px]:pt-28 min-[1100px]:px-14 min-[1100px]:pt-36">
        <h2 id="cta-titre" data-r="" className="max-w-[1180px] text-[50px] font-extrabold leading-[0.96] tracking-[-0.05em] min-[760px]:text-[84px] min-[1100px]:text-[132px]">
          Commencez avec <Accent>eBay.</Accent> Gardez la place pour la suite.
        </h2>
        <div data-r="" style={{ "--d": "120ms" } as React.CSSProperties} className="mt-10 flex flex-col gap-2.5 min-[480px]:flex-row">
          <CtaLink href="/signup" variant="ink">
            Créer un compte
            <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={2.4} />
          </CtaLink>
          <CtaLink href="/login" variant="outline">
            Se connecter
          </CtaLink>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0">
        <BarcodeField n={72} seed={7240} height={240} mobileHeight={170} tone="ink" growFrom={36} />
      </div>
    </section>
  );
}
