import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/utils";
import { callbackErrorCode, loginErrorMessage } from "@/features/auth/messages";

describe("safeInternalPath (paramètre ?next= : pas d'open redirect)", () => {
  it.each([
    ["https://evil.example/phish"],
    ["//evil.example"],
    ["/\\evil.example"],
    ["\\\\evil.example"],
    ["/\t/evil.example"],
    ["/\n/evil.example"],
    ["javascript:alert(1)"],
    ["evil.example"],
    [""],
    ["/%5Cevil.example"],
  ])("refuse %j", (raw) => {
    const out = safeInternalPath(raw, "/dashboard");
    // Soit le repli, soit un chemin qui reste sur l'origine de l'application.
    expect(out.startsWith("/")).toBe(true);
    expect(out.startsWith("//")).toBe(false);
    expect(new URL(out, "https://app.example").origin).toBe("https://app.example");
  });

  it("refuse les valeurs non textuelles et trop longues", () => {
    expect(safeInternalPath(undefined, "/x")).toBe("/x");
    expect(safeInternalPath(null, "/x")).toBe("/x");
    expect(safeInternalPath(42, "/x")).toBe("/x");
    expect(safeInternalPath("/" + "a".repeat(5000), "/x")).toBe("/x");
  });

  it("conserve les chemins internes légitimes (requête comprise)", () => {
    expect(safeInternalPath("/invite/abc123", "/dashboard")).toBe("/invite/abc123");
    expect(safeInternalPath("/stock?q=iphone&page=2", "/dashboard")).toBe("/stock?q=iphone&page=2");
    expect(safeInternalPath("/update-password", "/dashboard")).toBe("/update-password");
  });
});

describe("Messages d'erreur de connexion (codes, jamais de texte libre)", () => {
  it("traduit les codes connus et remplace tout texte inconnu par un message générique", () => {
    expect(loginErrorMessage("session_expired")).toMatch(/session a expiré/);
    expect(loginErrorMessage("reset_link_expired")).toMatch(/réinitialisation/);
    expect(loginErrorMessage("Votre compte est suspendu, appelez le 0800 000 000")).toBe(loginErrorMessage("link_invalid"));
    expect(loginErrorMessage("__proto__")).toBe(loginErrorMessage("link_invalid"));
    expect(loginErrorMessage(undefined)).toBeUndefined();
  });

  it("callback : un lien de réinitialisation expiré renvoie vers un message dédié", () => {
    expect(callbackErrorCode({ errorCode: "otp_expired", next: "/update-password" })).toBe("reset_link_expired");
    expect(callbackErrorCode({ errorCode: "otp_expired", next: "/onboarding" })).toBe("link_expired");
    expect(callbackErrorCode({ errorCode: null, next: "/dashboard" })).toBe("link_invalid");
  });

  it("callback : seul un code réellement « expiré » est présenté comme tel", () => {
    for (const code of ["otp_expired", "flow_state_expired", "flow_state_not_found"]) {
      expect(callbackErrorCode({ errorCode: code, next: "/update-password", exchangeFailed: true })).toBe("reset_link_expired");
    }
    // Échec de l'échange PKCE sans code d'expiration (autre navigateur, code absent) : message distinct.
    expect(callbackErrorCode({ errorCode: "pkce_code_verifier_not_found", next: "/update-password", exchangeFailed: true })).toBe("link_not_validated");
    expect(callbackErrorCode({ errorCode: null, next: "/update-password", exchangeFailed: true })).toBe("link_not_validated");
    expect(callbackErrorCode({ errorCode: undefined, next: "/dashboard", exchangeFailed: true })).toBe("link_not_validated");
    // Lien sans code ni erreur reconnue, y compris vers /update-password.
    expect(callbackErrorCode({ errorCode: "access_denied", next: "/update-password" })).toBe("link_invalid");
    expect(callbackErrorCode({ errorCode: null, next: "/update-password" })).toBe("link_invalid");
    expect(loginErrorMessage("link_not_validated")).toMatch(/navigateur où vous avez fait la demande/);
  });
});
