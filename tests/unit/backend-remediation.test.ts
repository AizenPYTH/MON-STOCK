import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createCipheriv, randomBytes } from "node:crypto";
import { memoryDb, type MemoryDb } from "./helpers/memory-db";
import type { TrackingSnapshot } from "@/domain/tools/tracking";

/**
 * Remédiation serveur (audit 2026-10-22) : S-29 (organisation explicite pour les écritures),
 * S-15 / I-29 (limites de débit, recherche en direct en lecture seule), I-17 (disjoncteur La Poste,
 * bascule, budget), S-28 / I-25 / D-05 (clés de chiffrement), I-31 (publication eBay), I-12
 * (compteur d'appels eBay).
 */
vi.mock("server-only", () => ({}));
let adminClient: unknown = null;
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => adminClient }));
const authFor = vi.fn((id: string) => ({ getAccessToken: async () => `token-${id}` }));
vi.mock("@/services/channels/connection-store", () => ({ connectorAuthFor: (id: string) => authFor(id), disconnectConnection: vi.fn() }));

const { requireMobileOrgContext, MOBILE_ORGANIZATION_REQUIRED } = await import("@/features/mobile-api/context");
const { reserveApiRate, API_RATE_LIMITS } = await import("@/services/rate-limit");
const { runLiveSearch } = await import("@/services/sourcing/live-search");
const { refreshParcel, runDueTracking, createTrackingBreaker, loadTrackingBreaker, LAPOSTE_AUTH_ALERT_KEY, TRACKING_MIN_PARCEL_START_MS } = await import("@/services/tracking/tracking");
const { ConnectorError } = await import("@/integrations/core/errors");
const crypto = await import("@/lib/crypto");
const { checkListing, publishListingForOrg } = await import("@/services/channels/ebay-listing-service");
const { countingAuth, recordEbayApiUsage, EBAY_DAILY_CALL_BUDGET_DEFAULT } = await import("@/services/channels/ebay-api-usage");

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG2 = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// -------------------------------------------------------------------------------------------------
describe("S-29 : X-Organization-Id obligatoire pour les écritures et l'administration", () => {
  function orgDb(): MemoryDb {
    const db = memoryDb({
      organizations: [{ id: ORG, name: "Org A", slug: "a", is_demo: false, default_currency: "EUR" }, { id: ORG2, name: "Org B", slug: "b", is_demo: false, default_currency: "EUR" }],
      organization_members: [{ user_id: USER, organization_id: ORG, role: "owner" }, { user_id: USER, organization_id: ORG2, role: "owner" }],
      user_profiles: [{ user_id: USER, email: "u@example.test", current_organization_id: ORG2 }],
    });
    Object.assign(db.client as object, { auth: { getUser: async () => ({ data: { user: { id: USER, email: "u@example.test" } }, error: null }) } });
    return db;
  }
  const request = (headers: Record<string, string>) => new Request("https://x/api/ebay/sync", { headers: { authorization: "Bearer jwt.token.sig", ...headers } });

  it("écriture ou admin sans en-tête : refus explicite (jamais l'organisation par défaut du profil)", async () => {
    const db = orgDb();
    for (const options of [{ write: true }, { admin: true }]) {
      await expect(requireMobileOrgContext(request({}), options, () => db.client)).rejects.toMatchObject({ code: "VALIDATION", message: MOBILE_ORGANIZATION_REQUIRED });
    }
  });

  it("avec l'en-tête : organisation désignée ; lecture sans en-tête : repli inchangé", async () => {
    const db = orgDb();
    expect((await requireMobileOrgContext(request({ "x-organization-id": ORG }), { write: true }, () => db.client)).organization.id).toBe(ORG);
    expect((await requireMobileOrgContext(request({}), {}, () => db.client)).organization.id).toBe(ORG2);
  });

  it("sans jeton : 401 d'abord (l'absence d'en-tête n'est pas révélée avant l'authentification)", async () => {
    await expect(requireMobileOrgContext(new Request("https://x/api/ebay/sync"), { write: true })).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });
});

