/**
 * Synchronisation bornée et reprenable, de bout en bout (moteur réel + connecteur scripté +
 * PostgreSQL local, schéma et RPC réels ; aucun appel eBay). Audit 2026-10-22 : D-01, S-05, I-03
 * (échéance, progression par tranche, reprise), D-07 (runs abandonnés), I-01 (push conditionné),
 * I-02 (ventes antérieures à la connexion), I-10 (commandes illisibles), I-33 (annonce illisible),
 * S-14 / I-13 (SKU partagé entre annonces).
 * Horloge injectée : aucun test ne dépend de la date d'exécution (Q-06).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorError } from "@/integrations/core/errors";
import type { GetListingsParams, GetOrdersParams, ListingsPage, OrdersPage } from "@/integrations/core/connector";
import type { NormalizedOrder } from "@/integrations/core/types";
import { canConnect } from "./helpers";
import { closePool, createFixture, createPgRestClient, fakeConnector, listing, order, q, resetFakeConnector, setTestEnv } from "./sync-harness";

setTestEnv();

vi.mock("@/lib/supabase/admin", async () => {
  const h = await import("./sync-harness");
  const client = h.createPgRestClient();
  return { createAdminSupabaseClient: () => client };
});
vi.mock("@/integrations/core/registry", async () => {
  const h = await import("./sync-harness");
  return { getConnector: () => h.fakeConnector(), getEbayConnector: () => h.fakeConnector(), listConnectorCatalog: () => [] };
});

const { runChannelSync, BUDGET_REACHED_CODE, RUNNING_STALE_MINUTES } = await import("@/services/sync/engine");
const { runSyncCron, reapAbandonedSyncRuns, OTHER_RUNS_STALE_MINUTES } = await import("@/services/sync/cron");

const available = await canConnect();
const d = available ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});
beforeEach(() => {
  resetFakeConnector();
});

const HOUR = 3_600_000;
const iso = (s: string) => new Date(s).toISOString();

function ordersPage(orders: NormalizedOrder[], extra: Partial<OrdersPage> = {}): OrdersPage {
  return { orders, invalid: [], truncated: false, hasMore: false, ...extra };
}
/** Comme eBay : seules les commandes MODIFIÉES dans la tranche demandée. */
function inSlice(params: GetOrdersParams, list: NormalizedOrder[]): NormalizedOrder[] {
  return list.filter((o) => {
    const t = Date.parse(o.externalModifiedAt ?? o.placedAt);
    return t >= params.since.getTime() && t <= params.until!.getTime();
  });
}
const at = (id: string, when: string, extra: Partial<NormalizedOrder> = {}) => order(id, { placedAt: iso(when), externalModifiedAt: iso(when), ...extra });

async function connectionRow(id: string) {
  const [row] = await q<{ status: string; last_orders_cursor: string | null; last_sync_at: string | null; last_sync_attempt_at: string | null; sync_state: Record<string, unknown>; last_error: string | null }>(
    "select status, last_orders_cursor, last_sync_at, last_sync_attempt_at, sync_state, last_error from public.channel_connections where id = $1",
    [id],
  );
  return row!;
}
async function stock(skuId: string): Promise<number> {
  const [row] = await q<{ quantity_on_hand: number }>("select quantity_on_hand from public.inventory where sku_id = $1", [skuId]);
  return row!.quantity_on_hand;
}
async function saleMoves(orgId: string): Promise<number> {
  const [row] = await q<{ n: number }>("select count(*)::int as n from public.inventory_movements where organization_id = $1 and type = 'sale'", [orgId]);
  return row!.n;
}
async function runErrors(runId: string) {
  return q<{ code: string; message: string }>("select code, message from public.sync_errors where sync_run_id = $1 order by created_at, code", [runId]);
}
async function runRow(runId: string) {
  const [row] = await q<{ status: string; error_summary: string | null; finished_at: string | null }>("select status, error_summary, finished_at from public.sync_runs where id = $1", [runId]);
  return row!;
}

