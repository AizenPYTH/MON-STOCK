import "server-only";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { describeError } from "@/integrations/core/errors";
import { isDeadlineExceeded } from "@/integrations/core/deadline";
import type { ConnectorAuth, MarketplaceConnector } from "@/integrations/core/connector";
import type { ListingRef } from "@/integrations/core/types";
import { fetchAllRows, timeLeftMs, type SyncContext } from "@/services/sync/context";
import { resolveAlerts, upsertAlert } from "@/services/sync/alerts";

const log = createLogger("SYNC");

export interface InventoryPushResult {
  checked: number;
  changed: number;
  pushed: number;
  failed: number;
  /** Annonces NON mises à jour car leur SKU est associé à plusieurs annonces actives (S-14). */
  refusedSharedSku: number;
  /** true si l'échéance du run a interrompu l'envoi (la suite au prochain run). */
  stoppedByDeadline: boolean;
}

const MAX_PUSH_PER_RUN = 200;
/** Temps minimal restant pour un appel ReviseInventoryStatus. */
export const PUSH_MIN_REMAINING_MS = 5_000;

export const sharedSkuPushKey = (connectionId: string) => `inventory_push_shared_sku:${connectionId}`;

interface MappedListingRow {
  id: string;
  external_listing_id: string;
  external_variation_id: string;
  external_sku: string | null;
  sku_id: string | null;
  quantity_available: number | null;
  title: string;
}

export function listingRefOf(row: Pick<MappedListingRow, "external_listing_id" | "external_variation_id" | "external_sku">): ListingRef | null {
  if (!row.external_variation_id) return { externalListingId: row.external_listing_id, variationSku: null };
  // Une variation sans SKU ne peut pas être ciblée par ReviseInventoryStatus.
  if (!row.external_sku) return null;
  return { externalListingId: row.external_listing_id, variationSku: row.external_sku };
}

/** Envoie une quantité vers le canal pour UNE annonce et met à jour la ligne locale. Utilisé par l'action manuelle et le moteur. */
export async function pushQuantityToChannel(
  admin: AdminSupabaseClient,
  connector: MarketplaceConnector,
  auth: ConnectorAuth,
  listing: MappedListingRow,
  quantity: number,
  options: { deadline?: number | null } = {},
): Promise<{ quantity: number; warnings: string[] }> {
  const ref = listingRefOf(listing);
  if (!ref) {
    throw new AppError("VALIDATION", `L'annonce « ${listing.title} » est une variation sans SKU eBay : eBay ne permet pas d'en modifier la quantité sans SKU.`);
  }
  const qty = Math.max(0, Math.trunc(quantity));
  const result = await connector.updateListingInventory(auth, ref, qty, { deadline: options.deadline ?? null });
  const { error } = await admin.from("channel_listings").update({ quantity_available: qty, last_synced_at: new Date().toISOString() }).eq("id", listing.id);
  if (error) throw fromPostgrestError(error);
  log.info("quantité envoyée au canal", { listingId: listing.id, externalListingId: listing.external_listing_id, variation: listing.external_variation_id || null, quantity: qty, warnings: result.warnings.length });
  return { quantity: qty, warnings: result.warnings };
}

/**
 * Pousse les quantités du stock central vers les annonces associées dont la quantité diffère (opt-in).
 * Un SKU associé à PLUSIEURS annonces actives (ou variations) n'est jamais poussé : chaque annonce
 * recevrait la totalité du stock et eBay pourrait vendre plusieurs fois la même unité (S-14 / I-13).
 * Ces annonces sont signalées (erreur du run + alerte) ; à l'utilisateur de n'en garder qu'une associée
 * ou de gérer leur quantité à la main. Comportement explicite, documenté dans docs/ebay-setup.md.
 */
