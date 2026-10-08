import { describe, expect, it, vi } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import type { RawOffer } from "@/domain/sourcing/types";
import type { AdapterSearchResult, SourceAdapter } from "@/integrations/sourcing/core";
import type { RobotsCheck } from "@/services/sourcing/crawler/robots";
import { executeLiveSearch, liveSearchCacheKey, preflight, type LiveSearchRuntime, type LiveSourceCandidate } from "@/services/sourcing/live-search";
import { HostScheduler } from "@/services/sourcing/adapter-runtime";
import { sourceConfig } from "./helpers/sourcing-adapters";

const offer = (id: string, price = 100): RawOffer => ({ externalOfferId: id, title: `Produit ${id}`, price, currency: "EUR", url: `https://host-a.example/p/${id}` });

function fakeAdapter(key: string, overrides: Partial<SourceAdapter> & { result?: AdapterSearchResult | (() => Promise<AdapterSearchResult>) } = {}): SourceAdapter {
  const { result, ...rest } = overrides;
  return {
    key,
    label: key,
    description: "",
    method: "public_json",
    access: "public",
    capabilities: { search: true, catalog: false, stockQuantity: false },
    credentialFields: [],
    configFields: [],
    verification: "fixtures",
    urlsForQuery: () => [`https://host-a.example/search?q=x`],
    search: async () => (typeof result === "function" ? result() : result ?? { offers: [offer("A1"), offer("A2")], method: "public_json", requests: [{ url: "https://host-a.example/search?q=x", status: 200, durationMs: 5, offers: 2, error: null }], error: null, truncated: false }),
    testConnection: async () => ({ ok: true, message: "" }),
    ...rest,
  };
}

function candidate(id: string, adapter: SourceAdapter | null, extra: Partial<LiveSourceCandidate> = {}): LiveSourceCandidate {
  return { sourceId: id, sourceName: `Source ${id}`, supplierId: `sup-${id}`, supplierName: `Fournisseur ${id}`, sourceType: "PUBLIC_WEB", adapter, adapterKey: adapter?.key ?? null, config: sourceConfig({ baseUrl: "https://host-a.example" }), attested: true, connectionId: null, ...extra };
}

const robotsOk: RobotsCheck = { allowed: true, robotsStatus: "ok", crawlDelay: null, disallowedUrls: [], details: "ok" };
const robotsKo: RobotsCheck = { allowed: false, robotsStatus: "ok", crawlDelay: null, disallowedUrls: ["https://host-a.example/search?q=x"], details: "Disallow: /search" };

function runtime(overrides: Partial<LiveSearchRuntime> = {}) {
  const stored: Array<{ sourceId: string; offers: RawOffer[] }> = [];
  const runs: Array<{ sourceId: string; status: string }> = [];
  const rt: LiveSearchRuntime = {
    userAgent: "MonStockBot/0.1",
    now: () => new Date(),
    sleep: async () => undefined,
    checkRobots: async () => robotsOk,
    loadCredentials: async () => ({ api_key: "k" }),
    storeOffers: async (c, offers) => {
      stored.push({ sourceId: c.sourceId, offers });
      return { offerIds: offers.map((o) => `${c.sourceId}:${o.externalOfferId}`), stored: offers.length, rejected: 0 };
    },
    recordRun: async (c, r) => {
      runs.push({ sourceId: c.sourceId, status: r.status });
    },
    cache: new Map(),
    perSourceTimeoutMs: 200,
    maxSources: 10,
    parallelism: 10,
    publicMinDelayMs: 0,
    accountMinDelayMs: 0,
    ...overrides,
  };
  return { rt, stored, runs };
}

const input = { rawQuery: "iphone 13", parsed: parseQuery("iphone 13") };

