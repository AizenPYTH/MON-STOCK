/**
 * Idempotence de ingest_external_order sous concurrence RÉELLE : deux connexions PostgreSQL
 * distinctes (webhook + cron, runs qui se chevauchent) ingèrent la même commande.
 * Attendu : exactement une commande et un mouvement de stock par ligne, et AUCUNE erreur.
 */
import { afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { canConnect, DATABASE_URL } from "./helpers";
import { closePool, createFixture, q } from "./sync-harness";

const available = await canConnect();
const d = available ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});

async function serviceClient(): Promise<Client> {
  const c = new Client({ connectionString: DATABASE_URL, options: '-c role=service_role -c request.jwt.claims={"role":"service_role"}' });
  await c.connect();
  return c;
}

function payload(id: string, status = "paid") {
  return {
    order: JSON.stringify({ external_order_id: id, order_number: `N-${id}`, status, currency: "EUR", total: 50, placed_at: "2026-10-07T10:00:00Z", external_modified_at: "2026-10-07T10:00:00Z" }),
    items: JSON.stringify([
      { external_line_item_id: `${id}-1`, external_listing_id: "ITEM-1", external_variation_id: "", external_sku: "SYNC-SKU-1", title: "A", quantity: 2, unit_price: 25, currency: "EUR", total: 50 },
      { external_line_item_id: `${id}-2`, external_listing_id: "ITEM-2", external_variation_id: "", external_sku: "SYNC-SKU-1", title: "B", quantity: 1, unit_price: 0, currency: "EUR", total: 0 },
    ]),
  };
}

const INGEST = "select public.ingest_external_order($1, $2, $3, 'ebay', $4::jsonb, $5::jsonb) as r";

d("ingest_external_order sous concurrence", () => {
  it("deux transactions insèrent la même commande inconnue : la seconde attend puis devient une mise à jour (pas de 23505)", async () => {
    const f = await createFixture();
    const a = await serviceClient();
    const b = await serviceClient();
    try {
      const p = payload("RACE-1");
      await a.query("begin");
      const ra = await a.query(INGEST, [f.orgId, f.channelId, f.connectionId, p.order, p.items]);
      expect(ra.rows[0].r).toMatchObject({ created: true, movements: 2 });

      // B démarre pendant que A n'a pas validé : son insertion est bloquée par l'index unique.
      let bDone = false;
      const pb = b.query(INGEST, [f.orgId, f.channelId, f.connectionId, p.order, p.items]).finally(() => {
        bDone = true;
      });
      await new Promise((r) => setTimeout(r, 300));
      expect(bDone).toBe(false);
      await a.query("commit");
      const rb = await pb;
      expect(rb.rows[0].r).toMatchObject({ created: false, movements: 0 });
    } finally {
      await a.end();
      await b.end();
    }
    const [counts] = await q<{ orders: number; items: number; moves: number; onhand: number }>(
      `select (select count(*)::int from public.orders where organization_id = $1) as orders,
              (select count(*)::int from public.order_items where organization_id = $1) as items,
              (select count(*)::int from public.inventory_movements where organization_id = $1 and type = 'sale') as moves,
              (select quantity_on_hand from public.inventory where sku_id = $2) as onhand`,
      [f.orgId, f.skuId],
    );
    expect(counts).toEqual({ orders: 1, items: 2, moves: 2, onhand: 7 });
  });

  it("rafale : 6 connexions ingèrent simultanément les mêmes 10 commandes → 10 commandes, 1 mouvement par ligne, 0 erreur", async () => {
    const f = await createFixture({ initialStock: 100 });
    const clients = await Promise.all(Array.from({ length: 6 }, () => serviceClient()));
    try {
      const ids = Array.from({ length: 10 }, (_, i) => `BURST-${i}`);
      const results = await Promise.allSettled(
        clients.flatMap((c) =>
          ids.map((id) => {
            const p = payload(id);
            return c.query(INGEST, [f.orgId, f.channelId, f.connectionId, p.order, p.items]);
          }),
        ),
      );
      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected).toEqual([]);
      const created = results.filter((r) => r.status === "fulfilled" && (r.value.rows[0].r as { created: boolean }).created).length;
      expect(created).toBe(10);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
    const [counts] = await q<{ orders: number; moves: number; onhand: number }>(
      `select (select count(*)::int from public.orders where organization_id = $1) as orders,
              (select count(*)::int from public.inventory_movements where organization_id = $1 and type = 'sale') as moves,
              (select quantity_on_hand from public.inventory where sku_id = $2) as onhand`,
      [f.orgId, f.skuId],
    );
    expect(counts).toEqual({ orders: 10, moves: 20, onhand: 70 });
  });

  it("annulation concurrente d'une commande connue : un seul recrédit", async () => {
    const f = await createFixture();
    const p = payload("CANCEL-1");
    await q(INGEST, [f.orgId, f.channelId, f.connectionId, p.order, p.items]);
    const cancel = payload("CANCEL-1", "cancelled");
    const clients = await Promise.all([serviceClient(), serviceClient(), serviceClient()]);
    try {
      await Promise.all(clients.map((c) => c.query(INGEST, [f.orgId, f.channelId, f.connectionId, cancel.order, cancel.items])));
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
    const [row] = await q<{ cancels: number; onhand: number }>(
      `select (select count(*)::int from public.inventory_movements where organization_id = $1 and type = 'cancellation') as cancels,
              (select quantity_on_hand from public.inventory where sku_id = $2) as onhand`,
      [f.orgId, f.skuId],
    );
    expect(row).toEqual({ cancels: 2, onhand: 10 });
  });

  it("une commande est tout-ou-rien : une ligne invalide annule toute la commande (aucune demi-commande)", async () => {
    const f = await createFixture();
    const c = await serviceClient();
    try {
      const items = JSON.stringify([
        { external_line_item_id: "H-1", external_listing_id: "ITEM-1", external_variation_id: "", external_sku: "SYNC-SKU-1", title: "ok", quantity: 1 },
        { external_line_item_id: "H-2", external_listing_id: "ITEM-2", external_variation_id: "", external_sku: "SYNC-SKU-1", title: "ko", quantity: 1, unit_price: "pas un nombre" },
      ]);
      await expect(c.query(INGEST, [f.orgId, f.channelId, f.connectionId, payload("HALF-1").order, items])).rejects.toThrow();
    } finally {
      await c.end();
    }
    const [row] = await q<{ orders: number; items: number; moves: number; onhand: number }>(
      `select (select count(*)::int from public.orders where organization_id = $1) as orders,
              (select count(*)::int from public.order_items where organization_id = $1) as items,
              (select count(*)::int from public.inventory_movements where organization_id = $1 and type = 'sale') as moves,
              (select quantity_on_hand from public.inventory where sku_id = $2) as onhand`,
      [f.orgId, f.skuId],
    );
    expect(row).toEqual({ orders: 0, items: 0, moves: 0, onhand: 10 });
  });

  it("refuse un canal ou une connexion d'une autre organisation", async () => {
    const f = await createFixture();
    const other = await createFixture();
    const c = await serviceClient();
    try {
      const p = payload("X-ORG");
      await expect(c.query(INGEST, [f.orgId, other.channelId, null, p.order, p.items])).rejects.toThrow(/CHANNEL_NOT_FOUND/);
      await expect(c.query(INGEST, [f.orgId, f.channelId, other.connectionId, p.order, p.items])).rejects.toThrow(/CONNECTION_NOT_FOUND/);
    } finally {
      await c.end();
    }
  });
});