d("synchronisation bornée : commandes par tranches, échéance, reprise", () => {
  it("plusieurs pages ; échéance atteinte après la 1re tranche → « partial » (budget), curseur confirmé, verrou libéré ; le passage suivant reprend au bon curseur, sans doublon ni double déduction", async () => {
    const f = await createFixture({ cursor: new Date("2026-10-05T03:00:00.000Z") });
    const c = fakeConnector();
    let now = Date.parse("2026-10-08T00:00:00.000Z");
    const all = [at("O1", "2026-10-05T05:00:00Z"), at("O2", "2026-10-05T22:00:00Z"), at("O3", "2026-10-06T10:00:00Z"), at("O4", "2026-10-07T10:00:00Z")];
    c.orders = (params) =>
      (async function* () {
        const list = inSlice(params, all);
        if (params.since.getTime() === Date.parse("2026-10-05T00:00:00Z")) {
          // Tranche 1 : DEUX pages, puis le temps s'écoule (appels lents) : plus de budget pour la tranche 2.
          yield ordersPage(list.slice(0, 1), { hasMore: true });
          yield ordersPage(list.slice(1), { hasMore: false });
          now += 200_000;
          return;
        }
        yield ordersPage(list);
      })();

    const r1 = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "orders", orders: { sliceHours: 24 }, clock: () => now, budgetMs: 100_000 });
    expect(r1.status).toBe("partial");
    expect(r1.stoppedByBudget).toBe(true);
    expect(r1.stats).toMatchObject({ orders_fetched: 2, orders_created: 2, inventory_changes: 2 });
    const run1 = await runRow(r1.runId);
    expect(run1.status).toBe("partial"); // plus « running » : verrou libéré
    expect(run1.finished_at).not.toBeNull();
    expect(run1.error_summary).toMatch(/^Budget de temps atteint, reprise au prochain passage/);
    expect((await runErrors(r1.runId)).map((e) => e.code)).toEqual([BUDGET_REACHED_CODE]);
    const conn1 = await connectionRow(f.connectionId);
    expect(conn1.last_orders_cursor).toBe(iso("2026-10-06T00:00:00Z")); // fin de la tranche confirmée
    expect(conn1.last_sync_at).toBeNull(); // passe incomplète : la connexion reste « due »
    expect(conn1.last_sync_attempt_at).not.toBeNull();
    expect(conn1.status).toBe("connected");
    expect(await stock(f.skuId)).toBe(8);

    // Passage suivant : reprise depuis le curseur confirmé (moins le chevauchement de 3 h).
    now = Date.parse("2026-10-08T01:00:00.000Z");
    c.calls.orders = [];
    const r2 = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "orders", orders: { sliceHours: 24 }, clock: () => now });
    expect(c.calls.orders[0]!.since.toISOString()).toBe(iso("2026-10-05T21:00:00Z"));
    expect(r2.status).toBe("success");
    expect(r2.stoppedByBudget).toBe(false);
    expect(r2.stats).toMatchObject({ orders_created: 2, orders_updated: 1, inventory_changes: 2 });
    const conn2 = await connectionRow(f.connectionId);
    expect(conn2.last_orders_cursor).toBe(iso("2026-10-07T10:00:00Z"));
    expect(conn2.last_sync_at).not.toBeNull();
    expect(await stock(f.skuId)).toBe(6);
    expect(await saleMoves(f.orgId)).toBe(4);
    expect((await q("select count(*)::int as n from public.orders where organization_id = $1", [f.orgId]))[0]).toEqual({ n: 4 });
    expect(await q("select id from public.sync_runs where source_ref = $1 and status = 'running'", [f.connectionId])).toEqual([]);
  });

  it("processus tué pendant une tranche : la tranche déjà confirmée reste acquise ; verrou expiré → nouveau run, reprise au curseur confirmé", async () => {
    const f = await createFixture({ cursor: new Date("2026-10-05T03:00:00.000Z") });
    const c = fakeConnector();
    const now = Date.parse("2026-10-08T00:00:00.000Z");
    const all = [at("K1", "2026-10-05T05:00:00Z"), at("K2", "2026-10-06T10:00:00Z"), at("K3", "2026-10-07T10:00:00Z")];
    let killed!: () => void;
    const reachedKill = new Promise<void>((r) => (killed = r));
    c.orders = (params) =>
      (async function* () {
        const list = inSlice(params, all);
        if (params.since.getTime() === Date.parse("2026-10-06T00:00:00Z")) {
          yield ordersPage(list, { hasMore: true });
          killed();
          await new Promise<never>(() => undefined); // la plateforme tue le processus ici : plus rien ne s'exécute
        }
        yield ordersPage(list);
      })();
    void runChannelSync(f.connectionId, { trigger: "scheduled", scope: "orders", orders: { sliceHours: 24 }, clock: () => now });
    await reachedKill;
    await new Promise((r) => setTimeout(r, 50));

    // Progression confirmée AVANT la coupure : tranche 1 (K1), curseur durable.
    expect((await connectionRow(f.connectionId)).last_orders_cursor).toBe(iso("2026-10-06T00:00:00Z"));
    expect(await stock(f.skuId)).toBe(8); // K1 et K2 (ingérée avant la coupure, idempotente)
    // Verrou encore tenu par le run mort.
    const conflict = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "orders" }).catch((e: unknown) => e);
    expect(conflict).toMatchObject({ code: "CONFLICT" });

    // Plus tard : le verrou a expiré (> RUNNING_STALE_MINUTES) → run récupéré, reprise.
    await q(`update public.sync_runs set started_at = now() - interval '${RUNNING_STALE_MINUTES + 1} minutes' where source_ref = $1 and status = 'running'`, [f.connectionId]);
    resetFakeConnector().orders = (params) => (async function* () {
      yield ordersPage(inSlice(params, all));
    })();
    const r = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "orders", orders: { sliceHours: 24 }, clock: () => now + HOUR });
    expect(r.status).toBe("success");
    expect(fakeConnector().calls.orders[0]!.since.toISOString()).toBe(iso("2026-10-05T21:00:00Z"));
    expect(r.stats).toMatchObject({ orders_created: 1, orders_updated: 1, inventory_changes: 1 }); // K3 créée, K2 relue sans mouvement
    expect(await stock(f.skuId)).toBe(7);
    expect(await saleMoves(f.orgId)).toBe(3);
    const runs = await q<{ status: string; error_summary: string | null }>("select status, error_summary from public.sync_runs where source_ref = $1 order by started_at", [f.connectionId]);
    expect(runs[0]).toMatchObject({ status: "failed" });
    expect(runs[0]!.error_summary).toMatch(/interrompu/);
  });

  it("erreur eBay temporaire au milieu de la fenêtre : « partial », curseur à la dernière tranche confirmée ; le run suivant reprend et termine", async () => {
    const f = await createFixture({ cursor: new Date("2026-10-05T03:00:00.000Z") });
    const c = fakeConnector();
    const now = Date.parse("2026-10-08T00:00:00.000Z");
    const all = [at("T1", "2026-10-05T05:00:00Z"), at("T2", "2026-10-06T10:00:00Z")];
    c.orders = (params) =>
      (async function* () {
        if (params.since.getTime() >= Date.parse("2026-10-06T00:00:00Z")) throw new ConnectorError("API_ERROR", "ebay", "L'API ebay est indisponible (HTTP 503) après 4 tentative(s).", { httpStatus: 503 });
        yield ordersPage(inSlice(params, all));
      })();
    const r1 = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "orders", orders: { sliceHours: 24 }, clock: () => now });
    // Seule phase du run en erreur → « failed » (alerte) ; la tranche confirmée avant la panne reste acquise.
    expect(r1.status).toBe("failed");
    expect(r1.stoppedByBudget).toBe(false);
    expect((await runErrors(r1.runId)).map((e) => e.code)).toEqual(["API_ERROR"]);
    expect((await connectionRow(f.connectionId)).last_orders_cursor).toBe(iso("2026-10-06T00:00:00Z"));
    expect((await connectionRow(f.connectionId)).last_sync_at).toBeNull();

    c.orders = (params) => (async function* () {
      yield ordersPage(inSlice(params, all));
    })();
    const r2 = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "orders", orders: { sliceHours: 24 }, clock: () => now + HOUR });
    expect(r2.status).toBe("success");
    expect(await stock(f.skuId)).toBe(8);
    expect(await saleMoves(f.orgId)).toBe(2);
  });

  it("tranche trop longue pour le budget (aucune tranche confirmée) : tranches deux fois plus courtes au passage suivant, puis retour à la taille par défaut", async () => {
    const f = await createFixture({ cursor: new Date("2026-10-07T03:00:00.000Z") });
    const c = fakeConnector();
    let now = Date.parse("2026-10-08T00:00:00.000Z");
    c.orders = () =>
      (async function* () {
        now += 200_000; // première page très lente : plus le temps de lire la suivante
        yield ordersPage([], { hasMore: true });
        yield ordersPage([], { hasMore: false });
      })();
    const r1 = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "orders", clock: () => now });
    expect(r1).toMatchObject({ status: "partial", stoppedByBudget: true });
    expect((await connectionRow(f.connectionId)).sync_state).toEqual({ ordersSliceHours: 84 });
    expect((await connectionRow(f.connectionId)).last_orders_cursor).toBe(iso("2026-10-07T03:00:00Z"));

    now = Date.parse("2026-10-08T00:00:00.000Z");
    c.orders = () => (async function* () {
      yield ordersPage([]);
    })();
    c.calls.orders = [];
    const r2 = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "orders", clock: () => now });
    expect(r2.status).toBe("success");
    expect((await connectionRow(f.connectionId)).sync_state).toEqual({});
  });

  it("deux cron simultanés (Edge + web) sur la même connexion : un seul run, l'autre est écarté ; une seule déduction", async () => {
    const f = await createFixture({ cursor: new Date("2026-10-07T21:00:00.000Z") });
    const now = Date.parse("2026-10-08T00:00:00.000Z");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fakeConnector().orders = (params) =>
      (async function* () {
        await gate;
        yield ordersPage(inSlice(params, [at("CR-1", "2026-10-07T23:00:00Z")]));
      })();
    const [conn] = await q("select * from public.channel_connections where id = $1", [f.connectionId]);
    const deps = {
      admin: createPgRestClient() as never,
      listDue: async () => [conn] as never,
      recover: async () => ({ recovered: 0, connections: [] }),
      reap: async () => ({ channel: 0, other: 0 }),
      clock: () => now,
      runSync: (id: string, options: Parameters<typeof runChannelSync>[1]) => runChannelSync(id, { ...options, clock: () => now }),
    };
    const a = runSyncCron({ budgetMs: 100_000 }, deps);
    await new Promise((r) => setTimeout(r, 150));
    const b = await runSyncCron({ budgetMs: 100_000 }, deps);
    release();
    const first = await a;
    expect(first.results[0]).toMatchObject({ status: "success" });
    expect(b.results[0]).toMatchObject({ status: "skipped" });
    expect(b.results[0]!.error).toMatch(/déjà en cours/);
    expect(await stock(f.skuId)).toBe(9);
    expect(await saleMoves(f.orgId)).toBe(1);
  });
});

