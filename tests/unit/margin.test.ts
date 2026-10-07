import { describe, expect, it } from "vitest";
import { computeLandedCost, computeMargin } from "@/domain/pricing/margin";

describe("computeMargin", () => {
  it("calcule une marge complète", () => {
    const r = computeMargin({ salePrice: 319, costPrice: 229, feePercent: 10, paymentFeePercent: 2, paymentFeeFixed: 0.35, shippingCost: 6 });
    expect(r.grossMargin).toBe(90);
    expect(r.marketplaceFee).toBe(31.9);
    expect(r.paymentFee).toBe(6.73);
    expect(r.netProfit).toBeCloseTo(319 - 229 - 31.9 - 6.73 - 6, 2);
    expect(r.complete).toBe(true);
    expect(r.caveat).toBeNull();
  });

  it("n'invente jamais un coût d'achat", () => {
    const r = computeMargin({ salePrice: 319, costPrice: null, feePercent: 10, paymentFeePercent: null, paymentFeeFixed: null, shippingCost: null });
    expect(r.grossMargin).toBeNull();
    expect(r.netProfit).toBeNull();
    expect(r.unknownCosts).toContain("cost_price");
    expect(r.caveat).toContain("Coût d'achat inconnu");
  });

  it("signale une estimation partielle quand des frais manquent", () => {
    const r = computeMargin({ salePrice: 100, costPrice: 60, feePercent: null, paymentFeePercent: null, paymentFeeFixed: null, shippingCost: null });
    expect(r.grossMargin).toBe(40);
    expect(r.netProfit).toBe(40);
    expect(r.complete).toBe(false);
    expect(r.caveat).toContain("partielle");
    expect(r.unknownCosts).toEqual(["marketplace_fee", "payment_fee", "shipping"]);
  });
});

describe("computeLandedCost", () => {
  it("retourne non déterminable sans transport connu", () => {
    const r = computeLandedCost({ unitPrice: 235, quantity: 10, shippingCost: null, importFees: null });
    expect(r.unitLandedCost).toBeNull();
    expect(r.determinable).toBe(false);
  });
  it("répartit les frais sur la quantité", () => {
    const r = computeLandedCost({ unitPrice: 235, quantity: 10, shippingCost: 20, importFees: 0 });
    expect(r.unitLandedCost).toBe(237);
    expect(r.determinable).toBe(true);
  });
});
