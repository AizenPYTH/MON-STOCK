import type { Metadata } from "next";
import { RevealObserver } from "@/components/marketing/reveal-observer";
import { Hero } from "@/components/public/home/hero";
import { Statement } from "@/components/public/home/statement";
import { ChaosToOrder } from "@/components/public/home/chaos-to-order";
import { Integrations } from "@/components/public/home/integrations";
import { Stories } from "@/components/public/home/stories";
import { Product } from "@/components/public/home/product";
import { StartSteps } from "@/components/public/home/start-steps";
import { MintCta } from "@/components/public/home/mint-cta";
import { ScrollScenes } from "@/components/public/home/scroll-scenes";

export const metadata: Metadata = {
  title: { absolute: "MON STOCK — un seul stock, tous vos canaux" },
  description: "Pour les revendeurs de téléphones et de pièces détachées : un seul stock, vos ventes eBay déduites une seule fois. eBay disponible ; Amazon, Shopify et WooCommerce prochainement.",
};

/**
 * Accueil public (docs/design/HANDOFF-v2-site-parcours.md, sections A–C, F, I) : sections statiques
 * rendues côté serveur ; seuls le hero vivant, la démo, le menu mobile et les contrôleurs de
 * mouvement (<ScrollScenes>, <RevealObserver>) sont des composants client. Palette marketing fixe
 * (`data-theme="light"`), indépendante du thème de l'application.
 */
export default function HomePage() {
  return (
    <div data-theme="light" className="bg-paper-marketing text-night">
      <RevealObserver />
      <ScrollScenes />
      <Hero />
      <Statement />
      <ChaosToOrder />
      <Integrations />
      <Stories />
      <Product />
      <StartSteps />
      <MintCta />
    </div>
  );
}
