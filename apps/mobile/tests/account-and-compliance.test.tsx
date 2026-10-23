/**
 * M-01 (suppression de compte : appel serveur, écran, purge locale), M-19 (purge unique),
 * M-06 (pages légales), M-05 (organisation écrite dans le profil), M-02 / M-24 / M-27 (eBay),
 * M-17 (URL tierces), M-23 (durée des notifications avec VoiceOver).
 */
import { QueryClient } from "@tanstack/react-query";

const mockGetSession = jest.fn(async (..._a: unknown[]) => ({ data: { session: { access_token: "jwt-user" } } }));
const mockSignOut = jest.fn(async (..._a: unknown[]) => ({ error: null }));
jest.mock("~/lib/supabase", () => ({
  requireSupabase: () => ({ auth: { getSession: () => mockGetSession() } }),
  getSupabase: () => ({ auth: { signOut: (o: unknown) => mockSignOut(o) } }),
}));
jest.mock("~/lib/config", () => ({ DEFAULT_SITE_URL: "https://mon-stock-chi.vercel.app", appConfig: { ok: true, config: { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "sb_publishable_test", appEnv: "TEST", siteUrl: "https://monstock.example" } } }));
const mockOpenBrowser = jest.fn(async (..._a: unknown[]) => ({ type: "opened" }));
const mockOpenAuth = jest.fn();
jest.mock("expo-web-browser", () => ({ openBrowserAsync: (u: string) => mockOpenBrowser(u), openAuthSessionAsync: (...a: unknown[]) => mockOpenAuth(...a) }));
const mockSecure = new Map<string, string>();
jest.mock("~/lib/secure-store", () => ({
  securePreferences: {
    getItem: async (k: string) => mockSecure.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockSecure.set(k, v),
    removeItem: async (k: string) => void mockSecure.delete(k),
  },
}));
const mockClearVoice = jest.fn(async () => undefined);
jest.mock("~/lib/tts", () => ({ clearVoiceCache: () => mockClearVoice(), stopSpeaking: async () => undefined }));
const mockClearFavorites = jest.fn(async () => undefined);
jest.mock("~/data/supplier-favorites", () => ({ clearAllFavorites: () => mockClearFavorites() }));

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
function mockServer(reply: (url: string) => { status: number; json: unknown }) {
  const calls: Call[] = [];
  const spy = jest.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: String(init?.method), headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const r = reply(url);
    return new Response(JSON.stringify(r.json), { status: r.status });
  });
  return { calls, restore: () => spy.mockRestore() };
}

afterEach(() => jest.restoreAllMocks());

describe("suppression de compte — appel serveur (M-01)", () => {
  it("POST /account/delete avec le jeton de l'utilisateur et la confirmation, sans en-tête d'organisation", async () => {
    const { deleteMyAccount } = jest.requireActual("~/data/account");
    const server = mockServer(() => ({ status: 200, json: { ok: true, data: { deleted: true, organizationsDeleted: 1, organizationsLeft: 0, channelConnectionsDisconnected: 0, remoteRevocationIncomplete: false } } }));
    const r = await deleteMyAccount(" SUPPRIMER ");
    expect(r.deleted).toBe(true);
    expect(server.calls).toHaveLength(1);
    const c = server.calls[0]!;
    expect(c.url).toBe("https://proj.supabase.co/functions/v1/api/account/delete");
    expect(c.method).toBe("POST");
    expect(c.headers.Authorization).toBe("Bearer jwt-user");
    expect(c.headers["x-organization-id"]).toBeUndefined();
    expect(c.body).toEqual({ confirmation: "SUPPRIMER" });
  });

  it("confirmation incorrecte : aucun appel ; refus serveur : message du serveur tel quel", async () => {
    const { deleteMyAccount } = jest.requireActual("~/data/account");
    const server = mockServer(() => ({ status: 409, json: { ok: false, error: { code: "CONFLICT", message: "Suppression impossible : vous êtes le seul propriétaire de « Équipe »." } } }));
    await expect(deleteMyAccount("oui")).rejects.toMatchObject({ code: "VALIDATION" });
    expect(server.calls).toHaveLength(0);
    await expect(deleteMyAccount("SUPPRIMER")).rejects.toThrow(/seul propriétaire de « Équipe »/);
  });
});

