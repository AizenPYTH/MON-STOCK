import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { UnknownCost } from "@/domain/pricing/margin";
import type { VelocityResult } from "@/domain/inventory/velocity";
import { fromPostgrestError } from "@/lib/errors";
import type { MarginContext } from "@/features/stock/model";
import { skuLabel, type StockRowView } from "@/features/stock/model";
import { loadStockViews } from "@/features/analytics/stock-analytics";
import { missingChannelFees } from "@/features/analytics/margins.pure";
import { compareOpportunities, evaluateOpportunity, isStaleOffer, landedUnitCost, type OpportunityEvaluation, type SalePriceBasis } from "@/features/analytics/opportunities.pure";

const OFFER_SELECT =
  "id, sku_id, supplier_id, source_type, source_url, title_original, original_price, original_currency, normalized_price, normalized_currency, tax_type, moq, available_quantity, stock_status, shipping_cost, delivery_min_days, delivery_max_days, country, last_seen_at, last_price_at, last_stock_at, supplier:suppliers(id, name, country)";

const EVENT_SELECT = "id, kind, message, triggered_at, seen_at, alert:sourcing_alerts(id, name), offer:sourcing_offers(id, title_original, normalized_price, normalized_currency, sku_id, supplier:suppliers(name))";

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export interface OpportunityOffer {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierCountry: string | null;
  sourceType: string;
  sourceUrl: string | null;
  title: string;
  originalPrice: number;
  originalCurrency: string;
  normalizedPrice: number | null;
  normalizedCurrency: string | null;
  taxType: "ht" | "ttc" | "unknown";
  moq: number | null;
  availableQuantity: number | null;
  stockStatus: string;
  shippingCost: number | null;
  deliveryMinDays: number | null;
  deliveryMaxDays: number | null;
  country: string | null;
  lastSeenAt: string;
  lastPriceAt: string;
  lastStockAt: string | null;
  stale: boolean;
}

export interface OpportunityView {
  skuId: string;
  code: string;
  name: string;
  currency: string;
  offer: OpportunityOffer;
  offersCount: number;
  salePrice: number | null;
  salePriceBasis: SalePriceBasis;
  velocity: VelocityResult;
  stockAvailable: number;
  landedUnitCost: number | null;
  evaluation: OpportunityEvaluation;
}

export interface SourcingEventView {
  id: string;
  kind: string;
  message: string;
  triggeredAt: string;
  seenAt: string | null;
  alertName: string | null;
  offerId: string | null;
  offerTitle: string | null;
  price: number | null;
  currency: string | null;
  supplierName: string | null;
  skuCode: string | null;
}

export interface OpportunitiesData {
  items: OpportunityView[];
  totalLinkedSkus: number;
  potentialCount: number;
  unprofitableCount: number;
  insufficientCount: number;
  events: SourcingEventView[];
  marginCtx: MarginContext;
  missingFees: UnknownCost[];
}

/**
 * Opportunités d'achat : pour chaque SKU disposant d'au moins une offre fournisseur active au prix normalisé,
 * compare la meilleure offre (coût rendu si transport connu) au prix de vente réel (moyenne 30 j) ou, à défaut,
 * au prix de vente du SKU. Rien n'est annoncé quand une donnée essentielle manque.
 */
