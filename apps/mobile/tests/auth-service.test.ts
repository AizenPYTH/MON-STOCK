const mockAuth = {
  signInWithPassword: jest.fn(),
  signUp: jest.fn(),
  resetPasswordForEmail: jest.fn(),
  exchangeCodeForSession: jest.fn(),
  signOut: jest.fn(),
};
jest.mock("~/lib/supabase", () => ({ requireSupabase: () => ({ auth: mockAuth }), getSupabase: () => ({ auth: mockAuth }) }));
jest.mock("expo-linking", () => ({ createURL: (path: string, opts?: { queryParams?: Record<string, string> }) => `monstock://${path.replace(/^\//, "")}${opts?.queryParams?.next ? `?next=${encodeURIComponent(opts.queryParams.next)}` : ""}` }));

import { completeAuthCallback, requestPasswordReset, safeNext, signIn, signOut, signUp } from "~/auth/auth-service";

beforeEach(() => jest.clearAllMocks());

describe("authentification mobile", () => {
  it("valide les champs avant tout appel réseau", async () => {
    const r = await signIn({ email: "pas-un-email", password: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toMatchObject({ email: "Adresse email invalide.", password: "Mot de passe requis." });
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("traduit un mauvais mot de passe", async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ error: { name: "AuthApiError", message: "Invalid login credentials" } });
    const r = await signIn({ email: "A@Exemple.fr", password: "x" });
    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({ email: "a@exemple.fr", password: "x" });
    expect(r).toEqual({ ok: false, error: "Email ou mot de passe incorrect." });
  });

  it("inscription : lien de confirmation vers l'application (deep link)", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const r = await signUp({ email: "a@exemple.fr", password: "motdepasse", full_name: "Ana" });
    expect(r).toEqual({ ok: true, data: { needsConfirmation: true } });
    expect(mockAuth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe("monstock://auth/callback");
  });

  it("mot de passe oublié : même réponse que le compte existe ou non", async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ error: { message: "User not found" } });
    expect(await requestPasswordReset({ email: "inconnu@exemple.fr" })).toEqual({ ok: true, data: undefined });
    expect(mockAuth.resetPasswordForEmail.mock.calls[0][1].redirectTo).toBe("monstock://auth/callback?next=%2Fupdate-password");
  });

  it("le retour de lien n'accepte que des destinations internes connues", () => {
    expect(safeNext("/update-password")).toBe("/update-password");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
  });

  it("lien expiré : message explicite, aucun échange tenté", async () => {
    const r = await completeAuthCallback({ error_code: "otp_expired", next: "/update-password" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/expiré/);
    expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("échange PKCE réussi → destination interne", async () => {
    mockAuth.exchangeCodeForSession.mockResolvedValue({ error: null });
    expect(await completeAuthCallback({ code: "abc", next: "/update-password" })).toEqual({ ok: true, next: "/update-password" });
  });

  it("la déconnexion est locale (fonctionne hors ligne)", async () => {
    mockAuth.signOut.mockResolvedValue({ error: null });
    await signOut();
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
