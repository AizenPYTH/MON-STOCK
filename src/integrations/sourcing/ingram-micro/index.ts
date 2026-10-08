/**
 * Adaptateur « ingram-micro » : Ingram Micro Reseller API v6 avec les identifiants OAuth2 du
 * compte revendeur (client credentials), chiffrés côté serveur. Méthode `official_api`,
 * accès `account`.
 *
 * IMPORTANT : implémenté d'après la documentation publique de l'API ; non exercé en conditions
 * réelles depuis cet environnement (réseau sortant bloqué). Les chemins et en-têtes sont
 * regroupés dans crawler.ts. Testé sur fixtures construites d'après la documentation.
 *
 * Recherche : GET /resellers/v6/catalog?keyword= puis POST priceandavailability (≤ 50 refs).
 * Catalogue : pages du catalogue + prix & disponibilité par lot, borné.
 */
import { createHash, randomUUID } from "node:crypto";
import type { AdapterCatalogPage, AdapterRunContext, AdapterSearchResult, AdapterSourceConfig, SourceAdapter } from "@/integrations/sourcing/core";
import type { RawOffer } from "@/domain/sourcing/types";
import type { ParsedQuery } from "@/domain/sourcing/query-parser";
import { createAdapterHttp, errorMessage, failedSearch, settingInt, settingString, TtlCache, type AdapterHttp } from "@/integrations/sourcing/shared";
import { catalogUrl, ingramBase, ingramHeaders, INGRAM_CATALOG_PAGE_SIZE, INGRAM_DEFAULT_LANGUAGE, INGRAM_DEFAULT_SENDER_ID, INGRAM_MAX_CATALOG_PAGES, INGRAM_PA_BATCH, INGRAM_SEARCH_PAGE_SIZE, INGRAM_TOKEN_SAFETY_S, priceAvailabilityUrl, tokenRequestBody, tokenUrl } from "./crawler";
import { parseIngramCatalog, parseIngramPriceAvailability, parseIngramToken, type IngramCatalogItem } from "./parser";
import { mapIngramOffer } from "./mapper";

interface IngramSession {
  base: string;
  clientId: string;
  clientSecret: string;
  customerNumber: string;
  countryCode: string;
  senderId: string;
  language: string;
  cacheKey: string;
}

const tokenCache = new TtlCache<string>(60 * 60_000);

export function clearIngramTokenCache(): void {
  tokenCache.clear();
}

function session(config: AdapterSourceConfig, ctx: AdapterRunContext): IngramSession | null {
  const c = ctx.credentials ?? {};
  const clientId = c.client_id?.trim();
  const clientSecret = c.client_secret?.trim();
  const customerNumber = c.customer_number?.trim();
  const countryCode = (c.country_code?.trim() || config.defaultCountry || "").toUpperCase();
  if (!clientId || !clientSecret || !customerNumber || !countryCode) return null;
  const sandbox = config.settings.sandbox === true || config.settings.sandbox === "true";
  const base = ingramBase(sandbox, settingString(config.settings, "api_base"));
  return {
    base,
    clientId,
    clientSecret,
    customerNumber,
    countryCode,
    senderId: settingString(config.settings, "sender_id") ?? INGRAM_DEFAULT_SENDER_ID,
    language: settingString(config.settings, "language") ?? INGRAM_DEFAULT_LANGUAGE,
    cacheKey: `${createHash("sha256").update(`${clientId}:${clientSecret}`).digest("hex").slice(0, 16)}|${base}`,
  };
}

function nowOf(ctx: AdapterRunContext): number {
  return ctx.now ? ctx.now().getTime() : Date.now();
}

