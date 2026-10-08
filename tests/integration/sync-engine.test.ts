/**
 * Moteur de synchronisation de bout en bout : runChannelSync réel + connecteur scripté +
 * PostgreSQL local (schéma, contraintes et RPC réels). Aucun appel eBay.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorError } from "@/integrations/core/errors";
import type { OrdersPage } from "@/integrations/core/connector";
import { canConnect } from "./helpers";
import { closePool, createFixture, fakeConnector, listing, order, pages, q, resetFakeConnector, setTestEnv } from "./sync-harness";

setTestEnv();

vi.mock("@/lib/supabase/admin", async () => {
  const h = await import("./sync-harness");
  const client = h.createPgRestClient();
  return { createAdminSupabaseClient: () => client };
});
vi.mock("@/integrations/core/registry", async () => {
  const h = await import("./sync-harness");
  return { getConnector: () => h.fakeConnector(), getEbayConnector: () => h.fakeConnector(), listConnectorCatalog: () => [] };
});

const { runChannelSync } = await import("@/services/sync/engine");

const available = await canConnect();
const d = available ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});

beforeEach(() => {
  resetFakeConnector();
});

function ordersPage(orders: ReturnType<typeof order>[], extra: Partial<OrdersPage> = {}): OrdersPage {
  return { orders, invalid: [], truncated: false, ...extra };
}

async function connectionRow(id: string) {
  const [row] = await q<{ status: string; last_orders_cursor: string | null; last_sync_at: string | null; last_error: string | null; last_successful_sync_at: string | null }>(
    "select status, last_orders_cursor, last_sync_at, last_error, last_successful_sync_at from public.channel_connections where id = $1",
    [id],
  );
  return row!;
}

async function stock(skuId: string): Promise<number> {
  const [row] = await q<{ quantity_on_hand: number }>("select quantity_on_hand from public.inventory where sku_id = $1", [skuId]);
  return row!.quantity_on_hand;
}

d("moteur de synchronisation (connecteur simulé, base réelle)", () => {
  it("une commande en échec n'est jamais sautée par le curseur ; elle est reprise au run suivant", async () => {
    const f = await createFixture({ cursor: new Date("2026-10-07T07:00:00.000Z") });
    const c = fakeConnector();
    const bad = order("B", { externalModifiedAt: "2026-10-07T09:00:00.000Z", status: "not-a-status" as never });
    c.orders = () => pages(ordersPage([order("A", { externalModifiedAt: "2026-10-07T08:00:00.000Z" }), bad, order("C", { externalModifiedAt: "2026-10-07T10:00:00.000Z" })]));

    const r1 = await runChannelSync(f.connectionId, { trigger: "manual", scope: "orders" });
    expect(r1.status).toBe("partial");
    expect(r1.stats.orders_created).toBe(2);
    const conn1 = await connectionRow(f.connectionId);
    // Le curseur s'arrête à la commande en échec (09:00), pas à la plus récente vue (10:00).
    expect(conn1.last_orders_cursor).toBe("2026-10-07T09:00:00.000Z");
    const errs = await q<{ code: string; entity_ref: string }>("select code, entity_ref from public.sync_errors where sync_run_id = $1", [r1.runId]);
    expect(errs).toEqual([expect.objectContaining({ code: "ORDER_INGEST_FAILED", entity_ref: "B" })]);

    // Run suivant : la fenêtre recouvre B (09:00 - 3 h), qui est maintenant valide.
    c.orders = (params) => {
      expect(params.since.getTime()).toBeLessThanOrEqual(new Date("2026-10-07T09:00:00.000Z").getTime());
      return pages(ordersPage([order("B", { externalModifiedAt: "2026-10-07T09:00:00.000Z" }), order("C", { externalModifiedAt: "2026-10-07T10:00:00.000Z" })]));
    };
    const r2 = await runChannelSync(f.connectionId, { trigger: "manual", scope: "orders" });
    expect(r2.status).toBe("success");
    expect(r2.stats).toMatchObject({ orders_created: 1, orders_updated: 1 });
    const orders = await q<{ external_order_id: string }>("select external_order_id from public.orders where organization_id = $1 order by 1", [f.orgId]);
    expect(orders.map((o) => o.external_order_id)).toEqual(["A", "B", "C"]);
    expect(await stock(f.skuId)).toBe(7);
    expect((await connectionRow(f.connectionId)).last_orders_cursor).toBe("2026-10-07T10:00:00.000Z");
  });

  it("échec d'une page au milieu : run partiel, base cohérente (commandes complètes), compteurs exacts, curseur inchangé", async () => {
    const f = await createFixture({ cursor: new Date("2026-10-07T07:00:00.000Z") });
    const c = fakeConnector();
    c.orders = async function* () {
      yield ordersPage([order("P1"), order("P2")]);
      throw new ConnectorError("API_ERROR", "ebay", "L'API ebay est indisponible (HTTP 503) après 4 tentative(s).", { httpStatus: 503 });
    };
    c.listings = () => pages({ listings: [listing("L-1")], invalid: [], warnings: [], truncated: false });
    const r = await runChannelSync(f.connectionId, { trigger: "manual", scope: "full" });
    expect(r.status).toBe("partial");
    expect(r.stats.orders_created).toBe(2);
    expect(r.stats.inventory_changes).toBe(2);
    expect(r.errorSummary).toContain("HTTP 503");
    // Chaque commande est tout-ou-rien : 2 commandes, 2 lignes, 2 mouvements.
    const [counts] = await q<{ orders: number; items: number; moves: number }>(
      `select (select count(*)::int from public.orders where organization_id = $1) as orders,
              (select count(*)::int from public.order_items where organization_id = $1) as items,
              (select count(*)::int from public.inventory_movements where organization_id = $1 and type = 'sale') as moves`,
      [f.orgId],
    );
    expect(counts).toEqual({ orders: 2, items: 2, moves: 2 });
    expect((await connectionRow(f.connectionId)).last_orders_cursor).toBe("2026-10-07T07:00:00.000Z");
    expect((await connectionRow(f.connectionId)).status).toBe("connected");

    // Run suivant : mêmes commandes + la suite → aucune double décrémentation.
    c.orders = () => pages(ordersPage([order("P1"), order("P2"), order("P3")]));
    const r2 = await runChannelSync(f.connectionId, { trigger: "scheduled", scope: "orders" });
    expect(r2.status).toBe("success");
    expect(r2.stats).toMatchObject({ orders_created: 1, orders_updated: 2, inventory_changes: 1 });
    expect(await stock(f.skuId)).toBe(7);
  });

  it("phase seule en échec (périmètre commandes) : run « failed », alerte sync_failed, connexion en erreur", async () => {
    const f = await createFixture();
    fakeConnector().orders = async function* () {
      throw new ConnectorError("RATE_LIMITED", "ebay", "Quota API ebay atteint (HTTP 429) : réessayez dans 60 min.", { httpStatus: 429 });
    };
    const r = await runChannelSync(f.connectionId, { trigger: "manual", scope: "orders" });
    expect(r.status).toBe("failed");
    expect((await connectionRow(f.connectionId)).status).toBe("error");
    const alerts = await q<{ type: string; action_href: string }>("select type, action_href from public.alerts where organization_id = $1 and status <> 'resolved'", [f.orgId]);
    expect(alerts).toEqual([{ type: "sync_failed", action_href: `/settings/sync/${r.runId}` }]);
  });

  it("commandes au format inattendu : comptées comme invalides, le reste est importé", async () => {
    const f = await createFixture();
    fakeConnector().orders = () => pages(ordersPage([order("OK-1")], { invalid: [{ ref: "BROKEN-1", message: "Commande eBay BROKEN-1 au format inattendu : lineItems.0.quantity." }] }));
    const r = await runChannelSync(f.connectionId, { trigger: "manual", scope: "orders" });
    expect(r.status).toBe("partial");
    expect(r.stats.orders_created).toBe(1);
    const errs = await q<{ code: string; entity_ref: string; message: string }>("select code, entity_ref, message from public.sync_errors where sync_run_id = $1", [r.runId]);
    expect(errs[0]).toMatchObject({ code: "INVALID_ORDER", entity_ref: "BROKEN-1" });
    expect(errs[0]!.message).toContain("n'a pas été importée");
  });

  it("fenêtre tronquée : la tranche est redécoupée ; si elle reste tronquée, le curseur ne dépasse pas la dernière tranche complète", async () => {
    const f = await createFixture({ cursor: null });
    const c = fakeConnector();
    // eBay renvoie « tronqué » pour toute tranche de plus de 2 jours.
    c.orders = (params) => {
      const days = (params.until!.getTime() - params.since.getTime()) / 86_400_000;
      return pages(ordersPage([], { truncated: days > 2 }));
    };
    const r = await runChannelSync(f.connectionId, { trigger: "initial", scope: "orders", orders: { sliceHours: 24 * 7, minSliceHours: 24 } });
    expect(r.status).toBe("success");
    const cursor = (await connectionRow(f.connectionId)).last_orders_cursor;
    expect(new Date(cursor!).getTime()).toBeGreaterThan(Date.now() - 60_000);

    // Toujours tronqué même en petites tranches : arrêt, erreur explicite, curseur sur la fin de la dernière tranche complète.
    const g = await createFixture({ cursor: null });
    resetFakeConnector().orders = (params) => pages(ordersPage([order(`T-${params.since.getTime()}`)], { truncated: params.since.getTime() > Date.now() - 30 * 86_400_000 }));
    const r2 = await runChannelSync(g.connectionId, { trigger: "initial", scope: "orders", orders: { sliceHours: 24 * 7, minSliceHours: 24 * 7 } });
    expect(r2.status).toBe("partial");
    const errs = await q<{ code: string }>("select code from public.sync_errors where sync_run_id = $1", [r2.runId]);
    expect(errs.map((e) => e.code)).toContain("ORDERS_TRUNCATED");
    const cursor2 = new Date((await connectionRow(g.connectionId)).last_orders_cursor!).getTime();
    expect(cursor2).toBeLessThanOrEqual(Date.now() - 30 * 86_400_000 + 7 * 86_400_000);
    expect(cursor2).toBeGreaterThan(Date.now() - 91 * 86_400_000);
  });

  it("annonces : liste tronquée → rien n'est terminé ; liste complète → les absentes sont terminées", async () => {
    const f = await createFixture();
    const c = fakeConnector();
    c.listings = () => pages({ listings: [listing("X"), listing("Y")], invalid: [], warnings: [], truncated: false });
    await runChannelSync(f.connectionId, { trigger: "manual", scope: "listings" });

    c.listings = () => pages({ listings: [listing("Y")], invalid: [], warnings: [], truncated: true });
    const r = await runChannelSync(f.connectionId, { trigger: "manual", scope: "listings" });
    expect(r.status).toBe("partial");
    expect(r.stats.listings_ended).toBe(0);
    const statuses = await q<{ external_listing_id: string; status: string }>("select external_listing_id, status from public.channel_listings where sales_channel_id = $1 order by 1", [f.channelId]);
    expect(statuses).toEqual([
      { external_listing_id: "X", status: "active" },
      { external_listing_id: "Y", status: "active" },
    ]);

    // Échec au milieu de la lecture : la page lue est enregistrée, rien n'est terminé.
    c.listings = async function* () {
      yield { listings: [listing("Y", { title: "Y modifiée" })], invalid: [], warnings: [], truncated: false };
      throw new ConnectorError("API_ERROR", "ebay", "Erreur de l'API eBay (HTTP 500).", { httpStatus: 500 });
    };
    const r2 = await runChannelSync(f.connectionId, { trigger: "manual", scope: "listings" });
    expect(r2.status).toBe("failed");
    expect(r2.stats.listings_upserted).toBe(1);
    expect((await q("select title from public.channel_listings where sales_channel_id = $1 and external_listing_id = 'Y'", [f.channelId]))[0]).toEqual({ title: "Y modifiée" });
    expect((await q("select status from public.channel_listings where sales_channel_id = $1 and external_listing_id = 'X'", [f.channelId]))[0]).toEqual({ status: "active" });

    c.listings = () => pages({ listings: [listing("Y")], invalid: [], warnings: [], truncated: false });
    const r3 = await runChannelSync(f.connectionId, { trigger: "manual", scope: "listings" });
    expect(r3.stats.listings_ended).toBe(1);
    expect((await q("select status from public.channel_listings where sales_channel_id = $1 and external_listing_id = 'X'", [f.channelId]))[0]).toEqual({ status: "ended" });
  });

  it("concurrence : un seul run « running » par connexion ; message CONFLICT clair ; run périmé nettoyé", async () => {
    const f = await createFixture();
    const c = fakeConnector();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    c.orders = async function* () {
      await gate;
      yield ordersPage([order("CC-1")]);
    };
    const first = runChannelSync(f.connectionId, { trigger: "manual", scope: "orders" });
    await new Promise((r) => setTimeout(r, 150));
    const second = await runChannelSync(f.connectionId, { trigger: "webhook", scope: "orders" }).catch((e: unknown) => e);
    expect(second).toMatchObject({ code: "CONFLICT" });
    expect((second as Error).message).toMatch(/déjà en cours/);
    release();
    expect((await first).status).toBe("success");

    // Course sur l'insertion elle-même (vérification préalable passée des deux côtés) : l'index unique tranche.
    const [{ n }] = (await q<{ n: number }>("select count(*)::int as n from public.sync_runs where source_ref = $1", [f.connectionId])) as [{ n: number }];
    expect(n).toBe(1);

    // Run « running » abandonné depuis 20 min : marqué en échec, le nouveau run démarre.
    const [stale] = await q<{ id: string }>(
      "insert into public.sync_runs (organization_id, source_kind, source_ref, provider, trigger, status, started_at) values ($1, 'channel', $2, 'ebay', 'manual', 'running', now() - interval '20 minutes') returning id",
      [f.orgId, f.connectionId],
    );
    c.orders = () => pages(ordersPage([]));
    const r = await runChannelSync(f.connectionId, { trigger: "manual", scope: "orders" });
    expect(r.status).toBe("success");
    const [staleRow] = await q<{ status: string; error_summary: string }>("select status, error_summary from public.sync_runs where id = $1", [stale!.id]);
    expect(staleRow).toMatchObject({ status: "failed" });
    expect(staleRow!.error_summary).toMatch(/interrompu/);
  });

  it("deux runs simultanés sans attente : l'index unique garantit un seul run", async () => {
    const f = await createFixture();
    fakeConnector().orders = () => pages(ordersPage([order("R-1")]));
    const results = await Promise.allSettled([1, 2, 3].map(() => runChannelSync(f.connectionId, { trigger: "manual", scope: "orders" })));
    const ok = results.filter((r) => r.status === "fulfilled");
    const conflicts = results.filter((r) => r.status === "rejected" && (r.reason as { code?: string }).code === "CONFLICT");
    expect(ok.length + conflicts.length).toBe(3);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(await stock(f.skuId)).toBe(9);
    expect((await q("select count(*)::int as n from public.orders where organization_id = $1", [f.orgId]))[0]).toEqual({ n: 1 });
  });

  it("run déclenché par webhook : ne repousse pas la synchronisation planifiée (last_sync_at inchangé)", async () => {
    const f = await createFixture();
    fakeConnector().orders = () => pages(ordersPage([order("W-1")]));
    const r = await runChannelSync(f.connectionId, { trigger: "webhook", scope: "orders" });
    expect(r.status).toBe("success");
    const conn = await connectionRow(f.connectionId);
    expect(conn.last_sync_at).toBeNull();
    expect(conn.last_successful_sync_at).not.toBeNull();
  });

  it("connexion déconnectée pendant le run : jamais « réveillée », aucune alerte", async () => {
    const f = await createFixture();
    fakeConnector().orders = async function* () {
      await q("delete from public.channel_connection_secrets where connection_id = $1", [f.connectionId]);
      await q("update public.channel_connections set status = 'disconnected' where id = $1", [f.connectionId]);
      yield ordersPage([order("D-1")]);
    };
    const r = await runChannelSync(f.connectionId, { trigger: "manual", scope: "orders" });
    expect(r.status).toBe("success");
    expect((await connectionRow(f.connectionId)).status).toBe("disconnected");
    expect(await q("select id from public.alerts where organization_id = $1 and status <> 'resolved'", [f.orgId])).toEqual([]);
  });

  it("aucun secret dans sync_errors, error_summary ni last_error", async () => {
    const f = await createFixture();
    const secret = "v^1.1#i^1#p^3#r^1#SECRETTOKENVALUE123";
    fakeConnector().orders = async function* () {
      throw new ConnectorError("API_ERROR", "ebay", `Erreur eBay : Authorization: Bearer ${secret} refusé (access_token=${secret})`, {
        details: { authorization: `Bearer ${secret}`, note: `refresh_token=${secret}`, nested: { access_token: secret, url: `https://api.ebay.com/x?access_token=${secret}` } },
      });
    };
    const r = await runChannelSync(f.connectionId, { trigger: "manual", scope: "orders" });
    expect(r.status).toBe("failed");
    const rows = await q("select message, details from public.sync_errors where sync_run_id = $1", [r.runId]);
    const runRow = await q("select error_summary from public.sync_runs where id = $1", [r.runId]);
    const conn = await connectionRow(f.connectionId);
    const alerts = await q("select message from public.alerts where organization_id = $1", [f.orgId]);
    const dump = JSON.stringify({ rows, runRow, conn, alerts });
    expect(dump).not.toContain("SECRETTOKENVALUE123");
    expect(dump).toContain("[REDACTED");
  });
});
