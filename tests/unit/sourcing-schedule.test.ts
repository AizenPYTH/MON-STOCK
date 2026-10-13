import { beforeEach, describe, expect, it, vi } from "vitest";
import { backoffMs, isScheduleDue, nextRunAt, sourceDisplayStatus } from "@/domain/sourcing/schedule";
import { memoryDb, type MemoryDb } from "./helpers/memory-db";

vi.mock("server-only", () => ({}));
let db: MemoryDb;
const crawl = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => db.client }));
vi.mock("@/services/sourcing/crawler/crawler-manager", () => ({ runSourceCrawl: (...a: unknown[]) => crawl(...a) }));

const { recordSourceOutcome } = await import("@/services/sourcing/source-health");
const { listSourcesForOrg, runScheduledSources, setSourceSchedule, syncSourceNow } = await import("@/services/sourcing/source-sync");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const NOW = new Date("2026-10-13T10:00:00.000Z");
const min = 60_000;

describe("planification : reprise progressive", () => {
  it("15 min, 30 min, 1 h… plafonnée à la fréquence et à 24 h", () => {
    expect(backoffMs(1, "daily")).toBe(15 * min);
    expect(backoffMs(2, "daily")).toBe(30 * min);
    expect(backoffMs(4, "daily")).toBe(120 * min);
    expect(backoffMs(9, "daily")).toBe(24 * 60 * min);
    expect(backoffMs(5, "hourly")).toBe(60 * min);
  });
  it("prochain passage : fréquence après un succès, reprise après un échec, rien en manuel", () => {
    expect(nextRunAt("every_6_hours", NOW, { ok: true, consecutiveFailures: 0 })!.toISOString()).toBe("2026-10-13T16:00:00.000Z");
    expect(nextRunAt("every_6_hours", NOW, { ok: false, consecutiveFailures: 1 })!.toISOString()).toBe("2026-10-13T10:15:00.000Z");
    expect(nextRunAt("manual", NOW, { ok: true, consecutiveFailures: 0 })).toBeNull();
  });
  it("échéance : next_run_at prioritaire, sinon dernière synchro + fréquence ; pause et manuel jamais", () => {
    expect(isScheduleDue({ sync_frequency: "daily", status: "active", next_run_at: "2026-10-13T09:59:00Z", last_sync_at: null }, NOW)).toBe(true);
    expect(isScheduleDue({ sync_frequency: "daily", status: "active", next_run_at: "2026-10-13T10:30:00Z", last_sync_at: "2026-10-01T00:00:00Z" }, NOW)).toBe(false);
    expect(isScheduleDue({ sync_frequency: "daily", status: "active", next_run_at: null, last_sync_at: "2026-10-12T09:00:00Z" }, NOW)).toBe(true);
    expect(isScheduleDue({ sync_frequency: "daily", status: "paused", next_run_at: null, last_sync_at: null }, NOW)).toBe(false);
    expect(isScheduleDue({ sync_frequency: "manual", status: "active", next_run_at: null, last_sync_at: null }, NOW)).toBe(false);
  });
  it("statut affiché : enregistré ≠ connecté", () => {
    const base = { status: "active", running: false, consecutiveFailures: 0, attested: true };
    expect(sourceDisplayStatus({ ...base, kind: "public_web", lastSuccessfulSyncAt: null })).toBe("to_configure");
    expect(sourceDisplayStatus({ ...base, kind: "public_web", lastSuccessfulSyncAt: "2026-10-12T00:00:00Z" })).toBe("connected");
    expect(sourceDisplayStatus({ ...base, kind: "file_import", lastSuccessfulSyncAt: "2026-10-12T00:00:00Z" })).toBe("manual_import");
    expect(sourceDisplayStatus({ ...base, kind: "remote_feed", lastSuccessfulSyncAt: "x", consecutiveFailures: 3 })).toBe("error");
    expect(sourceDisplayStatus({ ...base, kind: "public_web", lastSuccessfulSyncAt: "x", running: true })).toBe("running");
    expect(sourceDisplayStatus({ ...base, kind: "public_web", lastSuccessfulSyncAt: "x", status: "paused" })).toBe("disabled");
    expect(sourceDisplayStatus({ ...base, kind: "public_web", lastSuccessfulSyncAt: null, attested: false })).toBe("to_configure");
  });
});

