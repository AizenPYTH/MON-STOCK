/**
 * shopify-storefront — produit + variante → RawOffer.
 * Devise et HT/TTC ne figurent pas dans ces payloads : valeurs documentées par l'utilisateur
 * (config.defaultCurrency / defaultTaxType), sinon null / unknown. Quantité : uniquement si
 * `inventory_quantity` est présent. État / grade : détectés dans le titre + description via
 * le normaliseur et marqués comme déduits.
 */
import type { RawOffer, StockStatus } from "@/domain/sourcing/types";
import type { AdapterSourceConfig } from "@/integrations/sourcing/core";
import { inferConditionFromText, joinUrl, str, stripHtml } from "@/integrations/sourcing/shared";
import { toNumber } from "@/services/sourcing/feed-parsers";
import type { ShopifyProduct, ShopifyVariant } from "./parser";

const STORAGE_OPTION = /^(storage|stockage|capacit[ée]|m[ée]moire|memory|taille de stockage|capacity)$/i;
const COLOR_OPTION = /^(color|colour|couleur|coloris)$/i;
const CONDITION_OPTION = /^(condition|[ée]tat|grade|qualit[ée])$/i;

function optionValue(product: ShopifyProduct, variant: ShopifyVariant, matcher: RegExp): string | null {
  const values = [variant.option1, variant.option2, variant.option3];
  for (const [i, opt] of product.options.entries()) {
    const position = (opt.position ?? i + 1) - 1;
    if (matcher.test(opt.name.trim())) return str(values[position]);
  }
  return null;
}

export function mapShopifyProduct(product: ShopifyProduct, config: AdapterSourceConfig, baseUrl: string, requestUrl: string): RawOffer[] {
  const productUrl = joinUrl(baseUrl, `/products/${encodeURIComponent(product.handle)}`);
  const description = stripHtml(product.body_html);
  const inferred = inferConditionFromText(`${product.title} ${description}`);
  const variants = product.variants.length > 0 ? product.variants : [];
  return variants.map((v) => {
    const price = toNumber(v.price);
    const quantity = typeof v.inventory_quantity === "number" ? Math.max(0, Math.round(v.inventory_quantity)) : null;
    const stockStatus: StockStatus = v.available === true ? (quantity !== null && quantity === 0 ? "unknown" : "in_stock") : v.available === false ? "out_of_stock" : "unknown";
    const variantTitle = str(v.title) && v.title !== "Default Title" ? v.title : null;
    const conditionOption = optionValue(product, v, CONDITION_OPTION);
    const title = variantTitle ? `${product.title} ${variantTitle}` : product.title;
    const variantId = String(v.id);
    return {
      externalOfferId: `${product.id}:${variantId}`,
      externalProductId: String(product.id),
      title,
      price,
      currency: config.defaultCurrency ?? null,
      taxType: config.defaultTaxType,
      availableQuantity: quantity,
      stockStatus,
      url: `${productUrl}?variant=${encodeURIComponent(variantId)}`,
      ean: str(v.barcode)?.replace(/\D/g, "") || null,
      brand: str(product.vendor),
      storage: optionValue(product, v, STORAGE_OPTION),
      color: optionValue(product, v, COLOR_OPTION),
      grade: inferred.grade,
      condition: conditionOption ?? inferred.condition,
      supplierSku: str(v.sku),
      country: config.defaultCountry ?? null,
      raw: {
        request_url: requestUrl,
        handle: product.handle,
        product_type: product.product_type ?? null,
        variant: { id: variantId, title: v.title ?? null, sku: v.sku ?? null, price: v.price ?? null, compare_at_price: v.compare_at_price ?? null, available: v.available ?? null, inventory_quantity: v.inventory_quantity ?? null },
        currency_source: config.defaultCurrency ? "config" : "absent",
        inferred: conditionOption ? inferred.inferred.filter((f) => f !== "condition") : inferred.inferred,
        condition_source: conditionOption ? "option" : inferred.condition ? "description" : null,
      },
    };
  });
}
