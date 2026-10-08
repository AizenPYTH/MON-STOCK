import { describe, expect, it } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { wooCommerceStoreAdapter } from "@/integrations/sourcing/woocommerce-store";
import { productsSearchUrl } from "@/integrations/sourcing/woocommerce-store/crawler";
import { minorToAmount, parseWcProducts } from "@/integrations/sourcing/woocommerce-store/parser";
import { fixture, mockFetch, runCtx, sourceConfig } from "./helpers/sourcing-adapters";

// Fixtures construites d'après la documentation de l'API Store WooCommerce (wc/store/v1/products).
// Non testé en conditions réelles depuis cet environnement (réseau sortant bloqué).
const config = sourceConfig({ baseUrl: "https://woo.example", defaultTaxType: "ttc", defaultCountry: "FR" });

describe("adaptateur woocommerce-store", () => {
  it("construit l'URL de recherche documentée et convertit les unités mineures", () => {
    expect(productsSearchUrl("https://woo.example", "iphone 13", 1)).toBe("https://woo.example/wp-json/wc/store/v1/products?search=iphone+13&per_page=100&page=1");
    expect(minorToAmount("22900", 2)).toBe(229);
    expect(minorToAmount("990", 2)).toBe(9.9);
    expect(minorToAmount("1234", 0)).toBe(1234);
    expect(minorToAmount("abc", 2)).toBeNull();
    expect(() => parseWcProducts('{"not":"a list"}')).toThrow(/inattendue/);
  });

  it("search : prix/devise du payload, MOQ, stock faible, attributs marque/stockage, état déduit de la description", async () => {
    const { fetchImpl, calls } = mockFetch([["/wp-json/wc/store/v1/products", { body: fixture("woocommerce-store", "products-search.json") }]]);
    const result = await wooCommerceStoreAdapter.search(config, parseQuery("iphone 13"), "iphone 13", runCtx({ fetchImpl }));
    expect(result.error).toBeNull();
    expect(result.method).toBe("public_json");
    expect(calls.length).toBe(1); // moins de 100 résultats → pas de page 2
    expect(result.truncated).toBe(false);
    expect(result.offers.length).toBe(2);
    const [iphone, coque] = result.offers;
    expect(iphone).toMatchObject({ externalOfferId: "501", price: 229, currency: "EUR", taxType: "ttc", moq: 2, availableQuantity: 3, stockStatus: "low", supplierSku: "WC-IP13-128-N", brand: "Apple", storage: "128 Go", condition: "refurbished", grade: "A", url: "https://woo.example/produit/iphone-13-128-noir/", country: "FR" });
    expect(iphone?.raw).toMatchObject({ currency_source: "payload", condition_source: "description" });
    expect(coque).toMatchObject({ externalOfferId: "502", price: 9.9, stockStatus: "out_of_stock", availableQuantity: null, moq: null, supplierSku: null, brand: null, condition: null });
  });

  it("search : une erreur HTTP sur la première page est signalée sans offre", async () => {
    const { fetchImpl } = mockFetch([["/wp-json/", { status: 500, body: "{}" }]]);
    const result = await wooCommerceStoreAdapter.search(config, parseQuery("x"), "x", runCtx({ fetchImpl }));
    expect(result.offers).toEqual([]);
    expect(result.error).toMatch(/HTTP 500/);
  });

  it("fetchCatalog : pagination par curseur", async () => {
    const { fetchImpl, calls } = mockFetch([["/wp-json/wc/store/v1/products", { body: fixture("woocommerce-store", "products-search.json") }]]);
    const page = await wooCommerceStoreAdapter.fetchCatalog!(config, "3", runCtx({ fetchImpl }));
    expect(calls[0]?.url).toContain("page=3");
    expect(page.offers.length).toBe(2);
    expect(page.nextCursor).toBeNull();
  });

  it("testConnection : vérifie l'API Store", async () => {
    const { fetchImpl } = mockFetch([["/wp-json/wc/store/v1/products", { body: fixture("woocommerce-store", "products-search.json") }]]);
    const r = await wooCommerceStoreAdapter.testConnection(config, runCtx({ fetchImpl }));
    expect(r.ok).toBe(true);
    expect((await wooCommerceStoreAdapter.testConnection(sourceConfig(), runCtx({ fetchImpl }))).ok).toBe(false);
  });
});
