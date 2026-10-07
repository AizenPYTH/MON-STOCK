import { describe, expect, it } from "vitest";
import { computeDaysOfCover, computeVelocity } from "@/domain/inventory/velocity";

const now = new Date("2026-10-07T12:00:00Z");

describe("computeVelocity", () => {
  it("ne retourne aucune vitesse sans historique", () => {
    const r = computeVelocity({ units7d: 0, units30d: 0, units90d: 0, unitsPrev7d: 0, unitsPrev30d: 0, firstSaleAt: null, lastSaleAt: null }, { now });
    expect(r.dailyVelocity).toBeNull();
    expect(r.confidence).toBe("none");
    expect(r.explanation).toContain("Pas assez de données");
  });

  it("utilise la fenêtre de 7 jours quand elle est dense", () => {
    const r = computeVelocity({ units7d: 31, units30d: 90, units90d: 200, unitsPrev7d: 25, unitsPrev30d: 80, firstSaleAt: new Date("2026-01-01"), lastSaleAt: now }, { now });
    expect(r.basis).toBe("7d");
    expect(r.dailyVelocity).toBeCloseTo(31 / 7, 5);
    expect(r.trend).toBe("up");
    expect(r.trendPercent).toBeCloseTo(24, 0);
    expect(r.confidence).toBe("high");
  });

  it("borne la fenêtre à l'ancienneté de la première vente", () => {
    const r = computeVelocity({ units7d: 2, units30d: 6, units90d: 6, unitsPrev7d: 4, unitsPrev30d: 0, firstSaleAt: new Date("2026-09-30T12:00:00Z"), lastSaleAt: now }, { now });
    expect(r.basis).toBe("30d");
    expect(r.basisDays).toBe(7);
    expect(r.dailyVelocity).toBeCloseTo(6 / 7, 5);
    expect(r.trend).toBe("down");
  });

  it("signale une confiance faible avec très peu de ventes", () => {
    const r = computeVelocity({ units7d: 0, units30d: 1, units90d: 2, unitsPrev7d: 0, unitsPrev30d: 1, firstSaleAt: new Date("2026-01-01"), lastSaleAt: now }, { now });
    expect(r.basis).toBe("90d");
    expect(r.confidence).toBe("low");
    expect(r.dailyVelocity).toBeCloseTo(2 / 90, 5);
  });
});

describe("computeDaysOfCover", () => {
  it("calcule stock / vitesse", () => {
    expect(computeDaysOfCover(8, 4.4)).toBeCloseTo(1.818, 2);
  });
  it("retourne null si la vitesse est inconnue", () => {
    expect(computeDaysOfCover(8, null)).toBeNull();
  });
  it("retourne 0 sans stock et l'infini sans ventes", () => {
    expect(computeDaysOfCover(0, 2)).toBe(0);
    expect(computeDaysOfCover(5, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});
