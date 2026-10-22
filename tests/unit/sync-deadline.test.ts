/**
 * Synchronisation bornée et reprenable (audit 2026-10-22 : D-01, S-05, I-03, I-01, I-10, I-20, S-06) :
 * échéance propagée aux appels HTTP, import des commandes interrompu proprement, commandes illisibles
 * qui bloquent le curseur, envoi des quantités conditionné à un import complet, échange du code OAuth
 * jamais rejoué, cron unique pour l'Edge Function et la route web. Aucun réseau, aucune base.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "@/integrations/core/http";
import { ConnectorError } from "@/integrations/core/errors";
import { DeadlineExceededError, isDeadlineExceeded, MIN_CALL_REMAINING_MS } from "@/integrations/core/deadline";
import type { GetOrdersParams, OrdersPage } from "@/integrations/core/connector";
import type { NormalizedOrder } from "@/integrations/core/types";
import { createEbayConfig } from "@/integrations/ebay/config";
import { exchangeAuthorizationCode, refreshAccessToken, TOKEN_REQUEST_RETRIES } from "@/integrations/ebay/oauth";
import { rawModifiedAt } from "@/integrations/ebay/fulfillment";
import { resolveOrdersCursor, type OrdersWindow } from "@/integrations/ebay/cursor";
import type { SyncContext, SyncErrorInput } from "@/services/sync/context";
import { emptyOrdersResult, ORDERS_PAGE_MIN_REMAINING_MS, syncOrders, type OrdersPhaseResult } from "@/services/sync/orders";
import { BUDGET_REACHED_MESSAGE, DEFAULT_SYNC_RUN_BUDGET_MS, MAX_SYNC_RUN_BUDGET_MS, pushBlockers, RUNNING_STALE_MINUTES, syncRunBudgetMs } from "@/services/sync/engine";
import { CRON_MIN_RUN_START_MS, EDGE_CRON_SYNC_BUDGET_MS, runSyncCron, type CronSyncDeps } from "@/services/sync/cron";
import type { SyncRunResult } from "@/services/sync/engine";
import { oauthErrorCodeFor, OAUTH_ERROR_MESSAGES } from "@/features/integrations/oauth-flow";
import { AppError } from "@/lib/errors";

const config = createEbayConfig({ EBAY_ENV: "production", EBAY_CLIENT_ID: "app", EBAY_CLIENT_SECRET: "cert", EBAY_RU_NAME: "ru" });
const HOUR = 3_600_000;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchWithRetry : échéance du traitement appelant", () => {
  it("échéance déjà (presque) atteinte : aucun appel lancé, DeadlineExceededError (pas une panne eBay)", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const err = await fetchWithRetry("https://api.ebay.com/x", {}, { provider: "ebay", deadline: Date.now() + MIN_CALL_REMAINING_MS - 100 }).catch((e: unknown) => e);
    expect(isDeadlineExceeded(err)).toBe(true);
    expect(err).not.toBeInstanceOf(ConnectorError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("délai de la tentative réduit au temps restant ; coupure par l'échéance → DeadlineExceededError, sans nouvelle tentative", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? Object.assign(new Error("aborted"), { name: "AbortError" })))));
    vi.stubGlobal("fetch", fetchMock);
    const started = Date.now();
    const err = await fetchWithRetry("https://api.ebay.com/x", {}, { provider: "ebay", timeoutMs: 30_000, retries: 3, deadline: Date.now() + 1_700 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DeadlineExceededError);
    expect(Date.now() - started).toBeLessThan(5_000); // jamais les 30 s du délai normal
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("erreur eBay temporaire (503) puis succès : réessai tant que l'attente tient avant l'échéance", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("down", { status: 503 })).mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const p = fetchWithRetry("https://api.ebay.com/x", {}, { provider: "ebay", retries: 3, deadline: Date.now() + 60_000 });
    await vi.runAllTimersAsync();
    expect((await p).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("503 avec Retry-After qui dépasserait l'échéance : pas d'attente ni de nouvelle tentative, API_ERROR (1 appel)", async () => {
    const fetchMock = vi.fn(async () => new Response("down", { status: 503, headers: { "retry-after": "20" } }));
    vi.stubGlobal("fetch", fetchMock);
    const started = Date.now();
    const err = (await fetchWithRetry("https://api.ebay.com/x", {}, { provider: "ebay", retries: 3, deadline: Date.now() + 10_000 }).catch((e: unknown) => e)) as ConnectorError;
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.code).toBe("API_ERROR");
    expect(err.details).toMatchObject({ attempts: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("erreur réseau répétée près de l'échéance : la boucle s'arrête (pas de tentative sans attente)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fetchMock);
    const err = (await fetchWithRetry("https://api.ebay.com/x", {}, { provider: "ebay", retries: 3, deadline: Date.now() + MIN_CALL_REMAINING_MS + 200 }).catch((e: unknown) => e)) as ConnectorError;
    expect(err.code).toBe("API_ERROR");
    expect(err.details).toMatchObject({ attempts: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("I-20 : échange du code OAuth jamais rejoué", () => {
  it("5xx pendant l'échange du code : UN seul POST (code à usage unique) ; le rafraîchissement, lui, réessaie", async () => {
    vi.useFakeTimers();
    expect(TOKEN_REQUEST_RETRIES.exchangeCode).toBe(0);
    const exchangeFetch = vi.fn(async () => new Response("oops", { status: 502 }));
    vi.stubGlobal("fetch", exchangeFetch);
    const pe = exchangeAuthorizationCode(config, "v^1.1#code").catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(((await pe) as ConnectorError).code).toBe("API_ERROR");
    expect(exchangeFetch).toHaveBeenCalledTimes(1);

    const refreshFetch = vi.fn(async () => new Response("oops", { status: 502 }));
    vi.stubGlobal("fetch", refreshFetch);
    const pr = refreshAccessToken(config, "v^1.1#refresh").catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(((await pr) as ConnectorError).code).toBe("API_ERROR");
    expect(refreshFetch).toHaveBeenCalledTimes(TOKEN_REQUEST_RETRIES.other + 1);
  });
});

describe("D-04 : compte déjà relié à une autre organisation", () => {
  it("le conflit métier est traduit en code OAuth dédié (message en français, sans nom d'organisation)", () => {
    const e = new AppError("CONFLICT", "déjà relié", { details: { reason: "ACCOUNT_LINKED_ELSEWHERE" } });
    expect(oauthErrorCodeFor(e)).toBe("account_in_use");
    expect(OAUTH_ERROR_MESSAGES.account_in_use).toMatch(/déjà relié à une autre organisation/);
    expect(oauthErrorCodeFor(new AppError("CONFLICT", "autre conflit"))).toBe("internal");
  });
});

// ---------------------------------------------------------------------------------------------
// Import des commandes : échéance et commandes illisibles
// ---------------------------------------------------------------------------------------------

const UNTIL = new Date("2026-10-08T00:00:00.000Z");
const windowOf = (hours: number): OrdersWindow => ({ since: new Date(UNTIL.getTime() - hours * HOUR), until: UNTIL, initial: false });

function order(id: string, modified: string): NormalizedOrder {
  return {
    externalOrderId: id,
    orderNumber: id,
    status: "paid",
    paymentStatus: "PAID",
    fulfillmentStatus: "NOT_STARTED",
    cancelStatus: null,
    buyerUsername: "acheteur",
    currency: "EUR",
    subtotal: 10,
    shippingTotal: 0,
    taxTotal: 0,
    feeTotal: 1,
    total: 10,
    placedAt: modified,
    externalModifiedAt: modified,
    payloadHash: `hash-${id}`,
    items: [],
  };
}

function harness(script: (params: GetOrdersParams) => OrdersPage[], clock: { now: number; deadlineAt: number | null; onIngest?: (orderId: string) => void }) {
  const errors: SyncErrorInput[] = [];
  const ingested: string[] = [];
  const params: GetOrdersParams[] = [];
  const ctx = {
    admin: {
      rpc: async (_n: string, args: { p_order: { external_order_id: string } }) => {
        ingested.push(args.p_order.external_order_id);
        clock.onIngest?.(args.p_order.external_order_id);
        return { data: { order_id: `uuid-${args.p_order.external_order_id}`, created: true, items_unmapped: 0, movements: 1 }, error: null };
      },
    },
    connection: { id: "conn-1", provider: "ebay" },
    organizationId: "org-1",
    salesChannelId: "ch-1",
    connector: {
      getOrders(_a: unknown, p: GetOrdersParams) {
        params.push(p);
        const list = script(p);
        return (async function* () {
          for (const page of list) yield page;
        })();
      },
    },
    auth: { getAccessToken: async () => "t" },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    recordError: (e: SyncErrorInput) => errors.push(e),
    deadlineAt: clock.deadlineAt,
    clock: () => clock.now,
  } as unknown as SyncContext;
  return { ctx, errors, ingested, params };
}

describe("syncOrders : échéance du run", () => {
  it("l'échéance est transmise au connecteur ; arrêt propre entre deux pages, tranche NON confirmée, progression confirmée intacte", async () => {
    const clock = {
      now: 0,
      deadlineAt: 60_000 as number | null,
      // Pendant l'ingestion de B (1re page de la tranche 2) : il ne reste plus le temps de lire une page.
      onIngest: (id: string) => {
        if (id === "B") clock.now = 60_000 - ORDERS_PAGE_MIN_REMAINING_MS + 1;
      },
    };
    const h = harness(
      (p) => {
        // Tranche 1 (24 h) : une page complète ; tranche 2 : deux pages, l'échéance tombe après la première.
        const first = p.since.getTime() === UNTIL.getTime() - 48 * HOUR;
        return first ? [{ orders: [order("A", "2026-10-06T10:00:00.000Z")], invalid: [], truncated: false, hasMore: false }] : [{ orders: [order("B", "2026-10-07T10:00:00.000Z")], invalid: [], truncated: false, hasMore: true }, { orders: [order("C", "2026-10-07T11:00:00.000Z")], invalid: [], truncated: false, hasMore: false }];
      },
      clock,
    );
    const confirmed: Array<Date | null> = [];
    const w = windowOf(48);
    const r = await syncOrders(h.ctx, w, emptyOrdersResult(), { sliceHours: 24, onSliceComplete: async (pr) => void confirmed.push(pr.completedUntil) });
    expect(h.params.every((p) => p.deadline === 60_000)).toBe(true);
    expect(r.stoppedByDeadline).toBe(true);
    expect(r.truncated).toBe(false);
    expect(r.windowComplete).toBe(false);
    expect(r.slicesCompleted).toBe(1);
    // Progression enregistrée après la tranche 1 seulement (avant d'ouvrir la tranche 2).
    expect(confirmed).toEqual([new Date(UNTIL.getTime() - 24 * HOUR)]);
    expect(resolveOrdersCursor(w, r, null)).toEqual(new Date(UNTIL.getTime() - 24 * HOUR));
    expect(h.ingested).toEqual(["A", "B"]); // C jamais lue : relue au passage suivant
    expect(h.errors.filter((e) => e.code === "ORDERS_TRUNCATED")).toEqual([]);
  });

  it("appel coupé par l'échéance (DeadlineExceededError du connecteur) : arrêt propre, pas une erreur eBay", async () => {
    const clock = { now: 0, deadlineAt: 100_000 as number | null };
    const ctxH = harness(() => [], clock);
    (ctxH.ctx.connector as unknown as { getOrders: () => AsyncIterable<OrdersPage> }).getOrders = () =>
      (async function* () {
        throw new DeadlineExceededError("fulfillment:getOrders");
      })();
    const r = await syncOrders(ctxH.ctx, windowOf(24), emptyOrdersResult(), { sliceHours: 24 });
    expect(r.stoppedByDeadline).toBe(true);
    expect(r.completedUntil).toBeNull();
    expect(ctxH.errors).toEqual([]);
  });
});

describe("I-10 : commande au format inattendu", () => {
  it("bloque le curseur à sa date de modification (si lisible) ; sinon au début de la tranche ; signalée", async () => {
    const clock = { now: 0, deadlineAt: null };
    const h = harness(
      (p) => {
        const first = p.since.getTime() === UNTIL.getTime() - 48 * HOUR;
        return first
          ? [{ orders: [order("OK-1", "2026-10-06T05:00:00.000Z")], invalid: [{ ref: "BAD-1", message: "Commande eBay BAD-1 au format inattendu.", modifiedAt: "2026-10-06T08:00:00.000Z" }], truncated: false, hasMore: false }]
          : [{ orders: [order("OK-2", "2026-10-07T10:00:00.000Z")], invalid: [], truncated: false, hasMore: false }];
      },
      clock,
    );
    const w = windowOf(48);
    const r = await syncOrders(h.ctx, w, emptyOrdersResult(), { sliceHours: 24 });
    expect(r.windowComplete).toBe(true);
    expect(r.invalid).toBe(1);
    expect(r.minFailedModified).toEqual(new Date("2026-10-06T08:00:00.000Z"));
    // Avant correctif : curseur à 2026-10-07T10:00 (la commande illisible était dépassée et jamais relue).
    expect(resolveOrdersCursor(w, r, null)).toEqual(new Date("2026-10-06T08:00:00.000Z"));
    expect(h.errors.find((e) => e.code === "INVALID_ORDER")?.message).toMatch(/ne dépassera pas sa date/);

    const h2 = harness(() => [{ orders: [], invalid: [{ ref: null, message: "Commande illisible." }], truncated: false, hasMore: false }], clock);
    const w2 = windowOf(24);
    const r2 = await syncOrders(h2.ctx, w2, emptyOrdersResult(), { sliceHours: 24 });
    expect(r2.minFailedModified).toEqual(w2.since);
    expect(resolveOrdersCursor(w2, r2, null)).toEqual(w2.since);
  });

  it("rawModifiedAt : date brute lisible ou null (jamais inventée)", () => {
    expect(rawModifiedAt({ orderId: "X", lastModifiedDate: "2026-10-06T08:00:00.000Z", lineItems: "cassé" })).toBe("2026-10-06T08:00:00.000Z");
    expect(rawModifiedAt({ orderId: "X", lastModifiedDate: "pas une date" })).toBeNull();
    expect(rawModifiedAt({ orderId: "X" })).toBeNull();
    expect(rawModifiedAt(null)).toBeNull();
  });
});

describe("I-01 : envoi des quantités conditionné à un import des commandes complet", () => {
  const complete = (): OrdersPhaseResult => ({ ...emptyOrdersResult(), windowComplete: true });
  it("aucun bloqueur seulement si la phase a réussi, fenêtre complète, sans échec ni commande illisible", () => {
    expect(pushBlockers(complete(), true)).toEqual([]);
    expect(pushBlockers(null, false)[0]).toMatch(/n'a pas pu être lancé/);
    expect(pushBlockers(complete(), false)).toContain("l'import des commandes a échoué");
    expect(pushBlockers({ ...complete(), windowComplete: false, stoppedByDeadline: true }, true)[0]).toMatch(/budget de temps/);
    expect(pushBlockers({ ...complete(), windowComplete: false, truncated: true }, true)[0]).toMatch(/tronqué/);
    expect(pushBlockers({ ...complete(), failed: 2 }, true)[0]).toMatch(/2 commande\(s\) n'ont pas pu être importées/);
    expect(pushBlockers({ ...complete(), invalid: 1 }, true)[0]).toMatch(/illisible/);
    expect(pushBlockers({ ...complete(), windowComplete: false }, true)[0]).toMatch(/pas été lue en entier/);
  });
});

describe("budget d'un run", () => {
  it("défaut nettement sous la limite de l'Edge Function (150 s) ; configurable et borné ; verrou périmé < période du cron", () => {
    expect(DEFAULT_SYNC_RUN_BUDGET_MS).toBeLessThanOrEqual(100_000);
    expect(syncRunBudgetMs({})).toBe(DEFAULT_SYNC_RUN_BUDGET_MS);
    expect(syncRunBudgetMs({ SYNC_RUN_BUDGET_MS: "60000" })).toBe(60_000);
    expect(syncRunBudgetMs({ SYNC_RUN_BUDGET_MS: "999999999" })).toBe(MAX_SYNC_RUN_BUDGET_MS);
    expect(syncRunBudgetMs({ SYNC_RUN_BUDGET_MS: "abc" })).toBe(DEFAULT_SYNC_RUN_BUDGET_MS);
    // Un run vivant n'est jamais déclaré interrompu ; un run mort est repris au passage suivant (cron */15).
    expect(MAX_SYNC_RUN_BUDGET_MS).toBeLessThan(RUNNING_STALE_MINUTES * 60_000);
    expect(RUNNING_STALE_MINUTES).toBeLessThan(15);
    expect(EDGE_CRON_SYNC_BUDGET_MS).toBeLessThanOrEqual(110_000);
    expect(BUDGET_REACHED_MESSAGE).toMatch(/Budget de temps atteint, reprise au prochain passage/);
  });
});

