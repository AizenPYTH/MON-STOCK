import type { DailySalesRow } from "@/db/types";
import { enrichStockRow, type MarginContext } from "@/features/stock/model";
import { groupStockViews, type StockTotals } from "@/features/analytics/stock.pure";
import { dayKey, shiftDayKey, summarizeSalesWindows, type SalesWindows } from "@/features/analytics/series.pure";
import { buildTodoItems, type TodoItem } from "@/features/analytics/priorities.pure";
import type { StockLevel } from "@/domain/inventory/alerts";
import type { MobileSupabase } from "~/lib/supabase";
import { fetchAllStockRows } from "~/data/stock";

/**
 * Tableau de bord mobile : mêmes calculs que le web (groupStockViews, summarizeSalesWindows,
 * buildTodoItems), sur les données réelles lues sous RLS. Rien n'est estimé ni inventé :
 * un indicateur sans donnée vaut 0 ou « non disponible ».
 */
export interface MobileDashboard {
  isEmpty: boolean;
  sales: SalesWindows;
  stock: { totals: StockTotals; counts: Record<StockLevel, number>; negativeStock: number; truncated: boolean };
  todo: TodoItem[];
  counts: { openAlerts: number; syncFailed24h: number; unmappedListings: number; pendingSales: number; ordersTotal: number; suppliers: number; openRecommendations: number };
  channels: { provider: string; status: string; externalUsername: string | null; lastSuccessfulSyncAt: string | null }[];
  generatedAt: string;
}

async function count(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: n, error } = await q;
  if (error) throw error;
  return n ?? 0;
}

export async function fetchDashboard(supabase: MobileSupabase, organizationId: string, currency: string, marginCtx: MarginContext, now: Date = new Date()): Promise<MobileDashboard> {
  const since24h = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const sinceDay = shiftDayKey(dayKey(now), -30);
  const [stockRows, daily, openAlerts, syncFailed, unmapped, pendingSales, ordersTotal, suppliers, openRecs, connections] = await Promise.all([
    fetchAllStockRows(supabase, organizationId),
    supabase.from("v_daily_sales").select("*").eq("organization_id", organizationId).gte("day", sinceDay).order("day", { ascending: true }),
    count(supabase.from("alerts").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "open")),
    count(supabase.from("sync_runs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "failed").gte("started_at", since24h)),
    count(supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active").in("mapping_status", ["unmapped", "suggested"])),
    count(
      supabase
        .from("order_items")
        .select("id, orders!inner(status)", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("inventory_applied", false)
        .not("sku_id", "is", null)
        .not("orders.status", "in", "(cancelled,refunded)"),
    ),
    count(supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)),
    count(supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("is_archived", false)),
    count(supabase.from("replenishment_recommendations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "open")),
    supabase.from("channel_connections").select("provider, status, external_username, last_successful_sync_at").eq("organization_id", organizationId),
  ]);
  if (daily.error) throw daily.error;
  if (connections.error) throw connections.error;

  const views = stockRows.rows.map((r) => enrichStockRow(r, marginCtx, now));
  const stock = groupStockViews(views, now, { truncated: stockRows.truncated, currency });
  const sales = summarizeSalesWindows((daily.data ?? []) as DailySalesRow[], now, currency);
  const todo = buildTodoItems({
    // Recommandations ouvertes enregistrées (dernier calcul serveur) : pas de recalcul local.
    toReplenish: openRecs,
    syncErrors: syncFailed + openAlerts,
    lowStock: stock.counts.low,
    unmappedListings: unmapped,
    pendingSales,
    negativeStock: stock.negativeStock.length,
  });
  return {
    isEmpty: stock.totals.skus === 0 && ordersTotal === 0 && suppliers === 0,
    sales,
    stock: { totals: stock.totals, counts: stock.counts, negativeStock: stock.negativeStock.length, truncated: stock.truncated },
    todo,
    counts: { openAlerts, syncFailed24h: syncFailed, unmappedListings: unmapped, pendingSales, ordersTotal, suppliers, openRecommendations: openRecs },
    channels: (connections.data ?? []).map((c) => ({ provider: c.provider, status: c.status, externalUsername: c.external_username, lastSuccessfulSyncAt: c.last_successful_sync_at })),
    generatedAt: now.toISOString(),
  };
}
