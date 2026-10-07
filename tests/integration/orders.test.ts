import { describe, expect, it } from "vitest";
import { asService, asUser, canConnect, createOrgAs, createSkuAs, createUser, manualChannelId, withRollback } from "./helpers";

const available = await canConnect();
const d = available ? describe : describe.skip;

function order(overrides: Record<string, unknown> = {}) {
  return {
    external_order_id: "EBAY-ORDER-1",
    order_number: "12-34567-89012",
    status: "paid",
    currency: "EUR",
    total: 598,
    placed_at: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

const items = [
  { external_line_item_id: "L1", external_listing_id: "ITEM-1", external_variation_id: "", external_sku: "IPH13-128-BLK-A", title: "iPhone 13 128GB Black", quantity: 3, unit_price: 299, currency: "EUR", total: 897 },
  { external_line_item_id: "L2", external_listing_id: "ITEM-2", external_variation_id: "", external_sku: "UNKNOWN-SKU", title: "Mystery", quantity: 1, unit_price: 10, currency: "EUR", total: 10 },
];

d("Idempotence des commandes (ingest_external_order)", () => {
  it("ne décrémente jamais deux fois la même commande", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "orders@example.test");
      const org = await createOrgAs(c, u, "Org", "org-orders");
      const sku = await createSkuAs(c, u, org, "IPH13-128-BLK-A", { initial: 10 });
      const channel = await manualChannelId(c, org);

      await asService(c);
      const first = await c.query("select public.ingest_external_order($1, $2, null, 'ebay', $3::jsonb, $4::jsonb) as r", [org, channel, JSON.stringify(order()), JSON.stringify(items)]);
      expect(first.rows[0].r).toMatchObject({ created: true, items_mapped: 1, items_unmapped: 1, movements: 1 });

      const second = await c.query("select public.ingest_external_order($1, $2, null, 'ebay', $3::jsonb, $4::jsonb) as r", [org, channel, JSON.stringify(order()), JSON.stringify(items)]);
      expect(second.rows[0].r).toMatchObject({ created: false, movements: 0 });

      const third = await c.query("select public.ingest_external_order($1, $2, null, 'ebay', $3::jsonb, $4::jsonb) as r", [org, channel, JSON.stringify(order({ status: "shipped" })), JSON.stringify(items)]);
      expect(third.rows[0].r).toMatchObject({ created: false, status_changed: true, movements: 0 });

      const inv = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(inv.rows[0].quantity_on_hand).toBe(7);
      const orders = await c.query("select count(*)::int as n from public.orders where organization_id = $1", [org]);
      expect(orders.rows[0].n).toBe(1);
    });
  });

  it("recrédite le stock une seule fois à l'annulation", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "orders2@example.test");
      const org = await createOrgAs(c, u, "Org", "org-orders2");
      const sku = await createSkuAs(c, u, org, "IPH13-128-BLK-A", { initial: 10 });
      const channel = await manualChannelId(c, org);
      await asService(c);
      await c.query("select public.ingest_external_order($1, $2, null, 'ebay', $3::jsonb, $4::jsonb)", [org, channel, JSON.stringify(order()), JSON.stringify(items)]);
      const cancel = await c.query("select public.ingest_external_order($1, $2, null, 'ebay', $3::jsonb, $4::jsonb) as r", [org, channel, JSON.stringify(order({ status: "cancelled" })), JSON.stringify(items)]);
      expect(cancel.rows[0].r).toMatchObject({ movements: 1 });
      const again = await c.query("select public.ingest_external_order($1, $2, null, 'ebay', $3::jsonb, $4::jsonb) as r", [org, channel, JSON.stringify(order({ status: "cancelled" })), JSON.stringify(items)]);
      expect(again.rows[0].r).toMatchObject({ movements: 0 });
      const inv = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(inv.rows[0].quantity_on_hand).toBe(10);
      const mv = await c.query("select type from public.inventory_movements where sku_id = $1 order by created_at", [sku]);
      expect(mv.rows.map((r) => r.type)).toEqual(["initial", "sale", "cancellation"]);
    });
  });

  it("plusieurs canaux décrémentent le même stock central", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "orders3@example.test");
      const org = await createOrgAs(c, u, "Org", "org-orders3");
      const sku = await createSkuAs(c, u, org, "IPH13-128-BLK-A", { initial: 10 });
      const channel = await manualChannelId(c, org);
      await asService(c);
      const line = (qty: number, id: string) => [{ external_line_item_id: id, external_sku: "IPH13-128-BLK-A", title: "x", quantity: qty }];
      await c.query("select public.ingest_external_order($1, $2, null, 'ebay', $3::jsonb, $4::jsonb)", [org, channel, JSON.stringify(order({ external_order_id: "E1" })), JSON.stringify(line(3, "a"))]);
      await c.query("select public.ingest_external_order($1, $2, null, 'amazon', $3::jsonb, $4::jsonb)", [org, channel, JSON.stringify(order({ external_order_id: "A1" })), JSON.stringify(line(2, "b"))]);
      await c.query("select public.ingest_external_order($1, $2, null, 'shopify', $3::jsonb, $4::jsonb)", [org, channel, JSON.stringify(order({ external_order_id: "S1" })), JSON.stringify(line(1, "c"))]);
      const inv = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(inv.rows[0].quantity_on_hand).toBe(4);
      const stats = await c.query("select units_30d, units_90d from public.v_sku_sales_stats where sku_id = $1", [sku]);
      expect(stats.rows[0].units_90d).toBe(6);
    });
  });
});

