import { applyMovement, fetchStockPage, STOCK_PAGE_SIZE } from "~/data/stock";
import { fakeSupabase } from "./fake-supabase";

const ORG = "11111111-1111-4111-8111-111111111111";
const SKU = "22222222-2222-4222-8222-222222222222";
const marginCtx = { feePercent: null, paymentFeePercent: null, paymentFeeFixed: null, shippingCost: null };

function row(overrides: Record<string, unknown> = {}) {
  return {
    sku_id: SKU,
    code: "IP13-128-A",
    product_name: "iPhone 13",
    variant_name: "128 Go",
    quantity_available: 0,
    quantity_on_hand: 0,
    quantity_reserved: 0,
    reorder_point: 2,
    safety_stock: 1,
    lead_time_days: null,
    units_7d: 0,
    units_30d: 0,
    units_90d: 0,
    units_prev_7d: 0,
    units_prev_30d: 0,
    first_sale_at: null,
    last_sale_at: null,
    sale_price: 400,
    cost_price: 300,
    currency: "EUR",
    ...overrides,
  };
}

describe("lecture du stock (RLS + filtres identiques au web)", () => {
  it("filtre toujours par organisation et SKU actifs, applique recherche, filtre et pagination", async () => {
    const { client, queries } = fakeSupabase({ v_stock_overview: { data: [row()], count: 45 } });
    const page = await fetchStockPage(client, ORG, { q: "iphone 13", filter: "empty", sort: "low_stock", page: 2 }, marginCtx);
    const q = queries.find((x) => x.target === "v_stock_overview")!;
    const call = (m: string) => q.calls.filter((c) => c.method === m).map((c) => c.args);
    expect(call("eq")).toEqual(expect.arrayContaining([["organization_id", ORG], ["is_active", true]]));
    expect(call("lte")).toEqual([["quantity_available", 0]]);
    expect(String(call("or")[0]?.[0])).toContain("product_name.ilike");
    expect(call("range")).toEqual([[STOCK_PAGE_SIZE, 2 * STOCK_PAGE_SIZE - 1]]);
    // Départage stable sur sku_id (aucune ligne ne change de page).
    expect(call("order").at(-1)).toEqual(["sku_id", { ascending: true }]);
    expect(page.total).toBe(45);
    expect(page.hasMore).toBe(true); // 30 + 1 lignes lues sur 45
    // Statut calculé par le domaine partagé : stock à 0 → rupture.
    expect(page.rows[0]?.classification.level).toBe("out_of_stock");
  });

  it("une recherche avec virgules ou parenthèses ne casse pas le filtre PostgREST", async () => {
    const { client, queries } = fakeSupabase({ v_stock_overview: { data: [], count: 0 } });
    await fetchStockPage(client, ORG, { q: "iPhone 13, Pro (A)", filter: "all", sort: "name", page: 1 }, marginCtx);
    const or = queries[0]!.calls.find((c) => c.method === "or")!.args[0] as string;
    expect(or).not.toMatch(/,\s*Pro \(A\)/);
  });

  it("propage l'erreur de la base (affichée traduite par l'écran)", async () => {
    const { client } = fakeSupabase({ v_stock_overview: { error: { code: "42501", message: "permission denied" } } });
    await expect(fetchStockPage(client, ORG, { filter: "all", sort: "name", page: 1 }, marginCtx)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("mouvement de stock (apply_inventory_movement)", () => {
  it("envoie une quantité signée, l'organisation active et le type manuel", async () => {
    const { client, queries } = fakeSupabase({ "rpc:apply_inventory_movement": { data: { quantity_after: 3 } } });
    const r = await applyMovement(client, ORG, { sku_id: SKU, type: "transfer_out", direction: "in", quantity: 2, note: "" });
    expect(r.quantityAfter).toBe(3);
    const args = queries.find((q) => q.target === "rpc:apply_inventory_movement")!.calls[0]!.args[0] as Record<string, unknown>;
    // transfer_out est TOUJOURS une sortie, quel que soit le sens choisi.
    expect(args).toMatchObject({ p_organization_id: ORG, p_sku_id: SKU, p_type: "transfer_out", p_quantity: -2, p_reference_type: "manual", p_channel: "manual" });
    expect(args.p_note).toBeUndefined();
  });

  it("refuse une quantité invalide sans appeler la base", async () => {
    const { client, queries } = fakeSupabase();
    await expect(applyMovement(client, ORG, { sku_id: SKU, type: "adjustment", direction: "out", quantity: 0 })).rejects.toThrow(/au moins 1/);
    expect(queries).toHaveLength(0);
  });

  it("traduit le refus de la base (stock insuffisant) sans message SQL brut", async () => {
    const { client } = fakeSupabase({ "rpc:apply_inventory_movement": { error: { code: "P0001", message: "INSUFFICIENT_STOCK" } } });
    await expect(applyMovement(client, ORG, { sku_id: SKU, type: "adjustment", direction: "out", quantity: 5 })).rejects.toThrow(/Stock insuffisant/);
  });
});
