import "server-only";
import type { Json, TablesInsert } from "@/db/database.types";
import { fromPostgrestError } from "@/lib/errors";
import { variationKey } from "@/integrations/core/variation";
import type { NormalizedListing } from "@/integrations/core/types";
import { chunk, fetchAllRows, type SyncContext } from "@/services/sync/context";
import { suggestSkusForListing, type SkuCandidate } from "@/services/sync/matching";

export interface ListingsPhaseResult {
  fetched: number;
  upserted: number;
  ended: number;
  autoMapped: number;
  suggestionsCreated: number;
  invalid: number;
  /** true si toutes les pages ont été lues (sinon on ne marque rien comme terminé). */
  complete: boolean;
}

const UPSERT_CHUNK = 200;
const MAX_LISTINGS_TO_SCORE = 500;
const MAX_SKU_CANDIDATES = 5000;

type ListingRow = TablesInsert<"channel_listings">;

export function listingKey(externalListingId: string, externalVariationId: string): string {
  return `${externalListingId}\u0000${externalVariationId}`;
}

/** Transforme une annonce normalisée en lignes channel_listings (une par variation). */
export function listingToRows(ctx: Pick<SyncContext, "organizationId" | "salesChannelId" | "connection">, l: NormalizedListing, nowIso: string): ListingRow[] {
  const base = {
    organization_id: ctx.organizationId,
    sales_channel_id: ctx.salesChannelId,
    connection_id: ctx.connection.id,
    provider: ctx.connection.provider,
    external_listing_id: l.externalListingId,
    external_product_id: l.externalProductId,
    status: l.status,
    listing_url: l.listingUrl,
    image_url: l.imageUrl,
    last_synced_at: nowIso,
    ended_at: null,
  };
  if (l.variations.length === 0) {
    return [
      {
        ...base,
        external_variation_id: "",
        external_sku: l.sku,
        title: l.title,
        price: l.price,
        currency: l.currency,
        quantity_listed: l.quantityListed,
        quantity_available: l.quantityAvailable,
        quantity_sold: l.quantitySold,
        variation_attributes: {},
      },
    ];
  }
  return l.variations.map((v, index) => {
    const key = variationKey({ sku: v.sku, aspects: v.specifics }) || `#${index + 1}`;
    const specificsLabel = Object.values(v.specifics).join(" / ");
    return {
      ...base,
      external_variation_id: key,
      // Une variation sans SKU propre n'hérite PAS du SKU parent : l'associer automatiquement
      // ferait pointer toutes les variations vers le même SKU interne (double décrément).
      external_sku: v.sku ?? null,
      title: specificsLabel ? `${l.title} – ${specificsLabel}` : l.title,
      price: v.price ?? l.price,
      currency: v.currency ?? l.currency,
      quantity_listed: v.quantityListed,
      quantity_available: v.quantityAvailable,
      quantity_sold: v.quantitySold,
      variation_attributes: v.specifics as NonNullable<Json>,
    };
  });
}

export function emptyListingsResult(): ListingsPhaseResult {
  return { fetched: 0, upserted: 0, ended: 0, autoMapped: 0, suggestionsCreated: 0, invalid: 0, complete: false };
}

/**
 * Lit toutes les annonces actives, les enregistre par paquets (upsert idempotent : une page en
 * échec n'annule pas les paquets déjà écrits, et le run suivant les réécrit), puis marque
 * « terminées » les annonces absentes — UNIQUEMENT si la liste lue est complète.
 * `result` est un accumulateur conservé par l'appelant si une exception interrompt la phase.
 */
