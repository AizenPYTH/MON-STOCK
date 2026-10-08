/**
 * woocommerce-store — validation Zod de la réponse `GET /wp-json/wc/store/v1/products`.
 * Les prix sont exprimés en unités mineures (chaîne) avec `currency_minor_unit`.
 */
import { z } from "zod";

const numOrStr = z.union([z.number(), z.string()]);

export const wcPricesSchema = z.looseObject({
  price: numOrStr.nullish(),
  regular_price: numOrStr.nullish(),
  sale_price: numOrStr.nullish(),
  currency_code: z.string().nullish(),
  currency_minor_unit: z.number().int().min(0).max(6).nullish(),
});

export const wcProductSchema = z.looseObject({
  id: numOrStr,
  name: z.string(),
  slug: z.string().nullish(),
  type: z.string().nullish(),
  permalink: z.string().nullish(),
  sku: z.string().nullish(),
  short_description: z.string().nullish(),
  description: z.string().nullish(),
  prices: wcPricesSchema.nullish(),
  is_in_stock: z.boolean().nullish(),
  is_purchasable: z.boolean().nullish(),
  is_on_backorder: z.boolean().nullish(),
  low_stock_remaining: z.number().nullish(),
  categories: z.array(z.looseObject({ id: numOrStr.optional(), name: z.string().optional(), slug: z.string().optional() })).nullish(),
  attributes: z.array(z.looseObject({ id: numOrStr.optional(), name: z.string(), taxonomy: z.string().nullish(), terms: z.array(z.looseObject({ name: z.string().optional(), slug: z.string().optional() })).optional() })).nullish(),
  add_to_cart: z.looseObject({ minimum: z.number().nullish(), maximum: z.number().nullish(), multiple: z.number().nullish() }).nullish(),
});
export type WcProduct = z.infer<typeof wcProductSchema>;

export function parseWcProducts(text: string): WcProduct[] {
  const parsed = z.array(wcProductSchema).safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`Réponse Store API inattendue : ${parsed.error.issues[0]?.message ?? "format invalide"}.`);
  return parsed.data;
}

/** « 22900 » avec 2 décimales → 229 ; null si illisible. */
export function minorToAmount(value: string | number | null | undefined, minorUnit: number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  const unit = minorUnit ?? 2;
  return Math.round(n) / 10 ** unit;
}