// -------------------------------------------------------------------------------------------------
describe("S-15 / I-29 : limites de débit des routes coûteuses", () => {
  const ctx = { organization: { id: ORG }, user: { id: USER } };
  const rpcClient = (result: { data: unknown; error: unknown }) => {
    const rpc = vi.fn(async () => result);
    return { client: { rpc } as never, rpc };
  };

  it("réservation atomique en base avec les limites du serveur (objet, utilisateur, organisation)", async () => {
    const { client, rpc } = rpcClient({ data: { allowed: true, reason: null, retry_after_seconds: null }, error: null });
    await reserveApiRate(ctx, "ebay_sync", "conn-1", client);
    expect(rpc).toHaveBeenCalledWith("api_rate_reserve", {
      p_organization_id: ORG,
      p_user_id: USER,
      p_bucket: "ebay_sync",
      p_subject: "conn-1",
      p_subject_min_interval_seconds: API_RATE_LIMITS.ebay_sync.subjectMinIntervalSeconds,
      p_user_limit: API_RATE_LIMITS.ebay_sync.userLimit,
      p_user_window_seconds: API_RATE_LIMITS.ebay_sync.userWindowSeconds,
      p_org_limit: API_RATE_LIMITS.ebay_sync.orgLimit,
      p_org_window_seconds: API_RATE_LIMITS.ebay_sync.orgWindowSeconds,
    });
  });

  it("refus : 429 avec message rédigé et délai d'attente", async () => {
    const { client } = rpcClient({ data: { allowed: false, reason: "subject_cooldown", retry_after_seconds: 95 }, error: null });
    await expect(reserveApiRate(ctx, "ebay_sync", "conn-1", client)).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429, message: expect.stringMatching(/moins de 2 minutes/), details: { retryAfterSeconds: 95 } });
    const { client: c2 } = rpcClient({ data: { allowed: false, reason: "user_limit", retry_after_seconds: 30 }, error: null });
    await expect(reserveApiRate(ctx, "shipping_quotes", null, c2)).rejects.toMatchObject({ code: "RATE_LIMITED", message: expect.stringMatching(/devis/) });
  });

  it("fonction absente (Edge déployée avant la migration) : laisse passer ; autre erreur : 503 (fail-closed)", async () => {
    await expect(reserveApiRate(ctx, "tracking_refresh", "p1", rpcClient({ data: null, error: { code: "PGRST202", message: "not found" } }).client)).resolves.toBeUndefined();
    await expect(reserveApiRate(ctx, "tracking_refresh", "p1", rpcClient({ data: null, error: { code: "57014", message: "timeout" } }).client)).rejects.toMatchObject({ status: 503 });
    await expect(reserveApiRate(ctx, "tracking_refresh", "p1", rpcClient({ data: "??", error: null }).client)).rejects.toMatchObject({ status: 503 });
  });

  it("recherche en direct : un rôle lecture seule ne déclenche aucune écriture (aucun client service_role, aucun appel réseau)", async () => {
    adminClient = new Proxy({}, { get: () => { throw new Error("service_role ne doit pas être utilisé"); } });
    const fetchImpl = vi.fn();
    const viewer = { organization: { id: ORG, default_currency: "EUR" }, user: { id: USER }, role: "viewer", supabase: {} } as never;
    const r = await runLiveSearch(viewer, { rawQuery: "iphone 13", parsed: { kind: "empty" } as never }, { fetchImpl: fetchImpl as never });
    expect(r).toMatchObject({ sources: [], queried: 0, stored: 0, offerIds: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------------------------------
describe("I-17 : La Poste — disjoncteur, alerte unique, bascule, budget de temps", () => {
  const parcel = (id: string, org = ORG) => ({ id, organization_id: org, tracking_number: `6A${id}`, carrier_code: "colissimo", label: id, status: "in_transit", destination_country: null, created_at: "2026-10-10T08:00:00Z", check_count: 1, archived_at: null });
  const now = new Date("2026-10-23T10:00:00Z");
  const snap: TrackingSnapshot = { status: "in_transit", statusDetail: "En cours", estimatedDelivery: null, deliveredAt: null, events: [], carrierLabel: "Colissimo", providerUrl: null };
  const refused = () => new ConnectorError("AUTH_EXPIRED", "laposte", "Clé La Poste refusée ou non abonnée à « Suivi v2 » (LAPOSTE_OKAPI_KEY).", { httpStatus: 401 });
  const KEYS = { LAPOSTE_OKAPI_KEY: "okapi-key-123456", SHIP24_API_KEY: "ship24-key-123456" };

  it("clé refusée : bascule immédiate vers Ship24, une seule alerte pour l'organisation", async () => {
    const db = memoryDb({ tracked_parcels: [parcel("p1")] });
    const laposte = vi.fn(async () => {
      throw refused();
    });
    const ship24 = vi.fn(async () => snap);
    const breaker = createTrackingBreaker(db.client);
    const r = await refreshParcel(db.client, parcel("p1"), now, KEYS, { laposte, ship24, dhl: vi.fn() }, breaker);
    expect(r).toMatchObject({ checked: true, provider: "ship24", status: "in_transit" });
    expect(breaker.isOpen("laposte")).toBe(true);
    const alerts = db.tables.alerts!.filter((a) => a.dedupe_key === LAPOSTE_AUTH_ALERT_KEY);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ organization_id: ORG, type: "tracking_provider_auth", status: "open" });
  });

  it("passage planifié : La Poste n'est appelée qu'UNE fois ; sans bascule, colis replanifiés après le délai du disjoncteur", async () => {
    const parcels = [parcel("p1"), parcel("p2"), parcel("p3", ORG2)].map((p) => ({ ...p, next_check_at: "2026-10-23T09:00:00Z" }));
    const db = memoryDb({ tracked_parcels: parcels });
    const laposte = vi.fn(async () => {
      throw refused();
    });
    const r = await runDueTracking(now, db.client, 30, { LAPOSTE_OKAPI_KEY: KEYS.LAPOSTE_OKAPI_KEY }, { track: { laposte, ship24: vi.fn(), dhl: vi.fn() } });
    expect(laposte).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ failed: 1, skipped: 2, suspended: ["laposte"] });
    const rows = db.tables.tracked_parcels!;
    expect(rows.find((p) => p.id === "p2")).toMatchObject({ next_check_at: "2026-10-23T16:00:00.000Z", last_error: expect.stringMatching(/suspendu/) });
    // Alerte : une seule, pour l'organisation du colis réellement interrogé.
    expect(db.tables.alerts!.filter((a) => a.dedupe_key === LAPOSTE_AUTH_ALERT_KEY)).toHaveLength(1);
  });

  it("état persistant : alerte ouverte récente → disjoncteur ouvert pour toutes les instances ; ancienne → nouvel essai ; succès → alerte résolue", async () => {
    const recent = memoryDb({ alerts: [{ id: "a1", organization_id: ORG, dedupe_key: LAPOSTE_AUTH_ALERT_KEY, status: "open", updated_at: "2026-10-23T08:00:00Z" }] });
    expect((await loadTrackingBreaker(recent.client, now)).isOpen("laposte")).toBe(true);
    const old = memoryDb({ alerts: [{ id: "a1", organization_id: ORG, dedupe_key: LAPOSTE_AUTH_ALERT_KEY, status: "open", updated_at: "2026-10-22T08:00:00Z" }], tracked_parcels: [parcel("p1")] });
    const breaker = await loadTrackingBreaker(old.client, now);
    expect(breaker.isOpen("laposte")).toBe(false);
    const r = await refreshParcel(old.client, parcel("p1"), now, { LAPOSTE_OKAPI_KEY: KEYS.LAPOSTE_OKAPI_KEY }, { laposte: async () => snap, ship24: vi.fn(), dhl: vi.fn() }, breaker);
    expect(r).toMatchObject({ checked: true, provider: "laposte" });
    expect(old.tables.alerts![0]).toMatchObject({ status: "resolved" });
  });

  it("budget de temps : aucun colis commencé quand le temps restant est insuffisant (reportés)", async () => {
    const parcels = [parcel("p1"), parcel("p2"), parcel("p3")].map((p) => ({ ...p, next_check_at: "2026-10-23T09:00:00Z" }));
    const db = memoryDb({ tracked_parcels: parcels });
    let clock = 0;
    const ship24 = vi.fn(async () => {
      clock += 40_000; // appel lent
      return snap;
    });
    const r = await runDueTracking(now, db.client, 30, { SHIP24_API_KEY: KEYS.SHIP24_API_KEY }, { budgetMs: 40_000 + TRACKING_MIN_PARCEL_START_MS - 1, clock: () => clock, track: { laposte: vi.fn(), ship24, dhl: vi.fn() } });
    expect(ship24).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ checked: 1, deferred: 2 });
  });
});

