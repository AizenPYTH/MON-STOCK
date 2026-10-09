import "server-only";
import { escapeLike } from "@/services/sourcing/offer-query";
import { canWrite, isAdmin, type OrgContext } from "@/features/auth/dal";
import type { Json } from "@/db/database.types";
import { parseQuery, type ParsedQuery } from "@/domain/sourcing/query-parser";
import { normalizeProduct } from "@/domain/sourcing/normalizer";
import { comparablePrice, freshness, normalizeTax, type ComparablePrice, type Freshness } from "@/domain/sourcing/pricing";
import { computeDataCompleteness, rankOffers, scoreOffers, type OfferScore, type RankingMode } from "@/domain/sourcing/scoring";
import { ANOMALY_LABEL, type AnomalyCode } from "@/domain/sourcing/validation";
import { computeLandedCost, computeMargin, type LandedCostResult, type MarginResult } from "@/domain/pricing/margin";
import { getMarginContext } from "@/features/stock/queries";
import { baseOfferQuery, findOffers, type OfferFilters, type OfferQueryStage, type OfferWithRelations } from "@/services/sourcing/offer-query";
import { dedupeOffers } from "@/domain/sourcing/dedupe";
import { parseStoredProvenance } from "@/services/sourcing/adapter-runtime";
import { runLiveSearch } from "@/services/sourcing/live-search";
import type { LiveSearchSummary } from "@/services/sourcing/live-search.types";
import type { RetrievalMethod } from "@/integrations/sourcing/core";
import { createLogger } from "@/lib/logger";
import { expandQuery, queriesFor, type ExpandedQuery } from "@/domain/sourcing/query-expansion";
import { criteriaFromParsedQuery, type FilterReason } from "@/domain/sourcing/offer-filter";
import { runOfferPipeline, savingsOf, type BestSavings, type OfferSavings, type RejectionGroup } from "@/domain/sourcing/search-pipeline";
import type { Award, AwardKey, ProcurementPlan, RankingComponent, RankingComponentKey } from "@/domain/sourcing/ranking";
import { assessOfferConfidence, type OfferConfidence } from "@/domain/sourcing/confidence";
import { computePriceInsights, type PriceInsights } from "@/domain/sourcing/price-insights";
import { groupPriceHistory } from "@/domain/sourcing/price-history";
import { loadRecentPriceHistory } from "@/services/sourcing/price-history-query";
import { discoverSources } from "@/services/sourcing/discovery/discovery-service";
import { currentDiscoveryConfig, discoveryDecision, runDiscoveryWithTimeout, type DiscoveryPanelData } from "@/services/sourcing/discovery/search-discovery";

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

/** Provenance d'une offre (enregistrée par le pipeline de recherche en direct / les synchronisations ; null si absente). */
export interface SearchOfferProvenance {
  method: RetrievalMethod | null;
  adapterKey: string | null;
  retrievedAt: string | null;
  requestUrl: string | null;
  sourceUrl: string | null;
}

export interface SearchOfferView {
  offer: OfferWithRelations;
  /** provenance explicite (méthode, adaptateur, horodatage, URL de requête) ; null = non enregistrée */
  provenance: SearchOfferProvenance | null;
  /** offres identiques (même fournisseur, même produit normalisé) fusionnées derrière celle-ci */
  duplicatesCollapsed: number;
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
  /** classement multicritère (rankOpportunities) : rang, score /100 détaillé, « pourquoi », distinctions */
  ranking: OfferRankingView;
  /** niveau de confiance de la donnée (🟢 ⚪ 🟡 🟠 🔴) + « Dernière vérification : il y a … » */
  confidenceBadge: OfferConfidence;
  /** avertissements du filtre (offre conservée) : « grade non communiqué », couleur différente… */
  filterWarnings: FilterReason[];
  /** prix habituel observé (historique de l'offre) ; null si non chargé */
  priceInsights: PriceInsights | null;
  /** économie pour N unités vs coût actuel du SKU (null sans coût actuel ou sans prix) */
  savings: OfferSavings | null;
  /** source découverte automatiquement (et donc validée, puisqu'elle a produit une offre) */
  sourceDiscovered: boolean;
}

