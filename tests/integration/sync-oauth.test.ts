/**
 * Routes OAuth eBay (/api/integrations/ebay/connect et /callback) contre la base réelle :
 * état anti-CSRF à usage unique lié au navigateur (cookie), redirections internes uniquement,
 * codes d'erreur (jamais de texte libre dans l'URL), tokens chiffrés. Connecteur simulé.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ConnectorError } from "@/integrations/core/errors";
import { canConnect } from "./helpers";
import { closePool, createFixture, fakeConnector, q, resetFakeConnector, setTestEnv } from "./sync-harness";

setTestEnv();

const auth = vi.hoisted(() => ({ ctx: null as null | { user: { id: string }; organization: { id: string }; role: string } }));

vi.mock("@/lib/supabase/admin", async () => {
  const h = await import("./sync-harness");
  const client = h.createPgRestClient();
  return { createAdminSupabaseClient: () => client };
});
vi.mock("@/integrations/core/registry", async () => {
  const h = await import("./sync-harness");
  return { getConnector: () => h.fakeConnector(), getEbayConnector: () => h.fakeConnector(), listConnectorCatalog: () => [] };
});
vi.mock("@/features/auth/dal", () => ({
  getOrgContext: async () => auth.ctx,
  isAdmin: (role: string) => role === "owner" || role === "admin",
}));

const connect = await import("@/app/api/integrations/ebay/connect/route");
const callback = await import("@/app/api/integrations/ebay/callback/route");
const { decryptSecret } = await import("@/lib/crypto");

const APP = process.env.NEXT_PUBLIC_APP_URL!;
const available = await canConnect();
const d = available ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});
beforeEach(() => {
  resetFakeConnector();
});

function connectRequest(headers: Record<string, string> = {}) {
  return new NextRequest(`${APP}/api/integrations/ebay/connect`, { method: "POST", headers: { origin: APP, "sec-fetch-site": "same-origin", ...headers } });
}
function callbackRequest(params: Record<string, string>, cookie?: string) {
  return new NextRequest(`${APP}/api/integrations/ebay/callback?${new URLSearchParams(params).toString()}`, { headers: cookie ? { cookie: `ebay_oauth_state=${cookie}` } : {} });
}
function location(res: Response): URL {
  return new URL(res.headers.get("location")!);
}

async function startFlow(orgId: string, userId: string): Promise<string> {
  auth.ctx = { user: { id: userId }, organization: { id: orgId }, role: "owner" };
  const res = await connect.POST(connectRequest());
  expect(res.status).toBe(303);
  const loc = location(res);
  expect(loc.host).toBe("auth.ebay.com");
  const state = loc.searchParams.get("state")!;
  const setCookie = res.headers.get("set-cookie")!;
  expect(setCookie).toContain(`ebay_oauth_state=${state}`);
  expect(setCookie).toMatch(/HttpOnly/i);
  expect(setCookie).toMatch(/Path=\/api\/integrations\/ebay/);
  expect(setCookie).toMatch(/SameSite=lax/i);
  return state;
}

d("OAuth eBay : connect / callback", () => {
  it("connect : refuse inter-sites, non-admin, non connecté ; démarre le flux pour un admin (POST, 303, cookie httpOnly)", async () => {
    const f = await createFixture();
    auth.ctx = { user: { id: f.userId }, organization: { id: f.orgId }, role: "owner" };
    const cross = await connect.POST(connectRequest({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }));
    expect(location(cross).toString()).toBe(`${APP}/settings/integrations?error=cross_site`);
    auth.ctx = { user: { id: f.userId }, organization: { id: f.orgId }, role: "viewer" };
    expect(location(await connect.POST(connectRequest())).searchParams.get("error")).toBe("not_admin");
    auth.ctx = null;
    expect(location(await connect.POST(connectRequest())).pathname).toBe("/login");
    const state = await startFlow(f.orgId, f.userId);
    expect(await q("select organization_id, created_by from public.oauth_states where state = $1", [state])).toEqual([{ organization_id: f.orgId, created_by: f.userId }]);
    // Aucune méthode GET exportée : un lien ou une image ne peut pas démarrer le flux.
    expect((connect as Record<string, unknown>).GET).toBeUndefined();
  });

  it("callback : cookie absent ou différent → refus SANS consommer l'état ; bon navigateur → connexion créée, tokens chiffrés ; rejeu → refus", async () => {
    const f = await createFixture();
    const state = await startFlow(f.orgId, f.userId);
    const c = fakeConnector();
    c.account = { externalAccountId: `acct-${Date.now()}`, username: "vendeur_oauth", accountType: "BUSINESS", registrationMarketplaceId: "EBAY_FR" };
    c.exchange = async (code) => {
      expect(code).toBe("auth-code");
      return { accessToken: "v^1.1#ACCESS-PLAINTEXT", accessTokenExpiresAt: new Date(Date.now() + 7_200_000), refreshToken: "v^1.1#REFRESH-PLAINTEXT", refreshTokenExpiresAt: new Date(Date.now() + 500 * 86_400_000), tokenType: "User Access Token" };
    };

    const noCookie = await callback.GET(callbackRequest({ code: "auth-code", state }));
    expect(location(noCookie).searchParams.get("error")).toBe("browser_mismatch");
    const wrong = await callback.GET(callbackRequest({ code: "auth-code", state }, "autre-etat"));
    expect(location(wrong).searchParams.get("error")).toBe("browser_mismatch");
    expect(await q("select 1 from public.oauth_states where state = $1", [state])).toHaveLength(1);

    const ok = await callback.GET(callbackRequest({ code: "auth-code", state }, state));
    const loc = location(ok);
    expect(loc.origin).toBe(new URL(APP).origin);
    expect(loc.pathname).toBe("/settings/integrations/ebay/setup");
    expect(ok.headers.get("set-cookie")).toMatch(/ebay_oauth_state=;.*Max-Age=0/i);
    const [conn] = await q<{ id: string; status: string; external_username: string; access_token_enc: string; refresh_token_enc: string }>(
      `select c.id, c.status, c.external_username, s.access_token_enc, s.refresh_token_enc from public.channel_connections c join public.channel_connection_secrets s on s.connection_id = c.id
        where c.organization_id = $1 and c.external_username = 'vendeur_oauth'`,
      [f.orgId],
    );
    expect(conn).toMatchObject({ status: "connected", external_username: "vendeur_oauth" });
    expect(loc.searchParams.get("connection")).toBe(conn!.id);
    expect(conn!.access_token_enc).not.toContain("PLAINTEXT");
    expect(decryptSecret(conn!.access_token_enc)).toBe("v^1.1#ACCESS-PLAINTEXT");
    expect(decryptSecret(conn!.refresh_token_enc)).toBe("v^1.1#REFRESH-PLAINTEXT");
    // Aucun token dans les tables visibles par les clients.
    const visible = JSON.stringify(await q("select * from public.channel_connections where id = $1", [conn!.id]));
    expect(visible).not.toContain("PLAINTEXT");

    const replay = await callback.GET(callbackRequest({ code: "auth-code", state }, state));
    expect(location(replay).searchParams.get("error")).toBe("state_unknown");
  });

  it("callback : deux retours simultanés avec le même état → une seule connexion", async () => {
    const f = await createFixture();
    const state = await startFlow(f.orgId, f.userId);
    let exchanges = 0;
    fakeConnector().account = { externalAccountId: `acct-par-${Date.now()}`, username: "vendeur_par", accountType: null, registrationMarketplaceId: null };
    fakeConnector().exchange = async () => {
      exchanges++;
      await new Promise((r) => setTimeout(r, 50));
      return { accessToken: "a", accessTokenExpiresAt: new Date(Date.now() + 7_200_000), refreshToken: "r", refreshTokenExpiresAt: null, tokenType: "User Access Token" };
    };
    const [r1, r2] = await Promise.all([callback.GET(callbackRequest({ code: "c", state }, state)), callback.GET(callbackRequest({ code: "c", state }, state))]);
    const errors = [r1, r2].map((r) => location(r).searchParams.get("error"));
    expect(errors.filter((e) => e === null)).toHaveLength(1);
    expect(errors).toContain("state_unknown");
    expect(exchanges).toBe(1);
  });

  it("callback : erreur eBay → code seul dans l'URL (la description fournie n'est jamais recopiée) ; état expiré ; code refusé", async () => {
    const denied = await callback.GET(callbackRequest({ error: "access_denied", error_description: "Appelez le 0800 pour débloquer" }));
    expect(location(denied).toString()).toBe(`${APP}/settings/integrations?error=access_denied`);
    const other = await callback.GET(callbackRequest({ error: "server_error", error_description: "<script>alert(1)</script>" }));
    expect(location(other).toString()).toBe(`${APP}/settings/integrations?error=ebay_error`);
    expect(location(await callback.GET(callbackRequest({ state: "x" }, "x"))).searchParams.get("error")).toBe("incomplete");

    const f = await createFixture();
    const expiredState = await startFlow(f.orgId, f.userId);
    await q("update public.oauth_states set expires_at = now() - interval '1 minute' where state = $1", [expiredState]);
    expect(location(await callback.GET(callbackRequest({ code: "c", state: expiredState }, expiredState))).searchParams.get("error")).toBe("state_expired");

    const state = await startFlow(f.orgId, f.userId);
    fakeConnector().exchange = async () => {
      throw new ConnectorError("AUTH_EXPIRED", "ebay", "invalid_grant: code v^1.1#SECRETCODE expired", { retryable: false });
    };
    const res = await callback.GET(callbackRequest({ code: "c", state }, state));
    expect(res.headers.get("location")).toBe(`${APP}/settings/integrations?error=exchange_denied`);
  });
});
