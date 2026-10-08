import "server-only";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json, TablesInsert } from "@/db/database.types";
import type { SourceType, StockStatus, TaxType } from "@/db/types";
import { normalizeProduct, type NormalizedProduct } from "@/domain/sourcing/normalizer";
import { validateOffer, type ValidationResult } from "@/domain/sourcing/validation";
import type { RawOffer } from "@/domain/sourcing/types";
import { getFxRate } from "@/services/sourcing/fx-rates";
import { suggestMatchesForOffer } from "@/services/sourcing/matching-service";
import { createLogger } from "@/lib/logger";

const log = createLogger("OFFER_STORAGE");

/**
 * OfferStorage — enregistre une offre normalisée et validée dans sourcing_offers.
 * Unicité : (organization_id, source_id, external_offer_id). Le prix original est
 * toujours conservé ; l'historique prix/stock est alimenté par le trigger SQL.
 */
export interface StorageContext {
  supabase: AdminSupabaseClient;
  organizationId: string;
  organizationCurrency: string;
  supplierId: string;
  sourceId: string;
  sourceType: SourceType;
  feedId?: string | null;
  defaultCurrency?: string | null;
  defaultTaxType?: TaxType;
  defaultCountry?: string | null;
  /** tente des suggestions de correspondance SKU après enregistrement */
  suggestMatches?: boolean;
  createdBy?: string | null;
  now?: Date;
}

export interface StoreOfferResult {
  outcome: "stored" | "rejected";
  offerId: string | null;
  created: boolean;
  validation: ValidationResult;
  normalized: NormalizedProduct;
  fxUnavailable: boolean;
  matchedSkuId: string | null;
}

function stockStatusOf(raw: RawOffer, quantity: number | null): StockStatus {
  if (raw.stockStatus && raw.stockStatus !== "unknown") return raw.stockStatus;
  if (quantity === null) return raw.stockStatus ?? "unknown";
  return quantity > 0 ? "in_stock" : "out_of_stock";
}

function conditionOf(raw: RawOffer, normalized: NormalizedProduct): NormalizedProduct["condition"] {
  if (raw.condition === "new" || raw.condition === "refurbished" || raw.condition === "used") return raw.condition;
  return normalized.condition;
}

export async function getOrCreateSourcingProduct(ctx: StorageContext, normalized: NormalizedProduct): Promise<{ id: string; skuId: string | null }> {
  const { supabase, organizationId } = ctx;
  const { data: existing } = await supabase.from("sourcing_products").select("id, sku_id").eq("organization_id", organizationId).eq("normalized_key", normalized.normalizedKey).maybeSingle();
  if (existing) return { id: existing.id, skuId: existing.sku_id };
  const { data: inserted, error } = await supabase
    .from("sourcing_products")
    .insert({
      organization_id: organizationId,
      normalized_key: normalized.normalizedKey,
      brand: normalized.brand,
      model: normalized.model,
      storage: normalized.storage,
      color: normalized.color,
      condition: normalized.condition,
      grade: normalized.grade,
      variant: normalized.variant,
      ean: normalized.ean,
      mpn: normalized.mpn,
      title_display: normalized.displayTitle.slice(0, 300),
      attributes: { inferred: normalized.inferred, confidence: normalized.confidence } as NonNullable<Json>,
    })
    .select("id, sku_id")
    .single();
  if (inserted) return { id: inserted.id, skuId: inserted.sku_id };
  // Course possible (même clé insérée en parallèle) : relecture.
  const { data: again } = await supabase.from("sourcing_products").select("id, sku_id").eq("organization_id", organizationId).eq("normalized_key", normalized.normalizedKey).maybeSingle();
  if (again) return { id: again.id, skuId: again.sku_id };
  throw new Error(`Produit normalisé non enregistrable : ${error?.message ?? "inconnu"}`);
}

