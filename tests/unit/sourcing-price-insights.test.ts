import { describe, expect, it } from "vitest";
import { computePriceInsights, formatAmount, mergeHistories, percentile, type InsightPoint } from "@/domain/sourcing/price-insights";

const NOW = new Date("2026-10-08T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const pts = (list: Array<[number, number]>, sourceId = "s1"): InsightPoint[] => list.map(([d, price]) => ({ price, recordedAt: daysAgo(d), sourceId }));

/** 8 relevés sur 28 jours entre 270 et 290 € */
const usual = pts([
  [28, 280],
  [24, 270],
  [20, 290],
  [16, 285],
  [12, 275],
  [8, 280],
  [4, 290],
  [1, 270],
]);

describe("percentile", () => {
  it("interpolation linéaire", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([5], 0.25)).toBe(5);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 0.25)).toBe(20);
    expect(percentile([10, 20, 30, 40, 50], 0.75)).toBe(40);
  });
});

describe("computePriceInsights — fiabilité de l'historique", () => {
  it("moins de 5 relevés : historique insuffisant, aucune conclusion", () => {
    const r = computePriceInsights(pts([[20, 280], [10, 285], [1, 270]]), 200, { now: NOW });
    expect(r.reliable).toBe(false);
    expect(r.reason).toBe("Historique insuffisant : 3 relevé(s) sur 19 jour(s) (minimum 5 relevés sur 14 jours)");
    expect(r.usualRange).toBeNull();
    expect(r.trend).toBeNull();
    expect(r.opportunity).toBeNull();
    expect(r.abnormalLow).toBeNull();
    // le meilleur prix observé reste un fait affichable
    expect(r.bestObserved?.price).toBe(270);
  });
  it("5 relevés mais sur moins de 14 jours : insuffisant", () => {
    const r = computePriceInsights(pts([[10, 280], [8, 285], [6, 270], [4, 275], [2, 290]]), 250, { now: NOW });
    expect(r.reliable).toBe(false);
    expect(r.spanDays).toBe(8);
  });
  it("relevés invalides, futurs ou hors fenêtre ignorés", () => {
    const r = computePriceInsights([...usual, { price: 0, recordedAt: daysAgo(3) }, { price: Number.NaN, recordedAt: daysAgo(3) }, { price: 100, recordedAt: daysAgo(-2) }, { price: 50, recordedAt: daysAgo(200) }, { price: 260, recordedAt: "invalide" }], null, { now: NOW });
    expect(r.pointCount).toBe(8);
  });
  it("historique vide", () => {
    const r = computePriceInsights([], 100, { now: NOW });
    expect(r).toMatchObject({ reliable: false, pointCount: 0, bestObserved: null, currentPrice: 100 });
  });
});

describe("computePriceInsights — fourchette, tendance, opportunité", () => {
  it("fourchette habituelle P25–P75 et meilleur prix observé", () => {
    const r = computePriceInsights(usual, 280, { now: NOW });
    expect(r.reliable).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.usualRange).toMatchObject({ p25: 273.75, median: 280, p75: 286.25 });
    expect(r.usualRange!.label).toBe(`${formatAmount(273.75)}–${formatAmount(286.25)} €`);
    expect(r.bestObserved).toMatchObject({ price: 270, recordedAt: daysAgo(24) });
    expect(r.bestObserved!.label).toBe("Meilleur prix observé : 270 € le 14/09/2026");
    expect(r.sourceCount).toBe(1);
    expect(r.opportunity).toBeNull();
  });
  it("🔥 opportunité : 12 % sous le prix habituel", () => {
    const r = computePriceInsights(usual, 246.4, { now: NOW });
    expect(r.vsUsualPercent).toBe(-12);
    expect(r.opportunity).toEqual({ percentBelow: 12, message: `🔥 Opportunité détectée — prix inférieur de 12 % au prix habituel observé (${r.usualRange!.label})` });
    expect(r.abnormalLow).toBeNull();
  });
  it("pas d'opportunité pour un écart < 5 % même sous P25", () => {
    const r = computePriceInsights(usual, 270, { now: NOW });
    expect(r.opportunity).toBeNull();
  });
  it("⚠️ prix anormalement bas (> 35 %) : avertissement à la place de l'opportunité", () => {
    const r = computePriceInsights(usual, 150, { now: NOW });
    expect(r.opportunity).toBeNull();
    expect(r.abnormalLow?.percentBelow).toBeCloseTo(46.43, 2);
    expect(r.abnormalLow?.message).toBe(`⚠️ Prix anormalement bas — 46 % sous le prix habituel observé (${r.usualRange!.label}) : à vérifier avant d'acheter`);
  });
  it("prix courant inconnu : pas d'écart calculé", () => {
    const r = computePriceInsights(usual, null, { now: NOW });
    expect(r.vsUsualPercent).toBeNull();
    expect(r.opportunity).toBeNull();
  });
  it("tendance stable / hausse / baisse", () => {
    expect(computePriceInsights(usual, null, { now: NOW }).trend?.direction).toBe("stable");
    const up = computePriceInsights(pts([[28, 250], [24, 252], [20, 255], [10, 280], [6, 285], [2, 290]]), null, { now: NOW });
    expect(up.trend?.direction).toBe("hausse");
    expect(up.trend?.label).toMatch(/^Tendance à la hausse : \+/);
    const down = computePriceInsights(pts([[28, 300], [24, 305], [20, 298], [10, 260], [6, 255], [2, 250]]), null, { now: NOW });
    expect(down.trend?.direction).toBe("baisse");
    expect(down.trend!.changePercent).toBeLessThan(0);
  });
  it("options : seuils personnalisés, devise", () => {
    const r = computePriceInsights(usual, 260, { now: NOW, opportunityMinPercent: 10, currency: "USD" });
    expect(r.opportunity).toBeNull();
    expect(r.usualRange!.label.endsWith(" $")).toBe(true);
    const strict = computePriceInsights(usual, 250, { now: NOW, minSources: 2 });
    expect(strict.reliable).toBe(false);
  });
});

describe("mergeHistories — historique produit multi-offres", () => {
  it("fusionne les offres, déduplique les relevés identiques et compte les sources", () => {
    const merged = mergeHistories([
      { offerId: "o1", sourceId: "s1", points: [{ price: 280, recordedAt: daysAgo(20) }, { price: 280, recordedAt: daysAgo(20) }, { price: 275, recordedAt: daysAgo(10) }] },
      { offerId: "o2", sourceId: "s2", points: [{ price: 290, recordedAt: daysAgo(18) }, { price: 285, recordedAt: daysAgo(5) }, { price: 270, recordedAt: daysAgo(1) }] },
    ]);
    expect(merged).toHaveLength(5);
    const r = computePriceInsights(merged, 240, { now: NOW });
    expect(r.reliable).toBe(true);
    expect(r.sourceCount).toBe(2);
    expect(r.pointCount).toBe(5);
    expect(r.opportunity?.percentBelow).toBeCloseTo(14.29, 2);
  });
});
