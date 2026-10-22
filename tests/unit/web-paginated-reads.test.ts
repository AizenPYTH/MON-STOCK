/**
 * W-03 (+ partie web de S-08) : les lectures supposées complètes ne sont plus plafonnées en silence
 * à 1 000 lignes. Le faux client ci-dessous reproduit le plafond PostgREST de Supabase (`max_rows`
 * = 1 000 par réponse, même avec `.limit(5000)`) : seule une lecture paginée par `.range()` voit
 * toutes les lignes. Au-delà des bornes de lecture, le résultat est signalé partiel.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StockOverviewRow } from "@/db/types";
import { enrichStockRow } from "@/features/stock/model";

type Row = Record<string, unknown>;
const MAX_ROWS = 1000;

const db = {
  tables: {} as Record<string, Row[]>,
  failing: new Set<string>(),
  ranges: [] as Array<{ table: string; from: number; to: number }>,
};

function get(row: Row, key: string): unknown {
  return key.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Row)[k] : undefined), row);
}

/** Faux PostgREST : filtres simples, tri, range/limit, et plafond max_rows à chaque réponse. */
function from(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  const orders: Array<{ col: string; asc: boolean }> = [];
  let range: [number, number] | null = null;
  let limit: number | null = null;
  let head = false;
  let count = false;
  const b: Record<string, unknown> = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => ((count = Boolean(opts?.count)), (head = Boolean(opts?.head)), b),
    eq: (k: string, v: unknown) => (filters.push((r) => get(r, k) === v), b),
    neq: (k: string, v: unknown) => (filters.push((r) => get(r, k) !== v), b),
    in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(get(r, k))), b),
    gte: (k: string, v: unknown) => (filters.push((r) => String(get(r, k)) >= String(v)), b),
    not: (k: string, op: string, v: unknown) => (filters.push((r) => (op === "is" && v === null ? get(r, k) !== null && get(r, k) !== undefined : !String(v).includes(String(get(r, k))))), b),
    or: () => b,
    order: (col: string, opts?: { ascending?: boolean }) => (orders.push({ col, asc: opts?.ascending !== false }), b),
    range: (f: number, t: number) => ((range = [f, t]), db.ranges.push({ table, from: f, to: t }), b),
    limit: (n: number) => ((limit = n), b),
    then: (resolve: (v: unknown) => void) => {
      if (db.failing.has(table)) return resolve({ data: null, error: { code: "57014", message: "statement timeout" }, count: null });
      let rows = (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      for (const o of [...orders].reverse()) rows = [...rows].sort((a, c) => (get(a, o.col) === get(c, o.col) ? 0 : (String(get(a, o.col)) < String(get(c, o.col)) ? -1 : 1) * (o.asc ? 1 : -1)));
      const total = rows.length;
      if (range) rows = rows.slice(range[0], range[1] + 1);
      if (limit !== null) rows = rows.slice(0, limit);
      rows = rows.slice(0, MAX_ROWS); // plafond PostgREST
      return resolve({ data: head ? null : rows, error: null, count: count ? total : null });
    },
  };
  return b;
}

const ORG = "00000000-0000-4000-8000-000000000001";
const ctx = {
  supabase: { from },
  organization: { id: ORG, default_currency: "EUR", name: "Org" },
  user: { id: "u" },
  role: "owner",
  memberships: [],
} as never;

const NOW = new Date("2026-10-07T12:00:00Z");
const MARGIN_CTX = { feePercent: 10, paymentFeePercent: null, paymentFeeFixed: null, shippingCost: null };
function stockRow(over: Partial<StockOverviewRow>): StockOverviewRow {
  return {
    active_listings_count: 0, avg_sale_price_30d: null, barcode: null, best_supplier_price: null, brand: null, category: null, channel_providers: [], code: "SKU", condition: "unknown",
    cost_price: 50, currency: "EUR", default_supplier_id: null, first_sale_at: null, foreign_currency_units_30d: 0, grade: null, image_url: null, is_active: true, last_movement_at: null,
    last_sale_at: null, lead_time_days: null, location: null, organization_id: ORG, product_archived: false, product_id: "p", product_name: "Produit", quantity_available: 10,
    quantity_on_hand: 10, quantity_reserved: 0, reorder_point: 0, revenue_30d: 0, safety_stock: 0, sale_price: 100, sku_id: "sku", stock_value: null, supplier_ids: [],
    supplier_offers_count: 0, unit_margin: null, units_30d: 0, units_7d: 0, units_90d: 0, units_prev_30d: 0, units_prev_7d: 0, variant_id: "v", variant_name: "Standard",
    ...over,
  } as StockOverviewRow;
}
const stockViews = { views: [] as ReturnType<typeof enrichStockRow>[], truncated: false };
vi.mock("@/features/analytics/stock-analytics", () => ({
  loadStockViews: async () => ({ views: stockViews.views, marginCtx: MARGIN_CTX, truncated: stockViews.truncated, now: NOW }),
}));

