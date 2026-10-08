/**
 * Adaptateur « woocommerce-store » : WooCommerce Store API publique
 * (`GET /wp-json/wc/store/v1/products?search=…&per_page=100&page=N`). Méthode `public_json`,
 * accès public (attestation + robots.txt vérifiés par le pipeline).
 *
 * Limites honnêtes : l'API ne précise pas si les prix incluent la TVA (réglage de la boutique) ;
 * la quantité n'est connue que via `low_stock_remaining` ; le code-barres n'est pas exposé.
 *
 * Vérification : fixtures construites d'après le format documenté ; non testé en conditions
 * réelles depuis cet environnement (réseau sortant bloqué).
 */
import type { AdapterCatalogPage, AdapterSearchResult, AdapterSourceConfig, SourceAdapter } from "@/integrations/sourcing/core";
import type { RawOffer } from "@/domain/sourcing/types";
import type { ParsedQuery } from "@/domain/sourcing/query-parser";
import { createAdapterHttp, errorMessage, failedSearch, settingInt, trimSlash } from "@/integrations/sourcing/shared";
import { productsCatalogUrl, productsSearchUrl, WC_MAX_CATALOG_PAGES, WC_MAX_SEARCH_PAGES, WC_PAGE_SIZE } from "./crawler";
import { parseWcProducts } from "./parser";
import { mapWcProduct } from "./mapper";

const JSON_ACCEPT = "application/json;q=0.9,*/*;q=0.5";

function baseOf(config: AdapterSourceConfig): string | null {
  return config.baseUrl ? trimSlash(config.baseUrl) : null;
}

export const wooCommerceStoreAdapter: SourceAdapter = {
  key: "woocommerce-store",
  label: "Boutique WooCommerce (Store API publique)",
  description:
    "Interroge l'API Store publique de WooCommerce (recherche texte paginée) : nom, SKU, prix et devise, promotion, disponibilité, quantité restante si faible, minimum de commande, attributs (marque, stockage, couleur). HT/TTC non précisé par l'API : réglage de la source. Vérifié sur fixtures uniquement.",
  method: "public_json",
  access: "public",
  capabilities: { search: true, catalog: true, stockQuantity: false },
  credentialFields: [],
  configFields: [
    { name: "max_search_pages", label: "Pages lues par recherche", required: false, placeholder: String(WC_MAX_SEARCH_PAGES) },
    { name: "max_pages", label: "Pages de catalogue par synchronisation", required: false, placeholder: String(WC_MAX_CATALOG_PAGES) },
  ],
  verification: "fixtures",
  urlsForQuery(config, _query: ParsedQuery, rawQuery: string): string[] {
    const base = baseOf(config);
    return base && rawQuery.trim() ? [productsSearchUrl(base, rawQuery, 1)] : [];
  },
  urlsForCatalog(config): string[] {
    const base = baseOf(config);
    return base ? [productsCatalogUrl(base, 1)] : [];
  },
  async search(config, _query, rawQuery, ctx): Promise<AdapterSearchResult> {
    const base = baseOf(config);
    if (!base) return failedSearch("public_json", "URL de base de la boutique manquante.");
    const http = createAdapterHttp(ctx);
    const maxPages = settingInt(config.settings, "max_search_pages", WC_MAX_SEARCH_PAGES, 1, 10);
    const offers: RawOffer[] = [];
    let truncated = false;
    try {
      for (let page = 1; page <= maxPages; page++) {
        const url = productsSearchUrl(base, rawQuery, page);
        if (page > 1 && http.exhausted()) {
          truncated = true;
          break;
        }
        const res = await http.request(url, { accept: JSON_ACCEPT });
        const products = parseWcProducts(res.text);
        const mapped = products.map((p) => mapWcProduct(p, config, url)).filter((o): o is RawOffer => o !== null);
        http.countOffers(mapped.length);
        offers.push(...mapped);
        if (products.length < WC_PAGE_SIZE) break;
        if (page === maxPages) truncated = true;
      }
      return { offers, method: "public_json", requests: http.requests, error: null, truncated };
    } catch (e) {
      if (offers.length > 0) return { offers, method: "public_json", requests: http.requests, error: null, truncated: true };
      return failedSearch("public_json", errorMessage(e), http.requests);
    }
  },
  async fetchCatalog(config, cursor, ctx): Promise<AdapterCatalogPage> {
    const base = baseOf(config);
    if (!base) return { offers: [], method: "public_json", requests: [{ url: "", status: null, durationMs: 0, offers: 0, error: "URL de base manquante." }], nextCursor: null };
    const page = Math.max(1, cursor ? Number(cursor) || 1 : 1);
    const maxPages = settingInt(config.settings, "max_pages", WC_MAX_CATALOG_PAGES, 1, 200);
    const http = createAdapterHttp(ctx);
    const url = productsCatalogUrl(base, page);
    try {
      const res = await http.request(url, { accept: JSON_ACCEPT });
      const products = parseWcProducts(res.text);
      const offers = products.map((p) => mapWcProduct(p, config, url)).filter((o): o is RawOffer => o !== null);
      http.countOffers(offers.length);
      const hasMore = products.length >= WC_PAGE_SIZE && page < maxPages;
      return { offers, method: "public_json", requests: http.requests, nextCursor: hasMore ? String(page + 1) : null };
    } catch (e) {
      return { offers: [], method: "public_json", requests: http.requests.length > 0 ? http.requests : [{ url, status: null, durationMs: 0, offers: 0, error: errorMessage(e) }], nextCursor: null };
    }
  },
  async testConnection(config, ctx) {
    const base = baseOf(config);
    if (!base) return { ok: false, message: "URL de base de la boutique manquante." };
    try {
      const http = createAdapterHttp(ctx);
      const res = await http.request(productsCatalogUrl(base, 1, 1), { accept: JSON_ACCEPT, maxBytes: 2 * 1024 * 1024 });
      const products = parseWcProducts(res.text);
      return { ok: true, message: products.length > 0 ? "API Store WooCommerce accessible (produit lu)." : "API Store accessible mais aucun produit publié." };
    } catch (e) {
      return { ok: false, message: `API Store inaccessible : ${errorMessage(e)}` };
    }
  },
};
