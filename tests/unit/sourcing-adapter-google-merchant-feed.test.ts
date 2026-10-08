import { beforeEach, describe, expect, it } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { clearGmcFeedCache, googleMerchantFeedAdapter } from "@/integrations/sourcing/google-merchant-feed";
import { parseGmcFeed, parseGmcPrice } from "@/integrations/sourcing/google-merchant-feed/parser";
import { gmcAvailability } from "@/integrations/sourcing/google-merchant-feed/mapper";
import { fixture, mockFetch, runCtx, sourceConfig } from "./helpers/sourcing-adapters";

// Fixtures construites d'après la spécification publique du flux Google Merchant (RSS 2.0 / Atom / TSV).
// Non testé en conditions réelles depuis cet environnement (réseau sortant bloqué).
const config = sourceConfig({ baseUrl: "https://boutique.example", settings: { feed_url: "https://boutique.example/feeds/google.xml" }, defaultTaxType: "ttc", defaultCountry: "FR" });

describe("adaptateur google-merchant-feed", () => {
  beforeEach(() => clearGmcFeedCache());

  it("parse les prix « 229.00 EUR » / « 450,00 EUR » et la disponibilité", () => {
    expect(parseGmcPrice("229.00 EUR")).toEqual({ amount: 229, currency: "EUR" });
    expect(parseGmcPrice("450,00 EUR")).toEqual({ amount: 450, currency: "EUR" });
    expect(parseGmcPrice("1 234,56 EUR")).toEqual({ amount: 1234.56, currency: "EUR" });
    expect(parseGmcPrice("229")).toEqual({ amount: 229, currency: null });
    expect(parseGmcPrice("gratuit")).toBeNull();
    expect(gmcAvailability("in_stock")).toBe("in_stock");
    expect(gmcAvailability("preorder")).toBe("unknown");
    expect(gmcAvailability("limited_availability")).toBe("low");
  });

  it("parse un flux RSS 2.0 (espace de noms g:, champs mixtes, item sans titre ignoré)", () => {
    const items = parseGmcFeed(fixture("google-merchant-feed", "feed-rss.xml"), "xml");
    expect(items.length).toBe(2);
    expect(items[0]).toMatchObject({ id: "IP13-128-N-A", title: "Apple iPhone 13 128 Go Noir reconditionné", link: "https://boutique.example/p/iphone-13-128-noir", price: { amount: 249, currency: "EUR" }, salePrice: { amount: 229, currency: "EUR" }, availability: "in_stock", gtin: "0194252707012", mpn: "MLPF3ZD/A", brand: "Apple", condition: "refurbished", itemGroupId: "IP13-128", color: "Noir" });
    expect(items[0]?.shipping).toEqual([{ country: "FR", price: { amount: 4.99, currency: "EUR" } }]);
    expect(items[1]).toMatchObject({ id: "S23-256-N", title: "Samsung Galaxy S23 256 Go Noir", price: { amount: 450, currency: "EUR" }, availability: "out_of_stock", condition: "new" });
  });

  it("parse un flux Atom (lien en attribut href)", () => {
    const items = parseGmcFeed(fixture("google-merchant-feed", "feed-atom.xml"), "xml");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "ATOM-1", link: "https://boutique.example/p/iphone-13-256-bleu", gtin: "0194252707029", availability: "preorder" });
  });

  it("parse la variante TSV à en-tête (avec ou sans préfixe g:)", () => {
    const items = parseGmcFeed(fixture("google-merchant-feed", "feed.tsv"), "tsv");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "TSV-1", price: { amount: 229, currency: "EUR" }, availability: "in stock", gtin: "0194252707012", condition: "refurbished" });
    expect(items[0]?.shipping).toEqual([{ country: "FR", price: { amount: 4.99, currency: "EUR" } }]);
    const prefixed = parseGmcFeed(fixture("google-merchant-feed", "feed-prefixed.tsv"), "tsv");
    expect(prefixed[0]).toMatchObject({ id: "TSV-2", title: "Samsung Galaxy S23 256 Go", availability: "out of stock" });
  });

  it("search : lit le flux une fois, le met en cache, puis filtre par requête (prix promo appliqué, port, état)", async () => {
    const { fetchImpl, calls } = mockFetch([["/feeds/google.xml", { body: fixture("google-merchant-feed", "feed-rss.xml"), contentType: "application/xml" }]]);
    const ctx = runCtx({ fetchImpl });
    const r1 = await googleMerchantFeedAdapter.search(config, parseQuery("iphone 13 128gb"), "iphone 13 128gb", ctx);
    expect(r1.error).toBeNull();
    expect(r1.method).toBe("public_feed");
    expect(r1.offers.length).toBe(1);
    expect(r1.offers[0]).toMatchObject({ externalOfferId: "IP13-128-N-A", price: 229, currency: "EUR", taxType: "ttc", stockStatus: "in_stock", shippingCost: 4.99, shippingCurrency: "EUR", ean: "0194252707012", mpn: "MLPF3ZD/A", brand: "Apple", condition: "refurbished", country: "FR", externalProductId: "IP13-128" });
    expect(r1.offers[0]?.raw).toMatchObject({ sale_price_applied: true, currency_source: "feed" });
    expect(r1.requests[0]).toMatchObject({ status: 200, offers: 2 });

    const r2 = await googleMerchantFeedAdapter.search(config, parseQuery("galaxy s23"), "galaxy s23", ctx);
    expect(calls.length).toBe(1); // cache : aucune nouvelle requête
    expect(r2.offers.map((o) => o.externalOfferId)).toEqual(["S23-256-N"]);
    expect(r2.requests[0]?.status).toBeNull();

    const byEan = await googleMerchantFeedAdapter.search(config, parseQuery("0194252707012"), "0194252707012", ctx);
    expect(byEan.offers.map((o) => o.externalOfferId)).toEqual(["IP13-128-N-A"]);
    const none = await googleMerchantFeedAdapter.search(config, parseQuery("pixel 8"), "pixel 8", ctx);
    expect(none.offers).toEqual([]);
  });

  it("search : flux introuvable → erreur explicite, aucune offre", async () => {
    const { fetchImpl } = mockFetch([["/feeds/google.xml", { status: 404, body: "" }]]);
    const r = await googleMerchantFeedAdapter.search(config, parseQuery("iphone"), "iphone", runCtx({ fetchImpl }));
    expect(r.offers).toEqual([]);
    expect(r.error).toMatch(/HTTP 404/);
    expect((await googleMerchantFeedAdapter.search(sourceConfig(), parseQuery("iphone"), "iphone", runCtx({ fetchImpl }))).error).toMatch(/feed_url/);
  });

  it("fetchCatalog + testConnection : tout le flux, paginé localement", async () => {
    const { fetchImpl } = mockFetch([["/feeds/google.xml", { body: fixture("google-merchant-feed", "feed-rss.xml"), contentType: "application/xml" }]]);
    const page = await googleMerchantFeedAdapter.fetchCatalog!(config, null, runCtx({ fetchImpl }));
    expect(page.offers.length).toBe(2);
    expect(page.nextCursor).toBeNull();
    const t = await googleMerchantFeedAdapter.testConnection(config, runCtx({ fetchImpl }));
    expect(t.ok).toBe(true);
    expect(t.message).toMatch(/XML.*2 article/);
  });
});
