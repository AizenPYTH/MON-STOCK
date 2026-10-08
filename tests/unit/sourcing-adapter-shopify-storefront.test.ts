import { describe, expect, it } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { shopifyStorefrontAdapter } from "@/integrations/sourcing/shopify-storefront";
import { productsUrl, suggestUrl } from "@/integrations/sourcing/shopify-storefront/crawler";
import { parseProductsJson, parseSuggestJson } from "@/integrations/sourcing/shopify-storefront/parser";
import { fixture, mockFetch, runCtx, sourceConfig } from "./helpers/sourcing-adapters";

// Fixtures construites d'après le format documenté de products.json / search/suggest.json / products/{handle}.json.
// Non testé en conditions réelles depuis cet environnement (réseau sortant bloqué).
const config = sourceConfig({ baseUrl: "https://boutique.example/", settings: {}, defaultCurrency: "EUR", defaultTaxType: "ttc" });

describe("adaptateur shopify-storefront", () => {
  it("construit les URLs documentées", () => {
    expect(productsUrl("https://boutique.example", 2)).toBe("https://boutique.example/products.json?limit=250&page=2");
    expect(suggestUrl("https://boutique.example", "iphone 13")).toContain("/search/suggest.json?q=iphone+13&resources%5Btype%5D=product&resources%5Blimit%5D=20");
    expect(shopifyStorefrontAdapter.urlsForQuery!(config, parseQuery("iphone"), "iphone")[0]).toContain("/search/suggest.json");
  });

  it("valide les payloads avec Zod et rejette un format inattendu", () => {
    expect(parseSuggestJson(fixture("shopify-storefront", "suggest.json")).length).toBe(2);
    expect(parseProductsJson(fixture("shopify-storefront", "products.json")).length).toBe(2);
    expect(() => parseProductsJson('{"items":[]}')).toThrow(/inattendue/);
  });

  it("search : suggestions → fiches produit → une offre par variante, devise et HT/TTC depuis la source, stock honnête", async () => {
    const { fetchImpl, calls } = mockFetch([
      ["/search/suggest.json", { body: fixture("shopify-storefront", "suggest.json") }],
      ["/products/iphone-13-128-go.json", { body: fixture("shopify-storefront", "product-detail.json") }],
      ["/products/coque-iphone-13.json", { status: 404, body: "{}" }],
    ]);
    const result = await shopifyStorefrontAdapter.search(config, parseQuery("iphone 13"), "iphone 13", runCtx({ fetchImpl }));
    expect(result.error).toBeNull();
    expect(result.method).toBe("public_json");
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/search/suggest.json", "/products/iphone-13-128-go.json", "/products/coque-iphone-13.json"]);
    expect(result.requests.length).toBe(3);
    expect(result.requests[2]?.error).toMatch(/HTTP 404/);
    expect(result.offers.length).toBe(2);
    const [noir, bleu] = result.offers;
    expect(noir).toMatchObject({ externalOfferId: "7001:9001", title: "iPhone 13 128 Go reconditionné Noir", price: 229, currency: "EUR", taxType: "ttc", stockStatus: "in_stock", availableQuantity: null, supplierSku: "IP13-128-NOIR", brand: "Apple", color: "Noir", ean: null, condition: "refurbished", grade: "A", url: "https://boutique.example/products/iphone-13-128-go?variant=9001" });
    expect(noir?.raw).toMatchObject({ currency_source: "config", condition_source: "description", inferred: ["condition", "grade"] });
    // inventory_quantity et barcode présents sur la seconde variante : repris tels quels ; available:false → rupture
    expect(bleu).toMatchObject({ externalOfferId: "7001:9002", price: 249, stockStatus: "out_of_stock", availableQuantity: 0, ean: "0194252707012", color: "Bleu" });
  });

  it("search : sans devise documentée, la devise reste null (jamais devinée)", async () => {
    const { fetchImpl } = mockFetch([
      ["/search/suggest.json", { body: fixture("shopify-storefront", "suggest.json") }],
      ["/products/", { body: fixture("shopify-storefront", "product-detail.json") }],
    ]);
    const result = await shopifyStorefrontAdapter.search(sourceConfig({ baseUrl: "https://boutique.example" }), parseQuery("iphone"), "iphone", runCtx({ fetchImpl }));
    expect(result.offers[0]?.currency).toBeNull();
    expect(result.offers[0]?.taxType).toBe("unknown");
    expect(result.offers[0]?.raw).toMatchObject({ currency_source: "absent" });
  });

  it("fetchCatalog : products.json paginé, options Stockage/Couleur lues par position", async () => {
    const { fetchImpl } = mockFetch([["/products.json", { body: fixture("shopify-storefront", "products.json") }]]);
    const page = await shopifyStorefrontAdapter.fetchCatalog!(config, null, runCtx({ fetchImpl }));
    expect(page.offers.length).toBe(3);
    expect(page.offers[1]).toMatchObject({ externalOfferId: "7003:9101", storage: "128 Go", color: "Noir", price: 450, supplierSku: "S23-128-N" });
    expect(page.offers[2]).toMatchObject({ storage: "256 Go", price: 499 });
    // moins de 250 produits → dernière page
    expect(page.nextCursor).toBeNull();
  });

  it("testConnection : products.json accessible / inaccessible", async () => {
    const ok = mockFetch([["/products.json", { body: fixture("shopify-storefront", "products.json") }]]);
    expect((await shopifyStorefrontAdapter.testConnection(config, runCtx({ fetchImpl: ok.fetchImpl }))).ok).toBe(true);
    const ko = mockFetch([["/products.json", { status: 403, body: "forbidden" }]]);
    const r = await shopifyStorefrontAdapter.testConnection(config, runCtx({ fetchImpl: ko.fetchImpl }));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/HTTP 403/);
  });
});
