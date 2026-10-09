import { describe, expect, it } from "vitest";
import { asService, asUser, canConnect, createOrgAs, createSkuAs, createUser, withRollback, expectQueryError, expectAsyncError } from "./helpers";

const available = await canConnect();
const d = available ? describe : describe.skip;

d("Calcul de stock (apply_inventory_movement)", () => {
  it("applique les mouvements dans l'ordre et journalise quantity_after", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "stock@example.test");
      const org = await createOrgAs(c, u, "Org", "org-stock");
      const sku = await createSkuAs(c, u, org, "IPH13-128-BLK-A", { initial: 10 });
      // Ventes marketplace : appliquées par le serveur (service_role), seul appelant direct autorisé.
      await asService(c);
      await c.query("select public.apply_inventory_movement($1, $2, 'sale', -3, 'order_item', null, 'ebay')", [org, sku]);
      await c.query("select public.apply_inventory_movement($1, $2, 'sale', -2, 'order_item', null, 'amazon')", [org, sku]);
      await c.query("select public.apply_inventory_movement($1, $2, 'sale', -1, 'order_item', null, 'shopify')", [org, sku]);
      const { rows } = await c.query("select quantity_on_hand, quantity_available from public.inventory where sku_id = $1", [sku]);
      expect(rows[0].quantity_on_hand).toBe(4);
      expect(rows[0].quantity_available).toBe(4);
      const mv = await c.query("select type, quantity, quantity_after, channel from public.inventory_movements where sku_id = $1 order by created_at", [sku]);
      expect(mv.rows.map((r) => [r.type, r.quantity, r.quantity_after])).toEqual([
        ["initial", 10, 10],
        ["sale", -3, 7],
        ["sale", -2, 5],
        ["sale", -1, 4],
      ]);
    });
  });

  it("refuse un ajustement qui rendrait le stock négatif mais accepte une vente réelle", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "stock2@example.test");
      const org = await createOrgAs(c, u, "Org", "org-stock2");
      const sku = await createSkuAs(c, u, org, "SKU-NEG", { initial: 1 });
      await asUser(c, u);
      await expectQueryError(c, "select public.apply_inventory_movement($1, $2, 'adjustment', -5)", [org, sku], "INSUFFICIENT_STOCK");
      await asService(c);
      await c.query("select public.apply_inventory_movement($1, $2, 'sale', -2, 'order_item', null, 'ebay')", [org, sku]);
      const { rows } = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(rows[0].quantity_on_hand).toBe(-1);
    });
  });

  it("gère la réservation", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "stock3@example.test");
      const org = await createOrgAs(c, u, "Org", "org-stock3");
      const sku = await createSkuAs(c, u, org, "SKU-RES", { initial: 10 });
      await asUser(c, u);
      await c.query("select public.adjust_reserved_quantity($1, $2, 4)", [org, sku]);
      let r = await c.query("select quantity_available, quantity_reserved from public.inventory where sku_id = $1", [sku]);
      expect(r.rows[0]).toMatchObject({ quantity_available: 6, quantity_reserved: 4 });
      await c.query("select public.adjust_reserved_quantity($1, $2, -10)", [org, sku]);
      r = await c.query("select quantity_available, quantity_reserved from public.inventory where sku_id = $1", [sku]);
      expect(r.rows[0]).toMatchObject({ quantity_available: 10, quantity_reserved: 0 });
    });
  });

  it("enregistre l'historique des prix et refuse un SKU en doublon", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "stock4@example.test");
      const org = await createOrgAs(c, u, "Org", "org-stock4");
      const sku = await createSkuAs(c, u, org, "SKU-PRICE", { cost: 200, sale: 300 });
      await asUser(c, u);
      await c.query("update public.skus set cost_price = 190 where id = $1", [sku]);
      const { rows } = await c.query("select kind, price from public.price_history where sku_id = $1 order by recorded_at, kind", [sku]);
      expect(rows.map((r) => [r.kind, Number(r.price)])).toEqual([
        ["cost", 200],
        ["sale", 300],
        ["cost", 190],
      ]);
      await expectAsyncError(c, () => createSkuAs(c, u, org, "sku-price"), "SKU_CODE_EXISTS");
    });
  });
});
