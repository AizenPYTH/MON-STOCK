/**
 * shopify-storefront — endpoints JSON publics documentés des boutiques Shopify.
 * Aucun identifiant : ce sont les URLs que la boutique expose à tout navigateur.
 * Les chemins sont regroupés ici pour être corrigés facilement.
 */
import { joinUrl } from "@/integrations/sourcing/shared";

export const SHOPIFY_PRODUCTS_PATH = "/products.json";
export const SHOPIFY_SUGGEST_PATH = "/search/suggest.json";
export const SHOPIFY_PRODUCT_DETAIL_PATH = (handle: string) => `/products/${encodeURIComponent(handle)}.json`;
/** limite documentée de products.json */
export const SHOPIFY_PAGE_LIMIT = 250;
/** nombre maximal de suggestions produit demandées */
export const SHOPIFY_SUGGEST_LIMIT = 20;
/** fiches produit détaillées lues par recherche (chaque fiche = une requête) */
export const SHOPIFY_MAX_DETAILS_PER_SEARCH = 5;
/** pages de catalogue lues au maximum par synchronisation */
export const SHOPIFY_MAX_CATALOG_PAGES = 40;

export function productsUrl(baseUrl: string, page: number, limit = SHOPIFY_PAGE_LIMIT): string {
  return `${joinUrl(baseUrl, SHOPIFY_PRODUCTS_PATH)}?limit=${limit}&page=${page}`;
}

export function suggestUrl(baseUrl: string, query: string, limit = SHOPIFY_SUGGEST_LIMIT): string {
  const params = new URLSearchParams({ q: query.trim() });
  params.set("resources[type]", "product");
  params.set("resources[limit]", String(limit));
  params.set("resources[options][unavailable_products]", "show");
  return `${joinUrl(baseUrl, SHOPIFY_SUGGEST_PATH)}?${params.toString()}`;
}

export function productDetailUrl(baseUrl: string, handle: string): string {
  return joinUrl(baseUrl, SHOPIFY_PRODUCT_DETAIL_PATH(handle));
}
