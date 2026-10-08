import { createHash } from "node:crypto";
import { z } from "zod";
import { ConnectorError } from "@/integrations/core/errors";
import type { ConnectorAuth, GetOrdersParams } from "@/integrations/core/connector";
import { normalizedOrderSchema, type NormalizedOrder, type NormalizedOrderItem, type NormalizedOrderStatus } from "@/integrations/core/types";
import { variationKey } from "@/integrations/core/variation";
import { EBAY_PROVIDER, type EbayConfig } from "@/integrations/ebay/config";
import { ebayRestGet } from "@/integrations/ebay/rest";

/**
 * Sell Fulfillment API — GET /sell/fulfillment/v1/order
 * https://developer.ebay.com/api-docs/sell/fulfillment/resources/order/methods/getOrders
 * Les montants sont renvoyés sous forme { value: "12.50", currency: "EUR" }.
 */

const amountSchema = z
  .object({
    value: z.union([z.string(), z.number()]),
    currency: z.string().optional(),
    convertedFromValue: z.union([z.string(), z.number()]).optional(),
    convertedFromCurrency: z.string().optional(),
  })
  .transform((a) => {
    const n = typeof a.value === "number" ? a.value : Number(a.value);
    return { value: Number.isFinite(n) ? n : null, currency: a.currency ?? null };
  });

const lineItemSchema = z.object({
  lineItemId: z.string().min(1),
  legacyItemId: z.string().optional(),
  legacyVariationId: z.string().optional(),
  sku: z.string().optional(),
  title: z.string().optional(),
  quantity: z.number().int().positive(),
  lineItemCost: amountSchema.optional(),
  total: amountSchema.optional(),
  lineItemFulfillmentStatus: z.string().optional(),
  variationAspects: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
});

export const ebayOrderSchema = z.object({
  orderId: z.string().min(1),
  legacyOrderId: z.string().optional(),
  creationDate: z.string(),
  lastModifiedDate: z.string().optional(),
  orderFulfillmentStatus: z.string().optional(),
  orderPaymentStatus: z.string().optional(),
  cancelStatus: z.object({ cancelState: z.string().optional() }).passthrough().optional(),
  buyer: z.object({ username: z.string().optional() }).passthrough().optional(),
  pricingSummary: z
    .object({
      priceSubtotal: amountSchema.optional(),
      deliveryCost: amountSchema.optional(),
      tax: amountSchema.optional(),
      total: amountSchema.optional(),
      fee: amountSchema.optional(),
    })
    .passthrough()
    .optional(),
  totalMarketplaceFee: amountSchema.optional(),
  lineItems: z.array(lineItemSchema).default([]),
});
export type EbayOrder = z.infer<typeof ebayOrderSchema>;

export const ebayOrdersPageSchema = z.object({
  total: z.number().int().nonnegative().optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
  next: z.string().optional(),
  orders: z.array(z.unknown()).default([]),
});

/**
 * Correspondance des statuts eBay → order_status interne.
 * Priorité : annulation > remboursement intégral > expédition > paiement.
 */
export function mapEbayOrderStatus(input: { cancelState?: string | null; paymentStatus?: string | null; fulfillmentStatus?: string | null }): NormalizedOrderStatus {
  if (input.cancelState === "CANCELED") return "cancelled";
  if (input.paymentStatus === "FULLY_REFUNDED") return "refunded";
  if (input.fulfillmentStatus === "FULFILLED") return "shipped";
  switch (input.paymentStatus) {
    case "PAID":
    case "PARTIALLY_REFUNDED":
      return "paid";
    case "PENDING":
    case "FAILED":
      return "pending";
    default:
      return input.fulfillmentStatus === "IN_PROGRESS" || input.fulfillmentStatus === "NOT_STARTED" ? "pending" : "unknown";
  }
}

function stableHash(raw: unknown): string {
  return createHash("sha256").update(JSON.stringify(raw)).digest("hex");
}

function normalizeLineItem(li: z.infer<typeof lineItemSchema>, orderCurrency: string): NormalizedOrderItem {
  const isVariation = Boolean(li.legacyVariationId) || (li.variationAspects?.length ?? 0) > 0;
  const unitPrice = li.lineItemCost?.value ?? null;
  const total = li.total?.value ?? (unitPrice !== null ? Math.round(unitPrice * li.quantity * 100) / 100 : null);
  return {
    externalLineItemId: li.lineItemId,
    externalListingId: li.legacyItemId ?? null,
    externalVariationId: isVariation ? variationKey({ sku: li.sku, aspects: li.variationAspects ?? null, fallbackId: li.legacyVariationId ?? null }) : "",
    externalSku: li.sku?.trim() ? li.sku.trim() : null,
    title: li.title ?? "",
    quantity: li.quantity,
    unitPrice,
    currency: li.lineItemCost?.currency ?? li.total?.currency ?? orderCurrency,
    total,
  };
}

