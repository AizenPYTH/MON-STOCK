import { describe, expect, it } from "vitest";
import { asUser, canConnect, createOrgAs, createSkuAs, createUser, withRollback } from "./helpers";

const available = await canConnect();
const d = available ? describe : describe.skip;

d("Historique des offres fournisseurs (triggers)", () => {
  it("conserve l'historique des prix et du stock sans écraser", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "sourcing@example.test");
      const org = await createOrgAs(c, u, "Org", "org-sourcing");
      const sku = await createSkuAs(c, u, org, "IPH13-128-BLK-A", { cost: 250 });
      await asUser(c, u);
      const { rows: s } = await c.query("insert into public.suppliers (organization_id, name, country) values ($1, 'XYZ Distribution', 'FR') returning id", [org]);
      const { rows: src } = await c.query("insert into public.supplier_sources (organization_id, supplier_id, name, source_type) values ($1, $2, 'Saisie manuelle', 'MANUAL') returning id", [org, s[0].id]);
      const { rows: o } = await c.query(
        `insert into public.sourcing_offers (organization_id, supplier_id, source_id, source_type, external_offer_id, title_original, original_price, original_currency, normalized_price, normalized_currency, tax_type, moq, available_quantity, stock_status, sku_id)
         values ($1, $2, $3, 'MANUAL', 'OFF-1', 'Apple iPhone 13 128GB Black Grade A', 249, 'EUR', 249, 'EUR', 'ht', 10, 500, 'in_stock', $4) returning id`,
        [org, s[0].id, src[0].id, sku],
      );
      const offerId = o[0].id;
      await c.query("update public.sourcing_offers set original_price = 242, normalized_price = 242 where id = $1", [offerId]);
      await c.query("update public.sourcing_offers set original_price = 229, normalized_price = 229, available_quantity = 30, stock_status = 'low' where id = $1", [offerId]);
      await c.query("update public.sourcing_offers set last_seen_at = now() where id = $1", [offerId]); // pas de changement de prix → pas d'historique

      const prices = await c.query("select original_price from public.supplier_price_history where offer_id = $1 order by recorded_at", [offerId]);
      expect(prices.rows.map((r) => Number(r.original_price))).toEqual([249, 242, 229]);
      const stocks = await c.query("select available_quantity, stock_status from public.supplier_stock_history where offer_id = $1 order by recorded_at", [offerId]);
      expect(stocks.rows.map((r) => [r.available_quantity, r.stock_status])).toEqual([
        [500, "in_stock"],
        [30, "low"],
      ]);
      const view = await c.query("select best_supplier_price, supplier_offers_count from public.v_stock_overview where sku_id = $1", [sku]);
      expect(Number(view.rows[0].best_supplier_price)).toBe(229);
      expect(view.rows[0].supplier_offers_count).toBe(1);
      const so = await c.query("select count(*)::int as n from public.supplier_offers where sku_id = $1", [sku]);
      expect(so.rows[0].n).toBe(1);
    });
  });

  it("réception de commande fournisseur → mouvements de stock et coût de référence", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "po@example.test");
      const org = await createOrgAs(c, u, "Org", "org-po");
      const sku = await createSkuAs(c, u, org, "SKU-PO", { initial: 0, cost: null });
      await asUser(c, u);
      const { rows: s } = await c.query("insert into public.suppliers (organization_id, name) values ($1, 'Fournisseur A') returning id", [org]);
      // Un client crée la commande en brouillon, ajoute ses lignes, puis l'envoie.
      const { rows: po } = await c.query("insert into public.purchase_orders (organization_id, supplier_id, status, reference) values ($1, $2, 'draft', 'PO-1') returning id", [org, s[0].id]);
      const { rows: it } = await c.query("insert into public.purchase_order_items (organization_id, purchase_order_id, sku_id, quantity_ordered, unit_cost, currency) values ($1, $2, $3, 20, 251, 'EUR') returning id", [org, po[0].id, sku]);
      await c.query("update public.purchase_orders set status = 'sent' where id = $1", [po[0].id]);
      const partial = await c.query("select (public.receive_purchase_order_items($1, $2::jsonb)).status as s", [po[0].id, JSON.stringify([{ item_id: it[0].id, quantity: 5 }])]);
      expect(partial.rows[0].s).toBe("partially_received");
      const full = await c.query("select (public.receive_purchase_order_items($1, $2::jsonb)).status as s", [po[0].id, JSON.stringify([{ item_id: it[0].id, quantity: 100 }])]);
      expect(full.rows[0].s).toBe("received");
      const inv = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(inv.rows[0].quantity_on_hand).toBe(20);
      const skuRow = await c.query("select cost_price from public.skus where id = $1", [sku]);
      expect(Number(skuRow.rows[0].cost_price)).toBe(251);
    });
  });
});
