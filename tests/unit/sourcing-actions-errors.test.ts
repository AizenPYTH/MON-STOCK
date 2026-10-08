/**
 * Les Server Actions du sourcing et des fournisseurs ne lèvent jamais d'exception vers le client :
 * session expirée / rôle lecture seule → ActionResult { ok: false, error } en français.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const guard = vi.hoisted(() => ({ error: null as Error | null }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/auth/dal", () => ({
  requireOrgContextForAction: vi.fn(async () => {
    if (guard.error) throw guard.error;
    throw new Error("contexte non simulé");
  }),
}));

const sourcing = await import("@/features/sourcing/actions");
const suppliers = await import("@/features/suppliers/actions");
const discovered = await import("@/features/suppliers/discovered-actions");

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const FORM_ACTIONS = {
  unlinkOfferAction: sourcing.unlinkOfferAction,
  setOfferStatusAction: sourcing.setOfferStatusAction,
  decideMatchAction: sourcing.decideMatchAction,
  toggleAlertAction: sourcing.toggleAlertAction,
  deleteAlertAction: sourcing.deleteAlertAction,
  markAlertEventsSeenAction: sourcing.markAlertEventsSeenAction,
  archiveSupplierAction: suppliers.archiveSupplierAction,
  recomputeSupplierScoreAction: suppliers.recomputeSupplierScoreAction,
  toggleSourceAction: suppliers.toggleSourceAction,
  deleteSourceAction: suppliers.deleteSourceAction,
  toggleFeedAction: suppliers.toggleFeedAction,
  validateDiscoveredSourceAction: discovered.validateDiscoveredSourceAction,
  dismissDiscoveredSourceAction: discovered.dismissDiscoveredSourceAction,
};

describe("actions : erreurs d'autorisation rendues comme un message", () => {
  beforeEach(() => {
    guard.error = null;
  });

  for (const [name, action] of Object.entries(FORM_ACTIONS)) {
    it(`${name} : rôle lecture seule → message, pas d'exception`, async () => {
      guard.error = new AppError("FORBIDDEN", "Votre rôle (lecture seule) ne permet pas cette action.");
      await expect(action(null, fd({ offer_id: "x", source_id: "00000000-0000-0000-0000-000000000000" }))).resolves.toEqual({ ok: false, error: "Votre rôle (lecture seule) ne permet pas cette action." });
    });
  }

  it("session expirée : searchSkusAction / suggestMatchesAction retournent un message", async () => {
    guard.error = new AppError("AUTH_REQUIRED", "Connexion requise.");
    await expect(sourcing.searchSkusAction("iphone")).resolves.toEqual({ ok: false, error: "Connexion requise." });
    await expect(sourcing.suggestMatchesAction("x")).resolves.toEqual({ ok: false, error: "Connexion requise." });
  });

  it("ensureManualSource n'est plus exporté par un fichier « use server »", () => {
    expect((suppliers as Record<string, unknown>).ensureManualSource).toBeUndefined();
  });
});
