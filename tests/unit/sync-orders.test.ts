/**
 * Import des commandes (services/sync/orders.ts) avec un connecteur factice et une RPC simulée :
 * budget de pages épuisé exactement sur la dernière page d'une tranche, tranche redécoupée et
 * relue (statistiques en commandes distinctes), taille de tranche par défaut unique.
 */
import { describe, expect, it } from "vitest";
import type { GetOrdersParams, OrdersPage } from "@/integrations/core/connector";
import type { NormalizedOrder } from "@/integrations/core/types";
import { ORDERS_SLICE_HOURS, splitOrdersWindow, type OrdersWindow } from "@/integrations/ebay/cursor";
import type { SyncContext, SyncErrorInput } from "@/services/sync/context";
import { emptyOrdersResult, syncOrders } from "@/services/sync/orders";

const UNTIL = new Date("2026-10-08T00:00:00.000Z");
const HOUR = 3_600_000;

function order(id: string, overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
  return {
    externalOrderId: id,
    orderNumber: id,
    status: "paid",
    paymentStatus: "PAID",
    fulfillmentStatus: "NOT_STARTED",
    buyerUsername: "acheteur",
    currency: "EUR",
    subtotal: 10,
    shippingTotal: 0,
    taxTotal: 0,
    feeTotal: 1,
    total: 10,
    placedAt: "2026-10-07T10:00:00.000Z",
    externalModifiedAt: "2026-10-07T10:00:00.000Z",
    payloadHash: `hash-${id}`,
    items: [],
    ...overrides,
  } as NormalizedOrder;
}

function page(orders: NormalizedOrder[], extra: Partial<OrdersPage> = {}): OrdersPage {
  return { orders, invalid: [], truncated: false, ...extra };
}

type Script = (params: GetOrdersParams) => OrdersPage[];

function harness(script: Script) {
  const stored = new Map<string, string>();
  const rpcCalls: string[] = [];
  const getOrdersCalls: GetOrdersParams[] = [];
  const pagesServed: number[] = [];
  const errors: SyncErrorInput[] = [];
  const ctx = {
    admin: {
      rpc: async (_name: string, args: { p_order: { external_order_id: string; payload_hash: string } }) => {
        const id = args.p_order.external_order_id;
        rpcCalls.push(id);
        const created = !stored.has(id);
        stored.set(id, args.p_order.payload_hash);
        return { data: { order_id: `uuid-${id}`, created, items_unmapped: 1, movements: created ? 1 : 0 }, error: null };
      },
    },
    connection: { id: "conn-1", provider: "ebay" },
    organizationId: "org-1",
    salesChannelId: "ch-1",
    connector: {
      getOrders(_auth: unknown, params: GetOrdersParams) {
        getOrdersCalls.push(params);
        const list = script(params);
        return (async function* () {
          for (const p of list) {
            pagesServed.push(1);
            yield p;
          }
        })();
      },
    },
    auth: { getAccessToken: async () => "token" },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    recordError: (e: SyncErrorInput) => errors.push(e),
  } as unknown as SyncContext;
  return { ctx, rpcCalls, getOrdersCalls, pagesServed, errors };
}

const windowOf = (hours: number): OrdersWindow => ({ since: new Date(UNTIL.getTime() - hours * HOUR), until: UNTIL, initial: false });

describe("syncOrders : budget de pages", () => {
  it("budget épuisé exactement sur la dernière page de la dernière tranche → fenêtre complète (pas de troncature)", async () => {
    const h = harness(() => [page([order("A")], { hasMore: true }), page([order("B")], { hasMore: false })]);
    const w = windowOf(24);
    const r = await syncOrders(h.ctx, w, emptyOrdersResult(), { sliceHours: 24, maxPages: 2 });
    expect(r.pages).toBe(2);
    expect(r.truncated).toBe(false);
    expect(r.windowComplete).toBe(true);
    expect(r.completedUntil).toEqual(w.until);
    expect(h.errors.filter((e) => e.code === "ORDERS_TRUNCATED")).toEqual([]);
  });

  it("budget épuisé à la fin d'une tranche alors qu'il en reste : la tranche lue fait avancer la progression, la suivante n'est pas ouverte", async () => {
    const h = harness(() => [page([order(`O-${Math.random()}`)], { hasMore: true }), page([], { hasMore: false })]);
    const w = windowOf(48);
    const r = await syncOrders(h.ctx, w, emptyOrdersResult(), { sliceHours: 24, maxPages: 2 });
    expect(r.truncated).toBe(true);
    expect(r.windowComplete).toBe(false);
    // Avant correctif : null (la tranche complète était déclarée tronquée).
    expect(r.completedUntil).toEqual(new Date(UNTIL.getTime() - 24 * HOUR));
    expect(h.getOrdersCalls).toHaveLength(1); // aucune page lue au-delà du budget
    expect(r.pages).toBe(2);
  });

  it("fin de tranche inconnue du connecteur (hasMore absent) : prudence, la tranche reste incomplète", async () => {
    const h = harness(() => [page([order("A")]), page([order("B")])]);
    const r = await syncOrders(h.ctx, windowOf(24), emptyOrdersResult(), { sliceHours: 24, maxPages: 2 });
    expect(r.truncated).toBe(true);
    expect(r.completedUntil).toBeNull();
  });

  it("connecteur qui annonce la fin puis renvoie une page : page non ingérée au-delà du budget, tranche incomplète", async () => {
    const h = harness(() => [page([order("A")], { hasMore: false }), page([order("B")], { hasMore: false })]);
    const r = await syncOrders(h.ctx, windowOf(24), emptyOrdersResult(), { sliceHours: 24, maxPages: 1 });
    expect(h.rpcCalls).toEqual(["A"]);
    expect(r.truncated).toBe(true);
    expect(r.completedUntil).toBeNull();
  });
});

