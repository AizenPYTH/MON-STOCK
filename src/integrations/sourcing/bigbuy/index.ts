/**
 * Adaptateur « bigbuy » : API REST officielle BigBuy avec la clé API du vendeur
 * (compte fournisseur connecté, identifiants chiffrés côté serveur). Méthode `official_api`,
 * accès `account`.
 *
 * IMPORTANT : implémenté d'après la documentation publique de l'API BigBuy ; non exercé en
 * conditions réelles depuis cet environnement (réseau sortant bloqué). Les chemins d'endpoints
 * sont regroupés dans crawler.ts. Testé sur fixtures construites d'après la documentation.
 *
 * Recherche : BigBuy n'expose pas de recherche texte ; la recherche en direct filtre un index
 * local construit à partir des premières pages du catalogue (mis en cache 10 min), ce qui est
 * signalé comme résultat tronqué. Catalogue : pages products + productsinformation fusionnées
 * par identifiant, stock disponible lu une fois par run.
 */
import { createHash } from "node:crypto";
import type { AdapterCatalogPage, AdapterRunContext, AdapterSearchResult, AdapterSourceConfig, SourceAdapter } from "@/integrations/sourcing/core";
import type { RawOffer } from "@/domain/sourcing/types";
import type { ParsedQuery } from "@/domain/sourcing/query-parser";
import { createAdapterHttp, errorMessage, failedSearch, matchesQuery, settingInt, settingString, TtlCache, type AdapterHttp } from "@/integrations/sourcing/shared";
import { authHeaders, bigbuyBase, BIGBUY_CACHE_TTL_MS, BIGBUY_DEFAULT_ISO, BIGBUY_MAX_BYTES, BIGBUY_MAX_CATALOG_PAGES, BIGBUY_PAGE_SIZE, BIGBUY_SEARCH_INDEX_PAGES, manufacturersUrl, productsInformationUrl, productsStockAvailableUrl, productsUrl, testUrl } from "./crawler";
import { parseBigbuyManufacturers, parseBigbuyProducts, parseBigbuyProductsInformation, parseBigbuyStock, type BigbuyStock } from "./parser";
import { mapBigbuyProduct } from "./mapper";

interface BigbuySession {
  base: string;
  apiKey: string;
  isoCode: string;
  headers: Record<string, string>;
  cacheKey: string;
}

interface SearchIndex {
  offers: RawOffer[];
  truncated: boolean;
}

const stockCache = new TtlCache<Map<string, BigbuyStock>>(BIGBUY_CACHE_TTL_MS);
const manufacturerCache = new TtlCache<Map<string, string>>(BIGBUY_CACHE_TTL_MS);
const indexCache = new TtlCache<SearchIndex>(BIGBUY_CACHE_TTL_MS);

export function clearBigbuyCaches(): void {
  stockCache.clear();
  manufacturerCache.clear();
  indexCache.clear();
}

function session(config: AdapterSourceConfig, ctx: AdapterRunContext): BigbuySession | null {
  const apiKey = ctx.credentials?.api_key?.trim();
  if (!apiKey) return null;
  const sandbox = config.settings.sandbox === true || config.settings.sandbox === "true";
  const base = bigbuyBase(sandbox, settingString(config.settings, "api_base"));
  const isoCode = (settingString(config.settings, "iso_code") ?? BIGBUY_DEFAULT_ISO).toLowerCase();
  const cacheKey = `${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}|${base}|${isoCode}`;
  return { base, apiKey, isoCode, headers: authHeaders(apiKey), cacheKey };
}

function nowOf(ctx: AdapterRunContext): number {
  return ctx.now ? ctx.now().getTime() : Date.now();
}

async function loadManufacturers(s: BigbuySession, http: AdapterHttp, ctx: AdapterRunContext): Promise<Map<string, string>> {
  const cached = manufacturerCache.get(s.cacheKey, nowOf(ctx));
  if (cached) return cached;
  const map = new Map<string, string>();
  try {
    const res = await http.request(manufacturersUrl(s.base), { headers: s.headers, accept: "application/json" });
    for (const m of parseBigbuyManufacturers(res.text)) if (m.name) map.set(String(m.id), m.name);
    manufacturerCache.set(s.cacheKey, map, nowOf(ctx));
  } catch {
    // marque inconnue : null (la trace de la requête reste dans http.requests)
  }
  return map;
}

