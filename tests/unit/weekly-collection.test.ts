import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb, type MemoryDb } from "./helpers/memory-db";
import { defaultSlot, endOfCatalogResult, EMPTY_CURSOR, slotStart, weeklyDecision, WEEKLY_MAX_ATTEMPTS, type WeeklySourceState } from "@/domain/sourcing/weekly-schedule";
import type { AdapterCatalogPage, SourceAdapter } from "@/integrations/sourcing/core";
import type { RawOffer } from "@/domain/sourcing/types";

/** Tests SIMULÉS (base en mémoire, catalogue factice) : comportement de la collecte, pas un fournisseur réel. */
vi.mock("server-only", () => ({}));
let db: MemoryDb;
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => db.client }));

// catalogue factice : pages programmables
let pages: Array<AdapterCatalogPage | Error> = [];
const fetchCatalog = vi.fn(async (_c: unknown, cursor: string | null) => {
  const i = cursor === null ? 0 : Number(cursor);
  clock += PAGE_COST_MS;
  const p = pages[i];
  if (!p) throw new Error(`page ${i} absente`);
  if (p instanceof Error) throw p;
  return p;
});
const fakeAdapter = { key: "fake-catalog", access: "public", capabilities: { search: false, catalog: true, stockQuantity: false }, fetchCatalog, urlsForCatalog: () => ["https://shop.example.com/catalog"] } as unknown as SourceAdapter;
vi.mock("@/integrations/sourcing/registry", () => ({ getSourceAdapter: (k: string) => (k === "fake-catalog" ? fakeAdapter : null) }));
vi.mock("@/services/sourcing/crawler/robots", () => ({ checkRobotsForUrls: async () => robotsAnswer }));
let robotsAnswer = { allowed: true, details: "ok", crawlDelay: null as number | null, disallowedUrls: [] as string[] };

// enregistrement idempotent simulé : clé (source, identifiant externe), comme la contrainte unique SQL
const stored = new Map<string, { price: number | null; lastSeen: string; stock: string }>();
vi.mock("@/services/sourcing/offer-storage", () => ({
  storeOffer: async (ctx: { sourceId: string; now: Date }, o: RawOffer) => {
    stored.set(`${ctx.sourceId}|${o.externalOfferId}`, { price: o.price, lastSeen: ctx.now.toISOString(), stock: o.stockStatus ?? "unknown" });
    return { outcome: "stored" };
  },
}));
const outcomes: { ok: boolean }[] = [];
vi.mock("@/services/sourcing/source-health", () => ({ recordSourceOutcome: async (_a: unknown, i: { ok: boolean }) => (outcomes.push(i), { consecutiveFailures: 0, nextRunAt: null }) }));

const { runWeeklyCollection } = await import("@/services/sourcing/weekly-collection");

const PAGE_COST_MS = 80_000; // une page « coûte » 80 s : une seule page par passage de 100 s
let clock = 0;
const SRC = "22222222-2222-4222-8222-222222222222";
const ORG = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-14T03:00:00.000Z"); // mercredi

const offer = (id: string, price = 10): RawOffer => ({ externalOfferId: id, title: `Produit ${id}`, price, currency: "EUR", stockStatus: "unknown" }) as RawOffer;
const page = (ids: string[], next: string | null, extra: Partial<AdapterCatalogPage> = {}): AdapterCatalogPage => ({ offers: ids.map((i) => offer(i)), method: "public_json", requests: [{ url: "https://shop.example.com/p", status: 200, durationMs: 1, offers: ids.length, error: null }], nextCursor: next, ...extra }) as AdapterCatalogPage;

function source(over: Record<string, unknown> = {}) {
  return {
    id: SRC,
    organization_id: ORG,
    supplier_id: "33333333-3333-4333-8333-333333333333",
    name: "Boutique test",
    source_type: "PUBLIC_WEB",
    base_url: "https://shop.example.com",
    country: "FR",
    config: { adapter: "fake-catalog" },
    default_currency: "EUR",
    default_tax_type: "unknown",
    automated_access_confirmed: true,
    sync_frequency: "weekly",
    status: "active",
    crawl_delay_seconds: null,
    consecutive_failures: 0,
    last_successful_sync_at: null,
    schedule_weekday: 3,
    schedule_hour_utc: 2,
    collect_cursor: null,
    collection_started_at: null,
    last_full_collection_at: null,
    last_collection_stats: {},
    organization_id_ref: null,
    ...over,
  };
}

