import { z } from "zod";

/**
 * Types « domaine » normalisés : tout ce qui sort d'un connecteur est validé par
 * ces schémas Zod AVANT d'entrer dans le moteur de synchronisation. Un connecteur
 * ne manipule donc jamais directement les tables de la base.
 */

export const ORDER_STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled", "refunded", "unknown"] as const;
export type NormalizedOrderStatus = (typeof ORDER_STATUSES)[number];

export const LISTING_STATUSES = ["active", "ended", "unsold", "unknown"] as const;

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Date ISO invalide");
const nullableNumber = z.number().finite().nullable();

export const normalizedOrderItemSchema = z.object({
  externalLineItemId: z.string().min(1),
  externalListingId: z.string().min(1).nullable(),
  /** Clé de variation ('' si l'article n'a pas de variation). Voir variationKey(). */
  externalVariationId: z.string(),
  externalSku: z.string().min(1).nullable(),
  title: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: nullableNumber,
  currency: z.string().length(3).nullable(),
  total: nullableNumber,
});
export type NormalizedOrderItem = z.infer<typeof normalizedOrderItemSchema>;

export const normalizedOrderSchema = z.object({
  externalOrderId: z.string().min(1),
  orderNumber: z.string().nullable(),
  status: z.enum(ORDER_STATUSES),
  paymentStatus: z.string().nullable(),
  fulfillmentStatus: z.string().nullable(),
  cancelStatus: z.string().nullable(),
  buyerUsername: z.string().nullable(),
  currency: z.string().length(3),
  subtotal: nullableNumber,
  shippingTotal: nullableNumber,
  taxTotal: nullableNumber,
  feeTotal: nullableNumber,
  total: nullableNumber,
  placedAt: isoDate,
  externalModifiedAt: isoDate.nullable(),
  payloadHash: z.string().min(1),
  items: z.array(normalizedOrderItemSchema),
});
export type NormalizedOrder = z.infer<typeof normalizedOrderSchema>;

export const normalizedListingVariationSchema = z.object({
  sku: z.string().min(1).nullable(),
  specifics: z.record(z.string(), z.string()),
  quantityListed: z.number().int().nullable(),
  quantitySold: z.number().int().nullable(),
  quantityAvailable: z.number().int().nullable(),
  price: nullableNumber,
  currency: z.string().length(3).nullable(),
});
export type NormalizedListingVariation = z.infer<typeof normalizedListingVariationSchema>;

export const normalizedListingSchema = z.object({
  externalListingId: z.string().min(1),
  title: z.string(),
  sku: z.string().min(1).nullable(),
  externalProductId: z.string().nullable(),
  quantityListed: z.number().int().nullable(),
  quantitySold: z.number().int().nullable(),
  quantityAvailable: z.number().int().nullable(),
  price: nullableNumber,
  currency: z.string().length(3).nullable(),
  listingUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  status: z.enum(LISTING_STATUSES),
  startedAt: isoDate.nullable(),
  endsAt: isoDate.nullable(),
  variations: z.array(normalizedListingVariationSchema),
});
export type NormalizedListing = z.infer<typeof normalizedListingSchema>;

export const accountInfoSchema = z.object({
  externalAccountId: z.string().min(1),
  username: z.string().min(1),
  accountType: z.string().nullable(),
  registrationMarketplaceId: z.string().nullable(),
});
export type AccountInfo = z.infer<typeof accountInfoSchema>;

export const tokenSetSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.date(),
  refreshToken: z.string().min(1).nullable(),
  refreshTokenExpiresAt: z.date().nullable(),
  tokenType: z.string(),
});
export type TokenSet = z.infer<typeof tokenSetSchema>;

/** Référence d'une annonce (ou d'une variation) sur le canal. */
export interface ListingRef {
  externalListingId: string;
  /** SKU de la variation (eBay identifie les variations par leur SKU). null = annonce sans variation. */
  variationSku: string | null;
}

export interface InventoryLevel {
  ref: ListingRef;
  quantityAvailable: number | null;
}

export interface UpdateInventoryResult {
  ok: true;
  quantity: number;
  /** Avertissements renvoyés par l'API (jamais vides si l'API en a renvoyé). */
  warnings: string[];
}
