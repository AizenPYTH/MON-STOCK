/**
 * Adaptateur « ebay-browse » : annonces PUBLIÉES sur eBay (lots, reconditionnés, pièces) via l'API
 * officielle Buy Browse — `GET /buy/browse/v1/item_summary/search`.
 *   https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
 *
 * Accès : jeton « application » (OAuth client credentials, scope api_scope) obtenu avec les clés
 * de l'application eBay du SERVEUR (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET) — aucun identifiant
 * vendeur, aucune donnée privée. Marketplace : EBAY_FR par défaut (en-tête X-EBAY-C-MARKETPLACE-ID),
 * livraison en France (filtre deliveryCountry:FR).
 *
 * Ce qui est lu : titre, prix (devise fournie), état, vendeur, frais de port affichés (si présents),
 * pays de l'article, lien de l'annonce. La quantité disponible n'est PAS fournie par la recherche
 * (seulement par getItem) : elle reste inconnue. Une annonce est une « offre publiée » : la
 * disponibilité n'est pas vérifiée au-delà de sa présence dans les résultats.
 */
import { z } from "zod";
import type { RawOffer } from "@/domain/sourcing/types";
import type { AdapterRunContext, AdapterSearchResult, AdapterSourceConfig, SourceAdapter } from "@/integrations/sourcing/core";
import { createAdapterHttp, errorMessage, failedSearch, inferConditionFromText, settingInt, settingString } from "@/integrations/sourcing/shared";
import { ebayEnv } from "@/lib/env";
import { parseQuery } from "@/domain/sourcing/query-parser";

export const EBAY_BROWSE_DEFAULT_MARKETPLACE = "EBAY_FR";
export const EBAY_BROWSE_DEFAULT_LIMIT = 30;

const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().int().positive() });

const amountSchema = z.object({ value: z.string(), currency: z.string() }).partial();
const itemSummarySchema = z.object({
  itemId: z.string(),
  title: z.string(),
  price: amountSchema.optional(),
  condition: z.string().optional(),
  conditionId: z.string().optional(),
  itemWebUrl: z.string().optional(),
  itemLocation: z.object({ country: z.string().optional(), postalCode: z.string().optional() }).partial().optional(),
  seller: z.object({ username: z.string().optional(), feedbackPercentage: z.string().optional(), feedbackScore: z.number().optional() }).partial().optional(),
  shippingOptions: z.array(z.object({ shippingCost: amountSchema.optional(), shippingCostType: z.string().optional() }).partial()).optional(),
  buyingOptions: z.array(z.string()).optional(),
  epid: z.string().optional(),
  itemGroupType: z.string().optional(),
});
const searchResponseSchema = z.object({ total: z.number().optional(), itemSummaries: z.array(z.unknown()).optional() });
export type EbayItemSummary = z.infer<typeof itemSummarySchema>;

/** Jeton d'application mis en cache (valide 2 h chez eBay ; renouvelé 5 min avant expiration). */
let appToken: { token: string; expiresAt: number; key: string } | null = null;

export function clearEbayAppTokenCache(): void {
  appToken = null;
}

function apiBase(env: NonNullable<ReturnType<typeof ebayEnv>>): string {
  return env.EBAY_ENV === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

function base64(s: string): string {
  return typeof btoa === "function" ? btoa(s) : Buffer.from(s, "utf8").toString("base64");
}

async function getAppToken(ctx: AdapterRunContext): Promise<string> {
  const env = ebayEnv();
  if (!env) throw new Error("Clés de l'application eBay absentes du serveur (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_RU_NAME).");
  const key = `${env.EBAY_ENV}:${env.EBAY_CLIENT_ID}`;
  const now = (ctx.now ?? (() => new Date()))().getTime();
  if (appToken && appToken.key === key && appToken.expiresAt - 5 * 60_000 > now) return appToken.token;
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const res = await fetchImpl(`${apiBase(env)}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${base64(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`)}` },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }).toString(),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(res.status === 401 ? "eBay refuse les clés de l'application (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET)." : `Jeton d'application eBay refusé (HTTP ${res.status}).`);
  const t = tokenSchema.parse(json);
  appToken = { token: t.access_token, expiresAt: now + t.expires_in * 1000, key };
  return t.access_token;
}

function money(a: { value?: string; currency?: string } | undefined): { value: number | null; currency: string | null } {
  const v = a?.value !== undefined ? Number(a.value) : NaN;
  return { value: Number.isFinite(v) ? v : null, currency: a?.currency && /^[A-Z]{3}$/.test(a.currency) ? a.currency : null };
}

/**
 * Conditions eBay → état MON STOCK (conditionId documentés). Les niveaux du programme reconditionné
 * eBay (Excellent / Très bon / Bon) ne sont PAS convertis en grades A/B/C (aucune équivalence
 * officielle) : le grade n'est retenu que s'il est écrit dans le titre (« Grade B »), marqué déduit.
 */
export function ebayCondition(item: Pick<EbayItemSummary, "conditionId" | "condition" | "title">): { condition: string | null; grade: string | null } {
  const id = item.conditionId ?? "";
  const fromTitle = inferConditionFromText(item.title);
  if (id === "1000") return { condition: "new", grade: null };
  if (["2000", "2010", "2020", "2030", "2500"].includes(id)) return { condition: "refurbished", grade: fromTitle.grade };
  if (["3000", "4000", "5000", "6000", "7000"].includes(id)) return { condition: "used", grade: fromTitle.grade };
  const inferred = inferConditionFromText(`${item.condition ?? ""} ${item.title}`);
  return { condition: inferred.condition, grade: inferred.grade };
}

