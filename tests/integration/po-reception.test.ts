import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asService, asSuperuser, asUser, canConnect, createOrgAs, createSkuAs, createUser, expectQueryError, withRollback } from "./helpers";
import { createCommittedOrg, createCommittedSku, errorOf, isStillPending, runAsUser, superQuery, userSession, type CommittedOrg } from "./stock-fixtures";

const available = await canConnect();
const d = available ? describe : describe.skip;

async function supplier(c: Client, org: string, currency = "EUR"): Promise<string> {
  const { rows } = await c.query("insert into public.suppliers (organization_id, name, currency) values ($1, 'Fournisseur', $2) returning id", [org, currency]);
  return rows[0].id;
}

async function draftPo(c: Client, org: string, supplierId: string, currency = "EUR"): Promise<string> {
  const { rows } = await c.query("insert into public.purchase_orders (organization_id, supplier_id, status, reference, currency) values ($1, $2, 'draft', 'PO-T', $3) returning id", [org, supplierId, currency]);
  return rows[0].id;
}

async function addLine(c: Client, org: string, po: string, sku: string, qty: number, unitCost: number | null, currency = "EUR"): Promise<string> {
  const { rows } = await c.query("insert into public.purchase_order_items (organization_id, purchase_order_id, sku_id, quantity_ordered, unit_cost, currency) values ($1, $2, $3, $4, $5, $6) returning id", [org, po, sku, qty, unitCost, currency]);
  return rows[0].id;
}

async function receive(c: Client, po: string, receipts: Array<Record<string, unknown>>): Promise<string> {
  const { rows } = await c.query("select (public.receive_purchase_order_items($1, $2::jsonb)).status as s", [po, JSON.stringify(receipts)]);
  return rows[0].s;
}

async function onHand(c: Client, sku: string): Promise<number> {
  const { rows } = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
  return rows[0].quantity_on_hand;
}

