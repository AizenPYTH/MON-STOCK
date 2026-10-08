import { beforeEach, describe, expect, it } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { clearIngramTokenCache, ingramMicroAdapter } from "@/integrations/sourcing/ingram-micro";
import { catalogUrl, INGRAM_API_BASE, priceAvailabilityUrl, tokenUrl } from "@/integrations/sourcing/ingram-micro/crawler";
import { parseIngramPriceAvailability, parseIngramToken } from "@/integrations/sourcing/ingram-micro/parser";
import { fixture, mockFetch, runCtx, sourceConfig } from "./helpers/sourcing-adapters";

// Fixtures construites d'après la documentation publique de l'API Reseller v6 ; endpoints NON exercés en
// conditions réelles depuis cet environnement (réseau sortant bloqué).
const config = sourceConfig({ defaultTaxType: "ht", defaultCountry: "FR" });
const credentials = { client_id: "cid", client_secret: "secret", customer_number: "20-222222", country_code: "FR" };

function routes() {
  return mockFetch([
    ["/oauth/oauth20/token", { body: fixture("ingram-micro", "token.json") }],
    ["/resellers/v6/catalog/priceandavailability", { body: fixture("ingram-micro", "priceandavailability.json") }],
    ["/resellers/v6/catalog", { body: fixture("ingram-micro", "catalog.json") }],
  ]);
}

function headersOf(init?: RequestInit): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

describe("adaptateur ingram-micro", () => {
  beforeEach(() => clearIngramTokenCache());

  it("construit les URLs documentées et valide les payloads", () => {
    expect(tokenUrl(INGRAM_API_BASE)).toBe("https://api.ingrammicro.com/oauth/oauth20/token");
    expect(catalogUrl(INGRAM_API_BASE, { pageNumber: 1, pageSize: 25, keyword: "iphone 13" })).toBe("https://api.ingrammicro.com/resellers/v6/catalog?pageNumber=1&pageSize=25&keyword=iphone+13");
    expect(priceAvailabilityUrl(INGRAM_API_BASE)).toBe("https://api.ingrammicro.com/resellers/v6/catalog/priceandavailability?includeAvailability=true&includePricing=true&includeProductAttributes=false");
    expect(parseIngramToken(fixture("ingram-micro", "token.json"))).toEqual({ accessToken: "tok_fixture_123", expiresInS: 86399 });
    expect(() => parseIngramToken("{}")).toThrow(/access_token/);
    expect(parseIngramPriceAvailability(fixture("ingram-micro", "priceandavailability.json")).length).toBe(2);
  });

  it("identifiants incomplets : compte requis, aucune requête", async () => {
    const { fetchImpl, calls } = mockFetch([]);
    const r = await ingramMicroAdapter.search(config, parseQuery("iphone"), "iphone", runCtx({ fetchImpl, credentials: { client_id: "x" } }));
    expect(r.error).toMatch(/incomplets/);
    expect(calls.length).toBe(0);
  });

  it("search : jeton OAuth2 (POST formulaire) → catalogue par mot-clé → prix & disponibilité (POST JSON, en-têtes IM-*)", async () => {
    const { fetchImpl, calls } = routes();
    const r = await ingramMicroAdapter.search(config, parseQuery("iphone 13"), "iphone 13", runCtx({ fetchImpl, credentials }));
    expect(r.error).toBeNull();
    expect(r.method).toBe("official_api");
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/oauth/oauth20/token", "/resellers/v6/catalog", "/resellers/v6/catalog/priceandavailability"]);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(String(calls[0]?.init?.body)).toBe("grant_type=client_credentials&client_id=cid&client_secret=secret");
    const h = headersOf(calls[1]?.init);
    expect(h.Authorization).toBe("Bearer tok_fixture_123");
    expect(h["IM-CustomerNumber"]).toBe("20-222222");
    expect(h["IM-CountryCode"]).toBe("FR");
    expect(h["IM-SenderID"]).toBe("MON STOCK");
    expect(h["IM-CorrelationID"]).toMatch(/^[0-9a-f]{32}$/);
    expect(h["Accept-Language"]).toBe("fr-FR");
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({ products: [{ ingramPartNumber: "123456" }, { ingramPartNumber: "654321" }] });
    // une seule offre : la référence en erreur (productStatusCode E, sans prix) n'est jamais produite
    expect(r.offers.length).toBe(1);
    expect(r.offers[0]).toMatchObject({ externalOfferId: "123456", title: "APPLE IPHONE 13 128GB BLACK", price: 215.4, currency: "EUR", taxType: "ht", availableQuantity: 42, stockStatus: "in_stock", mpn: "MLPF3ZD/A", ean: "194252707012", brand: "APPLE", supplierSku: "123456", country: "FR" });
    expect(r.offers[0]?.raw).toMatchObject({ price_basis: expect.stringContaining("customerPrice") });
    expect(r.truncated).toBe(false);
  });

  it("search : le jeton est réutilisé entre deux recherches (cache)", async () => {
    const { fetchImpl, calls } = routes();
    const ctx = runCtx({ fetchImpl, credentials });
    await ingramMicroAdapter.search(config, parseQuery("iphone"), "iphone", ctx);
    await ingramMicroAdapter.search(config, parseQuery("galaxy"), "galaxy", ctx);
    expect(calls.filter((c) => c.url.includes("/oauth/")).length).toBe(1);
  });

  it("search : identifiants refusés → erreur explicite sans offre", async () => {
    const { fetchImpl } = mockFetch([["/oauth/oauth20/token", { status: 401, body: '{"error":"invalid_client"}' }]]);
    const r = await ingramMicroAdapter.search(config, parseQuery("iphone"), "iphone", runCtx({ fetchImpl, credentials }));
    expect(r.offers).toEqual([]);
    expect(r.error).toMatch(/HTTP 401/);
    const t = await ingramMicroAdapter.testConnection(config, runCtx({ fetchImpl, credentials }));
    expect(t.ok).toBe(false);
    expect(t.message).toMatch(/refusés/);
  });

  it("fetchCatalog : page de catalogue + prix & disponibilité, curseur = numéro de page", async () => {
    const { fetchImpl, calls } = routes();
    const page = await ingramMicroAdapter.fetchCatalog!(config, "2", runCtx({ fetchImpl, credentials }));
    expect(calls.find((c) => c.url.includes("/resellers/v6/catalog?"))?.url).toContain("pageNumber=2&pageSize=50");
    expect(page.offers.length).toBe(1);
    expect(page.nextCursor).toBeNull(); // recordsFound = 2 < taille de page
  });

  it("testConnection : jeton + catalogue (pageSize=1)", async () => {
    const { fetchImpl, calls } = routes();
    const t = await ingramMicroAdapter.testConnection(config, runCtx({ fetchImpl, credentials }));
    expect(t.ok).toBe(true);
    expect(t.message).toMatch(/2 référence/);
    expect(calls[1]?.url).toContain("pageSize=1");
  });
});
