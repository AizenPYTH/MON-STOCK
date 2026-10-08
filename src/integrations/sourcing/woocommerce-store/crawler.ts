/**
 * woocommerce-store — WooCommerce Store API (publique, sans authentification, documentée
 * dans le dépôt WooCommerce : /wp-json/wc/store/v1/products). Chemins regroupés ici.
 */
import { joinUrl } from "@/integrations/sourcing/shared";

export const WC_STORE_PRODUCTS_PATH = "/wp-json/wc/store/v1/products";
/** per_page maximal documenté par l'API Store */
export const WC_PAGE_SIZE = 100;
export const WC_MAX_CATALOG_PAGES = 50;
/** pages lues au maximum pour une recherche en direct */
export const WC_MAX_SEARCH_PAGES = 2;

export function productsSearchUrl(baseUrl: string, query: string, page: number, perPage = WC_PAGE_SIZE): string {
  const params = new URLSearchParams({ search: query.trim(), per_page: String(perPage), page: String(page) });
  return `${joinUrl(baseUrl, WC_STORE_PRODUCTS_PATH)}?${params.toString()}`;
}

export function productsCatalogUrl(baseUrl: string, page: number, perPage = WC_PAGE_SIZE): string {
  const params = new URLSearchParams({ per_page: String(perPage), page: String(page) });
  return `${joinUrl(baseUrl, WC_STORE_PRODUCTS_PATH)}?${params.toString()}`;
}
