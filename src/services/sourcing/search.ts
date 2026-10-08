import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { Json } from "@/db/database.types";
import { parseQuery, type ParsedQuery } from "@/domain/sourcing/query-parser";
import { normalizeProduct } from "@/domain/sourcing/normalizer";
import { comparablePrice, freshness, normalizeTax, type ComparablePrice, type Freshness } from "@/domain/sourcing/pricing";
import { computeDataCompleteness, rankOffers, scoreOffers, type OfferScore, type RankingMode } from "@/domain/sourcing/scoring";
import { computeLandedCost, computeMargin, type LandedCostResult, type MarginResult } from "@/domain/pricing/margin";
import { getMarginContext } from "@/features/stock/queries";
import { findOffers, type OfferFilters, type OfferQueryStage, type OfferWithRelations } from "@/services/sourcing/offer-query";
import { createLogger } from "@/lib/logger";

const log = createLogger("SOURCING_SEARCH");

export const SEARCH_PAGE_SIZE = 20;

export interface SearchSku {
  id: string;
  code: string;
  productName: string;
  brand: string | null;
  variantName: string | null;
  attributes: Record<string, string>;
  condition: string | null;
  grade: string | null;
  ean: string | null;
  mpn: string | null;
  costPrice: number | null;
  salePrice: number | null;
  avgSalePrice30d: number | null;
  currency: string;
}

export interface MarginExplanation {
  salePrice: number;
  salePriceSource: "sku" | "average_30d";
  cost: number;
  costLabel: string;
  result: MarginResult;
  formula: string;
}

export interface SearchOfferView {
  offer: OfferWithRelations;
  supplierName: string;
  supplierCountry: string | null;
  supplierScore: number | null;
  /** prix unitaire dans la devise de l'organisation (null si conversion indisponible) */
  normalizedUnitPrice: number | null;
  /** prix de comparaison (HT si possible) */
  comparableUnitPrice: number | null;
  comparableNote: string | null;
  comparable: ComparablePrice | null;
  fxUnavailable: boolean;
  landedCost: LandedCostResult | null;
  landedQuantity: number;
  margin: MarginExplanation | null;
  marginUnavailableReason: string | null;
  freshness: Freshness;
  score: OfferScore;
  dataCompleteness: number;
  savingsPerUnit: number | null;
}

export interface SearchAggregates {
  count: number;
  bestPrice: number | null;
  bestOfferScore: number | null;
  bestMargin: number | null;
  averagePrice: number | null;
  maxPrice: number | null;
  currency: string;
}

export interface SourceStatusItem {
  id: string;
  kind: "source" | "feed" | "connection";
  name: string;
  supplierName: string;
  sourceType: string;
  status: string;
  connected: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface SearchResult {
  parsed: ParsedQuery;
  stage: OfferQueryStage;
  sku: SearchSku | null;
  views: SearchOfferView[];
  page: number;
  pageSize: number;
  total: number;
  aggregates: SearchAggregates;
  sources: SourceStatusItem[];
  connectedSources: number;
  vatRate: number | null;
  requestedQuantity: number;
}

export interface SearchInput {
  query: string;
  skuCode?: string | null;
  filters: OfferFilters;
}

async function loadSku(ctx: OrgContext, code: string): Promise<SearchSku | null> {
  const { data: row } = await ctx.supabase.from("v_stock_overview").select("sku_id, code, product_name, brand, variant_name, variant_id, condition, grade, cost_price, sale_price, avg_sale_price_30d, currency").eq("organization_id", ctx.organization.id).ilike("code", code.replace(/[%_\\]/g, "")).maybeSingle();
  if (!row || !row.sku_id) return null;
  const { data: variant } = await ctx.supabase.from("product_variants").select("attributes, ean, mpn").eq("id", row.variant_id ?? "").maybeSingle();
  const attrs = (variant?.attributes ?? {}) as Record<string, unknown>;
  const attributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) if (typeof v === "string") attributes[k] = v;
  return {
    id: row.sku_id,
    code: row.code ?? code,
    productName: row.product_name ?? "",
    brand: row.brand,
    variantName: row.variant_name,
    attributes,
    condition: row.condition,
    grade: row.grade,
    ean: variant?.ean ?? null,
    mpn: variant?.mpn ?? null,
    costPrice: row.cost_price,
    salePrice: row.sale_price,
    avgSalePrice30d: row.avg_sale_price_30d,
    currency: row.currency ?? ctx.organization.default_currency,
  };
}

