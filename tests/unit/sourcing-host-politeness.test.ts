/**
 * Politesse par hôte (I-16) : Crawl-delay appliqué par la recherche en direct, créneau partagé
 * entre instances (réservation en base), robots.txt mis en cache (mémoire + base) au lieu d'être
 * relu à chaque recherche.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import type { AdapterRunContext, SourceAdapter } from "@/integrations/sourcing/core";
import { HostBusyError, HostScheduler } from "@/services/sourcing/adapter-runtime";
import { checkRobotsForUrls, type RobotsCheck } from "@/services/sourcing/crawler/robots";
import { executeLiveSearch, type LiveSearchRuntime, type LiveSourceCandidate } from "@/services/sourcing/live-search";
import { memoryDb, type MemoryDb } from "./helpers/memory-db";
import { mockFetch, publicResolver, sourceConfig } from "./helpers/sourcing-adapters";

const { clearRobotsMemoryCache, sharedHostReserver, sharedRobotsCache, ROBOTS_CACHE_TTL_MS } = await import("@/services/sourcing/host-politeness");

let db: MemoryDb;
beforeEach(() => {
  clearRobotsMemoryCache();
  db = memoryDb({ sourcing_host_policies: [] });
});

describe("planificateur par hôte", () => {
  it("Crawl-delay : délai de l'hôte relevé au-dessus du minimum, entre deux requêtes", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const s = new HostScheduler(2_000, async (ms) => {
      sleeps.push(ms);
      now += ms;
    }, () => now);
    s.setHostPolicy("shop.example", { delayMs: 10_000 });
    await s.run("shop.example", async () => undefined);
    await s.run("shop.example", async () => undefined);
    expect(sleeps).toEqual([10_000]);
    expect(s.delayFor("autre.example")).toBe(2_000);
  });

  it("créneau partagé : la réservation en base impose l'attente, et refuse au-delà de l'attente maximale", async () => {
    const reserve = vi.fn<(h: string, i: number, w: number) => Promise<number>>().mockResolvedValueOnce(1_500).mockResolvedValueOnce(-1);
    const sleeps: number[] = [];
    const s = new HostScheduler(2_000, async (ms) => void sleeps.push(ms), undefined, { reserve, maxWaitMs: 4_000 });
    s.setHostPolicy("shop.example", { delayMs: 5_000, shared: true });
    await s.run("shop.example", async () => undefined);
    expect(reserve).toHaveBeenCalledWith("shop.example", 5_000, 4_000);
    expect(sleeps).toContain(1_500);
    await expect(s.run("shop.example", async () => undefined)).rejects.toBeInstanceOf(HostBusyError);
    // hôte non marqué « partagé » (API officielle) : aucune réservation
    await s.run("api.ebay.com", async () => undefined);
    expect(reserve).toHaveBeenCalledTimes(2);
  });

  it("réservation RPC : en cas d'erreur de la base, la politesse locale s'applique seule", async () => {
    const failing = { rpc: async () => ({ data: null, error: { message: "indisponible" } }) } as never;
    expect(await sharedHostReserver(failing)("shop.example", 2_000, 4_000)).toBe(0);
    const ok = { rpc: async (_n: string, args: Record<string, unknown>) => ({ data: args.p_max_wait_ms === 0 ? -1 : 250, error: null }) } as never;
    expect(await sharedHostReserver(ok)("Shop.Example", 2_000, 4_000)).toBe(250);
  });
});

describe("cache robots.txt partagé", () => {
  const robots = "User-agent: *\nCrawl-delay: 4\nDisallow: /private";

  it("robots.txt lu une seule fois pour plusieurs recherches (mémoire puis base, partagée entre instances)", async () => {
    const { fetchImpl, calls } = mockFetch([["/robots.txt", { body: robots, contentType: "text/plain" }]]);
    const cache = sharedRobotsCache(db.client as never);
    const a = await checkRobotsForUrls("https://shop.example", ["https://shop.example/search?q=a"], "MonStockBot/0.1", fetchImpl, publicResolver, cache);
    const b = await checkRobotsForUrls("https://shop.example", ["https://shop.example/private/x"], "MonStockBot/0.1", fetchImpl, publicResolver, cache);
    expect(a).toMatchObject({ allowed: true, crawlDelay: 4 });
    expect(b.allowed).toBe(false);
    expect(calls.filter((c) => c.url.endsWith("/robots.txt"))).toHaveLength(1);
    expect(db.tables.sourcing_host_policies![0]).toMatchObject({ host: "https://shop.example", robots_status: "ok", crawl_delay_seconds: 4 });
    // autre instance (mémoire vide) : relu depuis la base, pas depuis le site
    clearRobotsMemoryCache();
    const c = await checkRobotsForUrls("https://shop.example", ["https://shop.example/search?q=c"], "MonStockBot/0.1", fetchImpl, publicResolver, sharedRobotsCache(db.client as never));
    expect(c.allowed).toBe(true);
    expect(calls.filter((x) => x.url.endsWith("/robots.txt"))).toHaveLength(1);
  });

  it("cache expiré (24 h) : robots.txt relu", async () => {
    const { fetchImpl, calls } = mockFetch([["/robots.txt", { body: robots, contentType: "text/plain" }]]);
    let now = Date.parse("2026-10-22T00:00:00Z");
    const cache = sharedRobotsCache(db.client as never, () => now);
    await checkRobotsForUrls("https://shop.example", ["https://shop.example/a"], "MonStockBot/0.1", fetchImpl, publicResolver, cache);
    now += ROBOTS_CACHE_TTL_MS + 1;
    await checkRobotsForUrls("https://shop.example", ["https://shop.example/a"], "MonStockBot/0.1", fetchImpl, publicResolver, cache);
    expect(calls.filter((c) => c.url.endsWith("/robots.txt"))).toHaveLength(2);
  });
});

describe("recherche en direct : Crawl-delay et créneau partagé appliqués", () => {
  const robotsDelay: RobotsCheck = { allowed: true, robotsStatus: "ok", crawlDelay: 5, disallowedUrls: [], details: "ok" };

  function adapter(onSearch: (ctx: AdapterRunContext) => Promise<void>): SourceAdapter {
    return {
      key: "fake",
      label: "fake",
      description: "",
      method: "public_json",
      access: "public",
      capabilities: { search: true, catalog: false, stockQuantity: false },
      credentialFields: [],
      configFields: [],
      verification: "fixtures",
      urlsForQuery: () => ["https://shop.example/search?q=x"],
      search: async (_c, _p, _t, ctx) => {
        await onSearch(ctx);
        return { offers: [], method: "public_json", requests: [], error: null, truncated: false };
      },
      testConnection: async () => ({ ok: true, message: "" }),
    };
  }

  const cand = (a: SourceAdapter): LiveSourceCandidate => ({ sourceId: "s1", sourceName: "S", supplierId: "p", supplierName: "P", sourceType: "PUBLIC_WEB", adapter: a, adapterKey: "fake", config: sourceConfig({ baseUrl: "https://shop.example" }), attested: true, connectionId: null });

  it("le délai demandé par robots.txt (5 s) sépare deux requêtes vers l'hôte et le créneau est réservé en base", async () => {
    const sleeps: number[] = [];
    const reserve = vi.fn(async () => 0);
    const a = adapter(async (ctx) => {
      await ctx.fetchImpl!("https://shop.example/search?q=1");
      await ctx.fetchImpl!("https://shop.example/search?q=2");
    });
    const rt: LiveSearchRuntime = {
      userAgent: "MonStockBot/0.1",
      now: () => new Date(),
      fetchImpl: (async () => new Response("{}")) as typeof fetch,
      sleep: async (ms) => void sleeps.push(ms),
      checkRobots: async () => robotsDelay,
      loadCredentials: async () => null,
      storeOffers: async () => ({ offerIds: [], stored: 0, rejected: 0 }),
      recordRun: async () => undefined,
      reserveHostSlot: reserve,
      cache: new Map(),
      perSourceTimeoutMs: 20_000,
      maxSources: 10,
      parallelism: 10,
      publicMinDelayMs: 2_000,
      accountMinDelayMs: 0,
    };
    await executeLiveSearch([cand(a)], { rawQuery: "x", parsed: parseQuery("x") }, rt);
    expect(reserve).toHaveBeenCalledWith("shop.example", 5_000, 10_000);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(Math.max(0, ...sleeps)).toBeGreaterThanOrEqual(4_900);
  });
});