export async function findOpportunities(ctx: OrgContext, opts: { limit?: number } = {}): Promise<OpportunitiesData> {
  const orgId = ctx.organization.id;
  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [bundle, offersRes, eventsRes] = await Promise.all([
    loadStockViews(ctx),
    ctx.supabase
      .from("sourcing_offers")
      .select(OFFER_SELECT)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .not("sku_id", "is", null)
      .not("normalized_price", "is", null)
      .order("normalized_price", { ascending: true })
      .limit(5000),
    ctx.supabase.from("sourcing_alert_events").select(EVENT_SELECT).eq("organization_id", orgId).gte("triggered_at", since7d).order("triggered_at", { ascending: false }).limit(20),
  ]);
  if (offersRes.error) throw fromPostgrestError(offersRes.error);
  if (eventsRes.error) throw fromPostgrestError(eventsRes.error);

  const viewsById = new Map<string, StockRowView>();
  for (const v of bundle.views) if (v.row.sku_id) viewsById.set(v.row.sku_id, v);

  type OfferRow = NonNullable<typeof offersRes.data>[number];
  const bestBySku = new Map<string, { offer: OfferRow; count: number }>();
  for (const o of offersRes.data ?? []) {
    if (!o.sku_id) continue;
    const entry = bestBySku.get(o.sku_id);
    if (!entry) bestBySku.set(o.sku_id, { offer: o, count: 1 });
    else entry.count++;
  }

  const items: OpportunityView[] = [];
  for (const [skuId, { offer, count }] of bestBySku) {
    const view = viewsById.get(skuId);
    if (!view) continue;
    const row = view.row;
    const salePriceBasis: SalePriceBasis = row.avg_sale_price_30d !== null ? "avg_30d" : row.sale_price !== null ? "sku_price" : null;
    const salePrice = row.avg_sale_price_30d ?? row.sale_price ?? null;
    const landed = landedUnitCost(offer.normalized_price, offer.shipping_cost, offer.moq);
    const supplier = one(offer.supplier);
    const evaluation = evaluateOpportunity({
      salePrice,
      salePriceBasis,
      supplierPrice: offer.normalized_price,
      landedUnitCost: landed,
      taxType: offer.tax_type,
      fees: bundle.marginCtx,
      saleCurrency: row.currency ?? ctx.organization.default_currency,
      supplierCurrency: offer.normalized_currency,
    });
    items.push({
      skuId,
      code: row.code ?? "",
      name: skuLabel(row),
      currency: row.currency ?? ctx.organization.default_currency,
      offer: {
        id: offer.id,
        supplierId: offer.supplier_id,
        supplierName: supplier?.name ?? "Fournisseur",
        supplierCountry: supplier?.country ?? null,
        sourceType: offer.source_type,
        sourceUrl: offer.source_url,
        title: offer.title_original,
        originalPrice: offer.original_price,
        originalCurrency: offer.original_currency,
        normalizedPrice: offer.normalized_price,
        normalizedCurrency: offer.normalized_currency,
        taxType: offer.tax_type,
        moq: offer.moq,
        availableQuantity: offer.available_quantity,
        stockStatus: offer.stock_status,
        shippingCost: offer.shipping_cost,
        deliveryMinDays: offer.delivery_min_days,
        deliveryMaxDays: offer.delivery_max_days,
        country: offer.country,
        lastSeenAt: offer.last_seen_at,
        lastPriceAt: offer.last_price_at,
        lastStockAt: offer.last_stock_at,
        stale: isStaleOffer(offer.last_seen_at, now),
      },
      offersCount: count,
      salePrice,
      salePriceBasis,
      velocity: view.velocity,
      stockAvailable: row.quantity_available ?? 0,
      landedUnitCost: landed,
      evaluation,
    });
  }
  items.sort(compareOpportunities);

  const events: SourcingEventView[] = (eventsRes.data ?? []).map((e) => {
    const offer = one(e.offer);
    const alert = one(e.alert);
    const supplier = one(offer?.supplier);
    const skuView = offer?.sku_id ? viewsById.get(offer.sku_id) : undefined;
    return {
      id: e.id,
      kind: e.kind,
      message: e.message,
      triggeredAt: e.triggered_at,
      seenAt: e.seen_at,
      alertName: alert?.name ?? null,
      offerId: offer?.id ?? null,
      offerTitle: offer?.title_original ?? null,
      price: offer?.normalized_price ?? null,
      currency: offer?.normalized_currency ?? null,
      supplierName: supplier?.name ?? null,
      skuCode: skuView?.row.code ?? null,
    };
  });

  const potentialCount = items.filter((i) => i.evaluation.status === "potential").length;
  const unprofitableCount = items.filter((i) => i.evaluation.status === "unprofitable").length;
  const insufficientCount = items.filter((i) => i.evaluation.status === "insufficient_data").length;
  return {
    items: opts.limit ? items.slice(0, opts.limit) : items,
    totalLinkedSkus: items.length,
    potentialCount,
    unprofitableCount,
    insufficientCount,
    events,
    marginCtx: bundle.marginCtx,
    missingFees: missingChannelFees(bundle.marginCtx),
  };
}
