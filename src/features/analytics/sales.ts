import "server-only";
import { cache } from "react";
import type { OrgContext } from "@/features/auth/dal";
import type { DailySalesRow, InventoryMovement, Order, OrderItem } from "@/db/types";
import { fromPostgrestError } from "@/lib/errors";
import { orIlikeAny } from "@/lib/postgrest";
import { fetchRowsUpTo } from "@/lib/supabase/paginate";
import { dayKey, fillDailySeries, shiftDayKey, summarizeSalesWindows, zonedDayStartIso, type DailyPoint, type SalesWindows } from "@/features/analytics/series.pure";
import type { SalesListParams } from "@/features/analytics/schemas";

export const SALES_PAGE_SIZE = 50;

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
  /**
   * Filtre « stock non déduit » : plus de PENDING_ORDERS_MAX commandes concernées (ou plus de
   * PENDING_ITEMS_MAX lignes) → seule une partie est listée, et l'écran le dit (W-03).
   */
  partial?: boolean;
}

/** Lignes « non déduites » lues (par pages de 1 000) pour le filtre « stock non déduit ». */
export const PENDING_ITEMS_MAX = 20_000;
/** Commandes transmises au filtre `in` (taille d'URL raisonnable). */
export const PENDING_ORDERS_MAX = 300;

export async function listOrders(ctx: OrgContext, params: SalesListParams, pageSize = SALES_PAGE_SIZE): Promise<OrderListResult> {
  const orgId = ctx.organization.id;
  const supabase = ctx.supabase;

  const channelsPromise = supabase.from("sales_channels").select("id, name, provider").eq("organization_id", orgId).order("created_at", { ascending: true });

  // Filtre « ventes non déduites » : commandes ayant au moins une ligne rattachée à un SKU et non appliquée.
  let idFilter: string[] | null = null;
  let partial = false;
  if (params.inventory === "pending") {
    // Lecture PAGINÉE (PostgREST plafonne chaque réponse à 1 000 lignes : un `.limit(2000)` en
    // renverrait 1 000 sans le dire). Ordre stable : lignes les plus récentes d'abord.
    let pending: { rows: Array<{ order_id: string }>; truncated: boolean };
    try {
      pending = await fetchRowsUpTo(
        (from, to) => supabase.from("order_items").select("order_id").eq("organization_id", orgId).eq("inventory_applied", false).not("sku_id", "is", null).order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to),
        PENDING_ITEMS_MAX,
      );
    } catch (e) {
      throw fromPostgrestError(e as Parameters<typeof fromPostgrestError>[0]);
    }
    const ids = Array.from(new Set(pending.rows.map((d) => d.order_id)));
    partial = pending.truncated || ids.length > PENDING_ORDERS_MAX;
    idFilter = ids.slice(0, PENDING_ORDERS_MAX);
    if (idFilter.length === 0) {
      const { data: channels } = await channelsPromise;
      return { rows: [], total: 0, page: params.page, pageSize, channels: channels ?? [], partial };
    }
  }

  let query = supabase.from("orders").select("*, channel:sales_channels(id, name, provider)", { count: "exact" }).eq("organization_id", orgId);
  const search = params.q ? orIlikeAny(["order_number", "external_order_id", "buyer_username"], params.q) : null;
  if (search) query = query.or(search);
  if (params.channel) query = query.eq("sales_channel_id", params.channel);
  if (params.status) query = query.eq("status", params.status);
  // Bornes en jours civils Europe/Paris (comme les statistiques), converties en instants UTC.
  if (params.from) query = query.gte("placed_at", zonedDayStartIso(params.from));
  if (params.to) query = query.lt("placed_at", zonedDayStartIso(shiftDayKey(params.to, 1)));
  if (idFilter) query = query.in("id", idFilter).not("status", "in", "(cancelled,refunded)");

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
  return { rows, total: count ?? rows.length, page: params.page, pageSize, channels: channels ?? [], partial };
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
  // `day` est un jour civil Europe/Paris : la borne est calculée dans le même fuseau.
  const since = shiftDayKey(dayKey(new Date()), -days);
  const { data, error } = await ctx.supabase.from("v_daily_sales").select("*").eq("organization_id", ctx.organization.id).gte("day", since).order("day", { ascending: true });
  if (error) throw fromPostgrestError(error);
  return data ?? [];
});

/** Fenêtres de ventes : montants dans la devise de l'organisation, autres devises rapportées à part. */
export async function getSalesSummary(ctx: OrgContext): Promise<SalesWindows> {
  return summarizeSalesWindows(await loadDailySales(ctx, 30), new Date(), ctx.organization.default_currency);
}

export async function getDailySales(ctx: OrgContext, days = 30): Promise<DailyPoint[]> {
  return fillDailySeries(await loadDailySales(ctx, days), days, new Date(), { currency: ctx.organization.default_currency });
}