/** Transforme une commande brute de l'API en NormalizedOrder validée. Lève INVALID_RESPONSE si le format est inattendu. */
export function normalizeEbayOrder(raw: unknown): NormalizedOrder {
  const parsed = ebayOrderSchema.safeParse(raw);
  if (!parsed.success) {
    const id = typeof raw === "object" && raw !== null && "orderId" in raw ? String((raw as { orderId: unknown }).orderId) : null;
    throw new ConnectorError("INVALID_RESPONSE", EBAY_PROVIDER, `Commande eBay ${id ?? "(id inconnu)"} au format inattendu : ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}.`, {
      details: { orderId: id, issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      retryable: false,
    });
  }
  const o = parsed.data;
  const ps = o.pricingSummary;
  const currency = ps?.total?.currency ?? ps?.priceSubtotal?.currency ?? o.lineItems[0]?.lineItemCost?.currency ?? "EUR";
  const status = mapEbayOrderStatus({ cancelState: o.cancelStatus?.cancelState ?? null, paymentStatus: o.orderPaymentStatus ?? null, fulfillmentStatus: o.orderFulfillmentStatus ?? null });
  const order: NormalizedOrder = {
    externalOrderId: o.orderId,
    orderNumber: o.legacyOrderId ?? null,
    status,
    paymentStatus: o.orderPaymentStatus ?? null,
    fulfillmentStatus: o.orderFulfillmentStatus ?? null,
    cancelStatus: o.cancelStatus?.cancelState ?? null,
    buyerUsername: o.buyer?.username ?? null,
    currency,
    subtotal: ps?.priceSubtotal?.value ?? null,
    shippingTotal: ps?.deliveryCost?.value ?? null,
    taxTotal: ps?.tax?.value ?? null,
    feeTotal: o.totalMarketplaceFee?.value ?? ps?.fee?.value ?? null,
    total: ps?.total?.value ?? null,
    placedAt: new Date(o.creationDate).toISOString(),
    externalModifiedAt: o.lastModifiedDate ? new Date(o.lastModifiedDate).toISOString() : null,
    payloadHash: stableHash(raw),
    items: o.lineItems.map((li) => normalizeLineItem(li, currency)),
  };
  return normalizedOrderSchema.parse(order);
}

/** Filtre lastmodifieddate:[since..until] au format attendu par eBay (ISO 8601 UTC, millisecondes). */
export function buildLastModifiedFilter(since: Date, until?: Date): string {
  const from = since.toISOString();
  return until ? `lastmodifieddate:[${from}..${until.toISOString()}]` : `lastmodifieddate:[${from}..]`;
}

export const EBAY_ORDERS_PAGE_SIZE = 100;
/** Garde-fou : 50 pages × 100 = 5 000 commandes par run. Le curseur reprend au run suivant. */
export const EBAY_ORDERS_MAX_PAGES = 50;

export interface OrdersPage {
  orders: NormalizedOrder[];
  /** Commandes ignorées car au format inattendu (comptées, jamais inventées). */
  invalid: Array<{ orderId: string | null; message: string }>;
  total: number | null;
  truncated: boolean;
}

export async function* iterateEbayOrders(config: EbayConfig, auth: ConnectorAuth, params: GetOrdersParams): AsyncGenerator<OrdersPage> {
  let offset = 0;
  for (let page = 0; page < EBAY_ORDERS_MAX_PAGES; page++) {
    const url = new URL(`${config.apiBase}/sell/fulfillment/v1/order`);
    url.searchParams.set("filter", buildLastModifiedFilter(params.since, params.until));
    url.searchParams.set("limit", String(EBAY_ORDERS_PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const json = await ebayRestGet(auth, url.toString(), "fulfillment:getOrders");
    const parsed = ebayOrdersPageSchema.safeParse(json);
    if (!parsed.success) {
      throw new ConnectorError("INVALID_RESPONSE", EBAY_PROVIDER, "Réponse inattendue de la Fulfillment API eBay (liste de commandes illisible).", {
        details: { issues: parsed.error.issues.map((i) => i.path.join(".")) },
      });
    }
    const orders: NormalizedOrder[] = [];
    const invalid: OrdersPage["invalid"] = [];
    for (const raw of parsed.data.orders) {
      try {
        orders.push(normalizeEbayOrder(raw));
      } catch (e) {
        const id = typeof raw === "object" && raw !== null && "orderId" in raw ? String((raw as { orderId: unknown }).orderId) : null;
        invalid.push({ orderId: id, message: e instanceof Error ? e.message : String(e) });
      }
    }
    const total = parsed.data.total ?? null;
    const hasNext = Boolean(parsed.data.next) && parsed.data.orders.length > 0;
    const truncated = hasNext && page === EBAY_ORDERS_MAX_PAGES - 1;
    yield { orders, invalid, total, truncated };
    if (!hasNext) return;
    offset += parsed.data.orders.length;
  }
}
