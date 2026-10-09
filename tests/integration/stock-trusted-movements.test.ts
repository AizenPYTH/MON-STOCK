/**
 * Mouvements « vente » et « annulation » : exemptés de la règle anti-négatif, ils sont réservés
 * au serveur (service_role) et aux fonctions internes qui les créent depuis une commande.
 * Un rédacteur ne peut plus rendre un stock négatif en appelant directement
 * rpc/apply_inventory_movement avec p_type = 'sale'.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asService, asSuperuser, asUser, canConnect, createOrgAs, createSkuAs, createUser, expectQueryError, manualChannelId, withRollback } from "./helpers";

const available = await canConnect();
const d = available ? describe : describe.skip;

async function onHand(c: Client, sku: string): Promise<number> {
  const { rows } = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
  return rows[0].quantity_on_hand;
}

function order(externalId: string, status = "paid") {
  return { external_order_id: externalId, order_number: externalId, status, currency: "EUR", total: 10, placed_at: "2026-10-01T10:00:00Z" };
}

function line(externalSku: string, quantity: number) {
  return [{ external_line_item_id: `L-${externalSku}`, external_listing_id: `ITEM-${externalSku}`, external_variation_id: "", external_sku: externalSku, title: "Article", quantity, unit_price: 10, currency: "EUR", total: 10 * quantity }];
}

d("apply_inventory_movement : ventes et annulations réservées aux appelants de confiance", () => {
  it("un rédacteur ne peut pas appeler directement 'sale' ni 'cancellation' (stock inchangé)", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "trusted-direct@example.test");
      const org = await createOrgAs(c, u, "Org", "trusted-direct");
      const sku = await createSkuAs(c, u, org, "TRUST-1", { initial: 3 });
      await asUser(c, u);
      await expectQueryError(c, "select public.apply_inventory_movement($1, $2, 'sale', -500, 'order_item', null, 'ebay')", [org, sku], "FORBIDDEN");
      await expectQueryError(c, "select public.apply_inventory_movement($1, $2, 'cancellation', 500, 'order_item', null, 'ebay')", [org, sku], "FORBIDDEN");
      expect(await onHand(c, sku)).toBe(3);
      // Les mouvements manuels restent possibles (et bornés par la règle anti-négatif).
      await c.query("select public.apply_inventory_movement($1, $2, 'adjustment', -3)", [org, sku]);
      await expectQueryError(c, "select public.apply_inventory_movement($1, $2, 'adjustment', -1)", [org, sku], "INSUFFICIENT_STOCK");
      expect(await onHand(c, sku)).toBe(0);
      // Aucune alerte « stock négatif » n'a pu être forcée.
      const a = await c.query("select count(*)::int as n from public.alerts where organization_id = $1 and type = 'negative_stock'", [org]);
      expect(a.rows[0].n).toBe(0);
    });
  });

  it("le service_role applique une vente au-delà du stock (vente marketplace réelle)", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "trusted-service@example.test");
      const org = await createOrgAs(c, u, "Org", "trusted-service");
      const sku = await createSkuAs(c, u, org, "TRUST-2", { initial: 1 });
      await asService(c);
      await c.query("select public.apply_inventory_movement($1, $2, 'sale', -2, 'order_item', null, 'ebay')", [org, sku]);
      await c.query("select public.apply_inventory_movement($1, $2, 'cancellation', 1, 'order_item', null, 'ebay')", [org, sku]);
      expect(await onHand(c, sku)).toBe(0);
    });
  });

  it("un rédacteur authentifié ne peut pas inventer une commande (ingest_external_order réservé au serveur)", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "trusted-ingest-denied@example.test");
      const org = await createOrgAs(c, u, "Org", "trusted-ingest-denied");
      const sku = await createSkuAs(c, u, org, "TRUST-3B", { initial: 2 });
      const channel = await manualChannelId(c, org);
      await asUser(c, u);
      await expectQueryError(c, "select public.ingest_external_order($1, $2, null, 'manual', $3::jsonb, $4::jsonb)", [org, channel, JSON.stringify(order("FAKE-1")), JSON.stringify(line("TRUST-3B", 50))], /permission denied for function ingest_external_order/);
      await expectQueryError(c, "insert into public.orders (organization_id, sales_channel_id, provider, external_order_id, status, placed_at) values ($1, $2, 'manual', 'FAKE-2', 'paid', now())", [org, channel], /permission denied|row-level security/);
      expect(await onHand(c, sku)).toBe(2);
    });
  });

  it("ingest_external_order (serveur) déduit et recrédite ; le drapeau ne fuit pas après l'appel", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "trusted-ingest@example.test");
      const org = await createOrgAs(c, u, "Org", "trusted-ingest");
      const sku = await createSkuAs(c, u, org, "TRUST-3", { initial: 2 });
      const channel = await manualChannelId(c, org);
      await asService(c);
      const r = await c.query("select public.ingest_external_order($1, $2, null, 'manual', $3::jsonb, $4::jsonb) as r", [org, channel, JSON.stringify(order("M-1")), JSON.stringify(line("TRUST-3", 5))]);
      expect(r.rows[0].r).toMatchObject({ created: true, movements: 1 });
      expect(await onHand(c, sku)).toBe(-3);
      // Même transaction : le drapeau a été retiré après l'appel interne.
      expect((await c.query("select current_setting('mon_stock.trusted_movement', true) as v")).rows[0].v).toBe("off");
      await asUser(c, u);
      await expectQueryError(c, "select public.apply_inventory_movement($1, $2, 'sale', -1, 'order_item', null, 'ebay')", [org, sku], "FORBIDDEN");
      await asService(c);
      // Annulation → mouvement 'cancellation' créé par la fonction interne.
      const cancel = await c.query("select public.ingest_external_order($1, $2, null, 'manual', $3::jsonb, $4::jsonb) as r", [org, channel, JSON.stringify(order("M-1", "cancelled")), JSON.stringify(line("TRUST-3", 5))]);
      expect(cancel.rows[0].r).toMatchObject({ movements: 1 });
      expect(await onHand(c, sku)).toBe(2);
      const mv = await c.query("select type, quantity from public.inventory_movements where sku_id = $1 order by created_at", [sku]);
      expect(mv.rows.map((m) => [m.type, m.quantity])).toEqual([
        ["initial", 2],
        ["sale", -5],
        ["cancellation", 5],
      ]);
      await asUser(c, u);
      await expectQueryError(c, "select public.apply_inventory_movement($1, $2, 'cancellation', 1, 'order_item', null, 'ebay')", [org, sku], "FORBIDDEN");
    });
  });

  it("ingest_external_order fonctionne aussi en service_role", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "trusted-ingest-srv@example.test");
      const org = await createOrgAs(c, u, "Org", "trusted-ingest-srv");
      const sku = await createSkuAs(c, u, org, "TRUST-4", { initial: 4 });
      const channel = await manualChannelId(c, org);
      await asService(c);
      const r = await c.query("select public.ingest_external_order($1, $2, null, 'ebay', $3::jsonb, $4::jsonb) as r", [org, channel, JSON.stringify(order("E-1")), JSON.stringify(line("TRUST-4", 1))]);
      expect(r.rows[0].r).toMatchObject({ created: true, movements: 1 });
      expect(await onHand(c, sku)).toBe(3);
    });
  });

  it("apply_pending_sales_for_sku (rédacteur authentifié et service_role) applique les ventes en attente", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "trusted-pending@example.test");
      const org = await createOrgAs(c, u, "Org", "trusted-pending");
      const sku = await createSkuAs(c, u, org, "TRUST-5", { initial: 1 });
      const channel = await manualChannelId(c, org);
      await asService(c);
      // Deux commandes dont la ligne n'est pas associée à l'ingestion (code inconnu).
      for (const id of ["P-1", "P-2"]) {
        await c.query("select public.ingest_external_order($1, $2, null, 'ebay', $3::jsonb, $4::jsonb)", [org, channel, JSON.stringify(order(id)), JSON.stringify(line(`UNKNOWN-${id}`, 2))]);
      }
      // Association a posteriori (comme map_listing_to_sku) : rien n'est déduit tant que l'utilisateur ne valide pas.
      await asSuperuser(c);
      await c.query("update public.order_items set sku_id = $2 where organization_id = $1 and external_sku = 'UNKNOWN-P-1'", [org, sku]);
      await asUser(c, u);
      const n = await c.query("select public.apply_pending_sales_for_sku($1) as n", [sku]);
      expect(n.rows[0].n).toBe(1);
      expect(await onHand(c, sku)).toBe(-1);
      expect((await c.query("select current_setting('mon_stock.trusted_movement', true) as v")).rows[0].v).toBe("off");
      await expectQueryError(c, "select public.apply_inventory_movement($1, $2, 'sale', -1, 'order_item', null, 'ebay')", [org, sku], "FORBIDDEN");

      await asSuperuser(c);
      await c.query("update public.order_items set sku_id = $2 where organization_id = $1 and external_sku = 'UNKNOWN-P-2'", [org, sku]);
      await asService(c);
      const n2 = await c.query("select public.apply_pending_sales_for_sku($1) as n", [sku]);
      expect(n2.rows[0].n).toBe(1);
      expect(await onHand(c, sku)).toBe(-3);
    });
  });
});

d("Alerte « stock négatif » : lien encodé comme encodeURIComponent", () => {
  it("url_encode_path_segment est identique à encodeURIComponent", async () => {
    await withRollback(async (c) => {
      const samples = ["A/B", "a b?c#d%e", "iPhone-13_(x)!~*'.", "é€😀", "a+b&c=d;e:f@g", "", "SKU\\1\"2"];
      const { rows } = await c.query<{ v: string; e: string }>("select v, public.url_encode_path_segment(v) as e from unnest($1::text[]) as v", [samples]);
      for (const r of rows) expect(r.e, r.v).toBe(encodeURIComponent(r.v));
      const n = await c.query("select public.url_encode_path_segment(null) as e");
      expect(n.rows[0].e).toBeNull();
    });
  });

  it("le lien de l'alerte encode un code SKU contenant « / », espace, « ? », « # » et « % »", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "href-encode@example.test");
      const org = await createOrgAs(c, u, "Org", "href-encode");
      const code = "IPH/13 128?#%";
      const sku = await createSkuAs(c, u, org, code, { initial: 0 });
      await asService(c);
      await c.query("select public.apply_inventory_movement($1, $2, 'sale', -1, 'order_item', null, 'ebay')", [org, sku]);
      const a = await c.query("select action_href, title from public.alerts where organization_id = $1 and type = 'negative_stock'", [org]);
      expect(a.rows[0].action_href).toBe(`/stock/${encodeURIComponent(code)}`);
      expect(a.rows[0].action_href).toBe("/stock/IPH%2F13%20128%3F%23%25");
      // Le titre garde le code lisible.
      expect(a.rows[0].title).toBe(`Stock négatif : ${code}`);
    });
  });

  it("la migration corrige le lien des alertes ouvertes existantes (et laisse les résolues)", async () => {
    const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/20261008005000_trusted_sale_movements.sql"), "utf8");
    const fix = sql.slice(sql.indexOf("update public.alerts a"));
    expect(fix).toMatch(/^update public\.alerts a[\s\S]*;\s*$/);
    await withRollback(async (c) => {
      const u = await createUser(c, "href-fix@example.test");
      const org = await createOrgAs(c, u, "Org", "href-fix");
      const sku = await createSkuAs(c, u, org, "OLD/1 #", { initial: 0 });
      await asSuperuser(c);
      await c.query(
        `insert into public.alerts (organization_id, type, severity, title, message, entity_type, entity_id, dedupe_key, action_href, status, resolved_at)
         values ($1, 'negative_stock', 'critical', 'Stock négatif', 'm', 'sku', $2::uuid, 'negative_stock:' || $2::text, '/stock/OLD/1 #', 'open', null),
                ($1, 'negative_stock', 'critical', 'Stock négatif', 'm', 'sku', $2::uuid, 'old-resolved', '/stock/OLD/1 #', 'resolved', now())`,
        [org, sku],
      );
      await c.query(fix);
      const { rows } = await c.query("select status, action_href from public.alerts where organization_id = $1 order by status", [org]);
      expect(rows).toEqual([
        { status: "open", action_href: "/stock/OLD%2F1%20%23" },
        { status: "resolved", action_href: "/stock/OLD/1 #" },
      ]);
    });
  });
});