describe("purge locale unique (M-19)", () => {
  it("vide requêtes, mutations, cache audio, favoris, organisation mémorisée ; « forget » efface aussi l'accord IA ; session locale retirée", async () => {
    const { signOutAndPurge } = jest.requireActual("~/auth/sign-out");
    const qc = new QueryClient({ defaultOptions: { queries: { gcTime: 0 }, mutations: { gcTime: 0 } } });
    qc.setQueryData(["org-1", "catalog"], { rows: [1] });
    qc.getMutationCache().build(qc, { mutationFn: async () => 1 });
    mockSecure.set("monstock.activeOrg.u1", "org-1");
    mockSecure.set("monstock.aiConsent.u1", "2026-10-22");
    mockSecure.set("monstock.activeOrg.u2", "org-9");
    await signOutAndPurge(qc, { userId: "u1", forget: true });
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
    expect(mockClearVoice).toHaveBeenCalled();
    expect(mockClearFavorites).toHaveBeenCalled();
    expect(mockSecure.has("monstock.activeOrg.u1")).toBe(false);
    expect(mockSecure.has("monstock.aiConsent.u1")).toBe(false);
    expect(mockSecure.get("monstock.activeOrg.u2")).toBe("org-9"); // autre utilisateur : intact
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("pages légales (M-06) et URL tierces (M-17)", () => {
  it("Confidentialité, Conditions, Mentions, Support sur le site configuré", async () => {
    const { LEGAL_PAGES, legalUrl, openLegalPage } = jest.requireActual("~/lib/legal");
    expect(LEGAL_PAGES.map((p: { key: string }) => legalUrl(p.key))).toEqual(["https://monstock.example/confidentialite", "https://monstock.example/conditions", "https://monstock.example/mentions-legales", "https://monstock.example/support"]);
    await openLegalPage("privacy");
    expect(mockOpenBrowser).toHaveBeenCalledWith("https://monstock.example/confidentialite");
  });

  it("une URL tierce dangereuse n'est jamais ouverte", async () => {
    const { openExternalUrl } = jest.requireActual("~/lib/url");
    mockOpenBrowser.mockClear();
    for (const bad of ["javascript:alert(1)", "https://user:pass@evil.example", "intent://x", null, 42]) expect(await openExternalUrl(bad)).toBe(false);
    expect(mockOpenBrowser).not.toHaveBeenCalled();
    expect(await openExternalUrl("https://www.laposte.fr/outils/suivre-vos-envois?code=1")).toBe(true);
  });
});

describe("organisation active écrite dans le profil (M-05)", () => {
  it("met à jour user_profiles.current_organization_id de l'utilisateur ; un échec n'est pas fatal", async () => {
    const { syncProfileOrganization } = jest.requireActual("~/org/org-service");
    const calls: unknown[][] = [];
    const ok = { from: (t: string) => ({ update: (v: unknown) => ({ eq: async (c: string, id: string) => (calls.push([t, v, c, id]), { error: null }) }) }) };
    expect(await syncProfileOrganization(ok, "u1", "o2")).toBe(true);
    expect(calls).toEqual([["user_profiles", { current_organization_id: "o2" }, "user_id", "u1"]]);
    const ko = { from: () => ({ update: () => ({ eq: async () => ({ error: { message: "offline" } }) }) }) };
    expect(await syncProfileOrganization(ko, "u1", "o2")).toBe(false);
  });
});

describe("eBay (M-02, M-24, M-27)", () => {
  it("« analyse complète » transmise au serveur ; session d'autorisation éphémère ; reconnexion aussi pour « pending »", async () => {
    const ebay = jest.requireActual("~/data/ebay");
    const server = mockServer((url) => ({ status: 200, json: { ok: true, data: url.includes("/ebay/connect") ? { authorizeUrl: "https://auth.ebay.com/x", callbackScheme: "monstock://ebay/callback", environment: "production" } : null } }));
    await ebay.connectEbay("org-1", async () => ({ type: "cancel" }), { extended: true });
    expect(server.calls[0]!.body).toEqual({ extended: true });
    await ebay.connectEbay("org-1", async () => ({ type: "cancel" }));
    expect(server.calls[1]!.body).toEqual({ extended: false });
    expect(ebay.EBAY_AUTH_SESSION_OPTIONS).toEqual({ preferEphemeralSession: true });
    expect(["expired", "pending", "active", "error"].map(ebay.ebayNeedsReconnect)).toEqual([true, true, false, false]);
  });
});

describe("notifications avec action (M-23)", () => {
  it("« Annuler » visible plus longtemps, ×3 avec VoiceOver", () => {
    const { toastDuration } = jest.requireActual("~/components/ui/feedback");
    expect(toastDuration(true, false)).toBeGreaterThanOrEqual(6000);
    expect(toastDuration(true, true)).toBe(toastDuration(true, false) * 3);
    expect(toastDuration(false, true)).toBeGreaterThan(toastDuration(false, false));
  });
});
