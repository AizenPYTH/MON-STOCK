import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { canWrite, isAdmin } from "@/features/auth/dal";
import { AppError, fromPostgrestError } from "@/lib/errors";
import type { StockRowView } from "@/features/stock/model";
import { skuLabel } from "@/features/stock/model";
import { getSkuDetail, listStock } from "@/features/stock/queries";
import { stockListParamsSchema } from "@/features/stock/schemas";
import { getDashboardData } from "@/features/analytics/dashboard";
import { getOrder, listOrders, type OrderListRow } from "@/features/analytics/sales";
import { salesListParamsSchema } from "@/features/analytics/schemas";
import { getStockAnalytics } from "@/features/analytics/stock-analytics";
import { listOpenRecommendations } from "@/features/analytics/replenishment";
import { listEventAlerts } from "@/features/analytics/alerts";
import { listSuppliers } from "@/features/suppliers/queries";
import { getIntegrationsOverview } from "@/features/integrations/queries";
import { loadSourcingStatus } from "@/features/sourcing/status-queries";
import { sourcingSearchParamsSchema, toOfferFilters } from "@/features/sourcing/schemas";
import { searchOffers, type SearchOfferView } from "@/services/sourcing/search";
import type { InventoryMovement } from "@/db/types";
import type {
  DashboardDTO,
  IntegrationsDTO,
  IntelligenceDTO,
  MovementDTO,
  OrderDetailDTO,
  OrderRowDTO,
  OrganizationContextDTO,
  PurchaseOrderDetailDTO,
  PurchaseOrderListDTO,
  PurchaseOrderListQuery,
  PurchaseOrderRowDTO,
  PurchaseOrderStatus,
  SalesListDTO,
  SalesListQuery,
  SkuDetailDTO,
  SourcingOfferDTO,
  SourcingSearchDTO,
  SourcingSearchQuery,
  SourcingStatusDTO,
  StockListDTO,
  StockListQuery,
  StockRowDTO,
  SupplierDTO,
} from "@/features/mobile-api/contract";
import { MANUAL_PO_STATUSES } from "@/features/mobile-api/contract";

/**
 * Projection des requêtes EXISTANTES (les mêmes que les pages web) vers le contrat de l'API
 * mobile. Aucun calcul métier n'est réimplémenté ici : seule la forme des données change.
 */

export function contextDTO(ctx: OrgContext): OrganizationContextDTO {
  return {
    organization: { id: ctx.organization.id, name: ctx.organization.name, currency: ctx.organization.default_currency, isDemo: ctx.organization.is_demo },
    role: ctx.role,
    permissions: { canWrite: canWrite(ctx.role), isAdmin: isAdmin(ctx.role) },
  };
}

// ---------------------------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------------------------
export function stockRowDTO(v: StockRowView): StockRowDTO {
  const r = v.row;
  return {
    skuId: r.sku_id ?? "",
    code: r.code ?? "",
    productName: r.product_name ?? "",
    variantName: r.variant_name && r.variant_name !== "Standard" ? r.variant_name : null,
    brand: r.brand,
    category: r.category,
    condition: r.condition,
    grade: r.grade,
    imageUrl: r.image_url,
    location: r.location,
    quantityOnHand: r.quantity_on_hand ?? 0,
    quantityReserved: r.quantity_reserved ?? 0,
    quantityAvailable: r.quantity_available ?? 0,
    level: v.classification.level,
    levelReason: v.classification.reason,
    daysOfCover: v.daysOfCover,
    dailyVelocity: v.velocity.dailyVelocity,
    velocityExplanation: v.velocity.explanation,
    units30d: r.units_30d ?? 0,
    salePrice: r.sale_price,
    costPrice: r.cost_price,
    currency: r.currency,
    netProfit: v.margin.netProfit,
    netMarginPercent: v.margin.netMarginPercent,
    marginComplete: v.margin.complete,
    lastSaleAt: r.last_sale_at,
  };
}

export async function stockList(ctx: OrgContext, q: StockListQuery): Promise<StockListDTO> {
  const params = stockListParamsSchema.parse({ q: q.q, status: q.status, stock: q.stock, sort: q.sort, page: q.page });
  const res = await listStock(ctx, params);
  return { rows: res.rows.map(stockRowDTO), total: res.total, page: res.page, pageSize: res.pageSize, truncated: res.truncated };
}

