import "server-only";
import { z } from "zod";
import type { Json } from "@/db/database.types";
import type { NormalizedOrder } from "@/integrations/core/types";
import type { OrdersPage } from "@/integrations/core/connector";
import { isDeadlineExceeded } from "@/integrations/core/deadline";
import { ORDERS_SLICE_HOURS, splitOrdersWindow, type OrdersProgress, type OrdersWindow } from "@/integrations/ebay/cursor";
import { timeLeftMs, type SyncContext } from "@/services/sync/context";

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
  /** true si l'échéance du run a interrompu l'import (proprement) : reprise au passage suivant. */
  stoppedByDeadline: boolean;
  /** Tranches lues ET ingérées en entier pendant ce run. */
  slicesCompleted: number;
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
    stoppedByDeadline: false,
    slicesCompleted: 0,
  };
}

export interface SyncOrdersOptions {
  /** Taille initiale des tranches (h), ORDERS_SLICE_HOURS par défaut. */
  sliceHours?: number;
  /** Une tranche tronquée est redécoupée en deux jusqu'à cette taille minimale (h). */
  minSliceHours?: number;
  /** Budget de pages pour le run (borne la durée d'exécution). */
  maxPages?: number;
  /**
   * Appelé après chaque tranche lue ET ingérée en entier, AVANT d'ouvrir la suivante : l'appelant y
   * enregistre durablement la progression (curseur). Une erreur levée ici interrompt l'import.
   */
  onSliceComplete?: (progress: OrdersPhaseResult) => Promise<void>;
}

export const ORDERS_MIN_SLICE_HOURS = 1;
export const ORDERS_MAX_PAGES_PER_RUN = 200;
/** Temps minimal restant avant l'échéance pour demander une nouvelle page de commandes. */
export const ORDERS_PAGE_MIN_REMAINING_MS = 8_000;
/** Temps minimal restant pour lancer l'ingestion d'une commande (une RPC transactionnelle). */
export const ORDER_INGEST_MIN_REMAINING_MS = 1_000;

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
 *
 * Budget de pages : une tranche n'est déclarée incomplète que s'il reste réellement des pages à
 * lire (le connecteur indique `hasMore: false` sur la dernière page) ; une tranche redécoupée et
 * relue ne compte chaque commande qu'une fois (statistiques en commandes distinctes), et une
 * commande déjà ingérée à l'identique pendant ce run n'est pas réingérée.
 */
