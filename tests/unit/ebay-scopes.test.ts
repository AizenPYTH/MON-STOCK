import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Scopes eBay : autorisation standard / « analyse complète », rafraîchissement avec les scopes ACCORDÉS
 * (et non la liste courante de l'application), état OAuth étendu, codes d'erreur. fetch simulé.
 */
const store = vi.hoisted(() => ({ connection: null as Record<string, unknown> | null, refreshArgs: [] as unknown[][], rpc: [] as unknown[] }));

vi.mock("@/lib/crypto", () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (s: string) => s.replace(/^enc:/, ""),
  randomToken: () => "a".repeat(64),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => (table === "channel_connections" ? { data: store.connection, error: null } : { data: { access_token_enc: "enc:old-access", refresh_token_enc: "enc:refresh-1" }, error: null }),
      };
      return q;
    },
    rpc: async (_fn: string, args: unknown) => {
      store.rpc.push(args);
      return { data: "stored", error: null };
    },
  }),
}));
vi.mock("@/integrations/core/registry", () => ({
  getConnector: () => ({
    refreshToken: async (...args: unknown[]) => {
      store.refreshArgs.push(args);
      return { accessToken: "new-access", accessTokenExpiresAt: new Date(Date.now() + 7_200_000), refreshToken: "refresh-1", refreshTokenExpiresAt: null, tokenType: "User Access Token" };
    },
  }),
  getEbayConnector: () => ({}),
}));

const { createEbayConfig, EBAY_EXTENDED_SCOPES, EBAY_SCOPE, ebayRefreshScopes, ebayScopeList, hasExtendedEbayScopes } = await import("@/integrations/ebay/config");
const { refreshAccessToken } = await import("@/integrations/ebay/oauth");
const { EbayConnector } = await import("@/integrations/ebay/connector");
const { buildOAuthState, isExtendedOAuthState, oauthCallbackErrorCode, oauthErrorMessage } = await import("@/features/integrations/oauth-flow");
const { ebayCallbackTarget } = await import("../../server/edge/ebay-callback");
const { getValidAccessToken } = await import("@/services/channels/connection-store");

const prod = createEbayConfig({ EBAY_ENV: "production", EBAY_CLIENT_ID: "app-id", EBAY_CLIENT_SECRET: "cert-id", EBAY_RU_NAME: "ru" });

afterEach(() => vi.unstubAllGlobals());

function captureRefresh(): { scope: () => string | null } {
  let scope: string | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      scope = new URLSearchParams(String(init?.body)).get("scope");
      return new Response(JSON.stringify({ access_token: "a", expires_in: 7200 }), { status: 200 });
    }),
  );
  return { scope: () => scope };
}

describe("listes de scopes", () => {
  it("standard = 5 scopes ; analyse complète = standard + finances, analytics.readonly, marketing.readonly", () => {
    expect(ebayScopeList()).toHaveLength(5);
    expect(ebayScopeList({ extended: true })).toEqual([...ebayScopeList(), "https://api.ebay.com/oauth/api_scope/sell.finances", "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly", "https://api.ebay.com/oauth/api_scope/sell.marketing.readonly"]);
    expect(EBAY_EXTENDED_SCOPES.every((s) => s.reason.length > 20)).toBe(true);
    expect(hasExtendedEbayScopes(ebayScopeList())).toBe(false);
    expect(hasExtendedEbayScopes(ebayScopeList({ extended: true }))).toBe(true);
    expect(hasExtendedEbayScopes([...ebayScopeList(), EBAY_SCOPE.finances])).toBe(false);
  });

  it("URL d'autorisation : standard par défaut, étendue sur demande", () => {
    const c = new EbayConnector(prod);
    expect(new URL(c.getAuthorizeUrl("s")).searchParams.get("scope")?.split(" ")).toEqual(ebayScopeList());
    expect(new URL(c.getAuthorizeUrl("s", { extended: true })).searchParams.get("scope")?.split(" ")).toEqual(ebayScopeList({ extended: true }));
  });
});

describe("rafraîchissement : scopes ACCORDÉS uniquement", () => {
  it("connexion standard existante : redemande ses 5 scopes, jamais les scopes ajoutés depuis (sinon invalid_scope)", async () => {
    const cap = captureRefresh();
    await refreshAccessToken(prod, "rt", ebayScopeList());
    expect(cap.scope()?.split(" ")).toEqual(ebayScopeList());
    expect(cap.scope()).not.toContain("sell.finances");
  });

  it("connexion « analyse complète » : redemande tous ses scopes", async () => {
    const cap = captureRefresh();
    await new EbayConnector(prod).refreshToken("rt", ebayScopeList({ extended: true }));
    expect(cap.scope()?.split(" ")).toEqual(ebayScopeList({ extended: true }));
  });

  it("connexion ancienne (scopes absents ou vides) → scopes standard ; doublons et valeurs étrangères écartés", () => {
    expect(ebayRefreshScopes(null)).toEqual(ebayScopeList());
    expect(ebayRefreshScopes([])).toEqual(ebayScopeList());
    expect(ebayRefreshScopes([EBAY_SCOPE.base, EBAY_SCOPE.base, " ", "https://evil.example/scope", EBAY_SCOPE.fulfillment])).toEqual([EBAY_SCOPE.base, EBAY_SCOPE.fulfillment]);
  });

  it("invalid_scope au rafraîchissement → AUTH_EXPIRED (reconnexion), comme avant", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_scope" }), { status: 400 })));
    await expect(refreshAccessToken(prod, "rt", [EBAY_SCOPE.base])).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
  });

  it("getValidAccessToken transmet au connecteur les scopes enregistrés sur la connexion", async () => {
    const granted = [EBAY_SCOPE.base, EBAY_SCOPE.fulfillment];
    store.connection = { id: "c1", provider: "ebay", status: "connected", scopes: granted, token_expires_at: new Date(Date.now() - 1000).toISOString(), refresh_token_expires_at: null };
    const token = await getValidAccessToken("c1");
    expect(token).toBe("new-access");
    expect(store.refreshArgs.at(-1)).toEqual(["refresh-1", granted]);
  });
});

describe("état OAuth et codes d'erreur", () => {
  it("état étendu reconnaissable, standard jamais confondu ; compatible avec le relais mobile", () => {
    const ext = buildOAuthState("ab12", true);
    expect(ext).toBe("ext_ab12");
    expect(isExtendedOAuthState(ext)).toBe(true);
    expect(isExtendedOAuthState(buildOAuthState("ab12", false))).toBe(false);
    expect(isExtendedOAuthState(buildOAuthState("ext_ab12", false))).toBe(false);
    expect(isExtendedOAuthState(null)).toBe(false);
    const state = buildOAuthState("f".repeat(64), true);
    const relayed = new URL(ebayCallbackTarget(new URL(`https://x/api/ebay/callback?code=abc&state=${state}`)));
    expect(relayed.searchParams.get("state")).toBe(state);
  });

  it("invalid_scope renvoyé par eBay à l'autorisation → message dédié (web et relais mobile)", () => {
    expect(oauthCallbackErrorCode("invalid_scope")).toBe("scope_refused");
    expect(oauthCallbackErrorCode("access_denied")).toBe("access_denied");
    expect(oauthCallbackErrorCode("server_error")).toBe("ebay_error");
    expect(oauthErrorMessage("scope_refused")).toMatch(/analyse complète/);
    expect(new URL(ebayCallbackTarget(new URL("https://x/api/ebay/callback?error=invalid_scope"))).searchParams.get("error")).toBe("scope_refused");
  });
});
