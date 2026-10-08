/**
 * woocommerce-store — produit Store API → RawOffer.
 * L'API Store n'indique pas si les prix affichés incluent la TVA (réglage boutique) :
 * HT/TTC = valeur documentée par l'utilisateur. Quantité : uniquement `low_stock_remaining`.
 */
import type { RawOffer, StockStatus } from "@/domain/sourcing/types";
import type { AdapterSourceConfig } from "@/integrations/sourcing/core";
import { inferConditionFromText, str, stripHtml } from "@/integrations/sourcing/shared";
import { minorToAmount, type WcProduct } from "./parser";

const STORAGE_ATTR = /^(pa_)?(storage|stockage|capacit[ée]|m[ée]moire|memory|capacity)$/i;
const COLOR_ATTR = /^(pa_)?(color|colour|couleur|coloris)$/i;
const BRAND_ATTR = /^(pa_)?(brand|marque|manufacturer|fabricant)$/i;
const CONDITION_ATTR = /^(pa_)?(condition|[ée]tat|grade)$/i;

function attr(product: WcProduct, matcher: RegExp): string | null {
  for (const a of product.attributes ?? []) {
    const key = (a.taxonomy ?? a.name).trim();
    if (!matcher.test(key) && !matcher.test(a.name.trim())) continue;
    const terms = (a.terms ?? []).map((t) => str(t.name)).filter((x): x is string => Boolean(x));
    // Une valeur unique seulement : plusieurs termes = produit variable (attribut non tranché).
    if (terms.length === 1) return terms[0]!;
  }
  return null;
}

export function mapWcProduct(product: WcProduct, config: AdapterSourceConfig, requestUrl: string): RawOffer | null {
  const prices = product.prices ?? null;
  const price = minorToAmount(prices?.price ?? prices?.sale_price ?? prices?.regular_price, prices?.currency_minor_unit);
  const currency = str(prices?.currency_code)?.toUpperCase() ?? config.defaultCurrency ?? null;
  const lowStock = typeof product.low_stock_remaining === "number" ? Math.max(0, Math.round(product.low_stock_remaining)) : null;
  const stockStatus: StockStatus = product.is_in_stock === true ? (lowStock !== null ? "low" : "in_stock") : product.is_in_stock === false ? (product.is_on_backorder ? "unknown" : "out_of_stock") : "unknown";
  const description = stripHtml(`${product.short_description ?? ""} ${product.description ?? ""}`);
  const inferred = inferConditionFromText(`${product.name} ${description}`);
  const conditionAttr = attr(product, CONDITION_ATTR);
  const moq = product.add_to_cart?.minimum && product.add_to_cart.minimum > 1 ? Math.round(product.add_to_cart.minimum) : null;
  return {
    externalOfferId: String(product.id),
    externalProductId: String(product.id),
    title: product.name,
    price,
    currency,
    taxType: config.defaultTaxType,
    moq,
    availableQuantity: lowStock,
    stockStatus,
    url: str(product.permalink),
    brand: attr(product, BRAND_ATTR),
    storage: attr(product, STORAGE_ATTR),
    color: attr(product, COLOR_ATTR),
    grade: inferred.grade,
    condition: conditionAttr ?? inferred.condition,
    supplierSku: str(product.sku),
    country: config.defaultCountry ?? null,
    raw: {
      request_url: requestUrl,
      type: product.type ?? null,
      prices: prices ? { price: prices.price ?? null, regular_price: prices.regular_price ?? null, sale_price: prices.sale_price ?? null, currency_code: prices.currency_code ?? null, currency_minor_unit: prices.currency_minor_unit ?? null } : null,
      is_in_stock: product.is_in_stock ?? null,
      is_on_backorder: product.is_on_backorder ?? null,
      low_stock_remaining: product.low_stock_remaining ?? null,
      categories: (product.categories ?? []).map((c) => c.name ?? null).filter(Boolean).slice(0, 10),
      currency_source: str(prices?.currency_code) ? "payload" : config.defaultCurrency ? "config" : "absent",
      inferred: conditionAttr ? inferred.inferred.filter((f) => f !== "condition") : inferred.inferred,
      condition_source: conditionAttr ? "attribute" : inferred.condition ? "description" : null,
    },
  };
}