function source(over: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organization_id: ORG,
    supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Refreshed Apples — pages catalogue",
    source_type: "PUBLIC_WEB",
    base_url: "https://www.refreshedapples.com",
    country: "NL",
    // page publique PARCOURABLE : URLs de catalogue configurées
    config: { urls: ["https://www.refreshedapples.com/collections/iphone"], parser: "jsonld" },
    automated_access_confirmed: true,
    sync_frequency: "daily",
    status: "active",
    last_sync_at: "2026-10-10T00:00:00Z",
    last_successful_sync_at: "2026-10-10T00:00:00Z",
    last_error: null,
    next_run_at: null,
    consecutive_failures: 0,
    ...over,
  };
}

const ctx = (org = ORG) => ({ supabase: db.client, user: { id: "u1" }, organization: { id: org, default_currency: "EUR" }, role: "owner" }) as never;

beforeEach(() => {
  crawl.mockReset();
  db = memoryDb({ supplier_sources: [source()], suppliers: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", organization_id: ORG, name: "Refreshed Apples", country: "NL" }], alerts: [] });
});

describe("santé des sources : échecs, alerte, rétablissement", () => {
  it("3 échecs : source en erreur et alerte unique ; au succès, compteur remis à zéro et alerte résolue", async () => {
    for (let i = 0; i < 4; i++) {
      const s = db.tables.supplier_sources![0]!;
      await recordSourceOutcome(db.client, { sourceId: s.id as string, organizationId: ORG, sourceName: s.name as string, frequency: "daily", previousFailures: s.consecutive_failures as number, ok: false, error: "HTTP 503", now: NOW });
    }
    const s = db.tables.supplier_sources![0]!;
    expect(s).toMatchObject({ consecutive_failures: 4, status: "error", next_run_at: "2026-10-13T12:00:00.000Z" });
    expect(db.tables.alerts).toHaveLength(1);
    expect(db.tables.alerts![0]).toMatchObject({ type: "sync_failed", status: "open", dedupe_key: `sourcing_sync_failed:${s.id}` });
    expect(String(db.tables.alerts![0]!.message)).toMatch(/4 échecs consécutifs.*HTTP 503.*Les offres déjà connues sont conservées/);
    await recordSourceOutcome(db.client, { sourceId: s.id as string, organizationId: ORG, sourceName: "x", frequency: "daily", previousFailures: 4, ok: true, now: NOW });
    expect(db.tables.supplier_sources![0]).toMatchObject({ consecutive_failures: 0, next_run_at: "2026-10-14T10:00:00.000Z" });
    expect(db.tables.alerts![0]!.status).toBe("resolved");
  });
});

describe("synchronisation d'une source", () => {
  it("plan du site + JSON-LD : catalogue parcourable, donc collecte planifiable (cas réel de production Brico-phone)", async () => {
    db.tables.supplier_sources = [source({ config: { adapter: "sitemap-jsonld", library_key: "brico-phone" }, sync_frequency: "manual" })];
    const [dto] = await listSourcesForOrg(ctx(), db.client);
    expect(dto).toMatchObject({ kind: "public_web", schedulable: true });
  });

  it("source interrogée en direct (adaptateur sans catalogue, ex. eBay) : jamais planifiée, jamais comptée en échec", async () => {
    const live = source({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "eBay — recherche en direct", config: { adapter: "ebay-browse", library_key: "ebay-fr" }, sync_frequency: "daily", next_run_at: "2026-10-13T09:00:00Z" });
    db.tables.supplier_sources = [live];
    expect(await runScheduledSources(NOW, db.client)).toEqual([]);
    expect(crawl).not.toHaveBeenCalled();
    expect(db.tables.supplier_sources![0]).toMatchObject({ consecutive_failures: 0, last_error: null });
    await expect(syncSourceNow(ctx(), live.id, db.client, NOW)).rejects.toMatchObject({ code: "VALIDATION", message: expect.stringMatching(/en direct/) });
    await expect(setSourceSchedule(ctx(), { sourceId: live.id, frequency: "daily" }, db.client, NOW)).rejects.toMatchObject({ code: "VALIDATION" });
    const [dto] = await listSourcesForOrg(ctx(), db.client);
    expect(dto).toMatchObject({ kind: "live_search", methodLabel: "Recherche en direct (page publique)", schedulable: false, canSyncNow: false, primaryAction: "configure" });
  });

  it("planifiée : un échec n'efface aucune offre, reprise dans 15 min ; une synchro déjà en cours n'est pas un échec", async () => {
    db.tables.sourcing_offers = [{ id: "o1", organization_id: ORG, source_id: source().id, status: "active", available_quantity: 7 }];
    crawl.mockResolvedValueOnce({ status: "failed", message: "Délai dépassé", runId: "r1" });
    const r = await runScheduledSources(NOW, db.client);
    expect(r).toEqual([{ sourceId: source().id, status: "failed", message: "Délai dépassé" }]);
    expect(db.tables.supplier_sources![0]).toMatchObject({ consecutive_failures: 1, next_run_at: "2026-10-13T10:15:00.000Z" });
    expect(db.tables.sourcing_offers![0]).toMatchObject({ status: "active", available_quantity: 7 });
    // pas encore échue : rien ne tourne
    expect(await runScheduledSources(new Date("2026-10-13T10:10:00Z"), db.client)).toEqual([]);
    crawl.mockRejectedValueOnce(new Error("Une synchronisation est déjà en cours pour cette source."));
    await runScheduledSources(new Date("2026-10-13T10:20:00Z"), db.client);
    expect(db.tables.supplier_sources![0]!.consecutive_failures).toBe(1);
  });

  it("maintenant : délai anti-abus, source par fichier refusée, autre organisation introuvable", async () => {
    crawl.mockResolvedValue({ status: "success", message: "12 offres", runId: "r2" });
    const ok = await syncSourceNow(ctx(), source().id, db.client, NOW);
    expect(ok).toMatchObject({ status: "success", consecutiveFailures: 0, nextRunAt: "2026-10-14T10:00:00.000Z" });
    db.tables.supplier_sources![0]!.last_sync_at = new Date(NOW.getTime() - 30_000).toISOString();
    await expect(syncSourceNow(ctx(), source().id, db.client, NOW)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    db.tables.supplier_sources!.push(source({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", source_type: "CSV", config: { kind: "catalog_file_import" }, sync_frequency: "manual", last_sync_at: null }));
    await expect(syncSourceNow(ctx(), "cccccccc-cccc-4ccc-8ccc-cccccccccccc", db.client, NOW)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(syncSourceNow(ctx(OTHER), source().id, db.client, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("liste : statut, offres exploitables (actives seulement), fréquence ; planification refusée pour un fichier", async () => {
    db.tables.sourcing_offers = [
      { id: "o1", organization_id: ORG, source_id: source().id, status: "active" },
      { id: "o2", organization_id: ORG, source_id: source().id, status: "expired" },
    ];
    db.tables.supplier_sources!.push(source({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Import de catalogue — Foxway", source_type: "CSV", config: { kind: "catalog_file_import" }, sync_frequency: "manual" }));
    const list = await listSourcesForOrg(ctx(), db.client);
    const web = list.find((s) => s.kind === "public_web")!;
    expect(web).toMatchObject({ status: "connected", statusLabel: "Connecté", activeOffers: 1, frequencyLabel: "Une fois par jour", canSyncNow: true, primaryAction: "sync_now", supplierName: "Refreshed Apples" });
    expect(list.find((s) => s.kind === "file_import")).toMatchObject({ status: "manual_import", primaryAction: "import_file", schedulable: false });
    await expect(setSourceSchedule(ctx(), { sourceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", frequency: "daily" }, db.client, NOW)).rejects.toMatchObject({ code: "VALIDATION" });
    const paused = await setSourceSchedule(ctx(), { sourceId: source().id, enabled: false }, db.client, NOW);
    expect(paused).toMatchObject({ status: "disabled", primaryAction: "enable", canSyncNow: false });
    expect(await runScheduledSources(new Date("2026-10-20T00:00:00Z"), db.client)).toEqual([]);
  });
});
