import { describe, expect, it } from "vitest";
import { compareOpportunities, evaluateOpportunity, isStaleOffer, landedUnitCost } from "@/features/analytics/opportunities.pure";

const FEES = { feePercent: 10, paymentFeePercent: 2, paymentFeeFixed: 0.3, shippingCost: 5 };
const NO_FEES = { feePercent: null, paymentFeePercent: null, paymentFeeFixed: null, shippingCost: null };

describe("evaluateOpportunity", () => {
  it("n'annonce une opportunité que si prix de vente ET prix fournisseur sont connus", () => {
    const r = evaluateOpportunity({ salePrice: 200, salePriceBasis: "avg_30d", supplierPrice: 120, landedUnitCost: 125, taxType: "ht", fees: FEES });
    expect(r.status).toBe("potential");
    expect(r.costBasis).toBe("landed");
    expect(r.unitCost).toBe(125);
    // 200 − 125 − 20 − 4.3 − 5 = 45.7
    expect(r.margin?.netProfit).toBe(45.7);
    expect(r.missing).toEqual([]);
  });

  it("liste ce qui manque quand le prix de vente est inconnu", () => {
    const r = evaluateOpportunity({ salePrice: null, salePriceBasis: null, supplierPrice: 120, landedUnitCost: null, taxType: "ht", fees: FEES });
    expect(r.status).toBe("insufficient_data");
    expect(r.margin).toBeNull();
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0]).toContain("prix de vente");
  });

  it("liste ce qui manque quand le prix fournisseur n'est pas normalisé", () => {
    const r = evaluateOpportunity({ salePrice: 200, salePriceBasis: "sku_price", supplierPrice: null, landedUnitCost: null, taxType: "unknown", fees: FEES });
    expect(r.status).toBe("insufficient_data");
    expect(r.missing[0]).toContain("prix fournisseur");
  });

  it("classe non rentable une marge négative ou nulle", () => {
    const r = evaluateOpportunity({ salePrice: 100, salePriceBasis: "avg_30d", supplierPrice: 100, landedUnitCost: null, taxType: "ht", fees: NO_FEES });
    expect(r.status).toBe("unprofitable");
    expect(r.margin?.netProfit).toBe(0);
  });

  it("documente les réserves sans bloquer le calcul (HT/TTC, transport inconnu, frais partiels)", () => {
    const r = evaluateOpportunity({ salePrice: 200, salePriceBasis: "sku_price", supplierPrice: 120, landedUnitCost: null, taxType: "unknown", fees: NO_FEES });
    expect(r.status).toBe("potential");
    expect(r.costBasis).toBe("price");
    expect(r.notes.some((n) => n.includes("HT ou TTC"))).toBe(true);
    expect(r.notes.some((n) => n.includes("Transport fournisseur inconnu"))).toBe(true);
    expect(r.notes.some((n) => n.includes("fiche SKU"))).toBe(true);
    expect(r.notes.some((n) => n.includes("Estimation partielle"))).toBe(true);
  });
});

describe("compareOpportunities", () => {
  it("trie potentielles (meilleure marge d'abord), puis non rentables, puis données insuffisantes", () => {
    const a = { evaluation: evaluateOpportunity({ salePrice: 200, salePriceBasis: "avg_30d", supplierPrice: 150, landedUnitCost: null, taxType: "ht", fees: NO_FEES }) };
    const b = { evaluation: evaluateOpportunity({ salePrice: 200, salePriceBasis: "avg_30d", supplierPrice: 100, landedUnitCost: null, taxType: "ht", fees: NO_FEES }) };
    const c = { evaluation: evaluateOpportunity({ salePrice: null, salePriceBasis: null, supplierPrice: 100, landedUnitCost: null, taxType: "ht", fees: NO_FEES }) };
    const d = { evaluation: evaluateOpportunity({ salePrice: 50, salePriceBasis: "avg_30d", supplierPrice: 100, landedUnitCost: null, taxType: "ht", fees: NO_FEES }) };
    const sorted = [c, a, d, b].sort(compareOpportunities);
    expect(sorted).toEqual([b, a, d, c]);
  });
});

describe("landedUnitCost / isStaleOffer", () => {
  it("répartit le transport sur le MOQ et reste null sans transport", () => {
    expect(landedUnitCost(100, 20, 10)).toBe(102);
    expect(landedUnitCost(100, 20, null)).toBe(120);
    expect(landedUnitCost(100, null, 10)).toBeNull();
    expect(landedUnitCost(null, 20, 10)).toBeNull();
  });

  it("signale une offre non revue depuis plus de 7 jours", () => {
    const now = new Date("2026-10-07T00:00:00Z");
    expect(isStaleOffer("2026-10-05T00:00:00Z", now)).toBe(false);
    expect(isStaleOffer("2026-09-20T00:00:00Z", now)).toBe(true);
    expect(isStaleOffer(null, now)).toBe(true);
  });
});
