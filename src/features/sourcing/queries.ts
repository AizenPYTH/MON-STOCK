import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { Json } from "@/db/database.types";
import { freshness, priceHistoryStats, normalizeTax } from "@/domain/sourcing/pricing";
import { detectOpportunities } from "@/domain/sourcing/opportunities";
import { computeLandedCost, computeMargin } from "@/domain/pricing/margin";
import { getMarginContext } from "@/features/stock/queries";
import { alertCriteriaSchema, type AlertCriteria } from "@/services/sourcing/alerts";
import { matchOfferToSkus, type MatchResult } from "@/domain/sourcing/matching";
import { normalizeProduct } from "@/domain/sourcing/normalizer";
import { loadMatchCandidates } from "@/services/sourcing/matching-service";
import { loadRecentPriceHistory } from "@/services/sourcing/price-history-query";
import { readOfferProvenance } from "@/features/sourcing/provenance";
import { computePriceInsights, mergeHistories, type PriceInsights } from "@/domain/sourcing/price-insights";
import { groupPriceHistory, summarizeSupplierHistories, type SupplierHistorySummary } from "@/domain/sourcing/price-history";
import { assessOfferConfidence } from "@/domain/sourcing/confidence";

export const DETAIL_HISTORY_WINDOW_DAYS = 90;
export const DETAIL_SIBLING_OFFERS = 30;

/**
 * Prix habituel observé (offre seule, et produit normalisé tous fournisseurs confondus) + historique
 * par fournisseur, à partir des derniers relevés de chaque offre sur 90 jours (loadRecentPriceHistory).
 */
async function loadDetailPriceInsights(ctx: OrgContext, offer: { id: string; normalized_product_id: string | null; supplier_id: string; supplierName: string }, currentPrice: number | null): Promise<{ offerInsights: PriceInsights; productInsights: PriceInsights | null; supplierHistories: SupplierHistorySummary[]; siblingCount: number }> {
  const orgId = ctx.organization.id;
  const orgCurrency = ctx.organization.default_currency;
  const now = new Date();
  let siblings: Array<{ id: string; supplierId: string; supplierName: string; sourceId: string }> = [{ id: offer.id, supplierId: offer.supplier_id, supplierName: offer.supplierName, sourceId: "" }];
  if (offer.normalized_product_id) {
    const { data } = await ctx.supabase.from("sourcing_offers").select("id, supplier_id, source_id, supplier:suppliers(name)").eq("organization_id", orgId).eq("normalized_product_id", offer.normalized_product_id).order("last_seen_at", { ascending: false }).limit(DETAIL_SIBLING_OFFERS);
    const list = (data ?? []).map((o) => ({ id: o.id, supplierId: o.supplier_id, supplierName: o.supplier?.name ?? "Fournisseur", sourceId: o.source_id }));
    if (!list.some((o) => o.id === offer.id)) list.push(siblings[0]!);
    siblings = list;
  }
  const since = new Date(now.getTime() - DETAIL_HISTORY_WINDOW_DAYS * 86_400_000).toISOString();
  // Derniers relevés de CHAQUE offre (du plus récent au plus ancien, bornés par offre) : une requête
  // groupée triée du plus ancien au plus récent perdait les relevés récents au-delà de 1 000 lignes.
  const history = await loadRecentPriceHistory(ctx.supabase, orgId, siblings.map((o) => o.id), since);
  const byOffer = groupPriceHistory(history.rows, orgCurrency);
  const options = { now, currency: orgCurrency, windowDays: DETAIL_HISTORY_WINDOW_DAYS };
  const offerInsights = computePriceInsights(byOffer.get(offer.id) ?? [], currentPrice, options);
  const productInsights = siblings.length > 1 ? computePriceInsights(mergeHistories(siblings.map((o) => ({ offerId: o.id, sourceId: o.sourceId || null, points: byOffer.get(o.id) ?? [] }))), currentPrice, options) : null;
  return { offerInsights, productInsights, supplierHistories: summarizeSupplierHistories(siblings, byOffer), siblingCount: siblings.length };
}

export const MATCHES_PAGE_SIZE = 30;

