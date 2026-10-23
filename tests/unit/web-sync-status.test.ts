import { describe, expect, it } from "vitest";
import { BUDGET_REACHED_CODE, BUDGET_REACHED_MESSAGE } from "@/services/sync/engine";
import {
  BUDGET_RESUME_CODE,
  BUDGET_RESUME_PREFIX,
  connectionStatusView,
  extraErrorsAfterResume,
  isBudgetResume,
  runIssueCount,
  runStatusView,
  runStoppedByBudget,
} from "@/features/integrations/components/sync-status";

describe("présentation des passages de synchronisation", () => {
  it("reste aligné sur le moteur (message et code du budget atteint)", () => {
    expect(BUDGET_REACHED_MESSAGE.startsWith(BUDGET_RESUME_PREFIX)).toBe(true);
    expect(BUDGET_RESUME_CODE).toBe(BUDGET_REACHED_CODE);
  });

  it("lit un arrêt sur budget comme une reprise normale, pas comme une erreur", () => {
    const run = { status: "partial", stats: { budget_reached: true }, error_summary: BUDGET_REACHED_MESSAGE, error_count: 1 };
    expect(runStoppedByBudget(run)).toBe(true);
    expect(runStatusView(run)).toMatchObject({ tone: "info", label: "Reprise prévue" });
    expect(runIssueCount(run)).toBe(0);
  });

  it("garde les erreurs réelles d'un passage arrêté par le budget", () => {
    const summary = `${BUDGET_REACHED_MESSAGE} (+2 autre(s))`;
    const run = { status: "partial", stats: null, error_summary: summary, error_count: 3 };
    expect(runStoppedByBudget(run)).toBe(true);
    expect(runIssueCount(run)).toBe(2);
    expect(extraErrorsAfterResume(summary)).toBe(2);
  });

  it("n'assimile pas un partiel ordinaire ni un échec à une reprise", () => {
    const partial = { status: "partial", stats: { budget_reached: false }, error_summary: "Annonce refusée", error_count: 2 };
    expect(runStoppedByBudget(partial)).toBe(false);
    expect(runStatusView(partial).tone).toBe("warning");
    expect(runIssueCount(partial)).toBe(2);
    const failed = { status: "failed", stats: { budget_reached: true }, error_summary: BUDGET_REACHED_MESSAGE, error_count: 1 };
    expect(runStoppedByBudget(failed)).toBe(false);
    expect(runStatusView(failed).tone).toBe("danger");
    expect(isBudgetResume("Délai dépassé")).toBe(false);
    expect(isBudgetResume(null)).toBe(false);
  });

  it("nomme les états de connexion sans en inventer", () => {
    expect(connectionStatusView("connected")).toMatchObject({ tone: "success", label: "Connecté" });
    expect(connectionStatusView("expired").tone).toBe("danger");
    expect(connectionStatusView("pending").tone).toBe("pending");
    expect(connectionStatusView(null).label).toBe("Non connecté");
    expect(connectionStatusView("inconnu")).toMatchObject({ tone: "neutral", label: "inconnu" });
  });
});
