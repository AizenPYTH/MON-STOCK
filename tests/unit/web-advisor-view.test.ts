import { describe, expect, it } from "vitest";
import type { AdvisorActionDTO, AdvisorCardDTO } from "@/features/mobile-api/contract";
import { actionIdsOf, displayedActionStatus, formatActionAmount, replaceActionInCards, sanitizeStoredCards, sanitizeStoredSources } from "@/features/advisor/view.pure";

const action: AdvisorActionDTO = { id: "a1", type: "update_sku_price", status: "pending", summary: "Passer le prix de ABC à 12,50 €", amount: "12.50", currency: "EUR", expiresAt: "2026-10-20T10:10:00Z", outcome: null };
const card = (a: AdvisorActionDTO | null): AdvisorCardDTO => ({ kind: a ? "action" : "kpis", title: "T", subtitle: null, rows: [], warnings: [], action: a, text: null });

describe("affichage des actions du conseiller", () => {
  it("une action à confirmer dont le délai est passé s'affiche expirée", () => {
    expect(displayedActionStatus(action, new Date("2026-10-20T10:00:00Z"))).toBe("pending");
    expect(displayedActionStatus(action, new Date("2026-10-20T10:10:01Z"))).toBe("expired");
    expect(displayedActionStatus({ ...action, status: "executed" }, new Date("2026-10-21T00:00:00Z"))).toBe("executed");
  });

  it("montant exact au format français ; absent → null", () => {
    expect(formatActionAmount("12.50", "EUR")).toBe("12,50 EUR");
    expect(formatActionAmount(null, "EUR")).toBeNull();
  });

  it("remplace l'action décidée dans les cartes, sans toucher aux autres", () => {
    const cards = [card(action), card(null), card({ ...action, id: "a2" })];
    const done = { ...action, status: "executed" as const, outcome: "Prix modifié." };
    const out = replaceActionInCards(cards, done);
    expect(out[0]?.action).toEqual(done);
    expect(out[1]).toBe(cards[1]);
    expect(out[2]?.action?.status).toBe("pending");
    expect(actionIdsOf(cards)).toEqual(["a1", "a2"]);
  });

  it("cartes et sources enregistrées : formes inattendues écartées", () => {
    expect(sanitizeStoredCards(null)).toEqual([]);
    expect(sanitizeStoredCards([{ foo: 1 }, { kind: "list", title: "Ventes", rows: [] }])).toEqual([{ kind: "list", title: "Ventes", rows: [], subtitle: null, warnings: [], action: null, text: null }]);
    expect(sanitizeStoredSources(["Bilan", 3, null])).toEqual(["Bilan"]);
  });
});
