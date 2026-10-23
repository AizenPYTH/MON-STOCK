/**
 * W-06 / I-21 / W-29 : connexion eBay depuis le site web.
 * - RuName web DÉDIÉ (EBAY_WEB_RU_NAME) exigé : sans lui, aucun envoi chez eBay avec le RuName du
 *   relais iPhone (retour `monstock://`, impasse sur ordinateur) ;
 * - démarrage refusé hors du domaine canonique (le cookie d'état ne reviendrait pas).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const APP = "https://app.monstock.test";
process.env.NEXT_PUBLIC_APP_URL = APP;
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test-key";

const auth = vi.hoisted(() => ({ ctx: null as null | { user: { id: string }; organization: { id: string }; role: string } }));
const inserted = vi.hoisted(() => ({ rows: [] as unknown[], stateRow: null as null | Record<string, string> }));

vi.mock("@/features/auth/dal", () => ({
  getOrgContext: async () => auth.ctx,
  isAdmin: (role: string) => role === "owner" || role === "admin",
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      delete: () => ({ lt: async () => ({ error: null }), eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: inserted.stateRow, error: null }) }) }) }) }),
      insert: async (row: unknown) => {
        inserted.rows.push(row);
        return { error: null };
      },
    }),
  }),
}));

const { POST } = await import("@/app/api/integrations/ebay/connect/route");
const callback = await import("@/app/api/integrations/ebay/callback/route");
const { resolveEbayWebConfig, isCanonicalOrigin } = await import("@/features/integrations/ebay-web");
const { createEbayConfig } = await import("@/integrations/ebay/config");
const { oauthErrorMessage } = await import("@/features/integrations/oauth-flow");

const EBAY_KEYS = ["EBAY_ENV", "EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_RU_NAME", "EBAY_WEB_RU_NAME"] as const;
const saved: Partial<Record<(typeof EBAY_KEYS)[number], string | undefined>> = {};

function configureApp(web: string | null) {
  process.env.EBAY_ENV = "production";
  process.env.EBAY_CLIENT_ID = "app-id";
  process.env.EBAY_CLIENT_SECRET = "cert-id";
  process.env.EBAY_RU_NAME = "Mon-Stock-PRD-mobile-relay";
  if (web === null) delete process.env.EBAY_WEB_RU_NAME;
  else process.env.EBAY_WEB_RU_NAME = web;
}

function connectRequest(base = APP) {
  return new NextRequest(`${base}/api/integrations/ebay/connect`, { method: "POST", headers: { origin: base, "sec-fetch-site": "same-origin" } });
}
function location(res: Response): URL {
  return new URL(res.headers.get("location")!);
}

beforeEach(() => {
  for (const k of EBAY_KEYS) saved[k] = process.env[k];
  auth.ctx = { user: { id: "u1" }, organization: { id: "o1" }, role: "owner" };
  inserted.rows = [];
  inserted.stateRow = null;
});
afterEach(() => {
  for (const k of EBAY_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveEbayWebConfig (pure)", () => {
  const base = createEbayConfig({ EBAY_ENV: "production", EBAY_CLIENT_ID: "id", EBAY_CLIENT_SECRET: "s", EBAY_RU_NAME: "mobile-relay" });

  it("application non configurée → not_configured", () => {
    expect(resolveEbayWebConfig(null, { EBAY_WEB_RU_NAME: "web" }).status).toBe("not_configured");
  });

  it("sans RuName web (absent, vide ou blanc) → web_runame_missing, jamais le RuName du relais mobile", () => {
    for (const v of [undefined, "", "   ", '""']) expect(resolveEbayWebConfig(base, { EBAY_WEB_RU_NAME: v }).status).toBe("web_runame_missing");
  });

  it("RuName web nettoyé (espaces, guillemets) et substitué au RuName du relais, le reste inchangé", () => {
    const r = resolveEbayWebConfig(base, { EBAY_WEB_RU_NAME: ' "Mon-Stock-PRD-web" ' });
    expect(r.status).toBe("ready");
    if (r.status !== "ready") return;
    expect(r.config.ruName).toBe("Mon-Stock-PRD-web");
    expect({ ...r.config, ruName: base.ruName }).toEqual(base);
  });
});

describe("isCanonicalOrigin (W-29)", () => {
  it("compare les origines (schéma, hôte, port)", () => {
    expect(isCanonicalOrigin("https://app.monstock.test", "https://app.monstock.test")).toBe(true);
    expect(isCanonicalOrigin("https://app.monstock.test", "https://app.monstock.test/")).toBe(true);
    expect(isCanonicalOrigin("https://mon-stock-git-x.vercel.app", "https://app.monstock.test")).toBe(false);
    expect(isCanonicalOrigin("http://app.monstock.test", "https://app.monstock.test")).toBe(false);
    expect(isCanonicalOrigin("pas une url", "https://app.monstock.test")).toBe(false);
  });
});

describe("POST /api/integrations/ebay/connect", () => {
  it("sans EBAY_WEB_RU_NAME : retour vers les intégrations avec web_runame_missing, aucun état enregistré", async () => {
    configureApp(null);
    const res = await POST(connectRequest());
    expect(res.status).toBe(303);
    expect(location(res).toString()).toBe(`${APP}/settings/integrations?error=web_runame_missing`);
    expect(inserted.rows).toEqual([]);
    expect(oauthErrorMessage("web_runame_missing")).toMatch(/app iPhone/);
  });

  it("application eBay non configurée : not_configured", async () => {
    for (const k of EBAY_KEYS) delete process.env[k];
    expect(location(await POST(connectRequest())).searchParams.get("error")).toBe("not_configured");
  });

  it("avec EBAY_WEB_RU_NAME : envoi chez eBay avec le RuName WEB (jamais celui du relais mobile)", async () => {
    configureApp("Mon-Stock-PRD-web");
    const res = await POST(connectRequest());
    const loc = location(res);
    expect(loc.host).toBe("auth.ebay.com");
    expect(loc.searchParams.get("redirect_uri")).toBe("Mon-Stock-PRD-web");
    expect(inserted.rows).toHaveLength(1);
    expect(res.headers.get("set-cookie")).toContain("ebay_oauth_state=");
  });

  it("W-29 : démarrage depuis un autre domaine refusé et renvoyé vers le domaine canonique, sans état ni cookie", async () => {
    configureApp("Mon-Stock-PRD-web");
    const res = await POST(connectRequest("https://mon-stock-git-branche.vercel.app"));
    expect(res.status).toBe(303);
    expect(location(res).toString()).toBe(`${APP}/settings/integrations?error=wrong_host`);
    expect(inserted.rows).toEqual([]);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("GET /api/integrations/ebay/callback", () => {
  it("sans RuName web : refus explicite, aucun échange de code (redirect_uri différent du démarrage)", async () => {
    configureApp(null);
    const state = "s".repeat(64);
    inserted.stateRow = { state, organization_id: "o1", created_by: "u1", expires_at: new Date(Date.now() + 60_000).toISOString() };
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await callback.GET(new NextRequest(`${APP}/api/integrations/ebay/callback?code=c&state=${state}`, { headers: { cookie: `ebay_oauth_state=${state}` } }));
    expect(location(res).toString()).toBe(`${APP}/settings/integrations?error=web_runame_missing`);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("avec RuName web : le code est échangé avec CE RuName", async () => {
    configureApp("Mon-Stock-PRD-web");
    const state = "t".repeat(64);
    inserted.stateRow = { state, organization_id: "o1", created_by: "u1", expires_at: new Date(Date.now() + 60_000).toISOString() };
    const bodies: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      bodies.push(String(init?.body ?? ""));
      // Refus eBay : on ne vérifie ici que le redirect_uri envoyé, pas la suite du flux.
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    });
    const res = await callback.GET(new NextRequest(`${APP}/api/integrations/ebay/callback?code=c&state=${state}`, { headers: { cookie: `ebay_oauth_state=${state}` } }));
    expect(new URLSearchParams(bodies[0]).get("redirect_uri")).toBe("Mon-Stock-PRD-web");
    expect(location(res).searchParams.get("error")).toBe("exchange_denied");
    fetchSpy.mockRestore();
  });
});
