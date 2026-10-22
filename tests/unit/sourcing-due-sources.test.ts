/**
 * /cron/sourcing (S-03) : budget global vérifié avant chaque source, file équitable et stable sur
 * toutes les organisations (lecture paginée, plus de `.limit(500)` sans ordre), prise en charge
 * avant traitement, alertes évaluées en premier (jamais privées de temps par les sources).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb, type MemoryDb } from "./helpers/memory-db";

let db: MemoryDb;
const clock = { t: 0 };
const crawl = vi.fn();
const fx = vi.fn(async () => ({ date: "2026-10-22", count: 30 }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => db.client }));
vi.mock("@/services/sourcing/crawler/crawler-manager", () => ({ runSourceCrawl: (...a: unknown[]) => crawl(...a) }));
vi.mock("@/services/sourcing/fx-rates", () => ({ refreshFxRates: () => fx(), getFxRate: async () => ({ rate: 1, date: null }) }));

const { orderDueSources, runDueSources, SOURCE_CLAIM_LEASE_MS } = await import("@/services/sourcing/source-sync");
const { runSourcingSync } = await import("@/services/sourcing/sync");

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-22T12:00:00.000Z");

function source(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    organization_id: ORG_A,
    supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: `Source ${id.slice(0, 4)}`,
    source_type: "PUBLIC_WEB",
    base_url: "https://shop.example.test",
    country: "FR",
    config: { urls: ["https://shop.example.test/catalogue"], parser: "jsonld" },
    automated_access_confirmed: true,
    sync_frequency: "daily",
    status: "active",
    last_sync_at: "2026-10-20T00:00:00Z",
    last_successful_sync_at: "2026-10-20T00:00:00Z",
    last_error: null,
    next_run_at: "2026-10-21T00:00:00Z",
    consecutive_failures: 0,
    ...over,
  };
}

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

beforeEach(() => {
  crawl.mockReset();
  clock.t = 0;
  db = memoryDb({ supplier_sources: [], supplier_feeds: [], supplier_connections: [], alerts: [], sourcing_alerts: [], sourcing_import_jobs: [] });
});

describe("S-03 : file équitable et budget global des sources planifiées", () => {
  it("ordre stable : la plus en retard d'abord, à égalité par identifiant", () => {
    const list = [source(id(3), { next_run_at: "2026-10-21T00:00:00Z" }), source(id(1), { next_run_at: "2026-10-21T00:00:00Z" }), source(id(2), { next_run_at: "2026-10-20T00:00:00Z" }), source(id(4), { next_run_at: null, last_sync_at: null })];
    expect(orderDueSources(list as never).map((s) => s.id)).toEqual([id(4), id(2), id(1), id(3)]);
  });

  it("toutes les organisations sont lues (au-delà de 500 sources, pagination stable) ; budget vérifié avant chaque source", async () => {
    // 520 sources échues : avant, `.limit(500)` sans ordre pouvait en écarter n'importe lesquelles
    db.tables.supplier_sources = Array.from({ length: 520 }, (_, i) => source(id(i + 1), { organization_id: i % 2 ? ORG_A : ORG_B, next_run_at: i === 519 ? "2026-10-01T00:00:00Z" : "2026-10-21T00:00:00Z" }));
    crawl.mockImplementation(async () => {
      clock.t += 40_000;
      return { status: "success", message: "ok", runId: "r" };
    });
    const r = await runDueSources({ now: NOW, budgetMs: 100_000, clock: () => clock.t });
    expect(r.due).toBe(520);
    // la plus en retard (la 520e, au-delà de l'ancienne limite) passe en premier
    expect(r.ran[0]!.sourceId).toBe(id(520));
    // 0 s → 40 s → 80 s : il reste 20 s < 30 s, la 3e n'est pas commencée
    expect(r.ran).toHaveLength(2);
    expect(r.deferred).toHaveLength(518);
    // budget propagé au crawl (jamais plus que le temps restant)
    const budgets = crawl.mock.calls.map((c) => (c[1] as { budgetMs: number }).budgetMs);
    expect(budgets[0]).toBe(90_000);
    expect(budgets[1]).toBe(50_000);
  });

  it("prise en charge avant traitement : une fonction coupée pendant une source ne la remet pas en tête de file", async () => {
    db.tables.supplier_sources = [source(id(1), { next_run_at: "2026-10-20T00:00:00Z" }), source(id(2), { next_run_at: "2026-10-21T00:00:00Z" })];
    let seenDuringRun: unknown = null;
    crawl.mockImplementationOnce(async () => {
      seenDuringRun = db.tables.supplier_sources!.find((s) => s.id === id(1))!.next_run_at;
      throw new Error("coupure");
    });
    crawl.mockResolvedValue({ status: "success", message: "ok", runId: "r" });
    await runDueSources({ now: NOW, clock: () => clock.t });
    expect(seenDuringRun).toBe(new Date(NOW.getTime() + SOURCE_CLAIM_LEASE_MS).toISOString());
  });

  it("deux passages simultanés : une source prise en charge par l'un n'est pas relancée par l'autre", async () => {
    db.tables.supplier_sources = [source(id(1))];
    crawl.mockImplementation(async () => {
      // pendant le traitement, un 2e passage démarre
      const other = await runDueSources({ now: NOW, clock: () => clock.t });
      expect(other.ran).toHaveLength(0);
      return { status: "success", message: "ok", runId: "r" };
    });
    const r = await runDueSources({ now: NOW, clock: () => clock.t });
    expect(r.ran).toHaveLength(1);
    expect(crawl).toHaveBeenCalledTimes(1);
  });

  it("alertes évaluées EN PREMIER, même quand les sources épuisent le budget ; phase « alerts » seule possible", async () => {
    db.tables.organizations = [{ id: ORG_A, default_currency: "EUR" }];
    db.tables.sourcing_alerts = [{ id: "al-1", organization_id: ORG_A, is_active: true, query_text: "iphone 13", parsed: {}, criteria: {}, sku_id: null, created_at: "2026-10-01T00:00:00Z", last_checked_at: null, organization_id_ref: null }];
    db.tables.supplier_sources = [source(id(1)), source(id(2))];
    const order: string[] = [];
    crawl.mockImplementation(async () => {
      order.push("source");
      clock.t += 200_000;
      return { status: "success", message: "ok", runId: "r" };
    });
    const summary = await runSourcingSync(NOW, { clock: () => clock.t, admin: db.client as never });
    expect(summary.alerts).toMatchObject({ alerts: 1 });
    expect(db.tables.sourcing_alerts![0]!.last_checked_at).toBe(NOW.toISOString());
    expect(summary.sources).toHaveLength(1);
    expect(summary.deferredSources).toEqual([id(2)]);
    crawl.mockClear();
    const alertsOnly = await runSourcingSync(NOW, { phase: "alerts", clock: () => clock.t, admin: db.client as never });
    expect(alertsOnly.sources).toEqual([]);
    expect(alertsOnly.fx).toBeNull();
    expect(crawl).not.toHaveBeenCalled();
  });
});
