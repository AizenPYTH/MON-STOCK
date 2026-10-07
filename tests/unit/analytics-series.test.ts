import { describe, expect, it } from "vitest";
import { fillDailySeries, niceTicks, sparklinePoints, summarizeSalesWindows } from "@/features/analytics/series.pure";

const NOW = new Date("2026-10-07T15:30:00Z");

describe("fillDailySeries", () => {
  it("comble les jours manquants à 0 et termine sur aujourd'hui", () => {
    const rows = [
      { day: "2026-10-07", revenue: 120.5, orders_count: 2, units: 3 },
      { day: "2026-10-05", revenue: 40, orders_count: 1, units: 1 },
    ];
    const series = fillDailySeries(rows, 5, NOW);
    expect(series.map((p) => p.day)).toEqual(["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(series[2]).toEqual({ day: "2026-10-05", revenue: 40, orders: 1, units: 1 });
    expect(series[3]).toEqual({ day: "2026-10-06", revenue: 0, orders: 0, units: 0 });
    expect(series[4]?.revenue).toBe(120.5);
  });

  it("ignore les lignes sans jour et additionne les doublons", () => {
    const series = fillDailySeries(
      [
        { day: null, revenue: 999, orders_count: 9, units: 9 },
        { day: "2026-10-07", revenue: 10, orders_count: 1, units: 1 },
        { day: "2026-10-07", revenue: 5, orders_count: 1, units: 2 },
      ],
      1,
      NOW,
    );
    expect(series).toEqual([{ day: "2026-10-07", revenue: 15, orders: 2, units: 3 }]);
  });
});

describe("summarizeSalesWindows", () => {
  it("calcule aujourd'hui / 7 j / 30 j sans compter les jours hors fenêtre", () => {
    const rows = [
      { day: "2026-10-07", revenue: 100, orders_count: 1, units: 1 },
      { day: "2026-10-02", revenue: 50, orders_count: 1, units: 2 },
      { day: "2026-09-15", revenue: 20, orders_count: 1, units: 1 },
      { day: "2026-08-01", revenue: 1000, orders_count: 10, units: 10 },
    ];
    const w = summarizeSalesWindows(rows, NOW);
    expect(w.today).toEqual({ revenue: 100, orders: 1, units: 1, days: 1 });
    expect(w.last7d).toEqual({ revenue: 150, orders: 2, units: 3, days: 7 });
    expect(w.last30d).toEqual({ revenue: 170, orders: 3, units: 4, days: 30 });
  });

  it("retourne des zéros (et non des valeurs inventées) sans aucune vente", () => {
    const w = summarizeSalesWindows([], NOW);
    expect(w.last30d.revenue).toBe(0);
    expect(w.last30d.orders).toBe(0);
  });
});

describe("niceTicks", () => {
  it("produit des graduations rondes couvrant le maximum", () => {
    expect(niceTicks(0)).toEqual([0]);
    const t = niceTicks(1234, 4);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(1234);
    expect(t.every((v, i) => i === 0 || v - (t[i - 1] ?? 0) === 500)).toBe(true);
  });
});

describe("sparklinePoints", () => {
  it("met le maximum en haut et une série plate sur la ligne de base", () => {
    const pts = sparklinePoints([0, 5, 10], 100, 20, 0);
    expect(pts[0]).toEqual([0, 20]);
    expect(pts[2]).toEqual([100, 0]);
    expect(sparklinePoints([0, 0], 10, 10, 0).every(([, y]) => y === 10)).toBe(true);
    expect(sparklinePoints([], 10, 10)).toEqual([]);
  });
});