const { listSuppliers, SUPPLIER_OFFERS_SCAN_MAX } = await import("@/features/suppliers/queries");
const { findOpportunities } = await import("@/features/analytics/opportunities");
const { computeRecommendationsWithCoverage } = await import("@/features/analytics/replenishment");
const { loadMarginOrders, MARGIN_ORDERS_MAX } = await import("@/features/dashboard/queries");
const { listOrders, PENDING_ORDERS_MAX } = await import("@/features/analytics/sales");

const pad = (n: number) => String(n).padStart(6, "0");

beforeEach(() => {
  db.tables = {};
  db.failing = new Set();
  db.ranges = [];
  stockViews.views = [];
  stockViews.truncated = false;
});

describe("fournisseurs : compteurs exacts au-delà de 1 000 offres", () => {
  beforeEach(() => {
    db.tables.suppliers = [
      { id: "A", organization_id: ORG, is_archived: false, name: "A" },
      { id: "B", organization_id: ORG, is_archived: false, name: "B" },
    ];
    db.tables.sourcing_offers = [
      ...Array.from({ length: 2500 }, (_, i) => ({ id: `a${pad(i)}`, organization_id: ORG, status: "active", supplier_id: "A" })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `b${pad(i)}`, organization_id: ORG, status: "active", supplier_id: "B" })),
    ];
    db.tables.supplier_sources = Array.from({ length: 1200 }, (_, i) => ({ id: `s${pad(i)}`, organization_id: ORG, supplier_id: i % 2 ? "A" : "B", source_type: "FEED", last_sync_at: null }));
    db.tables.supplier_feeds = [];
  });

  it("2 510 offres et 1 200 sources comptées en entier (lecture paginée)", async () => {
    const rows = await listSuppliers(ctx);
    expect(rows.map((r) => [r.supplier.id, r.offersCount, r.offersCountExact, r.sourcesCount])).toEqual([
      ["A", 2500, true, 600],
      ["B", 10, true, 600],
    ]);
    expect(db.ranges.filter((r) => r.table === "sourcing_offers").length).toBeGreaterThanOrEqual(3);
  });

  it("lecture des offres en échec : « inconnu » (null), jamais 0 (W-14)", async () => {
    db.failing.add("sourcing_offers");
    const rows = await listSuppliers(ctx);
    expect(rows.every((r) => r.offersCount === null && r.offersCountExact === false)).toBe(true);
    expect(rows[0]!.sourcesCount).toBe(600);
  });

  it("au-delà de la borne : minimum signalé", async () => {
    db.tables.sourcing_offers = Array.from({ length: SUPPLIER_OFFERS_SCAN_MAX + 5 }, (_, i) => ({ id: `a${pad(i)}`, organization_id: ORG, status: "active", supplier_id: "A" }));
    const rows = await listSuppliers(ctx);
    expect(rows[0]).toMatchObject({ offersCount: SUPPLIER_OFFERS_SCAN_MAX, offersCountExact: false });
  });

  it("liste des fournisseurs en échec : erreur (pas de liste vide trompeuse)", async () => {
    db.failing.add("suppliers");
    await expect(listSuppliers(ctx)).rejects.toMatchObject({ name: "AppError" });
  });
});

describe("opportunités : toutes les offres rapprochées sont lues", () => {
  it("un SKU dont la seule offre est la 1 501e moins chère n'est plus oublié", async () => {
    stockViews.views = [
      enrichStockRow(stockRow({ sku_id: "S1", code: "S1", sale_price: 100000 }), MARGIN_CTX, NOW),
      enrichStockRow(stockRow({ sku_id: "S2", code: "S2", sale_price: 100000 }), MARGIN_CTX, NOW),
    ];
    const offer = (id: string, sku: string, price: number) => ({
      id, organization_id: ORG, status: "active", sku_id: sku, supplier_id: "A", normalized_price: price, normalized_currency: "EUR", source_type: "FEED", tax_type: "ht", original_price: price, original_currency: "EUR",
      title_original: id, stock_status: "in_stock", last_seen_at: NOW.toISOString(), last_price_at: NOW.toISOString(), supplier: { id: "A", name: "A", country: "FR" },
    });
    db.tables.sourcing_offers = [...Array.from({ length: 1500 }, (_, i) => offer(`o${pad(i)}`, "S1", 100 + i)), offer("zz", "S2", 9999)];
    db.tables.sourcing_alert_events = [];
    const data = await findOpportunities(ctx);
    const bySku = Object.fromEntries(data.items.map((i) => [i.skuId, i]));
    expect(bySku.S1?.offersCount).toBe(1500);
    expect(bySku.S1?.offer.normalizedPrice).toBe(100);
    expect(bySku.S2?.offer.id).toBe("zz");
    expect(data.offersTruncated).toBe(false);
  });
});