d("D-07 : runs « running » abandonnés", () => {
  it("le nettoyage planifié libère les runs de canal > seuil et les runs fournisseurs > 30 min ; les runs récents sont intacts", async () => {
    const f = await createFixture();
    const ins = (kind: string, minutes: number) =>
      q<{ id: string }>(`insert into public.sync_runs (organization_id, source_kind, source_ref, provider, trigger, status, started_at) values ($1, $2, gen_random_uuid(), 'x', 'scheduled', 'running', now() - ($3 || ' minutes')::interval) returning id`, [f.orgId, kind, String(minutes)]);
    const [oldChannel] = await ins("channel", RUNNING_STALE_MINUTES + 2);
    const [freshChannel] = await ins("channel", 2);
    const [zombieSupplier] = await ins("supplier_source", 9 * 24 * 60);
    const [recentSupplier] = await ins("supplier_source", OTHER_RUNS_STALE_MINUTES - 5);
    const r = await reapAbandonedSyncRuns(createPgRestClient() as never);
    expect(r.channel).toBeGreaterThanOrEqual(1);
    expect(r.other).toBeGreaterThanOrEqual(1);
    const status = async (id: string) => (await q<{ status: string; error_summary: string | null }>("select status, error_summary from public.sync_runs where id = $1", [id]))[0]!;
    expect(await status(oldChannel!.id)).toMatchObject({ status: "failed" });
    expect((await status(zombieSupplier!.id)).error_summary).toMatch(/Run interrompu.*nettoyage planifié/);
    expect(await status(zombieSupplier!.id)).toMatchObject({ status: "failed" });
    expect(await status(freshChannel!.id)).toMatchObject({ status: "running" });
    expect(await status(recentSupplier!.id)).toMatchObject({ status: "running" });
    await q("update public.sync_runs set status = 'failed' where id = any($1)", [[freshChannel!.id, recentSupplier!.id]]);
  });
});

