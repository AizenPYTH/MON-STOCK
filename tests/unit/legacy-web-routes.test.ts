/**
 * W-18 : routes `/api/cron/*` et `/api/webhooks/ebay` du site, doublons de l'Edge Function.
 * Désactivées par défaut (404 avant tout traitement), réactivables par MONSTOCK_WEB_LEGACY_ROUTES=1 :
 * elles retrouvent alors leurs protections d'origine (CRON_SECRET, configuration eBay).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const spies = vi.hoisted(() => ({ cron: 0, sourcing: 0, webhook: 0 }));

process.env.NEXT_PUBLIC_APP_URL ??= "https://app.monstock.test";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test-key";

vi.mock("@/services/sync/cron", () => ({
  WEB_CRON_SYNC_BUDGET_MS: 200_000,
  runSyncCron: async () => {
    spies.cron++;
    return { ok: true };
  },
}));
vi.mock("@/services/sourcing/sync", () => ({
  runSourcingSync: async () => {
    spies.sourcing++;
    return {};
  },
}));
vi.mock("@/services/sync/ebay-webhook", () => ({
  handleEbayNotification: async () => {
    spies.webhook++;
    return new Response(null, { status: 204 });
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => ({}) }));

const { legacyWebRoutesEnabled, legacyWebRouteDisabled, WEB_LEGACY_ROUTES_ENV } = await import("@/lib/legacy-web-routes");
const cronSync = await import("@/app/api/cron/sync/route");
const cronSourcing = await import("@/app/api/cron/sourcing/route");
const webhook = await import("@/app/api/webhooks/ebay/route");

const BASE = "https://app.monstock.test";
const SECRET = "s".repeat(32);
let saved: { flag?: string; secret?: string };

beforeEach(() => {
  saved = { flag: process.env[WEB_LEGACY_ROUTES_ENV], secret: process.env.CRON_SECRET };
  delete process.env[WEB_LEGACY_ROUTES_ENV];
  process.env.CRON_SECRET = SECRET;
  spies.cron = spies.sourcing = spies.webhook = 0;
});
afterEach(() => {
  if (saved.flag === undefined) delete process.env[WEB_LEGACY_ROUTES_ENV];
  else process.env[WEB_LEGACY_ROUTES_ENV] = saved.flag;
  if (saved.secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved.secret;
});

const authed = (p: string, method = "GET") => new NextRequest(`${BASE}${p}`, { method, headers: { authorization: `Bearer ${SECRET}` } });

describe("legacyWebRoutesEnabled", () => {
  it("désactivé par défaut ; seul « 1 » (nettoyé) active", () => {
    expect(legacyWebRoutesEnabled({})).toBe(false);
    for (const v of ["", "0", "true", "yes", "on"]) expect(legacyWebRoutesEnabled({ [WEB_LEGACY_ROUTES_ENV]: v })).toBe(false);
    for (const v of ["1", " 1 ", '"1"']) expect(legacyWebRoutesEnabled({ [WEB_LEGACY_ROUTES_ENV]: v })).toBe(true);
    expect(legacyWebRouteDisabled({ [WEB_LEGACY_ROUTES_ENV]: "1" })).toBeNull();
    expect(legacyWebRouteDisabled({})?.status).toBe(404);
  });
});

describe("routes désactivées par défaut : 404 avant tout traitement, même avec un secret valide", () => {
  it("/api/cron/sync, /api/cron/sourcing (GET et POST)", async () => {
    for (const method of ["GET", "POST"] as const) {
      expect((await cronSync[method](authed("/api/cron/sync", method))).status).toBe(404);
      expect((await cronSourcing[method](authed("/api/cron/sourcing", method))).status).toBe(404);
    }
    expect(spies.cron + spies.sourcing).toBe(0);
  });

  it("/api/webhooks/ebay (challenge GET et notification POST)", async () => {
    expect((await webhook.GET(new NextRequest(`${BASE}/api/webhooks/ebay?challenge_code=abc`))).status).toBe(404);
    expect((await webhook.POST(new NextRequest(`${BASE}/api/webhooks/ebay`, { method: "POST", body: "{}" }))).status).toBe(404);
    expect(spies.webhook).toBe(0);
  });
});

describe("MONSTOCK_WEB_LEGACY_ROUTES=1 : comportement d'origine, protections comprises", () => {
  beforeEach(() => {
    process.env[WEB_LEGACY_ROUTES_ENV] = "1";
  });

  it("cron : 401 sans le bon secret, traitement avec", async () => {
    expect((await cronSync.GET(new NextRequest(`${BASE}/api/cron/sync`))).status).toBe(401);
    expect((await cronSync.GET(authed("/api/cron/sync"))).status).toBe(200);
    expect((await cronSourcing.POST(authed("/api/cron/sourcing", "POST"))).status).toBe(200);
    expect(spies).toMatchObject({ cron: 1, sourcing: 1 });
  });

  it("webhook : la notification est confiée au service partagé", async () => {
    expect((await webhook.POST(new NextRequest(`${BASE}/api/webhooks/ebay`, { method: "POST", body: "{}" }))).status).toBe(204);
    expect(spies.webhook).toBe(1);
  });
});
