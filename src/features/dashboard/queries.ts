import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { RadarDTO, RadarItemDTO, ImportJobDTO, ProAccountsHubDTO } from "@/features/mobile-api/contract";
import type { BarcodeItem } from "@/components/instrument/pure";
import { fromPostgrestError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { getStockAnalytics } from "@/features/analytics/stock-analytics";
import { loadDailySales } from "@/features/analytics/sales";
import { getOperationalCounts } from "@/features/analytics/dashboard";
import { isEmptyWorkspace } from "@/features/analytics/priorities.pure";
import { computeRecommendationsWithCoverage } from "@/features/analytics/replenishment";
import { fetchRowsUpTo } from "@/lib/supabase/paginate";
import { buildChannelCards, type ChannelCard } from "@/features/analytics/channels.pure";
import { fillDailySeries, summarizeSalesWindows, type ForeignCurrencyTotal } from "@/features/analytics/series.pure";
import { buildRadar } from "@/services/radar/radar";
import { listImportJobs } from "@/services/sourcing/catalog-import";
import { proAccountsHub } from "@/services/sourcing/pro-accounts";
import {
  barcodeLevel,
  bestOfferFor,
  buildTasks,
  lostRevenue30d,
  marginTodayPercent,
  outOfStockSalesShare,
  pickPriority,
  radarOpportunities,
  resolveHasSupplier,
  saleStatus,
  setupSteps,
  type MarginOrderLike,
  type PriorityCandidate,
  type SaleTone,
  type SetupStep,
  type Task,
} from "@/features/dashboard/today.pure";
import type { StockLevel } from "@/domain/inventory/alerts";

/**
 * Données de l'écran « Aujourd'hui » (web), lues sous la session de l'utilisateur (RLS) :
 * ventes (v_daily_sales, commandes), stock (v_stock_overview enrichi), radar d'achat, imports,
 * comptes fournisseurs, canaux. Les sources secondaires (radar, imports, comptes, recommandations)
 * sont indépendantes : si l'une échoue, son bloc est masqué et signalé, le reste s'affiche.
 */

const log = createLogger("dashboard");

const ACTIVE_ORDER = ["pending", "paid", "shipped", "delivered", "unknown"] as const;

export interface RecentSaleView {
  orderId: string;
  title: string;
  code: string | null;
  channel: string;
  placedAt: string | null;
  status: { label: string; tone: SaleTone };
  amount: number | null;
  currency: string;
}

export interface PriorityView {
  sku: PriorityCandidate;
  lostRevenue: number | null;
  offer: RadarItemDTO | null;
}

export interface TodayDashboard {
  now: Date;
  currency: string;
  // scène
  revenueToday: number;
  ordersToday: number;
  revenueYesterday: number;
  revenue14: number;
  last14Days: { day: string; amount: number }[];
  otherCurrencies: ForeignCurrencyTotal[];
  marginToday: number | null;
  toShip: number | null;
  /** ventes rattachées à un SKU mais pas encore déduites du stock ; null = compteur inconnu (« — ») */
  pendingSales: number | null;
  stock: {
    skus: number;
    units: number;
    valueKnown: number;
    skusValued: number;
    unknownCostWithStock: number;
    otherCurrency: number;
    truncated: boolean;
    counts: Record<StockLevel, number>;
    barcode: (BarcodeItem & { stockLevel: StockLevel })[];
    outShare: number | null;
  };
  // papier
  priority: PriorityView | null;
  tasks: Task[];
  lastImport: ImportJobDTO | null;
  recentSales: RecentSaleView[];
  radar: { opportunities: RadarItemDTO[]; provisional: boolean; missingSettings: string[] } | null;
  setup: SetupStep[];
  /** Premiers pas (checklist de l'entrée du tableau de bord) : null = lecture en échec, inconnu. */
  firstSteps: { ebayConnected: boolean | null; catalogImported: boolean | null; hasProducts: boolean };
  /** faux tant que le nombre de commandes est inconnu (jamais « vide » par défaut) */
  isEmpty: boolean;
  /** sources secondaires indisponibles (bloc masqué) */
  unavailable: string[];
}

/** Borne de lecture des commandes des 36 dernières heures (marge du jour), lues par pages (W-03). */
export const MARGIN_ORDERS_MAX = 20_000;

const MARGIN_ORDER_SELECT = "currency, fee_total, placed_at, items:order_items(quantity, unit_price, sku:skus(cost_price, currency))";

/**
 * Commandes des 36 dernières heures pour la marge du jour. null si la lecture échoue OU dépasse la
 * borne : la marge est alors inconnue (« — »), jamais calculée sur une partie des commandes.
 */
export async function loadMarginOrders(ctx: OrgContext, now: Date): Promise<MarginOrderLike[] | null> {
  const orgId = ctx.organization.id;
  const since = new Date(now.getTime() - 36 * 3_600_000).toISOString();
  try {
    const { rows, truncated } = await fetchRowsUpTo(
      (from, to) =>
        ctx.supabase
          .from("orders")
          .select(MARGIN_ORDER_SELECT)
          .eq("organization_id", orgId)
          .in("status", [...ACTIVE_ORDER])
          .gte("placed_at", since)
          .order("placed_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      MARGIN_ORDERS_MAX,
    );
    if (truncated) {
      log.warn("marge du jour non calculée : borne de lecture atteinte", { orgId, max: MARGIN_ORDERS_MAX });
      return null;
    }
    return rows as unknown as MarginOrderLike[];
  } catch (e) {
    log.warn("marge du jour indisponible", { orgId, error: e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e) });
    return null;
  }
}

async function settle<T>(label: string, p: Promise<T>, unavailable: string[]): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    log.warn("source indisponible", { source: label, error: e instanceof Error ? e.message : String(e) });
    unavailable.push(label);
    return null;
  }
}