d("I-01 : envoi des quantités seulement après un import des commandes complet", () => {
  async function pushFixture() {
    const f = await createFixture({ cursor: new Date("2026-10-07T21:00:00.000Z"), secrets: { access: "v^1.1#access-test", refresh: "v^1.1#refresh-test" } });
    await q("update public.channel_connections set push_inventory = true where id = $1", [f.connectionId]);
    const c = fakeConnector();
    c.listings = () => (async function* () {
      yield { listings: [listing("L-1", { sku: "SYNC-SKU-1", quantityAvailable: 3, quantityListed: 3 })], invalid: [], warnings: [], truncated: false } satisfies ListingsPage;
    })();
    return { f, c };
  }
  const now = Date.parse("2026-10-08T00:00:00.000Z");

  it("commande illisible (I-10) : aucun envoi, raison explicite, alerte « import bloqué » ; curseur bloqué à sa date", async () => {
    const { f, c } = await pushFixture();
    c.orders = (params) => (async function* () {
      yield ordersPage(inSlice(params, [at("P-1", "2026-10-07T22:00:00Z")]), { invalid: [{ ref: "BROKEN-1", message: "Commande eBay BROKEN-1 au format inattendu : lineItems.", modifiedAt: iso("2026-10-07T21:30:00Z") }] });
    })();
    const r = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "full", clock: () => now });
    expect(r.status).toBe("partial");
    expect(c.pushed).toEqual([]);
    const errs = await runErrors(r.runId);
    expect(errs.map((e) => e.code)).toEqual(expect.arrayContaining(["INVALID_ORDER", "INVENTORY_PUSH_SKIPPED"]));
    expect(errs.find((e) => e.code === "INVENTORY_PUSH_SKIPPED")!.message).toMatch(/1 commande\(s\) illisible/);
    // Avant correctif : curseur à 22:00 (la commande illisible était dépassée et jamais relue).
    expect((await connectionRow(f.connectionId)).last_orders_cursor).toBe(iso("2026-10-07T21:30:00Z"));
    const alerts = await q<{ type: string }>("select type from public.alerts where organization_id = $1 and status <> 'resolved' order by type", [f.orgId]);
    expect(alerts.map((a) => a.type)).toContain("sync_orders_blocked");

    // Commande devenue lisible : import complet, alerte résolue, envoi effectué (stock 10 − 1 vente).
    c.orders = (params) => (async function* () {
      yield ordersPage(inSlice(params, [at("P-1", "2026-10-07T22:00:00Z"), at("BROKEN-1", "2026-10-07T21:30:00Z")]));
    })();
    const r2 = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "full", clock: () => now + HOUR });
    expect(r2.status).toBe("success");
    expect(c.pushed).toEqual([{ ref: { externalListingId: "L-1", variationSku: null }, quantity: 8 }]);
    expect(await q("select id from public.alerts where organization_id = $1 and type = 'sync_orders_blocked' and status <> 'resolved'", [f.orgId])).toEqual([]);
  });

  it("phase commandes en échec (eBay indisponible) ou interrompue par le budget : aucun envoi", async () => {
    const { f, c } = await pushFixture();
    c.orders = () => (async function* () {
      throw new ConnectorError("API_ERROR", "ebay", "L'API ebay est indisponible (HTTP 503) après 4 tentative(s).", { httpStatus: 503 });
    })();
    const r = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "full", clock: () => now });
    expect(r.status).toBe("partial");
    expect(c.pushed).toEqual([]);
    expect((await runErrors(r.runId)).find((e) => e.code === "INVENTORY_PUSH_SKIPPED")!.message).toMatch(/a échoué/);

    let t = now;
    c.orders = () => (async function* () {
      t += 200_000; // première page très lente : plus le temps de lire la suivante
      yield ordersPage([], { hasMore: true });
      yield ordersPage([]);
    })();
    const r2 = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "full", clock: () => t });
    expect(r2).toMatchObject({ status: "partial", stoppedByBudget: true });
    expect(c.pushed).toEqual([]);
    expect((await runErrors(r2.runId)).find((e) => e.code === "INVENTORY_PUSH_SKIPPED")!.message).toMatch(/budget de temps/);
  });

  it("S-14 / I-13 : un SKU associé à plusieurs annonces actives n'est pas poussé (alerte) ; une seule annonce → envoi", async () => {
    const { f, c } = await pushFixture();
    c.listings = () => (async function* () {
      yield { listings: [listing("L-1", { sku: "SYNC-SKU-1" }), listing("L-2", { sku: "sync-sku-1" })], invalid: [], warnings: [], truncated: false } satisfies ListingsPage;
    })();
    c.orders = () => (async function* () {
      yield ordersPage([]);
    })();
    const r = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "full", clock: () => now });
    expect(r.stats.listings_auto_mapped).toBe(2);
    // Avant correctif : 2 envois de 10 unités (20 unités vendables pour 10 en stock).
    expect(c.pushed).toEqual([]);
    expect(r.status).toBe("partial");
    expect((await runErrors(r.runId)).filter((e) => e.code === "INVENTORY_PUSH_SHARED_SKU")).toHaveLength(1);
    expect(await q("select type from public.alerts where organization_id = $1 and type = 'inventory_push_shared_sku' and status <> 'resolved'", [f.orgId])).toHaveLength(1);

    // L-2 terminée sur eBay : un seul SKU ↔ annonce → envoi, alerte résolue.
    c.listings = () => (async function* () {
      yield { listings: [listing("L-1", { sku: "SYNC-SKU-1" })], invalid: [], warnings: [], truncated: false } satisfies ListingsPage;
    })();
    const r2 = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "full", clock: () => now + HOUR });
    expect(r2.status).toBe("success");
    expect(c.pushed).toEqual([{ ref: { externalListingId: "L-1", variationSku: null }, quantity: 10 }]);
    expect(await q("select id from public.alerts where organization_id = $1 and type = 'inventory_push_shared_sku' and status <> 'resolved'", [f.orgId])).toEqual([]);
  });
});

