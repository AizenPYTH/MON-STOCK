import type { StockOverviewRow, InventoryMovement } from "@/db/types";
import { enrichStockRow, marginContextFromChannels, type MarginContext, type StockRowView } from "@/features/stock/model";
import { fetchRowsUpTo } from "@/lib/supabase/paginate";
import { signedMovementQuantity, stockMovementInputSchema, type StockMovementInput } from "@/features/mobile-api/contract";
import type { MobileSupabase } from "~/lib/supabase";
import { UserFacingError, userMessage } from "~/lib/errors";

/**
 * Stock — lectures directes sous RLS (client de l'utilisateur), mêmes filtres, tris et calculs
 * (vitesse, couverture, statut, marge : modules du domaine partagés) que l'application web.
 */

export async function fetchMarginContext(supabase: MobileSupabase, organizationId: string, orgSettings: unknown): Promise<MarginContext> {
  const { data, error } = await supabase
    .from("sales_channels")
    .select("provider, fee_percent, payment_fee_percent, payment_fee_fixed, default_shipping_cost")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (error) throw error;
  return marginContextFromChannels(data ?? [], orgSettings);
}

/** Nombre de mouvements affichés sur la fiche (les plus récents ; signalé quand il y en a plus). */
export const SKU_MOVEMENTS_LIMIT = 50;

export interface SkuDetail {
  view: StockRowView;
  movements: InventoryMovement[];
  /** vrai si l'historique compte plus de SKU_MOVEMENTS_LIMIT mouvements (liste partielle, signalée) */
  movementsTruncated: boolean;
  /** null = lecture impossible (M-20 : jamais affiché comme 0) */
  pendingSalesCount: number | null;
  onOrder: number | null;
}

export async function fetchSkuDetail(supabase: MobileSupabase, organizationId: string, skuId: string, marginCtx: MarginContext): Promise<SkuDetail | null> {
  const [row, movements, pendingSales, purchaseItems] = await Promise.all([
    supabase.from("v_stock_overview").select("*").eq("organization_id", organizationId).eq("sku_id", skuId).maybeSingle(),
    supabase.from("inventory_movements").select("*").eq("organization_id", organizationId).eq("sku_id", skuId).order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).limit(SKU_MOVEMENTS_LIMIT + 1),
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
  // M-20 : une lecture secondaire en échec donne « inconnu » (null), jamais 0.
  const onOrder = purchaseItems.error ? null : (purchaseItems.data ?? []).reduce((s, pi) => s + Math.max(0, pi.quantity_ordered - pi.quantity_received), 0);
  const pendingSalesCount = pendingSales.error || pendingSales.count === null ? null : pendingSales.count;
  const all = movements.data ?? [];
  return { view: enrichStockRow(row.data, marginCtx), movements: all.slice(0, SKU_MOVEMENTS_LIMIT), movementsTruncated: all.length > SKU_MOVEMENTS_LIMIT, pendingSalesCount, onOrder };
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
