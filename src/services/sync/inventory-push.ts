import "server-only";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { describeError } from "@/integrations/core/errors";
import type { ConnectorAuth, MarketplaceConnector } from "@/integrations/core/connector";
import type { ListingRef } from "@/integrations/core/types";
import type { SyncContext } from "@/services/sync/context";

const log = createLogger("SYNC");

export interface InventoryPushResult {
  checked: number;
  changed: number;
  pushed: number;
  failed: number;
}

const MAX_PUSH_PER_RUN = 200;

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
): Promise<{ quantity: number; warnings: string[] }> {
  const ref = listingRefOf(listing);
  if (!ref) {
    throw new AppError("VALIDATION", `L'annonce « ${listing.title} » est une variation sans SKU eBay : eBay ne permet pas d'en modifier la quantité sans SKU.`);
  }
  const qty = Math.max(0, Math.trunc(quantity));
  const result = await connector.updateListingInventory(auth, ref, qty);
  const { error } = await admin.from("channel_listings").update({ quantity_available: qty, last_synced_at: new Date().toISOString() }).eq("id", listing.id);
  if (error) throw fromPostgrestError(error);
  log.info("quantité envoyée au canal", { listingId: listing.id, externalListingId: listing.external_listing_id, variation: listing.external_variation_id || null, quantity: qty, warnings: result.warnings.length });
  return { quantity: qty, warnings: result.warnings };
}

/** Pousse les quantités du stock central vers les annonces associées dont la quantité diffère (opt-in). */
export async function pushInventory(ctx: SyncContext): Promise<InventoryPushResult> {
  const { admin } = ctx;
  const result: InventoryPushResult = { checked: 0, changed: 0, pushed: 0, failed: 0 };
  const { data: listings, error } = await admin
    .from("channel_listings")
    .select("id, external_listing_id, external_variation_id, external_sku, sku_id, quantity_available, title")
    .eq("sales_channel_id", ctx.salesChannelId)
    .eq("organization_id", ctx.organizationId)
    .eq("status", "active")
    .eq("mapping_status", "mapped")
    .not("sku_id", "is", null)
    .limit(5000);
  if (error) throw fromPostgrestError(error);
  const rows = (listings ?? []) as MappedListingRow[];
  result.checked = rows.length;
  if (rows.length === 0) return result;

  const skuIds = [...new Set(rows.map((r) => r.sku_id).filter((x): x is string => Boolean(x)))];
  const available = new Map<string, number>();
  for (let i = 0; i < skuIds.length; i += 500) {
    const { data: inv, error: invError } = await admin.from("inventory").select("sku_id, quantity_available").eq("organization_id", ctx.organizationId).in("sku_id", skuIds.slice(i, i + 500));
    if (invError) throw fromPostgrestError(invError);
    for (const r of inv ?? []) if (r.quantity_available !== null) available.set(r.sku_id, r.quantity_available);
  }

  let budget = MAX_PUSH_PER_RUN;
  for (const row of rows) {
    if (!row.sku_id) continue;
    const target = available.get(row.sku_id);
    if (target === undefined) continue;
    const clamped = Math.max(0, target);
    if (row.quantity_available === clamped) continue;
    result.changed++;
    if (budget <= 0) continue;
    budget--;
    try {
      await pushQuantityToChannel(admin, ctx.connector, ctx.auth, row, clamped);
      result.pushed++;
    } catch (e) {
      const d = describeError(e);
      if (d.code === "AUTH_EXPIRED") throw e;
      result.failed++;
      ctx.recordError({ code: `INVENTORY_PUSH_${d.code}`, message: d.message, entityType: "listing", entityRef: row.external_listing_id + (row.external_variation_id ? ` / ${row.external_variation_id}` : ""), details: d.details });
    }
  }
  if (result.changed > MAX_PUSH_PER_RUN) {
    ctx.recordError({ code: "INVENTORY_PUSH_LIMIT", message: `${result.changed} annonces à mettre à jour, ${MAX_PUSH_PER_RUN} envoyées sur ce run : la suite sera traitée au prochain run.`, entityType: "channel" });
  }
  return result;
}