async function accessToken(s: IngramSession, http: AdapterHttp, ctx: AdapterRunContext): Promise<string> {
  const cached = tokenCache.get(s.cacheKey, nowOf(ctx));
  if (cached) return cached;
  const res = await http.request(tokenUrl(s.base), { method: "POST", body: tokenRequestBody(s.clientId, s.clientSecret), headers: { "Content-Type": "application/x-www-form-urlencoded" }, accept: "application/json" });
  const token = parseIngramToken(res.text);
  const ttlS = Math.max(60, (token.expiresInS ?? 3600) - INGRAM_TOKEN_SAFETY_S);
  tokenCache.set(s.cacheKey, token.accessToken, nowOf(ctx), ttlS * 1000);
  return token.accessToken;
}

function headersFor(s: IngramSession, token: string): Record<string, string> {
  return ingramHeaders({ accessToken: token, customerNumber: s.customerNumber, countryCode: s.countryCode, senderId: s.senderId, correlationId: randomUUID().replace(/-/g, "").slice(0, 32), language: s.language });
}

async function priceAndAvailability(s: IngramSession, token: string, http: AdapterHttp, items: IngramCatalogItem[], config: AdapterSourceConfig): Promise<RawOffer[]> {
  const offers: RawOffer[] = [];
  const byPart = new Map(items.filter((i) => i.ingramPartNumber).map((i) => [i.ingramPartNumber!.trim().toUpperCase(), i] as const));
  const parts = Array.from(byPart.keys());
  for (let i = 0; i < parts.length; i += INGRAM_PA_BATCH) {
    const batch = parts.slice(i, i + INGRAM_PA_BATCH);
    const url = priceAvailabilityUrl(s.base);
    const res = await http.request(url, { method: "POST", body: JSON.stringify({ products: batch.map((p) => ({ ingramPartNumber: p })) }), headers: headersFor(s, token), accept: "application/json" });
    const rows = parseIngramPriceAvailability(res.text);
    let count = 0;
    for (const row of rows) {
      const key = (row.ingramPartNumber ?? "").trim().toUpperCase();
      const mapped = mapIngramOffer(row, byPart.get(key) ?? null, config, url);
      if (mapped) {
        offers.push(mapped);
        count++;
      }
    }
    http.countOffers(count);
    if (http.exhausted()) break;
  }
  return offers;
}

