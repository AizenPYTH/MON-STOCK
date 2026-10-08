import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { feedbackCodeFromError, feedbackFor, inviteErrorCode, inviteErrorMessage, organizationDbErrorMessage } from "@/features/organizations/feedback";

describe("Retours des actions d'administration (codes)", () => {
  it("n'affiche que des messages connus", () => {
    expect(feedbackFor("role_updated")?.tone).toBe("success");
    expect(feedbackFor("last_owner")?.message).toMatch(/au moins un propriétaire/);
    expect(feedbackFor("<script>alert(1)</script>")).toBeNull();
    expect(feedbackFor("toString")).toBeNull();
    expect(feedbackFor(undefined)).toBeNull();
  });

  it("traduit les erreurs en codes", () => {
    expect(feedbackCodeFromError(new AppError("AUTH_REQUIRED", "x"))).toBe("session_expired");
    expect(feedbackCodeFromError(new AppError("FORBIDDEN", "x"))).toBe("forbidden");
    expect(feedbackCodeFromError({ message: "LAST_OWNER" })).toBe("last_owner");
    expect(feedbackCodeFromError({ message: "new row violates row-level security policy" })).toBe("forbidden");
    expect(feedbackCodeFromError(new Error("boom"))).toBe("error");
  });

  it("invitations : codes d'erreur et messages", () => {
    expect(inviteErrorCode("INVITATION_EMAIL_MISMATCH")).toBe("email_mismatch");
    expect(inviteErrorCode("INVITATION_EMAIL_NOT_CONFIRMED")).toBe("email_not_confirmed");
    expect(inviteErrorCode("INVITATION_INVALID")).toBe("invalid");
    expect(inviteErrorCode("AUTH_REQUIRED")).toBe("error");
    expect(inviteErrorMessage("email_mismatch")).toMatch(/autre adresse email/);
    expect(inviteErrorMessage("Texte injecté par un lien forgé")).toBe(inviteErrorMessage("error"));
    expect(inviteErrorMessage(undefined)).toBeUndefined();
  });

  it("contraintes de la base : messages explicites", () => {
    expect(organizationDbErrorMessage("ORGANIZATION_NOT_MEMBER")).toMatch(/pas membre/);
    expect(organizationDbErrorMessage("CROSS_ORGANIZATION_REFERENCE: skus.product_id → products")).toMatch(/introuvable/);
    expect(organizationDbErrorMessage("autre")).toBeNull();
  });
});