d("annonces : parcours réparti sur plusieurs runs (I-03) et annonce illisible (I-33)", () => {
  it("3 pages, 1 nouvelle page par run : progression enregistrée et reprise avec relecture d'une page ; rien n'est terminé avant la fin du parcours ; l'annonce illisible n'est jamais terminée", async () => {
    const f = await createFixture();
    const c = fakeConnector();
    // État initial : OLD (vraiment terminée sur eBay) et INV (active mais illisible au prochain parcours).
    c.listings = () => (async function* () {
      yield { listings: [listing("OLD"), listing("INV")], invalid: [], warnings: [], truncated: false } satisfies ListingsPage;
    })();
    expect((await runChannelSync(f.connectionId, { trigger: "manual", scope: "listings" })).status).toBe("success");

    const book: ListingsPage[] = [
      { listings: [listing("A")], invalid: [], warnings: [], truncated: false, totalPages: 3 },
      { listings: [listing("B")], invalid: [{ ref: "INV", message: "Annonce INV illisible (prix)." }], warnings: [], truncated: false, totalPages: 3 },
      { listings: [listing("C")], invalid: [], warnings: [], truncated: false, totalPages: 3 },
    ];
    c.listings = (_auth, params: GetListingsParams) =>
      (async function* () {
        for (let p = params.startPage ?? 1; p <= 3; p++) yield { ...book[p - 1]!, pageNumber: p };
      })();
    c.calls.listings = [];
    const status = async (id: string) => (await q<{ status: string }>("select status from public.channel_listings where sales_channel_id = $1 and external_listing_id = $2", [f.channelId, id]))[0]?.status;

    const r1 = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "listings", listings: { maxPagesPerRun: 1 } });
    expect(r1).toMatchObject({ status: "partial", stoppedByBudget: true });
    expect((await connectionRow(f.connectionId)).sync_state).toMatchObject({ listingsPass: { nextPage: 2, runs: 1 } });
    expect(await status("OLD")).toBe("active");
    const lastSync = (await connectionRow(f.connectionId)).last_sync_at;

    const r2 = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "listings", listings: { maxPagesPerRun: 1 } });
    expect(r2).toMatchObject({ status: "partial", stoppedByBudget: true });
    expect((await connectionRow(f.connectionId)).sync_state).toMatchObject({ listingsPass: { nextPage: 3, runs: 2 } });
    expect(await status("OLD")).toBe("active");
    expect((await connectionRow(f.connectionId)).last_sync_at).toBe(lastSync);

    const r3 = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "listings", listings: { maxPagesPerRun: 1 } });
    expect(c.calls.listings.map((p) => p.startPage)).toEqual([1, 1, 2]);
    expect(r3.stoppedByBudget).toBe(false);
    expect(r3.status).toBe("partial"); // INVALID_LISTING signalée
    expect(r3.stats.listings_ended).toBe(1);
    expect(await status("OLD")).toBe("ended");
    // Avant correctif : INV (illisible mais active) était marquée terminée.
    expect(await status("INV")).toBe("active");
    for (const id of ["A", "B", "C"]) expect(await status(id)).toBe("active");
    const conn = await connectionRow(f.connectionId);
    expect(conn.sync_state).toEqual({ listingsPass: null });
    expect(conn.last_sync_at).not.toBe(lastSync);
  });
});

