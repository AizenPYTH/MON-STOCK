/**
 * ingram-micro — élément catalogue + prix & disponibilité → RawOffer.
 * Prix = `pricing.customerPrice` dans `pricing.currencyCode` (prix revendeur négocié du
 * compte) ; HT/TTC non précisé par l'API → réglage de la source. Quantité =
 * `availability.totalAvailability` ; aucun élément sans prix n'est produit.
 */
import type { RawOffer, StockStatus } from "@/domain/sourcing/types";
import type { AdapterSourceConfig } from "@/integrations/sourcing/core";
import { digits, str } from "@/integrations/sourcing/shared";
import { toNumber } from "@/services/sourcing/feed-parsers";
import type { IngramCatalogItem, IngramPriceAvailabilityItem } from "./parser";

function truthy(v: boolean | string | null | undefined): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  return /^(true|yes|y|1)$/i.test(v) ? true : /^(false|no|n|0)$/i.test(v) ? false : null;
}

export function mapIngramOffer(pa: IngramPriceAvailabilityItem, catalog: IngramCatalogItem | null, config: AdapterSourceConfig, requestUrl: string): RawOffer | null {
  const partNumber = str(pa.ingramPartNumber) ?? str(catalog?.ingramPartNumber);
  if (!partNumber) return null;
  if (pa.productStatusCode && /^e$/i.test(pa.productStatusCode)) return null; // erreur produit : aucune donnée fiable
  const price = toNumber(pa.pricing?.customerPrice);
  const currency = str(pa.pricing?.currencyCode)?.toUpperCase() ?? config.defaultCurrency ?? null;
  if (price === null) return null;
  const title = str(pa.description) ?? str(catalog?.description);
  if (!title) return null;
  const total = toNumber(pa.availability?.totalAvailability);
  const available = truthy(pa.availability?.available);
  const availableQuantity = total !== null && total >= 0 ? Math.round(total) : null;
  const stockStatus: StockStatus = availableQuantity !== null ? (availableQuantity > 0 ? "in_stock" : "out_of_stock") : available === true ? "in_stock" : available === false ? "out_of_stock" : "unknown";
  const vendorPart = str(pa.vendorPartNumber) ?? str(catalog?.vendorPartNumber);
  const upc = digits(pa.upc ?? catalog?.upcCode);
  const link = catalog?.links?.find((l) => l.href && /^https?:\/\//i.test(l.href))?.href ?? null;
  return {
    externalOfferId: partNumber,
    externalProductId: partNumber,
    title: catalog?.extraDescription ? `${title} ${catalog.extraDescription}`.trim() : title,
    price,
    currency,
    taxType: config.defaultTaxType,
    availableQuantity,
    stockStatus,
    url: link,
    ean: upc,
    mpn: vendorPart,
    brand: str(pa.vendorName) ?? str(catalog?.vendorName),
    supplierSku: partNumber,
    country: config.defaultCountry ?? null,
    raw: {
      request_url: requestUrl,
      ingramPartNumber: partNumber,
      vendorPartNumber: vendorPart,
      upc: pa.upc ?? catalog?.upcCode ?? null,
      pricing: pa.pricing ? { currencyCode: pa.pricing.currencyCode ?? null, customerPrice: pa.pricing.customerPrice ?? null, retailPrice: pa.pricing.retailPrice ?? null } : null,
      availability: pa.availability ? { available: pa.availability.available ?? null, totalAvailability: pa.availability.totalAvailability ?? null, warehouses: (pa.availability.availabilityByWarehouse ?? []).map((w) => ({ location: w.location ?? null, quantityAvailable: w.quantityAvailable ?? null })).slice(0, 20) } : null,
      productStatusCode: pa.productStatusCode ?? null,
      category: catalog?.category ?? null,
      discontinued: catalog?.discontinued ?? null,
      price_basis: "pricing.customerPrice (prix revendeur du compte, API Reseller v6)",
    },
  };
}
