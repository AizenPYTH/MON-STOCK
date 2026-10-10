import { beforeEach, describe, expect, it } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { clearSitemapCache, matchProductUrls, parseSitemapXml, queryTokens, rankChildSitemaps, sitemapJsonLdAdapter } from "@/integrations/sourcing/sitemap-jsonld";
import { mockFetch, runCtx, sourceConfig } from "./helpers/sourcing-adapters";

const base = "https://pieces.example";
const productPage = (name: string, price: string, sku: string) =>
  `<html><head><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name, sku, brand: { "@type": "Brand", name: "Apple" }, offers: { "@type": "Offer", price, priceCurrency: "EUR", availability: "https://schema.org/InStock", itemCondition: "https://schema.org/RefurbishedCondition" } })}</script></head><body></body></html>`;

beforeEach(() => clearSitemapCache());

describe("adaptateur sitemap-jsonld", () => {
  it("lit les <loc> d'un index et d'un urlset ; priorise les sitemaps produits, ignore images et .gz", () => {
    expect(parseSitemapXml(`<sitemapindex><sitemap><loc>${base}/sitemap-products-1.xml</loc></sitemap></sitemapindex>`)).toEqual({ kind: "index", locs: [`${base}/sitemap-products-1.xml`] });
    expect(parseSitemapXml(`<urlset><url><loc><![CDATA[${base}/a?x=1&amp;y=2]]></loc></url></urlset>`).locs).toEqual([`${base}/a?x=1&y=2`]);
    expect(rankChildSitemaps([`${base}/sitemap-cms.xml`, `${base}/sitemap-images.xml`, `${base}/s-2.xml.gz`, `${base}/sitemap-misc.xml`, `${base}/sitemap-product.xml`])).toEqual([`${base}/sitemap-product.xml`, `${base}/sitemap-misc.xml`]);
  });

  it("sélection des fiches par les mots de la requête (au moins 2 mots, les plus précises d'abord)", () => {
    expect(queryTokens("Écran iPhone 13 de remplacement pas cher")).toEqual(["ecran", "iphone", "13", "remplacement"]);
    const urls = [`${base}/ecran-iphone-13-oled.html`, `${base}/ecran-iphone-12.html`, `${base}/iphone-13-coque.html`, `${base}/ecran-samsung-s21.html`, `${base}/c/ecrans`];
    expect(matchProductUrls(urls, "ecran iphone 13", 3)).toEqual([`${base}/ecran-iphone-13-oled.html`, `${base}/iphone-13-coque.html`, `${base}/ecran-iphone-12.html`]);
    expect(matchProductUrls(urls, "lot", 3)).toEqual([]);
  });

  it("robots.txt → sitemap → fiches correspondantes (interdites exclues) → offres structurées", async () => {
    const { fetchImpl, calls } = mockFetch([
      ["/robots.txt", { body: `User-agent: *\nDisallow: /prive/\nSitemap: ${base}/sitemap_index.xml`, contentType: "text/plain" }],
      ["/sitemap_index.xml", { body: `<sitemapindex><sitemap><loc>${base}/product-sitemap.xml</loc></sitemap><sitemap><loc>${base}/image-sitemap.xml</loc></sitemap></sitemapindex>`, contentType: "application/xml" }],
      ["/product-sitemap.xml", { body: `<urlset><url><loc>${base}/prive/ecran-iphone-13-pro.html</loc></url><url><loc>${base}/ecran-iphone-13.html</loc></url><url><loc>${base}/batterie-iphone-13.html</loc></url><url><loc>${base}/ecran-galaxy-s21.html</loc></url></urlset>`, contentType: "application/xml" }],
      ["/ecran-iphone-13.html", { body: productPage("Écran OLED iPhone 13", "89.90", "EC-IP13"), contentType: "text/html" }],
      ["/batterie-iphone-13.html", { body: productPage("Batterie iPhone 13", "24.50", "BAT-IP13"), contentType: "text/html" }],
    ]);
    const r = await sitemapJsonLdAdapter.search(sourceConfig({ baseUrl: base, defaultCurrency: "EUR" }), parseQuery("ecran iphone 13"), "ecran iphone 13", runCtx({ fetchImpl, timeoutMs: 30_000 }));
    expect(r.error).toBeNull();
    const fetched = calls.map((c) => new URL(c.url).pathname);
    expect(fetched).not.toContain("/prive/ecran-iphone-13-pro.html");
    expect(fetched).not.toContain("/image-sitemap.xml");
    expect(fetched).not.toContain("/ecran-galaxy-s21.html");
    expect(r.offers.map((o) => [o.title, o.price, o.currency])).toEqual([
      ["Écran OLED iPhone 13", 89.9, "EUR"],
      ["Batterie iPhone 13", 24.5, "EUR"],
    ]);
    expect(r.offers[0]!.url).toBe(`${base}/ecran-iphone-13.html`);
  });

  it("pas de sitemap → erreur explicite (jamais de résultat inventé)", async () => {
    const { fetchImpl } = mockFetch([["/robots.txt", { status: 404, body: "" }]]);
    const r = await sitemapJsonLdAdapter.search(sourceConfig({ baseUrl: base }), parseQuery("iphone"), "iphone", runCtx({ fetchImpl }));
    expect(r.offers).toEqual([]);
    expect(r.error).toMatch(/sitemap/i);
  });
});
