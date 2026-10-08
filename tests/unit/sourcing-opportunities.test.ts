import { describe, expect, it } from "vitest";
import { detectOpportunities } from "@/domain/sourcing/opportunities";

const now = new Date("2026-10-07T12:00:00Z");
const day = 86_400_000;
const at = (d: number) => new Date(now.getTime() - d * day);

describe("detectOpportunities", () => {
  it("détecte une baisse de prix et un prix anormalement bas", () => {
    const ops = detectOpportunities(
      { price: 150, currency: "EUR", availableQuantity: 10, stockStatus: "in_stock" },
      [
        { price: 230, recordedAt: at(20) },
        { price: 235, recordedAt: at(12) },
        { price: 228, recordedAt: at(5) },
        { price: 150, recordedAt: at(0) },
      ],
      [],
      now,
    );
    const kinds = ops.map((o) => o.kind);
    expect(kinds).toContain("price_drop");
    expect(kinds).toContain("abnormal_low_price");
    expect(ops.find((o) => o.kind === "price_drop")?.value).toBeCloseTo(34.2, 0);
  });

  it("ne signale rien sans historique suffisant", () => {
    const ops = detectOpportunities({ price: 150, currency: "EUR", availableQuantity: null, stockStatus: "unknown" }, [{ price: 150, recordedAt: at(0) }], [], now);
    expect(ops).toEqual([]);
  });

  it("détecte un retour en stock", () => {
    const ops = detectOpportunities({ price: 100, currency: "EUR", availableQuantity: 25, stockStatus: "in_stock" }, [], [{ availableQuantity: 0, stockStatus: "out_of_stock", recordedAt: at(2) }], now);
    expect(ops[0]?.kind).toBe("new_stock");
    expect(ops[0]?.message).toContain("25");
  });

  it("détecte une forte baisse de stock", () => {
    const ops = detectOpportunities({ price: 100, currency: "EUR", availableQuantity: 4, stockStatus: "low" }, [], [{ availableQuantity: 40, stockStatus: "in_stock", recordedAt: at(1) }], now);
    expect(ops[0]?.kind).toBe("low_stock");
  });

  it("n'invente pas de retour en stock quand le stock était inconnu", () => {
    const ops = detectOpportunities({ price: 100, currency: "EUR", availableQuantity: 25, stockStatus: "in_stock" }, [], [{ availableQuantity: null, stockStatus: "unknown", recordedAt: at(2) }], now);
    expect(ops).toEqual([]);
  });
});