export async function getTodayDashboard(ctx: OrgContext): Promise<TodayDashboard> {
  const orgId = ctx.organization.id;
  const currency = ctx.organization.default_currency;
  const now = new Date();
  const unavailable: string[] = [];

  const [stock, dailyRows, counts, toShipRes, marginOrders, recentRes, channelsRes, connectionsRes, radar, jobs, accounts, recommendations] = await Promise.all([
    getStockAnalytics(ctx),
    loadDailySales(ctx, 30),
    getOperationalCounts(ctx),
    ctx.supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "paid").neq("provider", "manual"),
    loadMarginOrders(ctx, now),
    ctx.supabase
      .from("orders")
      .select("id, provider, status, placed_at, total, currency, channel:sales_channels(name), items:order_items(title, sku:skus(code))")
      .eq("organization_id", orgId)
      .order("placed_at", { ascending: false, nullsFirst: false })
      .limit(5),
    ctx.supabase.from("sales_channels").select("id, provider, name, is_active").eq("organization_id", orgId),
    ctx.supabase.from("channel_connections").select("sales_channel_id, status, refresh_token_expires_at, last_error, last_successful_sync_at, last_sync_at, external_username").eq("organization_id", orgId),
    settle<RadarDTO>("radar d'achat", buildRadar(ctx, { now }), unavailable),
    settle<ImportJobDTO[]>("imports de catalogues", listImportJobs(ctx, { limit: 50 }), unavailable),
    settle<ProAccountsHubDTO>("comptes fournisseurs", proAccountsHub(ctx), unavailable),
    settle("recommandations de réapprovisionnement", computeRecommendationsWithCoverage(ctx), unavailable),
  ]);
  const drafts = recommendations?.drafts ?? null;
  // Calcul partiel (borne de lecture atteinte) : signalé comme tel, jamais présenté comme complet (W-03).
  if (recommendations?.truncated) unavailable.push("recommandations de réapprovisionnement (calcul partiel)");
  if (recentRes.error) throw fromPostgrestError(recentRes.error);

  // --- ventes : 14 derniers jours, jour en cours en dernier ---
  const series = fillDailySeries(dailyRows, 14, now, { currency });
  const windows = summarizeSalesWindows(dailyRows, now, currency);
  const today = series[series.length - 1];
  const last14Days = series.map((p) => ({ day: p.day, amount: p.revenue }));
  const revenue14 = Math.round(series.reduce((s, p) => s + p.revenue, 0) * 100) / 100;
  // marge : null si la requête échoue (jamais 0 supposé)
  const marginToday = marginOrders === null ? null : marginTodayPercent(marginOrders, currency, now);

  // --- stock ---
  const views = stock.all;
  const skuLike = views.map((v) => ({ skuId: v.row.sku_id ?? v.row.code ?? "", units30d: Math.max(0, v.row.units_30d ?? 0), available: v.row.quantity_available ?? 0, level: v.classification.level }));
  const barcode = skuLike.map((s) => ({ id: s.skuId, weight: s.units30d, level: barcodeLevel(s.level), stockLevel: s.level }));

  // --- priorité ---
  const radarItems = radar?.items ?? [];
  const offerSkus = new Set(radarItems.filter((i) => i.offer.price !== null).map((i) => i.sku.id));
  const candidates: PriorityCandidate[] = views
    .filter((v) => v.row.sku_id)
    .map((v) => ({
      skuId: v.row.sku_id!,
      code: v.row.code ?? "",
      name: [v.row.product_name, v.row.variant_name && v.row.variant_name !== "Standard" ? v.row.variant_name : null].filter(Boolean).join(" · ") || (v.row.code ?? "Produit"),
      category: v.row.category,
      level: v.classification.level,
      available: v.row.quantity_available ?? 0,
      units30d: Math.max(0, v.row.units_30d ?? 0),
      salePrice: v.row.currency && v.row.currency.toUpperCase() !== currency.toUpperCase() ? null : (v.row.avg_sale_price_30d ?? v.row.sale_price ?? null),
      daysOfCover: v.daysOfCover !== null && Number.isFinite(v.daysOfCover) ? Math.max(0, Math.floor(v.daysOfCover)) : null,
    }));
  const picked = pickPriority(candidates, (id) => offerSkus.has(id));
  const priority: PriorityView | null = picked ? { sku: picked, lostRevenue: picked.level === "out_of_stock" ? lostRevenue30d(picked) : null, offer: radar ? bestOfferFor(radarItems, picked.skuId) : null } : null;

  // --- à traiter ---
  const channels: ChannelCard[] = buildChannelCards(channelsRes.data ?? [], connectionsRes.data ?? [], now);
  const toShip = toShipRes.error ? null : (toShipRes.count ?? null);
  const tasks = buildTasks({
    now,
    outOfStock: stock.counts.out_of_stock,
    atRisk: stock.counts.at_risk,
    low: stock.counts.low,
    negativeStock: stock.negativeStock.length,
    toShip,
    pendingSales: counts.pendingSales,
    unmappedListings: counts.unmappedListings,
    syncFailed24h: counts.syncFailed24h,
    openAlerts: counts.openAlerts,
    toReplenish: drafts ? drafts.filter((d) => d.result.needed).length : null,
    unknownCostWithSales: views.filter((v) => (v.row.units_30d ?? 0) > 0 && v.row.cost_price === null).length,
    jobs,
    accounts: accounts?.accounts ?? null,
    channels,
  });

  // --- activité ---
  const recentSales: RecentSaleView[] = (recentRes.data ?? []).map((o) => {
    const items = (o.items ?? []) as { title: string | null; sku: { code: string } | { code: string }[] | null }[];
    const first = items[0];
    const sku = Array.isArray(first?.sku) ? first?.sku[0] : first?.sku;
    const channel = Array.isArray(o.channel) ? o.channel[0] : o.channel;
    return {
      orderId: o.id,
      title: first?.title ? `${first.title}${items.length > 1 ? ` +${items.length - 1}` : ""}` : "Commande",
      code: sku?.code ?? null,
      channel: (channel as { name: string } | null)?.name ?? (o.provider === "ebay" ? "eBay" : o.provider === "manual" ? "Boutique" : o.provider),
      placedAt: o.placed_at,
      status: saleStatus(o.status, o.provider),
      amount: o.total,
      currency: o.currency ?? currency,
    };
  });

  // --- bien démarrer ---
  const hasSupplier = resolveHasSupplier(accounts, counts.suppliersCount);
  const ebayConnected = channels.some((c) => c.provider === "ebay" && c.state === "connected");
  const setup = setupSteps({
    hasProducts: stock.totals.skus > 0,
    hasChannel: ebayConnected,
    hasSupplier,
    hasCosts: radar ? radar.missingSettings.length === 0 : null,
  });

  const opportunities = radar ? radarOpportunities(radar.items) : [];

  return {
    now,
    currency,
    revenueToday: today?.revenue ?? 0,
    ordersToday: today?.orders ?? 0,
    revenueYesterday: series[series.length - 2]?.revenue ?? 0,
    revenue14,
    last14Days,
    otherCurrencies: windows.otherCurrencies,
    marginToday,
    toShip,
    pendingSales: counts.pendingSales,
    stock: {
      skus: stock.totals.skus,
      units: stock.totals.unitsOnHand,
      valueKnown: stock.totals.stockValueKnown,
      skusValued: stock.totals.skusValued,
      unknownCostWithStock: stock.totals.skusUnknownCostWithStock,
      otherCurrency: stock.totals.skusOtherCurrency,
      truncated: stock.truncated,
      counts: stock.counts,
      barcode,
      outShare: outOfStockSalesShare(skuLike),
    },
    priority,
    tasks,
    lastImport: jobs?.[0] ?? null,
    recentSales,
    radar: radar ? { opportunities, provisional: opportunities.some((o) => o.evaluation.status === "estimated"), missingSettings: radar.missingSettings } : null,
    setup,
    firstSteps: {
      ebayConnected: connectionsRes.error ? null : ebayConnected,
      catalogImported: jobs === null ? null : jobs.some((j) => j.status === "completed" || j.status === "partial"),
      hasProducts: stock.totals.skus > 0,
    },
    isEmpty: isEmptyWorkspace(stock.totals.skus, counts.ordersTotal),
    unavailable,
  };
}