d("Commandes fournisseurs : cycle complet", () => {
  it("brouillon → lignes → envoi → réception partielle → réception complète, stock mis à jour une seule fois", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "po-flow@example.test");
      const org = await createOrgAs(c, u, "Org", "po-flow");
      const s1 = await createSkuAs(c, u, org, "PO-A", { initial: 1, cost: null });
      const s2 = await createSkuAs(c, u, org, "PO-B", { initial: 0, cost: 50 });
      await asUser(c, u);
      const sup = await supplier(c, org);
      const po = await draftPo(c, org, sup);
      // Commande vide : impossible de l'envoyer.
      await expectQueryError(c, "update public.purchase_orders set status = 'sent' where id = $1", [po], "PURCHASE_ORDER_EMPTY");
      // Réception d'un brouillon refusée.
      const i1 = await addLine(c, org, po, s1, 5, 10.5);
      await expectQueryError(c, "select public.receive_purchase_order_items($1, $2::jsonb)", [po, JSON.stringify([{ item_id: i1, quantity: 1 }])], "PURCHASE_ORDER_NOT_SENT");
      const i2 = await addLine(c, org, po, s2, 3, 40);
      // Total toujours dérivé des lignes (5 × 10,5 + 3 × 40).
      let t = await c.query("select total from public.purchase_orders where id = $1", [po]);
      expect(Number(t.rows[0].total)).toBe(172.5);
      // Un total saisi à la main est ignoré.
      await c.query("update public.purchase_orders set total = 1 where id = $1", [po]);
      t = await c.query("select total from public.purchase_orders where id = $1", [po]);
      expect(Number(t.rows[0].total)).toBe(172.5);

      await c.query("update public.purchase_orders set status = 'sent' where id = $1", [po]);
      const sent = await c.query("select sent_at is not null as ok from public.purchase_orders where id = $1", [po]);
      expect(sent.rows[0].ok).toBe(true);

      expect(await receive(c, po, [{ item_id: i1, quantity: 2, expected_received: 0 }])).toBe("partially_received");
      expect(await onHand(c, s1)).toBe(3);
      // Sur-réception : bornée au reste à recevoir (3 sur 5 restants), jamais au-delà.
      expect(await receive(c, po, [{ item_id: i1, quantity: 99 }, { item_id: i2, quantity: 3, expected_received: 0 }])).toBe("received");
      expect(await onHand(c, s1)).toBe(6);
      expect(await onHand(c, s2)).toBe(3);
      // Commande reçue : toute nouvelle réception est refusée → le stock n'est jamais compté deux fois.
      await expectQueryError(c, "select public.receive_purchase_order_items($1, $2::jsonb)", [po, JSON.stringify([{ item_id: i1, quantity: 1 }])], "PURCHASE_ORDER_ALREADY_RECEIVED");
      const mv = await c.query("select sku_id, sum(quantity)::int as q, count(*)::int as n from public.inventory_movements where reference_type = 'purchase_order_item' group by sku_id order by q");
      expect(mv.rows).toEqual([
        { sku_id: s2, q: 3, n: 1 },
        { sku_id: s1, q: 5, n: 2 },
      ]);
      // Coût de référence : renseigné s'il était inconnu (A), jamais écrasé s'il était connu (B).
      const costs = await c.query("select code, cost_price from public.skus where id = any($1::uuid[]) order by code", [[s1, s2]]);
      expect(costs.rows.map((r) => [r.code, Number(r.cost_price)])).toEqual([
        ["PO-A", 10.5],
        ["PO-B", 50],
      ]);
      const po2 = await c.query("select status, received_at is not null as received from public.purchase_orders where id = $1", [po]);
      expect(po2.rows[0]).toEqual({ status: "received", received: true });
    });
  });

  it("le total est « non calculable » si un coût est inconnu ou si une ligne est dans une autre devise", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "po-total@example.test");
      const org = await createOrgAs(c, u, "Org", "po-total");
      const sku = await createSkuAs(c, u, org, "PO-T1");
      await asUser(c, u);
      const po = await draftPo(c, org, await supplier(c, org));
      const i1 = await addLine(c, org, po, sku, 2, 10);
      let t = await c.query("select total from public.purchase_orders where id = $1", [po]);
      expect(Number(t.rows[0].total)).toBe(20);
      const i2 = await addLine(c, org, po, sku, 1, null);
      t = await c.query("select total from public.purchase_orders where id = $1", [po]);
      expect(t.rows[0].total).toBeNull();
      await c.query("delete from public.purchase_order_items where id = $1", [i2]);
      await addLine(c, org, po, sku, 1, 5, "USD");
      t = await c.query("select total from public.purchase_orders where id = $1", [po]);
      expect(t.rows[0].total).toBeNull();
      void i1;
    });
  });

  it("machine à états : un utilisateur ne peut ni marquer « reçue » sans réceptionner, ni rouvrir une commande close", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "po-state@example.test");
      const org = await createOrgAs(c, u, "Org", "po-state");
      const sku = await createSkuAs(c, u, org, "PO-S1");
      await asUser(c, u);
      const po = await draftPo(c, org, await supplier(c, org));
      const item = await addLine(c, org, po, sku, 4, 10);
      await expectQueryError(c, "update public.purchase_orders set status = 'received' where id = $1", [po], "PURCHASE_ORDER_INVALID_TRANSITION");
      await c.query("update public.purchase_orders set status = 'sent' where id = $1", [po]);
      await c.query("update public.purchase_orders set status = 'confirmed' where id = $1", [po]);
      await expectQueryError(c, "update public.purchase_orders set status = 'partially_received' where id = $1", [po], "PURCHASE_ORDER_INVALID_TRANSITION");
      await expectQueryError(c, "update public.purchase_orders set status = 'draft' where id = $1", [po], "PURCHASE_ORDER_INVALID_TRANSITION");
      // Lignes figées après confirmation ; quantité reçue jamais modifiable hors réception.
      await expectQueryError(c, "update public.purchase_order_items set quantity_received = 4 where id = $1", [item], "PURCHASE_ORDER_RECEIPT_REQUIRED");
      await expectQueryError(c, "update public.purchase_order_items set quantity_ordered = 40 where id = $1", [item], "PURCHASE_ORDER_LOCKED");
      await expectQueryError(c, "delete from public.purchase_order_items where id = $1", [item], "PURCHASE_ORDER_LOCKED");
      await expectQueryError(c, "insert into public.purchase_order_items (organization_id, purchase_order_id, sku_id, quantity_ordered) values ($1, $2, $3, 1)", [org, po, sku], "PURCHASE_ORDER_LOCKED");
      // Une commande envoyée ou reçue ne se supprime pas : elle s'annule.
      await expectQueryError(c, "delete from public.purchase_orders where id = $1", [po], "PURCHASE_ORDER_NOT_DELETABLE");
      await c.query("update public.purchase_orders set status = 'cancelled' where id = $1", [po]);
      await expectQueryError(c, "update public.purchase_orders set status = 'sent' where id = $1", [po], "PURCHASE_ORDER_CLOSED");
      // Réception d'une commande annulée refusée, stock inchangé.
      await expectQueryError(c, "select public.receive_purchase_order_items($1, $2::jsonb)", [po, JSON.stringify([{ item_id: item, quantity: 4 }])], "PURCHASE_ORDER_CANCELLED");
      expect(await onHand(c, sku)).toBe(0);
      // Une commande annulée sans réception peut être supprimée ; un brouillon aussi (avec ses lignes).
      const del = await c.query("delete from public.purchase_orders where id = $1", [po]);
      expect(del.rowCount).toBe(1);
      const po2 = await draftPo(c, org, await supplier(c, org));
      await addLine(c, org, po2, sku, 1, 1);
      expect((await c.query("delete from public.purchase_orders where id = $1", [po2])).rowCount).toBe(1);
    });
  });

  it("le coût reçu n'est recopié dans le SKU que dans la même devise", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "po-fx@example.test");
      const org = await createOrgAs(c, u, "Org", "po-fx");
      const sku = await createSkuAs(c, u, org, "PO-FX", { cost: null });
      await asUser(c, u);
      const po = await draftPo(c, org, await supplier(c, org, "USD"), "USD");
      const item = await addLine(c, org, po, sku, 2, 99, "USD");
      await c.query("update public.purchase_orders set status = 'sent' where id = $1", [po]);
      await receive(c, po, [{ item_id: item, quantity: 2 }]);
      const r = await c.query("select cost_price from public.skus where id = $1", [sku]);
      expect(r.rows[0].cost_price).toBeNull();
      expect(await onHand(c, sku)).toBe(2);
    });
  });

  it("un client ne crée qu'un brouillon : pas de commande vide « envoyée » par INSERT direct", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "po-insert@example.test");
      const org = await createOrgAs(c, u, "Org", "po-insert");
      await asUser(c, u);
      const sup = await supplier(c, org);
      for (const status of ["sent", "confirmed", "partially_received", "received", "cancelled"]) {
        await expectQueryError(
          c,
          "insert into public.purchase_orders (organization_id, supplier_id, status, reference) values ($1, $2, $3::public.purchase_order_status, 'PO-X')",
          [org, sup, status],
          "PURCHASE_ORDER_INVALID_STATUS",
        );
      }
      // Brouillon : accepté, horodatages d'étapes forgés ignorés.
      const { rows } = await c.query(
        "insert into public.purchase_orders (organization_id, supplier_id, status, reference, sent_at, received_at) values ($1, $2, 'draft', 'PO-D', now(), now()) returning sent_at, received_at",
        [org, sup],
      );
      expect(rows[0]).toEqual({ sent_at: null, received_at: null });
      // Le serveur (service_role : démo, imports) peut créer une commande dans un autre statut.
      await asService(c);
      const srv = await c.query("insert into public.purchase_orders (organization_id, supplier_id, status, reference) values ($1, $2, 'sent', 'PO-S') returning status", [org, sup]);
      expect(srv.rows[0].status).toBe("sent");
    });
  });

  it("un utilisateur ne peut pas réceptionner la commande d'une autre organisation", async () => {
    await withRollback(async (c) => {
      const u1 = await createUser(c, "po-iso1@example.test");
      const u2 = await createUser(c, "po-iso2@example.test");
      const org1 = await createOrgAs(c, u1, "Org 1", "po-iso-1");
      await createOrgAs(c, u2, "Org 2", "po-iso-2");
      const sku = await createSkuAs(c, u1, org1, "PO-ISO");
      await asUser(c, u1);
      const po = await draftPo(c, org1, await supplier(c, org1));
      const item = await addLine(c, org1, po, sku, 2, 1);
      await c.query("update public.purchase_orders set status = 'sent' where id = $1", [po]);
      await asUser(c, u2);
      await expectQueryError(c, "select public.receive_purchase_order_items($1, $2::jsonb)", [po, JSON.stringify([{ item_id: item, quantity: 2 }])], "FORBIDDEN");
      await asSuperuser(c);
      expect(await onHand(c, sku)).toBe(0);
      // service_role (tâches serveur) reste soumis aux mêmes règles d'état.
      await asService(c);
      expect(await receive(c, po, [{ item_id: item, quantity: 2 }])).toBe("received");
    });
  });
});

