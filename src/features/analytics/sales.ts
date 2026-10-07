import "server-only";
import { cache } from "react";
import type { OrgContext } from "@/features/auth/dal";
import type { DailySalesRow, InventoryMovement, Order, OrderItem } from "@/db/types";
import { fromPostgrestError } from "@/lib/errors";
import { fillDailySeries, summarizeSalesWindows, type DailyPoint, type SalesWindows } from "@/features/analytics/series.pure";
import type { SalesListParams } from "@/features/analytics/schemas";

export const SALES_PAGE_SIZE = 50;

/** Échappe les jokers ILIKE et retire les caractères réservés de la syntaxe `or=` de PostgREST. */
function escapeLike(s: string): string {
  return s.replace(/[,()]/g, " ").replace(/[%_\\]/g, (m) => `\\${m}`).trim();
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export interface ChannelRef {
  id: string;
  name: string;
  provider: string;
}

export interface OrderListRow {
  order: Order;
  channel: ChannelRef | null;
  itemsCount: number;
  units: number;
  unmappedItems: number;
  pendingInventoryItems: number;
}

export interface OrderListResult {
  rows: OrderListRow[];
  total: number;
  page: number;
  pageSize: number;
  channels: ChannelRef[];
}

export async function listOrders(ctx: OrgContext, params: SalesListParams, pageSize = SALES_PAGE_SIZE): Promise<OrderListResult> {
  const orgId = ctx.organization.id;
  const supabase = ctx.supabase;

  const channelsPromise = supabase.from("sales_channels").select("id, name, provider").eq("organization_id", orgId).order("created_at", { ascending: true });

  // Filtre « ventes non déduites » : commandes ayant au moins une ligne rattachée à un SKU et non appliquée.
  let idFilter: string[] | null = null;
  if (params.inventory === "pending") {
    const { data, error } = await supabase.from("order_items").select("order_id").eq("organization_id", orgId).eq("inventory_applied", false).not("sku_id", "is", null).limit(2000);
    if (error) throw fromPostgrestError(error);
    idFilter = Array.from(new Set((data ?? []).map((d) => d.order_id)));
    if (idFilter.length === 0) {
      const { data: channels } = await channelsPromise;
      return { rows: [], total: 0, page: params.page, pageSize, channels: channels ?? [] };
    }
  }

  let query = supabase.from("orders").select("*, channel:sales_channels(id, name, provider)", { count: "exact" }).eq("organization_id", orgId);
  if (params.q) {
    const q = escapeLike(params.q);
    query = query.or(`order_number.ilike.%${q}%,external_order_id.ilike.%${q}%,buyer_username.ilike.%${q}%`);
  }
  if (params.channel) query = query.eq("sales_channel_id", params.channel);
  if (params.status) query = query.eq("status", params.status);
  if (params.from) query = query.gte("placed_at", `${params.from}T00:00:00.000Z`);
  if (params.to) query = query.lte("placed_at", `${params.to}T23:59:59.999Z`);
  if (idFilter) query = query.in("id", idFilter.slice(0, 1000)).not("status", "in", "(cancelled,refunded)");

  const from = (params.page - 1) * pageSize;
  const [{ data, error, count }, { data: channels }] = await Promise.all([query.order("placed_at", { ascending: false }).range(from, from + pageSize - 1), channelsPromise]);
  if (error) throw fromPostgrestError(error);
  const orders = data ?? [];

  const itemsByOrder = new Map<string, { count: number; units: number; unmapped: number; pending: number }>();
  if (orders.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("order_id, quantity, sku_id, inventory_applied")
      .in(
        "order_id",
        orders.map((o) => o.id),
      );
    if (itemsError) throw fromPostgrestError(itemsError);
    for (const it of items ?? []) {
      const agg = itemsByOrder.get(it.order_id) ?? { count: 0, units: 0, unmapped: 0, pending: 0 };
      agg.count++;
      agg.units += it.quantity;
      if (!it.sku_id) agg.unmapped++;
      else if (!it.inventory_applied) agg.pending++;
      itemsByOrder.set(it.order_id, agg);
    }
  }

  const rows: OrderListRow[] = orders.map((o) => {
    const { channel, ...order } = o;
    const agg = itemsByOrder.get(o.id) ?? { count: 0, units: 0, unmapped: 0, pending: 0 };
    return { order, channel: one(channel), itemsCount: agg.count, units: agg.units, unmappedItems: agg.unmapped, pendingInventoryItems: agg.pending };
  });
  return { rows, total: count ?? rows.length, page: params.page, pageSize, channels: channels ?? [] };
}

export interface OrderItemView {
  item: OrderItem;
  sku: { id: string; code: string; productName: string; variantName: string | null } | null;
}

export interface OrderDetail {
  order: Order;
  channel: ChannelRef | null;
  items: OrderItemView[];
  movements: InventoryMovement[];
}

export async function getOrder(ctx: OrgContext, id: string): Promise<OrderDetail | null> {
  const orgId = ctx.organization.id;
  const [orderRes, itemsRes] = await Promise.all([
    ctx.supabase.from("orders").select("*, channel:sales_channels(id, name, provider)").eq("organization_id", orgId).eq("id", id).maybeSingle(),
    ctx.supabase.from("order_items").select("*, sku:skus(id, code, product:products(name), variant:product_variants(name))").eq("organization_id", orgId).eq("order_id", id).order("created_at", { ascending: true }),
  ]);
  if (orderRes.error) throw fromPostgrestError(orderRes.error);
  if (!orderRes.data) return null;
  if (itemsRes.error) throw fromPostgrestError(itemsRes.error);
  const { channel, ...order } = orderRes.data;
  const items: OrderItemView[] = (itemsRes.data ?? []).map((raw) => {
    const { sku, ...item } = raw;
    const s = one(sku);
    const product = one(s?.product);
    const variant = one(s?.variant);
    return { item, sku: s ? { id: s.id, code: s.code, productName: product?.name ?? s.code, variantName: variant?.name && variant.name !== "Standard" ? variant.name : null } : null };
  });
  let movements: InventoryMovement[] = [];
  if (items.length > 0) {
    const { data, error } = await ctx.supabase
      .from("inventory_movements")
      .select("*")
      .eq("organization_id", orgId)
      .eq("reference_type", "order_item")
      .in(
        "reference_id",
        items.map((i) => i.item.id),
      )
      .order("occurred_at", { ascending: false });
    if (error) throw fromPostgrestError(error);
    movements = data ?? [];
  }
  return { order, channel: one(channel), items, movements };
}

export const loadDailySales = cache(async (ctx: OrgContext, days: number): Promise<DailySalesRow[]> => {
  const since = new Date(Date.now() - (days + 1) * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await ctx.supabase.from("v_daily_sales").select("*").eq("organization_id", ctx.organization.id).gte("day", since).order("day", { ascending: true });
  if (error) throw fromPostgrestError(error);
  return data ?? [];
});

export async function getSalesSummary(ctx: OrgContext): Promise<SalesWindows> {
  return summarizeSalesWindows(await loadDailySales(ctx, 30), new Date());
}

export async function getDailySales(ctx: OrgContext, days = 30): Promise<DailyPoint[]> {
  return fillDailySeries(await loadDailySales(ctx, days), days, new Date());
}
