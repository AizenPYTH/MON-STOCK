import { describe, expect, it } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { jsonLdPublicAdapter } from "@/integrations/sourcing/jsonld-public";
import { catalogUrls, searchUrlFor } from "@/integrations/sourcing/jsonld-public/crawler";
import { fixture, mockFetch, runCtx, sourceConfig } from "./helpers/sourcing-adapters";

// Fixtures construites d'après le vocabulaire schema.org : non testé en conditions réelles depuis cet environnement.
const config = sourceConfig({ baseUrl: "https://shop.example", settings: { search_url: "https://shop.example/recherche?q={query}", urls: ["https://shop.example/cat/smartphones", "https://autre.example/x"] }, defaultCurrency: "EUR", defaultTaxType: "ttc", defaultCountry: "FR" });

describe("adaptateur jsonld-public", () => {
  it("construit l'URL de recherche sur le même hôte et refuse les autres", () => {
    expect(searchUrlFor(config, "iphone 13")).toBe("https://shop.example/recherche?q=iphone%2013");
    expect(searchUrlFor(sourceConfig({ baseUrl: "https://shop.example", settings: { search_url: "https://evil.example/?q={query}" } }), "x")).toBeNull();
    expect(searchUrlFor(sourceConfig({ settings: {} }), "x")).toBeNull();
    expect(catalogUrls(config)).toEqual(["https://shop.example/cat/smartphones"]);
    expect(jsonLdPublicAdapter.urlsForQuery!(config, parseQuery("iphone 13"), "iphone 13")).toEqual(["https://shop.example/recherche?q=iphone%2013"]);
  });

  it("search : lit le JSON-LD de la page de résultats et complète les valeurs par défaut documentées", async () => {
    const { fetchImpl, calls } = mockFetch([["/recherche", { body: fixture("jsonld-public", "search-page.html"), contentType: "text/html; charset=utf-8" }]]);
    const result = await jsonLdPublicAdapter.search(config, parseQuery("iphone 13"), "iphone 13", runCtx({ fetchImpl }));
    expect(result.error).toBeNull();
    expect(result.method).toBe("public_html");
    expect(calls.length).toBe(1);
    expect(result.requests[0]).toMatchObject({ status: 200, offers: 2, error: null });
    const [first, second] = result.offers;
    expect(first).toMatchObject({ externalOfferId: "IP13-128-N-A", price: 229, currency: "EUR", taxType: "ht", ean: "0194252707012", brand: "Apple", condition: "refurbished", stockStatus: "in_stock", url: "https://shop.example/p/iphone-13-128-noir", country: "FR" });
    // devise absente de la page → devise par défaut de la source ; HT/TTC non déclaré → réglage de la source
    expect(second).toMatchObject({ externalOfferId: "IP13-256-B", price: 279, currency: "EUR", taxType: "ttc", stockStatus: "out_of_stock" });
    expect(second?.raw).toMatchObject({ page_url: "https://shop.example/recherche?q=iphone%2013" });
  });

  it("search : sans search_url, la source n'est pas interrogée (erreur explicite, aucune requête)", async () => {
    const { fetchImpl, calls } = mockFetch([]);
    const result = await jsonLdPublicAdapter.search(sourceConfig({ baseUrl: "https://shop.example" }), parseQuery("x"), "x", runCtx({ fetchImpl }));
    expect(result.offers).toEqual([]);
    expect(result.error).toMatch(/search_url/);
    expect(calls.length).toBe(0);
  });

  it("search : une URL interdite par robots.txt n'est jamais appelée", async () => {
    const { fetchImpl, calls } = mockFetch([]);
    const result = await jsonLdPublicAdapter.search(config, parseQuery("x"), "x", runCtx({ fetchImpl, disallowedUrls: ["https://shop.example/recherche?q=x"] }));
    expect(result.error).toMatch(/robots/);
    expect(calls.length).toBe(0);
  });

  it("search : une erreur HTTP est tracée, rien n'est inventé", async () => {
    const { fetchImpl } = mockFetch([["/recherche", { status: 503, body: "down", contentType: "text/html" }]]);
    const result = await jsonLdPublicAdapter.search(config, parseQuery("x"), "x", runCtx({ fetchImpl }));
    expect(result.offers).toEqual([]);
    expect(result.error).toMatch(/HTTP 503/);
  });

  it("fetchCatalog : une page par curseur, bornée à la liste d'URLs du même hôte", async () => {
    const { fetchImpl } = mockFetch([["/cat/smartphones", { body: fixture("jsonld-public", "catalog-page.html"), contentType: "text/html" }]]);
    const page = await jsonLdPublicAdapter.fetchCatalog!(config, null, runCtx({ fetchImpl }));
    expect(page.offers.length).toBe(1);
    expect(page.offers[0]).toMatchObject({ externalOfferId: "S23-256-N", mpn: "SM-S911B", brand: "Samsung", price: 450 });
    expect(page.nextCursor).toBeNull();
    const beyond = await jsonLdPublicAdapter.fetchCatalog!(config, "5", runCtx({ fetchImpl }));
    expect(beyond.offers).toEqual([]);
  });

  it("testConnection : signale l'absence de JSON-LD sans inventer d'offre", async () => {
    const { fetchImpl } = mockFetch([["/cat/smartphones", { body: "<html><body>Aucun JSON-LD</body></html>", contentType: "text/html" }]]);
    const r = await jsonLdPublicAdapter.testConnection(config, runCtx({ fetchImpl }));
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/aucun bloc JSON-LD/);
  });
});
