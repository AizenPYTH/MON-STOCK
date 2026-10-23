import type { Metadata } from "next";
import { RevealObserver } from "@/components/marketing/reveal-observer";
import { Hero } from "@/components/public/home/hero";

export const metadata: Metadata = {
  title: { absolute: "MON STOCK — un seul stock pour tous vos canaux" },
  description: "Pour les revendeurs de téléphones et de pièces détachées : un seul stock, vos ventes eBay déduites une seule fois. eBay disponible ; Amazon, Shopify et WooCommerce prochainement.",
};

export default function HomePage() {
  return (
    <div data-theme="light" className="bg-paper-marketing text-night">
      <RevealObserver />
      <Hero />
      <div className="h-[1200px]" />
    </div>
  );
}
