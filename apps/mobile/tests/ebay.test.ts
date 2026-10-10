import { connectEbay, parseEbayCallback } from "~/data/ebay";

jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn(), openBrowserAsync: jest.fn() }));
jest.mock("~/lib/config", () => ({ appConfig: { ok: true, config: { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "sb_publishable_test", appEnv: "TEST" } } }));
jest.mock("~/lib/supabase", () => ({ requireSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "jwt" } } }) } }) }));

type Call = { url: string; body: unknown };

function mockServer(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const spy = jest.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(routes).find((k) => url.includes(k));
    const data = key ? routes[key] : undefined;
    if (data instanceof Error) return new Response(JSON.stringify({ ok: false, error: { code: "X", message: data.message } }), { status: 400 });
    return new Response(JSON.stringify({ ok: true, data }), { status: 200 });
  });
  return { calls, restore: () => spy.mockRestore() };
}

describe("retour OAuth eBay (lien profond)", () => {
  it("code + état relayés par le serveur", () => {
    expect(parseEbayCallback("monstock://ebay/callback?code=v%5E1.1&state=abc")).toEqual({ code: "v^1.1", state: "abc" });
  });
  it("refus, erreur inconnue, retour incomplet → messages explicites", () => {
    expect(parseEbayCallback("monstock://ebay/callback?error=access_denied")).toEqual({ error: expect.stringMatching(/refusé/) });
    expect(parseEbayCallback("monstock://ebay/callback?error=autre")).toEqual({ error: expect.stringMatching(/erreur/) });
    expect(parseEbayCallback("monstock://ebay/callback?code=a")).toEqual({ error: expect.stringMatching(/incomplet/) });
  });
});

describe("connexion eBay depuis l'application", () => {
  it("connect → autorisation eBay → finalize (code + état) → première synchronisation", async () => {
    const server = mockServer({
      "/ebay/connect": { authorizeUrl: "https://auth.ebay.com/oauth2/authorize?state=s1", callbackScheme: "monstock://ebay/callback", environment: "production" },
      "/ebay/finalize": { connectionId: "c1", isNew: true, username: "vendeur-pro", environment: "production" },
      "/ebay/sync": { runId: "r1", status: "success", durationMs: 1200, summary: "12 annonces, 3 commandes", errorSummary: null },
    });
    const open = jest.fn(async () => ({ type: "success", url: "monstock://ebay/callback?code=CODE&state=s1" }));
    const r = await connectEbay("org-1", open);
    server.restore();
    expect(open).toHaveBeenCalledWith("https://auth.ebay.com/oauth2/authorize?state=s1", "monstock://ebay/callback");
    expect(server.calls.map((c) => new URL(c.url).pathname)).toEqual(["/functions/v1/api/ebay/connect", "/functions/v1/api/ebay/finalize", "/functions/v1/api/ebay/sync"]);
    expect(server.calls[1]!.body).toEqual({ code: "CODE", state: "s1" });
    expect(server.calls[2]!.body).toEqual({ connectionId: "c1", scope: "full" });
    expect(r).toMatchObject({ connectionId: "c1", username: "vendeur-pro", sync: { status: "success" }, syncError: null });
  });

  it("fenêtre eBay fermée par l'utilisateur → rien n'est finalisé", async () => {
    const server = mockServer({ "/ebay/connect": { authorizeUrl: "https://auth.ebay.com/x", callbackScheme: "monstock://ebay/callback", environment: null } });
    const r = await connectEbay("org-1", async () => ({ type: "cancel" }));
    server.restore();
    expect(r).toBeNull();
    expect(server.calls).toHaveLength(1);
  });

  it("autorisation refusée sur eBay → erreur, aucune finalisation", async () => {
    const server = mockServer({ "/ebay/connect": { authorizeUrl: "https://auth.ebay.com/x", callbackScheme: "x", environment: null } });
    await expect(connectEbay("org-1", async () => ({ type: "success", url: "monstock://ebay/callback?error=access_denied&state=s" }))).rejects.toThrow(/refusé/);
    server.restore();
    expect(server.calls).toHaveLength(1);
  });

  it("serveur sans clés eBay → message du serveur affiché tel quel", async () => {
    const server = mockServer({ "/ebay/connect": new Error("Intégration eBay non configurée sur le serveur.") });
    await expect(connectEbay("org-1", jest.fn())).rejects.toThrow(/non configurée/);
    server.restore();
  });

  it("connexion réussie mais synchronisation en échec → connexion conservée, erreur de synchro remontée", async () => {
    const server = mockServer({
      "/ebay/connect": { authorizeUrl: "https://auth.ebay.com/x", callbackScheme: "x", environment: null },
      "/ebay/finalize": { connectionId: "c1", isNew: true, username: null, environment: "production" },
      "/ebay/sync": new Error("Quota d'appels eBay atteint : réessayez dans quelques minutes."),
    });
    const r = await connectEbay("org-1", async () => ({ type: "success", url: "monstock://ebay/callback?code=C&state=S" }));
    server.restore();
    expect(r).toMatchObject({ connectionId: "c1", sync: null, syncError: expect.stringMatching(/Quota/) });
  });
});