export function movementDTO(m: InventoryMovement): MovementDTO {
  return { id: m.id, type: m.type, quantity: m.quantity, quantityAfter: m.quantity_after, note: m.note, channel: m.channel, referenceType: m.reference_type, occurredAt: m.occurred_at };
}

export async function skuDetail(ctx: OrgContext, code: string): Promise<SkuDetailDTO> {
  const d = await getSkuDetail(ctx, code);
  if (!d) throw new AppError("NOT_FOUND", "SKU introuvable.");
  return {
    row: stockRowDTO(d.view),
    barcode: d.row.barcode,
    reorderPoint: d.row.reorder_point ?? 0,
    safetyStock: d.row.safety_stock ?? 0,
    leadTimeDays: d.row.lead_time_days,
    defaultSupplier: d.defaultSupplier ? { id: d.defaultSupplier.id, name: d.defaultSupplier.name } : null,
    pendingSalesCount: d.pendingSalesCount,
    onOrder: d.onOrder,
    movements: d.movements.slice(0, 50).map(movementDTO),
    offers: d.offers.map((o) => ({
      id: o.id,
      title: o.title_original,
      supplierName: o.supplier?.name ?? null,
      price: o.original_price,
      currency: o.original_currency,
      normalizedPrice: o.normalized_price,
      quantityAvailable: o.available_quantity,
      moq: o.moq,
      lastSeenAt: o.last_seen_at,
      sourceUrl: o.source_url,
    })),
    listings: d.listings.map((l) => ({
      id: l.id,
      title: l.title,
      channelName: l.sales_channel?.name ?? null,
      status: l.status,
      quantity: l.quantity_available,
      price: l.price,
      currency: l.currency,
    })),
    unknownCosts: d.view.margin.unknownCosts.map((u) => (typeof u === "string" ? u : String((u as { label?: string; key?: string }).label ?? (u as { key?: string }).key ?? ""))),
  };
}

// ---------------------------------------------------------------------------------------------
// Ventes
// ---------------------------------------------------------------------------------------------
export function orderRowDTO(r: OrderListRow): OrderRowDTO {
  const o = r.order;
  return {
    id: o.id,
    orderNumber: o.order_number ?? o.external_order_id,
    provider: o.provider,
    channelName: r.channel?.name ?? null,
    status: o.status,
    placedAt: o.placed_at,
    total: o.total,
    currency: o.currency,
    itemsCount: r.itemsCount,
    units: r.units,
    unmappedItems: r.unmappedItems,
    pendingInventoryItems: r.pendingInventoryItems,
  };
}

export async function salesList(ctx: OrgContext, q: SalesListQuery): Promise<SalesListDTO> {
  const params = salesListParamsSchema.parse({ q: q.q, status: q.status, inventory: q.inventory, page: q.page });
  const res = await listOrders(ctx, params, 30);
  return { rows: res.rows.map(orderRowDTO), total: res.total, page: res.page, pageSize: res.pageSize };
}

export async function orderDetail(ctx: OrgContext, id: string): Promise<OrderDetailDTO> {
  const d = await getOrder(ctx, id);
  if (!d) throw new AppError("NOT_FOUND", "Commande introuvable.");
  const items = d.items;
  const row = orderRowDTO({
    order: d.order,
    channel: d.channel,
    itemsCount: items.length,
    units: items.reduce((s, i) => s + i.item.quantity, 0),
    unmappedItems: items.filter((i) => !i.item.sku_id).length,
    pendingInventoryItems: items.filter((i) => i.item.sku_id && !i.item.inventory_applied).length,
  });
  return {
    order: { ...row, buyer: d.order.buyer_username, shippingCost: d.order.shipping_total, feesTotal: d.order.fee_total, externalOrderId: d.order.external_order_id },
    items: items.map(({ item, sku }) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      currency: item.currency,
      inventoryApplied: item.inventory_applied,
      sku: sku ? { id: sku.id, code: sku.code, label: skuLabel({ product_name: sku.productName, variant_name: sku.variantName }) } : null,
    })),
    movements: d.movements.map(movementDTO),
  };
}