export function mapEbayItem(item: EbayItemSummary, requestUrl: string): RawOffer | null {
  const price = money(item.price);
  if (price.value === null || price.value <= 0) return null;
  const shipping = item.shippingOptions?.[0];
  const ship = money(shipping?.shippingCost);
  const cond = ebayCondition(item);
  const lot = /\blots?\b|\bx\s?\d{2,}\b|\d{2,}\s?(pcs|pi[eè]ces|unit[ée]s)\b/i.test(item.title);
  return {
    externalOfferId: item.itemId,
    externalProductId: item.epid ?? null,
    title: item.title,
    price: price.value,
    currency: price.currency,
    // eBay affiche des prix TTC pour les acheteurs particuliers en France (TVA incluse « where applicable »).
    taxType: "unknown",
    shippingCost: ship.value,
    shippingCurrency: ship.currency,
    country: item.itemLocation?.country && /^[A-Z]{2}$/.test(item.itemLocation.country) ? item.itemLocation.country : null,
    url: item.itemWebUrl ?? null,
    condition: cond.condition,
    grade: cond.grade,
    stockStatus: "unknown",
    availableQuantity: null,
    raw: {
      request_url: requestUrl,
      seller: item.seller ?? null,
      condition_label: item.condition ?? null,
      condition_id: item.conditionId ?? null,
      buying_options: item.buyingOptions ?? null,
      shipping_cost_type: shipping?.shippingCostType ?? null,
      is_lot: lot,
      price_basis: "prix affiché sur eBay (marketplace et livraison France) — offre publiée, quantité non fournie par la recherche",
    },
  };
}

export function ebaySearchUrl(env: NonNullable<ReturnType<typeof ebayEnv>>, rawQuery: string, settings: Record<string, unknown>): string {
  const url = new URL(`${apiBase(env)}/buy/browse/v1/item_summary/search`);
  url.searchParams.set("q", rawQuery.trim().slice(0, 100));
  url.searchParams.set("limit", String(settingInt(settings, "limit", EBAY_BROWSE_DEFAULT_LIMIT, 1, 100)));
  const delivery = settingString(settings, "delivery_country") ?? "FR";
  const filters = [`deliveryCountry:${delivery}`, "buyingOptions:{FIXED_PRICE|BEST_OFFER}"];
  const categories = settingString(settings, "category_ids");
  if (categories) url.searchParams.set("category_ids", categories);
  url.searchParams.set("filter", filters.join(","));
  return url.toString();
}

export const ebayBrowseAdapter: SourceAdapter = {
  key: "ebay-browse",
  label: "eBay — annonces publiées (API Browse officielle)",
  description:
    "Recherche les annonces eBay (marketplace FR, livraison en France) via l'API officielle Buy Browse avec les clés de l'application du serveur : titre, prix, état/grade (programme reconditionné eBay), frais de port affichés, vendeur, lien. La quantité disponible n'est pas fournie par la recherche (inconnue).",
  method: "official_api",
  access: "public",
  capabilities: { search: true, catalog: false, stockQuantity: false },
  credentialFields: [],
  configFields: [
    { name: "marketplace", label: "Marketplace eBay", required: false, placeholder: EBAY_BROWSE_DEFAULT_MARKETPLACE },
    { name: "category_ids", label: "Catégories eBay (identifiants, facultatif)", required: false },
  ],
  verification: "fixtures",
  async search(config: AdapterSourceConfig, _query, rawQuery, ctx): Promise<AdapterSearchResult> {
    const env = ebayEnv();
    if (!env) return failedSearch("official_api", "Clés de l'application eBay non configurées sur le serveur : recherche eBay indisponible.");
    if (!rawQuery.trim()) return failedSearch("official_api", "Requête vide.");
    const http = createAdapterHttp(ctx);
    const url = ebaySearchUrl(env, rawQuery, config.settings);
    try {
      const token = await getAppToken(ctx);
      const marketplace = settingString(config.settings, "marketplace") ?? EBAY_BROWSE_DEFAULT_MARKETPLACE;
      const res = await http.request(url, { accept: "application/json", headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": marketplace, "Accept-Language": "fr-FR" } });
      const body = searchResponseSchema.parse(JSON.parse(res.text));
      const offers: RawOffer[] = [];
      for (const raw of body.itemSummaries ?? []) {
        const parsed = itemSummarySchema.safeParse(raw);
        if (!parsed.success) continue;
        const offer = mapEbayItem(parsed.data, url);
        if (offer) offers.push(offer);
      }
      http.countOffers(offers.length);
      return { offers, method: "official_api", requests: http.requests, error: null, truncated: (body.total ?? 0) > offers.length };
    } catch (e) {
      return failedSearch("official_api", `eBay : ${errorMessage(e)}`, http.requests);
    }
  },
  async testConnection(config, ctx) {
    const r = await ebayBrowseAdapter.search(config, parseQuery("iphone"), "iphone", ctx);
    return r.error ? { ok: false, message: r.error } : { ok: true, message: `API eBay joignable : ${r.offers.length} annonce(s) pour « iphone ».` };
  },
};