export async function getOfferDetail(ctx: OrgContext, offerId: string) {
  const orgId = ctx.organization.id;
  const { data: offer } = await ctx.supabase
    .from("sourcing_offers")
    .select("*, supplier:suppliers(id, name, country, internal_score, average_lead_time_days, website), source:supplier_sources(id, name, source_type, status, base_url, config, last_successful_sync_at, automated_access_confirmed), sku:skus(id, code, sale_price, cost_price, currency, product:products(name), variant:product_variants(name))")
    .eq("organization_id", orgId)
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) return null;
  const [{ data: priceHistory }, { data: stockHistory }, { data: matches }, marginCtx, { data: stats }] = await Promise.all([
    ctx.supabase.from("supplier_price_history").select("*").eq("offer_id", offerId).order("recorded_at", { ascending: false }).limit(100),
    ctx.supabase.from("supplier_stock_history").select("*").eq("offer_id", offerId).order("recorded_at", { ascending: false }).limit(100),
    ctx.supabase.from("product_matches").select("*, sku:skus(id, code, product:products(name), variant:product_variants(name))").eq("offer_id", offerId).order("confidence", { ascending: false }),
    getMarginContext(ctx),
    offer.sku_id ? ctx.supabase.from("v_stock_overview").select("sale_price, avg_sale_price_30d, cost_price").eq("sku_id", offer.sku_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const settings = (ctx.organization.settings ?? {}) as { vat_rate?: number | null };
  const vatRate = typeof settings.vat_rate === "number" ? settings.vat_rate : null;
  const orgCurrency = ctx.organization.default_currency;
  const ph = (priceHistory ?? []).map((p) => ({ price: Number(p.original_price), recordedAt: p.recorded_at }));
  const priceStats = priceHistoryStats(ph);
  const prevStock = (stockHistory ?? []).slice(1).map((s) => ({ availableQuantity: s.available_quantity, stockStatus: s.stock_status, recordedAt: s.recorded_at }));
  const opportunities = detectOpportunities({ price: Number(offer.original_price), currency: offer.original_currency, availableQuantity: offer.available_quantity, stockStatus: offer.stock_status }, ph, prevStock);
  const normalizedUnitPrice = offer.normalized_price ?? (offer.original_currency.toUpperCase() === orgCurrency.toUpperCase() ? Number(offer.original_price) : null);
  const tax = normalizedUnitPrice !== null ? normalizeTax(normalizedUnitPrice, offer.tax_type, "ht", vatRate) : null;
  const comparableUnitPrice = tax?.amount ?? null;
  const landed = comparableUnitPrice !== null ? computeLandedCost({ unitPrice: comparableUnitPrice, quantity: Math.max(1, offer.moq ?? 1), shippingCost: offer.shipping_cost, importFees: null }) : null;
  const salePrice = stats?.sale_price ?? stats?.avg_sale_price_30d ?? null;
  const sourceCfg = (offer.source?.config ?? {}) as Record<string, unknown>;
  const conf = (offer.confidence ?? {}) as Record<string, unknown>;
  const confNum = (k: string): number | null => (typeof conf[k] === "number" && Number.isFinite(conf[k]) ? (conf[k] as number) : null);
  const sourceDiscovered = sourceCfg.discovered === true;
  const confidenceBadge = assessOfferConfidence({ lastSeenAt: offer.last_seen_at, status: offer.status, priceConfidence: confNum("price"), stockConfidence: confNum("stock"), stockKnown: offer.available_quantity !== null || offer.stock_status !== "unknown", sourceDiscovered, sourceValidated: sourceDiscovered ? offer.source?.automated_access_confirmed ?? false : undefined });
  const priceInsights = await loadDetailPriceInsights(ctx, { id: offer.id, normalized_product_id: offer.normalized_product_id, supplier_id: offer.supplier_id, supplierName: offer.supplier?.name ?? "Fournisseur" }, normalizedUnitPrice);
  const margin = salePrice !== null && comparableUnitPrice !== null ? computeMargin({ salePrice, costPrice: landed && landed.unitLandedCost !== null ? landed.unitLandedCost : comparableUnitPrice, feePercent: marginCtx.feePercent, paymentFeePercent: marginCtx.paymentFeePercent, paymentFeeFixed: marginCtx.paymentFeeFixed, shippingCost: marginCtx.shippingCost }) : null;
  return {
    offer,
    priceHistory: priceHistory ?? [],
    stockHistory: stockHistory ?? [],
    matches: matches ?? [],
    priceStats,
    opportunities,
    freshness: freshness(offer.last_seen_at),
    normalizedUnitPrice,
    comparableUnitPrice,
    taxNote: tax?.note ?? null,
    landed,
    salePrice,
    salePriceSource: stats?.sale_price !== null && stats?.sale_price !== undefined ? ("sku" as const) : stats?.avg_sale_price_30d !== null && stats?.avg_sale_price_30d !== undefined ? ("average_30d" as const) : null,
    skuCostPrice: stats?.cost_price ?? null,
    margin,
    vatRate,
    orgCurrency,
    confidence: (offer.confidence ?? {}) as Record<string, number>,
    provenance: readOfferProvenance(offer, offer.source),
    confidenceBadge,
    priceInsights,
  };
}

export type OfferDetail = NonNullable<Awaited<ReturnType<typeof getOfferDetail>>>;

export interface AlertView {
  id: string;
  name: string;
  query_text: string;
  criteria: AlertCriteria;
  is_active: boolean;
  last_checked_at: string | null;
  last_triggered_at: string | null;
  created_at: string;
  sku: { code: string } | null;
  events: Array<{ id: string; kind: string; message: string; triggered_at: string; seen_at: string | null; offer_id: string; offer: { title_original: string; supplier: { name: string } | null } | null }>;
  unseenCount: number;
}

export function parseCriteria(json: Json): AlertCriteria {
  const r = alertCriteriaSchema.safeParse(json ?? {});
  return r.success ? r.data : {};
}

export async function listSourcingAlerts(ctx: OrgContext): Promise<AlertView[]> {
  const orgId = ctx.organization.id;
  const [{ data: alerts }, { data: events }] = await Promise.all([
    ctx.supabase.from("sourcing_alerts").select("*, sku:skus(code)").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(200),
    ctx.supabase.from("sourcing_alert_events").select("id, alert_id, kind, message, triggered_at, seen_at, offer_id, offer:sourcing_offers(title_original, supplier:suppliers(name))").eq("organization_id", orgId).order("triggered_at", { ascending: false }).limit(500),
  ]);
  const byAlert = new Map<string, AlertView["events"]>();
  for (const e of events ?? []) byAlert.set(e.alert_id, [...(byAlert.get(e.alert_id) ?? []), e]);
  return (alerts ?? []).map((a) => {
    const ev = (byAlert.get(a.id) ?? []).slice(0, 20);
    return { id: a.id, name: a.name, query_text: a.query_text, criteria: parseCriteria(a.criteria), is_active: a.is_active, last_checked_at: a.last_checked_at, last_triggered_at: a.last_triggered_at, created_at: a.created_at, sku: a.sku, events: ev, unseenCount: (byAlert.get(a.id) ?? []).filter((e) => !e.seen_at).length };
  });
}

export async function getSourcingAlert(ctx: OrgContext, id: string) {
  const { data } = await ctx.supabase.from("sourcing_alerts").select("*").eq("organization_id", ctx.organization.id).eq("id", id).maybeSingle();
  return data ?? null;
}

export async function listPendingMatches(ctx: OrgContext, page = 1) {
  const from = (page - 1) * MATCHES_PAGE_SIZE;
  const { data, count } = await ctx.supabase
    .from("product_matches")
    .select("*, offer:sourcing_offers(id, title_original, original_price, original_currency, normalized_price, normalized_currency, status, supplier:suppliers(name)), sku:skus(id, code, product:products(name), variant:product_variants(name)), sourcing_product:sourcing_products(title_display)", { count: "exact" })
    .eq("organization_id", ctx.organization.id)
    .eq("status", "suggested")
    .order("confidence", { ascending: false })
    .range(from, from + MATCHES_PAGE_SIZE - 1);
  return { rows: data ?? [], total: count ?? 0, page, pageSize: MATCHES_PAGE_SIZE };
}

export async function countPendingMatches(ctx: OrgContext): Promise<number> {
  const { count } = await ctx.supabase.from("product_matches").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).eq("status", "suggested");
  return count ?? 0;
}

export async function countUnseenAlertEvents(ctx: OrgContext): Promise<number> {
  const { count } = await ctx.supabase.from("sourcing_alert_events").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).is("seen_at", null);
  return count ?? 0;
}