function parsedFromSku(sku: SearchSku): ParsedQuery {
  const n = normalizeProduct(`${sku.brand ?? ""} ${sku.productName} ${sku.variantName ?? ""}`, { brand: sku.brand, storage: sku.attributes.storage, color: sku.attributes.color, grade: sku.attributes.grade ?? sku.grade, condition: sku.condition, ean: sku.ean, mpn: sku.mpn });
  const base = parseQuery(`${sku.brand ?? ""} ${sku.productName} ${sku.variantName ?? ""}`);
  return {
    ...base,
    raw: sku.code,
    kind: n.ean ? "ean" : n.model && !n.inferred.includes("model") ? "structured" : base.kind,
    ean: n.ean,
    mpn: n.mpn,
    criteria: { brand: n.brand, model: n.inferred.includes("model") ? null : n.model, storage: n.storage, color: n.color, grade: n.grade, condition: n.inferred.includes("condition") ? "unknown" : n.condition },
    normalized: n,
  };
}

export async function listSourceStatuses(ctx: OrgContext): Promise<SourceStatusItem[]> {
  const orgId = ctx.organization.id;
  const [{ data: sources }, { data: feeds }, { data: connections }] = await Promise.all([
    ctx.supabase.from("supplier_sources").select("id, name, source_type, status, last_sync_at, last_error, supplier:suppliers(name)").eq("organization_id", orgId).order("created_at").limit(200),
    ctx.supabase.from("supplier_feeds").select("id, format, status, last_sync_at, last_error, url, supplier:suppliers(name), source:supplier_sources(name)").eq("organization_id", orgId).order("created_at").limit(200),
    ctx.supabase.from("supplier_connections").select("id, connector_key, status, last_sync_at, last_error, supplier:suppliers(name)").eq("organization_id", orgId).limit(100),
  ]);
  const items: SourceStatusItem[] = [];
  for (const s of sources ?? []) {
    if (s.source_type === "CSV" || s.source_type === "XML" || s.source_type === "JSON") continue; // représentées par leurs flux
    items.push({ id: s.id, kind: "source", name: s.name, supplierName: s.supplier?.name ?? "", sourceType: s.source_type, status: s.status, connected: s.status === "active", lastSyncAt: s.last_sync_at, lastError: s.last_error });
  }
  for (const f of feeds ?? []) {
    items.push({ id: f.id, kind: "feed", name: f.source?.name ?? `Flux ${f.format.toUpperCase()}`, supplierName: f.supplier?.name ?? "", sourceType: f.format.toUpperCase(), status: f.status, connected: f.status === "active", lastSyncAt: f.last_sync_at, lastError: f.last_error });
  }
  for (const c of connections ?? []) {
    items.push({ id: c.id, kind: "connection", name: c.connector_key, supplierName: c.supplier?.name ?? "", sourceType: "SUPPLIER_ACCOUNT", status: c.status, connected: c.status === "connected", lastSyncAt: c.last_sync_at, lastError: c.last_error });
  }
  return items;
}