describe("syncOrders : tranche redécoupée et relue", () => {
  /** Tranche de 48 h : lue tronquée (A, B) puis relue en deux moitiés (A | B). */
  const splitScript = (bModified: boolean): Script => (params) => {
    const span = params.until!.getTime() - params.since.getTime();
    if (span > 24 * HOUR) return [page([order("A"), order("B")], { truncated: true, hasMore: true })];
    const firstHalf = params.since.getTime() === UNTIL.getTime() - 48 * HOUR;
    if (firstHalf) return [page([order("A")], { hasMore: false, invalid: [{ ref: "BAD-1", message: "Commande illisible." }] })];
    return [page([order("B", bModified ? { payloadHash: "hash-B-v2", externalModifiedAt: "2026-10-07T12:00:00.000Z" } : {})], { hasMore: false })];
  };

  it("commandes identiques relues : ni réingérées ni recomptées", async () => {
    const h = harness(splitScript(false));
    const r = await syncOrders(h.ctx, windowOf(48), emptyOrdersResult(), { sliceHours: 48, minSliceHours: 1 });
    expect(h.getOrdersCalls).toHaveLength(3);
    expect(r.windowComplete).toBe(true);
    // Avant correctif : fetched 4, created 2 + updated 2, items non rattachés 4.
    expect(r.fetched).toBe(2);
    expect(r.created).toBe(2);
    expect(r.updated).toBe(0);
    expect(r.itemsUnmapped).toBe(2);
    expect(r.movements).toBe(2);
    expect(h.rpcCalls).toEqual(["A", "B"]);
  });

  it("commande modifiée entre les deux lectures : réingérée (nouvelle version) mais comptée une seule fois", async () => {
    const h = harness(splitScript(true));
    const r = await syncOrders(h.ctx, windowOf(48), emptyOrdersResult(), { sliceHours: 48, minSliceHours: 1 });
    expect(h.rpcCalls).toEqual(["A", "B", "B"]);
    expect(r.fetched).toBe(2);
    expect(r.created).toBe(2);
    expect(r.updated).toBe(0);
    expect(r.itemsUnmapped).toBe(2);
    expect(r.maxModifiedSeen).toEqual(new Date("2026-10-07T12:00:00.000Z"));
  });

  it("commande illisible relue : comptée et signalée une seule fois", async () => {
    const script: Script = (params) => {
      const span = params.until!.getTime() - params.since.getTime();
      const bad = { ref: "BAD-1", message: "Commande illisible." };
      if (span > 24 * HOUR) return [page([], { invalid: [bad], truncated: true })];
      return [page([], { invalid: params.since.getTime() === UNTIL.getTime() - 48 * HOUR ? [bad] : [], hasMore: false })];
    };
    const h = harness(script);
    const r = await syncOrders(h.ctx, windowOf(48), emptyOrdersResult(), { sliceHours: 48, minSliceHours: 1 });
    expect(r.invalid).toBe(1);
    expect(h.errors.filter((e) => e.code === "INVALID_ORDER")).toHaveLength(1);
  });
});

describe("taille de tranche par défaut", () => {
  it("source unique : syncOrders sans option découpe comme splitOrdersWindow par défaut (ORDERS_SLICE_HOURS)", async () => {
    const h = harness(() => [page([], { hasMore: false })]);
    const w = windowOf(30 * 24);
    await syncOrders(h.ctx, w, emptyOrdersResult());
    const expected = splitOrdersWindow(w);
    expect(ORDERS_SLICE_HOURS).toBe(7 * 24);
    expect(h.getOrdersCalls.map((c) => [c.since.toISOString(), c.until!.toISOString()])).toEqual(expected.map((s) => [s.since.toISOString(), s.until.toISOString()]));
    expect(expected[0]!.until.getTime() - expected[0]!.since.getTime()).toBe(ORDERS_SLICE_HOURS * HOUR);
  });
});