export async function storeOffer(ctx: StorageContext, raw: RawOffer): Promise<StoreOfferResult> {
  const { supabase, organizationId } = ctx;
  const now = ctx.now ?? new Date();
  const nowIso = now.toISOString();
  const currency = (raw.currency ?? ctx.defaultCurrency ?? "").toUpperCase() || null;

  const normalized = normalizeProduct(raw.title, { brand: raw.brand, model: raw.model, storage: raw.storage, color: raw.color, grade: raw.grade, condition: typeof raw.condition === "string" ? raw.condition : null, ean: raw.ean, mpn: raw.mpn });

  const { data: existing } = await supabase
    .from("sourcing_offers")
    .select("id, original_price, original_currency, sku_id, normalized_product_id, status")
    .eq("organization_id", organizationId)
    .eq("source_id", ctx.sourceId)
    .eq("external_offer_id", raw.externalOfferId)
    .maybeSingle();

  let prices30d: number[] = [];
  if (existing && currency && existing.original_currency === currency) {
    const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const { data: hist } = await supabase.from("supplier_price_history").select("original_price").eq("offer_id", existing.id).eq("original_currency", currency).gte("recorded_at", since).order("recorded_at", { ascending: false }).limit(200);
    prices30d = (hist ?? []).map((h) => Number(h.original_price)).filter((n) => Number.isFinite(n) && n > 0);
  }
  const previousPrice = existing && currency && existing.original_currency === currency ? Number(existing.original_price) : null;

  const validation = validateOffer(
    { title: raw.title, price: raw.price, currency, moq: raw.moq ?? null, availableQuantity: raw.availableQuantity ?? null, sourceUrl: raw.url ?? null },
    { previousPrice, prices30d },
  );

  if (!validation.valid || validation.effectivePrice === null || !currency) {
    if (existing) {
      await supabase
        .from("sourcing_offers")
        .update({ status: "suspicious", anomalies: validation.anomalyCodes, last_seen_at: nowIso })
        .eq("id", existing.id);
    }
    return { outcome: "rejected", offerId: existing?.id ?? null, created: false, validation, normalized, fxUnavailable: false, matchedSkuId: null };
  }

  const fx = await getFxRate(currency, ctx.organizationCurrency);
  const fxUnavailable = fx === null;
  const normalizedPrice = fx ? Math.round(validation.effectivePrice * fx.rate * 10000) / 10000 : null;

  const product = await getOrCreateSourcingProduct(ctx, normalized);
  const quantity = validation.effectiveQuantity;
  const stockStatus = stockStatusOf(raw, quantity);
  const condition = conditionOf(raw, normalized);
  const taxType: TaxType = raw.taxType && raw.taxType !== "unknown" ? raw.taxType : ctx.defaultTaxType ?? "unknown";

  const confidence: Record<string, number> = {
    product: normalized.confidence,
    price: validation.priceRejected ? 0.3 : validation.anomalyCodes.includes("price_too_low") || validation.anomalyCodes.includes("price_too_high") ? 0.5 : 1,
    stock: quantity !== null ? 0.9 : stockStatus !== "unknown" ? 0.6 : 0,
    grade: raw.grade ? 1 : normalized.grade ? 0.8 : 0,
    condition: raw.condition === "new" || raw.condition === "refurbished" || raw.condition === "used" ? 1 : normalized.inferred.includes("condition") ? 0.6 : condition !== "unknown" ? 0.9 : 0,
    delivery: raw.deliveryMaxDays !== null && raw.deliveryMaxDays !== undefined ? 0.9 : 0,
    tax: taxType === "unknown" ? 0 : raw.taxType && raw.taxType !== "unknown" ? 1 : 0.7,
  };

  const row: TablesInsert<"sourcing_offers"> = {
    organization_id: organizationId,
    supplier_id: ctx.supplierId,
    source_id: ctx.sourceId,
    feed_id: ctx.feedId ?? null,
    source_type: ctx.sourceType,
    external_product_id: raw.externalProductId ?? raw.supplierSku ?? null,
    external_offer_id: raw.externalOfferId,
    title_original: raw.title.slice(0, 500),
    normalized_product_id: product.id,
    sku_id: existing?.sku_id ?? product.skuId ?? null,
    brand: normalized.brand,
    model: normalized.model,
    storage: normalized.storage,
    color: normalized.color,
    condition,
    grade: normalized.grade,
    ean: normalized.ean,
    mpn: normalized.mpn,
    original_price: validation.effectivePrice,
    original_currency: currency,
    normalized_price: normalizedPrice,
    normalized_currency: fx ? ctx.organizationCurrency.toUpperCase() : null,
    fx_rate: fx?.rate ?? null,
    fx_rate_date: fx?.date ?? null,
    tax_type: taxType,
    vat_rate: raw.vatRate ?? null,
    moq: validation.effectiveMoq,
    minimum_order_value: raw.minimumOrderValue ?? null,
    available_quantity: quantity,
    stock_status: stockStatus,
    shipping_cost: raw.shippingCost ?? null,
    shipping_currency: raw.shippingCost !== null && raw.shippingCost !== undefined ? (raw.shippingCurrency ?? currency).toUpperCase() : null,
    delivery_min_days: raw.deliveryMinDays ?? null,
    delivery_max_days: raw.deliveryMaxDays ?? null,
    country: raw.country?.toUpperCase().slice(0, 2) ?? ctx.defaultCountry ?? null,
    source_url: validation.effectiveUrl,
    confidence: confidence as NonNullable<Json>,
    anomalies: validation.anomalyCodes,
    status: validation.status,
    last_seen_at: nowIso,
    expired_at: null,
    raw: (raw.raw ?? null) as Json,
  };
  if (!existing) {
    row.first_seen_at = nowIso;
    row.last_price_at = nowIso;
    row.last_stock_at = quantity !== null || stockStatus !== "unknown" ? nowIso : null;
  }

  const { data: saved, error } = await supabase.from("sourcing_offers").upsert(row, { onConflict: "organization_id,source_id,external_offer_id" }).select("id, sku_id").single();
  if (error || !saved) {
    log.error("offer upsert failed", { externalOfferId: raw.externalOfferId, error: error?.message });
    throw new Error(`Offre non enregistrée (${raw.externalOfferId}) : ${error?.message ?? "inconnu"}`);
  }

  let matchedSkuId = saved.sku_id;
  if (ctx.suggestMatches !== false && !saved.sku_id) {
    try {
      const r = await suggestMatchesForOffer(supabase, organizationId, { id: saved.id, title_original: raw.title, ean: normalized.ean, mpn: normalized.mpn, external_product_id: row.external_product_id ?? null, brand: normalized.brand, normalized_product_id: product.id, sku_id: null }, { autoConfirmExact: true, createdBy: ctx.createdBy ?? null });
      matchedSkuId = r.confirmedSkuId;
    } catch (e) {
      log.warn("match suggestion failed", { offerId: saved.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { outcome: "stored", offerId: saved.id, created: !existing, validation, normalized, fxUnavailable, matchedSkuId };
}

/** Marque « expired » les offres actives d'une source non revues depuis le début d'une synchronisation. Jamais de suppression. */
export async function expireUnseenOffers(ctx: Pick<StorageContext, "supabase" | "organizationId" | "sourceId">, since: Date): Promise<number> {
  const { data, error } = await ctx.supabase
    .from("sourcing_offers")
    .update({ status: "expired", expired_at: new Date().toISOString() })
    .eq("organization_id", ctx.organizationId)
    .eq("source_id", ctx.sourceId)
    .in("status", ["active", "suspicious"])
    .lt("last_seen_at", since.toISOString())
    .select("id");
  if (error) {
    log.warn("expire unseen offers failed", { sourceId: ctx.sourceId, error: error.message });
    return 0;
  }
  return data?.length ?? 0;
}
