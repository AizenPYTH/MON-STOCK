import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asService, asSuperuser, asUser, canConnect, createOrgAs, createSkuAs, createUser, expectQueryError, withRollback } from "./helpers";
import { createCommittedOrg, createCommittedSku, errorOf, isStillPending, runAsService, runAsUser, serviceSession, superQuery, userSession, type CommittedOrg } from "./stock-fixtures";

const available = await canConnect();
const d = available ? describe : describe.skip;

d("Stock : calculs et garde-fous (apply_inventory_movement v2)", () => {
  it("disponible = en main − réservé, à zéro comme en négatif", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "stk-math@example.test");
      const org = await createOrgAs(c, u, "Org", "stk-math");
      const sku = await createSkuAs(c, u, org, "MATH-1", { initial: 3 });
      await asUser(c, u);
      await c.query("select public.adjust_reserved_quantity($1, $2, 2)", [org, sku]);
      let r = await c.query("select quantity_on_hand, quantity_reserved, quantity_available from public.inventory where sku_id = $1", [sku]);
      expect(r.rows[0]).toEqual({ quantity_on_hand: 3, quantity_reserved: 2, quantity_available: 1 });
      // Vente réelle au-delà du stock : acceptée (la marketplace a déjà vendu), le stock devient négatif.
      // Seul le serveur (service_role) ou une fonction interne applique une vente.
      await asService(c);
      await c.query("select public.apply_inventory_movement($1, $2, 'sale', -4, 'order_item', null, 'ebay')", [org, sku]);
      await asUser(c, u);
      r = await c.query("select quantity_on_hand, quantity_available from public.inventory where sku_id = $1", [sku]);
      expect(r.rows[0]).toEqual({ quantity_on_hand: -1, quantity_available: -3 });
      // La vue de stock expose la même arithmétique.
      const v = await c.query("select quantity_on_hand, quantity_reserved, quantity_available from public.v_stock_overview where sku_id = $1", [sku]);
      expect(v.rows[0]).toEqual({ quantity_on_hand: -1, quantity_reserved: 2, quantity_available: -3 });
    });
  });

  it("refuse les mouvements manuels qui rendraient le stock négatif, y compris « correction »", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "stk-neg@example.test");
      const org = await createOrgAs(c, u, "Org", "stk-neg");
      const sku = await createSkuAs(c, u, org, "NEG-1", { initial: 2 });
      await asUser(c, u);
      for (const type of ["adjustment", "correction", "transfer_out"]) {
        await expectQueryError(c, "select public.apply_inventory_movement($1, $2, $3::public.movement_type, -3)", [org, sku, type], "INSUFFICIENT_STOCK");
      }
      // Jusqu'à zéro, c'est permis.
      await c.query("select public.apply_inventory_movement($1, $2, 'adjustment', -2)", [org, sku]);
      const r = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(r.rows[0].quantity_on_hand).toBe(0);
      // Une correction positive reste possible depuis un stock négatif (retour à la normale).
      await asService(c);
      await c.query("select public.apply_inventory_movement($1, $2, 'sale', -2, 'order_item', null, 'ebay')", [org, sku]);
      await asUser(c, u);
      await c.query("select public.apply_inventory_movement($1, $2, 'correction', 1)", [org, sku]);
      const r2 = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(r2.rows[0].quantity_on_hand).toBe(-1);
    });
  });

  it("refuse les quantités absurdes, les signes incohérents et les SKU inexistants", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "stk-bounds@example.test");
      const org = await createOrgAs(c, u, "Org", "stk-bounds");
      const sku = await createSkuAs(c, u, org, "BOUNDS-1", { initial: 1 });
      await asUser(c, u);
      await expectQueryError(c, "select public.apply_inventory_movement($1, $2, 'receipt', 2000000)", [org, sku], "MOVEMENT_QUANTITY_TOO_LARGE");
      await expectQueryError(c, "select public.apply_inventory_movement($1, $2, 'receipt', 0)", [org, sku], "MOVEMENT_QUANTITY_ZERO");
      await expectQueryError(c, "select public.apply_inventory_movement($1, $2, 'receipt', -1)", [org, sku], "MOVEMENT_SIGN_INVALID");
      await asService(c);
      await expectQueryError(c, "select public.apply_inventory_movement($1, $2, 'sale', 1)", [org, sku], "MOVEMENT_SIGN_INVALID");
      await asUser(c, u);
      await expectQueryError(c, "select public.apply_inventory_movement($1, gen_random_uuid(), 'receipt', 1)", [org], "SKU_NOT_FOUND");
      // Plafond global : le stock ne peut pas dépasser 1 milliard d'unités (pas de dépassement d'entier).
      for (let i = 0; i < 3; i++) await c.query("select public.apply_inventory_movement($1, $2, 'receipt', 1000000)", [org, sku]);
      const r = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(r.rows[0].quantity_on_hand).toBe(3_000_001);
      // Initial négatif via create_sku : ignoré (seule une quantité > 0 crée un mouvement).
      const neg = await createSkuAs(c, u, org, "BOUNDS-2", { initial: -5 });
      const r2 = await c.query("select quantity_on_hand, (select count(*)::int from public.inventory_movements where sku_id = $1) as n from public.inventory where sku_id = $1", [neg]);
      expect(r2.rows[0]).toEqual({ quantity_on_hand: 0, n: 0 });
    });
  });

  it("ouvre une alerte « stock négatif » au passage sous zéro et la résout au retour à zéro", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "stk-alert@example.test");
      const org = await createOrgAs(c, u, "Org", "stk-alert");
      const sku = await createSkuAs(c, u, org, "ALERT-1", { initial: 1 });
      await asService(c);
      await c.query("select public.apply_inventory_movement($1, $2, 'sale', -2, 'order_item', null, 'ebay')", [org, sku]);
      await c.query("select public.apply_inventory_movement($1, $2, 'sale', -1, 'order_item', null, 'ebay')", [org, sku]);
      await asUser(c, u);
      let a = await c.query("select type, severity, status, action_href from public.alerts where organization_id = $1", [org]);
      expect(a.rows).toEqual([{ type: "negative_stock", severity: "critical", status: "open", action_href: "/stock/ALERT-1" }]);
      await c.query("select public.apply_inventory_movement($1, $2, 'receipt', 2)", [org, sku]);
      a = await c.query("select status from public.alerts where organization_id = $1", [org]);
      expect(a.rows).toEqual([{ status: "resolved" }]);
    });
  });

  it("le code SKU est unique sans tenir compte de la casse, par organisation", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "stk-dup@example.test");
      const org = await createOrgAs(c, u, "Org", "stk-dup");
      const org2 = await createOrgAs(c, u, "Org 2", "stk-dup-2");
      await createSkuAs(c, u, org, "Dup-Code");
      await expectQueryError(
        c,
        `select public.create_sku($1, '{"name":"V"}'::jsonb, '{"code":"  dup-CODE "}'::jsonb, null, '{"name":"P"}'::jsonb, 0)`,
        [org],
        "SKU_CODE_EXISTS",
      );
      // Le même code est libre dans une autre organisation.
      await createSkuAs(c, u, org2, "DUP-CODE");
    });
  });
});

