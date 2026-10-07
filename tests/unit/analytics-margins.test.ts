import { describe, expect, it } from "vitest";
import { aggregateMargins, buildMarginLine, channelMarginContext, missingChannelFees, sortMarginLines, type MarginLineInput } from "@/features/analytics/margins.pure";

const FULL_CTX = { feePercent: 10, paymentFeePercent: 2, paymentFeeFixed: 0.3, shippingCost: 5 };

function row(over: Partial<MarginLineInput>): MarginLineInput {
  return { sku_id: "s", code: "C", product_name: "Produit", variant_name: "Standard", currency: "EUR", sale_price: 100, avg_sale_price_30d: null, cost_price: 60, units_30d: 10, revenue_30d: 1000, quantity_on_hand: 5, ...over };
}

describe("channelMarginContext", () => {
  it("laisse les frais à null quand le canal ne les renseigne pas (jamais 0)", () => {
    const ctx = channelMarginContext({ provider: "ebay", name: "eBay", fee_percent: null, payment_fee_percent: null, payment_fee_fixed: null, default_shipping_cost: null }, {});
    expect(ctx).toEqual({ feePercent: null, paymentFeePercent: null, paymentFeeFixed: null, shippingCost: null });
    expect(missingChannelFees(ctx)).toEqual(["marketplace_fee", "payment_fee", "shipping"]);
  });

  it("reprend le transport des réglages de l'organisation à défaut du canal", () => {
    const ctx = channelMarginContext({ provider: "ebay", name: "eBay", fee_percent: 12.8, payment_fee_percent: null, payment_fee_fixed: 0.35, default_shipping_cost: null }, { default_shipping_cost: 4.5 });
    expect(ctx.shippingCost).toBe(4.5);
    expect(missingChannelFees(ctx)).toEqual([]);
  });
});

describe("buildMarginLine", () => {
  it("calcule le bénéfice 30 j = unités × bénéfice net", () => {
    const l = buildMarginLine(row({}), FULL_CTX);
    // net = 100 − 60 − 10 − (2 + 0.3) − 5 = 22.7
    expect(l.margin.netProfit).toBe(22.7);
    expect(l.profit30d).toBe(227);
    expect(l.salePriceSource).toBe("sku_price");
  });

  it("utilise le prix moyen 30 j à défaut de prix de vente et le signale", () => {
    const l = buildMarginLine(row({ sale_price: null, avg_sale_price_30d: 90 }), FULL_CTX);
    expect(l.salePrice).toBe(90);
    expect(l.salePriceSource).toBe("avg_30d");
  });

  it("ne calcule rien quand le coût est inconnu", () => {
    const l = buildMarginLine(row({ cost_price: null }), FULL_CTX);
    expect(l.margin.netProfit).toBeNull();
    expect(l.profit30d).toBeNull();
    expect(l.margin.caveat).toContain("Coût d'achat inconnu");
  });
});

describe("aggregateMargins", () => {
  it("exclut les coûts inconnus du total et les compte explicitement", () => {
    const lines = [
      buildMarginLine(row({ sku_id: "a" }), FULL_CTX), // 227
      buildMarginLine(row({ sku_id: "b", cost_price: null, units_30d: 50 }), FULL_CTX), // exclu
      buildMarginLine(row({ sku_id: "c", sale_price: null, units_30d: 3 }), FULL_CTX), // exclu (prix inconnu)
      buildMarginLine(row({ sku_id: "d", units_30d: 0 }), FULL_CTX), // inclus, 0
    ];
    const agg = aggregateMargins(lines);
    expect(agg.lines).toBe(4);
    expect(agg.included).toBe(2);
    expect(agg.excludedUnknownCost).toBe(1);
    expect(agg.excludedUnknownSalePrice).toBe(1);
    expect(agg.profit30d).toBe(227);
    expect(agg.units30d).toBe(63);
    expect(agg.unitsIncluded).toBe(10);
    expect(agg.missingFees).toEqual([]);
    expect(agg.caveat).toBe("1 SKU exclu : coût inconnu · 1 SKU exclu : prix de vente inconnu");
  });

  it("retourne null (pas 0) quand aucun SKU n'est calculable", () => {
    const agg = aggregateMargins([buildMarginLine(row({ cost_price: null }), FULL_CTX)]);
    expect(agg.profit30d).toBeNull();
    expect(agg.included).toBe(0);
  });

  it("signale les frais non déduits quand le contexte est incomplet", () => {
    const agg = aggregateMargins([buildMarginLine(row({}), { feePercent: null, paymentFeePercent: 2, paymentFeeFixed: null, shippingCost: null })]);
    expect(agg.profit30d).toBe(380); // (100 − 60 − 2) × 10
    expect(agg.missingFees).toEqual(["marketplace_fee", "shipping"]);
    expect(agg.caveat).toContain("non déduits : commission marketplace, transport");
  });
});

describe("sortMarginLines", () => {
  it("place toujours les lignes non calculables en fin de liste", () => {
    const lines = [
      buildMarginLine(row({ sku_id: "unknown", code: "U", cost_price: null }), FULL_CTX),
      buildMarginLine(row({ sku_id: "low", code: "L", cost_price: 95 }), FULL_CTX),
      buildMarginLine(row({ sku_id: "high", code: "H", cost_price: 10 }), FULL_CTX),
    ];
    expect(sortMarginLines(lines, "profit_total").map((l) => l.code)).toEqual(["H", "L", "U"]);
    expect(sortMarginLines(lines, "net_margin").map((l) => l.code)).toEqual(["H", "L", "U"]);
    expect(sortMarginLines(lines, "name").map((l) => l.code)).toEqual(["H", "L", "U"]);
  });
});