export interface OfferRankingView {
  rank: number;
  score: number;
  components: Record<RankingComponentKey, RankingComponent>;
  unknownFactors: string[];
  why: string[];
  awards: AwardKey[];
  procurement: ProcurementPlan;
}

export interface RejectedOfferView {
  id: string;
  title: string;
  supplierId: string;
  supplierName: string;
  comparableUnitPrice: number | null;
  sourceUrl: string | null;
  reasons: FilterReason[];
}

export interface SearchRejections {
  count: number;
  groups: RejectionGroup[];
  /** au plus REJECTED_LIST_LIMIT offres listées */
  offers: RejectedOfferView[];
  /** médiane de prix utilisée pour les prix aberrants (null si moins de 3 prix) */
  referenceMedian: number | null;
}

export interface AwardOfferRef {
  title: string;
  supplierName: string;
  comparableUnitPrice: number | null;
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
  /** résultat de la recherche en direct (null si désactivée, requête vide ou aucune source) */
  live: LiveSearchSummary | null;
  /** reformulations de la requête (adapter_search envoyées aux sources, discovery à l'API web) */
  expandedQueries: ExpandedQuery[];
  /** offres écartées par le filtre de pertinence (raison par offre) */
  rejected: SearchRejections;
  /** 🥇 🥈 🥉 (sur toutes les offres conservées, pas seulement la page) */
  podium: Award[];
  /** Prix le plus bas · Livraison la plus rapide · MOQ le plus faible */
  highlights: Award[];
  priceBasisNote: string;
  /** offres citées par le podium / les distinctions */
  awardOffers: Record<string, AwardOfferRef>;
  /** coût unitaire actuel (SKU) utilisé pour les économies ; null si inconnu ou hors mode SKU */
  currentUnitCost: number | null;
  /** plus forte économie positive pour la quantité demandée (offres réelles uniquement) */
  bestSavings: BestSavings | null;
  /** découverte de nouvelles sources (panneau « Sources découvertes ») */
  discovery: DiscoveryPanelData;
  /** mode SKU : meilleures offres réelles (ordre du classement) à prix comparable connu */
  skuTopOffers: SkuTopOffer[];
}

export const REJECTED_LIST_LIMIT = 100;
export const SKU_TOP_OFFERS = 3;

/** Meilleures offres réelles (classement) comparées au coût actuel du SKU (mode « Trouver moins cher »). */
export interface SkuTopOffer {
  id: string;
  title: string;
  supplierId: string;
  supplierName: string;
  comparableUnitPrice: number;
  /** prix − coût actuel par unité (négatif = moins cher) ; null si coût actuel inconnu */
  deltaPerUnit: number | null;
  savings: OfferSavings | null;
  rank: number;
  score: number;
  awards: AwardKey[];
  why: string[];
  confidence: OfferConfidence;
}

export interface SearchInput {
  query: string;
  skuCode?: string | null;
  filters: OfferFilters;
  /** interroger les sources connectées en direct avant la lecture en base (défaut : oui dès qu'une source est interrogeable) */
  live?: boolean;
  /** lancer la découverte de sources si elle est configurée (défaut : oui) */
  discover?: boolean;
}

export function provenanceOf(offer: Pick<OfferWithRelations, "raw" | "source_url">): SearchOfferProvenance | null {
  const stored = parseStoredProvenance(offer.raw);
  if (!stored) return null;
  return { method: stored.method, adapterKey: stored.adapterKey, retrievedAt: stored.retrievedAt, requestUrl: stored.requestUrl, sourceUrl: offer.source_url };
}

function liveQueryText(query: string, sku: SearchSku | null): string {
  if (query.trim()) return query.trim();
  if (!sku) return "";
  return `${sku.brand ?? ""} ${sku.productName} ${sku.variantName && sku.variantName !== "Standard" ? sku.variantName : ""}`.replace(/\s+/g, " ").trim();
}