async function loadStock(s: BigbuySession, http: AdapterHttp, ctx: AdapterRunContext): Promise<Map<string, BigbuyStock> | null> {
  const cached = stockCache.get(s.cacheKey, nowOf(ctx));
  if (cached) return cached;
  try {
    const res = await http.request(productsStockAvailableUrl(s.base), { headers: s.headers, accept: "application/json", maxBytes: BIGBUY_MAX_BYTES });
    const map = new Map<string, BigbuyStock>();
    for (const st of parseBigbuyStock(res.text)) map.set(String(st.id), st);
    http.countOffers(map.size);
    stockCache.set(s.cacheKey, map, nowOf(ctx));
    return map;
  } catch {
    return null; // stock inconnu : quantités null, jamais devinées
  }
}

/** Une page de catalogue : produits + informations fusionnés par id (pagination supposée alignée — à vérifier en conditions réelles). */
async function loadCatalogPage(s: BigbuySession, http: AdapterHttp, ctx: AdapterRunContext, page: number, pageSize: number): Promise<{ offers: RawOffer[]; productCount: number }> {
  const pUrl = productsUrl(s.base, s.isoCode, page, pageSize);
  const products = parseBigbuyProducts((await http.request(pUrl, { headers: s.headers, accept: "application/json", maxBytes: BIGBUY_MAX_BYTES })).text);
  http.countOffers(products.length);
  if (products.length === 0) return { offers: [], productCount: 0 };
  const iUrl = productsInformationUrl(s.base, s.isoCode, page, pageSize);
  const infos = parseBigbuyProductsInformation((await http.request(iUrl, { headers: s.headers, accept: "application/json", maxBytes: BIGBUY_MAX_BYTES })).text);
  const infoById = new Map(infos.map((i) => [String(i.id), i] as const));
  const [brands, stock] = [await loadManufacturers(s, http, ctx), await loadStock(s, http, ctx)];
  const offers: RawOffer[] = [];
  for (const p of products) {
    if (p.active === false || p.active === 0) continue;
    const id = String(p.id);
    const mapped = mapBigbuyProduct(p, infoById.get(id) ?? null, stock?.get(id) ?? null, p.manufacturer !== null && p.manufacturer !== undefined ? brands.get(String(p.manufacturer)) ?? null : null, pUrl);
    if (mapped) offers.push(mapped);
  }
  return { offers, productCount: products.length };
}

async function buildSearchIndex(s: BigbuySession, config: AdapterSourceConfig, http: AdapterHttp, ctx: AdapterRunContext): Promise<SearchIndex> {
  const cached = indexCache.get(s.cacheKey, nowOf(ctx));
  if (cached) return cached;
  const pages = settingInt(config.settings, "search_pages", BIGBUY_SEARCH_INDEX_PAGES, 1, 20);
  const pageSize = settingInt(config.settings, "page_size", BIGBUY_PAGE_SIZE, 50, BIGBUY_PAGE_SIZE);
  const offers: RawOffer[] = [];
  let truncated = false;
  for (let page = 0; page < pages; page++) {
    if (page > 0 && http.exhausted()) {
      truncated = true;
      break;
    }
    const { offers: pageOffers, productCount } = await loadCatalogPage(s, http, ctx, page, pageSize);
    offers.push(...pageOffers);
    if (productCount < pageSize) break;
    if (page === pages - 1) truncated = true;
  }
  const index: SearchIndex = { offers, truncated };
  if (offers.length > 0) indexCache.set(s.cacheKey, index, nowOf(ctx));
  return index;
}

