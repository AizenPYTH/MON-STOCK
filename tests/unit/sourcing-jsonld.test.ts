import { describe, expect, it } from "vitest";
import { parseJsonLdProducts, extractJsonLdBlocks } from "@/services/sourcing/crawler/parsers/jsonld-parser";

const HTML = `<!doctype html><html><head><title>x</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Apple iPhone 13 128GB Noir","sku":"IP13-128-N","gtin13":"0194252707013","mpn":"MLPF3ZD/A","brand":{"@type":"Brand","name":"Apple"},
 "offers":{"@type":"Offer","price":"229.00","priceCurrency":"EUR","availability":"https://schema.org/InStock","url":"/p/iphone-13","itemCondition":"https://schema.org/RefurbishedCondition","priceSpecification":{"price":"229.00","priceCurrency":"EUR","valueAddedTaxIncluded":false}}}
</script>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Shop"},{"@type":"Product","name":"Galaxy S23 256GB","offers":[{"@type":"Offer","price":450,"priceCurrency":"EUR","availability":"OutOfStock","sku":"S23-256-A"},{"@type":"Offer","price":470,"priceCurrency":"EUR","availability":"InStock","sku":"S23-256-B"}]}]}</script>
<script type="application/ld+json">{ not json </script>
</head><body></body></html>`;

describe("JSON-LD parser", () => {
  it("extrait les blocs valides et ignore les invalides", () => {
    expect(extractJsonLdBlocks(HTML).length).toBe(2);
  });
  it("produit des offres brutes à partir des Product/Offer", () => {
    const offers = parseJsonLdProducts(HTML, "https://shop.example.com/cat");
    expect(offers.length).toBe(3);
    const first = offers[0]!;
    expect(first).toMatchObject({ externalOfferId: "IP13-128-N", title: "Apple iPhone 13 128GB Noir", price: 229, currency: "EUR", stockStatus: "in_stock", ean: "0194252707013", mpn: "MLPF3ZD/A", brand: "Apple", condition: "refurbished", taxType: "ht" });
    expect(first.url).toBe("https://shop.example.com/p/iphone-13");
    expect(offers[1]?.stockStatus).toBe("out_of_stock");
    expect(offers[2]?.externalOfferId).toBe("S23-256-B");
  });
  it("retourne un tableau vide sans JSON-LD", () => {
    expect(parseJsonLdProducts("<html><body>Rien</body></html>", "https://x.example")).toEqual([]);
  });
});
