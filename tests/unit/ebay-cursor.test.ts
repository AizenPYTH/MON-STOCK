import { describe, expect, it } from "vitest";
import { computeOrdersWindow, nextOrdersCursor, ORDERS_INITIAL_LOOKBACK_DAYS, ORDERS_OVERLAP_HOURS } from "@/integrations/ebay/cursor";

const now = new Date("2026-10-07T12:00:00.000Z");

describe("computeOrdersWindow", () => {
  it("premier import : 90 jours en arrière, jusqu'à maintenant", () => {
    const w = computeOrdersWindow(null, now);
    expect(w.initial).toBe(true);
    expect(w.until).toEqual(now);
    expect((now.getTime() - w.since.getTime()) / 86_400_000).toBe(ORDERS_INITIAL_LOOKBACK_DAYS);
  });

  it("recule du chevauchement par rapport au curseur", () => {
    const w = computeOrdersWindow("2026-10-07T09:00:00.000Z", now);
    expect(w.initial).toBe(false);
    expect(w.since.toISOString()).toBe(`2026-10-07T0${9 - ORDERS_OVERLAP_HOURS}:00:00.000Z`);
    expect(w.until).toEqual(now);
  });

  it("un curseur dans le futur ou invalide ne produit jamais une fenêtre vide", () => {
    const future = computeOrdersWindow(new Date(now.getTime() + 86_400_000), now);
    expect(future.since.getTime()).toBeLessThanOrEqual(now.getTime());
    const invalid = computeOrdersWindow("pas une date", now);
    expect(invalid.initial).toBe(true);
  });

  it("accepte des options de chevauchement", () => {
    const w = computeOrdersWindow("2026-10-07T09:00:00.000Z", now, { overlapHours: 1 });
    expect(w.since.toISOString()).toBe("2026-10-07T08:00:00.000Z");
  });
});

describe("nextOrdersCursor", () => {
  const window = computeOrdersWindow("2026-10-07T09:00:00.000Z", now);

  it("avance jusqu'à la plus grande date de modification vue", () => {
    expect(nextOrdersCursor(window, new Date("2026-10-07T11:30:00.000Z")).toISOString()).toBe("2026-10-07T11:30:00.000Z");
  });

  it("sans commande : avance à la borne haute de la fenêtre", () => {
    expect(nextOrdersCursor(window, null)).toEqual(window.until);
  });

  it("ne dépasse jamais la borne haute, sauf run tronqué où l'on reste sur la dernière vue", () => {
    expect(nextOrdersCursor(window, new Date("2026-10-07T13:00:00.000Z"))).toEqual(window.until);
    const seen = new Date("2026-10-07T10:00:00.000Z");
    expect(nextOrdersCursor(window, seen, { truncated: true })).toEqual(seen);
  });
});
