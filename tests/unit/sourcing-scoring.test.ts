import { describe, expect, it } from "vitest";
import { scoreOffers, rankOffers, computeDataCompleteness, computeSupplierScore, type ScorableOffer } from "@/domain/sourcing/scoring";

const offers: ScorableOffer[] = [
  { id: "a", comparablePrice: 229, moq: 10, deliveryDays: 5, supplierScore: 80, dataCompleteness: 1, potentialMargin: 50 },
  { id: "b", comparablePrice: 219, moq: 50, deliveryDays: 12, supplierScore: null, dataCompleteness: 0.6, potentialMargin: 60 },
  { id: "c", comparablePrice: null, moq: null, deliveryDays: null, supplierScore: null, dataCompleteness: 0.2, potentialMargin: null },
];

describe("OfferScoreService", () => {
  it("détaille le score par composante avec les maxima attendus", () => {
    const s = scoreOffers(offers).get("a")!;
    expect(s.breakdown.price.max).toBe(30);
    expect(s.breakdown.moq.max).toBe(20);
    expect(s.breakdown.delivery.max).toBe(20);
    expect(s.breakdown.supplier.max).toBe(20);
    expect(s.breakdown.data.max).toBe(10);
    expect(s.total).toBeCloseTo(s.breakdown.price.points + s.breakdown.moq.points + s.breakdown.delivery.points + s.breakdown.supplier.points + s.breakdown.data.points, 1);
    expect(s.coverage).toBe("complete");
    expect(s.unknownFactors).toEqual([]);
  });

  it("donne 0 point aux données inconnues et les liste", () => {
    const scores = scoreOffers(offers);
    const b = scores.get("b")!;
    expect(b.breakdown.supplier.points).toBe(0);
    expect(b.unknownFactors).toEqual(["fournisseur"]);
    expect(b.coverage).toBe("partial");
    const c = scores.get("c")!;
    expect(c.breakdown.price.points).toBe(0);
    expect(c.unknownFactors).toEqual(["prix", "MOQ", "délai", "fournisseur"]);
    expect(c.coverage).toBe("none");
  });

  it("le meilleur prix obtient le maximum de la composante prix", () => {
    const scores = scoreOffers(offers);
    expect(scores.get("b")!.breakdown.price.points).toBe(30);
    expect(scores.get("a")!.breakdown.price.points).toBeLessThan(30);
  });

  it("marque « prix seul » quand seul le prix est connu", () => {
    const s = scoreOffers([{ id: "x", comparablePrice: 10, moq: null, deliveryDays: null, supplierScore: null, dataCompleteness: 0.3 }]).get("x")!;
    expect(s.coverage).toBe("price_only");
    expect(s.coverageLabel).toContain("Comparaison partielle");
  });

  it("classe selon le mode demandé, inconnus en dernier", () => {
    expect(rankOffers(offers, "lowest_price").map((o) => o.id)).toEqual(["b", "a", "c"]);
    expect(rankOffers(offers, "fastest_delivery").map((o) => o.id)).toEqual(["a", "b", "c"]);
    expect(rankOffers(offers, "lowest_moq").map((o) => o.id)).toEqual(["a", "b", "c"]);
    expect(rankOffers(offers, "best_margin").map((o) => o.id)).toEqual(["b", "a", "c"]);
    expect(rankOffers(offers, "best_supplier")[0]?.id).toBe("a");
    expect(rankOffers(offers, "best_offer")[0]?.id).toBe("a");
  });

  it("calcule la complétude des données", () => {
    expect(computeDataCompleteness({ a: 1, b: null, c: "", d: "x" })).toBe(0.5);
  });
});

describe("SupplierScoringService", () => {
  it("retourne null avec explication quand l'historique est insuffisant", () => {
    const r = computeSupplierScore({ receivedOrders: 1, leadTimeSamples: [5], expectedLeadTimeDays: 7, problemCount: 0, activeOffers: 3 });
    expect(r.score).toBeNull();
    expect(r.reason).toContain("Données insuffisantes");
    expect(r.averageLeadTimeDays).toBe(5);
  });
  it("calcule un score avec assez de commandes", () => {
    const r = computeSupplierScore({ receivedOrders: 5, leadTimeSamples: [5, 6, 8, 9, 20], expectedLeadTimeDays: 10, problemCount: 1, activeOffers: 3 });
    expect(r.score).not.toBeNull();
    expect(r.breakdown?.reliability.points).toBe(32);
    expect(r.score!).toBeGreaterThan(0);
    expect(r.score!).toBeLessThanOrEqual(100);
  });
});
