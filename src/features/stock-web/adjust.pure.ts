/**
 * Dialogue « Ajuster le stock » (Ajouter · Retirer · Définir) → mouvement(s) de stock pour l'action
 * existante adjustStockAction (type, sens, quantité ≥ 1). Le serveur reste juge : stock jamais
 * négatif, verrou, plafond. « Définir » vise le stock EN MAIN (ce que les mouvements modifient).
 */

export const ADJUST_MODES = ["add", "remove", "set"] as const;
export type AdjustMode = (typeof ADJUST_MODES)[number];
export const ADJUST_MODE_LABEL: Record<AdjustMode, string> = { add: "Ajouter", remove: "Retirer", set: "Définir" };

export type AdjustReason = "receipt" | "return" | "correction" | "adjustment";
export const ADJUST_REASON_LABEL: Record<AdjustReason, string> = { receipt: "Réception", return: "Retour", correction: "Correction", adjustment: "Ajustement" };

/** Réception et retour sont toujours des entrées (sens imposé par le serveur). */
export function reasonsFor(mode: AdjustMode): AdjustReason[] {
  return mode === "add" ? ["receipt", "return", "correction", "adjustment"] : ["correction", "adjustment"];
}

export type MovementPlan = { kind: "move"; type: AdjustReason; direction: "in" | "out"; quantity: number } | { kind: "skip"; reason: string } | { kind: "error"; message: string };

const MAX = 1_000_000;

export function planAdjustment(input: { mode: AdjustMode; quantity: number; reason: AdjustReason; onHand: number }): MovementPlan {
  const { mode, quantity, onHand } = input;
  if (!Number.isInteger(quantity) || quantity < 0) return { kind: "error", message: "Nombre entier positif attendu." };
  if (quantity > MAX) return { kind: "error", message: "Quantité trop élevée (1 000 000 maximum)." };
  const reason = reasonsFor(mode).includes(input.reason) ? input.reason : "adjustment";
  if (mode === "set") {
    const delta = quantity - onHand;
    if (delta === 0) return { kind: "skip", reason: "Déjà à cette quantité." };
    if (Math.abs(delta) > MAX) return { kind: "error", message: "Écart trop élevé (1 000 000 maximum)." };
    return { kind: "move", type: reason, direction: delta > 0 ? "in" : "out", quantity: Math.abs(delta) };
  }
  if (quantity < 1) return { kind: "error", message: "La quantité doit être au moins 1." };
  return { kind: "move", type: reason, direction: mode === "add" ? "in" : "out", quantity };
}

/** Pas à pas de la fiche : un pas = un mouvement d'ajustement d'une unité. */
export function stepPlan(direction: "in" | "out"): Extract<MovementPlan, { kind: "move" }> {
  return { kind: "move", type: "adjustment", direction, quantity: 1 };
}
