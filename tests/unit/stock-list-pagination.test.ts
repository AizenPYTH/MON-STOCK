import { describe, expect, it } from "vitest";
import { fetchAllRows, fetchRowsUpTo } from "@/lib/supabase/paginate";
import { listStock, POST_FILTER_LIMIT } from "@/features/stock/queries";
import type { OrgContext } from "@/features/auth/dal";
import type { StockListParams } from "@/features/stock/schemas";

/** Plafond de réponse PostgREST (max_rows) appliqué par Supabase. */
const SERVER_MAX_ROWS = 1000;

/** Faux serveur : renvoie au plus SERVER_MAX_ROWS lignes par réponse, comme PostgREST. */
function cappedServer<T>(data: T[]) {
  const calls: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const n = Math.min(to - from + 1, SERVER_MAX_ROWS);
    return { data: data.slice(from, from + n), error: null };
  };
  return { page, calls };
}

describe("fetchRowsUpTo / fetchAllRows", () => {
  const rows = Array.from({ length: 2500 }, (_, i) => i);

  it("lit au-delà du plafond de 1 000 lignes et détecte la troncature", async () => {
    const { page } = cappedServer(rows);
    const r = await fetchRowsUpTo(page, 2000);
    expect(r.rows).toHaveLength(2000);
    expect(r.rows[1999]).toBe(1999);
    expect(r.truncated).toBe(true);
  });

  it("pas de troncature quand il y a exactement `limit` lignes", async () => {
    const { page } = cappedServer(rows.slice(0, 2000));
    const r = await fetchRowsUpTo(page, 2000);
    expect(r.rows).toHaveLength(2000);
    expect(r.truncated).toBe(false);
  });

  it("s'arrête à la première page incomplète", async () => {
    const { page, calls } = cappedServer(rows.slice(0, 1500));
    const r = await fetchRowsUpTo(page, 2000);
    expect(r).toEqual({ rows: rows.slice(0, 1500), truncated: false });
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("fetchAllRows lit tout (borne maxRows)", async () => {
    expect(await fetchAllRows(cappedServer(rows).page)).toHaveLength(2500);
    expect(await fetchAllRows(cappedServer(rows).page, { maxRows: 1200 })).toHaveLength(1200);
  });

  it("propage l'erreur PostgREST", async () => {
    await expect(fetchRowsUpTo(async () => ({ data: null, error: { code: "42501", message: "denied" } }), 10)).rejects.toMatchObject({ code: "42501" });
  });
});

/**
 * Faux client Supabase minimal : chaque méthode de filtre/tri renvoie le builder, `limit()` / `range()`
 * fixent la fenêtre, et la réponse est plafonnée à 1 000 lignes comme sur PostgREST.
 */
function fakeSupabase(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const data = tables[table] ?? [];
      let offset = 0;
      let limit = Number.POSITIVE_INFINITY;
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ["select", "eq", "neq", "gt", "gte", "lt", "lte", "or", "contains", "not", "order", "ilike", "in"]) builder[m] = chain;
      builder.limit = (n: number) => {
        limit = n;
        return builder;
      };
      builder.range = (from: number, to: number) => {
        offset = from;
        limit = to - from + 1;
        return builder;
      };
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        const n = Math.min(limit, SERVER_MAX_ROWS);
        return Promise.resolve({ data: data.slice(offset, offset + n), error: null, count: data.length }).then(resolve, reject);
      };
      return builder;
    },
  };
}

function lowStockRow(i: number) {
  return {
    sku_id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    organization_id: "org",
    code: `SKU-${i}`,
    product_name: `Produit ${i}`,
    variant_name: "Standard",
    is_active: true,
    quantity_available: 1,
    reorder_point: 5,
    safety_stock: 0,
    units_7d: 0,
    units_30d: 0,
    units_90d: 0,
    units_prev_7d: 0,
    units_prev_30d: 0,
    first_sale_at: null,
    last_sale_at: null,
    lead_time_days: null,
    sale_price: null,
    cost_price: null,
  };
}

describe("listStock — filtres de statut calculés (régression plafond PostgREST)", () => {
  const params = (status: StockListParams["status"], page = 1) => ({ page, status, sort: "name" }) as unknown as StockListParams;

  it("voit les SKU au-delà de la 1 000e ligne et signale la troncature", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => lowStockRow(i));
    const ctx = { organization: { id: "org", settings: {} }, supabase: fakeSupabase({ v_stock_overview: rows }) } as unknown as OrgContext;
    const r = await listStock(ctx, params("low"));
    expect(r.total).toBe(POST_FILTER_LIMIT);
    expect(r.truncated).toBe(true);
    // Dernière page : SKU d'index > 1 000, invisibles avant le correctif.
    const last = await listStock(ctx, params("low", POST_FILTER_LIMIT / r.pageSize));
    expect(last.rows.at(-1)?.row.code).toBe(`SKU-${POST_FILTER_LIMIT - 1}`);
  });

  it("1 500 SKU : tous vus, pas de troncature", async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => lowStockRow(i));
    const ctx = { organization: { id: "org", settings: {} }, supabase: fakeSupabase({ v_stock_overview: rows }) } as unknown as OrgContext;
    const r = await listStock(ctx, params("low"));
    expect(r.total).toBe(1500);
    expect(r.truncated).toBe(false);
  });
});
