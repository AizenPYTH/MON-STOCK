/**
 * google-merchant-feed — item Google Merchant → RawOffer.
 * Le prix affiché est `price` (ou `sale_price` s'il est présent et inférieur) ; la devise
 * provient de l'attribut (« 229.00 EUR »), sinon des réglages de la source. HT/TTC : Google
 * exige le prix tel qu'affiché au client (TTC dans l'UE) mais ce n'est pas garanti : réglage
 * de la source, sinon « unknown ».
 */
import type { RawOffer, StockStatus } from "@/domain/sourcing/types";
import type { AdapterSourceConfig } from "@/integrations/sourcing/core";
import type { GmcItem } from "./parser";

export function gmcAvailability(value: string | null): StockStatus {
  switch (value) {
    case "in_stock":
    case "in stock":
      return "in_stock";
    case "limited_availability":
    case "limited availability":
      return "low";
    case "out_of_stock":
    case "out of stock":
      return "out_of_stock";
    case "preorder":
    case "backorder":
      return "unknown";
    default:
      return "unknown";
  }
}

export function gmcCondition(value: string | null): "new" | "refurbished" | "used" | null {
  if (value === "new" || value === "refurbished" || value === "used") return value;
  return null;
}

export function mapGmcItem(item: GmcItem, config: AdapterSourceConfig, feedUrl: string): RawOffer {
  const sale = item.salePrice && item.price && item.salePrice.amount > 0 && item.salePrice.amount < item.price.amount ? item.salePrice : null;
  const effective = sale ?? item.price;
  const currency = effective?.currency ?? item.price?.currency ?? config.defaultCurrency ?? null;
  const shipping = item.shipping.find((s) => !config.defaultCountry || !s.country || s.country === config.defaultCountry) ?? item.shipping[0] ?? null;
  return {
    externalOfferId: item.id,
    externalProductId: item.itemGroupId ?? item.id,
    title: item.title,
    price: effective?.amount ?? null,
    currency,
    taxType: config.defaultTaxType,
    availableQuantity: item.quantity,
    stockStatus: gmcAvailability(item.availability),
    shippingCost: shipping?.price?.amount ?? null,
    shippingCurrency: shipping?.price?.currency ?? currency,
    url: item.link,
    ean: item.gtin,
    mpn: item.mpn,
    brand: item.brand,
    color: item.color,
    condition: gmcCondition(item.condition),
    supplierSku: item.id,
    country: shipping?.country ?? config.defaultCountry ?? null,
    raw: { feed_url: feedUrl, item: item.raw, availability: item.availability, sale_price_applied: sale !== null, currency_source: effective?.currency ? "feed" : config.defaultCurrency ? "config" : "absent" },
  };
}
