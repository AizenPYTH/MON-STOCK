import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { memoryDb, type MemoryDb } from "./helpers/memory-db";

/**
 * Durcissement de l'Edge Function (audit 2026-10-22) : S-07 / W-15 (Vault), S-16 / I-23 (/health),
 * S-24 (état OAuth), S-25 (liste des secrets), S-26 (table des routes, code mort), S-27 (collecte
 * hebdomadaire), Q-22 (CORS, module de démonstration), S-17 (identifiant de requête).
 */
const ROOT = path.resolve(__dirname, "../..");

let admin: unknown = null;
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => admin }));

const { route, serve } = await import("../../server/edge/api");
const { createRuntimeSecretsLoader, loadRuntimeSecrets, RUNTIME_SECRET_NAMES, VAULT_SECRET_NAMES, ENV_ONLY_SECRET_NAMES } = await import("../../server/edge/runtime-secrets");
const { consumeEbayOAuthState } = await import("../../server/edge/ebay-oauth-state");
const { corsHeaders } = await import("../../server/edge/cors");
const { healthDetails, pingDatabase } = await import("../../server/edge/health");
const { withRequestContext } = await import("../../server/edge/request-context");
const { createLogger } = await import("@/lib/logger");

const ENV_KEYS = ["CRON_SECRET", "TOKEN_ENCRYPTION_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "APP_URL", "NEXT_PUBLIC_APP_URL", "EDGE_CORS_ORIGINS", "EDGE_CORS_ALLOW_LOCALHOST", "EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_RU_NAME", "EBAY_ENV"] as const;
const saved: Record<string, string | undefined> = {};
const CRON = "c".repeat(32);

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.CRON_SECRET = CRON;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.EBAY_CLIENT_ID = "app-id";
  process.env.EBAY_CLIENT_SECRET = "cert-id";
  process.env.EBAY_RU_NAME = "ru-name";
  process.env.EBAY_ENV = "production";
  admin = null;
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

const req = (p: string, init: RequestInit = {}) => new Request(`https://x.supabase.co/functions/v1/api${p}`, init);

describe("S-07 / W-15 : secrets du Vault — délai, nouvelles tentatives, aucun échec figé", () => {
  const env = () => ({ SUPABASE_URL: "https://p.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "srk" }) as Record<string, string | undefined>;

  it("erreur transitoire (HTTP 503 puis réseau) : nouvelles tentatives avec backoff, puis succès", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n++;
      if (n === 1) return new Response("{}", { status: 503 });
      if (n === 2) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ TOKEN_ENCRYPTION_KEY: "k" }), { status: 200 });
    }) as unknown as typeof fetch;
    const waits: number[] = [];
    const e = env();
    const s = await loadRuntimeSecrets(e, fetchImpl, { sleep: async (ms) => void waits.push(ms) });
    expect(s.error).toBeNull();
    expect(e.TOKEN_ENCRYPTION_KEY).toBe("k");
    expect(waits).toEqual([300, 900]);
  });

  it("chaque lecture a un délai d'expiration (AbortSignal) ; un refus 401 n'est pas retenté", async () => {
    const signals: unknown[] = [];
    const fetchImpl = vi.fn(async (_u: string, init?: RequestInit) => (signals.push(init?.signal), new Response("{}", { status: 401 }))) as unknown as typeof fetch;
    const s = await loadRuntimeSecrets(env(), fetchImpl, { sleep: async () => undefined });
    expect(s.error).toMatch(/HTTP 401/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it("délai dépassé : message explicite", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as unknown as typeof fetch;
    const s = await loadRuntimeSecrets(env(), fetchImpl, { retries: 0, timeoutMs: 1234 });
    expect(s.error).toMatch(/délai de 1234 ms/);
  });

  it("un échec n'est PAS mis en cache pour la vie de l'instance : nouvel essai au besoin suivant, après le délai", async () => {
    let clock = 1_000;
    const results = [{ fromEnv: [], fromVault: [], error: "Vault injoignable" }, { fromEnv: [], fromVault: ["CRON_SECRET"], error: null }];
    const load = vi.fn(async () => results.shift()!);
    const loader = createRuntimeSecretsLoader({}, { load, now: () => clock, minRetryMs: 2_000 });
    expect((await loader.ensure()).error).toBe("Vault injoignable");
    expect(loader.status()).toMatchObject({ loaded: false, attempts: 1, nextRetryAt: new Date(3_000).toISOString() });
    // Avant le délai : pas de nouvel appel (pas de martèlement du Vault).
    expect((await loader.ensure()).error).toBe("Vault injoignable");
    expect(load).toHaveBeenCalledTimes(1);
    clock = 3_500;
    expect((await loader.ensure()).error).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    // Succès : gardé, plus aucun appel.
    await loader.ensure();
    expect(load).toHaveBeenCalledTimes(2);
    expect(loader.status()).toMatchObject({ loaded: true, fromVault: ["CRON_SECRET"], nextRetryAt: null });
  });

  it("appels simultanés : un seul chargement en vol", async () => {
    let release: () => void = () => undefined;
    const load = vi.fn(() => new Promise<{ fromEnv: string[]; fromVault: string[]; error: null }>((resolve) => (release = () => resolve({ fromEnv: [], fromVault: [], error: null }))));
    const loader = createRuntimeSecretsLoader({}, { load });
    const a = loader.ensure();
    const b = loader.ensure();
    release();
    await Promise.all([a, b]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("S-25 : noms de secrets alignés sur server_runtime_secrets() versionnée", () => {
  it("VAULT_SECRET_NAMES = noms renvoyés par la migration 20261009000400 ; les autres sont documentés « env seulement »", () => {
    const sql = readFileSync(path.join(ROOT, "supabase/migrations/20261009000400_server_runtime_secrets.sql"), "utf8");
    const list = /where s\.name in \(([\s\S]*?)\)/.exec(sql)![1]!;
    const names = [...list.matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]).sort();
    expect([...VAULT_SECRET_NAMES].sort()).toEqual(names);
    expect(new Set(RUNTIME_SECRET_NAMES).size).toBe(RUNTIME_SECRET_NAMES.length);
    expect(RUNTIME_SECRET_NAMES).toEqual([...VAULT_SECRET_NAMES, ...ENV_ONLY_SECRET_NAMES]);
  });
});

describe("S-16 / I-23 : /health public minimal, diagnostic détaillé derrière CRON_SECRET", () => {
  it("public : aucun nom de secret, aucun environnement eBay, aucun message d'erreur ; champs du diagnostic iPhone conservés", async () => {
    const res = await route(req("/health"));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Record<string, unknown> };
    expect(Object.keys(data).sort()).toEqual(["aiConfigured", "cronConfigured", "ebayConfigured", "ebayEnvironment", "encryptionConfigured", "ok", "time"]);
    expect(data).toMatchObject({ ok: true, ebayConfigured: true, ebayEnvironment: null, cronConfigured: true, encryptionConfigured: true });
    expect(JSON.stringify(data)).not.toMatch(/TOKEN_ENCRYPTION_KEY|CRON_SECRET|production|fromVault/);
  });

  it("chiffrement « configuré » seulement si la clé est conforme", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = "x".repeat(44);
    const { data } = (await (await route(req("/health"))).json()) as { data: { encryptionConfigured: boolean } };
    expect(data.encryptionConfigured).toBe(false);
  });

  it("détaillé : 401 sans CRON_SECRET", async () => {
    expect((await route(req("/health/details"))).status).toBe(401);
    expect((await route(req("/health/details", { headers: { authorization: "Bearer mauvais-secret-xxxxxxxx" } }))).status).toBe(401);
  });

  it("détaillé avec CRON_SECRET : ping réel de la base, état des secrets (noms seulement)", async () => {
    const res = await route(req("/health/details", { headers: { authorization: `Bearer ${CRON}` } }));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Record<string, unknown> };
    expect(data).toHaveProperty("database");
    expect(data).toHaveProperty("secrets");
    expect(data).toMatchObject({ ebay: { configured: true, environment: "production" }, encryption: { configured: true, currentVersion: 1 } });
  });

  it("ping de la base : requête bornée en temps ; échec rapporté sans exception", async () => {
    const signals: AbortSignal[] = [];
    const ok = { from: () => ({ select: () => ({ limit: () => ({ abortSignal: async (s: AbortSignal) => (signals.push(s), { error: null }) }) }) }) };
    expect(await pingDatabase(ok as never, () => 10)).toEqual({ ok: true, latencyMs: 0, error: null });
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    const ko = { from: () => ({ select: () => ({ limit: () => ({ abortSignal: async () => ({ error: { code: "57P01", message: "terminating connection" } }) }) }) }) };
    expect(await pingDatabase(ko as never)).toMatchObject({ ok: false, error: expect.stringMatching(/57P01/) });
    const details = await healthDetails({ secrets: () => ({ fromEnv: [], fromVault: ["CRON_SECRET"], error: "Vault injoignable", loaded: false, loadedAt: null, attempts: 2, nextRetryAt: null }), ping: async () => ({ ok: true, latencyMs: 4, error: null }), admin: () => ({}) as never });
    expect(details).toMatchObject({ ok: false, database: { ok: true, latencyMs: 4 }, secrets: { error: "Vault injoignable", attempts: 2, fromVault: ["CRON_SECRET"] } });
  });
});

describe("S-24 : /ebay/finalize ne consomme que l'état de l'appelant", () => {
  const ORG = "11111111-1111-4111-8111-111111111111";
  const state = "s".repeat(43);
  let db: MemoryDb;
  beforeEach(() => {
    db = memoryDb({ oauth_states: [{ state, provider: "ebay", organization_id: ORG, created_by: "u-author", expires_at: "2099-01-01T00:00:00Z" }] });
  });

  it("un autre administrateur de l'organisation : refus, et l'état de l'auteur reste utilisable", async () => {
    await expect(consumeEbayOAuthState(db.client, { state, userId: "u-other-admin", organizationId: ORG })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.tables.oauth_states).toHaveLength(1);
    await expect(consumeEbayOAuthState(db.client, { state, userId: "u-author", organizationId: "22222222-2222-4222-8222-222222222222" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.tables.oauth_states).toHaveLength(1);
    const row = await consumeEbayOAuthState(db.client, { state, userId: "u-author", organizationId: ORG });
    expect(row).toMatchObject({ state, created_by: "u-author" });
    expect(db.tables.oauth_states).toHaveLength(0);
  });

  it("état inconnu ou déjà utilisé : message de relance", async () => {
    await consumeEbayOAuthState(db.client, { state, userId: "u-author", organizationId: ORG });
    await expect(consumeEbayOAuthState(db.client, { state, userId: "u-author", organizationId: ORG })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("S-26 : table des routes à jour, code mort retiré", () => {
  const api = readFileSync(path.join(ROOT, "server/edge/api.ts"), "utf8");
  const header = api.slice(0, api.indexOf("*/"));

  it("chaque route du routeur figure dans l'en-tête de api.ts", () => {
    const paths = [...new Set([...api.matchAll(/path === "(\/[^"]+)"/g)].map((m) => m[1]!))];
    expect(paths.length).toBeGreaterThan(60);
    const missing = paths.filter((p) => !header.includes(`/api${p}`) && !(p.startsWith("/cron/") && header.includes(p.slice("/cron/".length))));
    expect(missing).toEqual([]);
  });

  it("mobile-api/service n'exporte plus que les projections servies par l'Edge", async () => {
    const service = await import("@/features/mobile-api/service");
    expect(Object.keys(service).sort()).toEqual(["integrations", "sourcingOfferDTO", "sourcingSearch", "sourcingStatus"]);
  });
});

describe("S-27 : collecte hebdomadaire désactivée tant que la migration en attente n'est pas appliquée", () => {
  it("colonnes absentes : 503 explicite, aucune collecte lancée", async () => {
    const from = vi.fn(() => ({ select: () => ({ limit: async () => ({ data: null, error: { code: "42703", message: 'column supplier_sources.collection_started_at does not exist' } }) }) }));
    admin = { from };
    const res = await route(req("/cron/sourcing-weekly", { method: "POST", headers: { authorization: `Bearer ${CRON}` }, body: "{}" }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("NOT_CONFIGURED");
    expect(body.error.message).toMatch(/supabase\/pending\/20261014000100.*n'est pas appliquée/);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("supplier_sources");
  });

  it("sans CRON_SECRET : 401 (la sonde du schéma n'est même pas exécutée)", async () => {
    const from = vi.fn();
    admin = { from };
    expect((await route(req("/cron/sourcing-weekly", { method: "POST", body: "{}" }))).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("Q-22 : CORS restreint aux origines connues", () => {
  it("origine inconnue : aucun Access-Control-Allow-Origin ; site et liste explicite : autorisés", () => {
    const env = { APP_URL: "https://monstock.example", EDGE_CORS_ORIGINS: "https://admin.monstock.example, http://evil.example", SUPABASE_URL: "https://p.supabase.co" };
    expect(corsHeaders("https://evil.example", env)).not.toHaveProperty("Access-Control-Allow-Origin");
    expect(corsHeaders("http://evil.example", env)).not.toHaveProperty("Access-Control-Allow-Origin");
    expect(corsHeaders("https://monstock.example", env)["Access-Control-Allow-Origin"]).toBe("https://monstock.example");
    expect(corsHeaders("https://admin.monstock.example", env)["Access-Control-Allow-Origin"]).toBe("https://admin.monstock.example");
    // Application native : pas d'Origin, pas d'en-têtes CORS.
    expect(corsHeaders(null, env)).toEqual({ Vary: "Origin" });
  });

  it("localhost seulement en développement (pile locale ou drapeau explicite)", () => {
    expect(corsHeaders("http://localhost:8081", { SUPABASE_URL: "https://p.supabase.co" })).not.toHaveProperty("Access-Control-Allow-Origin");
    expect(corsHeaders("http://localhost:8081", { SUPABASE_URL: "http://127.0.0.1:54321" })["Access-Control-Allow-Origin"]).toBe("http://localhost:8081");
    expect(corsHeaders("http://127.0.0.1:3000", { SUPABASE_URL: "https://p.supabase.co", EDGE_CORS_ALLOW_LOCALHOST: "1" })["Access-Control-Allow-Origin"]).toBe("http://127.0.0.1:3000");
    // L'URL du projet Supabase n'est jamais une origine de navigateur autorisée (repli du bundle).
    expect(corsHeaders("https://p.supabase.co", { SUPABASE_URL: "https://p.supabase.co", NEXT_PUBLIC_APP_URL: "https://p.supabase.co" })).not.toHaveProperty("Access-Control-Allow-Origin");
  });

  it("serve : plus de « Access-Control-Allow-Origin: * » ; X-Request-Id renvoyé", async () => {
    process.env.APP_URL = "https://monstock.example";
    delete process.env.SUPABASE_URL; // pas de lecture du Vault dans ce test
    const evil = await serve(req("/health", { headers: { origin: "https://evil.example" } }));
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    expect(evil.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const site = await serve(req("/health", { method: "OPTIONS", headers: { origin: "https://monstock.example" } }));
    expect(site.status).toBe(204);
    expect(site.headers.get("access-control-allow-origin")).toBe("https://monstock.example");
    const traced = await serve(req("/health", { headers: { "x-request-id": "req-abc-12345" } }));
    expect(traced.headers.get("x-request-id")).toBe("req-abc-12345");
  });

  it("le module de démonstration est remplacé par un shim inerte dans le bundle de l'Edge", async () => {
    const build = readFileSync(path.join(ROOT, "scripts/build-edge.mjs"), "utf8");
    expect(build).toMatch(/"@\/lib\/supabase\/preview": "server\/edge\/shims\/supabase-preview\.ts"/);
    const shim = await import("../../server/edge/shims/supabase-preview");
    expect(shim.isWebPreview()).toBe(false);
    await expect(shim.previewClient()).rejects.toThrow(/indisponible/);
    const shimText = readFileSync(path.join(ROOT, "server/edge/shims/supabase-preview.ts"), "utf8");
    expect(shimText).not.toMatch(/import /);
  });
});

describe("S-17 : journaux JSON corrélés par identifiant de requête", () => {
  it("une ligne JSON par événement, requestId ajouté, champs de base protégés, secrets masqués", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const log = createLogger("TEST");
    await withRequestContext("req-12345678", async () => {
      await Promise.resolve();
      log.info("bonjour", { message: "écrasement ?", accessToken: "secret-xyz", n: 2 });
    });
    log.info("hors requête");
    const [first, second] = info.mock.calls.map((c) => c as unknown as [string]);
    expect(first).toHaveLength(1);
    const line = JSON.parse(first![0]) as Record<string, unknown>;
    expect(line).toMatchObject({ level: "info", scope: "TEST", message: "bonjour", requestId: "req-12345678", "meta.message": "écrasement ?", accessToken: "[REDACTED]", n: 2 });
    expect(typeof line.ts).toBe("string");
    expect(JSON.parse(second![0])).not.toHaveProperty("requestId");
  });
});
