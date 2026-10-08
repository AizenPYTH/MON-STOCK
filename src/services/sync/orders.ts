import "server-only";
import { z } from "zod";
import type { Json } from "@/db/database.types";
import type { NormalizedOrder } from "@/integrations/core/types";
import type { OrdersPage } from "@/integrations/core/connector";
import { splitOrdersWindow, type OrdersProgress, type OrdersWindow } from "@/integrations/ebay/cursor";
import type { SyncContext } from "@/services/sync/context";

export interface OrdersPhaseResult extends OrdersProgress {
  fetched: number;
  created: number;
  updated: number;
  itemsUnmapped: number;
  movements: number;
  invalid: number;
  /** true si la fenêtre n'a pas pu être lue en entier (limite de pages) : la suite sera reprise au prochain run. */
  truncated: boolean;
  pages: number;
}

export function emptyOrdersResult(): OrdersPhaseResult {
  return {
    fetched: 0,
    created: 0,
    updated: 0,
    itemsUnmapped: 0,
    movements: 0,
    invalid: 0,
    failed: 0,
    pages: 0,
    maxModifiedSeen: null,
    minFailedModified: null,
    failedWithoutDate: false,
    completedUntil: null,
    windowComplete: false,
    truncated: false,
  };
}

export interface SyncOrdersOptions {
  /** Taille initiale des tranches (h). */
  sliceHours?: number;
  /** Une tranche tronquée est redécoupée en deux jusqu'à cette taille minimale (h). */
  minSliceHours?: number;
  /** Budget de pages pour le run (borne la durée d'exécution). */
  maxPages?: number;
}

export const ORDERS_DEFAULT_SLICE_HOURS = 7 * 24;
export const ORDERS_MIN_SLICE_HOURS = 1;
export const ORDERS_MAX_PAGES_PER_RUN = 200;

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

/**
 * Récupère et ingère les commandes de la fenêtre, tranche par tranche (de la plus ancienne à la
 * plus récente). Chaque commande est ingérée par la RPC transactionnelle ingest_external_order
 * (tout ou rien, idempotente) : une erreur sur une commande n'interrompt pas les suivantes.
 * `result` est un accumulateur : en cas d'exception (API indisponible au milieu de la fenêtre),
 * l'appelant conserve les compteurs et la progression déjà acquis pour calculer le curseur.
 */
export async function syncOrders(ctx: SyncContext, window: OrdersWindow, result: OrdersPhaseResult = emptyOrdersResult(), options: SyncOrdersOptions = {}): Promise<OrdersPhaseResult> {
  const sliceHours = options.sliceHours ?? ORDERS_DEFAULT_SLICE_HOURS;
  const minSliceMs = (options.minSliceHours ?? ORDERS_MIN_SLICE_HOURS) * 3_600_000;
  let budget = options.maxPages ?? ORDERS_MAX_PAGES_PER_RUN;
  const queue = splitOrdersWindow(window, sliceHours);

  while (queue.length > 0) {
    const slice = queue.shift()!;
    let sliceTruncated = false;
    let outOfBudget = false;
    for await (const page of ctx.connector.getOrders(ctx.auth, { since: slice.since, until: slice.until })) {
      budget--;
      result.pages++;
      await ingestOrdersPage(ctx, page, result);
      if (page.truncated) sliceTruncated = true;
      if (budget <= 0 && !sliceTruncated) {
        outOfBudget = true;
        break;
      }
    }
    if (outOfBudget) {
      // La tranche courante n'a peut-être pas été lue en entier : on s'arrête là.
      result.truncated = true;
      break;
    }
    if (sliceTruncated) {
      const span = slice.until.getTime() - slice.since.getTime();
      if (span > minSliceMs && budget > 0) {
        // Trop de commandes dans la tranche : on la relit en deux moitiés (ingestion idempotente).
        const mid = new Date(slice.since.getTime() + Math.floor(span / 2));
        queue.unshift({ since: slice.since, until: mid, initial: slice.initial }, { since: mid, until: slice.until, initial: slice.initial });
        continue;
      }
      result.truncated = true;
      break;
    }
    result.completedUntil = slice.until;
  }
  result.windowComplete = !result.truncated && queue.length === 0;
  if (result.truncated) {
    const resumeFrom = result.completedUntil ?? window.since;
    ctx.recordError({
      code: "ORDERS_TRUNCATED",
      message: `Import des commandes incomplet (limite de pages atteinte) : les commandes modifiées après le ${resumeFrom.toISOString()} seront reprises au prochain run.`,
      entityType: "phase",
      entityRef: "orders",
    });
  }
  return result;
}

async function ingestOrdersPage(ctx: SyncContext, page: OrdersPage, result: OrdersPhaseResult): Promise<void> {
  const { admin } = ctx;
  const noteFailed = (modifiedAt: string | null) => {
    if (!modifiedAt) {
      result.failedWithoutDate = true;
      return;
    }
    const d = new Date(modifiedAt);
    if (!result.minFailedModified || d < result.minFailedModified) result.minFailedModified = d;
  };

  result.fetched += page.orders.length;
  result.invalid += page.invalid.length;
  for (const inv of page.invalid) {
    ctx.recordError({ code: "INVALID_ORDER", message: `${inv.message} Cette commande n'a pas été importée : vérifiez-la dans eBay.`, entityType: "order", entityRef: inv.ref });
  }

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
      noteFailed(order.externalModifiedAt ?? order.placedAt);
      ctx.recordError({ code: "ORDER_INGEST_FAILED", message: `Commande ${order.orderNumber ?? order.externalOrderId} non importée : ${error.message}`, entityType: "order", entityRef: order.externalOrderId, details: { pgCode: error.code ?? null } });
      continue;
    }
    const parsed = ingestResultSchema.safeParse(data);
    if (!parsed.success) {
      result.failed++;
      noteFailed(order.externalModifiedAt ?? order.placedAt);
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
