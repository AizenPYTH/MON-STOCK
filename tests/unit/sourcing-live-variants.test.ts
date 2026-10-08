import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { expandQuery, queriesFor } from "@/domain/sourcing/query-expansion";
import type { RawOffer } from "@/domain/sourcing/types";
import type { AdapterSearchResult, SourceAdapter } from "@/integrations/sourcing/core";
import { executeLiveSearch, liveSearchVariants, type LiveSearchRuntime, type LiveSourceCandidate } from "@/services/sourcing/live-search";
import { fixtureCandidates, fixtureRuntime, renderTestSearchReport, runTestSearch, TEST_SEARCH_QUERIES } from "@/services/sourcing/test-searches";
import { sourceConfig } from "./helpers/sourcing-adapters";

const raw = (id: string): RawOffer => ({ externalOfferId: id, title: `Apple iPhone 13 128GB ${id}`, price: 300, currency: "EUR", url: `https://host.example/p/${id}` });

function adapter(search: (q: string) => Promise<AdapterSearchResult>): SourceAdapter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    key: "fake",
    label: "fake",
    description: "",
    method: "public_json",
    access: "public",
    capabilities: { search: true, catalog: false, stockQuantity: false },
    credentialFields: [],
    configFields: [],
    verification: "fixtures",
    urlsForQuery: (_c, _p, q) => [`https://host.example/search?q=${encodeURIComponent(q)}`],
    search: async (_c, _p, q) => {
      calls.push(q);
      return search(q);
    },
    testConnection: async () => ({ ok: true, message: "" }),
  };
}

const ok = (q: string, offers: RawOffer[]): AdapterSearchResult => ({ offers, method: "public_json", requests: [{ url: `https://host.example/search?q=${q}`, status: 200, durationMs: 1, offers: offers.length, error: null }], error: null, truncated: false });

function candidate(a: SourceAdapter): LiveSourceCandidate {
  return { sourceId: "s1", sourceName: "S1", supplierId: "sup", supplierName: "Sup", sourceType: "PUBLIC_WEB", adapter: a, adapterKey: a.key, config: sourceConfig({ baseUrl: "https://host.example" }), attested: true, connectionId: null };
}

function runtime(over: Partial<LiveSearchRuntime> = {}): { rt: LiveSearchRuntime; stored: RawOffer[]; robotsUrls: string[][] } {
  const stored: RawOffer[] = [];
  const robotsUrls: string[][] = [];
  return {
    stored,
    robotsUrls,
    rt: {
      userAgent: "test",
      now: () => new Date(),
      sleep: async () => undefined,
      checkRobots: async (_c, urls) => {
        robotsUrls.push(urls);
        return { allowed: true, robotsStatus: "ok", crawlDelay: null, disallowedUrls: [], details: "ok" };
      },
      loadCredentials: async () => null,
      storeOffers: async (_c, offers) => {
        stored.push(...offers);
        return { offerIds: offers.map((o) => o.externalOfferId), stored: offers.length, rejected: 0 };
      },
      recordRun: async () => undefined,
      cache: new Map(),
      perSourceTimeoutMs: 2_000,
      maxSources: 10,
      parallelism: 10,
      publicMinDelayMs: 0,
      accountMinDelayMs: 0,
      ...over,
    },
  };
}

const parsed = parseQuery("iPhone 13 128 Go Grade A");
const variants = queriesFor(expandQuery(parsed), "adapter_search");