describe("réassort : commandes fournisseur en cours au-delà de 1 000 lignes", () => {
  it("toutes les lignes en commande sont additionnées ; borne atteinte → partiel", async () => {
    stockViews.views = [enrichStockRow(stockRow({ sku_id: "S1", code: "S1", quantity_available: 0, quantity_on_hand: 0, units_30d: 30, units_7d: 7, units_90d: 90, last_sale_at: "2026-10-06T00:00:00Z", first_sale_at: "2026-06-01T00:00:00Z" }), MARGIN_CTX, NOW)];
    db.tables.sourcing_offers = [];
    db.tables.suppliers = [];
    db.tables.purchase_order_items = Array.from({ length: 1500 }, (_, i) => ({ id: `p${pad(i)}`, organization_id: ORG, sku_id: "S1", quantity_ordered: 1, quantity_received: 0, purchase_orders: { status: "sent" } }));
    const r = await computeRecommendationsWithCoverage(ctx);
    expect(r.drafts.find((d) => d.skuId === "S1")?.onOrder).toBe(1500);
    expect(r.truncated).toBe(false);
    stockViews.truncated = true;
    expect((await computeRecommendationsWithCoverage(ctx)).truncated).toBe(true);
  });
});

describe("tableau de bord : marge du jour", () => {
  const order = (i: number) => ({ id: `c${pad(i)}`, organization_id: ORG, status: "paid", placed_at: new Date(NOW.getTime() - 3_600_000).toISOString(), currency: "EUR", fee_total: 0, items: [] });
  it("1 500 commandes sur 36 h : toutes lues", async () => {
    db.tables.orders = Array.from({ length: 1500 }, (_, i) => order(i));
    expect(await loadMarginOrders(ctx, NOW)).toHaveLength(1500);
  });
  it("au-delà de la borne ou en échec : marge inconnue (null), jamais partielle", async () => {
    db.tables.orders = Array.from({ length: MARGIN_ORDERS_MAX + 1 }, (_, i) => order(i));
    expect(await loadMarginOrders(ctx, NOW)).toBeNull();
    db.failing.add("orders");
    expect(await loadMarginOrders(ctx, NOW)).toBeNull();
  });
});

describe("ventes : filtre « stock non déduit »", () => {
  it("lignes lues en entier ; trop de commandes → liste signalée partielle", async () => {
    db.tables.sales_channels = [];
    db.tables.order_items = Array.from({ length: 1500 }, (_, i) => ({ id: `i${pad(i)}`, organization_id: ORG, order_id: `c${pad(i)}`, inventory_applied: false, sku_id: "S1", created_at: NOW.toISOString(), quantity: 1 }));
    db.tables.orders = Array.from({ length: 1500 }, (_, i) => ({ id: `c${pad(i)}`, organization_id: ORG, status: "paid", placed_at: NOW.toISOString() }));
    const r = await listOrders(ctx, { page: 1, inventory: "pending" } as never);
    expect(r.partial).toBe(true);
    expect(r.total).toBe(PENDING_ORDERS_MAX);
    expect(db.ranges.filter((x) => x.table === "order_items").length).toBe(2);
  });
});

describe("garde-fou statique : plus de `.limit(> 1000)` dans le code web", () => {
  it("src/app, src/features, src/lib, src/components", () => {
    const root = path.resolve(__dirname, "../../src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          // Code seulement (les commentaires peuvent citer l'anti-modèle).
          const code = fs.readFileSync(p, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
          for (const m of code.matchAll(/\.limit\(\s*([\d_]+)\s*\)/g)) if (Number(m[1]!.replace(/_/g, "")) > MAX_ROWS) offenders.push(`${path.relative(root, p)}: ${m[0]}`);
        }
      }
    };
    for (const d of ["app", "features", "lib", "components"]) walk(path.join(root, d));
    expect(offenders).toEqual([]);
  });
});
