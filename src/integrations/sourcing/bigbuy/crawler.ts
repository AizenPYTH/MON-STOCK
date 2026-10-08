/**
 * bigbuy — API REST officielle BigBuy (https://api.bigbuy.eu), clé API du vendeur en
 * `Authorization: Bearer`. Implémenté d'après la documentation publique ; NON testé en
 * conditions réelles depuis cet environnement (réseau sortant bloqué) : si un chemin ou un
 * paramètre diffère, corrigez-le dans ce bloc de constantes uniquement.
 */
import { joinUrl } from "@/integrations/sourcing/shared";

// ---------------------------------------------------------------------------
// Constantes d'endpoints (à vérifier en conditions réelles)
// ---------------------------------------------------------------------------
export const BIGBUY_API_BASE = "https://api.bigbuy.eu";
export const BIGBUY_SANDBOX_BASE = "https://api.sandbox.bigbuy.eu";
/** liste des produits (prix de gros, EAN, fabricant, taxe) — paginée : page (0-based) + pageSize */
export const BIGBUY_PRODUCTS_PATH = "/rest/catalog/products.json";
/** informations produit traduites (nom, description, url) — paginée : page + pageSize */
export const BIGBUY_PRODUCTS_INFORMATION_PATH = "/rest/catalog/productsinformation.json";
/** stock des produits disponibles (quantités par entrepôt, délais de préparation) */
export const BIGBUY_PRODUCTS_STOCK_AVAILABLE_PATH = "/rest/catalog/productsstockavailable.json";
/** fabricants (id → nom) */
export const BIGBUY_MANUFACTURERS_PATH = "/rest/catalog/manufacturers.json";
/** appel authentifié le plus léger documenté pour vérifier la clé */
export const BIGBUY_TEST_PATH = "/rest/user/purchase.json";
/** taille de page maximale documentée */
export const BIGBUY_PAGE_SIZE = 1000;
/** pages de catalogue lues au maximum par synchronisation */
export const BIGBUY_MAX_CATALOG_PAGES = 20;
/** pages indexées pour la recherche en direct (index mis en cache 10 min) */
export const BIGBUY_SEARCH_INDEX_PAGES = 3;
export const BIGBUY_CACHE_TTL_MS = 10 * 60_000;
export const BIGBUY_DEFAULT_ISO = "fr";
/** taille maximale d'une réponse (le stock global peut être volumineux) */
export const BIGBUY_MAX_BYTES = 60 * 1024 * 1024;
// ---------------------------------------------------------------------------

export function bigbuyBase(sandbox: boolean, override: string | null): string {
  return override ?? (sandbox ? BIGBUY_SANDBOX_BASE : BIGBUY_API_BASE);
}

export function productsUrl(base: string, isoCode: string, page: number, pageSize = BIGBUY_PAGE_SIZE): string {
  return `${joinUrl(base, BIGBUY_PRODUCTS_PATH)}?isoCode=${encodeURIComponent(isoCode)}&page=${page}&pageSize=${pageSize}`;
}

export function productsInformationUrl(base: string, isoCode: string, page: number, pageSize = BIGBUY_PAGE_SIZE): string {
  return `${joinUrl(base, BIGBUY_PRODUCTS_INFORMATION_PATH)}?isoCode=${encodeURIComponent(isoCode)}&page=${page}&pageSize=${pageSize}`;
}

export function productsStockAvailableUrl(base: string): string {
  return joinUrl(base, BIGBUY_PRODUCTS_STOCK_AVAILABLE_PATH);
}

export function manufacturersUrl(base: string): string {
  return joinUrl(base, BIGBUY_MANUFACTURERS_PATH);
}

export function testUrl(base: string): string {
  return joinUrl(base, BIGBUY_TEST_PATH);
}

export function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
}
