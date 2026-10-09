import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { stockErrorMessage } from "@/features/stock/db-errors";
import { signedMovementQuantity, type StockMovementInput } from "@/features/mobile-api/contract";

const log = createLogger("STOCK");

/**
 * Mouvement de stock manuel (web : adjustStockAction ; mobile : POST /api/mobile/v1/stock/movements).
 * Toutes les règles (signe, stock négatif interdit, verrou, plafond) sont appliquées par
 * apply_inventory_movement en base, sous la RLS de l'utilisateur.
 */
export async function applyManualMovement(ctx: OrgContext, d: StockMovementInput): Promise<{ quantityAfter: number | null; skuCode: string | null }> {
  const signed = signedMovementQuantity(d);
  const { data, error } = await ctx.supabase.rpc("apply_inventory_movement", {
    p_organization_id: ctx.organization.id,
    p_sku_id: d.sku_id,
    p_type: d.type,
    p_quantity: signed,
    p_reference_type: "manual",
    p_channel: "manual",
    p_note: d.note ? d.note : undefined,
    p_occurred_at: new Date().toISOString(),
  });
  if (error) throw new AppError("VALIDATION", stockErrorMessage(error));
  const { data: sku } = await ctx.supabase.from("skus").select("code").eq("id", d.sku_id).eq("organization_id", ctx.organization.id).maybeSingle();
  log.info("stock adjusted", { orgId: ctx.organization.id, skuId: d.sku_id, quantity: signed, type: d.type, after: data?.quantity_after });
  return { quantityAfter: data?.quantity_after ?? null, skuCode: sku?.code ?? null };
}
