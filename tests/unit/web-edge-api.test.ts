import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
const { callEdgeApi, EdgeApiError } = await import("@/lib/edge-api");

/** Contexte minimal : seul le jeton de session et l'organisation active servent ici. */
function ctxWith(token: string | null) {
  return {
    supabase: { auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } },
    organization: { id: "org-1" },
  } as unknown as Parameters<typeof callEdgeApi>[0];
}

describe("callEdgeApi (web → Edge Function, au nom de l'utilisateur)", () => {
  it("envoie le jeton en Bearer, l'organisation en en-tête et la requête en paramètres", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { n: 1 } })));
    const data = await callEdgeApi<{ n: number }>(ctxWith("jwt"), "/radar", { query: { limit: 5, empty: "" }, fetchImpl });
    expect(data).toEqual({ n: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://project.supabase.co/functions/v1/api/radar?limit=5");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer jwt");
    expect(h["x-organization-id"]).toBe("org-1");
    expect(h.apikey).toBe("sb_publishable_test");
  });

  it("relaie le message d'erreur rédigé par le serveur", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: "FORBIDDEN", message: "Accès refusé." } }), { status: 403 }));
    await expect(callEdgeApi(ctxWith("jwt"), "/x", { fetchImpl })).rejects.toMatchObject({ message: "Accès refusé.", code: "FORBIDDEN" });
  });

  it("sans session : erreur claire, aucun appel réseau", async () => {
    const fetchImpl = vi.fn();
    await expect(callEdgeApi(ctxWith(null), "/x", { fetchImpl })).rejects.toBeInstanceOf(EdgeApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("réponse illisible en 5xx : message d'indisponibilité", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>", { status: 502 }));
    await expect(callEdgeApi(ctxWith("jwt"), "/x", { fetchImpl })).rejects.toMatchObject({ code: "SERVER" });
  });
});
