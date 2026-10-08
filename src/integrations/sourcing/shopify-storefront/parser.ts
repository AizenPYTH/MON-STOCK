/**
 * shopify-storefront — validation Zod des réponses JSON publiques Shopify.
 * Formats documentés : products.json, search/suggest.json, products/{handle}.json.
 * Tout champ absent reste null : `inventory_quantity` et `barcode` sont rarement exposés
 * publiquement et ne sont jamais déduits.
 */
import { z } from "zod";

const numOrStr = z.union([z.number(), z.string()]);

export const shopifyVariantSchema = z.looseObject({
  id: numOrStr,
  title: z.string().nullish(),
  option1: z.string().nullish(),
  option2: z.string().nullish(),
  option3: z.string().nullish(),
  sku: z.string().nullish(),
  barcode: z.string().nullish(),
  price: numOrStr.nullish(),
  compare_at_price: numOrStr.nullish(),
  available: z.boolean().nullish(),
  inventory_quantity: z.number().nullish(),
  taxable: z.boolean().nullish(),
});
export type ShopifyVariant = z.infer<typeof shopifyVariantSchema>;

export const shopifyProductSchema = z.looseObject({
  id: numOrStr,
  title: z.string(),
  handle: z.string(),
  body_html: z.string().nullish(),
  vendor: z.string().nullish(),
  product_type: z.string().nullish(),
  tags: z.union([z.array(z.string()), z.string()]).nullish(),
  variants: z.array(shopifyVariantSchema).default([]),
  options: z.array(z.looseObject({ name: z.string(), position: z.number().optional(), values: z.array(z.string()).optional() })).default([]),
});
export type ShopifyProduct = z.infer<typeof shopifyProductSchema>;

export const shopifyProductsResponseSchema = z.looseObject({ products: z.array(shopifyProductSchema) });
export const shopifyProductDetailResponseSchema = z.looseObject({ product: shopifyProductSchema });

export const shopifySuggestProductSchema = z.looseObject({
  id: numOrStr,
  title: z.string(),
  handle: z.string(),
  url: z.string().nullish(),
  price: numOrStr.nullish(),
  available: z.boolean().nullish(),
  vendor: z.string().nullish(),
  type: z.string().nullish(),
  body: z.string().nullish(),
  variants: z.array(z.looseObject({ id: numOrStr, title: z.string().nullish(), sku: z.string().nullish(), price: numOrStr.nullish(), available: z.boolean().nullish(), url: z.string().nullish() })).optional(),
});
export const shopifySuggestResponseSchema = z.looseObject({
  resources: z.looseObject({ results: z.looseObject({ products: z.array(shopifySuggestProductSchema).default([]) }) }),
});
export type ShopifySuggestProduct = z.infer<typeof shopifySuggestProductSchema>;

export function parseProductsJson(text: string): ShopifyProduct[] {
  const parsed = shopifyProductsResponseSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`Réponse products.json inattendue : ${parsed.error.issues[0]?.message ?? "format invalide"}.`);
  return parsed.data.products;
}

export function parseProductDetailJson(text: string): ShopifyProduct {
  const parsed = shopifyProductDetailResponseSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`Réponse products/{handle}.json inattendue : ${parsed.error.issues[0]?.message ?? "format invalide"}.`);
  return parsed.data.product;
}

export function parseSuggestJson(text: string): ShopifySuggestProduct[] {
  const parsed = shopifySuggestResponseSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`Réponse search/suggest.json inattendue : ${parsed.error.issues[0]?.message ?? "format invalide"}.`);
  return parsed.data.resources.results.products;
}
