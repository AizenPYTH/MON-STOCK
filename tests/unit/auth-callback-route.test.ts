import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let exchangeResult: { error: { code?: string; message: string } | null } = { error: null };
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth: { exchangeCodeForSession: async () => exchangeResult } }),
}));

const { GET } = await import("@/app/auth/callback/route");

async function errorFor(query: string): Promise<string | null> {
  const res = await GET(new NextRequest(`https://app.example.test/auth/callback?${query}`));
  return new URL(res.headers.get("location")!).searchParams.get("error");
}

describe("GET /auth/callback : code d'erreur transmis à /login", () => {
  beforeEach(() => {
    exchangeResult = { error: null };
  });

  it("succès : redirige vers `next` sans erreur", async () => {
    const res = await GET(new NextRequest("https://app.example.test/auth/callback?code=abc&next=/update-password"));
    expect(res.headers.get("location")).toBe("https://app.example.test/update-password");
  });

  it("échec de l'échange SANS code d'erreur vers /update-password : pas présenté comme « expiré »", async () => {
    exchangeResult = { error: { message: "unknown" } };
    expect(await errorFor("code=abc&next=/update-password")).toBe("link_not_validated");
  });

  it("vérificateur PKCE absent (lien ouvert dans un autre navigateur) : message distinct", async () => {
    exchangeResult = { error: { code: "pkce_code_verifier_not_found", message: "PKCE code verifier not found in storage." } };
    expect(await errorFor("code=abc&next=/update-password")).toBe("link_not_validated");
  });

  it("lien réellement expiré : message « réinitialisation expirée »", async () => {
    exchangeResult = { error: { code: "otp_expired", message: "expired" } };
    expect(await errorFor("code=abc&next=/update-password")).toBe("reset_link_expired");
    exchangeResult = { error: { code: "flow_state_expired", message: "expired" } };
    expect(await errorFor("code=abc&next=/dashboard")).toBe("link_expired");
  });

  it("sans code : error_code du lien", async () => {
    expect(await errorFor("error=access_denied&error_code=otp_expired&next=/update-password")).toBe("reset_link_expired");
    expect(await errorFor("error=access_denied&error_code=other&next=/update-password")).toBe("link_invalid");
  });
});
