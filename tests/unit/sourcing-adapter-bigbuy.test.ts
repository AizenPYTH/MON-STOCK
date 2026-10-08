import { beforeEach, describe, expect, it } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { bigbuyAdapter, clearBigbuyCaches } from "@/integrations/sourcing/bigbuy";
import { BIGBUY_API_BASE, productsInformationUrl, productsUrl } from "@/integrations/sourcing/bigbuy/crawler";
import { parseBigbuyProducts } from "@/integrations/sourcing/bigbuy/parser";
import { fixture, mockFetch, runCtx, sourceConfig } from "./helpers/sourcing-adapters";

// Fixtures construites d'après la documentation publique de l'API BigBuy ; endpoints NON exercés en
// conditions réelles depuis cet environnement (réseau sortant bloqué).
const config = sourceConfig({ settings: { iso_code: "fr" } });
const credentials = { api_key: "bb_test_key" };

function routes() {
  return mockFetch([
    ["/rest/catalog/products.json", { body: fixture("bigbuy", "products.json") }],
    ["/rest/catalog/productsinformation.json", { body: fixture("bigbuy", "productsinformation.json") }],
    ["/rest/catalog/productsstockavailable.json", { body: fixture("bigbuy", "productsstockavailable.json") }],
    ["/rest/catalog/manufacturers.json", { body: fixture("bigbuy", "manufacturers.json") }],
    ["/rest/user/purchase.json", { body: fixture("bigbuy", "user-purchase.json") }],
  ]);
}

describe("adaptateur bigbuy", () => {
  beforeEach(() => clearBigbuyCaches());

  it("construit les URLs documentées et valide les payloads", () => {
    expect(productsUrl(BIGBUY_API_BASE, "fr", 0)).toBe("https://api.bigbuy.eu/rest/catalog/products.json?isoCode=fr&page=0&pageSize=1000");
    expect(productsInformationUrl(BIGBUY_API_BASE, "fr", 1, 500)).toBe("https://api.bigbuy.eu/rest/catalog/productsinformation.json?isoCode=fr&page=1&pageSize=500");
    expect(parseBigbuyProducts(fixture("bigbuy", "products.json")).length).toBe(3);
    expect(() => parseBigbuyProducts('{"error":"x"}')).toThrow(/inattendue/);
  });

  it("sans clé API : compte requis, aucune requête", async () => {
    const { fetchImpl, calls } = mockFetch([]);
    const r = await bigbuyAdapter.search(config, parseQuery("iphone"), "iphone", runCtx({ fetchImpl }));
    expect(r.error).toMatch(/Clé API/);
    expect(calls.length).toBe(0);
    expect((await bigbuyAdapter.testConnection(config, runCtx({ fetchImpl }))).ok).toBe(false);
  });

  it("fetchCatalog : fusionne produits + informations + stock + fabricants, envoie le Bearer, ignore les inactifs", async () => {
    const { fetchImpl, calls } = routes();
    const page = await bigbuyAdapter.fetchCatalog!(config, null, runCtx({ fetchImpl, credentials }));
    expect(calls.every((c) => (c.init?.headers as Record<string, string>)?.Authorization === "Bearer bb_test_key")).toBe(true);
    expect(page.method).toBe("official_api");
    expect(page.offers.length).toBe(2);
    const [iphone, galaxy] = page.offers;
    expect(iphone).toMatchObject({ externalOfferId: "1001", title: "Apple iPhone 13 128GB Noir", price: 199.5, currency: "EUR", taxType: "ht", vatRate: 21, availableQuantity: 17, stockStatus: "in_stock", deliveryMinDays: 1, deliveryMaxDays: 4, ean: "0194252707012", brand: "Apple", condition: "new", supplierSku: "S1234567", url: "https://www.bigbuy.eu/fr/apple-iphone-13-128gb-noir.html" });
    expect(galaxy).toMatchObject({ externalOfferId: "1002", price: 410, availableQuantity: 0, stockStatus: "out_of_stock", brand: "Samsung", vatRate: 21 });
    // 3 produits < pageSize → dernière page
    expect(page.nextCursor).toBeNull();
    expect(page.requests.length).toBe(4);
  });

  it("fetchCatalog : stock indisponible → quantités null (jamais devinées)", async () => {
    const { fetchImpl } = mockFetch([
      ["/rest/catalog/products.json", { body: fixture("bigbuy", "products.json") }],
      ["/rest/catalog/productsinformation.json", { body: fixture("bigbuy", "productsinformation.json") }],
      ["/rest/catalog/productsstockavailable.json", { status: 500, body: "" }],
      ["/rest/catalog/manufacturers.json", { status: 500, body: "" }],
    ]);
    const page = await bigbuyAdapter.fetchCatalog!(config, null, runCtx({ fetchImpl, credentials }));
    expect(page.offers[0]).toMatchObject({ availableQuantity: null, stockStatus: "unknown", brand: null, deliveryMaxDays: null });
  });

  it("search : index local filtré par requête (EAN exact, texte), mis en cache", async () => {
    const { fetchImpl, calls } = routes();
    const ctx = runCtx({ fetchImpl, credentials });
    const r1 = await bigbuyAdapter.search(config, parseQuery("0194252707012"), "0194252707012", ctx);
    expect(r1.error).toBeNull();
    expect(r1.offers.map((o) => o.externalOfferId)).toEqual(["1001"]);
    expect(r1.truncated).toBe(false);
    const before = calls.length;
    const r2 = await bigbuyAdapter.search(config, parseQuery("galaxy s23"), "galaxy s23", ctx);
    expect(calls.length).toBe(before); // index en cache
    expect(r2.offers.map((o) => o.externalOfferId)).toEqual(["1002"]);
  });

  it("search : clé refusée → erreur explicite", async () => {
    const { fetchImpl } = mockFetch([["/rest/", { status: 401, body: '{"code":401}' }]]);
    const r = await bigbuyAdapter.search(config, parseQuery("iphone"), "iphone", runCtx({ fetchImpl, credentials }));
    expect(r.offers).toEqual([]);
    expect(r.error).toMatch(/HTTP 401/);
    const t = await bigbuyAdapter.testConnection(config, runCtx({ fetchImpl, credentials }));
    expect(t.ok).toBe(false);
    expect(t.message).toMatch(/refusée/);
  });

  it("testConnection : appel authentifié léger", async () => {
    const { fetchImpl, calls } = routes();
    const t = await bigbuyAdapter.testConnection(config, runCtx({ fetchImpl, credentials }));
    expect(t.ok).toBe(true);
    expect(calls[0]?.url).toBe("https://api.bigbuy.eu/rest/user/purchase.json");
  });
});
