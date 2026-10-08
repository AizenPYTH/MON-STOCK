import { describe, expect, it } from "vitest";
import { convertPrice, normalizeTax, comparablePrice, freshness, priceHistoryStats, toHt, toTtc } from "@/domain/sourcing/pricing";

describe("pricing helpers", () => {
  it("convertit avec un taux fourni et conserve l'original", () => {
    const r = convertPrice(100, "USD", "EUR", 0.92);
    expect(r?.amount).toBe(92);
    expect(r?.original).toBe(100);
    expect(r?.originalCurrency).toBe("USD");
    expect(convertPrice(100, "EUR", "EUR", null)?.rate).toBe(1);
    expect(convertPrice(100, "USD", "EUR", null)).toBeNull();
  });

  it("ne convertit HT/TTC que si le type de taxe est connu", () => {
    expect(toHt(120, 20)).toBe(100);
    expect(toTtc(100, 20)).toBe(120);
    expect(normalizeTax(120, "ttc", "ht", 20).amount).toBe(100);
    const unknown = normalizeTax(120, "unknown", "ht", 20);
    expect(unknown.amount).toBe(120);
    expect(unknown.converted).toBe(false);
    expect(unknown.note).toContain("non communiqué");
    const noVat = normalizeTax(120, "ttc", "ht", null);
    expect(noVat.converted).toBe(false);
    expect(noVat.note).toContain("TVA");
  });

  it("calcule le prix comparable avec MOQ et minimum de commande", () => {
    const r = comparablePrice({ unitPrice: 229, moq: 10, minimumOrderValue: 3000 });
    expect(r.minimumUnits).toBe(10);
    expect(r.minimumOrderValue).toBe(3000);
    expect(r.constrainedByOrderValue).toBe(true);
    const r2 = comparablePrice({ unitPrice: 229, moq: null, minimumOrderValue: null });
    expect(r2.minimumUnits).toBe(1);
    expect(r2.minimumOrderValue).toBe(229);
  });

  it("qualifie la fraîcheur", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const fresh = freshness(new Date(now.getTime() - 8 * 60_000), now);
    expect(fresh.label).toBe("Vérifié il y a 8 minutes");
    expect(fresh.stale).toBe(false);
    const stale = freshness(new Date(now.getTime() - 3 * 86_400_000), now);
    expect(stale.stale).toBe(true);
    expect(stale.veryStale).toBe(false);
    expect(stale.warning).toBe("Donnée potentiellement obsolète");
    const old = freshness(new Date(now.getTime() - 10 * 86_400_000), now);
    expect(old.veryStale).toBe(true);
    expect(old.warning).toBe("Prix potentiellement obsolète");
    expect(freshness(null).stale).toBe(true);
  });

  it("calcule les statistiques d'historique", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const day = 86_400_000;
    const s = priceHistoryStats(
      [
        { price: 250, recordedAt: new Date(now.getTime() - 40 * day) },
        { price: 240, recordedAt: new Date(now.getTime() - 20 * day) },
        { price: 260, recordedAt: new Date(now.getTime() - 10 * day) },
        { price: 200, recordedAt: new Date(now.getTime() - 1 * day) },
      ],
      now,
    );
    expect(s.current).toBe(200);
    expect(s.previous).toBe(260);
    expect(s.count30d).toBe(3);
    expect(s.avg30d).toBeCloseTo(233.33, 1);
    expect(s.vsAveragePercent).toBeCloseTo(-14.29, 1);
    expect(s.changePercent).toBeCloseTo(-23.08, 1);
    expect(priceHistoryStats([]).current).toBeNull();
  });
});