async function loadSku(ctx: OrgContext, code: string): Promise<SearchSku | null> {
  const { data: row } = await ctx.supabase.from("v_stock_overview").select("sku_id, code, product_name, brand, variant_name, variant_id, condition, grade, cost_price, sale_price, avg_sale_price_30d, currency").eq("organization_id", ctx.organization.id).ilike("code", escapeLike(code)).maybeSingle();
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
    const { data } = await ctx.supabase.from("v_stock_overview").select("sku_id").eq("organization_id", orgId).ilike("category", escapeLike(filters.category)).limit(1000);
    skuIdsForCategory = (data ?? []).map((d) => d.sku_id).filter((x): x is string => Boolean(x));
  }

  // 1. Reformulations, découverte (en parallèle, délai propre) et recherche en direct sur les sources connectées.
  const expandedQueries = parsed.kind !== "empty" ? expandQuery(parsed) : [];
  const variants = queriesFor(expandedQueries, "adapter_search");
  const liveQuery = liveQueryText(input.query, sku);
  const liveWanted = input.live !== false && Boolean(liveQuery) && (parsed.kind !== "empty" || Boolean(sku));

  const discoveryConfig = currentDiscoveryConfig();
  const admin = isAdmin(ctx.role);
  const decision = discoveryDecision({ config: discoveryConfig, canWrite: canWrite(ctx.role), isAdmin: admin, parsed, live: input.live !== false && input.discover !== false });
  const discoveryPromise: Promise<DiscoveryPanelData> = decision.run
    ? runDiscoveryWithTimeout(() => discoverSources({ organizationId: orgId }, parsed), { isAdmin: admin, provider: discoveryConfig.provider, onLateError: (e) => log.warn("late discovery failed", { orgId, error: e instanceof Error ? e.message : String(e) }) })
    : Promise.resolve(decision.panel);

  let live: LiveSearchSummary | null = null;
  if (liveWanted) {
    try {
      const summary = await runLiveSearch(ctx, { rawQuery: liveQuery, parsed, variants, skuId: sku?.id ?? null });
      live = summary.sources.length > 0 ? summary : null;
    } catch (e) {
      log.warn("live search failed", { orgId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 2. Lecture en base (offres existantes + offres venant d'être enregistrées).
  const [{ offers, stage }, marginCtx, sources] = await Promise.all([findOffers(ctx.supabase, orgId, parsed, filters, { skuIdsForCategory, includeSkuId: sku?.id ?? null }), getMarginContext(ctx), listSourceStatuses(ctx)]);
  if (live && live.offerIds.length > 0) {
    const known = new Set(offers.map((o) => o.id));
    const missing = live.offerIds.filter((id) => !known.has(id)).slice(0, 200);
    if (missing.length > 0) {
      const { data: extra } = await baseOfferQuery(ctx.supabase, orgId, filters, skuIdsForCategory).in("id", missing).limit(200);
      for (const o of extra ?? []) if (!known.has(o.id)) offers.push(o);
    }
  }

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
    const sourceConfig = (o.source?.config ?? {}) as Record<string, unknown>;
    const sourceDiscovered = sourceConfig.discovered === true;
    const sourceAttested = o.source?.automated_access_confirmed ?? false;
    const conf = (o.confidence ?? {}) as Record<string, unknown>;
    const confNum = (k: string): number | null => (typeof conf[k] === "number" && Number.isFinite(conf[k]) ? (conf[k] as number) : null);
    const stockKnown = o.available_quantity !== null || o.stock_status !== "unknown";
    const lastSeenMs = Date.parse(o.last_seen_at);
    return {
      id: o.id,
      offer: o,
      provenance: provenanceOf(o),
      supplierId: o.supplier_id,
      productKey: o.normalized_product_id,
      lastSeenAt: o.last_seen_at,
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
      sourceDiscovered,
      // --- champs du pipeline (filtre de pertinence + classement)
      title: o.title_original,
      brand: o.brand,
      model: o.model,
      modelInferred: modelIsInferred(o.model),
      storage: o.storage,
      color: o.color,
      grade: o.grade,
      condition: o.condition,
      price: comparableUnitPrice,
      status: o.status,
      anomalies: (o.anomalies ?? []).map((code) => ({ code, severity: "warning" as const, message: ANOMALY_LABEL[code as AnomalyCode] ?? code })),
      expiresAt: null,
      supplierVerified: !(sourceDiscovered && !sourceAttested) && (o.source_type !== "PUBLIC_WEB" || sourceAttested),
      linkedToTarget: Boolean(sku && o.sku_id === sku.id),
      unitPrice: comparableUnitPrice,
      landedUnitCost: landedCost?.unitLandedCost ?? null,
      shippingPerOrder: null,
      minimumOrderValue: o.minimum_order_value,
      stockKnown,
      availableQuantity: o.available_quantity,
      outOfStock: o.stock_status === "out_of_stock",
      supplierReliability: supplier?.internal_score ?? null,
      freshnessHours: Number.isFinite(lastSeenMs) ? Math.max(0, (now.getTime() - lastSeenMs) / 3_600_000) : null,
      marginPerUnit: margin?.result.netProfit ?? null,
      confidenceBadge: assessOfferConfidence({ lastSeenAt: o.last_seen_at, status: o.status, expiresAt: null, priceConfidence: confNum("price"), stockConfidence: confNum("stock"), stockKnown, sourceDiscovered, sourceValidated: sourceDiscovered || o.source_type === "PUBLIC_WEB" ? sourceAttested : undefined }, now),
    };
  });

  // 3. Filtre de pertinence (conservées / écartées avec raison) → déduplication → classement multicritère.
  const currentUnitCost = sku?.costPrice ?? null;
  const pipeline = runOfferPipeline(criteriaFromParsedQuery(parsed), prelim, { now, requestedQuantity, currentUnitCost, currency: orgCurrency, dedupe: dedupeOffers });
  const unique = pipeline.unique;
  const scores = scoreOffers(unique);
  const sort: RankingMode = filters.sort ?? "best_offer";
  const rankedById = new Map(pipeline.ranking.ranked.map((r) => [r.offer.id, r] as const));
  const ranked = sort === "best_offer" ? pipeline.ranking.ranked.map((r) => r.offer) : rankOffers(unique, sort, scores);
  const total = ranked.length;
  const page = Math.max(1, filters.page ?? 1);
  const slice = ranked.slice((page - 1) * SEARCH_PAGE_SIZE, page * SEARCH_PAGE_SIZE);
  const insights = await loadPriceInsights(ctx, slice.map((p) => ({ id: p.id, currentPrice: p.normalizedUnitPrice })), orgCurrency, now);
  const views: SearchOfferView[] = slice.map((p) => {
    const r = rankedById.get(p.id)!;
    return {
      ...p,
      score: scores.get(p.id)!,
      duplicatesCollapsed: pipeline.collapsed.get(p.id) ?? 0,
      ranking: { rank: r.rank, score: r.score, components: r.components, unknownFactors: r.unknownFactors, why: r.why, awards: r.awards, procurement: r.procurement },
      filterWarnings: pipeline.warnings.get(p.id) ?? [],
      priceInsights: insights.get(p.id) ?? null,
      savings: currentUnitCost !== null ? savingsOf(r, currentUnitCost) : null,
    };
  });

  const byId = new Map(prelim.map((p) => [p.id, p] as const));
  const awardOffers: Record<string, AwardOfferRef> = {};
  for (const a of [...pipeline.ranking.podium, ...pipeline.ranking.highlights]) {
    const p = a.offerId ? byId.get(a.offerId) : null;
    if (p) awardOffers[p.id] = { title: p.offer.title_original, supplierName: p.supplierName, comparableUnitPrice: p.comparableUnitPrice };
  }
  const rejected: SearchRejections = {
    count: pipeline.rejection.count,
    groups: pipeline.rejection.groups,
    referenceMedian: pipeline.filter.referenceMedian,
    offers: pipeline.filter.rejected.slice(0, REJECTED_LIST_LIMIT).map((r) => ({ id: r.offer.id, title: r.offer.offer.title_original, supplierId: r.offer.supplierId, supplierName: r.offer.supplierName, comparableUnitPrice: r.offer.comparableUnitPrice, sourceUrl: r.offer.offer.source_url, reasons: r.reasons })),
  };

  const prices = unique.map((p) => p.comparableUnitPrice).filter((x): x is number => x !== null);
  const margins = unique.map((p) => p.potentialMargin).filter((x): x is number => x !== null);
  const aggregates: SearchAggregates = {
    count: total,
    bestPrice: prices.length ? Math.min(...prices) : null,
    bestOfferScore: pipeline.ranking.ranked.length ? Math.max(...pipeline.ranking.ranked.map((r) => r.score)) : null,
    bestMargin: margins.length ? Math.max(...margins) : null,
    averagePrice: prices.length ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100 : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    currency: orgCurrency,
  };

  if (parsed.kind !== "empty" || sku) {
    const { error } = await ctx.supabase.from("sourcing_searches").insert({ organization_id: orgId, user_id: ctx.user.id, query_text: input.query || sku?.code || "", parsed: { kind: parsed.kind, ean: parsed.ean, mpn: parsed.mpn, criteria: parsed.criteria, tokens: parsed.tokens } as unknown as NonNullable<Json>, filters: filters as unknown as NonNullable<Json>, result_count: total });
    if (error) log.debug("search not recorded", { error: error.message });
  }

  const skuTopOffers: SkuTopOffer[] = sku
    ? pipeline.ranking.ranked
        .filter((r) => r.offer.comparableUnitPrice !== null)
        .slice(0, SKU_TOP_OFFERS)
        .map((r) => ({
          id: r.offer.id,
          title: r.offer.offer.title_original,
          supplierId: r.offer.supplierId,
          supplierName: r.offer.supplierName,
          comparableUnitPrice: r.offer.comparableUnitPrice as number,
          deltaPerUnit: currentUnitCost !== null ? Math.round(((r.offer.comparableUnitPrice as number) - currentUnitCost) * 100) / 100 : null,
          savings: savingsOf(r, currentUnitCost),
          rank: r.rank,
          score: r.score,
          awards: r.awards,
          why: r.why,
          confidence: r.offer.confidenceBadge,
        }))
    : [];
  const discovery = await discoveryPromise;
  return {
    parsed,
    stage,
    sku,
    views,
    page,
    pageSize: SEARCH_PAGE_SIZE,
    total,
    aggregates,
    sources,
    connectedSources: sources.filter((s) => s.connected).length,
    vatRate,
    requestedQuantity,
    live,
    expandedQueries,
    rejected,
    podium: pipeline.ranking.podium,
    highlights: pipeline.ranking.highlights,
    priceBasisNote: pipeline.ranking.priceBasisNote,
    awardOffers,
    currentUnitCost,
    bestSavings: pipeline.bestSavings,
    discovery,
    skuTopOffers,
  };
}

/** Modèle stocké reconnu par un motif du normaliseur (sinon : déduit du texte libre, correspondance à vérifier). */
function modelIsInferred(model: string | null): boolean {
  if (!model) return false;
  const n = normalizeProduct(model);
  return !n.model || n.inferred.includes("model");
}

export const PRICE_INSIGHT_WINDOW_DAYS = 90;

/**
 * Prix habituel observé des offres visibles : les derniers relevés de chaque offre sur 90 jours
 * (loadRecentPriceHistory : du plus récent au plus ancien, bornés par offre — jamais tronqués par
 * le plafond PostgREST), ramenés dans la devise de l'organisation (sinon ignorés : aucune conversion
 * inventée). Une offre dont l'historique n'a pas pu être lu n'a pas d'indicateur (null), plutôt
 * qu'un indicateur calculé sur un historique vide.
 */
export async function loadPriceInsights(ctx: OrgContext, offers: Array<{ id: string; currentPrice: number | null }>, orgCurrency: string, now: Date): Promise<Map<string, PriceInsights>> {
  const out = new Map<string, PriceInsights>();
  if (offers.length === 0) return out;
  const since = new Date(now.getTime() - PRICE_INSIGHT_WINDOW_DAYS * 86_400_000).toISOString();
  const history = await loadRecentPriceHistory(ctx.supabase, ctx.organization.id, offers.map((o) => o.id), since);
  if (history.failedOfferIds.length > 0) log.debug("price history not loaded", { offers: history.failedOfferIds.length });
  const failed = new Set(history.failedOfferIds);
  const byOffer = groupPriceHistory(history.rows, orgCurrency);
  for (const o of offers) {
    if (failed.has(o.id)) continue;
    out.set(o.id, computePriceInsights(byOffer.get(o.id) ?? [], o.currentPrice, { now, currency: orgCurrency, windowDays: PRICE_INSIGHT_WINDOW_DAYS }));
  }
  return out;
}