// ---------------------------------------------------------------------------------------------
// Tableau de bord / intelligence
// ---------------------------------------------------------------------------------------------
export async function dashboard(ctx: OrgContext): Promise<DashboardDTO> {
  const d = await getDashboardData(ctx);
  const w = (t: { revenue: number; orders: number; units: number }) => ({ revenue: t.revenue, orders: t.orders, units: t.units });
  return {
    context: contextDTO(ctx),
    firstName: d.firstName,
    isEmpty: d.isEmpty,
    sales: { today: w(d.windows.today), last7d: w(d.windows.last7d), last30d: w(d.windows.last30d), otherCurrencies: d.windows.otherCurrencies },
    profit: { profit30d: d.profit.profit30d, revenue30d: d.profit.revenue30d, caveat: d.profit.caveat },
    stock: {
      skus: d.stock.totals.skus,
      unitsOnHand: d.stock.totals.unitsOnHand,
      stockValueKnown: d.stock.totals.stockValueKnown,
      skusUnknownCost: d.stock.totals.skusUnknownCost,
      counts: d.stock.counts,
      negativeStock: d.stock.negativeStock.length,
      truncated: d.stock.truncated,
    },
    todo: d.todo.map((t) => ({ key: t.key, count: t.count, label: t.label, tone: t.tone })),
    counts: d.counts,
    toReplenish: d.toReplenish,
    recentOrders: d.recentOrders.map(orderRowDTO),
    channels: d.channels.map((c) => ({ key: c.key, provider: c.provider, name: c.name, state: c.state, label: c.label, detail: c.detail, lastSuccessfulSyncAt: c.lastSuccessfulSyncAt })),
    hasConnectedChannel: d.hasConnectedChannel,
    generatedAt: d.now.toISOString(),
  };
}

export async function intelligence(ctx: OrgContext): Promise<IntelligenceDTO> {
  const [recs, alerts, stock] = await Promise.all([listOpenRecommendations(ctx, 50), listEventAlerts(ctx, 50), getStockAnalytics(ctx)]);
  return {
    recommendations: recs.map((r) => ({
      id: r.id,
      skuId: r.skuId,
      code: r.code,
      label: r.label,
      level: r.level,
      currentStock: r.currentStock,
      dailyVelocity: r.dailyVelocity,
      daysOfCover: r.daysOfCover,
      onOrder: r.onOrder,
      recommendedQuantity: r.recommendedQuantity,
      explanation: r.explanation,
      warnings: r.warnings,
      supplierName: r.supplier?.name ?? null,
      computedAt: r.computedAt,
    })),
    alerts: alerts.map((a) => ({ id: a.id, type: a.type, severity: a.severity, status: a.status, title: a.title, message: a.message, createdAt: a.created_at })),
    stockCounts: stock.counts,
    truncated: stock.truncated,
  };
}

// ---------------------------------------------------------------------------------------------
// Fournisseurs / commandes fournisseurs
// ---------------------------------------------------------------------------------------------
export async function suppliers(ctx: OrgContext): Promise<SupplierDTO[]> {
  const rows = await listSuppliers(ctx);
  return rows.map(({ supplier: s, offersCount, sourcesCount, sourceTypes, lastSyncAt }) => ({
    id: s.id,
    name: s.name,
    country: s.country,
    email: s.email,
    phone: s.phone,
    website: s.website,
    internalScore: s.internal_score,
    averageLeadTimeDays: s.average_lead_time_days,
    defaultMoq: s.default_moq,
    offersCount,
    sourcesCount,
    sourceTypes,
    lastSyncAt,
  }));
}

export const PO_PAGE_SIZE = 30;
const OPEN_PO_STATUSES: PurchaseOrderStatus[] = ["draft", "sent", "confirmed", "partially_received"];

type PoRow = {
  id: string;
  reference: string | null;
  supplier_id: string;
  status: PurchaseOrderStatus;
  currency: string;
  total: number | null;
  expected_at: string | null;
  created_at: string;
  supplier: { name: string } | null;
  items: Array<{ quantity_ordered: number; quantity_received: number }>;
};

