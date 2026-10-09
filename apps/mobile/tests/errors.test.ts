import { GENERIC_MESSAGE, OFFLINE_MESSAGE, UserFacingError, userMessage } from "~/lib/errors";

describe("messages d'erreur (traductions partagées avec le web)", () => {
  it("traduit les refus métier du stock", () => {
    expect(userMessage({ code: "P0001", message: "INSUFFICIENT_STOCK" })).toMatch(/Stock insuffisant/);
    expect(userMessage({ code: "23505", message: "duplicate key value violates unique constraint \"skus_org_code_uidx\"" })).toMatch(/code SKU existe déjà/);
  });

  it("traduit les refus de droits (RLS / privilèges)", () => {
    expect(userMessage({ code: "42501", message: "permission denied for table orders" })).toMatch(/droits/);
    expect(userMessage({ code: "P0001", message: "FORBIDDEN" })).toMatch(/droits/);
  });

  it("n'affiche jamais un message SQL brut inconnu", () => {
    const m = userMessage({ code: "XX000", message: "relation public.secret_table does not exist at character 42" });
    expect(m).toBe(GENERIC_MESSAGE);
    expect(m).not.toMatch(/secret_table/);
  });

  it("reconnaît les erreurs réseau", () => {
    expect(userMessage(new TypeError("Network request failed"))).toBe(OFFLINE_MESSAGE);
  });

  it("traduit les erreurs Supabase Auth", () => {
    expect(userMessage({ name: "AuthApiError", message: "Invalid login credentials", status: 400 })).toBe("Email ou mot de passe incorrect.");
    expect(userMessage({ name: "AuthApiError", message: "Email not confirmed" })).toMatch(/non confirmée/);
    expect(userMessage({ name: "AuthApiError", message: "something internal" })).toMatch(/Authentification impossible/);
  });

  it("conserve un message déjà destiné à l'utilisateur", () => {
    expect(userMessage(new UserFacingError("Nom trop court."))).toBe("Nom trop court.");
  });
});
