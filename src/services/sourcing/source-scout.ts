import "server-only";
import { fetchText } from "@/services/sourcing/http";
import { checkRobotsForUrls } from "@/services/sourcing/crawler/robots";
import { parseJsonLdPage } from "@/integrations/sourcing/jsonld-public/parser";
import { sitemapJsonLdAdapter } from "@/integrations/sourcing/sitemap-jsonld";
import { parseQuery } from "@/domain/sourcing/query-parser";

/**
 * Éclaireur de sources (outil d'administration, jamais exposé aux utilisateurs) : pour un hôte
 * candidat, détermine RÉELLEMENT ce qu'il expose publiquement, sans contourner quoi que ce soit :
 *   - plateforme (signatures Shopify / WooCommerce / PrestaShop / Magento dans la page d'accueil) ;
 *   - robots.txt pour les chemins qu'utiliserait un adaptateur ;
 *   - endpoint JSON public (Shopify products.json, WooCommerce Store API) : produits avec prix ?
 *   - page de recherche HTML : blocs JSON-LD Product/Offer exploitables ?
 * Aucune écriture, aucun identifiant ; une requête à la fois par hôte, délais de politesse.
 */

export type Platform = "shopify" | "woocommerce" | "prestashop" | "magento" | "unknown";

export interface ScoutReport {
  host: string;
  homeStatus: number | null;
  platform: Platform;
  robots: { allowed: boolean | null; details: string | null };
  json: { url: string; status: number | null; products: number; samples: Array<{ title: string; price: string | null }> } | null;
  search: { url: string; status: number | null; jsonLdOffers: number; samples: Array<{ title: string; price: number | null; currency: string | null }> } | null;
  sitemap: { offers: number; requests: number; error: string | null; samples: Array<{ title: string; price: number | null; currency: string | null; url: string | null }> } | null;
  recommendation: { adapter: "shopify-storefront" | "woocommerce-store" | "jsonld-public" | "sitemap-jsonld"; searchUrl?: string } | null;
  error: string | null;
}

const UA = () => process.env.SOURCING_USER_AGENT || "MonStockBot/0.1";

export function detectPlatform(html: string): Platform {
  if (/cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(html)) return "shopify";
  if (/woocommerce|wp-content\/plugins\/woocommerce/i.test(html)) return "woocommerce";
  if (/prestashop|var prestashop\s*=/i.test(html)) return "prestashop";
  if (/Magento_|mage\/cookies|data-mage-init/i.test(html)) return "magento";
  return "unknown";
}

export function searchTemplate(platform: Platform, base: string): string | null {
  switch (platform) {
    case "shopify":
      return `${base}/search?q={query}&type=product`;
    case "woocommerce":
      return `${base}/?s={query}&post_type=product`;
    case "prestashop":
      return `${base}/recherche?controller=search&s={query}`;
    case "magento":
      return `${base}/catalogsearch/result/?q={query}`;
    default:
      return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function scoutHost(host: string, query = "iphone"): Promise<ScoutReport> {
  const base = `https://${host.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
  const report: ScoutReport = { host, homeStatus: null, platform: "unknown", robots: { allowed: null, details: null }, json: null, search: null, sitemap: null, recommendation: null, error: null };
  try {
    const home = await fetchText(`${base}/`, { userAgent: UA(), timeoutMs: 12_000, maxBytes: 2_000_000 });
    report.homeStatus = home.status;
    report.platform = detectPlatform(home.text);
    const jsonUrl = report.platform === "shopify" ? `${base}/products.json?limit=5` : report.platform === "woocommerce" ? `${base}/wp-json/wc/store/v1/products?per_page=5&search=${encodeURIComponent(query)}` : null;
    const template = searchTemplate(report.platform, base);
    const searchUrl = template ? template.replace("{query}", encodeURIComponent(query)) : null;
    const robots = await checkRobotsForUrls(base, [jsonUrl, searchUrl].filter((u): u is string => Boolean(u)).concat(`${base}/`), UA());
    report.robots = { allowed: robots.allowed, details: robots.details };
    if (!robots.allowed) return report;
    if (jsonUrl) {
      await sleep(1500);
      const r: { status: number | null; text: string } = await fetchText(jsonUrl, { userAgent: UA(), accept: "application/json", timeoutMs: 12_000 }).catch(() => ({ status: null, text: "" }));
      let products: Array<{ title: string; price: string | null }> = [];
      try {
        const body = JSON.parse(r.text) as { products?: Array<{ title?: string; variants?: Array<{ price?: string }> }> } | Array<{ name?: string; prices?: { price?: string; currency_code?: string; currency_minor_unit?: number } }>;
        if (Array.isArray(body)) products = body.map((p) => ({ title: String(p.name ?? ""), price: p.prices?.price ? `${Number(p.prices.price) / 10 ** (p.prices.currency_minor_unit ?? 2)} ${p.prices.currency_code ?? ""}` : null }));
        else products = (body.products ?? []).map((p) => ({ title: String(p.title ?? ""), price: p.variants?.[0]?.price ?? null }));
      } catch {
        products = [];
      }
      report.json = { url: jsonUrl, status: r.status, products: products.filter((p) => p.price).length, samples: products.slice(0, 3) };
      if (report.json.products > 0) report.recommendation = { adapter: report.platform === "shopify" ? "shopify-storefront" : "woocommerce-store" };
    }
    if (searchUrl && template) {
      await sleep(1500);
      const r = await fetchText(searchUrl, { userAgent: UA(), timeoutMs: 12_000, maxBytes: 3_000_000 }).catch(() => null);
      const offers = r ? parseJsonLdPage(r.text, r.finalUrl || searchUrl) : [];
      report.search = { url: searchUrl, status: r?.status ?? null, jsonLdOffers: offers.length, samples: offers.slice(0, 3).map((o) => ({ title: o.title, price: o.price ?? null, currency: o.currency ?? null })) };
      if (!report.recommendation && offers.length > 0) report.recommendation = { adapter: "jsonld-public", searchUrl: template };
    }
    if (!report.recommendation) {
      // Plan du site + données structurées des fiches produit (adaptateur sitemap-jsonld).
      const r = await sitemapJsonLdAdapter.search({ baseUrl: base, settings: {}, defaultCurrency: null, defaultTaxType: "unknown", defaultCountry: null }, parseQuery(query), query, { userAgent: UA(), timeoutMs: 40_000, minDelayMs: 1_500 });
      const priced = r.offers.filter((o) => o.price !== null && o.price > 0);
      report.sitemap = { offers: priced.length, requests: r.requests.length, error: r.error, samples: priced.slice(0, 3).map((o) => ({ title: o.title, price: o.price, currency: o.currency ?? null, url: o.url ?? null })) };
      if (priced.length > 0) report.recommendation = { adapter: "sitemap-jsonld" };
    }
  } catch (e) {
    report.error = e instanceof Error ? e.message.slice(0, 300) : String(e);
  }
  return report;
}

export async function scoutHosts(hosts: string[], query?: string): Promise<ScoutReport[]> {
  const unique = [...new Set(hosts.map((h) => h.trim().toLowerCase()).filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)))].slice(0, 25);
  // 2 hôtes à la fois (mémoire/CPU de la fonction bornés ; une requête à la fois PAR hôte).
  const out: ScoutReport[] = [];
  for (let i = 0; i < unique.length; i += 2) out.push(...(await Promise.all(unique.slice(i, i + 2).map((h) => scoutHost(h, query)))));
  return out;
}