function poRowDTO(po: PoRow): PurchaseOrderRowDTO {
  return {
    id: po.id,
    reference: po.reference,
    supplierId: po.supplier_id,
    supplierName: po.supplier?.name ?? null,
    status: po.status,
    currency: po.currency,
    total: po.total,
    expectedAt: po.expected_at,
    createdAt: po.created_at,
    linesCount: po.items.length,
    unitsOrdered: po.items.reduce((s, i) => s + i.quantity_ordered, 0),
    unitsReceived: po.items.reduce((s, i) => s + i.quantity_received, 0),
  };
}

export async function purchaseOrders(ctx: OrgContext, q: PurchaseOrderListQuery): Promise<PurchaseOrderListDTO> {
  const from = (q.page - 1) * PO_PAGE_SIZE;
  let query = ctx.supabase
    .from("purchase_orders")
    .select("id, reference, supplier_id, status, currency, total, expected_at, created_at, supplier:suppliers(name), items:purchase_order_items(quantity_ordered, quantity_received)", { count: "exact" })
    .eq("organization_id", ctx.organization.id);
  if (q.status === "open") query = query.in("status", OPEN_PO_STATUSES);
  else if (q.status) query = query.eq("status", q.status);
  if (q.supplier_id) query = query.eq("supplier_id", q.supplier_id);
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, from + PO_PAGE_SIZE - 1);
  if (error) throw fromPostgrestError(error);
  return { rows: (data ?? []).map((po) => poRowDTO(po as PoRow)), total: count ?? 0, page: q.page, pageSize: PO_PAGE_SIZE };
}

/** Transitions manuelles possibles (aide à l'interface ; la base reste l'arbitre). */
export function manualTransitions(status: PurchaseOrderStatus): PurchaseOrderDetailDTO["allowedStatuses"] {
  switch (status) {
    case "draft":
      return ["sent", "cancelled"];
    case "sent":
      return ["confirmed", "draft", "cancelled"];
    case "confirmed":
      return ["cancelled"];
    default:
      return [];
  }
}

export async function purchaseOrderDetail(ctx: OrgContext, id: string): Promise<PurchaseOrderDetailDTO> {
  const { data, error } = await ctx.supabase
    .from("purchase_orders")
    .select("*, supplier:suppliers(name), items:purchase_order_items(id, sku_id, quantity_ordered, quantity_received, unit_cost, currency, sku:skus(code, product:products(name), variant:product_variants(name)))")
    .eq("organization_id", ctx.organization.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) throw new AppError("NOT_FOUND", "Commande introuvable.");
  const status = data.status as PurchaseOrderStatus;
  const row = poRowDTO({ ...data, status, items: data.items } as PoRow);
  return {
    order: { ...row, notes: data.notes, sentAt: data.sent_at, receivedAt: data.received_at },
    lines: data.items.map((i) => ({
      id: i.id,
      skuId: i.sku_id,
      skuCode: i.sku?.code ?? null,
      label: i.sku ? skuLabel({ product_name: i.sku.product?.name ?? "", variant_name: i.sku.variant?.name ?? null }) : "SKU inconnu",
      quantityOrdered: i.quantity_ordered,
      quantityReceived: i.quantity_received,
      unitCost: i.unit_cost,
      currency: i.currency ?? data.currency,
    })),
    allowedStatuses: manualTransitions(status).filter((s) => (MANUAL_PO_STATUSES as readonly string[]).includes(s)),
    canReceive: status === "sent" || status === "confirmed" || status === "partially_received",
  };
}

// ---------------------------------------------------------------------------------------------
// Sourcing
// ---------------------------------------------------------------------------------------------
export function sourcingOfferDTO(v: SearchOfferView): SourcingOfferDTO {
  const o = v.offer;
  return {
    id: o.id,
    title: o.title_original,
    supplierId: o.supplier_id,
    supplierName: v.supplierName,
    supplierCountry: v.supplierCountry,
    sourceUrl: o.source_url,
    price: o.original_price,
    currency: o.original_currency,
    comparableUnitPrice: v.comparableUnitPrice,
    comparableNote: v.comparableNote,
    landedUnitCost: v.landedCost?.unitLandedCost ?? null,
    quantityAvailable: o.available_quantity,
    stockStatus: o.stock_status,
    moq: o.moq,
    deliveryDays: o.delivery_max_days,
    condition: o.condition,
    grade: o.grade,
    rank: v.ranking.rank,
    score: v.ranking.score,
    why: v.ranking.why,
    unknownFactors: v.ranking.unknownFactors,
    awards: v.ranking.awards,
    confidence: v.confidenceBadge,
    freshnessLabel: v.freshness.label,
    procurement: v.ranking.procurement,
    savings: v.savings,
    marginNetProfit: v.margin?.result.netProfit ?? null,
    marginUnavailableReason: v.marginUnavailableReason,
    warnings: v.filterWarnings,
    provenance: v.provenance ? { method: v.provenance.method, adapterKey: v.provenance.adapterKey, retrievedAt: v.provenance.retrievedAt } : null,
    usualPriceNote: v.priceInsights?.opportunity?.message ?? v.priceInsights?.reason ?? null,
    duplicatesCollapsed: v.duplicatesCollapsed,
  };
}

