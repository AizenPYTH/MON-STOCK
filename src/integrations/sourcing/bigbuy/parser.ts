/**
 * bigbuy — validation Zod des réponses de l'API catalogue (d'après la documentation publique).
 */
import { z } from "zod";

const numOrStr = z.union([z.number(), z.string()]);

export const bigbuyProductSchema = z.looseObject({
  id: numOrStr,
  sku: z.string().nullish(),
  ean13: numOrStr.nullish(),
  manufacturer: numOrStr.nullish(),
  wholesalePrice: numOrStr.nullish(),
  retailPrice: numOrStr.nullish(),
  taxRate: numOrStr.nullish(),
  active: z.union([z.boolean(), z.number()]).nullish(),
  condition: z.string().nullish(),
});
export type BigbuyProduct = z.infer<typeof bigbuyProductSchema>;

export const bigbuyProductInformationSchema = z.looseObject({
  id: numOrStr,
  sku: z.string().nullish(),
  name: z.string().nullish(),
  description: z.string().nullish(),
  url: z.string().nullish(),
  isoCode: z.string().nullish(),
});
export type BigbuyProductInformation = z.infer<typeof bigbuyProductInformationSchema>;

export const bigbuyStockSchema = z.looseObject({
  id: numOrStr,
  sku: z.string().nullish(),
  stocks: z.array(z.looseObject({ quantity: numOrStr.nullish(), minHandlingDays: numOrStr.nullish(), maxHandlingDays: numOrStr.nullish(), warehouse: numOrStr.nullish() })).default([]),
});
export type BigbuyStock = z.infer<typeof bigbuyStockSchema>;

export const bigbuyManufacturerSchema = z.looseObject({ id: numOrStr, name: z.string().nullish() });

function parseList<T>(text: string, schema: z.ZodType<T>, label: string): T[] {
  const json: unknown = JSON.parse(text);
  const parsed = z.array(schema).safeParse(json);
  if (!parsed.success) throw new Error(`Réponse ${label} inattendue : ${parsed.error.issues[0]?.message ?? "format invalide"}.`);
  return parsed.data;
}

export const parseBigbuyProducts = (text: string) => parseList(text, bigbuyProductSchema, "products.json");
export const parseBigbuyProductsInformation = (text: string) => parseList(text, bigbuyProductInformationSchema, "productsinformation.json");
export const parseBigbuyStock = (text: string) => parseList(text, bigbuyStockSchema, "productsstockavailable.json");
export const parseBigbuyManufacturers = (text: string) => parseList(text, bigbuyManufacturerSchema, "manufacturers.json");
