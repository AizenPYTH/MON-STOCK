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

async function onHand(skuId: string): Promise<number> {
  const [row] = await q<{ quantity_on_hand: number }>("select quantity_on_hand from public.inventory where sku_id = $1", [skuId]);
  return row!.quantity_on_hand;
}

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

  it("reprise après erreur : une ingestion interrompue (transaction annulée après la déduction) puis rejouée → un seul mouvement par ligne", async () => {
    const f = await createFixture();
    const a = await serviceClient();
    try {
      const p = payload("CRASH-1");
      await a.query("begin");
      expect((await a.query(INGEST, [f.orgId, f.channelId, f.connectionId, p.order, p.items])).rows[0].r).toMatchObject({ created: true, movements: 2 });
      await a.query("rollback"); // processus tué / erreur avant la validation
      const r1 = await a.query(INGEST, [f.orgId, f.channelId, f.connectionId, p.order, p.items]);
      const r2 = await a.query(INGEST, [f.orgId, f.channelId, f.connectionId, p.order, p.items]);
      expect(r1.rows[0].r).toMatchObject({ created: true, movements: 2 });
      expect(r2.rows[0].r).toMatchObject({ created: false, movements: 0 });
    } finally {
      await a.end();
    }
    const [row] = await q<{ moves: number; onhand: number }>(
      `select (select count(*)::int from public.inventory_movements where organization_id = $1 and type = 'sale') as moves,
              (select quantity_on_hand from public.inventory where sku_id = $2) as onhand`,
      [f.orgId, f.skuId],
    );
    expect(row).toEqual({ moves: 2, onhand: 7 });
  });

  it("D-19 : la base refuse une seconde vente pour la même ligne, même si une fonction oublie le drapeau inventory_applied", async () => {
    const f = await createFixture();
    const p = payload("DUP-1");
    await q(INGEST, [f.orgId, f.channelId, f.connectionId, p.order, p.items]);
    const [line] = await q<{ id: string }>("select oi.id from public.order_items oi join public.orders o on o.id = oi.order_id where o.organization_id = $1 and oi.external_line_item_id = 'DUP-1-1'", [f.orgId]);
    // Appel direct (serveur) : deuxième vente pour la même ligne → violation de l'index unique.
    await expect(q("select public.apply_inventory_movement($1, $2, 'sale', -2, 'order_item', $3, 'ebay')", [f.orgId, f.skuId, line!.id])).rejects.toMatchObject({ code: "23505" });
    // Drapeau « oublié » (remis à false) : l'action « ventes en attente » ne peut pas redéduire.
    await q("update public.order_items set inventory_applied = false where id = $1", [line!.id]);
    await expect(q("select public.apply_pending_sales_for_sku($1)", [f.skuId])).rejects.toMatchObject({ code: "23505" });
    const [row] = await q<{ moves: number; onhand: number }>(
      `select (select count(*)::int from public.inventory_movements where organization_id = $1 and type = 'sale') as moves,
              (select quantity_on_hand from public.inventory where sku_id = $2) as onhand`,
      [f.orgId, f.skuId],
    );
    expect(row).toEqual({ moves: 2, onhand: 7 });
  });

  it("D-19 : vente → annulation → revente de la même ligne reste possible (une fois chacune) ; annulation sans vente refusée", async () => {
    const f = await createFixture();
    await q(INGEST, [f.orgId, f.channelId, f.connectionId, payload("CYCLE-1").order, payload("CYCLE-1").items]);
    await q(INGEST, [f.orgId, f.channelId, f.connectionId, payload("CYCLE-1", "cancelled").order, payload("CYCLE-1", "cancelled").items]);
    expect(await onHand(f.skuId)).toBe(10);
    // Commande rétablie chez eBay : la ligne redevient « en attente » ; l'action explicite la redéduit une fois.
    await q(INGEST, [f.orgId, f.channelId, f.connectionId, payload("CYCLE-1", "paid").order, payload("CYCLE-1", "paid").items]);
    const [applied] = await q<{ n: number }>("select public.apply_pending_sales_for_sku($1) as n", [f.skuId]);
    expect(applied!.n).toBe(2);
    const [again] = await q<{ n: number }>("select public.apply_pending_sales_for_sku($1) as n", [f.skuId]);
    expect(again!.n).toBe(0);
    expect(await onHand(f.skuId)).toBe(7);
    const gens = await q<{ type: string; reference_generation: number }>(
      "select m.type, m.reference_generation from public.inventory_movements m join public.order_items oi on oi.id = m.reference_id where oi.external_line_item_id = 'CYCLE-1-1' and m.organization_id = $1 order by m.created_at",
      [f.orgId],
    );
    expect(gens).toEqual([
      { type: "sale", reference_generation: 0 },
      { type: "cancellation", reference_generation: 0 },
      { type: "sale", reference_generation: 1 },
    ]);

    // Annulation pour une ligne jamais déduite : refusée (elle recréditerait un stock jamais retiré).
    const unmapped = JSON.stringify([{ external_line_item_id: "NOSALE-1", external_listing_id: "ITEM-Z", external_variation_id: "", external_sku: "INCONNU", title: "Z", quantity: 1 }]);
    await q(INGEST, [f.orgId, f.channelId, f.connectionId, payload("NOSALE").order, unmapped]);
    const [line] = await q<{ id: string }>("select oi.id from public.order_items oi join public.orders o on o.id = oi.order_id where o.organization_id = $1 and oi.external_line_item_id = 'NOSALE-1'", [f.orgId]);
    await expect(q("select public.apply_inventory_movement($1, $2, 'cancellation', 1, 'order_item', $3, 'ebay')", [f.orgId, f.skuId, line!.id])).rejects.toThrow(/ORDER_ITEM_CANCELLATION_WITHOUT_SALE/);
    expect(await onHand(f.skuId)).toBe(7);
  });

  it("D-19 : deux « appliquer les ventes en attente » simultanés → une seule déduction", async () => {
    const f = await createFixture();
    const unmapped = JSON.stringify([{ external_line_item_id: "LATE-1", external_listing_id: "ITEM-L", external_variation_id: "", external_sku: "PAS-ENCORE", title: "L", quantity: 3 }]);
    await q(INGEST, [f.orgId, f.channelId, f.connectionId, payload("LATE").order, unmapped]);
    await q("update public.order_items set sku_id = $2 where external_line_item_id = 'LATE-1' and organization_id = $1", [f.orgId, f.skuId]);
    const clients = await Promise.all([serviceClient(), serviceClient()]);
    try {
      const results = await Promise.allSettled(clients.map((c) => c.query("select public.apply_pending_sales_for_sku($1) as n", [f.skuId])));
      const applied = results.map((r) => (r.status === "fulfilled" ? (r.value.rows[0] as { n: number }).n : -1));
      expect(applied.sort()).toEqual([0, 1]);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
    expect(await onHand(f.skuId)).toBe(7);
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