export const bigbuyAdapter: SourceAdapter = {
  key: "bigbuy",
  label: "BigBuy (API officielle, clé API)",
  description:
    "Catalogue grossiste BigBuy via l'API REST officielle avec votre clé API : nom, SKU, EAN, marque, prix de gros HT (EUR), taux de TVA, stock par entrepôt, délais de préparation. Pas de recherche texte côté BigBuy : la recherche en direct filtre les premières pages du catalogue (index en cache 10 min) et est signalée comme partielle. Implémenté d'après la documentation publique, non exercé en conditions réelles depuis cet environnement.",
  method: "official_api",
  access: "account",
  capabilities: { search: true, catalog: true, stockQuantity: true },
  credentialFields: [{ name: "api_key", label: "Clé API BigBuy", secret: true, placeholder: "Clé générée dans votre espace BigBuy (API)" }],
  configFields: [
    { name: "iso_code", label: "Langue du catalogue (isoCode)", required: false, placeholder: BIGBUY_DEFAULT_ISO },
    { name: "sandbox", label: "Environnement bac à sable (true/false)", required: false, placeholder: "false" },
    { name: "max_pages", label: "Pages de catalogue par synchronisation", required: false, placeholder: String(BIGBUY_MAX_CATALOG_PAGES) },
    { name: "search_pages", label: "Pages indexées pour la recherche en direct", required: false, placeholder: String(BIGBUY_SEARCH_INDEX_PAGES) },
  ],
  verification: "fixtures",
  async search(config, query: ParsedQuery, _rawQuery, ctx): Promise<AdapterSearchResult> {
    const s = session(config, ctx);
    if (!s) return failedSearch("official_api", "Clé API BigBuy absente : connectez votre compte fournisseur.");
    const http = createAdapterHttp(ctx);
    try {
      const index = await buildSearchIndex(s, config, http, ctx);
      const offers = index.offers.filter((o) => matchesQuery(query, { title: o.title, brand: o.brand, ean: o.ean, sku: o.supplierSku }));
      return { offers, method: "official_api", requests: http.requests, error: null, truncated: index.truncated };
    } catch (e) {
      return failedSearch("official_api", errorMessage(e), http.requests);
    }
  },
  async fetchCatalog(config, cursor, ctx): Promise<AdapterCatalogPage> {
    const s = session(config, ctx);
    if (!s) return { offers: [], method: "official_api", requests: [], nextCursor: null };
    const page = Math.max(0, cursor ? Number(cursor) || 0 : 0);
    const maxPages = settingInt(config.settings, "max_pages", BIGBUY_MAX_CATALOG_PAGES, 1, 500);
    const pageSize = settingInt(config.settings, "page_size", BIGBUY_PAGE_SIZE, 50, BIGBUY_PAGE_SIZE);
    const http = createAdapterHttp(ctx);
    try {
      const { offers, productCount } = await loadCatalogPage(s, http, ctx, page, pageSize);
      const hasMore = productCount >= pageSize && page + 1 < maxPages;
      return { offers, method: "official_api", requests: http.requests, nextCursor: hasMore ? String(page + 1) : null };
    } catch (e) {
      return { offers: [], method: "official_api", requests: http.requests.length > 0 ? http.requests : [{ url: productsUrl(s.base, s.isoCode, page, pageSize), status: null, durationMs: 0, offers: 0, error: errorMessage(e) }], nextCursor: null };
    }
  },
  async testConnection(config, ctx) {
    const s = session(config, ctx);
    if (!s) return { ok: false, message: "Clé API BigBuy absente." };
    try {
      const http = createAdapterHttp(ctx);
      const res = await http.request(testUrl(s.base), { headers: s.headers, accept: "application/json", maxBytes: 2 * 1024 * 1024 });
      JSON.parse(res.text);
      return { ok: true, message: "Clé API BigBuy acceptée (réponse authentifiée reçue)." };
    } catch (e) {
      const msg = errorMessage(e);
      return { ok: false, message: /HTTP 401|HTTP 403/.test(msg) ? "Clé API BigBuy refusée (401/403) : vérifiez la clé et l'environnement (production / bac à sable)." : `BigBuy injoignable : ${msg}` };
    }
  },
};
