import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { AppError } from "@/lib/errors";
import { stockErrorMessage } from "@/features/stock/db-errors";

/**
 * Cœur des actions sur les commandes fournisseurs, partagé par les Server Actions (web) et
 * l'API mobile. Les règles (machine à états, réception idempotente et plafonnée, verrou
 * optimiste `expected_received`) sont appliquées EN BASE (migration 20261008002000).
 */

const PO_STATUS_DONE: Record<string, string> = {
  draft: "Commande repassée en brouillon.",
  sent: "Commande marquée envoyée.",
  confirmed: "Commande marquée confirmée.",
  cancelled: "Commande annulée.",
};

const PO_STATUS_TEXT: Record<string, string> = {
  partially_received: "partiellement reçue",
  received: "entièrement reçue",
};

export async function loadPurchaseOrderRef(ctx: OrgContext, poId: string): Promise<{ id: string; supplier_id: string; status: string }> {
  const { data: po } = await ctx.supabase.from("purchase_orders").select("id, supplier_id, status").eq("organization_id", ctx.organization.id).eq("id", poId).maybeSingle();
  if (!po) throw new AppError("NOT_FOUND", "Commande introuvable.");
  return po;
}

export async function changePurchaseOrderStatus(
  ctx: OrgContext,
  poId: string,
  status: "draft" | "sent" | "confirmed" | "cancelled",
): Promise<{ supplierId: string; message: string; changed: boolean }> {
  const po = await loadPurchaseOrderRef(ctx, poId);
  if (po.status === status) return { supplierId: po.supplier_id, message: "Statut déjà à jour.", changed: false };
  // La base valide la transition (PURCHASE_ORDER_INVALID_TRANSITION / EMPTY / CLOSED) : pas de double règle ici.
  const { error } = await ctx.supabase.from("purchase_orders").update({ status }).eq("id", po.id).eq("organization_id", ctx.organization.id);
  if (error) throw new AppError("CONFLICT", stockErrorMessage(error));
  return { supplierId: po.supplier_id, message: PO_STATUS_DONE[status] ?? "Statut mis à jour.", changed: true };
}

export type ReceiptLine = {
  item_id: string;
  quantity: number;
  expected_received?: number;
};

export async function receivePurchaseOrder(ctx: OrgContext, poId: string, lines: ReceiptLine[]): Promise<{ supplierId: string; status: string | null; message: string }> {
  const po = await loadPurchaseOrderRef(ctx, poId);
  const receipts = lines.filter((l) => l.quantity > 0);
  if (receipts.length === 0) throw new AppError("VALIDATION", "Indiquez au moins une quantité reçue.");
  const { data, error } = await ctx.supabase.rpc("receive_purchase_order_items", { p_purchase_order_id: po.id, p_receipts: receipts });
  if (error) throw new AppError("CONFLICT", stockErrorMessage(error));
  const units = receipts.reduce((sum, r) => sum + r.quantity, 0);
  const status = data?.status ?? null;
  return {
    supplierId: po.supplier_id,
    status,
    message: `Réception enregistrée (${units} unité(s) saisie(s), plafonnées au reste à recevoir) : stock mis à jour. Commande ${PO_STATUS_TEXT[status ?? ""] ?? "mise à jour"}.`,
  };
}