export async function syncListings(ctx: SyncContext, result: ListingsPhaseResult = emptyListingsResult()): Promise<ListingsPhaseResult> {
  const { admin, log } = ctx;
  const nowIso = new Date().toISOString();
  const seen = new Set<string>();
  let truncated = false;

  for await (const page of ctx.connector.getListings(ctx.auth)) {
    result.fetched += page.listings.length;
    result.invalid += page.invalid.length;
    for (const inv of page.invalid) ctx.recordError({ code: "INVALID_LISTING", message: inv.message, entityType: "listing", entityRef: inv.ref });
    for (const w of page.warnings) log.warn("avertissement eBay (GetMyeBaySelling)", { warning: w });
    if (page.truncated) truncated = true;
    const rows = page.listings.flatMap((l) => listingToRows(ctx, l, nowIso));
    for (const r of rows) seen.add(listingKey(r.external_listing_id, r.external_variation_id ?? ""));
    for (const part of chunk(rows, UPSERT_CHUNK)) {
      // Seules les colonnes fournies sont mises à jour : le mapping (sku_id, mapping_status…) est préservé.
      const { data, error } = await admin.from("channel_listings").upsert(part, { onConflict: "sales_channel_id,external_listing_id,external_variation_id" }).select("id");
      if (error) throw fromPostgrestError(error);
      result.upserted += data?.length ?? 0;
    }
  }
  result.complete = !truncated;
  if (truncated) {
    // Liste incomplète (limite de pages atteinte) : on ne marque rien comme terminé pour ne pas
    // « terminer » à tort des annonces réellement actives.
    ctx.recordError({ code: "LISTINGS_TRUNCATED", message: "Liste d'annonces incomplète (limite de pages atteinte) : aucune annonce n'a été marquée terminée lors de ce run.", entityType: "phase", entityRef: "listings" });
    log.warn("liste d'annonces tronquée : étape « annonces terminées » ignorée", { fetched: result.fetched });
  }

  // Annonces actives connues mais absentes de la liste active eBay → terminées (uniquement si la liste est complète).
  const active = result.complete
    ? await fetchAllRows((from, to) =>
        admin
          .from("channel_listings")
          .select("id, external_listing_id, external_variation_id")
          .eq("sales_channel_id", ctx.salesChannelId)
          .eq("organization_id", ctx.organizationId)
          .eq("status", "active")
          .order("id")
          .range(from, to),
      ).catch((e: { code?: string; message: string }) => {
        throw fromPostgrestError(e);
      })
    : [];
  const toEnd = active.filter((r) => !seen.has(listingKey(r.external_listing_id, r.external_variation_id))).map((r) => r.id);
  for (const ids of chunk(toEnd, 500)) {
    const { error } = await admin.from("channel_listings").update({ status: "ended", ended_at: nowIso, last_synced_at: nowIso }).in("id", ids).eq("organization_id", ctx.organizationId);
    if (error) throw fromPostgrestError(error);
    result.ended += ids.length;
  }

  result.autoMapped = await autoMapBySku(ctx);
  result.suggestionsCreated = await computeSuggestions(ctx);
  return result;
}

/** Association automatique UNIQUEMENT sur correspondance exacte (insensible à la casse) SKU eBay = code SKU interne. */
async function autoMapBySku(ctx: SyncContext): Promise<number> {
  const { admin } = ctx;
  const toAppError = (e: { code?: string; message: string }) => {
    throw fromPostgrestError(e);
  };
  const unmapped = await fetchAllRows((from, to) =>
    admin
      .from("channel_listings")
      .select("id, external_sku")
      .eq("sales_channel_id", ctx.salesChannelId)
      .eq("organization_id", ctx.organizationId)
      .eq("status", "active")
      .in("mapping_status", ["unmapped", "suggested"])
      .not("external_sku", "is", null)
      .order("id")
      .range(from, to),
  ).catch(toAppError);
  const candidates = unmapped.filter((l) => l.external_sku && l.external_sku.trim().length > 0);
  if (candidates.length === 0) return 0;

  const skus = await fetchAllRows((from, to) => admin.from("skus").select("id, code").eq("organization_id", ctx.organizationId).eq("is_active", true).order("id").range(from, to)).catch(toAppError);
  const byCode = new Map<string, string>();
  for (const s of skus) byCode.set(s.code.trim().toUpperCase(), s.id);

  let mapped = 0;
  for (const l of candidates) {
    const skuId = byCode.get((l.external_sku ?? "").trim().toUpperCase());
    if (!skuId) continue;
    // La RPC rattache aussi les lignes de commandes passées non résolues (sans toucher au stock).
    const { error: mapError } = await admin.rpc("map_listing_to_sku", { p_listing_id: l.id, p_sku_id: skuId, p_source: "auto_sku_match" });
    if (mapError) {
      ctx.recordError({ code: "AUTO_MAP_FAILED", message: mapError.message, entityType: "listing", entityRef: l.id });
      continue;
    }
    mapped++;
  }
  return mapped;
}