d("Catalogue : l'archivage est le modèle de suppression", () => {
  it("un SKU / produit / variante avec historique ne peut pas être supprimé par un utilisateur", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "cat-del@example.test");
      const org = await createOrgAs(c, u, "Org", "cat-del");
      const sku = await createSkuAs(c, u, org, "HIST-1", { initial: 4 });
      await asUser(c, u);
      const { rows } = await c.query("select product_id, variant_id from public.skus where id = $1", [sku]);
      await expectQueryError(c, "delete from public.skus where id = $1", [sku], "SKU_HAS_HISTORY");
      await expectQueryError(c, "delete from public.product_variants where id = $1", [rows[0].variant_id], "SKU_HAS_HISTORY");
      await expectQueryError(c, "delete from public.products where id = $1", [rows[0].product_id], "SKU_HAS_HISTORY");
      const left = await c.query("select count(*)::int as n from public.inventory_movements where sku_id = $1", [sku]);
      expect(left.rows[0].n).toBe(1);
      // Un SKU créé par erreur, sans aucun historique, reste supprimable.
      const fresh = await createSkuAs(c, u, org, "FRESH-1");
      await asUser(c, u);
      const del = await c.query("delete from public.skus where id = $1", [fresh]);
      expect(del.rowCount).toBe(1);
    });
  });

  it("un SKU référencé par une vente ne peut pas être supprimé (les lignes de commande garderaient un SKU vide)", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "cat-del2@example.test");
      const org = await createOrgAs(c, u, "Org", "cat-del2");
      const sku = await createSkuAs(c, u, org, "SOLD-1");
      await asService(c);
      const { rows: ch } = await c.query("select id from public.sales_channels where organization_id = $1", [org]);
      await c.query("select public.ingest_external_order($1, $2, null, 'manual', $3::jsonb, $4::jsonb)", [
        org,
        ch[0].id,
        JSON.stringify({ external_order_id: "O-1", status: "cancelled", currency: "EUR", placed_at: "2026-10-01T10:00:00Z" }),
        JSON.stringify([{ external_line_item_id: "L1", external_sku: "SOLD-1", quantity: 1, unit_price: 10 }]),
      ]);
      await asUser(c, u);
      await expectQueryError(c, "delete from public.skus where id = $1", [sku], "SKU_HAS_HISTORY");
    });
  });

  it("la suppression de l'organisation (cascade) reste possible malgré l'historique", async () => {
    const org = await createCommittedOrg("cat-cascade");
    await createCommittedSku(org, "CASCADE-1", { initial: 5 });
    await org.cleanup();
    const left = await superQuery<{ n: number }>("select count(*)::int as n from public.skus where organization_id = $1", [org.orgId]);
    expect(left[0]!.n).toBe(0);
  });
});

