/** M-25 : pagination des commandes par curseur (ni doublon ni saut quand une commande arrive). */
import { fetchListings, fetchOrdersFiltered, SALES_PAGE_SIZE } from "~/data/sales";
import { fakeSupabase } from "./fake-supabase";

const ORG = "11111111-1111-4111-8111-111111111111";
const order = (i: number, placedAt: string | null) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, placed_at: placedAt });

describe("commandes par curseur", () => {
  it("première page : pas de filtre de curseur, une ligne lue en plus, aucun comptage exact", async () => {
    const rows = Array.from({ length: SALES_PAGE_SIZE + 1 }, (_, i) => order(i, `2026-10-2${i % 9}T10:00:00.000Z`));
    const { client, queries } = fakeSupabase({ orders: { data: rows } });
    const r = await fetchOrdersFiltered(client, ORG, { cursor: null });
    const calls = queries[0]!.calls;
    expect(calls.find((c) => c.method === "select")!.args[1]).toBeUndefined();
    expect(calls.find((c) => c.method === "or")).toBeUndefined();
    expect(calls.find((c) => c.method === "limit")!.args).toEqual([SALES_PAGE_SIZE + 1]);
    expect(r.rows).toHaveLength(SALES_PAGE_SIZE);
    expect(r.hasMore).toBe(true);
    expect(r.nextCursor).toEqual({ placedAt: rows[SALES_PAGE_SIZE - 1]!.placed_at, id: rows[SALES_PAGE_SIZE - 1]!.id });
  });

  it("page suivante : reprend STRICTEMENT après la dernière ligne lue (date puis id, dates inconnues à la fin)", async () => {
    const { client, queries } = fakeSupabase({ orders: { data: [order(1, "2026-10-20T09:00:00.000Z")] } });
    const r = await fetchOrdersFiltered(client, ORG, { status: "paid", cursor: { placedAt: "2026-10-21T08:30:00.000Z", id: "abc" } });
    const or = queries[0]!.calls.find((c) => c.method === "or")!.args[0];
    expect(or).toBe('placed_at.lt."2026-10-21T08:30:00.000Z",and(placed_at.eq."2026-10-21T08:30:00.000Z",id.gt.abc),placed_at.is.null');
    expect(queries[0]!.calls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual([["organization_id", ORG], ["status", "paid"]]);
    expect(r.hasMore).toBe(false);
    expect(r.nextCursor).toBeNull();
  });

  it("curseur dans les commandes sans date : seulement les suivantes sans date", async () => {
    const { client, queries } = fakeSupabase({ orders: { data: [] } });
    await fetchOrdersFiltered(client, ORG, { cursor: { placedAt: null, id: "x1" } });
    const calls = queries[0]!.calls;
    expect(calls.find((c) => c.method === "is")!.args).toEqual(["placed_at", null]);
    expect(calls.find((c) => c.method === "gt")!.args).toEqual(["id", "x1"]);
  });

  it("annonces : pas de comptage exact par page, « il en reste » signalé", async () => {
    const { client, queries } = fakeSupabase({ channel_listings: { data: Array.from({ length: 31 }, (_, i) => ({ id: String(i) })) } });
    const r = await fetchListings(client, ORG, 1);
    expect(queries[0]!.calls.find((c) => c.method === "select")!.args[1]).toBeUndefined();
    expect(r.rows).toHaveLength(30);
    expect(r.hasMore).toBe(true);
  });
});