// ---------------------------------------------------------------------------------------------
// Cron partagé Edge / web (S-06 / I-22)
// ---------------------------------------------------------------------------------------------

function result(connectionId: string, extra: Partial<SyncRunResult> = {}): SyncRunResult {
  return { runId: `run-${connectionId}`, status: "success", stats: {} as SyncRunResult["stats"], durationMs: 1, errorSummary: null, connectionId, stoppedByBudget: false, ...extra };
}

describe("runSyncCron", () => {
  it("nettoie les runs abandonnés, reprend les notifications abandonnées (rattrapages d'abord) et transmet l'échéance du cron à chaque run", async () => {
    let now = 1_000_000;
    const calls: Array<{ id: string; options: unknown }> = [];
    const deps: Partial<CronSyncDeps> = {
      admin: {} as CronSyncDeps["admin"],
      clock: () => now,
      reap: vi.fn(async () => ({ channel: 1, other: 3 })),
      listDue: vi.fn(async () => [{ id: "due-1", provider: "ebay" }, { id: "due-2", provider: "ebay" }] as never),
      recover: vi.fn(async () => ({ recovered: 2, connections: [{ id: "lost-1", scope: "orders" as const }, { id: "due-1", scope: "listings" as const }] })),
      runSync: vi.fn(async (id: string, options: unknown) => {
        calls.push({ id, options });
        now += 10_000;
        return result(id, id === "due-1" ? { status: "partial", stoppedByBudget: true } : {});
      }),
    };
    const summary = await runSyncCron({ budgetMs: EDGE_CRON_SYNC_BUDGET_MS }, deps);
    expect(deps.reap).toHaveBeenCalledTimes(1);
    expect(deps.recover).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ due: 2, webhookRecovered: 2, abandonedRuns: { channel: 1, other: 3 }, synced: 3, deferred: 0 });
    expect(calls.map((c) => c.id)).toEqual(["lost-1", "due-1", "due-2"]);
    expect(calls[0]!.options).toEqual({ trigger: "webhook", scope: "orders", deadlineAt: 1_000_000 + EDGE_CRON_SYNC_BUDGET_MS });
    expect(calls[1]!.options).toEqual({ trigger: "scheduled", deadlineAt: 1_000_000 + EDGE_CRON_SYNC_BUDGET_MS });
    expect(summary.results[1]).toMatchObject({ status: "partial", stoppedByBudget: true });
  });

  it("aucun run démarré s'il ne reste pas CRON_MIN_RUN_START_MS : connexions reportées (restent dues)", async () => {
    let now = 0;
    const runSync = vi.fn(async (id: string) => {
      now += EDGE_CRON_SYNC_BUDGET_MS - CRON_MIN_RUN_START_MS + 1;
      return result(id);
    });
    const summary = await runSyncCron(
      { budgetMs: EDGE_CRON_SYNC_BUDGET_MS },
      { admin: {} as CronSyncDeps["admin"], clock: () => now, reap: async () => ({ channel: 0, other: 0 }), recover: async () => ({ recovered: 0, connections: [] }), listDue: async () => [{ id: "a", provider: "ebay" }, { id: "b", provider: "ebay" }] as never, runSync },
    );
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(summary.results[1]).toMatchObject({ connectionId: "b", status: "deferred" });
  });

  it("échec du nettoyage ou de la reprise des notifications : journalisé, les synchronisations continuent ; échec de la liste des dues : remonté", async () => {
    const runSync = vi.fn(async (id: string) => result(id));
    const summary = await runSyncCron(
      { budgetMs: 60_000 },
      {
        admin: {} as CronSyncDeps["admin"],
        reap: async () => Promise.reject(new Error("db")),
        recover: async () => Promise.reject(new Error("db")),
        listDue: async () => [{ id: "a", provider: "ebay" }] as never,
        runSync,
      },
    );
    expect(summary).toMatchObject({ abandonedRuns: null, webhookRecovered: 0, synced: 1 });
    await expect(runSyncCron({ budgetMs: 60_000 }, { admin: {} as CronSyncDeps["admin"], reap: async () => ({ channel: 0, other: 0 }), recover: async () => ({ recovered: 0, connections: [] }), listDue: async () => Promise.reject(new Error("lecture impossible")), runSync })).rejects.toThrow(
      "lecture impossible",
    );
  });

  it("parité : l'Edge Function et la route web utilisent le MÊME service (plus de divergence S-06)", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const edge = readFileSync(path.join(root, "server/edge/api.ts"), "utf8");
    const web = readFileSync(path.join(root, "src/app/api/cron/sync/route.ts"), "utf8");
    for (const src of [edge, web]) {
      expect(src).toMatch(/import \{[^}]*runSyncCron[^}]*\} from "@\/services\/sync\/cron"/);
      expect(src).not.toMatch(/listDueConnections\(/);
    }
    expect(edge).toMatch(/runSyncCron\(\{ budgetMs: EDGE_CRON_SYNC_BUDGET_MS \}\)/);
  });
});
