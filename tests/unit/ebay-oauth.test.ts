import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAuthorizeUrl, exchangeAuthorizationCode, getApplicationAccessToken, refreshAccessToken } from "@/integrations/ebay/oauth";
import { createEbayConfig, EBAY_SCOPES, ebayScopeList } from "@/integrations/ebay/config";
import { normalizeEbayUser } from "@/integrations/ebay/identity";
import { fetchWithRetry } from "@/integrations/core/http";
import { ConnectorError, connectorErrorToAppError } from "@/integrations/core/errors";
import { formatRunSummary, readStats } from "@/features/integrations/format";

const prod = createEbayConfig({ EBAY_ENV: "production", EBAY_CLIENT_ID: "app-id", EBAY_CLIENT_SECRET: "cert-id", EBAY_RU_NAME: "Mon-Stock-PRD-abcd-12345678" });
const sandbox = createEbayConfig({ EBAY_ENV: "sandbox", EBAY_CLIENT_ID: "app-id", EBAY_CLIENT_SECRET: "cert-id", EBAY_RU_NAME: "Mon-Stock-SBX-abcd-12345678" });

afterEach(() => vi.unstubAllGlobals());

describe("buildAuthorizeUrl", () => {
  it("pointe vers auth.ebay.com avec client_id, redirect_uri=RuName, scopes et state", () => {
    const url = new URL(buildAuthorizeUrl(prod, "state123"));
    expect(url.origin + url.pathname).toBe("https://auth.ebay.com/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("app-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("Mon-Stock-PRD-abcd-12345678");
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(ebayScopeList());
    expect(EBAY_SCOPES.every((s) => s.reason.length > 10)).toBe(true);
    expect(new URL(buildAuthorizeUrl(sandbox, "s")).host).toBe("auth.sandbox.ebay.com");
  });
});

describe("échange et rafraîchissement de tokens (fetch simulé)", () => {
  it("échange le code avec HTTP Basic et renvoie les dates d'expiration", async () => {
    const now = new Date("2026-10-07T12:00:00.000Z");
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.ebay.com/identity/v1/oauth2/token");
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Basic " + Buffer.from("app-id:cert-id").toString("base64"));
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("v^1.1#code");
      expect(body.get("redirect_uri")).toBe(prod.ruName);
      return new Response(JSON.stringify({ access_token: "v^1.1#access", expires_in: 7200, refresh_token: "v^1.1#refresh", refresh_token_expires_in: 47304000, token_type: "User Access Token" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const t = await exchangeAuthorizationCode(prod, "v^1.1#code", now);
    expect(t.accessToken).toBe("v^1.1#access");
    expect(t.refreshToken).toBe("v^1.1#refresh");
    expect(t.accessTokenExpiresAt.toISOString()).toBe("2026-10-07T14:00:00.000Z");
    // 47 304 000 s ≈ 547,5 jours (~18 mois)
    expect(t.refreshTokenExpiresAt?.toISOString()).toBe("2028-04-07T00:00:00.000Z");
  });

  it("le rafraîchissement conserve le refresh token quand eBay n'en renvoie pas", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("old-refresh");
      expect(body.get("scope")).toBe(ebayScopeList().join(" "));
      return new Response(JSON.stringify({ access_token: "new-access", expires_in: 7200, token_type: "User Access Token" }), { status: 200 });
    }));
    const t = await refreshAccessToken(prod, "old-refresh");
    expect(t.accessToken).toBe("new-access");
    expect(t.refreshToken).toBe("old-refresh");
  });

  it("invalid_grant → AUTH_EXPIRED avec action « Reconnecter eBay » ; invalid_client → NOT_CONFIGURED", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "refresh token revoked" }), { status: 400 })));
    const err = await refreshAccessToken(prod, "secret-refresh-token-xyz").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect((err as ConnectorError).code).toBe("AUTH_EXPIRED");
    // Jamais de token dans les détails ni le message.
    expect(JSON.stringify((err as ConnectorError).details) + (err as ConnectorError).message).not.toContain("secret-refresh-token-xyz");
    const app = connectorErrorToAppError(err as ConnectorError);
    expect(app.code).toBe("CONNECTION_EXPIRED");
    expect(app.action).toEqual({ label: "Reconnecter eBay", href: "/settings/integrations" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 })));
    await expect(getApplicationAccessToken(sandbox)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });

  it("token d'application (client_credentials, scope de base)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.sandbox.ebay.com/identity/v1/oauth2/token");
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("grant_type")).toBe("client_credentials");
      expect(body.get("scope")).toBe("https://api.ebay.com/oauth/api_scope");
      return new Response(JSON.stringify({ access_token: "app", expires_in: 7200 }), { status: 200 });
    }));
    const t = await getApplicationAccessToken(sandbox, new Date("2026-10-07T12:00:00.000Z"));
    expect(t.accessToken).toBe("app");
    expect(t.expiresAt.toISOString()).toBe("2026-10-07T14:00:00.000Z");
  });
});

describe("fetchWithRetry", () => {
  it("réessaie sur 429 (Retry-After) puis renvoie la réponse", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++;
      return calls === 1 ? new Response("slow down", { status: 429, headers: { "retry-after": "0" } }) : new Response("ok", { status: 200 });
    }));
    const res = await fetchWithRetry("https://api.ebay.com/x", {}, { provider: "ebay", retries: 2 });
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("lève RATE_LIMITED après épuisement des tentatives et ne réessaie pas un 4xx classique", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429, headers: { "retry-after": "0" } })));
    await expect(fetchWithRetry("https://api.ebay.com/x", {}, { provider: "ebay", retries: 1 })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const notFound = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", notFound);
    expect((await fetchWithRetry("https://api.ebay.com/x", {}, { provider: "ebay", retries: 2 })).status).toBe(404);
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});

describe("normalizeEbayUser", () => {
  it("lit l'Identity API et rejette un format inattendu", () => {
    expect(normalizeEbayUser({ userId: "ma8vp1jySJC", username: "vendeur_fr", accountType: "BUSINESS", registrationMarketplaceId: "EBAY_FR" })).toEqual({ externalAccountId: "ma8vp1jySJC", username: "vendeur_fr", accountType: "BUSINESS", registrationMarketplaceId: "EBAY_FR" });
    expect(() => normalizeEbayUser({ username: "x" })).toThrowError(/Identity API/);
  });
});

describe("formatRunSummary", () => {
  it("produit le résumé attendu", () => {
    const stats = { listings_fetched: 247, orders_fetched: 13, inventory_changes: 4, errors: 0 };
    expect(formatRunSummary({ status: "success", stats, error_count: 0 })).toBe("✓ Réussie · 247 listings analysés · 13 commandes récupérées · 4 stocks modifiés · 0 erreur");
    expect(formatRunSummary({ status: "failed", stats: { listings_fetched: 1, errors: 2 }, error_count: 2 })).toBe("✗ Échouée · 1 listing analysé · 0 commande récupérée · 0 stock modifié · 2 erreurs");
    expect(readStats(null).orders_created).toBe(0);
    expect(readStats({ orders_created: "x" }).orders_created).toBe(0);
  });
});
