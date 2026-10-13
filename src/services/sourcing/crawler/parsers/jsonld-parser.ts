/**
 * Parser générique schema.org : extrait les Product / Offer déclarés en JSON-LD
 * (<script type="application/ld+json">). C'est un format public et documenté,
 * destiné précisément à être lu par des programmes.
 */
import { z } from "zod";
import type { RawOffer, StockStatus, TaxType } from "@/domain/sourcing/types";
import { toNumber, toStockStatus } from "@/services/sourcing/feed-parsers";
import type { SourceParser } from "@/services/sourcing/crawler/parsers/types";

const SCRIPT_RE = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const offerSchema = z
  .object({
    "@type": z.union([z.string(), z.array(z.string())]).optional(),
    price: z.union([z.string(), z.number()]).optional(),
    lowPrice: z.union([z.string(), z.number()]).optional(),
    priceCurrency: z.string().optional(),
    availability: z.string().optional(),
    url: z.string().optional(),
    itemCondition: z.string().optional(),
    sku: z.string().optional(),
    inventoryLevel: z.union([z.object({ value: z.union([z.string(), z.number()]).optional() }), z.string(), z.number()]).optional(),
    eligibleQuantity: z.object({ minValue: z.union([z.string(), z.number()]).optional() }).optional(),
    priceSpecification: z
      .union([
        z.object({ price: z.union([z.string(), z.number()]).optional(), priceCurrency: z.string().optional(), valueAddedTaxIncluded: z.boolean().optional() }),
        z.array(z.object({ price: z.union([z.string(), z.number()]).optional(), priceCurrency: z.string().optional(), valueAddedTaxIncluded: z.boolean().optional() })),
      ])
      .optional(),
    areaServed: z.unknown().optional(),
  })
  .passthrough();

const productSchema = z
  .object({
    "@type": z.union([z.string(), z.array(z.string())]).optional(),
    name: z.string().optional(),
    sku: z.union([z.string(), z.number()]).optional(),
    productID: z.union([z.string(), z.number()]).optional(),
    gtin13: z.union([z.string(), z.number()]).optional(),
    gtin: z.union([z.string(), z.number()]).optional(),
    gtin12: z.union([z.string(), z.number()]).optional(),
    gtin14: z.union([z.string(), z.number()]).optional(),
    gtin8: z.union([z.string(), z.number()]).optional(),
    mpn: z.union([z.string(), z.number()]).optional(),
    brand: z.union([z.string(), z.object({ name: z.string().optional() }).passthrough()]).optional(),
    color: z.string().optional(),
    url: z.string().optional(),
    itemCondition: z.string().optional(),
    offers: z.union([offerSchema, z.array(offerSchema)]).optional(),
  })
  .passthrough();

type ProductNode = z.infer<typeof productSchema>;
type OfferNode = z.infer<typeof offerSchema>;

function typeIncludes(t: string | string[] | undefined, wanted: string): boolean {
  if (!t) return false;
  const list = Array.isArray(t) ? t : [t];
  return list.some((x) => x.toLowerCase().endsWith(wanted.toLowerCase()));
}

function collectNodes(node: unknown, out: unknown[], depth = 0): void {
  if (depth > 8 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) collectNodes(n, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  out.push(obj);
  for (const key of ["@graph", "itemListElement", "mainEntity", "item", "hasVariant", "isVariantOf"]) {
    if (obj[key] !== undefined) collectNodes(obj[key], out, depth + 1);
  }
}

export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  for (const m of html.matchAll(SCRIPT_RE)) {
    const raw = (m[1] ?? "").trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // bloc invalide : ignoré, jamais interprété autrement
    }
  }
  return blocks;
}

function conditionFrom(itemCondition: string | undefined): string | null {
  if (!itemCondition) return null;
  const c = itemCondition.toLowerCase();
  if (c.includes("new")) return "new";
  if (c.includes("refurbished")) return "refurbished";
  if (c.includes("used")) return "used";
  return null;
}

