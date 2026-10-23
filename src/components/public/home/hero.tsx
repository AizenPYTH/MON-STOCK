import { ArrowRight } from "lucide-react";
import { Accent } from "@/components/marketing/serif-accent";
import { BarcodeField, barcodeFieldCenter } from "@/components/marketing/barcode-field";
import { CtaLink } from "@/components/marketing/cta-link";
import { HeroStage } from "@/components/public/home/hero-stage";

/**
 * Champ du hero (handoff v2 §C.2) : 96 barres, barres 58–62 menthe (eBay), 24 et 81 ambre à 55 %,
 * 460 px (300 en mobile), croissance depuis l'indice 60. L'enveloppe garde le champ bas sous la
 * colonne du lead (aucune barre ne traverse le texte) et le laisse monter à droite.
 */
const FIELD = {
  n: 96,
  seed: 20261,
  litRange: [58, 62] as [number, number],
  amber: [24, 81],
  envelope: [0.12, 0.11, 0.13, 0.11, 0.12, 0.1, 0.13, 0.17, 0.34, 0.37, 0.62, 0.9, 1, 0.78],
};

const ENTER = (ms: number) => ({ animationDelay: `${ms}ms` });

/** Hero (nuit) : titre pleine largeur, lead + CTA alignés en bas, dock, fenêtre produit rognée par le pli. */
export function Hero() {
  const dockCenter = barcodeFieldCenter(FIELD, 58, 62);
  return (
    <section aria-labelledby="hero-titre" className="relative overflow-hidden bg-night text-on-night">
      <div className="relative z-10 mx-auto w-full max-w-[1432px] px-[18px] pt-[96px] min-[760px]:px-8 min-[760px]:pt-[104px] min-[1100px]:px-14 min-[1100px]:pt-[100px]">
        <div className="mk-fade-in flex flex-wrap items-center justify-between gap-x-6 gap-y-2" style={ENTER(0)}>
          <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-on-night-muted">Stock multicanal · téléphones et pièces détachées</p>
          <p className="hidden items-center gap-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-on-night-muted min-[760px]:flex">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-mint" />
            <span className="text-mint">eBay disponible</span>
            <span aria-hidden="true">·</span>
            <span className="text-amber">Amazon prochainement</span>
          </p>
        </div>

        <h1 id="hero-titre" className="mt-4 text-[56px] font-extrabold leading-[0.94] tracking-[-0.05em] text-on-night min-[760px]:mt-5 min-[760px]:text-[min(148px,9.8vw)]">
          <span className="mk-rise block" style={ENTER(100)}>
            Un seul stock.
          </span>{" "}
          <span className="mk-rise block" style={ENTER(240)}>
            Tous vos <Accent className="text-mint">canaux.</Accent>
          </span>
        </h1>

        <div className="mt-7 flex flex-col gap-6 min-[1100px]:mt-8 min-[1100px]:flex-row min-[1100px]:items-end min-[1100px]:justify-between">
          <p className="mk-rise max-w-[520px] text-[17px] font-medium leading-[1.55] text-[#B4BECB] min-[760px]:text-[19px]" style={ENTER(500)}>
            Vos références, vos quantités et vos ventes eBay au même endroit. Chaque vente est déduite du stock une seule fois.
          </p>
          <div className="mk-rise flex flex-col gap-2.5 min-[480px]:flex-row" style={ENTER(620)}>
            <CtaLink href="/signup">
              Créer un compte
              <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={2.4} />
            </CtaLink>
            <CtaLink href="#integrations" variant="glass">
              Voir les intégrations
            </CtaLink>
          </div>
        </div>
      </div>

      {/* Scène : champ de barres (fond), dock et fenêtre produit. Le bas de la fenêtre est rogné par la section. */}
      <div className="relative mt-20 -mb-[30px] min-[760px]:mt-12 min-[760px]:-mb-[150px] min-[1100px]:mt-6">
        <div className="absolute inset-x-0 bottom-[calc(100%-74px)] z-0">
          <BarcodeField {...FIELD} height={460} mobileHeight={300} parallax growFrom={60} className="min-[760px]:max-[1099px]:!h-[220px]" />
        </div>
        <HeroStage dockCenter={dockCenter} />
      </div>
    </section>
  );
}