export const ingramMicroAdapter: SourceAdapter = {
  key: "ingram-micro",
  label: "Ingram Micro (Reseller API v6, OAuth2)",
  description:
    "Catalogue, prix revendeur et disponibilité Ingram Micro via l'API Reseller v6 avec les identifiants OAuth2 de votre compte (numéro client et pays requis). Recherche par mot-clé puis prix & disponibilité par lot de 50 références ; quantité totale disponible, référence fabricant, UPC, marque. HT/TTC non précisé par l'API : réglage de la source. Implémenté d'après la documentation publique, non exercé en conditions réelles depuis cet environnement.",
  method: "official_api",
  access: "account",
  capabilities: { search: true, catalog: true, stockQuantity: true },
  credentialFields: [
    { name: "client_id", label: "Client ID (application Ingram Micro)", secret: false },
    { name: "client_secret", label: "Client Secret", secret: true },
    { name: "customer_number", label: "Numéro client Ingram (IM-CustomerNumber)", secret: false, placeholder: "20-222222" },
    { name: "country_code", label: "Code pays du compte (IM-CountryCode)", secret: false, placeholder: "FR" },
  ],
  configFields: [
    { name: "sandbox", label: "Environnement bac à sable (true/false)", required: false, placeholder: "false" },
    { name: "sender_id", label: "Identifiant d'expéditeur (IM-SenderID)", required: false, placeholder: INGRAM_DEFAULT_SENDER_ID },
    { name: "language", label: "Langue des libellés (Accept-Language)", required: false, placeholder: INGRAM_DEFAULT_LANGUAGE },
    { name: "max_pages", label: "Pages de catalogue par synchronisation", required: false, placeholder: String(INGRAM_MAX_CATALOG_PAGES) },
  ],
  verification: "fixtures",
  async search(config, _query: ParsedQuery, rawQuery, ctx): Promise<AdapterSearchResult> {
    const s = session(config, ctx);
    if (!s) return failedSearch("official_api", "Identifiants Ingram Micro incomplets (client_id, client_secret, numéro client, pays).");
    const http = createAdapterHttp(ctx);
    try {
      const token = await accessToken(s, http, ctx);
      const pageSize = settingInt(config.settings, "search_page_size", INGRAM_SEARCH_PAGE_SIZE, 1, INGRAM_PA_BATCH);
      const url = catalogUrl(s.base, { pageNumber: 1, pageSize, keyword: rawQuery });
      const res = await http.request(url, { headers: headersFor(s, token), accept: "application/json" });
      const { items, recordsFound } = parseIngramCatalog(res.text);
      http.countOffers(items.length);
      const offers = items.length > 0 ? await priceAndAvailability(s, token, http, items, config) : [];
      return { offers, method: "official_api", requests: http.requests, error: null, truncated: recordsFound !== null && recordsFound > items.length };
    } catch (e) {
      return failedSearch("official_api", errorMessage(e), http.requests);
    }
  },
  async fetchCatalog(config, cursor, ctx): Promise<AdapterCatalogPage> {
    const s = session(config, ctx);
    if (!s) return { offers: [], method: "official_api", requests: [], nextCursor: null };
    const page = Math.max(1, cursor ? Number(cursor) || 1 : 1);
    const maxPages = settingInt(config.settings, "max_pages", INGRAM_MAX_CATALOG_PAGES, 1, 500);
    const http = createAdapterHttp(ctx);
    try {
      const token = await accessToken(s, http, ctx);
      const keyword = settingString(config.settings, "catalog_keyword");
      const url = catalogUrl(s.base, { pageNumber: page, pageSize: INGRAM_CATALOG_PAGE_SIZE, keyword });
      const res = await http.request(url, { headers: headersFor(s, token), accept: "application/json" });
      const { items, recordsFound } = parseIngramCatalog(res.text);
      http.countOffers(items.length);
      const offers = items.length > 0 ? await priceAndAvailability(s, token, http, items, config) : [];
      const hasMore = items.length >= INGRAM_CATALOG_PAGE_SIZE && page < maxPages && (recordsFound === null || page * INGRAM_CATALOG_PAGE_SIZE < recordsFound);
      return { offers, method: "official_api", requests: http.requests, nextCursor: hasMore ? String(page + 1) : null };
    } catch (e) {
      return { offers: [], method: "official_api", requests: http.requests.length > 0 ? http.requests : [{ url: catalogUrl(s.base, { pageNumber: page, pageSize: INGRAM_CATALOG_PAGE_SIZE }), status: null, durationMs: 0, offers: 0, error: errorMessage(e) }], nextCursor: null };
    }
  },
  async testConnection(config, ctx) {
    const s = session(config, ctx);
    if (!s) return { ok: false, message: "Identifiants Ingram Micro incomplets (client_id, client_secret, numéro client, pays)." };
    try {
      const http = createAdapterHttp(ctx);
      const token = await accessToken(s, http, ctx);
      const res = await http.request(catalogUrl(s.base, { pageNumber: 1, pageSize: 1 }), { headers: headersFor(s, token), accept: "application/json", maxBytes: 2 * 1024 * 1024 });
      const { recordsFound } = parseIngramCatalog(res.text);
      return { ok: true, message: `Jeton OAuth2 obtenu et catalogue accessible${recordsFound !== null ? ` (${recordsFound} référence(s) annoncée(s))` : ""}.` };
    } catch (e) {
      const msg = errorMessage(e);
      return { ok: false, message: /HTTP 401|HTTP 403/.test(msg) ? "Identifiants refusés (401/403) : vérifiez client_id / client_secret, le numéro client et le pays." : `Ingram Micro injoignable : ${msg}` };
    }
  },
};
