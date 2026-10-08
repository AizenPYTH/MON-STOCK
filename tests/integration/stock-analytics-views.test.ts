import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asService, asSuperuser, asUser, canConnect, createOrgAs, createSkuAs, createUser, manualChannelId, withRollback } from "./helpers";

const available = await canConnect();
const d = available ? describe : describe.skip;

async function ingest(c: Client, org: string, channel: string, id: string, opts: { status?: string; currency?: string; placedAt: string; lines: Array<{ sku: string; qty: number; price: number | null; currency?: string }> }) {
  await asService(c);
  await c.query("select public.ingest_external_order($1, $2, null, 'manual', $3::jsonb, $4::jsonb)", [
    org,
    channel,
    JSON.stringify({ external_order_id: id, status: opts.status ?? "paid", currency: opts.currency ?? "EUR", placed_at: opts.placedAt }),
    JSON.stringify(
      opts.lines.map((l, i) => ({
        external_line_item_id: `${id}-${i}`,
        external_sku: l.sku,
        quantity: l.qty,
        unit_price: l.price,
        currency: l.currency ?? opts.currency ?? "EUR",
        total: l.price === null ? null : l.price * l.qty,
      })),
    ),
  ]);
}

d("Intelligence : vues analytiques", () => {
  it("v_sku_sales_stats : commandes annulées / remboursées exclues, CA jamais additionné entre devises", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "an-stats@example.test");
      const org = await createOrgAs(c, u, "Org", "an-stats");
      const sku = await createSkuAs(c, u, org, "AN-1", { initial: 50, sale: 100 });
      const ch = await manualChannelId(c, org);
      const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
      await ingest(c, org, ch, "O-EUR", { placedAt: recent, lines: [{ sku: "AN-1", qty: 2, price: 100 }] });
      await ingest(c, org, ch, "O-EUR2", { placedAt: recent, lines: [{ sku: "AN-1", qty: 1, price: 70 }] });
      await ingest(c, org, ch, "O-USD", { placedAt: recent, currency: "USD", lines: [{ sku: "AN-1", qty: 3, price: 500 }] });
      await ingest(c, org, ch, "O-CANCEL", { placedAt: recent, status: "cancelled", lines: [{ sku: "AN-1", qty: 7, price: 1000 }] });
      await ingest(c, org, ch, "O-REFUND", { placedAt: recent, lines: [{ sku: "AN-1", qty: 4, price: 1000 }] });
      await ingest(c, org, ch, "O-REFUND", { placedAt: recent, status: "refunded", lines: [] });
      await ingest(c, org, ch, "O-NOPRICE", { placedAt: recent, lines: [{ sku: "AN-1", qty: 1, price: null }] });
      await asUser(c, u);
      const { rows } = await c.query("select units_7d, units_30d, revenue_30d, avg_sale_price_30d, foreign_currency_units_30d from public.v_sku_sales_stats where sku_id = $1", [sku]);
      // Unités : 2 + 1 + 3 (USD) + 1 (sans prix) ; annulée et remboursée exclues.
      expect(rows[0].units_7d).toBe(7);
      expect(rows[0].units_30d).toBe(7);
      // CA EUR uniquement : 200 + 70 ; prix moyen sur les seules lignes EUR au prix connu : 270 / 3.
      expect(Number(rows[0].revenue_30d)).toBe(270);
      expect(Number(rows[0].avg_sale_price_30d)).toBe(90);
      expect(rows[0].foreign_currency_units_30d).toBe(3);
      // Le stock a bien été décrémenté pour toutes les ventes non annulées, recrédité pour la remboursée.
      const inv = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(inv.rows[0].quantity_on_hand).toBe(50 - 7);
    });
  });

  it("v_daily_sales : jours civils Europe/Paris et une ligne par devise", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "an-daily@example.test");
      const org = await createOrgAs(c, u, "Org", "an-daily");
      await createSkuAs(c, u, org, "AN-D", { initial: 100 });
      const ch = await manualChannelId(c, org);
      // 22:30 UTC le 7 octobre = 00:30 le 8 octobre à Paris (UTC+2) ; 21:59 UTC = 23:59 le 7.
      await ingest(c, org, ch, "D-1", { placedAt: "2026-10-07T22:30:00Z", lines: [{ sku: "AN-D", qty: 1, price: 10 }] });
      await ingest(c, org, ch, "D-2", { placedAt: "2026-10-07T21:59:00Z", lines: [{ sku: "AN-D", qty: 2, price: 20 }] });
      await ingest(c, org, ch, "D-3", { placedAt: "2026-10-08T08:00:00Z", currency: "GBP", lines: [{ sku: "AN-D", qty: 1, price: 99 }] });
      // Hiver (UTC+1) : 23:30 UTC le 15 janvier = 00:30 le 16 janvier à Paris.
      await ingest(c, org, ch, "D-4", { placedAt: "2026-01-15T23:30:00Z", lines: [{ sku: "AN-D", qty: 1, price: 5 }] });
      await asUser(c, u);
      const { rows } = await c.query("select day::text as day, currency, orders_count, units, revenue::float as revenue from public.v_daily_sales where organization_id = $1 order by day, currency", [org]);
      expect(rows).toEqual([
        { day: "2026-01-16", currency: "EUR", orders_count: 1, units: 1, revenue: 5 },
        { day: "2026-10-07", currency: "EUR", orders_count: 1, units: 2, revenue: 40 },
        { day: "2026-10-08", currency: "EUR", orders_count: 1, units: 1, revenue: 10 },
        { day: "2026-10-08", currency: "GBP", orders_count: 1, units: 1, revenue: 99 },
      ]);
    });
  });

  it("v_stock_overview : canaux et fournisseurs liés exposés pour le filtrage", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "an-ov@example.test");
      const org = await createOrgAs(c, u, "Org", "an-ov");
      const sku = await createSkuAs(c, u, org, "AN-OV");
      const other = await createSkuAs(c, u, org, "AN-OV2");
      await asUser(c, u);
      const { rows: s } = await c.query("insert into public.suppliers (organization_id, name) values ($1, 'S1'), ($1, 'S2') returning id", [org]);
      await c.query("update public.skus set default_supplier_id = $1 where id = $2", [s[0].id, sku]);
      const ch = await manualChannelId(c, org);
      await c.query("insert into public.channel_listings (organization_id, sales_channel_id, provider, external_listing_id, sku_id, mapping_status) values ($1, $2, 'manual', 'L-1', $3, 'mapped')", [org, ch, sku]);
      const { rows } = await c.query("select code, channel_providers, supplier_ids from public.v_stock_overview where organization_id = $1 order by code", [org]);
      expect(rows).toEqual([
        { code: "AN-OV", channel_providers: ["manual"], supplier_ids: [s[0].id] },
        { code: "AN-OV2", channel_providers: [], supplier_ids: [] },
      ]);
      const filtered = await c.query("select code from public.v_stock_overview where organization_id = $1 and supplier_ids @> array[$2::uuid]", [org, s[0].id]);
      expect(filtered.rows).toEqual([{ code: "AN-OV" }]);
      void other;
    });
  });

  it("sku_rotation : stock moyen reconstitué exactement depuis le journal des mouvements", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "an-rot@example.test");
      const org = await createOrgAs(c, u, "Org", "an-rot");
      const sku = await createSkuAs(c, u, org, "AN-ROT");
      const young = await createSkuAs(c, u, org, "AN-YOUNG", { initial: 3 });
      const ch = await manualChannelId(c, org);
      await asSuperuser(c);
      await c.query("update public.skus set created_at = now() - interval '60 days' where id = $1", [sku]);
      await asUser(c, u);
      // Fenêtre de 30 j : 0 unité pendant 10 j, 10 unités pendant 10 j, 6 unités pendant 10 j → moyenne 160 / 30.
      await c.query("select public.apply_inventory_movement($1, $2, 'receipt', 10, 'manual', null, null, null, now() - interval '20 days')", [org, sku]);
      await ingest(c, org, ch, "R-1", { placedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(), lines: [{ sku: "AN-ROT", qty: 4, price: 10 }] });
      // Une vente annulée ne compte pas dans les unités vendues.
      await ingest(c, org, ch, "R-2", { placedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(), status: "cancelled", lines: [{ sku: "AN-ROT", qty: 2, price: 10 }] });
      await asUser(c, u);
      const { rows } = await c.query("select sku_id, window_days::float as days, avg_on_hand::float as avg, units_sold from public.sku_rotation($1) order by window_days desc", [org]);
      const rot = rows.find((r) => r.sku_id === sku);
      expect(rot.days).toBeCloseTo(30, 1);
      expect(rot.avg).toBeCloseTo(160 / 30, 1);
      expect(rot.units_sold).toBe(4);
      // SKU créé à l'instant : fenêtre quasi nulle (l'application affiche « Pas assez de données »).
      const y = rows.find((r) => r.sku_id === young);
      expect(y.days).toBeLessThan(1);
      // Filtre par SKU.
      const one = await c.query("select count(*)::int as n from public.sku_rotation($1, array[$2::uuid])", [org, sku]);
      expect(one.rows[0].n).toBe(1);
    });
  });

  it("organisation vide : aucune ligne, aucun indicateur inventé", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "an-empty@example.test");
      const org = await createOrgAs(c, u, "Org", "an-empty");
      await asUser(c, u);
      for (const sql of [
        "select count(*)::int as n from public.v_daily_sales where organization_id = $1",
        "select count(*)::int as n from public.v_stock_overview where organization_id = $1",
        "select count(*)::int as n from public.sku_rotation($1)",
      ]) {
        const { rows } = await c.query(sql, [org]);
        expect(rows[0].n).toBe(0);
      }
    });
  });
});
