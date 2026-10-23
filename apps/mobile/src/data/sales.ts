import type { DailySalesRow, Order } from "@/db/types";
import { dayKey, shiftDayKey, summarizeSalesWindows } from "@/features/analytics/series.pure";
import type { MobileSupabase } from "~/lib/supabase";

/** Ventes — commandes réellement importées (eBay) ou saisies, lues sous RLS. */
export const SALES_PAGE_SIZE = 30;
export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  paid: "Payée",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
  refunded: "Remboursée",
  unknown: "Statut inconnu",
};
export const PROVIDER_LABEL: Record<string, string> = { ebay: "eBay", amazon: "Amazon", shopify: "Shopify", woocommerce: "WooCommerce", manual: "Manuel" };

export interface OrderRow extends Pick<Order, "id" | "order_number" | "external_order_id" | "provider" | "status" | "placed_at" | "total" | "currency" | "buyer_username"> {
  items: { quantity: number; sku_id: string | null; inventory_applied: boolean }[];
}

export async function fetchOrderDetail(supabase: MobileSupabase, organizationId: string, orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*, items:order_items(id, title, quantity, unit_price, currency, inventory_applied, sku:skus(id, code, cost_price, product:products(name), variant:product_variants(name)))")
    .eq("organization_id", organizationId)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Statut affiché (design) : « à expédier » = payée non expédiée. */
export const ORDER_CHIP: Record<string, { label: string; tone: "accent" | "neutral" | "success" | "danger" }> = {
  paid: { label: "À expédier", tone: "accent" },
  pending: { label: "En attente", tone: "neutral" },
  shipped: { label: "Expédiée", tone: "neutral" },
  delivered: { label: "Livrée", tone: "success" },
  refunded: { label: "Remboursée", tone: "danger" },
  cancelled: { label: "Annulée", tone: "neutral" },
  unknown: { label: "Statut inconnu", tone: "neutral" },
};

export interface SalesKpis {
  toShip: number;
  revenue7d: number;
  refunded30d: number;
  listingsActive: number;
}

export async function fetchSalesKpis(supabase: MobileSupabase, organizationId: string, currency: string, now: Date = new Date()): Promise<SalesKpis> {
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [daily, toShip, refunded, listings] = await Promise.all([
    supabase.from("v_daily_sales").select("*").eq("organization_id", organizationId).gte("day", shiftDayKey(dayKey(now), -8)).order("day", { ascending: true }),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "paid"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "refunded").gte("placed_at", since30),
    supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("provider", "ebay").eq("status", "active"),
  ]);
  for (const r of [daily, toShip, refunded, listings]) if (r.error) throw r.error;
  const revenue7d = summarizeSalesWindows((daily.data ?? []) as DailySalesRow[], now, currency).last7d.revenue;
  return { toShip: toShip.count ?? 0, revenue7d, refunded30d: refunded.count ?? 0, listingsActive: listings.count ?? 0 };
}

/** Curseur de la liste des commandes : dernière ligne lue (tri placed_at desc, id asc). */
export type OrdersCursor = { placedAt: string | null; id: string } | null;

const quoted = (v: string) => `"${v.replace(/"/g, '\\"')}"`;

/**
 * Commandes par CURSEUR (M-25) : tri stable placed_at desc (dates inconnues à la fin) puis id ; la
 * page suivante reprend STRICTEMENT après la dernière ligne lue — une commande importée entre deux
 * pages ne décale plus la liste (ni doublon, ni commande sautée). Pas de comptage exact à chaque
 * page : `hasMore` vient d'une ligne lue en plus.
 */
export async function fetchOrdersFiltered(supabase: MobileSupabase, organizationId: string, params: { status?: string; cursor: OrdersCursor }) {
  let query = supabase
    .from("orders")
    .select("id, order_number, external_order_id, provider, status, placed_at, total, currency, buyer_username, items:order_items(title, quantity, sku_id, inventory_applied)")
    .eq("organization_id", organizationId);
  if (params.status) query = query.eq("status", params.status as "paid");
  const c = params.cursor;
  if (c && c.placedAt !== null) query = query.or(`placed_at.lt.${quoted(c.placedAt)},and(placed_at.eq.${quoted(c.placedAt)},id.gt.${c.id}),placed_at.is.null`);
  else if (c) query = query.is("placed_at", null).gt("id", c.id);
  const { data, error } = await query.order("placed_at", { ascending: false, nullsFirst: false }).order("id", { ascending: true }).limit(SALES_PAGE_SIZE + 1);
  if (error) throw error;
  const all = data ?? [];
  const rows = all.slice(0, SALES_PAGE_SIZE);
  const last = rows[rows.length - 1];
  const hasMore = all.length > SALES_PAGE_SIZE;
  return { rows, hasMore, nextCursor: hasMore && last ? { placedAt: last.placed_at, id: last.id } : null };
}

export const LISTINGS_PAGE_SIZE = 30;

/** Annonces : pages de 30 (une ligne lue en plus pour savoir s'il en reste), sans comptage par page. */
export async function fetchListings(supabase: MobileSupabase, organizationId: string, page: number) {
  const from = (page - 1) * LISTINGS_PAGE_SIZE;
  const { data, error } = await supabase
    .from("channel_listings")
    .select("id, title, price, currency, quantity_available, status, image_url, external_listing_id, last_synced_at, sku_id")
    .eq("organization_id", organizationId)
    .eq("provider", "ebay")
    .order("status", { ascending: true })
    .order("last_synced_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, from + LISTINGS_PAGE_SIZE);
  if (error) throw error;
  const all = data ?? [];
  return { rows: all.slice(0, LISTINGS_PAGE_SIZE), hasMore: all.length > LISTINGS_PAGE_SIZE };
}

export interface OrderListItem {
  id: string;
  order_number: string | null;
  external_order_id: string;
  status: string;
  placed_at: string | null;
  total: number | null;
  currency: string | null;
  buyer_username: string | null;
  items: { title: string | null; quantity: number }[];
}

/** Commandes groupées par jour civil (Europe/Paris, comme les indicateurs), dans l'ordre reçu. */
export function groupOrdersByDay<T extends Pick<OrderListItem, "placed_at">>(rows: readonly T[], now: Date = new Date(), longDate: (d: Date) => string = (d) => d.toISOString().slice(0, 10)) {
  const today = dayKey(now);
  const yesterday = shiftDayKey(today, -1);
  const sections: { key: string; title: string; data: T[] }[] = [];
  for (const o of rows) {
    const key = o.placed_at ? dayKey(new Date(o.placed_at)) : "inconnu";
    let s = sections.find((x) => x.key === key);
    if (!s) {
      const title = key === "inconnu" ? "Date inconnue" : key === today ? "Aujourd'hui" : key === yesterday ? "Hier" : longDate(new Date(`${key}T12:00:00Z`));
      s = { key, title, data: [] };
      sections.push(s);
    }
    s.data.push(o);
  }
  return sections;
}