describe("recherche en direct : orchestration", () => {
  it("ok : interroge, enveloppe la provenance, enregistre, journalise et met en cache", async () => {
    const { rt, stored, runs } = runtime();
    const summary = await executeLiveSearch([candidate("s1", fakeAdapter("fake"))], input, rt);
    expect(summary.queried).toBe(1);
    expect(summary.found).toBe(2);
    expect(summary.stored).toBe(2);
    expect(summary.offerIds).toEqual(["s1:A1", "s1:A2"]);
    const r = summary.sources[0]!;
    expect(r).toMatchObject({ sourceId: "s1", status: "ok", found: 2, stored: 2, rejected: 0, adapterKey: "fake", method: "public_json" });
    expect(r.requests.length).toBe(1);
    const raw = stored[0]!.offers[0]!.raw as { provenance: Record<string, unknown> };
    expect(raw.provenance).toMatchObject({ adapter: "fake", method: "public_json", request_url: "https://host-a.example/search?q=x", source_url: "https://host-a.example/p/A1" });
    expect(typeof raw.provenance.retrieved_at).toBe("string");
    expect(runs).toEqual([{ sourceId: "s1", status: "ok" }]);
    expect(rt.cache.has(liveSearchCacheKey("s1", "iphone 13"))).toBe(true);
  });

  it("cached : une seconde recherche identique ne ré-interroge pas la source mais restitue ses offres", async () => {
    const search = vi.fn(async () => ({ offers: [offer("A1")], method: "public_json" as const, requests: [], error: null, truncated: false }));
    const { rt, runs } = runtime();
    const c = candidate("s1", fakeAdapter("fake", { search }));
    await executeLiveSearch([c], input, rt);
    const again = await executeLiveSearch([c], { ...input, rawQuery: "IPHONE  13" }, rt);
    expect(search).toHaveBeenCalledTimes(1);
    expect(again.sources[0]?.status).toBe("cached");
    expect(again.queried).toBe(0);
    expect(again.offerIds).toEqual(["s1:A1"]);
    expect(runs.length).toBe(1);
  });

  it("not_attested / robots_disallowed / no_search / account_required : aucune requête, statuts explicites", async () => {
    const search = vi.fn(async () => ({ offers: [], method: "public_json" as const, requests: [], error: null, truncated: false }));
    const robots = vi.fn(async (c: LiveSourceCandidate) => (c.sourceId === "robots" ? robotsKo : robotsOk));
    const { rt, runs } = runtime({ checkRobots: robots, loadCredentials: async () => null });
    const noSearch = fakeAdapter("catalog-only", { capabilities: { search: false, catalog: true, stockQuantity: false }, search });
    const account = fakeAdapter("account", { access: "account", method: "official_api", search });
    const summary = await executeLiveSearch(
      [candidate("na", fakeAdapter("fake", { search }), { attested: false }), candidate("robots", fakeAdapter("fake", { search })), candidate("ns", noSearch), candidate("none", null), candidate("acc", account), candidate("acc2", account, { connectionId: "conn-1" })],
      input,
      rt,
    );
    expect(summary.sources.map((s) => s.status)).toEqual(["not_attested", "robots_disallowed", "no_search", "no_search", "account_required", "account_required"]);
    expect(search).not.toHaveBeenCalled();
    expect(robots).toHaveBeenCalledTimes(1);
    expect(summary.sources[1]?.message).toMatch(/robots\.txt/);
    expect(summary.sources[5]?.message).toMatch(/Identifiants/);
    expect(runs).toEqual([]);
    expect(summary.queried).toBe(0);
  });

  it("feed public : pas d'attestation ni de robots requis ; compte : identifiants déchiffrés transmis", async () => {
    const seen: Record<string, unknown>[] = [];
    const feed = fakeAdapter("feed", { method: "public_feed", search: async (_c, _q, _r, ctx) => { seen.push({ creds: ctx.credentials, delay: ctx.minDelayMs }); return { offers: [], method: "public_feed", requests: [], error: null, truncated: false }; } });
    const account = fakeAdapter("account", { access: "account", method: "official_api", search: async (_c, _q, _r, ctx) => { seen.push({ creds: ctx.credentials, delay: ctx.minDelayMs }); return { offers: [offer("B1")], method: "official_api", requests: [], error: null, truncated: false }; } });
    const robots = vi.fn(async () => robotsOk);
    const { rt } = runtime({ checkRobots: robots, publicMinDelayMs: 2000, accountMinDelayMs: 500 });
    const summary = await executeLiveSearch([candidate("f", feed, { attested: false }), candidate("a", account, { connectionId: "conn-1", sourceType: "SUPPLIER_ACCOUNT" })], input, rt);
    expect(summary.sources.map((s) => s.status)).toEqual(["ok", "ok"]);
    expect(robots).not.toHaveBeenCalled();
    expect(seen).toEqual([{ creds: undefined, delay: 2000 }, { creds: { api_key: "k" }, delay: 500 }]);
  });

  it("timeout : une source trop lente est signalée, les autres répondent", async () => {
    const slow = fakeAdapter("slow", { result: () => new Promise((resolve) => setTimeout(() => resolve({ offers: [], method: "public_json", requests: [], error: null, truncated: false }), 2_000)) });
    const { rt, runs } = runtime({ perSourceTimeoutMs: 50 });
    const summary = await executeLiveSearch([candidate("slow", slow), candidate("fast", fakeAdapter("fast"))], input, rt);
    expect(summary.sources.map((s) => s.status)).toEqual(["timeout", "ok"]);
    expect(summary.sources[0]?.message).toMatch(/Délai dépassé/);
    expect(runs.map((r) => r.status).sort()).toEqual(["ok", "timeout"]);
  });

  it("error : erreur de l'adaptateur (résultat ou exception) → statut error journalisé, rien d'enregistré", async () => {
    const failing = fakeAdapter("failing", { result: { offers: [], method: "public_json", requests: [{ url: "https://host-a.example/search?q=x", status: 500, durationMs: 3, offers: 0, error: "HTTP 500" }], error: "HTTP 500", truncated: false } });
    const throwing = fakeAdapter("throwing", { search: async () => { throw new Error("réseau coupé"); } });
    const { rt, stored, runs } = runtime();
    const summary = await executeLiveSearch([candidate("e1", failing), candidate("e2", throwing)], input, rt);
    expect(summary.sources.map((s) => [s.status, s.message])).toEqual([["error", "HTTP 500"], ["error", "réseau coupé"]]);
    expect(summary.sources[0]?.requests[0]?.status).toBe(500);
    expect(stored).toEqual([]);
    expect(runs.map((r) => r.status)).toEqual(["error", "error"]);
    expect(rt.cache.size).toBe(0);
  });

  it("skipped : au-delà de maxSources, les sources restantes ne sont pas interrogées", async () => {
    const search = vi.fn(async () => ({ offers: [], method: "public_json" as const, requests: [], error: null, truncated: false }));
    const { rt } = runtime();
    const summary = await executeLiveSearch([candidate("1", fakeAdapter("a", { search })), candidate("2", fakeAdapter("b", { search })), candidate("3", fakeAdapter("c", { search }))], { ...input, maxSources: 2 }, rt);
    expect(summary.sources.map((s) => s.status)).toEqual(["ok", "ok", "skipped"]);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("enregistrement partiel : offres rejetées comptées, erreur de stockage signalée", async () => {
    const { rt } = runtime({ storeOffers: async () => ({ offerIds: ["x"], stored: 1, rejected: 1 }) });
    const summary = await executeLiveSearch([candidate("s1", fakeAdapter("fake"))], input, rt);
    expect(summary.sources[0]).toMatchObject({ status: "ok", found: 2, stored: 1, rejected: 1 });
    const { rt: rt2 } = runtime({ storeOffers: async () => { throw new Error("base indisponible"); } });
    const s2 = await executeLiveSearch([candidate("s1", fakeAdapter("fake"))], input, rt2);
    expect(s2.sources[0]?.status).toBe("error");
    expect(s2.sources[0]?.message).toMatch(/base indisponible/);
  });

  it("preflight : décision sans réseau", () => {
    expect(preflight(candidate("x", fakeAdapter("f"))).ok).toBe(true);
    expect(preflight(candidate("x", fakeAdapter("f"), { attested: false }))).toMatchObject({ ok: false, status: "not_attested" });
    expect(preflight(candidate("x", fakeAdapter("f", { method: "public_feed" }), { attested: false })).ok).toBe(true);
  });
});

describe("planificateur par hôte", () => {
  it("sérialise les requêtes d'un même hôte avec un délai minimal, laisse les autres hôtes en parallèle", async () => {
    let clock = 0;
    const waits: number[] = [];
    const scheduler = new HostScheduler(2000, async (ms) => { waits.push(ms); clock += ms; }, () => clock);
    const order: string[] = [];
    const task = (host: string, label: string) => scheduler.run(host, async () => { order.push(`start:${label}`); await Promise.resolve(); order.push(`end:${label}`); });
    await Promise.all([task("a", "a1"), task("b", "b1"), task("a", "a2")]);
    expect(order.indexOf("end:a1")).toBeLessThan(order.indexOf("start:a2"));
    expect(waits).toEqual([2000]);
  });

  it("wrapFetch : chaque appel passe par la file de son hôte", async () => {
    const scheduler = new HostScheduler(0);
    const fetchImpl = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    const wrapped = scheduler.wrapFetch(fetchImpl);
    const res = await wrapped("https://host-a.example/x");
    expect(await res.text()).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledWith("https://host-a.example/x", undefined);
  });
});
