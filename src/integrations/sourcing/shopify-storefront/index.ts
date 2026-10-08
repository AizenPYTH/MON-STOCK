/**
 * Adaptateur « shopify-storefront » : endpoints JSON publics documentés des boutiques Shopify
 * (products.json, search/suggest.json, products/{handle}.json). Méthode `public_json`, accès
 * public (attestation de l'utilisateur + robots.txt vérifiés par le pipeline).
 *
 * Limites honnêtes : devise et HT/TTC absents des payloads (valeurs documentées par
 * l'utilisateur) ; quantité disponible uniquement si `inventory_quantity` est exposé ;
 * code-barres uniquement si `barcode` est exposé.
 *
 * Vérification : fixtures construites d'après le format documenté ; non testé en conditions
 * réelles depuis cet environnement (réseau sortant bloqué).
 */
import type { AdapterCatalogPage, AdapterSearchResult, AdapterSourceConfig, SourceAdapter } from "@/integrations/sourcing/core";
import type { RawOffer } from "@/domain/sourcing/types";
import type { ParsedQuery } from "@/domain/sourcing/query-parser";
import { createAdapterHttp, errorMessage, failedSearch, settingInt, trimSlash } from "@/integrations/sourcing/shared";
import { productDetailUrl, productsUrl, SHOPIFY_MAX_CATALOG_PAGES, SHOPIFY_MAX_DETAILS_PER_SEARCH, SHOPIFY_PAGE_LIMIT, suggestUrl } from "./crawler";
import { parseProductDetailJson, parseProductsJson, parseSuggestJson } from "./parser";
import { mapShopifyProduct } from "./mapper";

const JSON_ACCEPT = "application/json;q=0.9,*/*;q=0.5";

function baseOf(config: AdapterSourceConfig): string | null {
  return config.baseUrl ? trimSlash(config.baseUrl) : null;
}

export const shopifyStorefrontAdapter: SourceAdapter = {
  key: "shopify-storefront",
  label: "Boutique Shopify (JSON public)",
  description:
    "Interroge les endpoints JSON publics d'une boutique Shopify : suggestions de recherche puis fiches produit (titre, marque, SKU, prix, disponibilité, options stockage/couleur). La devise et le HT/TTC ne sont pas fournis par Shopify : ils proviennent des réglages de la source. Quantité en stock uniquement si la boutique l'expose. Vérifié sur fixtures uniquement.",
  method: "public_json",
  access: "public",
  capabilities: { search: true, catalog: true, stockQuantity: false },
  credentialFields: [],
  configFields: [
    { name: "max_details", label: "Fiches produit lues par recherche", required: false, placeholder: String(SHOPIFY_MAX_DETAILS_PER_SEARCH), help: "Chaque fiche est une requête supplémentaire (délai de politesse appliqué)." },
    { name: "max_pages", label: "Pages de catalogue par synchronisation", required: false, placeholder: String(SHOPIFY_MAX_CATALOG_PAGES) },
  ],
  verification: "fixtures",
  urlsForQuery(config, _query: ParsedQuery, rawQuery: string): string[] {
    const base = baseOf(config);
    if (!base || !rawQuery.trim()) return [];
    // La fiche détaillée réelle n'est connue qu'après la suggestion : le chemin /products/… est vérifié sur un exemple.
    return [suggestUrl(base, rawQuery), productDetailUrl(base, "exemple")];
  },
  urlsForCatalog(config): string[] {
    const base = baseOf(config);
    return base ? [productsUrl(base, 1)] : [];
  },
  async search(config, _query, rawQuery, ctx): Promise<AdapterSearchResult> {
    const base = baseOf(config);
    if (!base) return failedSearch("public_json", "URL de base de la boutique manquante.");
    const http = createAdapterHttp(ctx);
    const maxDetails = settingInt(config.settings, "max_details", SHOPIFY_MAX_DETAILS_PER_SEARCH, 1, 20);
    try {
      const sUrl = suggestUrl(base, rawQuery);
      const res = await http.request(sUrl, { accept: JSON_ACCEPT });
      const suggestions = parseSuggestJson(res.text);
      http.countOffers(suggestions.length);
      const offers: RawOffer[] = [];
      let truncated = suggestions.length > maxDetails;
      for (const s of suggestions.slice(0, maxDetails)) {
        if (http.exhausted()) {
          truncated = true;
          break;
        }
        const dUrl = productDetailUrl(base, s.handle);
        if (ctx.disallowedUrls?.includes(dUrl)) continue;
        try {
          const d = await http.request(dUrl, { accept: JSON_ACCEPT });
          const mapped = mapShopifyProduct(parseProductDetailJson(d.text), config, base, dUrl);
          http.countOffers(mapped.length);
          offers.push(...mapped);
        } catch {
          // la fiche a échoué (trace conservée dans http.requests) : on continue avec les suivantes
        }
      }
      return { offers, method: "public_json", requests: http.requests, error: null, truncated };
    } catch (e) {
      return failedSearch("public_json", errorMessage(e), http.requests);
    }
  },
  async fetchCatalog(config, cursor, ctx): Promise<AdapterCatalogPage> {
    const base = baseOf(config);
    if (!base) return { offers: [], method: "public_json", requests: [{ url: "", status: null, durationMs: 0, offers: 0, error: "URL de base manquante." }], nextCursor: null };
    const page = Math.max(1, cursor ? Number(cursor) || 1 : 1);
    const maxPages = settingInt(config.settings, "max_pages", SHOPIFY_MAX_CATALOG_PAGES, 1, 200);
    const http = createAdapterHttp(ctx);
    const url = productsUrl(base, page);
    try {
      const res = await http.request(url, { accept: JSON_ACCEPT });
      const products = parseProductsJson(res.text);
      const offers = products.flatMap((p) => mapShopifyProduct(p, config, base, url));
      http.countOffers(offers.length);
      const hasMore = products.length >= SHOPIFY_PAGE_LIMIT && page < maxPages;
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
      const res = await http.request(productsUrl(base, 1, 1), { accept: JSON_ACCEPT, maxBytes: 2 * 1024 * 1024 });
      const products = parseProductsJson(res.text);
      return { ok: true, message: products.length > 0 ? `Boutique Shopify accessible : products.json répond (${products.length} produit lu).` : "products.json répond mais ne liste aucun produit publié." };
    } catch (e) {
      return { ok: false, message: `products.json inaccessible : ${errorMessage(e)}` };
    }
  },
};