function resolveUrl(url: string | undefined, base: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

function offersOf(p: ProductNode): OfferNode[] {
  if (!p.offers) return [];
  const list = Array.isArray(p.offers) ? p.offers : [p.offers];
  const out: OfferNode[] = [];
  for (const o of list) {
    const nested = (o as Record<string, unknown>).offers;
    if (nested && typeIncludes(o["@type"], "AggregateOffer")) {
      const inner = Array.isArray(nested) ? nested : [nested];
      for (const n of inner) {
        const parsed = offerSchema.safeParse(n);
        if (parsed.success) out.push(parsed.data);
      }
    } else out.push(o);
  }
  return out;
}

export function parseJsonLdProducts(html: string, pageUrl: string): RawOffer[] {
  const nodes: unknown[] = [];
  for (const block of extractJsonLdBlocks(html)) collectNodes(block, nodes);
  const products = nodes.map((n) => productSchema.safeParse(n)).filter((r) => r.success).map((r) => r.data).filter((p) => typeIncludes(p["@type"], "Product") && p.name);

  const offers: RawOffer[] = [];
  const seen = new Set<string>();
  for (const p of products) {
    const gtin = [p.gtin13, p.gtin, p.gtin14, p.gtin12, p.gtin8].map((g) => (g === undefined ? null : String(g).replace(/\D/g, ""))).find((g) => g && g.length >= 8) ?? null;
    const brand = typeof p.brand === "string" ? p.brand : p.brand?.name ?? null;
    const productOffers = offersOf(p);
    const sku = p.sku !== undefined ? String(p.sku) : p.productID !== undefined ? String(p.productID) : null;
    const productUrl = resolveUrl(p.url, pageUrl);
    if (productOffers.length === 0) continue;
    productOffers.forEach((o, index) => {
      const spec = Array.isArray(o.priceSpecification) ? o.priceSpecification[0] : o.priceSpecification;
      const price = toNumber(o.price ?? o.lowPrice ?? spec?.price);
      const currency = (o.priceCurrency ?? spec?.priceCurrency ?? null)?.toUpperCase() ?? null;
      const url = resolveUrl(o.url, pageUrl) ?? productUrl ?? pageUrl;
      const offerSku = o.sku ?? sku;
      const id = offerSku ?? gtin ?? url;
      const externalOfferId = productOffers.length > 1 && !o.sku ? `${id}#${index}` : id;
      if (seen.has(externalOfferId)) return;
      seen.add(externalOfferId);
      const inv = o.inventoryLevel;
      const qty = inv === undefined ? null : typeof inv === "object" ? toNumber(inv.value) : toNumber(inv);
      const stockStatus: StockStatus = o.availability ? toStockStatus(o.availability.replace(/^https?:\/\/schema\.org\//i, "")) : "unknown";
      const taxType: TaxType = spec?.valueAddedTaxIncluded === true ? "ttc" : spec?.valueAddedTaxIncluded === false ? "ht" : "unknown";
      offers.push({
        externalOfferId,
        externalProductId: sku,
        title: p.name!,
        price,
        currency,
        taxType,
        moq: toNumber(o.eligibleQuantity?.minValue) ? Math.round(toNumber(o.eligibleQuantity?.minValue)!) : null,
        availableQuantity: qty !== null && qty >= 0 ? Math.round(qty) : null,
        stockStatus,
        url,
        ean: gtin,
        mpn: p.mpn !== undefined ? String(p.mpn) : null,
        brand,
        color: p.color ?? null,
        condition: conditionFrom(o.itemCondition ?? p.itemCondition),
        supplierSku: offerSku,
        raw: { product: { name: p.name, sku, gtin, brand }, offer: { price: o.price ?? o.lowPrice, currency, availability: o.availability } },
      });
    });
  }
  return offers;
}

export const jsonLdParser: SourceParser = {
  key: "jsonld",
  label: "Générique schema.org (JSON-LD)",
  description: "Lit les blocs JSON-LD Product/Offer déclarés par la page (nom, SKU, GTIN, MPN, marque, prix, devise, disponibilité, état, URL). Si la page n'en déclare pas, aucune offre n'est extraite.",
  parse: parseJsonLdProducts,
};

// ---------------------------------------------------------------------------------------------
// Repli « fiche produit » : balises Open Graph produit et microdonnées schema.org
// ---------------------------------------------------------------------------------------------

function metaContent(html: string, names: string[]): string | null {
  for (const n of names) {
    const esc = n.replace(/[.*+?^${}()|[\]\\:]/g, "\\$&");
    const a = new RegExp(`<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["']${esc}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, "i").exec(html);
    if (a?.[1]) return a[1];
    const b = new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name|itemprop)\\s*=\\s*["']${esc}["']`, "i").exec(html);
    if (b?.[1]) return b[1];
  }
  return null;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();
}

/**
 * Fiche produit sans JSON-LD : prix lu dans les balises standard publiées pour les moteurs
 * (`product:price:amount` / `og:price:amount`, ou microdonnée `itemprop="price"`). Prudence :
 * rien n'est renvoyé si la page contient plusieurs prix en microdonnées (page de liste) ou si
 * le titre ou le prix manquent. Au plus une offre par page.
 */
export function parseProductMetaTags(html: string, pageUrl: string): RawOffer[] {
  const head = html.slice(0, 600_000);
  const ogPrice = metaContent(head, ["product:price:amount", "og:price:amount"]);
  const itempropPrices = [...head.matchAll(/<[^>]*itemprop\s*=\s*["']price["'][^>]*>/gi)].map((m) => /content\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1]).filter((x): x is string => Boolean(x));
  const distinctItemprop = [...new Set(itempropPrices)];
  const rawPrice = ogPrice ?? (distinctItemprop.length === 1 ? distinctItemprop[0]! : null);
  const price = toNumber(rawPrice);
  if (price === null || price <= 0) return [];
  const currency = (metaContent(head, ["product:price:currency", "og:price:currency"]) ?? /<[^>]*itemprop\s*=\s*["']priceCurrency["'][^>]*>/i.exec(head)?.[0].match(/content\s*=\s*["']([A-Za-z]{3})["']/i)?.[1] ?? null)?.toUpperCase() ?? null;
  const titleRaw = metaContent(head, ["og:title"]) ?? /<title[^>]*>([^<]{3,300})<\/title>/i.exec(head)?.[1] ?? null;
  if (!titleRaw) return [];
  const availability = metaContent(head, ["product:availability", "og:availability"]) ?? /itemprop\s*=\s*["']availability["'][^>]*(?:href|content)\s*=\s*["']([^"']+)["']/i.exec(head)?.[1] ?? null;
  const stockStatus: StockStatus = availability ? toStockStatus(availability.replace(/^https?:\/\/schema\.org\//i, "")) : "unknown";
  const ean = (metaContent(head, ["product:ean", "product:gtin", "gtin13"]) ?? "").replace(/\D/g, "") || null;
  const sku = metaContent(head, ["product:retailer_item_id", "sku"]);
  const canonical = /<link[^>]+rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["']/i.exec(head)?.[1];
  const url = resolveUrl(canonical, pageUrl) ?? pageUrl;
  return [
    {
      externalOfferId: sku ?? ean ?? url,
      externalProductId: sku,
      title: decodeEntities(titleRaw).slice(0, 500),
      price,
      currency,
      taxType: "unknown",
      availableQuantity: null,
      stockStatus,
      url,
      ean: ean && ean.length >= 8 ? ean : null,
      supplierSku: sku,
      raw: { source: "meta_tags", price: rawPrice, currency, availability },
    },
  ];
}