export interface OfferMatchSuggestion extends MatchResult {
  label: string;
}

/** Suggestions de correspondance pour une offre (calcul à la demande, sans écriture). */
export async function getOfferMatchSuggestions(ctx: OrgContext, offer: { id: string; title_original: string; ean: string | null; mpn: string | null; external_product_id: string | null; brand: string | null }): Promise<OfferMatchSuggestion[]> {
  const normalized = normalizeProduct(offer.title_original, { ean: offer.ean, mpn: offer.mpn, brand: offer.brand });
  const candidates = await loadMatchCandidates(ctx.supabase, ctx.organization.id, { ean: normalized.ean, mpn: normalized.mpn, supplierSku: offer.external_product_id, brand: normalized.brandDisplay ?? normalized.brand, text: normalized.remainingText || offer.title_original });
  const byId = new Map(candidates.map((c) => [c.skuId, c]));
  return matchOfferToSkus({ title: offer.title_original, normalized, ean: offer.ean, mpn: offer.mpn, supplierSku: offer.external_product_id }, candidates)
    .slice(0, 5)
    .map((m) => {
      const c = byId.get(m.skuId);
      return { ...m, label: c ? `${c.productName}${c.variantName && c.variantName !== "Standard" ? ` · ${c.variantName}` : ""}` : m.code };
    });
}