export async function searchOffers(ctx: OrgContext, input: SearchInput): Promise<SearchResult> {
  const orgId = ctx.organization.id;
  const orgCurrency = ctx.organization.default_currency;
  const settings = (ctx.organization.settings ?? {}) as { vat_rate?: number | null };
  const vatRate = typeof settings.vat_rate === "number" ? settings.vat_rate : null;
  const sku = input.skuCode ? await loadSku(ctx, input.skuCode) : null;
  const parsed = input.query.trim() ? parseQuery(input.query) : sku ? parsedFromSku(sku) : parseQuery("");
  const filters = input.filters;
  const requestedQuantity = Math.max(1, filters.quantity ?? 1);

  let skuIdsForCategory: string[] | null = null;
  if (filters.category) {
    const { data } = await ctx.supabase.from("v_stock_overview").select("sku_id").eq("organization_id", orgId).ilike("category", filters.category.replace(/[%_\\]/g, "")).limit(1000);
    skuIdsForCategory = (data ?? []).map((d) => d.sku_id).filter((x): x is string => Boolean(x));
  }

  const [{ offers, stage }, marginCtx, sources] = await Promise.all([findOffers(ctx.supabase, orgId, parsed, filters, { skuIdsForCategory, includeSkuId: sku?.id ?? null }), getMarginContext(ctx), listSourceStatuses(ctx)]);

  // Prix de vente connus pour les offres liées à un SKU (marge potentielle sans SKU explicite).
  const linkedSkuIds = Array.from(new Set(offers.map((o) => o.sku_id).filter((x): x is string => Boolean(x))));
  const salePrices = new Map<string, { sale: number | null; avg: number | null; cost: number | null }>();
  if (linkedSkuIds.length > 0) {
    const { data } = await ctx.supabase.from("v_stock_overview").select("sku_id, sale_price, avg_sale_price_30d, cost_price").eq("organization_id", orgId).in("sku_id", linkedSkuIds.slice(0, 500));
    for (const r of data ?? []) if (r.sku_id) salePrices.set(r.sku_id, { sale: r.sale_price, avg: r.avg_sale_price_30d, cost: r.cost_price });
  }

  const now = new Date();
  const prelim = offers.map((o) => {
    const supplier = o.supplier;
    const fxUnavailable = o.normalized_price === null && o.original_currency.toUpperCase() !== orgCurrency.toUpperCase();
    const normalizedUnitPrice = o.normalized_price ?? (o.original_currency.toUpperCase() === orgCurrency.toUpperCase() ? Number(o.original_price) : null);
    let comparableUnitPrice: number | null = null;
    let comparableNote: string | null = null;
    if (normalizedUnitPrice !== null) {
      const t = normalizeTax(normalizedUnitPrice, o.tax_type, "ht", vatRate);
      comparableUnitPrice = t.amount;
      comparableNote = t.note;
    } else comparableNote = fxUnavailable ? "Conversion indisponible : prix original conservé" : null;
    const comparable = comparableUnitPrice !== null ? comparablePrice({ unitPrice: comparableUnitPrice, moq: o.moq, minimumOrderValue: o.minimum_order_value }) : null;
    const landedQuantity = Math.max(requestedQuantity, o.moq ?? 1);
    const landedCost = comparableUnitPrice !== null ? computeLandedCost({ unitPrice: comparableUnitPrice, quantity: landedQuantity, shippingCost: o.shipping_cost, importFees: null }) : null;

    let margin: MarginExplanation | null = null;
    let marginUnavailableReason: string | null = null;
    const saleInfo = sku && (o.sku_id === sku.id || !o.sku_id) ? { sale: sku.salePrice, avg: sku.avgSalePrice30d, cost: sku.costPrice } : o.sku_id ? salePrices.get(o.sku_id) ?? null : null;
    const salePrice = saleInfo?.sale ?? saleInfo?.avg ?? null;
    if (comparableUnitPrice === null) marginUnavailableReason = fxUnavailable ? "Conversion de devise indisponible" : "Prix non comparable";
    else if (salePrice === null) marginUnavailableReason = sku || o.sku_id ? "Aucun prix de vente connu pour ce SKU" : "Marge non calculable : offre non associée à un SKU avec prix de vente";
    else {
      const cost = landedCost?.determinable || (landedCost && landedCost.unitLandedCost !== null) ? landedCost.unitLandedCost! : comparableUnitPrice;
      const result = computeMargin({ salePrice, costPrice: cost, feePercent: marginCtx.feePercent, paymentFeePercent: marginCtx.paymentFeePercent, paymentFeeFixed: marginCtx.paymentFeeFixed, shippingCost: marginCtx.shippingCost });
      const parts = [`${salePrice.toFixed(2)} (vente)`, `− ${cost.toFixed(2)} (coût${landedCost && landedCost.unitLandedCost !== null ? " rendu" : ""})`];
      if (result.marketplaceFee !== null) parts.push(`− ${result.marketplaceFee.toFixed(2)} (commission)`);
      if (result.paymentFee !== null) parts.push(`− ${result.paymentFee.toFixed(2)} (paiement)`);
      if (result.shippingCost !== null) parts.push(`− ${result.shippingCost.toFixed(2)} (expédition)`);
      margin = { salePrice, salePriceSource: saleInfo?.sale !== null && saleInfo?.sale !== undefined ? "sku" : "average_30d", cost, costLabel: landedCost && landedCost.unitLandedCost !== null ? "coût rendu / unité" : "prix unitaire", result, formula: `${parts.join(" ")} = ${result.netProfit === null ? "—" : result.netProfit.toFixed(2)} ${orgCurrency}` };
    }

    const dataCompleteness = computeDataCompleteness({
      price: o.original_price,
      currency: o.original_currency,
      tax: o.tax_type,
      moq: o.moq,
      stock: o.available_quantity ?? (o.stock_status !== "unknown" ? o.stock_status : null),
      shipping: o.shipping_cost,
      delivery: o.delivery_max_days ?? o.delivery_min_days,
      country: o.country ?? supplier?.country ?? null,
      grade: o.grade,
      condition: o.condition,
    });
    const savingsPerUnit = sku && sku.costPrice !== null && comparableUnitPrice !== null ? Math.round((sku.costPrice - comparableUnitPrice) * 100) / 100 : null;
    return {
      id: o.id,
      offer: o,
      supplierName: supplier?.name ?? "Fournisseur",
      supplierCountry: o.country ?? supplier?.country ?? null,
      supplierScore: supplier?.internal_score ?? null,
      normalizedUnitPrice,
      comparableUnitPrice,
      comparableNote,
      comparable,
      fxUnavailable,
      landedCost,
      landedQuantity,
      margin,
      marginUnavailableReason,
      freshness: freshness(o.last_seen_at, now),
      dataCompleteness,
      savingsPerUnit,
      comparablePrice: comparableUnitPrice,
      moq: o.moq,
      deliveryDays: o.delivery_max_days ?? o.delivery_min_days,
      potentialMargin: margin?.result.netProfit ?? null,
    };
  });

  const scores = scoreOffers(prelim);
  const sort: RankingMode = filters.sort ?? "best_offer";
  const ranked = rankOffers(prelim, sort, scores);
  const total = ranked.length;
  const page = Math.max(1, filters.page ?? 1);
  const slice = ranked.slice((page - 1) * SEARCH_PAGE_SIZE, page * SEARCH_PAGE_SIZE);
  const views: SearchOfferView[] = slice.map((p) => ({ ...p, score: scores.get(p.id)! }));

  const prices = prelim.map((p) => p.comparableUnitPrice).filter((x): x is number => x !== null);
  const margins = prelim.map((p) => p.potentialMargin).filter((x): x is number => x !== null);
  const aggregates: SearchAggregates = {
    count: total,
    bestPrice: prices.length ? Math.min(...prices) : null,
    bestOfferScore: total ? Math.max(...Array.from(scores.values()).map((s) => s.total)) : null,
    bestMargin: margins.length ? Math.max(...margins) : null,
    averagePrice: prices.length ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100 : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    currency: orgCurrency,
  };

  if (parsed.kind !== "empty" || sku) {
    const { error } = await ctx.supabase.from("sourcing_searches").insert({ organization_id: orgId, user_id: ctx.user.id, query_text: input.query || sku?.code || "", parsed: { kind: parsed.kind, ean: parsed.ean, mpn: parsed.mpn, criteria: parsed.criteria, tokens: parsed.tokens } as unknown as NonNullable<Json>, filters: filters as unknown as NonNullable<Json>, result_count: total });
    if (error) log.debug("search not recorded", { error: error.message });
  }

  return { parsed, stage, sku, views, page, pageSize: SEARCH_PAGE_SIZE, total, aggregates, sources, connectedSources: sources.filter((s) => s.connected).length, vatRate, requestedQuantity };
}
