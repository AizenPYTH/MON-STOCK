import type { DailySalesRow } from "@/db/types";
import { dayKey, shiftDayKey, summarizeSalesWindows, ANALYTICS_TIME_ZONE } from "@/features/analytics/series.pure";
import type { StockRowView } from "@/features/stock/model";
import type { MobileSupabase } from "~/lib/supabase";
import type { Catalog } from "~/data/catalog";

/**
 * Intelligence — « Aujourd'hui » et « Analyse », calculés sur les données réelles (RLS).
 * Une valeur non calculable (coût d'achat inconnu, devise différente…) vaut `null` : l'écran
 * affiche « — », jamais une estimation inventée.
 */

const ACTIVE_ORDER = ["pending", "paid", "shipped", "delivered", "unknown"] as const;

export interface RecentSale {
  orderId: string;
  title: string;
  provider: string;
  placedAt: string | null;
  amount: number | null;
  currency: string | null;
}

export interface TodayData {
  revenueToday: number;
  ordersToday: number;
  revenueYesterday: number;
  vsYesterdayPercent: number | null;
  /** marge du jour en % du CA (coûts d'achat et frais connus pour TOUTES les lignes), sinon null */
  marginTodayPercent: number | null;
  toShip: number;
  openAlerts: number;
  pendingSales: number;
  recentSales: RecentSale[];
  generatedAt: string;
}

async function headCount(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function fetchToday(supabase: MobileSupabase, organizationId: string, currency: string, now: Date = new Date()): Promise<TodayData> {
  const today = dayKey(now);
  const yesterday = shiftDayKey(today, -1);
  const [daily, toShip, openAlerts, pendingSales, recent, todayItems] = await Promise.all([
    supabase.from("v_daily_sales").select("*").eq("organization_id", organizationId).gte("day", yesterday).order("day", { ascending: true }),
    headCount(supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "paid")),
    headCount(supabase.from("alerts").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "open")),
    headCount(
      supabase
        .from("order_items")
        .select("id, orders!inner(status)", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("inventory_applied", false)
        .not("sku_id", "is", null)
        .not("orders.status", "in", "(cancelled,refunded)"),
    ),
    supabase
      .from("orders")
      .select("id, provider, placed_at, total, currency, items:order_items(title)")
      .eq("organization_id", organizationId)
      .order("placed_at", { ascending: false, nullsFirst: false })
      .limit(3),
    supabase
      .from("orders")
      .select("id, currency, fee_total, status, placed_at, items:order_items(quantity, unit_price, currency, sku:skus(cost_price, currency))")
      .eq("organization_id", organizationId)
      .in("status", [...ACTIVE_ORDER])
      .gte("placed_at", new Date(now.getTime() - 36 * 3_600_000).toISOString()),
  ]);
  if (daily.error) throw daily.error;
  if (recent.error) throw recent.error;
  if (todayItems.error) throw todayItems.error;

  const rows = (daily.data ?? []) as DailySalesRow[];
  const windows = summarizeSalesWindows(rows, now, currency);
  const sameCurrency = (c: string | null) => !c || c.toUpperCase() === currency.toUpperCase();
  const revenueYesterday = rows.filter((r) => r.day === yesterday && sameCurrency(r.currency)).reduce((s, r) => s + Number(r.revenue ?? 0), 0);

  // Marge du jour : uniquement si chaque ligne a un prix ET un coût d'achat connus dans la devise de l'organisation.
  const todays = (todayItems.data ?? []).filter((o) => o.placed_at && dayKey(new Date(o.placed_at), ANALYTICS_TIME_ZONE) === today);
  let revenue = 0;
  let cost = 0;
  let fees = 0;
  let complete = todays.length > 0;
  for (const o of todays) {
    if (!sameCurrency(o.currency)) complete = false;
    fees += Number(o.fee_total ?? 0);
    if (o.fee_total === null) complete = false;
    for (const it of o.items) {
      if (it.unit_price === null || !it.sku || it.sku.cost_price === null || !sameCurrency(it.sku.currency)) {
        complete = false;
        continue;
      }
      revenue += it.unit_price * it.quantity;
      cost += it.sku.cost_price * it.quantity;
    }
  }
  const marginTodayPercent = complete && revenue > 0 ? Math.round(((revenue - cost - fees) / revenue) * 1000) / 10 : null;

  return {
    revenueToday: windows.today.revenue,
    ordersToday: windows.today.orders,
    revenueYesterday,
    vsYesterdayPercent: percentChange(windows.today.revenue, revenueYesterday),
    marginTodayPercent,
    toShip,
    openAlerts,
    pendingSales,
    recentSales: (recent.data ?? []).map((o) => ({
      orderId: o.id,
      title: o.items[0]?.title ? `${o.items[0].title}${o.items.length > 1 ? ` +${o.items.length - 1}` : ""}` : "Commande",
      provider: o.provider,
      placedAt: o.placed_at,
      amount: o.total,
      currency: o.currency,
    })),
    generatedAt: now.toISOString(),
  };
}

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export interface AnalysisData {
  period: Period;
  revenue: number;
  revenuePrevious: number;
  revenueChangePercent: number | null;
  orders: number;
  averageBasket: number | null;
  /** bénéfice net estimé (Σ unités vendues × bénéfice net unitaire des SKU au coût connu) */
  netProfit: number | null;
  netProfitShare: number | null;
  skusWithoutMargin: number;
  /** couverture moyenne : stock disponible ÷ ventes quotidiennes de la période */
  coverDays: number | null;
  stockValue: number;
  weekly: { label: string; value: number }[];
  topProducts: { skuId: string; label: string; units: number; profit: number }[];
  topAlert: { title: string; message: string } | null;
}

