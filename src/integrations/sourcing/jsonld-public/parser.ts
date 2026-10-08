/**
 * jsonld-public — parser : réutilise le parser générique schema.org (JSON-LD Product /
 * Offer / AggregateOffer / ItemList) du crawler. Pur, testé sur fixtures HTML.
 */
import type { RawOffer } from "@/domain/sourcing/types";
import { jsonLdParser, parseJsonLdProducts } from "@/services/sourcing/crawler/parsers/jsonld-parser";

export { jsonLdParser };

export function parseJsonLdPage(html: string, pageUrl: string): RawOffer[] {
  return parseJsonLdProducts(html, pageUrl);
}
