import "server-only";
import { z } from "zod";
import type { Json } from "@/db/database.types";
import type { NormalizedOrder } from "@/integrations/core/types";
import type { OrdersWindow } from "@/integrations/ebay/cursor";
import type { SyncContext } from "@/services/sync/context";

export interface OrdersPhaseResult {
  fetched: number;
  created: number;
  updated: number;
  itemsUnmapped: number;
  movements: number;
  invalid: number;
  failed: number;
  maxModifiedSeen: Date | null;
  /** plus ancienne date de modification parmi les commandes dont l'ingestion a échoué (pour ne pas les perdre). */
  minFailedModified: Date | null;
  truncated: boolean;
}

const ingestResultSchema = z.object({
  order_id: z.string(),
  created: z.boolean(),
  status_changed: z.boolean().optional(),
  items_mapped: z.number().int().optional(),
  items_unmapped: z.number().int().optional(),
  movements: z.number().int().optional(),
});

export function orderToRpcPayload(order: NormalizedOrder): { p_order: Json; p_items: Json } {
  return {
    p_order: {
      external_order_id: order.externalOrderId,
      order_number: order.orderNumber,
      status: order.status,
      payment_status: order.paymentStatus,
      fulfillment_status: order.fulfillmentStatus,
      buyer_username: order.buyerUsername,
      currency: order.currency,
      subtotal: order.subtotal,
      shipping_total: order.shippingTotal,
      tax_total: order.taxTotal,
      fee_total: order.feeTotal,
      total: order.total,
      placed_at: order.placedAt,
      external_modified_at: order.externalModifiedAt,
      payload_hash: order.payloadHash,
    },
    p_items: order.items.map((i) => ({
      external_line_item_id: i.externalLineItemId,
      external_listing_id: i.externalListingId,
      external_variation_id: i.externalVariationId,
      external_sku: i.externalSku,
      title: i.title,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      currency: i.currency,
      total: i.total,
    })),
  };
}

export async function syncOrders(ctx: SyncContext, window: OrdersWindow): Promise<OrdersPhaseResult> {
  const { admin } = ctx;
  const result: OrdersPhaseResult = { fetched: 0, created: 0, updated: 0, itemsUnmapped: 0, movements: 0, invalid: 0, failed: 0, maxModifiedSeen: null, minFailedModified: null, truncated: false };
  const noteFailed = (modifiedAt: string | null) => {
    if (!modifiedAt) return;
    const d = new Date(modifiedAt);
    if (!result.minFailedModified || d < result.minFailedModified) result.minFailedModified = d;
  };

  for await (const page of ctx.connector.getOrders(ctx.auth, { since: window.since, until: window.until })) {
    result.fetched += page.orders.length;
    result.invalid += page.invalid.length;
    if (page.truncated) result.truncated = true;
    for (const inv of page.invalid) ctx.recordError({ code: "INVALID_ORDER", message: inv.message, entityType: "order", entityRef: inv.ref });

    for (const order of page.orders) {
      const payload = orderToRpcPayload(order);
      const { data, error } = await admin.rpc("ingest_external_order", {
        p_organization_id: ctx.organizationId,
        p_sales_channel_id: ctx.salesChannelId,
        p_connection_id: ctx.connection.id,
        p_provider: ctx.connection.provider,
        p_order: payload.p_order,
        p_items: payload.p_items,
      });
      if (error) {
        result.failed++;
        noteFailed(order.externalModifiedAt);
        ctx.recordError({ code: "ORDER_INGEST_FAILED", message: error.message, entityType: "order", entityRef: order.externalOrderId, details: { pgCode: error.code ?? null } });
        continue;
      }
      const parsed = ingestResultSchema.safeParse(data);
      if (!parsed.success) {
        result.failed++;
        noteFailed(order.externalModifiedAt);
        ctx.recordError({ code: "ORDER_INGEST_UNEXPECTED", message: "Résultat inattendu de ingest_external_order.", entityType: "order", entityRef: order.externalOrderId });
        continue;
      }
      if (parsed.data.created) result.created++;
      else result.updated++;
      result.itemsUnmapped += parsed.data.items_unmapped ?? 0;
      result.movements += parsed.data.movements ?? 0;
      if (order.externalModifiedAt) {
        const d = new Date(order.externalModifiedAt);
        if (!result.maxModifiedSeen || d > result.maxModifiedSeen) result.maxModifiedSeen = d;
      }
    }
  }
  return result;
}
