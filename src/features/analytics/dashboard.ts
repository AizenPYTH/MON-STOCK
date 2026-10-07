import "server-only";
import { cache } from "react";
import type { OrgContext } from "@/features/auth/dal";
import { getStockAnalytics } from "@/features/analytics/stock-analytics";
import { computeRecommendations } from "@/features/analytics/replenishment";
import type { RecommendationDraft } from "@/features/analytics/replenishment.pure";
import { findOpportunities, type OpportunityView } from "@/features/analytics/opportunities";
import { getDailySales, getSalesSummary, listOrders, type OrderListRow } from "@/features/analytics/sales";
import { getProfitEstimate } from "@/features/analytics/margins";
import type { MarginAggregate } from "@/features/analytics/margins.pure";
import { buildChannelCards, type ChannelCard } from "@/features/analytics/channels.pure";
import { buildTodoItems, type TodoCounts, type TodoItem } from "@/features/analytics/priorities.pure";
import type { StockAnalytics } from "@/features/analytics/stock.pure";
import type { DailyPoint, SalesWindows } from "@/features/analytics/series.pure";
import { salesListParamsSchema } from "@/features/analytics/schemas";

export interface OperationalCounts {
  syncFailed24h: number;
  openAlerts: number;
  unmappedListings: number;
  pendingSales: number;
  ordersTotal: number;
  suppliersCount: number;
}

/** Compteurs opérationnels (requêtes HEAD, peu coûteuses), partagés par le dashboard et les insights. */
export const getOperationalCounts = cache(async (ctx: OrgContext): Promise<OperationalCounts> => {
  const orgId = ctx.organization.id;
  const since24h = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [syncFailed, openAlerts, unmapped, pendingSales, ordersTotal, suppliers] = await Promise.all([
    ctx.supabase.from("sync_runs").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "failed").gte("started_at", since24h),
    ctx.supabase.from("alerts").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "open"),
    ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active").in("mapping_status", ["unmapped", "suggested"]),
    ctx.supabase
      .from("order_items")
      .select("id, orders!inner(status)", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("inventory_applied", false)
      .not("sku_id", "is", null)
      .not("orders.status", "in", "(cancelled,refunded)"),
    ctx.supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    ctx.supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("is_archived", false),
  ]);
  return {
    syncFailed24h: syncFailed.count ?? 0,
    openAlerts: openAlerts.count ?? 0,
    unmappedListings: unmapped.count ?? 0,
    pendingSales: pendingSales.count ?? 0,
    ordersTotal: ordersTotal.count ?? 0,
    suppliersCount: suppliers.count ?? 0,
  };
});

export interface DashboardData {
  firstName: string;
  now: Date;
  isEmpty: boolean;
  windows: SalesWindows;
  daily: DailyPoint[];
  profit: MarginAggregate;
  stock: StockAnalytics;
  todo: TodoItem[];
  counts: OperationalCounts;
  recentOrders: OrderListRow[];
  recommendations: RecommendationDraft[];
  toReplenish: number;
  opportunities: OpportunityView[];
  channels: ChannelCard[];
  hasConnectedChannel: boolean;
}

export function firstNameOf(fullName: string | null, email: string | null | undefined): string {
  const fromName = fullName?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const local = (email ?? "").split("@")[0] ?? "";
  return local || "";
}

export async function getDashboardData(ctx: OrgContext): Promise<DashboardData> {
  const orgId = ctx.organization.id;
  const now = new Date();
  const [stock, drafts, opportunities, daily, windows, recent, counts, profit, channelsRes, connectionsRes] = await Promise.all([
    getStockAnalytics(ctx),
    computeRecommendations(ctx),
    findOpportunities(ctx, { limit: 3 }),
    getDailySales(ctx, 30),
    getSalesSummary(ctx),
    listOrders(ctx, salesListParamsSchema.parse({}), 10),
    getOperationalCounts(ctx),
    getProfitEstimate(ctx),
    ctx.supabase.from("sales_channels").select("id, provider, name, is_active").eq("organization_id", orgId),
    ctx.supabase.from("channel_connections").select("sales_channel_id, status, refresh_token_expires_at, last_error, last_successful_sync_at, last_sync_at, external_username").eq("organization_id", orgId),
  ]);

  const needed = drafts.filter((d) => d.result.needed);
  const todoCounts: TodoCounts = {
    toReplenish: needed.length,
    syncErrors: counts.syncFailed24h + counts.openAlerts,
    lowStock: stock.counts.low,
    unmappedListings: counts.unmappedListings,
    pendingSales: counts.pendingSales,
    negativeStock: stock.negativeStock.length,
  };
  const channels = buildChannelCards(channelsRes.data ?? [], connectionsRes.data ?? [], now);

  return {
    firstName: firstNameOf(ctx.profile.full_name, ctx.user.email),
    now,
    isEmpty: stock.totals.skus === 0 && counts.ordersTotal === 0,
    windows,
    daily,
    profit,
    stock,
    todo: buildTodoItems(todoCounts),
    counts,
    recentOrders: recent.rows,
    recommendations: needed.slice(0, 5),
    toReplenish: needed.length,
    opportunities: opportunities.items,
    channels,
    hasConnectedChannel: channels.some((c) => c.state === "connected"),
  };
}