let closeCalls: { p_source_id: string; p_started_at: string }[] = [];
function setup(src: Record<string, unknown>, extra: Record<string, unknown[]> = {}) {
  db = memoryDb({ supplier_sources: [src], organizations: [{ id: ORG, default_currency: "EUR" }], sync_runs: [], sync_errors: [], ...extra } as never, { sync_runs: [["source_ref", "status"]] });
  // la clôture SQL est vérifiée sur PostgreSQL ; ici on vérifie QUAND elle est appelée
  (db.client as unknown as { rpc: unknown }).rpc = async (name: string, args: { p_source_id: string; p_started_at: string }) => {
    expect(name).toBe("sourcing_close_full_collection");
    closeCalls.push(args);
    const row = db.tables.supplier_sources!.find((r) => r.id === args.p_source_id)!;
    Object.assign(row, { collection_started_at: null, collect_cursor: null, last_full_collection_at: NOW.toISOString() });
    return { data: [{ seen: stored.size, missed: 0, expired: 0 }], error: null };
  };
}
const run = (input: Parameters<typeof runWeeklyCollection>[0] = {}) => runWeeklyCollection(input, { now: () => NOW, clock: () => clock, sleep: async () => undefined, fetchImpl: (async () => new Response("")) as unknown as typeof fetch });
const row = () => db.tables.supplier_sources![0]!;

beforeEach(() => {
  clock = 0;
  pages = [];
  stored.clear();
  closeCalls = [];
  outcomes.length = 0;
  fetchCatalog.mockClear();
  robotsAnswer = { allowed: true, details: "ok", crawlDelay: null, disallowedUrls: [] };
});

