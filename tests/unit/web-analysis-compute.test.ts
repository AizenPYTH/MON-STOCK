import { describe, expect, it } from "vitest";
import { analysisSpanDays, computeAnalysis, isoWeek, parseAnalysisPeriod, pickTopAlert, type AnalysisView } from "@/features/analysis/analysis.pure";

// Mardi 20 octobre 2026, 12 h à Paris.
const NOW = new Date("2026-10-20T10:00:00Z");

function view(p: Partial<AnalysisView["row"]> & { netProfit?: number | null; complete?: boolean }): AnalysisView {
  return {
    row: {
      sku_id: p.sku_id ?? "s",
      code: p.code ?? "CODE",
      product_name: p.product_name ?? "Produit",
      variant_name: p.variant_name ?? "Standard",
      currency: p.currency ?? "EUR",
      units_7d: p.units_7d ?? 0,
      units_30d: p.units_30d ?? 0,
      units_90d: p.units_90d ?? 0,
      quantity_available: p.quantity_available ?? 0,
      quantity_on_hand: p.quantity_on_hand ?? 0,
      cost_price: p.cost_price === undefined ? null : p.cost_price,
    },
    margin: { netProfit: p.netProfit === undefined ? null : p.netProfit, complete: p.complete ?? true },
  };
}

describe("computeAnalysis (même calcul que l'onglet Analyse de l'iPhone)", () => {
  it("CA, période précédente, commandes, panier moyen — devise de l'organisation uniquement", () => {
    const rows = [
      { day: "2026-10-20", revenue: 100, orders_count: 2, units: 2, currency: "EUR" },
      { day: "2026-10-14", revenue: 50, orders_count: 1, units: 1, currency: "EUR" },
      { day: "2026-10-13", revenue: 999, orders_count: 9, units: 9, currency: "EUR" }, // hors 7 j (période précédente)
      { day: "2026-10-19", revenue: 500, orders_count: 5, units: 5, currency: "USD" }, // autre devise : ignorée
    ];
    const d = computeAnalysis({ rows, views: [], currency: "EUR", period: 7, now: NOW });
    expect(d.revenue).toBe(150);
    expect(d.orders).toBe(3);
    expect(d.averageBasket).toBe(50);
    expect(d.revenuePrevious).toBe(999);
    expect(d.revenueChangePercent).toBe(-85);
  });

  it("sans période précédente : variation inconnue (null), jamais 0", () => {
    const d = computeAnalysis({ rows: [{ day: "2026-10-20", revenue: 10, orders_count: 1, units: 1 }], views: [], currency: "EUR", period: 30, now: NOW });
    expect(d.revenueChangePercent).toBeNull();
  });

  it("marge nette estimée : SKU au coût inconnu exclus et comptés ; frais inconnus = provisoire", () => {
    const views = [
      view({ sku_id: "a", code: "A", units_30d: 4, netProfit: 5, quantity_available: 10, quantity_on_hand: 10, cost_price: 20 }),
      view({ sku_id: "b", code: "B", units_30d: 2, netProfit: 12.5, complete: false, quantity_available: 4, quantity_on_hand: 4, cost_price: 10, variant_name: "Rouge" }),
      view({ sku_id: "c", code: "C", units_30d: 3, netProfit: null, quantity_available: 6, quantity_on_hand: 6 }),
    ];
    const d = computeAnalysis({ rows: [{ day: "2026-10-20", revenue: 90, orders_count: 3, units: 9 }], views, currency: "EUR", period: 30, now: NOW });
    expect(d.netProfit).toBe(45);
    expect(d.netProfitShare).toBe(50);
    expect(d.skusWithoutMargin).toBe(1);
    expect(d.skusPartialMargin).toBe(1);
    expect(d.topProducts.map((p) => [p.code, p.profit, p.partial])).toEqual([
      ["B", 25, true],
      ["A", 20, false],
    ]);
    expect(d.topProducts[0]?.label).toBe("Produit · Rouge");
    // couverture : 20 disponibles ÷ (9 unités / 30 j) ≈ 67 j
    expect(d.coverDays).toBe(67);
    // valeur du stock au coût connu ; le SKU sans coût est compté à part
    expect(d.stockValue).toBe(240);
    expect(d.stockWithoutCost).toBe(1);
  });

  it("aucun SKU au coût connu : marge inconnue (null)", () => {
    const d = computeAnalysis({ rows: [], views: [view({ units_7d: 1, netProfit: null })], currency: "EUR", period: 7, now: NOW });
    expect(d.netProfit).toBeNull();
    expect(d.netProfitShare).toBeNull();
    expect(d.coverDays).toBe(0);
  });

  it("CA des 5 dernières semaines ISO, semaine en cours en dernier", () => {
    const rows = [
      { day: "2026-10-19", revenue: 10, orders_count: 1, units: 1 }, // S43 (lundi)
      { day: "2026-10-18", revenue: 7, orders_count: 1, units: 1 }, // S42 (dimanche)
      { day: "2026-09-14", revenue: 3, orders_count: 1, units: 1 }, // S38
      { day: "2026-09-13", revenue: 99, orders_count: 1, units: 1 }, // S37 : hors fenêtre
    ];
    const d = computeAnalysis({ rows, views: [], currency: "EUR", period: 7, now: NOW });
    expect(d.weekly.map((w) => w.label)).toEqual(["S39", "S40", "S41", "S42", "S43"]);
    expect(d.weekly.map((w) => w.value)).toEqual([0, 0, 0, 7, 10]);
    expect(d.weekly[4]?.from).toBe("2026-10-19");
  });
});

describe("helpers", () => {
  it("semaine ISO avec l'année ISO (fin décembre / début janvier)", () => {
    expect(isoWeek("2026-10-20")).toEqual({ year: 2026, week: 43 });
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(isoWeek("2024-12-30")).toEqual({ year: 2025, week: 1 });
  });
  it("période : 7 / 30 / 90, sinon 30", () => {
    expect(parseAnalysisPeriod("7")).toBe(7);
    expect(parseAnalysisPeriod(["90"])).toBe(90);
    expect(parseAnalysisPeriod("365")).toBe(30);
    expect(parseAnalysisPeriod(undefined)).toBe(30);
    expect(analysisSpanDays(7)).toBe(35);
    expect(analysisSpanDays(90)).toBe(180);
  });
  it("alerte la plus grave puis la plus récente", () => {
    const top = pickTopAlert([
      { id: "1", severity: "info", created_at: "2026-10-20T00:00:00Z" },
      { id: "2", severity: "warning", created_at: "2026-10-18T00:00:00Z" },
      { id: "3", severity: "critical", created_at: "2026-10-01T00:00:00Z" },
    ]);
    expect(top?.id).toBe("3");
    expect(pickTopAlert([])).toBeNull();
  });
});