d("Commandes fournisseurs : double réception concurrente (deux connexions)", () => {
  let org: CommittedOrg;
  let sup: string;
  beforeAll(async () => {
    org = await createCommittedOrg("po-conc");
    const rows = await runAsUser<{ id: string }>(org.userId, "insert into public.suppliers (organization_id, name) values ($1, 'F') returning id", [org.orgId]);
    sup = rows[0]!.id;
  });
  afterAll(async () => {
    await org?.cleanup();
  });

  async function sentPo(code: string, qty: number): Promise<{ po: string; item: string; sku: string }> {
    const sku = await createCommittedSku(org, code);
    const c = await userSession(org.userId);
    try {
      const po = await draftPo(c, org.orgId, sup);
      const item = await addLine(c, org.orgId, po, sku, qty, 2);
      await c.query("update public.purchase_orders set status = 'sent' where id = $1", [po]);
      await c.query("commit");
      return { po, item, sku };
    } finally {
      await c.end();
    }
  }

  it("double clic sur « tout réceptionner » : la seconde réception attend puis est refusée", async () => {
    const { po, item, sku } = await sentPo("PO-DBL-FULL", 5);
    const a = await userSession(org.userId);
    const b = await userSession(org.userId);
    try {
      await receive(a, po, [{ item_id: item, quantity: 5, expected_received: 0 }]);
      const second = errorOf(receive(b, po, [{ item_id: item, quantity: 5, expected_received: 0 }]));
      expect(await isStillPending(second)).toBe(true);
      await a.query("commit");
      expect(await second).toMatch(/PURCHASE_ORDER_ALREADY_RECEIVED/);
      await b.query("rollback");
    } finally {
      await a.end().catch(() => undefined);
      await b.end().catch(() => undefined);
    }
    const inv = await superQuery<{ quantity_on_hand: number }>("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
    expect(inv[0]!.quantity_on_hand).toBe(5);
  });

  it("double envoi d'une réception PARTIELLE : expected_received empêche le double comptage", async () => {
    const { po, item, sku } = await sentPo("PO-DBL-PART", 10);
    const a = await userSession(org.userId);
    const b = await userSession(org.userId);
    try {
      await receive(a, po, [{ item_id: item, quantity: 2, expected_received: 0 }]);
      const second = errorOf(receive(b, po, [{ item_id: item, quantity: 2, expected_received: 0 }]));
      expect(await isStillPending(second)).toBe(true);
      await a.query("commit");
      expect(await second).toMatch(/PURCHASE_ORDER_STALE/);
      await b.query("rollback");
    } finally {
      await a.end().catch(() => undefined);
      await b.end().catch(() => undefined);
    }
    const inv = await superQuery<{ quantity_on_hand: number }>("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
    expect(inv[0]!.quantity_on_hand).toBe(2);
    const rec = await superQuery<{ quantity_received: number }>("select quantity_received from public.purchase_order_items where id = $1", [item]);
    expect(rec[0]!.quantity_received).toBe(2);
  });

  it("réceptions concurrentes sans jeton : sérialisées et bornées (jamais plus que commandé)", async () => {
    const { po, item, sku } = await sentPo("PO-RACE", 6);
    const worker = async () => {
      for (let i = 0; i < 5; i++) {
        await runAsUser(org.userId, "select public.receive_purchase_order_items($1, $2::jsonb)", [po, JSON.stringify([{ item_id: item, quantity: 1 }])]).catch(() => undefined);
      }
    };
    await Promise.all([worker(), worker()]);
    const inv = await superQuery<{ quantity_on_hand: number }>("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
    expect(inv[0]!.quantity_on_hand).toBe(6);
    const [st] = await superQuery<{ status: string; received: number }>("select po.status, i.quantity_received as received from public.purchase_orders po join public.purchase_order_items i on i.purchase_order_id = po.id where po.id = $1", [po]);
    expect(st).toEqual({ status: "received", received: 6 });
  });
});
