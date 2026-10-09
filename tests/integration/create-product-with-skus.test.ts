/**
 * create_product_with_skus : produit + N variantes + SKU + stock initial dans UNE transaction,
 * via create_sku (droits, unicité du code, mouvement « initial ») — aucune règle de stock parallèle.
 */
import { describe, expect, it } from "vitest";
import { asUser, canConnect, createOrgAs, createUser, expectQueryError, withRollback } from "./helpers";

const available = await canConnect();
const d = available ? describe : describe.skip;

const CALL = "select public.create_product_with_skus($1, $2::jsonb, $3::jsonb, $4) as r";

function item(code: string, opts: { storage?: string; color?: string; grade?: string; condition?: string; cost?: number; sale?: number; qty?: number } = {}) {
  return {
    variant: {
      name: [opts.storage, opts.color, opts.grade ? `Grade ${opts.grade}` : null].filter(Boolean).join(" / ") || "Standard",
      condition: opts.condition ?? "refurbished",
      grade: opts.grade ?? null,
      attributes: { ...(opts.storage ? { storage: opts.storage } : {}), ...(opts.color ? { color: opts.color } : {}), ...(opts.grade ? { grade: opts.grade } : {}) },
    },
    sku: { code, cost_price: opts.cost ?? null, sale_price: opts.sale ?? null, currency: "EUR" },
    initial_quantity: opts.qty ?? 0,
  };
}

d("create_product_with_skus (SQL)", () => {
  it("crée un iPhone 13 grade B 128 Go avec prix et stock initial, retrouvable dans le catalogue", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "cpws-1@example.test");
      const org = await createOrgAs(c, u, "Org", "cpws-1");
      await asUser(c, u);
      const r = await c.query(CALL, [org, JSON.stringify([item("IP13-128-NOIR-B", { storage: "128 Go", color: "Noir", grade: "B", cost: 310, sale: 429, qty: 3 })]), JSON.stringify({ name: "Apple iPhone 13", brand: "Apple", category: "Smartphone", model: "iPhone 13" }), null]);
      const res = r.rows[0].r as { product_id: string; skus: Array<{ sku_id: string; code: string }> };
      expect(res.skus).toHaveLength(1);
      const { rows } = await c.query(
        "select product_name, brand, category, code, grade, condition::text, cost_price::float, sale_price::float, quantity_on_hand from public.v_stock_overview where sku_id = $1",
        [res.skus[0]!.sku_id],
      );
      expect(rows[0]).toMatchObject({ product_name: "Apple iPhone 13", brand: "Apple", category: "Smartphone", code: "IP13-128-NOIR-B", grade: "B", condition: "refurbished", cost_price: 310, sale_price: 429, quantity_on_hand: 3 });
      const mv = await c.query("select type::text, quantity, quantity_after, created_by from public.inventory_movements where sku_id = $1", [res.skus[0]!.sku_id]);
      expect(mv.rows).toEqual([{ type: "initial", quantity: 3, quantity_after: 3, created_by: u }]);
      const p = await c.query("select attributes, model_normalized from public.products where id = $1", [res.product_id]);
      expect(p.rows[0].attributes).toMatchObject({ model: "iPhone 13" });
      expect(p.rows[0].model_normalized).toBe("iphone 13");
    });
  });

  it("plusieurs variantes → un seul produit, une variante et un SKU chacune", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "cpws-2@example.test");
      const org = await createOrgAs(c, u, "Org", "cpws-2");
      await asUser(c, u);
      const r = await c.query(CALL, [org, JSON.stringify([item("S22-128-A", { storage: "128 Go", grade: "A", qty: 2 }), item("S22-256-B", { storage: "256 Go", grade: "B" })]), JSON.stringify({ name: "Galaxy S22", brand: "Samsung" }), null]);
      const res = r.rows[0].r as { product_id: string; skus: Array<{ sku_id: string }> };
      const { rows } = await c.query("select count(distinct product_id)::int as products, count(*)::int as skus, sum(quantity_on_hand)::int as qty from public.v_stock_overview where organization_id = $1", [org]);
      expect(rows[0]).toEqual({ products: 1, skus: 2, qty: 2 });
      expect(res.skus).toHaveLength(2);
    });
  });

  it("ajoute des variantes à un produit existant (p_product_id)", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "cpws-3@example.test");
      const org = await createOrgAs(c, u, "Org", "cpws-3");
      await asUser(c, u);
      const first = await c.query(CALL, [org, JSON.stringify([item("P-1")]), JSON.stringify({ name: "Produit" }), null]);
      const productId = (first.rows[0].r as { product_id: string }).product_id;
      const second = await c.query(CALL, [org, JSON.stringify([item("P-2", { grade: "C" })]), null, productId]);
      expect((second.rows[0].r as { product_id: string }).product_id).toBe(productId);
      const { rows } = await c.query("select count(*)::int as n from public.skus where product_id = $1", [productId]);
      expect(rows[0].n).toBe(2);
    });
  });

  it("code déjà pris sur la 2e variante → RIEN n'est créé (atomicité)", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "cpws-4@example.test");
      const org = await createOrgAs(c, u, "Org", "cpws-4");
      await asUser(c, u);
      await c.query(CALL, [org, JSON.stringify([item("TAKEN")]), JSON.stringify({ name: "Existant" }), null]);
      await expectQueryError(c, CALL, [org, JSON.stringify([item("NEW-1", { qty: 5 }), item("taken")]), JSON.stringify({ name: "Nouveau" }), null], "SKU_CODE_EXISTS");
      const { rows } = await c.query("select count(*)::int as n from public.products where organization_id = $1 and name = 'Nouveau'", [org]);
      expect(rows[0].n).toBe(0);
    });
  });

  it("codes en double dans le même envoi, liste vide, nom manquant → refus explicites", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "cpws-5@example.test");
      const org = await createOrgAs(c, u, "Org", "cpws-5");
      await asUser(c, u);
      await expectQueryError(c, CALL, [org, JSON.stringify([item("DUP"), item("dup")]), JSON.stringify({ name: "X" }), null], "SKU_CODE_DUPLICATE_IN_REQUEST");
      await expectQueryError(c, CALL, [org, JSON.stringify([]), JSON.stringify({ name: "X" }), null], "VARIANTS_REQUIRED");
      await expectQueryError(c, CALL, [org, JSON.stringify([item("A")]), JSON.stringify({ name: " " }), null], "PRODUCT_NAME_REQUIRED");
    });
  });

  it("un membre lecteur (viewer) ou d'une autre organisation ne peut rien créer", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "cpws-6@example.test");
      const org = await createOrgAs(c, owner, "Org", "cpws-6");
      const stranger = await createUser(c, "cpws-7@example.test");
      await createOrgAs(c, stranger, "Autre", "cpws-7");
      await asUser(c, stranger);
      await expectQueryError(c, CALL, [org, JSON.stringify([item("X-1")]), JSON.stringify({ name: "Intrus" }), null], "FORBIDDEN");
    });
  });
});
