import { describe, expect, it } from "vitest";
import { computeOrdersWindow, nextOrdersCursor, resolveOrdersCursor, splitOrdersWindow, ORDERS_INITIAL_LOOKBACK_DAYS, ORDERS_OVERLAP_HOURS, type OrdersProgress } from "@/integrations/ebay/cursor";

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

  it("ne dépasse jamais la borne haute", () => {
    expect(nextOrdersCursor(window, new Date("2026-10-07T13:00:00.000Z"))).toEqual(window.until);
  });
});

describe("splitOrdersWindow", () => {
  it("découpe la fenêtre en tranches contiguës, de la plus ancienne à la plus récente", () => {
    const w = computeOrdersWindow(null, now);
    const slices = splitOrdersWindow(w, 24 * 7);
    expect(slices[0]!.since).toEqual(w.since);
    expect(slices.at(-1)!.until).toEqual(w.until);
    for (let i = 1; i < slices.length; i++) expect(slices[i]!.since).toEqual(slices[i - 1]!.until);
    expect(slices.length).toBe(Math.ceil(ORDERS_INITIAL_LOOKBACK_DAYS / 7));
  });
  it("une fenêtre courte reste une seule tranche", () => {
    const w = computeOrdersWindow("2026-10-07T09:00:00.000Z", now);
    expect(splitOrdersWindow(w, 24)).toEqual([w]);
  });
});

describe("resolveOrdersCursor", () => {
  const window = computeOrdersWindow("2026-10-07T09:00:00.000Z", now);
  const base: OrdersProgress = { completedUntil: window.until, windowComplete: true, maxModifiedSeen: null, failed: 0, minFailedModified: null, failedWithoutDate: false };

  it("fenêtre complète sans échec : comme nextOrdersCursor", () => {
    expect(resolveOrdersCursor(window, base, "2026-10-07T09:00:00.000Z")).toEqual(window.until);
    expect(resolveOrdersCursor(window, { ...base, maxModifiedSeen: new Date("2026-10-07T11:00:00.000Z") }, "2026-10-07T09:00:00.000Z")!.toISOString()).toBe("2026-10-07T11:00:00.000Z");
  });

  it("fenêtre tronquée : jamais au-delà de la dernière tranche lue EN ENTIER (même si une commande plus récente a été vue)", () => {
    const completedUntil = new Date("2026-10-07T10:00:00.000Z");
    const r = resolveOrdersCursor(window, { ...base, windowComplete: false, completedUntil, maxModifiedSeen: new Date("2026-10-07T11:59:00.000Z") }, "2026-10-07T09:00:00.000Z");
    expect(r).toEqual(completedUntil);
    // Aucune tranche complète : le curseur ne bouge pas.
    expect(resolveOrdersCursor(window, { ...base, windowComplete: false, completedUntil: null }, "2026-10-07T09:00:00.000Z")).toBeNull();
  });

  it("une commande en échec retient le curseur à sa date ; un échec sans date le bloque", () => {
    const failedAt = new Date("2026-10-07T07:30:00.000Z");
    expect(resolveOrdersCursor(window, { ...base, failed: 1, minFailedModified: failedAt }, "2026-10-07T09:00:00.000Z")).toEqual(failedAt);
    expect(resolveOrdersCursor(window, { ...base, failed: 1, failedWithoutDate: true }, "2026-10-07T09:00:00.000Z")).toBeNull();
  });

  it("sans échec, le curseur ne recule jamais", () => {
    expect(resolveOrdersCursor(window, { ...base, maxModifiedSeen: new Date("2026-10-07T07:00:00.000Z") }, "2026-10-07T09:00:00.000Z")).toBeNull();
  });
});
