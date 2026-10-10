/**
 * Migration 20261010000300 : un remboursement APRÈS expédition ne recrédite plus le stock
 * automatiquement (l'article n'est pas forcément revenu) et ouvre une alerte ; avant expédition,
 * le recrédit (une seule fois) est inchangé.
 */
import { describe, expect, it } from "vitest";
import { asService, canConnect, createOrgAs, createSkuAs, createUser, manualChannelId, withRollback } from "./helpers";

const available = await canConnect();
const d = available ? describe : describe.skip;

const order = (o: Record<string, unknown> = {}) => ({ external_order_id: "EBAY-R-1", order_number: "12-00000-00001", status: "paid", currency: "EUR", total: 429, placed_at: "2026-10-01T10:00:00Z", ...o });
const items = [{ external_line_item_id: "L1", external_listing_id: "ITEM-1", external_variation_id: "", external_sku: "IP13-REF", title: "iPhone 13", quantity: 1, unit_price: 429, currency: "EUR", total: 429 }];
const CALL = "select public.ingest_external_order($1, $2, null, 'ebay', $3::jsonb, $4::jsonb) as r";

d("Remboursements et stock", () => {
  it("remboursé après expédition : aucun recrédit, alerte unique « Remboursement après expédition »", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "refund1@example.test");
      const org = await createOrgAs(c, u, "Org", "refund-1");
      const sku = await createSkuAs(c, u, org, "IP13-REF", { initial: 5 });
      const channel = await manualChannelId(c, org);
      await asService(c);
      await c.query(CALL, [org, channel, JSON.stringify(order()), JSON.stringify(items)]);
      await c.query(CALL, [org, channel, JSON.stringify(order({ status: "shipped", fulfillment_status: "FULFILLED" })), JSON.stringify(items)]);
      const refund = await c.query(CALL, [org, channel, JSON.stringify(order({ status: "refunded" })), JSON.stringify(items)]);
      expect(refund.rows[0].r).toMatchObject({ movements: 0 });
      await c.query(CALL, [org, channel, JSON.stringify(order({ status: "refunded" })), JSON.stringify(items)]);
      const inv = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(inv.rows[0].quantity_on_hand).toBe(4);
      const alerts = await c.query("select type, severity, status, message from public.alerts where organization_id = $1 and type = 'refund_after_shipment'", [org]);
      expect(alerts.rows).toHaveLength(1);
      expect(alerts.rows[0]).toMatchObject({ severity: "warning", status: "open" });
      expect(alerts.rows[0].message).toMatch(/Retour client/);
    });
  });

  it("remboursé avant expédition (fulfillment NOT_STARTED) : recrédit une seule fois, aucune alerte", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "refund2@example.test");
      const org = await createOrgAs(c, u, "Org", "refund-2");
      const sku = await createSkuAs(c, u, org, "IP13-REF", { initial: 5 });
      const channel = await manualChannelId(c, org);
      await asService(c);
      await c.query(CALL, [org, channel, JSON.stringify(order({ fulfillment_status: "NOT_STARTED" })), JSON.stringify(items)]);
      const refund = await c.query(CALL, [org, channel, JSON.stringify(order({ status: "refunded", fulfillment_status: "NOT_STARTED" })), JSON.stringify(items)]);
      expect(refund.rows[0].r).toMatchObject({ movements: 1 });
      const again = await c.query(CALL, [org, channel, JSON.stringify(order({ status: "refunded", fulfillment_status: "NOT_STARTED" })), JSON.stringify(items)]);
      expect(again.rows[0].r).toMatchObject({ movements: 0 });
      const inv = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(inv.rows[0].quantity_on_hand).toBe(5);
      const alerts = await c.query("select count(*)::int n from public.alerts where organization_id = $1 and type = 'refund_after_shipment'", [org]);
      expect(alerts.rows[0].n).toBe(0);
    });
  });

  it("annulation (toujours avant expédition chez eBay) : recrédit inchangé", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "refund3@example.test");
      const org = await createOrgAs(c, u, "Org", "refund-3");
      const sku = await createSkuAs(c, u, org, "IP13-REF", { initial: 2 });
      const channel = await manualChannelId(c, org);
      await asService(c);
      await c.query(CALL, [org, channel, JSON.stringify(order()), JSON.stringify(items)]);
      await c.query(CALL, [org, channel, JSON.stringify(order({ status: "cancelled" })), JSON.stringify(items)]);
      const inv = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(inv.rows[0].quantity_on_hand).toBe(2);
    });
  });
});
