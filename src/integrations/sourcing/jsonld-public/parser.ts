/**
 * jsonld-public — parser : réutilise le parser générique schema.org (JSON-LD Product /
 * Offer / AggregateOffer / ItemList) du crawler. Pur, testé sur fixtures HTML.
 */
import type { RawOffer } from "@/domain/sourcing/types";
import { jsonLdParser, parseJsonLdProducts, parseProductMetaTags } from "@/services/sourcing/crawler/parsers/jsonld-parser";

export { jsonLdParser };

export function parseJsonLdPage(html: string, pageUrl: string): RawOffer[] {
  return parseJsonLdProducts(html, pageUrl);
}

/** Fiche produit : JSON-LD d'abord, sinon balises produit standard (Open Graph / microdonnées). */
export function parseProductPage(html: string, pageUrl: string): RawOffer[] {
  const ld = parseJsonLdProducts(html, pageUrl);
  return ld.length > 0 ? ld : parseProductMetaTags(html, pageUrl);
}