d("Stock : concurrence (deux connexions)", () => {
  let org: CommittedOrg;
  beforeAll(async () => {
    org = await createCommittedOrg("stk-conc");
  });
  afterAll(async () => {
    await org?.cleanup();
  });

  it("le verrou de ligne sérialise deux mouvements simultanés (aucune mise à jour perdue)", async () => {
    const sku = await createCommittedSku(org, "CONC-LOCK", { initial: 10 });
    const a = await serviceSession();
    const b = await serviceSession();
    try {
      await a.query("select public.apply_inventory_movement($1, $2, 'sale', -3, 'order_item', null, 'ebay')", [org.orgId, sku]);
      // B tente un mouvement sur le même SKU : il attend le verrou de A.
      const pending = b.query("select (public.apply_inventory_movement($1, $2, 'sale', -4, 'order_item', null, 'amazon')).quantity_after as after", [org.orgId, sku]);
      expect(await isStillPending(pending)).toBe(true);
      await a.query("commit");
      const res = await pending;
      // B a relu le stock commité par A (10 − 3), et non la valeur initiale.
      expect(res.rows[0].after).toBe(3);
      await b.query("commit");
    } finally {
      await a.end().catch(() => undefined);
      await b.end().catch(() => undefined);
    }
    const rows = await superQuery<{ quantity_on_hand: number }>("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
    expect(rows[0]!.quantity_on_hand).toBe(3);
  });

  it("100 ventes concurrentes sur deux connexions : stock et journal exacts", async () => {
    const sku = await createCommittedSku(org, "CONC-RACE", { initial: 1000 });
    const worker = async (channel: string) => {
      for (let i = 0; i < 50; i++) {
        await runAsService("select public.apply_inventory_movement($1, $2, 'sale', -1, 'order_item', null, $3)", [org.orgId, sku, channel]);
      }
    };
    await Promise.all([worker("ebay"), worker("amazon")]);
    const inv = await superQuery<{ quantity_on_hand: number }>("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
    expect(inv[0]!.quantity_on_hand).toBe(900);
    const mv = await superQuery<{ n: number; distinct_after: number; min_after: number }>(
      "select count(*)::int as n, count(distinct quantity_after)::int as distinct_after, min(quantity_after)::int as min_after from public.inventory_movements where sku_id = $1 and type = 'sale'",
      [sku],
    );
    // Chaque vente a vu un stock différent : 999, 998, … 900 — jamais deux fois la même valeur.
    expect(mv[0]).toEqual({ n: 100, distinct_after: 100, min_after: 900 });
  });

  it("deux créations simultanées du même code (casse différente) : une seule réussit", async () => {
    const a = await userSession(org.userId);
    const b = await userSession(org.userId);
    const sql = `select public.create_sku($1, '{"name":"V"}'::jsonb, jsonb_build_object('code', $2::text), null, '{"name":"P"}'::jsonb, 0)`;
    try {
      await a.query(sql, [org.orgId, "RACE-CODE"]);
      const second = errorOf(b.query(sql, [org.orgId, "race-code"]));
      await a.query("commit");
      const msg = await second;
      // L'index unique (organization_id, upper(code)) tranche : l'erreur doit être reconnue par l'application.
      expect(msg).toMatch(/skus_org_code_uidx|SKU_CODE_EXISTS/);
      await b.query("rollback");
    } finally {
      await a.end().catch(() => undefined);
      await b.end().catch(() => undefined);
    }
    const rows = await superQuery<{ n: number }>("select count(*)::int as n from public.skus where organization_id = $1 and upper(code) = 'RACE-CODE'", [org.orgId]);
    expect(rows[0]!.n).toBe(1);
  });

  it("édition simultanée des prix : verrou optimiste sur updated_at, historique complet", async () => {
    const sku = await createCommittedSku(org, "CONC-PRICE", { cost: 100, sale: 150 });
    const [meta] = await superQuery<{ updated_at: string }>("select updated_at::text as updated_at from public.skus where id = $1", [sku]);
    const seen = meta!.updated_at;
    // Deux formulaires ouverts sur la même version : le premier enregistrement gagne…
    const first = await runAsUser(org.userId, "update public.skus set sale_price = 160 where id = $1 and updated_at = $2::timestamptz returning id", [sku, seen]);
    expect(first).toHaveLength(1);
    // …le second (version périmée) ne touche aucune ligne : l'application affiche « modifié entre-temps ».
    const second = await runAsUser(org.userId, "update public.skus set cost_price = 90, sale_price = 150 where id = $1 and updated_at = $2::timestamptz returning id", [sku, seen]);
    expect(second).toHaveLength(0);
    const [row] = await superQuery<{ cost_price: string; sale_price: string }>("select cost_price, sale_price from public.skus where id = $1", [sku]);
    expect([Number(row!.cost_price), Number(row!.sale_price)]).toEqual([100, 160]);
    const hist = await superQuery<{ kind: string; price: string }>("select kind, price from public.price_history where sku_id = $1 order by recorded_at, kind", [sku]);
    expect(hist.map((h) => [h.kind, Number(h.price)])).toEqual([
      ["cost", 100],
      ["sale", 150],
      ["sale", 160],
    ]);
  });
});

d("Stock : isolation", () => {
  it("un utilisateur ne peut pas mouvementer le stock d'une autre organisation", async () => {
    await withRollback(async (c) => {
      const u1 = await createUser(c, "iso-1@example.test");
      const u2 = await createUser(c, "iso-2@example.test");
      const org1 = await createOrgAs(c, u1, "Org 1", "iso-1");
      await createOrgAs(c, u2, "Org 2", "iso-2");
      const sku = await createSkuAs(c, u1, org1, "ISO-1", { initial: 5 });
      await asUser(c, u2);
      await expectQueryError(c, "select public.apply_inventory_movement($1, $2, 'adjustment', -1)", [org1, sku], "FORBIDDEN");
      await asSuperuser(c);
      const r = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(r.rows[0].quantity_on_hand).toBe(5);
    });
  });
});