d("Mapping SKU (map_listing_to_sku)", () => {
  it("associe une annonce, rattache les ventes passées sans toucher au stock, puis applique sur demande", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "map@example.test");
      const org = await createOrgAs(c, u, "Org", "org-map");
      const sku = await createSkuAs(c, u, org, "SKU-MAP", { initial: 10 });
      const channel = await manualChannelId(c, org);
      await asService(c);
      const { rows: lrows } = await c.query(
        "insert into public.channel_listings (organization_id, sales_channel_id, provider, external_listing_id, title, status) values ($1, $2, 'ebay', 'ITEM-X', 'Annonce X', 'active') returning id",
        [org, channel],
      );
      const listingId = lrows[0].id;
      const line = [{ external_line_item_id: "l1", external_listing_id: "ITEM-X", external_variation_id: "", external_sku: null, title: "Annonce X", quantity: 2 }];
      const r1 = await c.query("select public.ingest_external_order($1, $2, null, 'ebay', $3::jsonb, $4::jsonb) as r", [org, channel, JSON.stringify(order({ external_order_id: "O-X" })), JSON.stringify(line)]);
      expect(r1.rows[0].r).toMatchObject({ items_unmapped: 1, movements: 0 });

      await asUser(c, u);
      const mapped = await c.query("select (public.map_listing_to_sku($1, $2, 'manual')).mapping_status as s", [listingId, sku]);
      expect(mapped.rows[0].s).toBe("mapped");
      const oi = await c.query("select sku_id, inventory_applied from public.order_items where organization_id = $1", [org]);
      expect(oi.rows[0]).toMatchObject({ sku_id: sku, inventory_applied: false });
      let inv = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(inv.rows[0].quantity_on_hand).toBe(10);

      // Nouvelle commande sur l'annonce désormais associée → décrément automatique
      await asService(c);
      const r2 = await c.query("select public.ingest_external_order($1, $2, null, 'ebay', $3::jsonb, $4::jsonb) as r", [org, channel, JSON.stringify(order({ external_order_id: "O-Y" })), JSON.stringify(line)]);
      expect(r2.rows[0].r).toMatchObject({ items_mapped: 1, movements: 1 });

      await asUser(c, u);
      const applied = await c.query("select public.apply_pending_sales_for_sku($1) as n", [sku]);
      expect(applied.rows[0].n).toBe(1);
      inv = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(inv.rows[0].quantity_on_hand).toBe(6);
      const unmapped = await c.query("select count(*)::int as n from public.v_unmapped_listings where organization_id = $1", [org]);
      expect(unmapped.rows[0].n).toBe(0);
    });
  });
});