/** Calcule des suggestions (jamais appliquées) pour les annonces restées sans correspondance. */
async function computeSuggestions(ctx: SyncContext): Promise<number> {
  const { admin } = ctx;
  const { data: listings, error } = await admin
    .from("channel_listings")
    .select("id, title, external_sku, variation_attributes")
    .eq("sales_channel_id", ctx.salesChannelId)
    .eq("organization_id", ctx.organizationId)
    .eq("status", "active")
    .in("mapping_status", ["unmapped", "suggested"])
    .order("first_seen_at", { ascending: false })
    .limit(MAX_LISTINGS_TO_SCORE);
  if (error) throw fromPostgrestError(error);
  if (!listings || listings.length === 0) return 0;

  const { data: skus, error: skuError } = await admin
    .from("skus")
    .select("id, code, barcode, product:products(name, brand), variant:product_variants(name, attributes, ean, mpn)")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true)
    .limit(MAX_SKU_CANDIDATES);
  if (skuError) throw fromPostgrestError(skuError);
  const candidates: SkuCandidate[] = (skus ?? []).map((s) => {
    const attrs = s.variant?.attributes;
    const attributes: Record<string, string> = {};
    if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
      for (const [k, v] of Object.entries(attrs)) if (typeof v === "string" || typeof v === "number") attributes[k] = String(v);
    }
    return {
      skuId: s.id,
      code: s.code,
      barcode: s.barcode,
      productName: s.product?.name ?? "",
      brand: s.product?.brand ?? null,
      variantName: s.variant?.name ?? null,
      attributes,
      ean: s.variant?.ean ?? null,
      mpn: s.variant?.mpn ?? null,
    };
  });
  if (candidates.length === 0) return 0;

  const rows: TablesInsert<"mapping_suggestions">[] = [];
  const suggestedListingIds = new Set<string>();
  for (const l of listings) {
    const attrs = l.variation_attributes;
    const variationAttributes: Record<string, string> = {};
    if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
      for (const [k, v] of Object.entries(attrs)) if (typeof v === "string") variationAttributes[k] = v;
    }
    const scores = suggestSkusForListing({ title: l.title, externalSku: l.external_sku, variationAttributes }, candidates);
    for (const s of scores) {
      rows.push({ organization_id: ctx.organizationId, listing_id: l.id, sku_id: s.skuId, confidence: s.confidence, method: s.method, reasons: s.reasons, status: "pending" });
    }
    if (scores.length > 0) suggestedListingIds.add(l.id);
  }

  let created = 0;
  for (const part of chunk(rows, 500)) {
    const { data, error: insError } = await admin.from("mapping_suggestions").upsert(part, { onConflict: "listing_id,sku_id", ignoreDuplicates: true }).select("id");
    if (insError) throw fromPostgrestError(insError);
    created += data?.length ?? 0;
  }
  for (const ids of chunk([...suggestedListingIds], 500)) {
    const { error: updError } = await admin.from("channel_listings").update({ mapping_status: "suggested" }).in("id", ids).eq("mapping_status", "unmapped");
    if (updError) throw fromPostgrestError(updError);
  }
  return created;
}
