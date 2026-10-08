import { XMLParser } from "fast-xml-parser";
import { ConnectorError } from "@/integrations/core/errors";
import type { ConnectorAuth } from "@/integrations/core/connector";
import { fetchWithRetry, readBodyText } from "@/integrations/core/http";
import { normalizedListingSchema, type ListingRef, type NormalizedListing, type NormalizedListingVariation, type UpdateInventoryResult } from "@/integrations/core/types";
import { EBAY_PROVIDER, EBAY_TRADING_COMPATIBILITY_LEVEL, type EbayConfig } from "@/integrations/ebay/config";

/**
 * Trading API (XML) — https://developer.ebay.com/devzone/xml/docs/reference/ebay/index.html
 * Authentification par token OAuth utilisateur via l'en-tête X-EBAY-API-IAF-TOKEN.
 * Appels utilisés : GetMyeBaySelling (annonces actives) et ReviseInventoryStatus (quantités).
 */

export const EBAY_TRADING_NS = "urn:ebay:apis:eBLBaseComponents";
/** Codes d'erreur Trading API signalant un token invalide / expiré. */
export const TRADING_AUTH_ERROR_CODES = new Set(["931", "932", "17470", "21916984", "21917053", "21916017", "21916018"]);
/** Codes Trading API de quota d'appels atteint (518 : « Call usage limit has been reached »). */
export const TRADING_RATE_LIMIT_ERROR_CODES = new Set(["518"]);
/** Erreurs internes eBay transitoires (10007 : « Internal error to the application »). */
export const TRADING_TRANSIENT_ERROR_CODES = new Set(["10007"]);
/** Site eBay utilisé pour les appels (0 = US ; GetMyeBaySelling renvoie les annonces de tous les sites). */
export const EBAY_TRADING_SITE_ID = "0";
export const GET_MY_EBAY_SELLING_PAGE_SIZE = 200;
/** Garde-fou : 50 pages × 200 = 10 000 annonces par run. */
export const GET_MY_EBAY_SELLING_MAX_PAGES = 50;

type Node = Record<string, unknown>;

const ARRAY_PATHS = new Set([
  "GetMyeBaySellingResponse.ActiveList.ItemArray.Item",
  "GetMyeBaySellingResponse.ActiveList.ItemArray.Item.Variations.Variation",
  "GetMyeBaySellingResponse.ActiveList.ItemArray.Item.Variations.Variation.VariationSpecifics.NameValueList",
  "GetMyeBaySellingResponse.ActiveList.ItemArray.Item.Variations.Variation.VariationSpecifics.NameValueList.Value",
  "GetMyeBaySellingResponse.ActiveList.ItemArray.Item.PictureDetails.PictureURL",
  "GetMyeBaySellingResponse.Errors",
  "ReviseInventoryStatusResponse.Errors",
  "ReviseInventoryStatusResponse.InventoryStatus",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  removeNSPrefix: true,
  // Les identifiants (ItemID…) restent des chaînes : aucune perte de précision.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (_name, jpath) => ARRAY_PATHS.has(typeof jpath === "string" ? jpath : jpath.toString()),
});