export async function pushInventory(ctx: SyncContext): Promise<InventoryPushResult> {
  const { admin } = ctx;
  const result: InventoryPushResult = { checked: 0, changed: 0, pushed: 0, failed: 0, refusedSharedSku: 0, stoppedByDeadline: false };
  const listings = await fetchAllRows((from, to) =>
    admin
      .from("channel_listings")
      .select("id, external_listing_id, external_variation_id, external_sku, sku_id, quantity_available, title")
      .eq("sales_channel_id", ctx.salesChannelId)
      .eq("organization_id", ctx.organizationId)
      .eq("status", "active")
      .eq("mapping_status", "mapped")
      .not("sku_id", "is", null)
      .order("id")
      .range(from, to),
  ).catch((e: { code?: string; message: string }) => {
    throw fromPostgrestError(e);
  });
  const rows = listings as MappedListingRow[];
  result.checked = rows.length;
  await reportSharedSkus(ctx, rows, result);
  if (rows.length === 0) return result;

  const skuIds = [...new Set(rows.map((r) => r.sku_id).filter((x): x is string => Boolean(x)))];
  const available = new Map<string, number>();
  for (let i = 0; i < skuIds.length; i += 500) {
    const { data: inv, error: invError } = await admin.from("inventory").select("sku_id, quantity_available").eq("organization_id", ctx.organizationId).in("sku_id", skuIds.slice(i, i + 500));
    if (invError) throw fromPostgrestError(invError);
    for (const r of inv ?? []) if (r.quantity_available !== null) available.set(r.sku_id, r.quantity_available);
  }

  const listingsPerSku = new Map<string, number>();
  for (const r of rows) if (r.sku_id) listingsPerSku.set(r.sku_id, (listingsPerSku.get(r.sku_id) ?? 0) + 1);

  let budget = MAX_PUSH_PER_RUN;
  for (const row of rows) {
    if (!row.sku_id) continue;
    // SKU partagé entre plusieurs annonces : refusé (déjà signalé par reportSharedSkus).
    if ((listingsPerSku.get(row.sku_id) ?? 0) > 1) continue;
    const target = available.get(row.sku_id);
    if (target === undefined) continue;
    const clamped = Math.max(0, target);
    if (row.quantity_available === clamped) continue;
    result.changed++;
    if (budget <= 0) continue;
    if (timeLeftMs(ctx) < PUSH_MIN_REMAINING_MS) {
      // Échéance du run : les annonces restantes seront mises à jour au prochain run.
      result.stoppedByDeadline = true;
      break;
    }
    budget--;
    try {
      await pushQuantityToChannel(admin, ctx.connector, ctx.auth, row, clamped, { deadline: ctx.deadlineAt ?? null });
      result.pushed++;
    } catch (e) {
      if (isDeadlineExceeded(e)) {
        // Appel non lancé ou coupé par l'échéance : la suite au prochain run.
        result.stoppedByDeadline = true;
        break;
      }
      const d = describeError(e);
      if (d.code === "AUTH_EXPIRED") throw e;
      result.failed++;
      ctx.recordError({ code: `INVENTORY_PUSH_${d.code}`, message: d.message, entityType: "listing", entityRef: row.external_listing_id + (row.external_variation_id ? ` / ${row.external_variation_id}` : ""), details: d.details });
      if (d.code === "RATE_LIMITED") {
        // Quota atteint : inutile d'enchaîner les appels (et les attentes) ; la suite au prochain run.
        ctx.recordError({ code: "INVENTORY_PUSH_STOPPED", message: "Envoi des quantités interrompu : quota d'appels eBay atteint. Les annonces restantes seront mises à jour au prochain run.", entityType: "channel" });
        break;
      }
    }
  }
  if (result.changed > MAX_PUSH_PER_RUN && !result.stoppedByDeadline) {
    ctx.recordError({ code: "INVENTORY_PUSH_LIMIT", message: `${result.changed} annonces à mettre à jour, ${MAX_PUSH_PER_RUN} envoyées sur ce run : la suite sera traitée au prochain run.`, entityType: "channel" });
  }
  return result;
}

/** Signale (erreur du run + alerte) les SKU associés à plusieurs annonces actives ; résout l'alerte sinon. */
async function reportSharedSkus(ctx: SyncContext, rows: MappedListingRow[], result: InventoryPushResult): Promise<void> {
  const bySku = new Map<string, MappedListingRow[]>();
  for (const r of rows) {
    if (!r.sku_id) continue;
    const list = bySku.get(r.sku_id) ?? [];
    list.push(r);
    bySku.set(r.sku_id, list);
  }
  const shared = [...bySku.entries()].filter(([, list]) => list.length > 1);
  if (shared.length === 0) {
    await resolveAlerts(ctx.admin, ctx.organizationId, [sharedSkuPushKey(ctx.connection.id)]);
    return;
  }
  for (const [skuId, list] of shared) {
    result.refusedSharedSku += list.length;
    ctx.recordError({
      code: "INVENTORY_PUSH_SHARED_SKU",
      message: `Quantité non envoyée : ce SKU est associé à ${list.length} annonces eBay actives (${list.map((l) => l.title).slice(0, 3).join(" ; ")}${list.length > 3 ? "…" : ""}). Envoyer le stock entier à chacune permettrait de vendre plusieurs fois la même unité.`,
      entityType: "sku",
      entityRef: skuId,
      details: { listings: list.map((l) => l.external_listing_id + (l.external_variation_id ? ` / ${l.external_variation_id}` : "")) },
    });
  }
  await upsertAlert(ctx.admin, {
    organizationId: ctx.organizationId,
    type: "inventory_push_shared_sku",
    severity: "warning",
    title: "Envoi des quantités eBay bloqué pour des SKU partagés",
    message: `${shared.length} SKU sont associés à plusieurs annonces eBay actives : leur quantité n'est pas envoyée automatiquement (risque de survente). Gardez une seule annonce associée par SKU ou gérez ces quantités dans eBay.`,
    dedupeKey: sharedSkuPushKey(ctx.connection.id),
    entityType: "channel_connection",
    entityId: ctx.connection.id,
    actionHref: "/settings/integrations/mapping",
  });
  log.warn("envoi refusé pour des SKU associés à plusieurs annonces", { connectionId: ctx.connection.id, skus: shared.length });
}