export async function sourcingSearch(ctx: OrgContext, q: SourcingSearchQuery): Promise<SourcingSearchDTO> {
  const params = sourcingSearchParamsSchema.parse({ q: q.q, sku: q.sku, qty: q.qty, max_price: q.max_price, page: q.page, live: q.live });
  const live = params.live !== "0";
  const r = await searchOffers(ctx, { query: params.q ?? "", skuCode: params.sku ?? null, filters: toOfferFilters(params), live });
  return {
    query: params.q ?? "",
    sku: r.sku
      ? { id: r.sku.id, code: r.sku.code, label: skuLabel({ product_name: `${r.sku.brand ? `${r.sku.brand} ` : ""}${r.sku.productName}`, variant_name: r.sku.variantName }), costPrice: r.sku.costPrice, currency: r.sku.currency }
      : null,
    requestedQuantity: r.requestedQuantity,
    currency: ctx.organization.default_currency,
    offers: r.views.map(sourcingOfferDTO),
    total: r.total,
    page: r.page,
    pageSize: r.pageSize,
    podium: r.podium,
    highlights: r.highlights,
    awardOffers: r.awardOffers,
    currentUnitCost: r.currentUnitCost,
    bestSavings: r.bestSavings,
    priceBasisNote: r.priceBasisNote,
    rejected: { count: r.rejected.count, groups: r.rejected.groups.map((g) => ({ code: g.code, label: g.label, count: g.count })) },
    connectedSources: r.connectedSources,
    live: r.live
      ? {
          queried: r.live.queried,
          found: r.live.found,
          stored: r.live.stored,
          durationMs: r.live.durationMs,
          sources: r.live.sources.map((s) => ({ name: s.sourceName, supplierName: s.supplierName, status: s.status, message: s.message, found: s.found })),
        }
      : null,
    discovery: { state: r.discovery.state, message: r.discovery.message },
  };
}

export async function sourcingStatus(ctx: OrgContext): Promise<SourcingStatusDTO> {
  const s = await loadSourcingStatus(ctx);
  return { items: s.items.map((i) => ({ key: i.key, label: i.label, value: i.value, scope: i.scope, hint: i.detail })), offerCountsIncomplete: s.offerCountsIncomplete };
}

// ---------------------------------------------------------------------------------------------
// Intégrations
// ---------------------------------------------------------------------------------------------
export async function integrations(ctx: OrgContext): Promise<IntegrationsDTO> {
  const o = await getIntegrationsOverview(ctx);
  if (o.queryError) throw new AppError("INTERNAL", o.queryError);
  return {
    ebay: { configured: o.ebay.configured, environment: o.ebay.environment },
    connections: o.connections.map(({ connection: c, channelName, lastRun }) => ({
      connectionId: c.id,
      provider: c.provider,
      channelName,
      status: c.status,
      environment: c.environment,
      externalUsername: c.external_username,
      lastSyncAt: c.last_sync_at,
      lastSuccessfulSyncAt: c.last_successful_sync_at,
      lastError: c.last_error,
      autoSync: c.auto_sync,
      lastRun: lastRun ? { id: lastRun.id, status: lastRun.status, startedAt: lastRun.started_at, finishedAt: lastRun.finished_at, errorCount: lastRun.error_count } : null,
    })),
    unmappedCount: o.unmappedCount,
    comingSoon: o.catalog.filter((c) => !c.available).map((c) => c.label),
  };
}
