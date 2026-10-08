import { describe, expect, it } from "vitest";
import { groupPriceHistory, summarizeSupplierHistories } from "@/domain/sourcing/price-history";
import { computePriceInsights } from "@/domain/sourcing/price-insights";

const row = (offer_id: string, price: number, at: string, currency = "EUR", normalized: number | null = null, normCur: string | null = null) => ({ offer_id, original_price: price, original_currency: currency, normalized_price: normalized, normalized_currency: normCur, recorded_at: at });

describe("historique de prix par offre / fournisseur", () => {
  it("ramène les relevés dans la devise de l'organisation sans conversion inventée", () => {
    const g = groupPriceHistory([row("a", 300, "2026-10-02T00:00:00Z"), row("a", 290, "2026-10-01T00:00:00Z"), row("b", 320, "2026-10-01T00:00:00Z", "USD", 295, "EUR"), row("c", 320, "2026-10-01T00:00:00Z", "USD"), row("a", 0, "2026-10-03T00:00:00Z")], "eur");
    expect(g.get("a")!.map((p) => p.price)).toEqual([290, 300]);
    expect(g.get("b")!.map((p) => p.price)).toEqual([295]);
    expect(g.has("c")).toBe(false);
  });

  it("synthèse par fournisseur (plusieurs offres fusionnées), fournisseurs sans relevé en dernier", () => {
    const g = groupPriceHistory([row("a1", 300, "2026-10-01T00:00:00Z"), row("a2", 280, "2026-10-05T00:00:00Z"), row("b", 310, "2026-10-03T00:00:00Z")], "EUR");
    const s = summarizeSupplierHistories([{ id: "a1", supplierId: "A", supplierName: "Alpha" }, { id: "a2", supplierId: "A", supplierName: "Alpha" }, { id: "b", supplierId: "B", supplierName: "Beta" }, { id: "c", supplierId: "C", supplierName: "Gamma" }], g);
    expect(s.map((x) => x.supplierId)).toEqual(["A", "B", "C"]);
    expect(s[0]).toMatchObject({ pointCount: 2, minPrice: 280, maxPrice: 300, lastPrice: 280, points: [300, 280], offerIds: ["a1", "a2"] });
    expect(s[2]).toMatchObject({ pointCount: 0, lastPrice: null, minPrice: null });
  });

  it("insights : rien de conclu sur un historique insuffisant", () => {
    const g = groupPriceHistory([row("a", 300, "2026-10-01T00:00:00Z"), row("a", 290, "2026-10-02T00:00:00Z")], "EUR");
    const i = computePriceInsights(g.get("a")!, 250, { now: new Date("2026-10-08T00:00:00Z") });
    expect(i.reliable).toBe(false);
    expect(i.opportunity).toBeNull();
    expect(i.reason).toMatch(/Historique insuffisant/);
  });
});