// -------------------------------------------------------------------------------------------------
describe("S-28 / I-25 / D-05 : clés de chiffrement conformes, versions, compatibilité", () => {
  const K1 = Buffer.alloc(32, 1).toString("base64");
  const K2 = Buffer.alloc(32, 2).toString("base64");

  /** Ancien chiffrement (avant correctif) : clé base64 de 32 octets, sinon SHA-256 de la chaîne. */
  function legacyEncrypt(plain: string, raw: string): string {
    const decoded = Buffer.from(raw, "base64");
    const key = decoded.length === 32 ? decoded : createHash("sha256").update(raw, "utf8").digest();
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
    return ["v1", iv.toString("base64"), enc.toString("base64"), c.getAuthTag().toString("base64")].join(":");
  }

  it("clé conforme (format de production) : textes chiffrés existants lus à l'identique, nouveaux au même format v1", () => {
    const env = { TOKEN_ENCRYPTION_KEY: K1 };
    expect(crypto.decryptSecret(legacyEncrypt("jeton-existant", K1), env)).toBe("jeton-existant");
    const p = crypto.encryptSecret("x", env);
    expect(p.startsWith("v1:")).toBe(true);
    expect(crypto.keyVersionOf(p)).toBe(1);
  });

  it("clé non conforme : REFUSÉE (plus de dérivation SHA-256 silencieuse)", () => {
    const env = { TOKEN_ENCRYPTION_KEY: "une-phrase-de-passe-quelconque-de-plus-de-32-car" };
    expect(() => crypto.encryptSecret("x", env)).toThrow(crypto.EncryptionConfigError);
    expect(() => crypto.decryptSecret(legacyEncrypt("x", env.TOKEN_ENCRYPTION_KEY), env)).toThrow(/non conforme/);
    expect(crypto.encryptionKeyStatus(env)).toMatchObject({ configured: false, error: expect.stringMatching(/non conforme/) });
    expect(() => crypto.encryptSecret("x", {})).toThrow(/absente/);
  });

  it("compatibilité EXPLICITE pour une ancienne clé « phrase » : les jetons existants restent lisibles", () => {
    const raw = "une-phrase-de-passe-quelconque-de-plus-de-32-car";
    const env = { TOKEN_ENCRYPTION_KEY: raw, TOKEN_ENCRYPTION_KEY_FORMAT: crypto.PASSPHRASE_KEY_FORMAT };
    expect(crypto.decryptSecret(legacyEncrypt("ancien", raw), env)).toBe("ancien");
    expect(crypto.encryptionKeyStatus(env)).toMatchObject({ configured: true, format: "passphrase-sha256" });
  });

  it("rotation : chiffrement avec la clé courante (v1k2), déchiffrement des anciens avec la clé précédente", () => {
    const old = crypto.encryptSecret("jeton", { TOKEN_ENCRYPTION_KEY: K1 });
    const env = { TOKEN_ENCRYPTION_KEY: K2, TOKEN_ENCRYPTION_KEY_VERSION: "2", TOKEN_ENCRYPTION_KEY_PREVIOUS: `1:${K1}` };
    expect(crypto.decryptSecret(old, env)).toBe("jeton");
    const fresh = crypto.encryptSecret("nouveau", env);
    expect(fresh.startsWith("v1k2:")).toBe(true);
    expect(crypto.currentKeyVersion(env)).toBe(2);
    const re = crypto.reencryptSecret(old, env);
    expect(crypto.keyVersionOf(re)).toBe(2);
    expect(crypto.decryptSecret(re, { TOKEN_ENCRYPTION_KEY: K2, TOKEN_ENCRYPTION_KEY_VERSION: "2" })).toBe("jeton");
    // Ancienne clé retirée trop tôt : erreur de CONFIGURATION (pas « donnée corrompue »).
    expect(() => crypto.decryptSecret(old, { TOKEN_ENCRYPTION_KEY: K2, TOKEN_ENCRYPTION_KEY_VERSION: "2" })).toThrow(crypto.EncryptionConfigError);
    expect(crypto.encryptionKeyStatus(env)).toMatchObject({ configured: true, currentVersion: 2, versions: [1, 2] });
  });

  it("anciennes clés mal formées ou en double : refus explicite", () => {
    expect(crypto.encryptionKeyStatus({ TOKEN_ENCRYPTION_KEY: K2, TOKEN_ENCRYPTION_KEY_VERSION: "2", TOKEN_ENCRYPTION_KEY_PREVIOUS: "1:pas-une-cle" }).error).toMatch(/version 1/);
    expect(crypto.encryptionKeyStatus({ TOKEN_ENCRYPTION_KEY: K2, TOKEN_ENCRYPTION_KEY_VERSION: "2", TOKEN_ENCRYPTION_KEY_PREVIOUS: `2:${K1}` }).error).toMatch(/double/);
    expect(crypto.encryptionKeyStatus({ TOKEN_ENCRYPTION_KEY: K2, TOKEN_ENCRYPTION_KEY_VERSION: "0" }).error).toMatch(/VERSION invalide/);
  });
});

