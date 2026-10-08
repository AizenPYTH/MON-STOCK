/**
 * ingram-micro — validation Zod des réponses (jeton OAuth2, catalogue, prix & disponibilité),
 * d'après la documentation publique de l'API Reseller v6.
 */
import { z } from "zod";

const numOrStr = z.union([z.number(), z.string()]);

export const ingramTokenSchema = z.looseObject({
  access_token: z.string().min(1),
  token_type: z.string().nullish(),
  expires_in: numOrStr.nullish(),
});

export const ingramCatalogItemSchema = z.looseObject({
  ingramPartNumber: z.string().nullish(),
  vendorPartNumber: z.string().nullish(),
  upcCode: z.string().nullish(),
  vendorName: z.string().nullish(),
  description: z.string().nullish(),
  extraDescription: z.string().nullish(),
  category: z.string().nullish(),
  subCategory: z.string().nullish(),
  productType: z.string().nullish(),
  discontinued: z.union([z.boolean(), z.string()]).nullish(),
  authorizedToPurchase: z.union([z.boolean(), z.string()]).nullish(),
  links: z.array(z.looseObject({ topic: z.string().nullish(), href: z.string().nullish(), type: z.string().nullish() })).nullish(),
});
export type IngramCatalogItem = z.infer<typeof ingramCatalogItemSchema>;

export const ingramCatalogResponseSchema = z.looseObject({
  recordsFound: numOrStr.nullish(),
  pageSize: numOrStr.nullish(),
  pageNumber: numOrStr.nullish(),
  catalog: z.array(ingramCatalogItemSchema).nullish(),
});

export const ingramAvailabilityByWarehouseSchema = z.looseObject({
  location: z.string().nullish(),
  warehouseId: numOrStr.nullish(),
  quantityAvailable: numOrStr.nullish(),
  quantityBackordered: numOrStr.nullish(),
});

export const ingramPriceAvailabilityItemSchema = z.looseObject({
  productStatusCode: z.string().nullish(),
  productStatusMessage: z.string().nullish(),
  ingramPartNumber: z.string().nullish(),
  vendorPartNumber: z.string().nullish(),
  upc: z.string().nullish(),
  vendorName: z.string().nullish(),
  description: z.string().nullish(),
  uom: z.string().nullish(),
  productAuthorized: z.union([z.boolean(), z.string()]).nullish(),
  availability: z
    .looseObject({
      available: z.union([z.boolean(), z.string()]).nullish(),
      totalAvailability: numOrStr.nullish(),
      availabilityByWarehouse: z.array(ingramAvailabilityByWarehouseSchema).nullish(),
    })
    .nullish(),
  pricing: z
    .looseObject({
      currencyCode: z.string().nullish(),
      retailPrice: numOrStr.nullish(),
      customerPrice: numOrStr.nullish(),
    })
    .nullish(),
});
export type IngramPriceAvailabilityItem = z.infer<typeof ingramPriceAvailabilityItemSchema>;

export function parseIngramToken(text: string): { accessToken: string; expiresInS: number | null } {
  const parsed = ingramTokenSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("Réponse du serveur de jetons inattendue (access_token absent).");
  const exp = parsed.data.expires_in === null || parsed.data.expires_in === undefined ? Number.NaN : Number(parsed.data.expires_in);
  return { accessToken: parsed.data.access_token, expiresInS: Number.isFinite(exp) && exp > 0 ? exp : null };
}

export function parseIngramCatalog(text: string): { items: IngramCatalogItem[]; recordsFound: number | null } {
  const parsed = ingramCatalogResponseSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`Réponse catalogue inattendue : ${parsed.error.issues[0]?.message ?? "format invalide"}.`);
  const rf = Number(parsed.data.recordsFound ?? Number.NaN);
  return { items: parsed.data.catalog ?? [], recordsFound: Number.isFinite(rf) ? rf : null };
}

export function parseIngramPriceAvailability(text: string): IngramPriceAvailabilityItem[] {
  const json: unknown = JSON.parse(text);
  const parsed = z.array(ingramPriceAvailabilityItemSchema).safeParse(json);
  if (!parsed.success) throw new Error(`Réponse prix & disponibilité inattendue : ${parsed.error.issues[0]?.message ?? "format invalide"}.`);
  return parsed.data;
}