function unitsFor(v: StockRowView, period: Period): number {
  return period === 7 ? (v.row.units_7d ?? 0) : period === 30 ? (v.row.units_30d ?? 0) : (v.row.units_90d ?? 0);
}

function isoWeek(day: string): number {
  const d = new Date(`${day}T12:00:00Z`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export async function fetchAnalysis(supabase: MobileSupabase, organizationId: string, currency: string, catalog: Catalog, period: Period, now: Date = new Date()): Promise<AnalysisData> {
  const today = dayKey(now);
  const span = Math.max(period * 2, 35);
  const [daily, alert] = await Promise.all([
    supabase.from("v_daily_sales").select("*").eq("organization_id", organizationId).gte("day", shiftDayKey(today, -(span - 1))).order("day", { ascending: true }),
    supabase.from("alerts").select("title, message").eq("organization_id", organizationId).eq("status", "open").order("severity", { ascending: false }).order("created_at", { ascending: false }).limit(1),
  ]);
  if (daily.error) throw daily.error;
  const rows = ((daily.data ?? []) as DailySalesRow[]).filter((r) => !r.currency || r.currency.toUpperCase() === currency.toUpperCase());
  const currentStart = shiftDayKey(today, -(period - 1));
  const previousStart = shiftDayKey(today, -(2 * period - 1));
  const sum = (from: string, to: string, pick: (r: DailySalesRow) => number) => rows.filter((r) => r.day !== null && r.day >= from && r.day <= to).reduce((s, r) => s + pick(r), 0);
  const revenue = Math.round(sum(currentStart, today, (r) => Number(r.revenue ?? 0)) * 100) / 100;
  const revenuePrevious = Math.round(sum(previousStart, shiftDayKey(currentStart, -1), (r) => Number(r.revenue ?? 0)) * 100) / 100;
  const orders = sum(currentStart, today, (r) => Number(r.orders_count ?? 0));

  const views = catalog.products.flatMap((p) => p.skus);
  let profit = 0;
  let withMargin = 0;
  let skusWithoutMargin = 0;
  const top: AnalysisData["topProducts"] = [];
  for (const v of views) {
    const units = unitsFor(v, period);
    if (units === 0) continue;
    if (v.margin.netProfit === null || (v.row.currency && v.row.currency.toUpperCase() !== currency.toUpperCase())) {
      skusWithoutMargin++;
      continue;
    }
    withMargin++;
    const p = Math.round(units * v.margin.netProfit * 100) / 100;
    profit += p;
    top.push({ skuId: v.row.sku_id ?? "", label: `${v.row.product_name ?? ""}${v.row.variant_name && v.row.variant_name !== "Standard" ? ` · ${v.row.variant_name}` : ""}`, units, profit: p });
  }
  const unitsSold = views.reduce((s, v) => s + unitsFor(v, period), 0);
  const available = views.reduce((s, v) => s + Math.max(0, v.row.quantity_available ?? 0), 0);
  const stockValue = views.reduce((s, v) => s + (v.row.cost_price !== null && (v.row.quantity_on_hand ?? 0) > 0 ? v.row.cost_price * (v.row.quantity_on_hand ?? 0) : 0), 0);

  // CA des 5 dernières semaines ISO (S37 → S41).
  const weeks = new Map<number, number>();
  for (let i = 4; i >= 0; i--) weeks.set(isoWeek(shiftDayKey(today, -7 * i)), 0);
  for (const r of rows) {
    if (!r.day) continue;
    const w = isoWeek(r.day);
    if (weeks.has(w)) weeks.set(w, (weeks.get(w) ?? 0) + Number(r.revenue ?? 0));
  }

  return {
    period,
    revenue,
    revenuePrevious,
    revenueChangePercent: revenuePrevious > 0 ? Math.round(((revenue - revenuePrevious) / revenuePrevious) * 1000) / 10 : null,
    orders,
    averageBasket: orders > 0 ? Math.round((revenue / orders) * 100) / 100 : null,
    netProfit: withMargin > 0 ? Math.round(profit * 100) / 100 : null,
    netProfitShare: withMargin > 0 && revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null,
    skusWithoutMargin,
    coverDays: unitsSold > 0 ? Math.round(available / (unitsSold / period)) : null,
    stockValue: Math.round(stockValue * 100) / 100,
    weekly: [...weeks.entries()].map(([w, value]) => ({ label: `S${w}`, value })),
    topProducts: top.sort((a, b) => b.profit - a.profit).slice(0, 5),
    topAlert: alert.data?.[0] ? { title: alert.data[0].title, message: alert.data[0].message } : null,
  };
}
