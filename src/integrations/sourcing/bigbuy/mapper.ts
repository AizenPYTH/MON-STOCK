/**
 * bigbuy — produit + information + stock → RawOffer.
 * `wholesalePrice` est documenté comme prix de gros hors TVA en EUR ; `taxRate` est le taux
 * applicable. Stock : somme des quantités par entrepôt ; délais : min/max « handling days ».
 */
import type { RawOffer } from "@/domain/sourcing/types";
import { normalizeCondition } from "@/domain/sourcing/normalizer";
import { toNumber } from "@/services/sourcing/feed-parsers";
import { str, stripHtml } from "@/integrations/sourcing/shared";
import type { BigbuyProduct, BigbuyProductInformation, BigbuyStock } from "./parser";

/** devise documentée des prix de gros BigBuy */
export const BIGBUY_CURRENCY = "EUR";

export function mapBigbuyProduct(product: BigbuyProduct, info: BigbuyProductInformation | null, stock: BigbuyStock | null, brandName: string | null, requestUrl: string): RawOffer | null {
  const title = str(info?.name);
  if (!title) return null;
  const quantities = (stock?.stocks ?? []).map((s) => toNumber(s.quantity)).filter((n): n is number => n !== null && n >= 0);
  const availableQuantity = stock ? Math.round(quantities.reduce((a, b) => a + b, 0)) : null;
  const minDays = (stock?.stocks ?? []).map((s) => toNumber(s.minHandlingDays)).filter((n): n is number => n !== null);
  const maxDays = (stock?.stocks ?? []).map((s) => toNumber(s.maxHandlingDays)).filter((n): n is number => n !== null);
  const condition = normalizeCondition(product.condition ?? null);
  const taxRate = toNumber(product.taxRate);
  return {
    externalOfferId: String(product.id),
    externalProductId: String(product.id),
    title,
    price: toNumber(product.wholesalePrice),
    currency: BIGBUY_CURRENCY,
    taxType: "ht",
    vatRate: taxRate !== null && taxRate >= 0 && taxRate <= 100 ? taxRate : null,
    availableQuantity,
    stockStatus: availableQuantity === null ? "unknown" : availableQuantity > 0 ? "in_stock" : "out_of_stock",
    deliveryMinDays: minDays.length > 0 ? Math.round(Math.min(...minDays)) : null,
    deliveryMaxDays: maxDays.length > 0 ? Math.round(Math.max(...maxDays)) : null,
    url: str(info?.url),
    ean: str(product.ean13)?.replace(/\D/g, "") || null,
    brand: brandName,
    condition: condition === "unknown" ? null : condition,
    supplierSku: str(product.sku),
    raw: {
      request_url: requestUrl,
      product: { id: product.id, sku: product.sku ?? null, ean13: product.ean13 ?? null, manufacturer: product.manufacturer ?? null, wholesalePrice: product.wholesalePrice ?? null, retailPrice: product.retailPrice ?? null, taxRate: product.taxRate ?? null, condition: product.condition ?? null },
      description_excerpt: stripHtml(info?.description).slice(0, 300) || null,
      stock: stock ? stock.stocks.map((s) => ({ quantity: s.quantity ?? null, minHandlingDays: s.minHandlingDays ?? null, maxHandlingDays: s.maxHandlingDays ?? null, warehouse: s.warehouse ?? null })) : null,
      price_basis: "wholesalePrice (hors TVA, EUR, documentation BigBuy)",
    },
  };
}
