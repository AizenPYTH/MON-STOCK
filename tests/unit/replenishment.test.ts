import { describe, expect, it } from "vitest";
import { applyMoq, computeReplenishment } from "@/domain/replenishment/replenishment";

describe("computeReplenishment", () => {
  it("reproduit l'exemple de la spécification (8 en stock, 4/jour, 2 jours de délai, sécurité 5)", () => {
    const r = computeReplenishment({ skuLabel: "IPH13-128-BLK-A", availableStock: 8, dailyVelocity: 4, leadTimeDays: 2, safetyStock: 5, coverDays: 0, moq: 20 });
    // cible = 4×2 + 0 + 5 = 13 ; brut = 13 − 8 = 5 ; MOQ 20 → 20
    expect(r.targetQuantity).toBe(13);
    expect(r.rawQuantity).toBe(5);
    expect(r.recommendedQuantity).toBe(20);
    expect(r.explanation).toContain("20 unité(s)");
    expect(r.explanation).toContain("MOQ");
  });

  it("recommande selon l'horizon de couverture par défaut", () => {
    const r = computeReplenishment({ skuLabel: "X", availableStock: 8, dailyVelocity: 4, leadTimeDays: 2, safetyStock: 5 });
    // 8 + 56 + 5 = 69 − 8 = 61
    expect(r.recommendedQuantity).toBe(61);
    expect(r.needed).toBe(true);
  });

  it("ne recommande rien sans données de vente", () => {
    const r = computeReplenishment({ skuLabel: "X", availableStock: 10, dailyVelocity: null, leadTimeDays: null, safetyStock: 0 });
    expect(r.recommendedQuantity).toBeNull();
    expect(r.explanation).toContain("Pas assez de données");
  });

  it("signale un délai par défaut et un stock fournisseur insuffisant", () => {
    const r = computeReplenishment({ skuLabel: "X", availableStock: 0, dailyVelocity: 10, leadTimeDays: null, safetyStock: 0, supplierAvailable: 50 });
    expect(r.usedDefaultLeadTime).toBe(true);
    expect(r.warnings.some((w) => w.includes("par défaut"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("50"))).toBe(true);
  });

  it("ne commande rien si le stock couvre déjà le besoin", () => {
    const r = computeReplenishment({ skuLabel: "X", availableStock: 500, dailyVelocity: 1, leadTimeDays: 3, safetyStock: 5 });
    expect(r.recommendedQuantity).toBe(0);
    expect(r.needed).toBe(false);
  });
});

describe("applyMoq", () => {
  it("arrondit au MOQ puis aux multiples", () => {
    expect(applyMoq(5, 20)).toBe(20);
    expect(applyMoq(21, 20)).toBe(40);
    expect(applyMoq(0, 20)).toBe(0);
    expect(applyMoq(7, null)).toBe(7);
  });
});
