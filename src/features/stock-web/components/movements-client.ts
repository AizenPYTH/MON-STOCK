"use client";
import { adjustStockAction } from "@/features/stock/actions";
import type { MovementPlan } from "@/features/stock-web/adjust.pure";

export type MoveResult = { code: string; ok: true; quantityAfter: number | null } | { code: string; ok: false; error: string };

/** Enregistre UN mouvement via l'action serveur existante (adjustStockAction : droits, verrou, stock ≥ 0). */
export async function recordMovement(target: { skuId: string; code: string }, plan: Extract<MovementPlan, { kind: "move" }>, note?: string): Promise<MoveResult> {
  const fd = new FormData();
  fd.set("sku_id", target.skuId);
  fd.set("type", plan.type);
  fd.set("direction", plan.direction);
  fd.set("quantity", String(plan.quantity));
  if (note) fd.set("note", note);
  try {
    const r = await adjustStockAction(null, fd);
    if (r.ok) return { code: target.code, ok: true, quantityAfter: r.data.quantityAfter };
    const field = r.fieldErrors ? Object.values(r.fieldErrors).flat()[0] : undefined;
    return { code: target.code, ok: false, error: field ?? r.error };
  } catch {
    return { code: target.code, ok: false, error: "Connexion au serveur impossible : rien n'a été enregistré." };
  }
}
