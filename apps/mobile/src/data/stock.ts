import type { StockOverviewRow, InventoryMovement } from "@/db/types";
import { enrichStockRow, marginContextFromChannels, type MarginContext, type StockRowView } from "@/features/stock/model";
import { orIlikeAny } from "@/lib/postgrest";
import { fetchRowsUpTo } from "@/lib/supabase/paginate";
import { signedMovementQuantity, stockMovementInputSchema, type StockMovementInput } from "@/features/mobile-api/contract";
import type { MobileSupabase } from "~/lib/supabase";
import { UserFacingError, userMessage } from "~/lib/errors";

/**
 * Stock — lectures directes sous RLS (client de l'utilisateur), mêmes filtres, tris et calculs
 * (vitesse, couverture, statut, marge : modules du domaine partagés) que l'application web.
 */

export const STOCK_PAGE_SIZE = 30;
export const STOCK_FILTERS = ["all", "in_stock", "empty", "negative"] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];
export const STOCK_FILTER_LABEL: Record<StockFilter, string> = { all: "Tous", in_stock: "En stock", empty: "Rupture", negative: "Négatif" };
export const STOCK_SORTS = ["best_sellers", "low_stock", "name"] as const;
export type StockSort = (typeof STOCK_SORTS)[number];
export const STOCK_SORT_LABEL: Record<StockSort, string> = { best_sellers: "Meilleures ventes", low_stock: "Stock le plus bas", name: "Nom" };

export async function fetchMarginContext(supabase: MobileSupabase, organizationId: string, orgSettings: unknown): Promise<MarginContext> {
  const { data, error } = await supabase
    .from("sales_channels")
    .select("provider, fee_percent, payment_fee_percent, payment_fee_fixed, default_shipping_cost")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (error) throw error;
  return marginContextFromChannels(data ?? [], orgSettings);
}

export interface StockPage {
  rows: StockRowView[];
  total: number;
  page: number;
  hasMore: boolean;
}

export async function fetchStockPage(
  supabase: MobileSupabase,
  organizationId: string,
  params: { q?: string; filter: StockFilter; sort: StockSort; page: number },
  marginCtx: MarginContext,
  now: Date = new Date(),
): Promise<StockPage> {
  const from = (params.page - 1) * STOCK_PAGE_SIZE;
  let query = supabase.from("v_stock_overview").select("*", { count: "exact" }).eq("organization_id", organizationId).eq("is_active", true);
  const search = params.q ? orIlikeAny(["product_name", "code", "barcode", "brand", "variant_name"], params.q) : null;
  if (search) query = query.or(search);
  if (params.filter === "in_stock") query = query.gt("quantity_available", 0);
  if (params.filter === "empty") query = query.lte("quantity_available", 0);
  if (params.filter === "negative") query = query.lt("quantity_available", 0);
  switch (params.sort) {
    case "low_stock":
      query = query.order("quantity_available", { ascending: true }).order("product_name", { ascending: true });
      break;
    case "name":
      query = query.order("product_name", { ascending: true }).order("code", { ascending: true });
      break;
    case "best_sellers":
    default:
      query = query.order("units_30d", { ascending: false, nullsFirst: false }).order("units_90d", { ascending: false, nullsFirst: false }).order("product_name", { ascending: true });
  }
  // Départage stable : une ligne ne change pas de page d'une requête à l'autre.
  query = query.order("sku_id", { ascending: true });
  const { data, error, count } = await query.range(from, from + STOCK_PAGE_SIZE - 1);
  if (error) throw error;
  const rows = (data ?? []).map((r) => enrichStockRow(r, marginCtx, now));
  const total = count ?? rows.length;
  return { rows, total, page: params.page, hasMore: from + rows.length < total };
}

export interface SkuDetail {
  view: StockRowView;
  movements: InventoryMovement[];
  pendingSalesCount: number;
  onOrder: number;
}

export async function fetchSkuDetail(supabase: MobileSupabase, organizationId: string, skuId: string, marginCtx: MarginContext): Promise<SkuDetail | null> {
  const [row, movements, pendingSales, purchaseItems] = await Promise.all([
    supabase.from("v_stock_overview").select("*").eq("organization_id", organizationId).eq("sku_id", skuId).maybeSingle(),
    supabase.from("inventory_movements").select("*").eq("organization_id", organizationId).eq("sku_id", skuId).order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).limit(50),
    // Ventes rattachées mais non déduites (hors commandes annulées / remboursées), comme sur le web.
    supabase
      .from("order_items")
      .select("id, order:orders!inner(status)", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("sku_id", skuId)
      .eq("inventory_applied", false)
      .not("order.status", "in", "(cancelled,refunded)"),
    supabase
      .from("purchase_order_items")
      .select("quantity_ordered, quantity_received, purchase_order:purchase_orders!inner(status)")
      .eq("organization_id", organizationId)
      .eq("sku_id", skuId)
      .in("purchase_order.status", ["sent", "confirmed", "partially_received"]),
  ]);
  if (row.error) throw row.error;
  if (!row.data) return null;
  if (movements.error) throw movements.error;
  const onOrder = (purchaseItems.data ?? []).reduce((s, pi) => s + Math.max(0, pi.quantity_ordered - pi.quantity_received), 0);
  return { view: enrichStockRow(row.data, marginCtx), movements: movements.data ?? [], pendingSalesCount: pendingSales.count ?? 0, onOrder };
}

/** Toutes les lignes actives (bornées), pour les indicateurs du tableau de bord. */
export const STOCK_ANALYTICS_MAX = 5000;

export async function fetchAllStockRows(supabase: MobileSupabase, organizationId: string): Promise<{ rows: StockOverviewRow[]; truncated: boolean }> {
  return fetchRowsUpTo<StockOverviewRow>(
    (from, to) => supabase.from("v_stock_overview").select("*").eq("organization_id", organizationId).eq("is_active", true).order("sku_id", { ascending: true }).range(from, to),
    STOCK_ANALYTICS_MAX,
  );
}

/**
 * Mouvement de stock manuel : apply_inventory_movement (signe, stock négatif interdit, verrou,
 * plafond : règles appliquées EN BASE). Même schéma et même calcul de signe que le web.
 */
export async function applyMovement(supabase: MobileSupabase, organizationId: string, input: StockMovementInput): Promise<{ quantityAfter: number | null }> {
  const parsed = stockMovementInputSchema.safeParse(input);
  if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "Mouvement invalide.", "VALIDATION");
  const d = parsed.data;
  const { data, error } = await supabase.rpc("apply_inventory_movement", {
    p_organization_id: organizationId,
    p_sku_id: d.sku_id,
    p_type: d.type,
    p_quantity: signedMovementQuantity(d),
    p_reference_type: "manual",
    p_channel: "manual",
    p_note: d.note ? d.note : undefined,
    p_occurred_at: new Date().toISOString(),
  });
  if (error) throw new UserFacingError(userMessage(error), "REJECTED");
  return { quantityAfter: data?.quantity_after ?? null };
}