// -------------------------------------------------------------------------------------------------
describe("I-31 : publication eBay — compte explicite, contrôle préalable du SKU", () => {
  const C1 = "44444444-4444-4444-8444-444444444441";
  const C2 = "44444444-4444-4444-8444-444444444442";
  const draft = { sku: "IP13-128-NR-A", title: "Apple iPhone 13 128 Go", description: "Testé, batterie 89 %, livré avec câble.", categoryId: "9355", condition: "SELLER_REFURBISHED", price: 429.9, quantity: 1, imageUrls: ["https://cdn.example/1.jpg"], aspects: {}, policies: { fulfillmentPolicyId: "F", paymentPolicyId: "P", returnPolicyId: "R" }, merchantLocationKey: "loc" };
  const saved: Record<string, string | undefined> = {};
  const KEYS = ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_RU_NAME", "EBAY_ENV", "EBAY_LISTING_ENABLED"] as const;
  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    Object.assign(process.env, { EBAY_CLIENT_ID: "id", EBAY_CLIENT_SECRET: "secret", EBAY_RU_NAME: "ru", EBAY_ENV: "production", EBAY_LISTING_ENABLED: "true" });
    authFor.mockClear();
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  const ctxFor = (db: MemoryDb) => ({ supabase: db.client, organization: { id: ORG, default_currency: "EUR" }, user: { id: USER }, role: "owner" }) as never;
  const connections = (...ids: string[]) => ids.map((id, i) => ({ id, organization_id: ORG, provider: "ebay", status: "connected", created_at: `2026-10-0${i + 1}T00:00:00Z` }));

  it("plusieurs comptes sans choix : publication refusée, aucun appel eBay ; le contrôle l'indique", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const db = memoryDb({ channel_connections: connections(C1, C2) });
    await expect(publishListingForOrg(ctxFor(db), { draft, confirm: true })).rejects.toMatchObject({ code: "VALIDATION", message: expect.stringMatching(/Plusieurs comptes eBay/) });
    expect(fetchMock).not.toHaveBeenCalled();
    const check = await checkListing(ctxFor(db), { draft, confirm: false });
    expect(check.publication.allowed).toBe(false);
    expect(check.publication.blockers.join(" ")).toMatch(/Plusieurs comptes eBay/);
  });

  it("SKU déjà porté par une annonce active du compte : conflit, aucun appel eBay", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const db = memoryDb({ channel_connections: connections(C1), channel_listings: [{ id: "l1", organization_id: ORG, connection_id: C1, external_listing_id: "1234567890", external_sku: draft.sku, status: "active", title: "iPhone 13" }] });
    await expect(publishListingForOrg(ctxFor(db), { draft, confirm: true })).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringMatching(/1234567890/) });
    expect(fetchMock).not.toHaveBeenCalled();
    const check = await checkListing(ctxFor(db), { draft, confirm: false });
    expect(check.publication).toMatchObject({ allowed: false, blockers: [expect.stringMatching(/déjà utilisé par l'annonce eBay active/)] });
  });

  it("compte choisi explicitement : publication sur CE compte ; compte d'une autre organisation refusé", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url}`);
      if (url.includes("/offer?sku=")) return new Response(null, { status: 404 });
      if (url.endsWith("/offer")) return new Response(JSON.stringify({ offerId: "O1" }), { status: 201 });
      if (url.endsWith("/publish")) return new Response(JSON.stringify({ listingId: "L1" }), { status: 200 });
      return new Response(null, { status: 204 });
    }));
    const db = memoryDb({ channel_connections: [...connections(C1, C2), { id: "55555555-5555-4555-8555-555555555555", organization_id: ORG2, provider: "ebay", status: "connected", created_at: "2026-10-01T00:00:00Z" }] });
    const r = await publishListingForOrg(ctxFor(db), { draft, confirm: true, connectionId: C2 });
    expect(r).toMatchObject({ offerId: "O1", listingId: "L1" });
    expect(authFor).toHaveBeenCalledWith(C2);
    expect(calls.some((c) => c.startsWith("POST") && c.endsWith("/publish"))).toBe(true);
    await expect(publishListingForOrg(ctxFor(db), { draft, confirm: true, connectionId: "55555555-5555-4555-8555-555555555555" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// -------------------------------------------------------------------------------------------------
describe("I-12 : compteur quotidien d'appels eBay par connexion", () => {
  it("chaque demande de jeton (= un appel HTTP eBay) est comptée", async () => {
    const counter = countingAuth({ getAccessToken: async () => "t" });
    await counter.auth.getAccessToken();
    await counter.auth.getAccessToken({ forceRefresh: true });
    expect(counter.calls()).toBe(2);
  });

  it("enregistrement en fin de run ; alerte unique par jour près du quota de l'application", async () => {
    let total = 0;
    const db = memoryDb({}, {}, { ebay_api_usage_add: (args) => ((total += Number(args.p_calls)), { data: { usage_date: "2026-10-23", calls: total, app_calls: total }, error: null }) });
    expect(await recordEbayApiUsage(db.client, { id: "c1", organization_id: ORG }, 0)).toBeNull();
    expect(await recordEbayApiUsage(db.client, { id: "c1", organization_id: ORG }, 100, {})).toMatchObject({ calls: 100, nearQuota: false, budget: EBAY_DAILY_CALL_BUDGET_DEFAULT });
    expect(db.tables.alerts ?? []).toHaveLength(0);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await recordEbayApiUsage(db.client, { id: "c1", organization_id: ORG }, 4000, {})).toMatchObject({ appCalls: 4100, nearQuota: true });
    await recordEbayApiUsage(db.client, { id: "c1", organization_id: ORG }, 10, {});
    expect(db.tables.alerts!.filter((a) => a.dedupe_key === "ebay_api_quota:2026-10-23")).toHaveLength(1);
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/quota quotidien d'appels eBay/);
  });

  it("erreur d'enregistrement : journalisée, jamais levée (la synchronisation continue)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const db = memoryDb({}, {}, { ebay_api_usage_add: () => ({ data: null, error: { code: "PGRST202", message: "absente" } }) });
    await expect(recordEbayApiUsage(db.client, { id: "c1", organization_id: ORG }, 5)).resolves.toBeNull();
  });
});