d("I-02 : ventes antérieures à la connexion du compte", () => {
  it("importées pour l'analyse sans mouvement de stock (ni à l'import, ni par « appliquer les ventes en attente ») ; les ventes postérieures sont déduites une fois", async () => {
    const f = await createFixture({ cursor: null });
    await q("update public.channel_connections set sales_stock_cutoff_at = $2 where id = $1", [f.connectionId, iso("2026-10-07T00:00:00Z")]);
    const c = fakeConnector();
    const all = [at("H-1", "2026-09-20T10:00:00Z"), at("H-2", "2026-10-06T23:00:00Z", { items: [{ externalLineItemId: "H-2-L1", externalListingId: "ITEM-1", externalVariationId: "", externalSku: "SYNC-SKU-1", title: "A", quantity: 3, unitPrice: 10, currency: "EUR", total: 30 }] }), at("N-1", "2026-10-07T08:00:00Z")];
    c.orders = (params) => (async function* () {
      yield ordersPage(inSlice(params, all));
    })();
    const now = Date.parse("2026-10-08T00:00:00.000Z");
    const r = await runChannelSync(f.connectionId, { trigger: "initial", scope: "orders", clock: () => now });
    expect(r.status).toBe("success");
    expect(r.stats).toMatchObject({ orders_created: 3, inventory_changes: 1 });
    // Avant correctif : 10 − 1 − 3 − 1 = 5.
    expect(await stock(f.skuId)).toBe(9);
    const lines = await q<{ external_line_item_id: string; sku_id: string | null; inventory_applied: boolean }>(
      "select oi.external_line_item_id, oi.sku_id, oi.inventory_applied from public.order_items oi join public.orders o on o.id = oi.order_id where o.organization_id = $1 order by 1",
      [f.orgId],
    );
    expect(lines.every((l) => l.sku_id === f.skuId)).toBe(true); // ventes rattachées au SKU (analyse)
    expect(lines.filter((l) => l.inventory_applied).map((l) => l.external_line_item_id)).toEqual(["N-1-L1"]);
    // L'action « appliquer les ventes en attente » ne déduit pas non plus l'historique.
    const [applied] = await q<{ n: number }>("select public.apply_pending_sales_for_sku($1) as n", [f.skuId]);
    expect(applied!.n).toBe(0);
    expect(await stock(f.skuId)).toBe(9);
    // Rejeu (idempotence) : rien ne change.
    const r2 = await runChannelSync(f.connectionId, { trigger: "manual", scope: "orders", clock: () => now + HOUR });
    expect(r2.stats.inventory_changes).toBe(0);
    expect(await stock(f.skuId)).toBe(9);
    expect(await saleMoves(f.orgId)).toBe(1);
  });
});
