import { describe, expect, it } from "vitest";
import { planAdjustment, reasonsFor, stepPlan } from "@/features/stock-web/adjust.pure";
import { signedMovementQuantity } from "@/features/mobile-api/contract";

describe("Ajuster le stock (web) → mouvements existants", () => {
  it("Ajouter : entrée avec le motif choisi", () => {
    expect(planAdjustment({ mode: "add", quantity: 3, reason: "receipt", onHand: 5 })).toEqual({ kind: "move", type: "receipt", direction: "in", quantity: 3 });
  });
  it("Retirer : sortie ; réception / retour interdits (sens imposé en entrée)", () => {
    expect(reasonsFor("remove")).toEqual(["correction", "adjustment"]);
    expect(planAdjustment({ mode: "remove", quantity: 2, reason: "receipt", onHand: 5 })).toEqual({ kind: "move", type: "adjustment", direction: "out", quantity: 2 });
  });
  it("Définir : écart avec le stock en main (entrée, sortie ou rien)", () => {
    expect(planAdjustment({ mode: "set", quantity: 8, reason: "correction", onHand: 5 })).toEqual({ kind: "move", type: "correction", direction: "in", quantity: 3 });
    expect(planAdjustment({ mode: "set", quantity: 1, reason: "adjustment", onHand: 5 })).toEqual({ kind: "move", type: "adjustment", direction: "out", quantity: 4 });
    expect(planAdjustment({ mode: "set", quantity: 5, reason: "adjustment", onHand: 5 }).kind).toBe("skip");
  });
  it("quantités invalides refusées", () => {
    expect(planAdjustment({ mode: "add", quantity: 0, reason: "receipt", onHand: 0 }).kind).toBe("error");
    expect(planAdjustment({ mode: "add", quantity: 1.5, reason: "receipt", onHand: 0 }).kind).toBe("error");
    expect(planAdjustment({ mode: "set", quantity: -1, reason: "adjustment", onHand: 0 }).kind).toBe("error");
  });
  it("le signe final suit les règles serveur (signedMovementQuantity)", () => {
    const p = planAdjustment({ mode: "remove", quantity: 2, reason: "correction", onHand: 5 });
    if (p.kind !== "move") throw new Error("mouvement attendu");
    expect(signedMovementQuantity(p)).toBe(-2);
    expect(signedMovementQuantity(stepPlan("in"))).toBe(1);
    expect(signedMovementQuantity(stepPlan("out"))).toBe(-1);
  });
});
