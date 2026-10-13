import { describe, expect, it } from "vitest";
import { parseProductMetaTags } from "@/services/sourcing/crawler/parsers/jsonld-parser";
import { productLikeUrls, sitemapJsonLdAdapter, clearSitemapCache } from "@/integrations/sourcing/sitemap-jsonld";

/** Documents CONSTRUITS pour les tests (pas des pages réelles de fournisseurs). */
const og = (title: string, price: string, extra = "") => `<html><head><meta property="og:title" content="${title}"><meta property="product:price:amount" content="${price}"><meta property="product:price:currency" content="EUR"><meta property="product:availability" content="in stock">${extra}</head><body></body></html>`;

describe("repli balises produit (Open Graph / microdonnées)", () => {
  it("lit titre, prix, devise et disponibilité d'une fiche produit", () => {
    const [o] = parseProductMetaTags(og("Écran iPhone 13 &amp; outils", "79.90", '<link rel="canonical" href="/p/ecran-13">'), "https://shop.example.com/ecran-iphone-13");
    expect(o).toMatchObject({ title: "Écran iPhone 13 & outils", price: 79.9, currency: "EUR", stockStatus: "in_stock", url: "https://shop.example.com/p/ecran-13" });
  });
  it("page de liste (plusieurs prix en microdonnées) ou prix absent : aucune offre inventée", () => {
    const list = `<title>Écrans</title><span itemprop="price" content="10.00"></span><span itemprop="price" content="20.00"></span>`;
    expect(parseProductMetaTags(list, "https://shop.example.com/ecrans")).toEqual([]);
    expect(parseProductMetaTags("<title>Contact</title>", "https://shop.example.com/contact")).toEqual([]);
    expect(parseProductMetaTags(og("Gratuit", "0"), "https://shop.example.com/x")).toEqual([]);
  });
  it("une seule microdonnée de prix : acceptée", () => {
    const [o] = parseProductMetaTags(`<title>Batterie iPhone 12</title><meta itemprop="price" content="24,90"><meta itemprop="priceCurrency" content="eur">`, "https://shop.example.com/batterie-12");
    expect(o).toMatchObject({ title: "Batterie iPhone 12", price: 24.9, currency: "EUR" });
  });
});

describe("catalogue par le plan du site", () => {
  it("écarte catégories, contenus, images et autres domaines", () => {
    const urls = ["https://shop.example.com/", "https://shop.example.com/category/ecrans", "https://shop.example.com/blog/x", "https://shop.example.com/ecran-iphone-13", "https://cdn.example.com/p.jpg", "https://other.example.com/p", "https://shop.example.com/img/a.png", "https://shop.example.com/fr/batterie-iphone-12.html"];
    expect(productLikeUrls(urls, "https://shop.example.com")).toEqual(["https://shop.example.com/fr/batterie-iphone-12.html", "https://shop.example.com/ecran-iphone-13"]);
  });

  it("lit les fiches par lots avec un curseur de reprise ; respecte robots.txt ; rien n'est inventé", async () => {
    clearSitemapCache();
    const pages: Record<string, string> = {
      "/robots.txt": "User-agent: *\nDisallow: /prive/\nSitemap: https://shop.example.com/sitemap.xml",
      "/sitemap.xml": `<?xml version="1.0"?><urlset><url><loc>https://shop.example.com/p1</loc></url><url><loc>https://shop.example.com/prive/p2</loc></url><url><loc>https://shop.example.com/p3</loc></url><url><loc>https://shop.example.com/p4</loc></url></urlset>`,
      "/p1": og("Produit 1", "10.00"),
      "/p3": "<title>Fiche sans prix</title>",
      "/p4": og("Produit 4", "40.00"),
    };
    const fetchImpl = (async (input: string) => {
      const path = new URL(input).pathname;
      const body = pages[path];
      return new Response(body ?? "not found", { status: body ? 200 : 404, headers: { "content-type": path.endsWith(".xml") ? "application/xml" : "text/html" } });
    }) as unknown as typeof fetch;
    const ctx = { userAgent: "MonStockBot/0.1", fetchImpl, resolver: async () => [{ address: "93.184.216.34" }], sleep: async () => {} };
    const config = { baseUrl: "https://shop.example.com", settings: { catalog_pages: 2 }, defaultCurrency: null, defaultTaxType: "unknown" as const, defaultCountry: null };
    const first = await sitemapJsonLdAdapter.fetchCatalog!(config, null, ctx);
    expect(first.offers.map((o) => [o.title, o.price])).toEqual([["Produit 1", 10]]);
    expect(first.nextCursor).toBe("2");
    expect(first.requests.some((r) => r.url.includes("/prive/"))).toBe(false);
    const second = await sitemapJsonLdAdapter.fetchCatalog!(config, first.nextCursor, ctx);
    expect(second.offers.map((o) => [o.title, o.price])).toEqual([["Produit 4", 40]]);
    expect(second.nextCursor).toBeNull();
  });
});

describe("ordre des fiches produit", () => {
  it("fiches produit d'abord ; pages de service et catégories numérotées écartées", async () => {
    const { productLikeUrls: rank } = await import("@/integrations/sourcing/sitemap-jsonld");
    const base = "https://shop.example.com";
    const urls = ["/betaling/", "/verzending/", "/k882,huawei.html", "/ecran-iphone-13-pro-max-oled.html", "/catalog/", "/products/batterie-iphone-12", "/p123,ecran-galaxy-s21.html", "/nl/algemene-voorwaarden"].map((p) => base + p);
    expect(rank(urls, base)).toEqual([`${base}/p123,ecran-galaxy-s21.html`, `${base}/products/batterie-iphone-12`, `${base}/ecran-iphone-13-pro-max-oled.html`, `${base}/catalog/`]);
  });
});

describe("plan du site compressé (.gz)", () => {
  it("décompresse un sitemap gzip publié tel quel, avec une limite de taille", async () => {
    const { gunzipBounded } = await import("@/services/sourcing/http");
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://shop.example.com/p1</loc></url></urlset>`;
    const gz = await new Response(new Blob([xml]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
    expect(new TextDecoder().decode(await gunzipBounded(gz, 10_000))).toBe(xml);
    await expect(gunzipBounded(gz, 10)).rejects.toThrow(/volumineuse/);
    const plain = new TextEncoder().encode(xml).buffer;
    expect(await gunzipBounded(plain, 10)).toBe(plain);
  });
});
