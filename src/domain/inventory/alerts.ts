/**
 * StockAlertService — classification du niveau de stock d'un SKU.
 *  🔴 out_of_stock : plus rien de disponible
 *  🟠 at_risk      : la couverture ne permet pas d'attendre une livraison fournisseur
 *  🟡 low          : sous le seuil de réapprovisionnement ou couverture courte
 *  🟢 normal
 */
export type StockLevel = "out_of_stock" | "at_risk" | "low" | "normal";

export interface StockClassificationInput {
  available: number;
  reorderPoint: number;
  safetyStock: number;
  /** jours de couverture (null = vitesse inconnue) */
  daysOfCover: number | null;
  /** délai fournisseur connu (jours) ; null = inconnu → 7 jours par défaut, explicitement signalé */
  leadTimeDays: number | null;
}

export interface StockClassification {
  level: StockLevel;
  reason: string;
  /** horizon (jours) en dessous duquel le stock est jugé à risque */
  riskHorizonDays: number;
  usedDefaultLeadTime: boolean;
}

export const DEFAULT_LEAD_TIME_DAYS = 7;
export const LOW_STOCK_COVER_DAYS = 14;

export function classifyStock(input: StockClassificationInput): StockClassification {
  const usedDefaultLeadTime = input.leadTimeDays === null;
  const leadTime = input.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
  // Horizon de risque : le délai fournisseur + 2 jours de marge pour passer commande.
  const riskHorizonDays = leadTime + 2;

  if (input.available <= 0) {
    return { level: "out_of_stock", reason: input.available < 0 ? "Stock négatif : incohérence à corriger." : "Aucune unité disponible.", riskHorizonDays, usedDefaultLeadTime };
  }

  if (input.daysOfCover !== null && input.daysOfCover <= riskHorizonDays) {
    return {
      level: "at_risk",
      reason: `Couverture estimée de ${input.daysOfCover.toFixed(1)} jour(s), inférieure au délai de réapprovisionnement (${leadTime} j${usedDefaultLeadTime ? ", délai par défaut" : ""}).`,
      riskHorizonDays,
      usedDefaultLeadTime,
    };
  }

  if (input.reorderPoint > 0 && input.available <= input.reorderPoint) {
    return { level: "low", reason: `Stock (${input.available}) sous le seuil de réapprovisionnement (${input.reorderPoint}).`, riskHorizonDays, usedDefaultLeadTime };
  }

  if (input.safetyStock > 0 && input.available <= input.safetyStock) {
    return { level: "low", reason: `Stock (${input.available}) au niveau du stock de sécurité (${input.safetyStock}).`, riskHorizonDays, usedDefaultLeadTime };
  }

  if (input.daysOfCover !== null && input.daysOfCover <= LOW_STOCK_COVER_DAYS) {
    return { level: "low", reason: `Couverture estimée de ${input.daysOfCover.toFixed(1)} jour(s).`, riskHorizonDays, usedDefaultLeadTime };
  }

  return {
    level: "normal",
    reason: input.daysOfCover === null ? "Stock disponible ; vitesse de vente inconnue (pas assez de données)." : `Couverture estimée de ${Number.isFinite(input.daysOfCover) ? input.daysOfCover.toFixed(0) + " jour(s)" : "plus de 90 jours"}.`,
    riskHorizonDays,
    usedDefaultLeadTime,
  };
}

export const STOCK_LEVEL_LABEL: Record<StockLevel, string> = {
  out_of_stock: "Rupture",
  at_risk: "Risque de rupture",
  low: "Stock faible",
  normal: "Stock normal",
};

export const STOCK_LEVEL_ORDER: Record<StockLevel, number> = { out_of_stock: 0, at_risk: 1, low: 2, normal: 3 };
