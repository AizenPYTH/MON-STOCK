import { describe, expect, it } from "vitest";
import { dayKey, fillDailySeries, shiftDayKey, summarizeSalesWindows, zonedDayStartIso } from "@/features/analytics/series.pure";
import { aggregateMargins, buildMarginLine, type MarginLineInput } from "@/features/analytics/margins.pure";
import { evaluateOpportunity } from "@/features/analytics/opportunities.pure";
import { buildInsights } from "@/features/analytics/priorities.pure";

describe("jours civils Europe/Paris", () => {
  it("« aujourd'hui » commence à minuit heure de Paris (été UTC+2, hiver UTC+1)", () => {
    expect(dayKey(new Date("2026-10-07T21:59:00Z"))).toBe("2026-10-07");
    expect(dayKey(new Date("2026-10-07T22:00:00Z"))).toBe("2026-10-08");
    expect(dayKey(new Date("2026-01-15T22:59:00Z"))).toBe("2026-01-15");
    expect(dayKey(new Date("2026-01-15T23:00:00Z"))).toBe("2026-01-16");
  });

  it("bornes de jour converties en instants UTC, y compris les jours de changement d'heure", () => {
    expect(zonedDayStartIso("2026-10-08")).toBe("2026-10-07T22:00:00.000Z");
    expect(zonedDayStartIso("2026-01-16")).toBe("2026-01-15T23:00:00.000Z");
    // 29 mars 2026 (passage à l'heure d'été à 2 h) : minuit est encore en UTC+1.
    expect(zonedDayStartIso("2026-03-29")).toBe("2026-03-28T23:00:00.000Z");
    expect(zonedDayStartIso("2026-03-30")).toBe("2026-03-29T22:00:00.000Z");
    // 25 octobre 2026 (retour à l'heure d'hiver) : minuit est encore en UTC+2.
    expect(zonedDayStartIso("2026-10-25")).toBe("2026-10-24T22:00:00.000Z");
    expect(zonedDayStartIso("2026-10-26")).toBe("2026-10-25T23:00:00.000Z");
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("la série se termine sur le jour de Paris, même tard le soir en UTC", () => {
    const lateEvening = new Date("2026-10-07T22:30:00Z"); // 00:30 le 8 à Paris
    const series = fillDailySeries([{ day: "2026-10-08", revenue: 10, orders_count: 1, units: 1 }], 2, lateEvening);
    expect(series.map((p) => p.day)).toEqual(["2026-10-07", "2026-10-08"]);
    expect(series[1]?.revenue).toBe(10);
  });
});

describe("devises : jamais d'addition silencieuse", () => {
  const NOW = new Date("2026-10-07T12:00:00Z");
  const rows = [
    { day: "2026-10-07", revenue: 100, orders_count: 1, units: 2, currency: "EUR" },
    { day: "2026-10-07", revenue: 80, orders_count: 1, units: 1, currency: "USD" },
    { day: "2026-10-01", revenue: 30, orders_count: 2, units: 3, currency: "GBP" },
    { day: "2026-08-01", revenue: 999, orders_count: 9, units: 9, currency: "USD" },
  ];

  it("le CA ne contient que la devise de l'organisation ; commandes et unités comptent toutes", () => {
    const w = summarizeSalesWindows(rows, NOW, "EUR");
    expect(w.today).toEqual({ revenue: 100, orders: 2, units: 3, days: 1 });
    expect(w.last30d).toEqual({ revenue: 100, orders: 4, units: 6, days: 30 });
    // Les autres devises (30 derniers jours) sont rapportées à part, sans conversion.
    expect(w.otherCurrencies).toEqual([
      { currency: "GBP", revenue: 30, orders: 2 },
      { currency: "USD", revenue: 80, orders: 1 },
    ]);
  });

  it("série quotidienne : montant en devise principale uniquement", () => {
    const series = fillDailySeries(rows, 1, NOW, { currency: "EUR" });
    expect(series).toEqual([{ day: "2026-10-07", revenue: 100, orders: 2, units: 3 }]);
  });

  const CTX = { feePercent: 10, paymentFeePercent: 0, paymentFeeFixed: 0, shippingCost: 0 };
  const line = (over: Partial<MarginLineInput>): MarginLineInput => ({
    sku_id: "s",
    code: "S",
    product_name: "P",
    variant_name: null,
    currency: "EUR",
    sale_price: 100,
    avg_sale_price_30d: null,
    cost_price: 50,
    units_30d: 2,
    revenue_30d: 200,
    quantity_on_hand: 1,
    ...over,
  });

  it("marges : un SKU dans une autre devise est exclu des totaux et signalé", () => {
    const agg = aggregateMargins([buildMarginLine(line({ sku_id: "a" }), CTX), buildMarginLine(line({ sku_id: "b", currency: "USD", revenue_30d: 5000 }), CTX), buildMarginLine(line({ sku_id: "c", foreign_currency_units_30d: 3 }), CTX)], "EUR");
    expect(agg.revenue30d).toBe(400);
    expect(agg.included).toBe(2);
    expect(agg.excludedOtherCurrency).toBe(1);
    expect(agg.foreignCurrencyUnits30d).toBe(3);
    expect(agg.profit30d).toBe(2 * 40 * 2);
    expect(agg.caveat).toContain("1 SKU exclu : autre devise");
    expect(agg.caveat).toContain("3 unités vendues dans une autre devise");
  });

  it("opportunités : prix de vente et prix fournisseur de devises différentes → données insuffisantes", () => {
    const ev = evaluateOpportunity({ salePrice: 100, salePriceBasis: "avg_30d", supplierPrice: 10, landedUnitCost: null, taxType: "ht", fees: CTX, saleCurrency: "EUR", supplierCurrency: "USD" });
    expect(ev.status).toBe("insufficient_data");
    expect(ev.missing.join(" ")).toContain("devises différentes");
    const same = evaluateOpportunity({ salePrice: 100, salePriceBasis: "avg_30d", supplierPrice: 10, landedUnitCost: null, taxType: "ht", fees: CTX, saleCurrency: "eur", supplierCurrency: "EUR" });
    expect(same.status).toBe("potential");
  });
});

describe("insights : liens d'action", () => {
  it("le stock dormant mène à la liste triée par ancienneté de la dernière vente (jamais vendu d'abord)", () => {
    const items = buildInsights({ outOfStock: [], atRisk: [], lowCount: 0, syncFailed24h: 0, openAlerts: 0, unmappedListings: 0, pendingSales: 0, negativeStock: 0, unknownCostWithSales: 0, deadStock: 4, channelsMissingFees: [] });
    expect(items.find((i) => i.key === "dead")?.href).toBe("/stock?sort=oldest_sale&stock=in_stock");
  });

  it("vitesse lente affichée sans arrondi trompeur", () => {
    const items = buildInsights({ outOfStock: [{ code: "A", name: "A", dailyVelocity: 0.04, daysOfCover: 0 }], atRisk: [], lowCount: 0, syncFailed24h: 0, openAlerts: 0, unmappedListings: 0, pendingSales: 0, negativeStock: 0, unknownCostWithSales: 0, deadStock: 0, channelsMissingFees: [] });
    expect(items[0]?.detail).toContain("0.04 vente(s)/jour");
  });
});
