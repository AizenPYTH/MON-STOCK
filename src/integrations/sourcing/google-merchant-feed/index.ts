/**
 * Adaptateur « google-merchant-feed » : flux produit public au format Google Merchant Center
 * (RSS 2.0 / Atom avec espace de noms g:, ou TSV/CSV à en-tête). Méthode `public_feed`,
 * accès public. Recherche = filtrage local du flux lu et mis en cache (10 min).
 *
 * Vérification : fixtures construites d'après la spécification publique du format ; non testé
 * en conditions réelles depuis cet environnement (réseau sortant bloqué).
 */
import type { AdapterCatalogPage, AdapterRunContext, AdapterSearchResult, AdapterSourceConfig, SourceAdapter } from "@/integrations/sourcing/core";
import type { RawOffer } from "@/domain/sourcing/types";
import type { ParsedQuery } from "@/domain/sourcing/query-parser";
import { createAdapterHttp, errorMessage, failedSearch, matchesQuery, TtlCache } from "@/integrations/sourcing/shared";
import { detectFeedFormat, feedUrlOf, GMC_CACHE_TTL_MS, GMC_CATALOG_PAGE_SIZE, GMC_FEED_ACCEPT, GMC_MAX_BYTES } from "./crawler";
import { parseGmcFeed } from "./parser";
import { mapGmcItem } from "./mapper";

interface CachedFeed {
  offers: RawOffer[];
  fetchedAt: string;
  format: "xml" | "tsv";
}

const feedCache = new TtlCache<CachedFeed>(GMC_CACHE_TTL_MS);

/** Vide le cache des flux (tests). */
export function clearGmcFeedCache(): void {
  feedCache.clear();
}

async function loadFeed(config: AdapterSourceConfig, ctx: AdapterRunContext, options: { useCache: boolean }) {
  const url = feedUrlOf(config);
  if (!url) throw new Error("URL du flux manquante (réglage feed_url ou URL de base pointant vers un fichier).");
  const now = ctx.now ? ctx.now().getTime() : Date.now();
  const cached = options.useCache ? feedCache.get(url, now) : null;
  if (cached) return { url, feed: cached, requests: [], fromCache: true };
  const http = createAdapterHttp(ctx);
  const res = await http.request(url, { accept: GMC_FEED_ACCEPT, maxBytes: GMC_MAX_BYTES });
  const format = detectFeedFormat(res.text, res.contentType);
  const items = parseGmcFeed(res.text, format);
  const offers = items.map((i) => mapGmcItem(i, config, res.finalUrl || url));
  http.countOffers(offers.length);
  const feed: CachedFeed = { offers, fetchedAt: new Date(now).toISOString(), format };
  feedCache.set(url, feed, now);
  return { url, feed, requests: http.requests, fromCache: false };
}

export const googleMerchantFeedAdapter: SourceAdapter = {
  key: "google-merchant-feed",
  label: "Flux Google Merchant (RSS / Atom / TSV)",
  description:
    "Lit un flux produit public au format Google Merchant Center (g:id, g:title, g:price « 229.00 EUR », g:sale_price, g:availability, g:gtin, g:mpn, g:brand, g:condition, g:link, g:shipping, g:item_group_id). La recherche filtre le flux lu (mis en cache 10 min) : aucune requête supplémentaire par recherche. Vérifié sur fixtures uniquement.",
  method: "public_feed",
  access: "public",
  capabilities: { search: true, catalog: true, stockQuantity: false },
  credentialFields: [],
  configFields: [{ name: "feed_url", label: "URL du flux Google Merchant", required: true, placeholder: "https://boutique.example/feeds/google.xml" }],
  verification: "fixtures",
  urlsForQuery(config): string[] {
    const url = feedUrlOf(config);
    return url ? [url] : [];
  },
  urlsForCatalog(config): string[] {
    const url = feedUrlOf(config);
    return url ? [url] : [];
  },
  async search(config, query: ParsedQuery, _rawQuery, ctx): Promise<AdapterSearchResult> {
    const feedUrl = feedUrlOf(config);
    if (feedUrl && ctx.disallowedUrls?.includes(feedUrl)) return failedSearch("public_feed", "URL du flux interdite par robots.txt.");
    try {
      const { url, feed, requests, fromCache } = await loadFeed(config, ctx, { useCache: true });
      const offers = feed.offers.filter((o) => matchesQuery(query, { title: o.title, brand: o.brand, ean: o.ean, mpn: o.mpn, sku: o.supplierSku }));
      return { offers, method: "public_feed", requests: fromCache ? [{ url, status: null, durationMs: 0, offers: offers.length, error: null }] : requests, error: null, truncated: false };
    } catch (e) {
      return failedSearch("public_feed", errorMessage(e));
    }
  },
  async fetchCatalog(config, cursor, ctx): Promise<AdapterCatalogPage> {
    const offset = Math.max(0, cursor ? Number(cursor) || 0 : 0);
    try {
      const { feed, requests } = await loadFeed(config, ctx, { useCache: offset > 0 });
      const page = feed.offers.slice(offset, offset + GMC_CATALOG_PAGE_SIZE);
      const next = offset + GMC_CATALOG_PAGE_SIZE < feed.offers.length ? String(offset + GMC_CATALOG_PAGE_SIZE) : null;
      return { offers: page, method: "public_feed", requests, nextCursor: next };
    } catch (e) {
      return { offers: [], method: "public_feed", requests: [{ url: feedUrlOf(config) ?? "", status: null, durationMs: 0, offers: 0, error: errorMessage(e) }], nextCursor: null };
    }
  },
  async testConnection(config, ctx) {
    try {
      const { feed } = await loadFeed(config, ctx, { useCache: false });
      return { ok: true, message: `Flux lu (${feed.format.toUpperCase()}) : ${feed.offers.length} article(s).` };
    } catch (e) {
      return { ok: false, message: errorMessage(e) };
    }
  },
};