describe("recherche en direct : reformulations (expandQuery → adapter_search)", () => {
  it("au plus 2 reformulations par source, dédupliquées, requête brute à défaut", () => {
    expect(variants.length).toBeGreaterThan(2);
    const v = liveSearchVariants({ rawQuery: "iPhone 13 128 Go Grade A", parsed, variants });
    expect(v.map((x) => x.text)).toEqual(["Apple iPhone 13 128GB Grade A", "iPhone 13 128 Go Grade A"]);
    expect(v[1]!.parsed).toBe(parsed); // la requête brute garde son analyse
    expect(liveSearchVariants({ rawQuery: "x", parsed: parseQuery("x") }).map((x) => x.text)).toEqual(["x"]);
    expect(liveSearchVariants({ rawQuery: "a", parsed: parseQuery("a"), variants: ["A  b", "a b"] }).map((x) => x.text)).toEqual(["A b"]);
  });

  it("interroge chaque reformulation, fusionne sans doublon, robots.txt sur toutes les URLs, rapport des requêtes envoyées", async () => {
    const a = adapter(async (q) => ok(q, q.startsWith("Apple") ? [raw("1"), raw("2")] : [raw("2"), raw("3")]));
    const { rt, stored, robotsUrls } = runtime();
    const s = await executeLiveSearch([candidate(a)], { rawQuery: "iPhone 13 128 Go Grade A", parsed, variants }, rt);
    expect(a.calls).toEqual(["Apple iPhone 13 128GB Grade A", "iPhone 13 128 Go Grade A"]);
    expect(robotsUrls[0]).toHaveLength(2);
    expect(stored.map((o) => o.externalOfferId)).toEqual(["1", "2", "3"]);
    expect(s.sources[0]).toMatchObject({ status: "ok", found: 3, queries: ["Apple iPhone 13 128GB Grade A", "iPhone 13 128 Go Grade A"] });
    expect(s.sources[0]!.requests).toHaveLength(2);
    expect(s.sources[0]!.message).toMatch(/2 reformulations/);
  });

  it("pas d'insistance après un échec de la première reformulation", async () => {
    const a = adapter(async () => ({ offers: [], method: "public_json", requests: [{ url: "u", status: 503, durationMs: 1, offers: 0, error: "HTTP 503" }], error: "HTTP 503", truncated: false }));
    const { rt } = runtime();
    const s = await executeLiveSearch([candidate(a)], { rawQuery: "q", parsed, variants }, rt);
    expect(a.calls).toHaveLength(1);
    expect(s.sources[0]).toMatchObject({ status: "error", message: "HTTP 503" });
  });

  it("un seul budget par source : la 2ᵉ reformulation n'est pas tentée hors budget", async () => {
    const a = adapter(async (q) => {
      await new Promise((r) => setTimeout(r, 120));
      return ok(q, [raw(q)]);
    });
    const { rt } = runtime({ perSourceTimeoutMs: 150 });
    const s = await executeLiveSearch([candidate(a)], { rawQuery: "q", parsed, variants }, rt);
    expect(a.calls).toHaveLength(1);
    expect(s.sources[0]).toMatchObject({ status: "ok", found: 1, queries: ["Apple iPhone 13 128GB Grade A"] });
    expect(s.sources[0]!.message).toMatch(/résultat partiel/);
  });

  it("2ᵉ reformulation en délai dépassé : les offres de la 1ʳᵉ sont conservées", async () => {
    let n = 0;
    const a = adapter(async (q) => {
      n++;
      if (n === 2) await new Promise((r) => setTimeout(r, 900)); // au-delà du budget restant + 500 ms de grâce
      return ok(q, [raw(`v${n}`)]);
    });
    const { rt } = runtime({ perSourceTimeoutMs: 200 });
    const s = await executeLiveSearch([candidate(a)], { rawQuery: "q", parsed, variants }, rt);
    expect(s.sources[0]).toMatchObject({ status: "ok", found: 1 });
    expect(s.sources[0]!.message).toMatch(/interrompue/);
  });
});

describe("banc des recherches de référence sur FIXTURES (aucun réseau)", () => {
  const read = (k: string, f: string) => readFileSync(path.resolve(__dirname, "../fixtures/sourcing", k, f), "utf8");
  const now = new Date("2026-10-08T10:00:00.000Z");

  it("iPhone 13 128 Go Grade A : offres trouvées, accessoire et mauvais stockage écartés, meilleure offre réelle des fixtures", async () => {
    const o = await runTestSearch(TEST_SEARCH_QUERIES[0], fixtureCandidates(), fixtureRuntime(read, () => now), { now });
    expect(o.summary.sources).toHaveLength(6);
    expect(o.summary.sources.every((s) => s.status === "ok")).toBe(true);
    expect(o.summary.sources.every((s) => s.stored === 0)).toBe(true); // rien n'est enregistré
    expect(o.pipeline.rejection.groups.map((g) => g.code)).toEqual(expect.arrayContaining(["accessory", "storage_mismatch"]));
    expect(o.pipeline.filter.kept.length).toBeGreaterThan(0);
    for (const k of o.pipeline.filter.kept) expect(k.offer.model).toBe("iphone 13");
    expect(o.pipeline.ranking.ranked[0]!.offer.unitPrice).not.toBeNull();
  });

  it("iPhone 14 : aucune offre conservée (les fixtures ne contiennent que des iPhone 13 et un Galaxy S23)", async () => {
    const o = await runTestSearch(TEST_SEARCH_QUERIES[2], fixtureCandidates(), fixtureRuntime(read, () => now), { now });
    expect(o.pipeline.ranking.ranked).toHaveLength(0);
    expect(o.pipeline.rejection.groups[0]!.code).toBe("model_mismatch");
  });

  it("rapport : sections réelles et FIXTURES distinctes, « Aucune offre » explicite", async () => {
    const empty = await runTestSearch(TEST_SEARCH_QUERIES[1], [], fixtureRuntime(read, () => now), { now });
    const fx = await runTestSearch(TEST_SEARCH_QUERIES[4], fixtureCandidates(), fixtureRuntime(read, () => now), { now });
    const md = renderTestSearchReport({ generatedAt: now, database: "postgresql://postgres:***@localhost/x", organization: { id: "o", name: "TEST — recherches sourcing", created: false }, liveSourceCount: 0, live: [empty], fixtures: [fx], networkNote: "Aucune requête réseau." });
    expect(md).toContain("## 1. Sources configurées (conditions réelles)");
    expect(md).toContain("## 2. FIXTURES — pas des offres réelles");
    expect(md).toContain("**Aucune offre**");
    expect(md).toContain("Galaxy S23");
    expect(md.indexOf("Aucune offre")).toBeLessThan(md.indexOf("## 2. FIXTURES"));
  });
});