function node(v: unknown): Node | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Node) : null;
}
function arr(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}
function text(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const n = node(v);
  if (n && typeof n["#text"] === "string") return n["#text"];
  return null;
}
function int(v: unknown): number | null {
  const t = text(v);
  if (t === null || t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function money(v: unknown): { value: number | null; currency: string | null } {
  const t = text(v);
  const n = t === null || t === "" ? NaN : Number(t);
  const nd = node(v);
  const currency = nd && typeof nd["@_currencyID"] === "string" ? nd["@_currencyID"] : null;
  return { value: Number.isFinite(n) ? n : null, currency: currency && currency.length === 3 ? currency : null };
}
function isoOrNull(v: unknown): string | null {
  const t = text(v);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface TradingError {
  code: string;
  shortMessage: string;
  longMessage: string;
  severity: string;
}

export function extractTradingErrors(response: Node | null): TradingError[] {
  return arr(response?.Errors)
    .map(node)
    .filter((e): e is Node => e !== null)
    .map((e) => ({
      code: text(e.ErrorCode) ?? "",
      shortMessage: text(e.ShortMessage) ?? "",
      longMessage: text(e.LongMessage) ?? "",
      severity: text(e.SeverityCode) ?? "",
    }));
}

export function isTradingAuthError(errors: TradingError[]): boolean {
  return errors.some((e) => TRADING_AUTH_ERROR_CODES.has(e.code) || /(iaf|auth)\s*token.*(expired|invalid|hard expired)|invalid.*token|token.*(expired|invalid)/i.test(`${e.shortMessage} ${e.longMessage}`));
}

/** Interprète <Ack> et <Errors> ; lève AUTH_EXPIRED ou API_ERROR (avec le message exact d'eBay). */
export function assertTradingAck(callName: string, response: Node | null): { warnings: string[] } {
  if (!response) {
    throw new ConnectorError("INVALID_RESPONSE", EBAY_PROVIDER, `Réponse XML illisible pour l'appel Trading ${callName}.`, { details: { callName } });
  }
  const ack = text(response.Ack) ?? "";
  const errors = extractTradingErrors(response);
  const failures = errors.filter((e) => e.severity !== "Warning");
  const warnings = errors.filter((e) => e.severity === "Warning").map((e) => e.longMessage || e.shortMessage);
  if (ack === "Success" || ack === "Warning") return { warnings };
  if (isTradingAuthError(errors)) {
    throw new ConnectorError("AUTH_EXPIRED", EBAY_PROVIDER, "Impossible de synchroniser eBay : le token d'autorisation a expiré ou a été révoqué.", {
      details: { callName, errorCodes: failures.map((e) => e.code) },
      retryable: false,
    });
  }
  const first = failures[0] ?? errors[0];
  const message = first ? first.longMessage || first.shortMessage : `Ack=${ack || "absent"}`;
  const errorSummary = failures.map((e) => ({ code: e.code, message: e.shortMessage }));
  if (failures.some((e) => TRADING_RATE_LIMIT_ERROR_CODES.has(e.code) || /usage limit|call limit/i.test(`${e.shortMessage} ${e.longMessage}`))) {
    throw new ConnectorError("RATE_LIMITED", EBAY_PROVIDER, `Quota d'appels de la Trading API eBay atteint (${callName}) : la synchronisation reprendra au prochain run.`, {
      details: { callName, ack, errors: errorSummary },
      retryable: true,
    });
  }
  throw new ConnectorError("API_ERROR", EBAY_PROVIDER, `eBay a refusé l'appel ${callName} : ${message}`, {
    details: { callName, ack, errors: errorSummary },
    retryable: failures.some((e) => TRADING_TRANSIENT_ERROR_CODES.has(e.code)),
  });
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function buildGetMyeBaySellingRequest(pageNumber: number, entriesPerPage = GET_MY_EBAY_SELLING_PAGE_SIZE): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="${EBAY_TRADING_NS}">
  <ErrorLanguage>fr_FR</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnAll</DetailLevel>
  <ActiveList>
    <Include>true</Include>
    <IncludeNotes>false</IncludeNotes>
    <Sort>TimeLeft</Sort>
    <Pagination>
      <EntriesPerPage>${entriesPerPage}</EntriesPerPage>
      <PageNumber>${pageNumber}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`;
}

export function buildReviseInventoryStatusRequest(ref: ListingRef, quantity: number): string {
  const sku = ref.variationSku ? `\n    <SKU>${xmlEscape(ref.variationSku)}</SKU>` : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<ReviseInventoryStatusRequest xmlns="${EBAY_TRADING_NS}">
  <ErrorLanguage>fr_FR</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <InventoryStatus>
    <ItemID>${xmlEscape(ref.externalListingId)}</ItemID>${sku}
    <Quantity>${Math.max(0, Math.trunc(quantity))}</Quantity>
  </InventoryStatus>
</ReviseInventoryStatusRequest>`;
}

function parseVariation(v: Node): NormalizedListingVariation {
  const specifics: Record<string, string> = {};
  for (const nv of arr(node(v.VariationSpecifics)?.NameValueList).map(node)) {
    if (!nv) continue;
    const name = text(nv.Name);
    const value = arr(nv.Value).map(text).filter((x): x is string => Boolean(x)).join(", ");
    if (name && value) specifics[name] = value;
  }
  const listed = int(v.Quantity);
  const sold = int(node(v.SellingStatus)?.QuantitySold);
  const price = money(v.StartPrice);
  return {
    sku: text(v.SKU)?.trim() || null,
    specifics,
    quantityListed: listed,
    quantitySold: sold,
    quantityAvailable: listed !== null ? Math.max(0, listed - (sold ?? 0)) : null,
    price: price.value,
    currency: price.currency,
  };
}

function parseItem(item: Node): NormalizedListing {
  const selling = node(item.SellingStatus);
  const listed = int(item.Quantity);
  const sold = int(selling?.QuantitySold);
  const explicitAvailable = int(item.QuantityAvailable);
  const current = money(selling?.CurrentPrice);
  const bin = money(item.BuyItNowPrice);
  const start = money(item.StartPrice);
  const price = current.value !== null ? current : bin.value !== null ? bin : start;
  const details = node(item.ListingDetails);
  const pictures = node(item.PictureDetails);
  const firstPicture = arr(pictures?.PictureURL).map(text).find((x): x is string => Boolean(x)) ?? text(pictures?.GalleryURL);
  const variations = arr(node(item.Variations)?.Variation).map(node).filter((v): v is Node => v !== null).map(parseVariation);
  const listingStatus = text(selling?.ListingStatus);
  const status: NormalizedListing["status"] = listingStatus === "Active" ? "active" : listingStatus === "Completed" || listingStatus === "Ended" ? "ended" : listingStatus ? "unknown" : "active";
  const variationAvailable = variations.length > 0 ? variations.reduce<number | null>((acc, v) => (v.quantityAvailable === null ? acc : (acc ?? 0) + v.quantityAvailable), null) : null;
  return normalizedListingSchema.parse({
    externalListingId: text(item.ItemID) ?? "",
    title: text(item.Title) ?? "",
    sku: text(item.SKU)?.trim() || null,
    externalProductId: text(node(item.ProductListingDetails)?.ProductReferenceID) ?? null,
    quantityListed: listed,
    quantitySold: sold,
    quantityAvailable: explicitAvailable ?? variationAvailable ?? (listed !== null ? Math.max(0, listed - (sold ?? 0)) : null),
    price: price.value,
    currency: price.currency ?? (text(item.Currency)?.length === 3 ? text(item.Currency) : null),
    listingUrl: text(details?.ViewItemURL) ?? null,
    imageUrl: firstPicture ?? null,
    status,
    startedAt: isoOrNull(details?.StartTime),
    endsAt: isoOrNull(details?.EndTime),
    variations,
  });
}

export interface GetMyeBaySellingPage {
  listings: NormalizedListing[];
  /** Annonces ignorées car illisibles (comptées, jamais inventées). */
  invalid: Array<{ itemId: string | null; message: string }>;
  pageNumber: number;
  totalPages: number;
  totalEntries: number | null;
  warnings: string[];
}

/** Analyse une réponse GetMyeBaySelling (XML brut). Lève AUTH_EXPIRED / API_ERROR selon <Ack>. */
export function parseGetMyeBaySellingResponse(xml: string): GetMyeBaySellingPage {
  const doc = node(parser.parse(xml));
  const response = node(doc?.GetMyeBaySellingResponse);
  const { warnings } = assertTradingAck("GetMyeBaySelling", response);
  const active = node(response?.ActiveList);
  const pagination = node(active?.PaginationResult);
  const listings: NormalizedListing[] = [];
  const invalid: GetMyeBaySellingPage["invalid"] = [];
  for (const item of arr(node(active?.ItemArray)?.Item).map(node)) {
    if (!item) continue;
    try {
      listings.push(parseItem(item));
    } catch (e) {
      invalid.push({ itemId: text(item.ItemID), message: e instanceof Error ? e.message : String(e) });
    }
  }
  return {
    listings,
    invalid,
    pageNumber: int(node(active?.Pagination)?.PageNumber) ?? 1,
    totalPages: int(pagination?.TotalNumberOfPages) ?? 1,
    totalEntries: int(pagination?.TotalNumberOfEntries),
    warnings,
  };
}

export function parseReviseInventoryStatusResponse(xml: string): { warnings: string[] } {
  const doc = node(parser.parse(xml));
  const response = node(doc?.ReviseInventoryStatusResponse);
  return assertTradingAck("ReviseInventoryStatus", response);
}

async function tradingCall(config: EbayConfig, auth: ConnectorAuth, callName: string, body: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await auth.getAccessToken({ forceRefresh: attempt > 0 });
    const res = await fetchWithRetry(
      config.tradingUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "X-EBAY-API-SITEID": EBAY_TRADING_SITE_ID,
          "X-EBAY-API-COMPATIBILITY-LEVEL": EBAY_TRADING_COMPATIBILITY_LEVEL,
          "X-EBAY-API-CALL-NAME": callName,
          "X-EBAY-API-IAF-TOKEN": token,
        },
        body,
      },
      { provider: EBAY_PROVIDER, label: `trading:${callName}`, timeoutMs: 60_000 },
    );
    const xml = await readBodyText(res, EBAY_PROVIDER, `trading:${callName}`);
    if (res.status === 401 && attempt === 0) continue;
    if (!res.ok) {
      throw new ConnectorError(res.status === 401 ? "AUTH_EXPIRED" : "API_ERROR", EBAY_PROVIDER, `La Trading API eBay a répondu HTTP ${res.status} pour ${callName}.`, { httpStatus: res.status, details: { callName } });
    }
    // Les erreurs de token sont renvoyées avec HTTP 200 et <Ack>Failure</Ack> : on tente un rafraîchissement une fois.
    if (attempt === 0) {
      const probe = node(node(parser.parse(xml))?.[`${callName}Response`]);
      if (probe && text(probe.Ack) === "Failure" && isTradingAuthError(extractTradingErrors(probe))) continue;
    }
    return xml;
  }
  throw new ConnectorError("AUTH_EXPIRED", EBAY_PROVIDER, "Impossible de synchroniser eBay : le token d'autorisation a expiré ou a été révoqué.", { details: { callName } });
}

export async function* iterateGetMyeBaySelling(config: EbayConfig, auth: ConnectorAuth): AsyncGenerator<GetMyeBaySellingPage> {
  for (let page = 1; page <= GET_MY_EBAY_SELLING_MAX_PAGES; page++) {
    const xml = await tradingCall(config, auth, "GetMyeBaySelling", buildGetMyeBaySellingRequest(page));
    const parsed = parseGetMyeBaySellingResponse(xml);
    yield parsed;
    if (page >= parsed.totalPages) return;
  }
}

export async function reviseInventoryStatus(config: EbayConfig, auth: ConnectorAuth, ref: ListingRef, quantity: number): Promise<UpdateInventoryResult> {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new ConnectorError("API_ERROR", EBAY_PROVIDER, "La quantité à envoyer à eBay doit être un entier positif ou nul.", { retryable: false });
  }
  const xml = await tradingCall(config, auth, "ReviseInventoryStatus", buildReviseInventoryStatusRequest(ref, quantity));
  const { warnings } = parseReviseInventoryStatusResponse(xml);
  return { ok: true, quantity, warnings };
}