export async function syncOrders(ctx: SyncContext, window: OrdersWindow, result: OrdersPhaseResult = emptyOrdersResult(), options: SyncOrdersOptions = {}): Promise<OrdersPhaseResult> {
  const sliceHours = options.sliceHours ?? ORDERS_SLICE_HOURS;
  const minSliceMs = (options.minSliceHours ?? ORDERS_MIN_SLICE_HOURS) * 3_600_000;
  let budget = options.maxPages ?? ORDERS_MAX_PAGES_PER_RUN;
  const queue = splitOrdersWindow(window, sliceHours);
  const seen: RunSeenOrders = { orders: new Map(), invalid: new Set() };

  while (queue.length > 0) {
    if (budget <= 0) {
      // Tranches restantes jamais ouvertes : reprises au prochain run.
      result.truncated = true;
      break;
    }
    if (timeLeftMs(ctx) < ORDERS_PAGE_MIN_REMAINING_MS) {
      // Échéance du run : on n'ouvre pas de nouvelle tranche (reprise au passage suivant).
      result.stoppedByDeadline = true;
      break;
    }
    const slice = queue.shift()!;
    let sliceTruncated = false;
    let outOfBudget = false;
    let outOfTime = false;
    try {
      for await (const page of ctx.connector.getOrders(ctx.auth, { since: slice.since, until: slice.until, deadline: ctx.deadlineAt ?? null })) {
        if (budget <= 0) {
          // Page au-delà du budget (le connecteur n'avait pas annoncé la fin) : non ingérée, tranche incomplète.
          outOfBudget = true;
          break;
        }
        budget--;
        result.pages++;
        const ingested = await ingestOrdersPage(ctx, page, result, seen, slice);
        if (!ingested) {
          // Échéance atteinte au milieu de la page : la tranche n'est PAS considérée comme lue.
          outOfTime = true;
          break;
        }
        if (page.truncated) sliceTruncated = true;
        // Budget épuisé : on ne s'arrête que s'il reste des pages (dernière page connue → tranche complète).
        if (budget <= 0 && !sliceTruncated && page.hasMore !== false) {
          outOfBudget = true;
          break;
        }
        if (page.hasMore !== false && !sliceTruncated && timeLeftMs(ctx) < ORDERS_PAGE_MIN_REMAINING_MS) {
          // Il reste des pages mais plus le temps de les lire : tranche incomplète, reprise au passage suivant.
          outOfTime = true;
          break;
        }
      }
    } catch (e) {
      // Appel coupé (ou non lancé) par l'échéance : ce n'est pas une panne eBay.
      if (!isDeadlineExceeded(e)) throw e;
      outOfTime = true;
    }
    if (outOfTime) {
      result.stoppedByDeadline = true;
      break;
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
    result.slicesCompleted++;
    // Tranche lue et ingérée en entier : la progression est enregistrée avant d'ouvrir la suivante.
    if (options.onSliceComplete) await options.onSliceComplete(result);
  }
  result.windowComplete = !result.truncated && !result.stoppedByDeadline && queue.length === 0;
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

/** Commandes déjà vues pendant ce run (une tranche redécoupée relit les mêmes pages). */
interface RunSeenOrders {
  orders: Map<string, { payloadHash: string; modifiedAt: string | null; ingested: boolean; counted: boolean; failedCounted: boolean; itemsUnmapped: number }>;
  /** commandes illisibles déjà comptées (par référence) */
  invalid: Set<string>;
}

/**
 * Ingère une page. Renvoie false si l'échéance du run a interrompu la page avant la fin (les
 * commandes déjà ingérées le restent : ingestion idempotente ; la tranche sera relue).
 */
async function ingestOrdersPage(ctx: SyncContext, page: OrdersPage, result: OrdersPhaseResult, seen: RunSeenOrders, slice: OrdersWindow): Promise<boolean> {
  const { admin } = ctx;
  const noteFailed = (modifiedAt: string | null) => {
    if (!modifiedAt) {
      result.failedWithoutDate = true;
      return;
    }
    const d = new Date(modifiedAt);
    if (!result.minFailedModified || d < result.minFailedModified) result.minFailedModified = d;
  };

  for (const inv of page.invalid) {
    // Commande illisible : c'est un ÉCHEC, jamais une commande ignorée. Le curseur ne la dépasse pas
    // (sa date de modification si elle est lisible, sinon le début de la tranche qui l'a renvoyée,
    // puisque eBay filtre sur lastmodifieddate) : elle sera relue tant qu'elle n'est pas importée.
    noteFailed(inv.modifiedAt ?? slice.since.toISOString());
    if (inv.ref) {
      if (seen.invalid.has(inv.ref)) continue;
      seen.invalid.add(inv.ref);
    }
    result.invalid++;
    ctx.recordError({
      code: "INVALID_ORDER",
      message: `${inv.message} Cette commande n'a pas été importée : vérifiez-la dans eBay. L'import des commandes ne dépassera pas sa date tant qu'elle n'aura pas pu être importée.`,
      entityType: "order",
      entityRef: inv.ref,
      ...(inv.modifiedAt ? { details: { modifiedAt: inv.modifiedAt } } : {}),
    });
  }

  for (const order of page.orders) {
    if (timeLeftMs(ctx) < ORDER_INGEST_MIN_REMAINING_MS) return false;
    const prev = seen.orders.get(order.externalOrderId);
    const modifiedAt = order.externalModifiedAt ?? null;
    // Déjà ingérée à l'identique pendant ce run (tranche relue) : rien à refaire ni à recompter.
    if (prev?.ingested && prev.payloadHash === order.payloadHash && prev.modifiedAt === modifiedAt) continue;
    if (!prev) result.fetched++;
    const entry = prev ?? { payloadHash: order.payloadHash, modifiedAt, ingested: false, counted: false, failedCounted: false, itemsUnmapped: 0 };
    entry.payloadHash = order.payloadHash;
    entry.modifiedAt = modifiedAt;
    seen.orders.set(order.externalOrderId, entry);

    const fail = (code: string, message: string, details?: Record<string, unknown>) => {
      if (!entry.failedCounted) result.failed++;
      entry.failedCounted = true;
      entry.ingested = false;
      noteFailed(order.externalModifiedAt ?? order.placedAt);
      ctx.recordError({ code, message, entityType: "order", entityRef: order.externalOrderId, ...(details ? { details } : {}) });
    };

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
      fail("ORDER_INGEST_FAILED", `Commande ${order.orderNumber ?? order.externalOrderId} non importée : ${error.message}`, { pgCode: error.code ?? null });
      continue;
    }
    const parsed = ingestResultSchema.safeParse(data);
    if (!parsed.success) {
      fail("ORDER_INGEST_UNEXPECTED", "Résultat inattendu de ingest_external_order.");
      continue;
    }
    entry.ingested = true;
    if (!entry.counted) {
      // Commandes distinctes : une commande relue (et modifiée entre-temps) n'est comptée qu'une fois.
      if (parsed.data.created) result.created++;
      else result.updated++;
      entry.counted = true;
    }
    const unmapped = parsed.data.items_unmapped ?? 0;
    result.itemsUnmapped += unmapped - entry.itemsUnmapped;
    entry.itemsUnmapped = unmapped;
    // Mouvements de stock : réellement écrits par cette ingestion (0 si déjà appliqués).
    result.movements += parsed.data.movements ?? 0;
    if (order.externalModifiedAt) {
      const d = new Date(order.externalModifiedAt);
      if (!result.maxModifiedSeen || d > result.maxModifiedSeen) result.maxModifiedSeen = d;
    }
  }
  return true;
}
