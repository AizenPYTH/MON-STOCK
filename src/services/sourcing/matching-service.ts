import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { matchOfferToSkus, type MatchCandidate, type MatchResult } from "@/domain/sourcing/matching";
import { normalizeProduct } from "@/domain/sourcing/normalizer";
import { createLogger } from "@/lib/logger";

const log = createLogger("SOURCING_MATCHING");

export type DbClient = SupabaseClient<Database>;

export const MATCH_CANDIDATE_LIMIT = 300;

interface SkuRow {
  id: string;
  code: string;
  barcode: string | null;
  product: { name: string; brand: string | null } | null;
  variant: { name: string; attributes: unknown; condition: Database["public"]["Enums"]["product_condition"]; grade: string | null; ean: string | null; mpn: string | null } | null;
}

function toCandidate(r: SkuRow): MatchCandidate | null {
  if (!r.product || !r.variant) return null;
  const attrs = (r.variant.attributes ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof attrs[k] === "string" ? (attrs[k] as string) : null);
  return {
    skuId: r.id,
    code: r.code,
    productName: r.product.name,
    brand: r.product.brand,
    variantName: r.variant.name,
    attributes: { storage: s("storage"), color: s("color"), grade: s("grade") },
    condition: r.variant.condition,
    grade: r.variant.grade,
    ean: r.variant.ean,
    mpn: r.variant.mpn,
    barcode: r.barcode,
  };
}

const SELECT = "id, code, barcode, product:products!inner(name, brand), variant:product_variants!inner(name, attributes, condition, grade, ean, mpn)";

/** Charge des SKU candidats bornés : identifiants exacts d'abord, puis même marque, puis texte. */
export async function loadMatchCandidates(client: DbClient, organizationId: string, hints: { ean?: string | null; mpn?: string | null; supplierSku?: string | null; brand?: string | null; text?: string | null }, limit = MATCH_CANDIDATE_LIMIT): Promise<MatchCandidate[]> {
  const out = new Map<string, MatchCandidate>();
  const add = (rows: SkuRow[] | null) => {
    for (const r of rows ?? []) {
      const c = toCandidate(r);
      if (c && !out.has(c.skuId)) out.set(c.skuId, c);
    }
  };
  const base = () => client.from("skus").select(SELECT).eq("organization_id", organizationId).eq("is_active", true);

  if (hints.ean) {
    const [{ data: byEan }, { data: byBarcode }] = await Promise.all([base().eq("variant.ean", hints.ean).limit(20), base().eq("barcode", hints.ean).limit(20)]);
    add(byEan as SkuRow[] | null);
    add(byBarcode as SkuRow[] | null);
  }
  if (hints.mpn) {
    const { data } = await base().ilike("variant.mpn", hints.mpn).limit(20);
    add(data as SkuRow[] | null);
  }
  if (hints.supplierSku) {
    const { data } = await base().ilike("code", hints.supplierSku).limit(5);
    add(data as SkuRow[] | null);
  }
  if (hints.brand && out.size < limit) {
    const { data } = await base().ilike("product.brand", hints.brand).limit(limit);
    add(data as SkuRow[] | null);
  }
  if (out.size === 0 && hints.text) {
    const term = hints.text.replace(/[%_\\]/g, "").split(" ").filter((t) => t.length >= 3)[0];
    if (term) {
      const { data } = await base().ilike("product.name", `%${term}%`).limit(limit);
      add(data as SkuRow[] | null);
    }
  }
  return Array.from(out.values()).slice(0, limit);
}

export interface OfferForMatching {
  id: string;
  title_original: string;
  ean: string | null;
  mpn: string | null;
  external_product_id: string | null;
  brand: string | null;
  normalized_product_id: string | null;
  sku_id: string | null;
}

export interface SuggestResult {
  suggestions: MatchResult[];
  confirmedSkuId: string | null;
}

/**
 * Calcule les correspondances d'une offre, enregistre les suggestions (product_matches),
 * et ne confirme automatiquement QUE les correspondances par identifiant exact.
 */
export async function suggestMatchesForOffer(client: DbClient, organizationId: string, offer: OfferForMatching, options: { autoConfirmExact?: boolean; createdBy?: string | null } = {}): Promise<SuggestResult> {
  const normalized = normalizeProduct(offer.title_original, { ean: offer.ean, mpn: offer.mpn, brand: offer.brand });
  const candidates = await loadMatchCandidates(client, organizationId, { ean: normalized.ean, mpn: normalized.mpn, supplierSku: offer.external_product_id, brand: normalized.brandDisplay ?? normalized.brand, text: normalized.remainingText || offer.title_original });
  if (candidates.length === 0) return { suggestions: [], confirmedSkuId: null };
  const matches = matchOfferToSkus({ title: offer.title_original, normalized, ean: offer.ean, mpn: offer.mpn, supplierSku: offer.external_product_id }, candidates);
  const top = matches.slice(0, 3);
  if (top.length === 0) return { suggestions: [], confirmedSkuId: null };

  const { data: existing } = await client.from("product_matches").select("id, sku_id, status").eq("organization_id", organizationId).eq("offer_id", offer.id);
  const existingBySku = new Map((existing ?? []).map((m) => [m.sku_id, m]));

  let confirmedSkuId: string | null = null;
  for (const m of top) {
    const prior = existingBySku.get(m.skuId);
    const autoConfirm = Boolean(options.autoConfirmExact) && m.autoConfirmable && !offer.sku_id && !confirmedSkuId;
    if (prior) {
      if (prior.status === "rejected") continue;
      if (autoConfirm && prior.status === "suggested") {
        await client.from("product_matches").update({ status: "confirmed", decided_at: new Date().toISOString(), confidence: m.confidence, method: m.method, reasons: m.reasons }).eq("id", prior.id);
        confirmedSkuId = m.skuId;
      }
      continue;
    }
    const { error } = await client.from("product_matches").insert({
      organization_id: organizationId,
      offer_id: offer.id,
      sourcing_product_id: offer.normalized_product_id,
      sku_id: m.skuId,
      confidence: m.confidence,
      method: m.method,
      reasons: m.reasons,
      status: autoConfirm ? "confirmed" : "suggested",
      created_by: options.createdBy ?? null,
      decided_at: autoConfirm ? new Date().toISOString() : null,
    });
    if (error) {
      log.warn("product match not recorded", { offerId: offer.id, skuId: m.skuId, error: error.message });
      continue;
    }
    if (autoConfirm) confirmedSkuId = m.skuId;
  }

  if (confirmedSkuId) await applyConfirmedMatch(client, organizationId, { offerId: offer.id, skuId: confirmedSkuId, sourcingProductId: offer.normalized_product_id });
  return { suggestions: top, confirmedSkuId };
}

/** Applique une correspondance confirmée : sku_id sur l'offre et sur le produit normalisé (si libre). */
export async function applyConfirmedMatch(client: DbClient, organizationId: string, link: { offerId: string | null; skuId: string; sourcingProductId: string | null }): Promise<void> {
  if (link.offerId) await client.from("sourcing_offers").update({ sku_id: link.skuId }).eq("id", link.offerId).eq("organization_id", organizationId);
  if (link.sourcingProductId) {
    await client.from("sourcing_products").update({ sku_id: link.skuId }).eq("id", link.sourcingProductId).eq("organization_id", organizationId).is("sku_id", null);
  }
}
