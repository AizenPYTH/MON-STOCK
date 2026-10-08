/**
 * ingram-micro — Ingram Micro Reseller API v6 (https://developer.ingrammicro.com), OAuth2
 * « client credentials » puis en-têtes IM-CustomerNumber / IM-CountryCode / IM-CorrelationID /
 * IM-SenderID / Accept-Language. Implémenté d'après la documentation publique ; NON testé en
 * conditions réelles depuis cet environnement (réseau sortant bloqué). Toute correction de
 * chemin / paramètre se fait dans ce bloc de constantes.
 */
import { joinUrl } from "@/integrations/sourcing/shared";

// ---------------------------------------------------------------------------
// Constantes d'endpoints (à vérifier en conditions réelles)
// ---------------------------------------------------------------------------
export const INGRAM_API_BASE = "https://api.ingrammicro.com";
export const INGRAM_SANDBOX_BASE = "https://api.ingrammicro.com/sandbox";
/** jeton OAuth2 (grant_type=client_credentials, formulaire x-www-form-urlencoded) */
export const INGRAM_TOKEN_PATH = "/oauth/oauth20/token";
/** recherche catalogue : GET ?pageNumber=&pageSize=&keyword= */
export const INGRAM_CATALOG_PATH = "/resellers/v6/catalog";
/** prix et disponibilité : POST { products: [{ ingramPartNumber } | { vendorPartNumber }] } (≤ 50) */
export const INGRAM_PRICE_AVAILABILITY_PATH = "/resellers/v6/catalog/priceandavailability";
export const INGRAM_PA_QUERY = "includeAvailability=true&includePricing=true&includeProductAttributes=false";
/** taille maximale d'un lot prix & disponibilité (documentée) */
export const INGRAM_PA_BATCH = 50;
/** résultats catalogue par page pour une recherche en direct */
export const INGRAM_SEARCH_PAGE_SIZE = 25;
/** résultats catalogue par page de synchronisation (≤ lot P&A) */
export const INGRAM_CATALOG_PAGE_SIZE = 50;
export const INGRAM_MAX_CATALOG_PAGES = 20;
export const INGRAM_DEFAULT_SENDER_ID = "MON STOCK";
export const INGRAM_DEFAULT_LANGUAGE = "fr-FR";
/** marge de sécurité avant expiration du jeton (secondes) */
export const INGRAM_TOKEN_SAFETY_S = 60;
// ---------------------------------------------------------------------------

export function ingramBase(sandbox: boolean, override: string | null): string {
  return override ?? (sandbox ? INGRAM_SANDBOX_BASE : INGRAM_API_BASE);
}

export function tokenUrl(base: string): string {
  // Le jeton est servi à la racine de l'hôte, y compris en bac à sable.
  const origin = new URL(base).origin;
  return joinUrl(base.endsWith("/sandbox") ? base : origin, INGRAM_TOKEN_PATH);
}

export function catalogUrl(base: string, params: { pageNumber: number; pageSize: number; keyword?: string | null }): string {
  const q = new URLSearchParams({ pageNumber: String(params.pageNumber), pageSize: String(params.pageSize) });
  if (params.keyword?.trim()) q.set("keyword", params.keyword.trim());
  return `${joinUrl(base, INGRAM_CATALOG_PATH)}?${q.toString()}`;
}

export function priceAvailabilityUrl(base: string): string {
  return `${joinUrl(base, INGRAM_PRICE_AVAILABILITY_PATH)}?${INGRAM_PA_QUERY}`;
}

export function tokenRequestBody(clientId: string, clientSecret: string): string {
  return new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }).toString();
}

export interface IngramHeaderInput {
  accessToken: string;
  customerNumber: string;
  countryCode: string;
  senderId: string;
  correlationId: string;
  language: string;
}

export function ingramHeaders(input: IngramHeaderInput): Record<string, string> {
  return {
    Authorization: `Bearer ${input.accessToken}`,
    "IM-CustomerNumber": input.customerNumber,
    "IM-CountryCode": input.countryCode.toUpperCase(),
    "IM-CorrelationID": input.correlationId,
    "IM-SenderID": input.senderId,
    "Accept-Language": input.language,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}