describe("calendrier hebdomadaire", () => {
  const base: WeeklySourceState = { id: SRC, status: "active", sync_frequency: "weekly", schedule_weekday: 3, schedule_hour_utc: 2, collection_started_at: null, last_full_collection_at: null, last_collection_stats: {} };
  it("créneau : dernier mercredi 02:00 UTC atteint", () => {
    expect(slotStart(NOW, 3, 2).toISOString()).toBe("2026-10-14T02:00:00.000Z");
    expect(slotStart(new Date("2026-10-14T01:59:00Z"), 3, 2).toISOString()).toBe("2026-10-07T02:00:00.000Z");
    expect(slotStart(new Date("2026-10-19T00:00:00Z"), 1, 0).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    const d = defaultSlot(SRC);
    expect(d.weekday).toBeGreaterThanOrEqual(1);
    expect(d.weekday).toBeLessThanOrEqual(7);
    expect(d.hour).toBeGreaterThanOrEqual(1);
    expect(d.hour).toBeLessThanOrEqual(5);
  });
  it("démarre au créneau, une seule fois par semaine ; jamais avant le créneau", () => {
    expect(weeklyDecision(base, NOW)).toEqual({ action: "start", slot: "2026-10-14T02:00:00.000Z", attempt: 1 });
    expect(weeklyDecision({ ...base, last_full_collection_at: "2026-10-14T02:30:00Z" }, NOW).action).toBe("wait");
    expect(weeklyDecision({ ...base, last_collection_stats: { slot: "2026-10-14T02:00:00.000Z", attempts: 1, result: "incomplete" } }, NOW).action).toBe("wait");
    // la semaine précédente ne compte pas pour celle-ci
    expect(weeklyDecision({ ...base, last_full_collection_at: "2026-10-07T03:00:00Z" }, NOW).action).toBe("start");
  });
  it("collecte en cours : toujours poursuivie ; source en pause ou non hebdomadaire : jamais", () => {
    expect(weeklyDecision({ ...base, collection_started_at: "2026-10-14T02:00:00Z" }, NOW)).toEqual({ action: "continue" });
    expect(weeklyDecision({ ...base, status: "paused" }, NOW).action).toBe("wait");
    expect(weeklyDecision({ ...base, sync_frequency: "daily" }, NOW).action).toBe("wait");
  });
  it("collecte abandonnée : au plus 3 essais par créneau, 1 h d'attente entre deux", () => {
    const failed = (attempts: number, finishedAt: string) => ({ ...base, last_collection_stats: { slot: "2026-10-14T02:00:00.000Z", attempts, result: "failed", finishedAt } });
    expect(weeklyDecision(failed(1, "2026-10-14T02:30:00Z"), NOW).action).toBe("wait");
    expect(weeklyDecision(failed(1, "2026-10-14T01:59:00Z"), NOW)).toEqual({ action: "start", slot: "2026-10-14T02:00:00.000Z", attempt: 2 });
    expect(weeklyDecision(failed(WEEKLY_MAX_ATTEMPTS, "2026-10-14T00:00:00Z"), NOW).action).toBe("wait");
  });
  it("fin de catalogue : complète seulement sans erreur, catalogue entier, au moins une offre, pas d'effondrement", () => {
    expect(endOfCatalogResult({ ...EMPTY_CURSOR, stored: 10 }).result).toBe("complete");
    expect(endOfCatalogResult({ ...EMPTY_CURSOR, stored: 10, requestErrors: 1 }).result).toBe("incomplete");
    expect(endOfCatalogResult({ ...EMPTY_CURSOR, stored: 10, incomplete: "plan du site tronqué" }).result).toBe("incomplete");
    expect(endOfCatalogResult({ ...EMPTY_CURSOR, stored: 0 }).result).toBe("incomplete");
    expect(endOfCatalogResult({ ...EMPTY_CURSOR, stored: 40 }, 100).result).toBe("incomplete");
    expect(endOfCatalogResult({ ...EMPTY_CURSOR, stored: 60 }, 100).result).toBe("complete");
  });
});

describe("collecte par tranches", () => {
  it("reprise au curseur sur plusieurs passages, puis clôture d'une collecte COMPLÈTE", async () => {
    setup(source());
    pages = [page(["a", "b"], "1"), page(["c"], "2"), page(["d"], null)];
    const p1 = await run();
    expect(p1.passes[0]).toMatchObject({ action: "started", result: "running", pagesThisPass: 1 });
    expect(row().collect_cursor).toMatchObject({ cursor: "1", stored: 2 });
    const startedAt = row().collection_started_at as string;
    expect(startedAt).toBe(NOW.toISOString());
    expect(closeCalls).toEqual([]);
    await run();
    expect(row().collect_cursor).toMatchObject({ cursor: "2", stored: 3 });
    const p3 = await run();
    expect(p3.passes[0]).toMatchObject({ action: "continued", result: "complete" });
    expect(closeCalls).toEqual([{ p_source_id: SRC, p_started_at: startedAt }]);
    expect(row()).toMatchObject({ collection_started_at: null, collect_cursor: null });
    expect(row().last_collection_stats).toMatchObject({ result: "complete", stored: 4, slot: "2026-10-14T02:00:00.000Z" });
    // créneau honoré : rien de plus cette semaine
    const p4 = await run();
    expect(p4.passes).toEqual([]);
  });

  it("idempotente : relancer la même collecte ne crée aucun doublon", async () => {
    setup(source());
    pages = [page(["a", "b"], "1"), page(["b", "c"], null)];
    await run({ force: true });
    await run({ force: true });
    await run({ force: true });
    await run({ force: true });
    expect([...stored.keys()].sort()).toEqual([`${SRC}|a`, `${SRC}|b`, `${SRC}|c`]);
  });

  it("interrompue (page en erreur) : jamais clôturée, reprise au même curseur ; 3 échecs d'affilée → abandon sans toucher aux offres", async () => {
    setup(source());
    pages = [page(["a"], "1"), new Error("HTTP 503"), page(["b"], null)];
    await run();
    await run(); // page 1 en erreur
    expect(row().collect_cursor).toMatchObject({ cursor: "1", consecutiveFailures: 1 });
    expect(closeCalls).toEqual([]);
    pages[1] = new Error("HTTP 503");
    await run();
    await run();
    expect(closeCalls).toEqual([]);
    expect(row()).toMatchObject({ collection_started_at: null, collect_cursor: null });
    expect(row().last_collection_stats).toMatchObject({ result: "failed" });
    expect(outcomes.at(-1)).toMatchObject({ ok: false });
    expect(stored.size).toBe(1); // l'offre déjà lue reste en place
  });

  it("une erreur de page, même rattrapée, rend la collecte incomplète : aucune clôture", async () => {
    setup(source());
    pages = [page(["a"], "1"), new Error("délai dépassé"), page(["b"], null)];
    await run();
    await run();
    pages[1] = page(["b"], null);
    const end = await run();
    expect(end.passes[0]).toMatchObject({ result: "incomplete" });
    expect(closeCalls).toEqual([]);
    expect(row().last_collection_stats).toMatchObject({ result: "incomplete" });
  });

  it("catalogue signalé incomplet (plan du site tronqué) : terminée mais non complète", async () => {
    setup(source());
    pages = [page(["a"], null, { incomplete: "plan du site tronqué" })];
    const r = await run();
    expect(r.passes[0]).toMatchObject({ result: "incomplete" });
    expect(closeCalls).toEqual([]);
  });

  it("verrou : un passage déjà en cours sur la source → aucun second passage", async () => {
    setup(source(), { sync_runs: [{ id: "r1", source_ref: SRC, status: "running", started_at: new Date().toISOString() }] });
    pages = [page(["a"], null)];
    const r = await run();
    expect(r.passes[0]).toMatchObject({ action: "skipped", result: "locked" });
    expect(fetchCatalog).not.toHaveBeenCalled();
  });

  it("robots.txt interdit : refus, aucune page lue, aucune clôture", async () => {
    setup(source());
    robotsAnswer = { allowed: false, details: "Disallow: /", crawlDelay: null, disallowedUrls: ["https://shop.example.com/catalog"] };
    pages = [page(["a"], null)];
    const r = await run();
    expect(r.passes[0]).toMatchObject({ result: "refused" });
    expect(fetchCatalog).not.toHaveBeenCalled();
    expect(closeCalls).toEqual([]);
  });

  it("source non hebdomadaire ou non attestée : jamais collectée sans demande explicite", async () => {
    setup(source({ sync_frequency: "manual" }));
    pages = [page(["a"], null)];
    expect((await run()).passes).toEqual([]);
    expect((await run({ force: true, sourceIds: [SRC] })).passes).toHaveLength(1);
    setup(source({ automated_access_confirmed: false }));
    expect((await run({ force: true })).passes).toEqual([]);
  });
});
