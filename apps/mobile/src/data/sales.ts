import type { Order } from "@/db/types";
import type { MobileSupabase } from "~/lib/supabase";
import { orIlikeAny } from "@/lib/postgrest";

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

export async function fetchOrdersPage(supabase: MobileSupabase, organizationId: string, params: { q?: string; page: number }): Promise<{ rows: OrderRow[]; total: number; hasMore: boolean }> {
  const from = (params.page - 1) * SALES_PAGE_SIZE;
  let query = supabase
    .from("orders")
    .select("id, order_number, external_order_id, provider, status, placed_at, total, currency, buyer_username, items:order_items(quantity, sku_id, inventory_applied)", { count: "exact" })
    .eq("organization_id", organizationId);
  const search = params.q ? orIlikeAny(["order_number", "external_order_id", "buyer_username"], params.q) : null;
  if (search) query = query.or(search);
  const { data, error, count } = await query.order("placed_at", { ascending: false, nullsFirst: false }).order("id", { ascending: true }).range(from, from + SALES_PAGE_SIZE - 1);
  if (error) throw error;
  const rows = (data ?? []) as OrderRow[];
  const total = count ?? rows.length;
  return { rows, total, hasMore: from + rows.length < total };
}

export async function fetchOrderDetail(supabase: MobileSupabase, organizationId: string, orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*, items:order_items(id, title, quantity, unit_price, currency, inventory_applied, sku:skus(id, code, product:products(name), variant:product_variants(name)))")
    .eq("organization_id", organizationId)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
