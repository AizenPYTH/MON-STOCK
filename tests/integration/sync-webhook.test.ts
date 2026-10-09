/**
 * Webhook eBay (/api/webhooks/ebay, logique dans services/sync/ebay-webhook.ts) contre la base
 * réelle : signature ECDSA avec une clé générée, déduplication, rejouement, taille maximale,
 * panne de vérification (503 sans consommer l'événement), suppression de compte (anonymisation +
 * déconnexion), synchronisation en conflit avec un run en cours.
 */
import { createSign, generateKeyPairSync } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { PublicKeyNotFoundError } from "@/integrations/ebay/notification-keys";
import type { ChannelConnection } from "@/db/types";
import { canConnect } from "./helpers";
import { closePool, createFixture, createPgRestClient, q, setTestEnv } from "./sync-harness";

setTestEnv();
const { handleEbayNotification, recoverAbandonedWebhookEvents, WEBHOOK_ABANDONED_MS, WEBHOOK_MAX_BODY_BYTES, DELETED_ACCOUNT_LABEL } = await import("@/services/sync/ebay-webhook");
type Deps = Parameters<typeof handleEbayNotification>[1];

const available = await canConnect();
const d = available ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const otherKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;

function signatureHeader(body: string, key = privateKey, kid = "kid-test"): string {
  const signer = createSign("sha1");
  signer.update(body);
  return Buffer.from(JSON.stringify({ alg: "ecdsa", kid, signature: signer.sign(key, "base64"), digest: "SHA1" })).toString("base64");
}

function notificationBody(topic: string, data: Record<string, unknown>, notificationId = `n-${Math.random().toString(36).slice(2)}`): string {
  return JSON.stringify({ metadata: { topic, schemaVersion: "1.0", deprecated: false }, notification: { notificationId, eventDate: "2026-10-08T10:00:00.000Z", publishDate: "2026-10-08T10:00:01.000Z", publishAttemptCount: 1, data } });
}

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://app.monstock.test/api/webhooks/ebay", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
}

function deps(overrides: Partial<Deps> = {}): Deps & { scheduled: Array<() => Promise<void>> } {
  const scheduled: Array<() => Promise<void>> = [];
  const admin = createPgRestClient() as unknown as Deps["admin"];
  return {
    admin,
    isConfigured: () => true,
    getPublicKey: async (kid) => {
      if (kid !== "kid-test") throw new PublicKeyNotFoundError(kid);
      return { key: pem, algorithm: "ECDSA", digest: "SHA1" };
    },
    findConnections: async ({ userId, username }) => {
      const rows = await q<ChannelConnection>("select * from public.channel_connections where provider = 'ebay' and (external_account_id = $1 or external_username = $2)", [userId, username]);
      return rows;
    },
    runSync: async () => ({ runId: "00000000-0000-0000-0000-000000000000", status: "success", stats: {} as never, durationMs: 1, errorSummary: null, connectionId: "x" }),
    schedule: (task) => {
      scheduled.push(task);
    },
    sleep: async () => undefined,
    conflictWaitMs: 0,
    ...overrides,
    scheduled,
  } as Deps & { scheduled: Array<() => Promise<void>> };
}

async function event(eventId: string) {
  const rows = await q<{ status: string; error: string | null; payload: unknown; signature_valid: boolean }>("select status, error, payload, signature_valid from public.webhook_events where provider = 'ebay' and event_id = $1", [eventId]);
  return rows[0] ?? null;
}

d("webhook eBay", () => {
  it("signature valide → acceptée ; même notification rejouée → « duplicate » (200), sans nouveau traitement", async () => {
    const id = `ok-${Date.now()}`;
    const body = notificationBody("ITEM_SOLD", { userId: "nobody" }, id);
    const dep = deps();
    const r1 = await handleEbayNotification(post(body, { "x-ebay-signature": signatureHeader(body) }), dep);
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ status: "ignored" });
    expect(await event(id)).toMatchObject({ status: "ignored", signature_valid: true });
    const r2 = await handleEbayNotification(post(body, { "x-ebay-signature": signatureHeader(body) }), dep);
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ status: "duplicate" });
  });

  it("en-tête absent, signature invalide, kid inconnu → 401 ; l'identifiant réel reste disponible pour une livraison valide", async () => {
    const id = `sig-${Date.now()}`;
    const body = notificationBody("ITEM_SOLD", {}, id);
    const dep = deps();
    const missing = await handleEbayNotification(post(body), dep);
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ status: "rejected", error: expect.stringMatching(/absent/) });
    // Rejouer la même requête non signée : doublon, toujours 401.
    expect((await handleEbayNotification(post(body), dep)).status).toBe(401);

    const forged = await handleEbayNotification(post(body, { "x-ebay-signature": signatureHeader(body, otherKey) }), dep);
    expect(forged.status).toBe(401);
    const unknownKid = await handleEbayNotification(post(body, { "x-ebay-signature": signatureHeader(body, privateKey, "kid-inconnu") }), dep);
    expect(unknownKid.status).toBe(401);
    expect(await unknownKid.json()).toMatchObject({ error: expect.stringMatching(/inconnue/) });
    expect(await event(id)).toBeNull();

    const valid = await handleEbayNotification(post(body, { "x-ebay-signature": signatureHeader(body) }), dep);
    expect(valid.status).toBe(200);
    expect(await event(id)).toMatchObject({ signature_valid: true });
  });

  it("panne de vérification (clé publique injoignable) → 503 sans consommer l'événement ; la relivraison est traitée", async () => {
    const id = `infra-${Date.now()}`;
    const body = notificationBody("ITEM_SOLD", {}, id);
    const down = await handleEbayNotification(post(body, { "x-ebay-signature": signatureHeader(body) }), deps({ getPublicKey: async () => Promise.reject(new Error("ECONNRESET")) }));
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ status: "retry" });
    expect(await event(id)).toBeNull();
    const ok = await handleEbayNotification(post(body, { "x-ebay-signature": signatureHeader(body) }), deps());
    expect(ok.status).toBe(200);
    expect(await event(id)).not.toBeNull();
  });

  it("corps trop volumineux → 413 (Content-Length annoncé ou flux réel), rien n'est enregistré", async () => {
    const big = "x".repeat(WEBHOOK_MAX_BODY_BYTES + 1);
    const r1 = await handleEbayNotification(post(big, { "content-length": String(big.length) }), deps());
    expect(r1.status).toBe(413);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 70; i++) controller.enqueue(new Uint8Array(1024));
        controller.close();
      },
    });
    const r2 = await handleEbayNotification(new Request("https://app.monstock.test/api/webhooks/ebay", { method: "POST", body: stream, duplex: "half" } as RequestInit), deps());
    expect(r2.status).toBe(413);
  });

  it("JSON invalide / format inattendu → 400 ; intégration non configurée → 503", async () => {
    expect((await handleEbayNotification(post("{pas du json"), deps())).status).toBe(400);
    expect((await handleEbayNotification(post(JSON.stringify({ foo: 1 })), deps())).status).toBe(400);
    expect((await handleEbayNotification(post(notificationBody("ITEM_SOLD", {})), deps({ isConfigured: () => false }))).status).toBe(503);
  });

  it("base indisponible pendant la recherche des connexions → 503, événement non consommé", async () => {
    const id = `db-${Date.now()}`;
    const body = notificationBody("MARKETPLACE_ACCOUNT_DELETION", { username: "x", userId: "y" }, id);
    const r = await handleEbayNotification(post(body, { "x-ebay-signature": signatureHeader(body) }), deps({ findConnections: async () => Promise.reject(new Error("connection refused")) }));
    expect(r.status).toBe(503);
    expect(await event(id)).toBeNull();
  });

  it("suppression de compte : anonymise les commandes, notifications et alertes, déconnecte et supprime les tokens", async () => {
    const f = await createFixture({ secrets: { access: "a", refresh: "r" } });
    const [conn] = await q<{ external_account_id: string; external_username: string }>("select external_account_id, external_username from public.channel_connections where id = $1", [f.connectionId]);
    const seller = { userId: conn!.external_account_id, username: `seller-${Date.now()}` };
    await q("update public.channel_connections set external_username = $2 where id = $1", [f.connectionId, seller.username]);
    const buyer = `buyer-${Date.now()}`;
    await q(
      "insert into public.orders (organization_id, sales_channel_id, connection_id, provider, external_order_id, buyer_username, placed_at) values ($1, $2, $3, 'ebay', $4, $5, now())",
      [f.orgId, f.channelId, f.connectionId, `DEL-${Date.now()}`, buyer],
    );
    await q("insert into public.webhook_events (provider, event_id, event_type, payload_hash, payload, status) values ('ebay', $1, 'ITEM_SOLD', 'h', $2, 'processed')", [
      `old-${Date.now()}`,
      JSON.stringify({ metadata: { topic: "ITEM_SOLD" }, notification: { data: { username: buyer } } }),
    ]);
    await q("insert into public.alerts (organization_id, type, severity, title, message, dedupe_key, entity_type, entity_id, status) values ($1, 'sync_failed', 'warning', 't', $2, 'k-old', 'channel_connection', $3, 'resolved')", [
      f.orgId,
      `Erreur pour ${seller.username}`,
      f.connectionId,
    ]);

    // 1) Acheteur supprimé.
    const buyerId = `del-buyer-${Date.now()}`;
    const buyerBody = notificationBody("MARKETPLACE_ACCOUNT_DELETION", { username: buyer, userId: "buyer-id", eiasToken: "eias" }, buyerId);
    const r1 = await handleEbayNotification(post(buyerBody, { "x-ebay-signature": signatureHeader(buyerBody) }), deps());
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ status: "processed", ordersAnonymized: 1, eventsPurged: 1, connectionsDisconnected: 0 });
    expect(await q("select buyer_username from public.orders where organization_id = $1", [f.orgId])).toEqual([{ buyer_username: DELETED_ACCOUNT_LABEL }]);
    const stored = await event(buyerId);
    expect(JSON.stringify(stored!.payload)).not.toContain(buyer);
    expect(JSON.stringify(stored!.payload)).not.toContain("eias");

    // 2) Vendeur connecté supprimé.
    const sellerId = `del-seller-${Date.now()}`;
    const sellerBody = notificationBody("MARKETPLACE_ACCOUNT_DELETION", seller, sellerId);
    const r2 = await handleEbayNotification(post(sellerBody, { "x-ebay-signature": signatureHeader(sellerBody) }), deps());
    expect(await r2.json()).toMatchObject({ status: "processed", connectionsDisconnected: 1 });
    const [after] = await q<{ status: string; external_username: string; external_account_id: string | null; secrets: number; channel: string }>(
      `select c.status, c.external_username, c.external_account_id,
              (select count(*)::int from public.channel_connection_secrets s where s.connection_id = c.id) as secrets,
              (select name from public.sales_channels where id = c.sales_channel_id) as channel
         from public.channel_connections c where c.id = $1`,
      [f.connectionId],
    );
    expect(after).toEqual({ status: "disconnected", external_username: DELETED_ACCOUNT_LABEL, external_account_id: null, secrets: 0, channel: `eBay · ${DELETED_ACCOUNT_LABEL}` });
    const alerts = await q<{ message: string; status: string }>("select message, status from public.alerts where organization_id = $1", [f.orgId]);
    expect(JSON.stringify(alerts)).not.toContain(seller.username);
    expect(alerts.some((a) => a.status === "open")).toBe(true);
  });

  it("suppression de compte en échec (écriture refusée) → 500, événement « failed » ; la relivraison eBay est retraitée", async () => {
    const id = `del-retry-${Date.now()}`;
    const body = notificationBody("MARKETPLACE_ACCOUNT_DELETION", { username: `u-${Date.now()}`, userId: "uid" }, id);
    const good = deps();
    const failingAdmin = new Proxy(good.admin, {
      get(target, prop, receiver) {
        if (prop === "from") {
          return (table: string) => {
            const qb = (target as unknown as { from: (t: string) => unknown }).from(table);
            if (table !== "orders") return qb;
            return { update: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: null, error: { code: "57P01", message: "terminating connection" } }) }) }) }) };
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const r1 = await handleEbayNotification(post(body, { "x-ebay-signature": signatureHeader(body) }), { ...good, admin: failingAdmin });
    expect(r1.status).toBe(500);
    expect(await event(id)).toMatchObject({ status: "failed", error: expect.stringMatching(/anonymisation des commandes/) });
    const r2 = await handleEbayNotification(post(body, { "x-ebay-signature": signatureHeader(body) }), good);
    expect(r2.status).toBe(200);
    expect(await r2.json()).toMatchObject({ status: "processed" });
    expect(await event(id)).toMatchObject({ status: "processed" });
    // Une 3e livraison est bien un doublon.
    expect(await (await handleEbayNotification(post(body, { "x-ebay-signature": signatureHeader(body) }), good)).json()).toEqual({ status: "duplicate" });
  });

  it("commande notifiée pendant une synchro manuelle : attend la fin (CONFLICT) puis synchronise ; statut reflété", async () => {
    const f = await createFixture();
    const [conn] = await q<{ external_account_id: string }>("select external_account_id from public.channel_connections where id = $1", [f.connectionId]);
    let attempts = 0;
    const dep = deps({
      runSync: vi.fn(async (connectionId: string, options) => {
        expect(connectionId).toBe(f.connectionId);
        expect(options).toMatchObject({ trigger: "webhook", scope: "orders" });
        attempts++;
        if (attempts < 3) throw new AppError("CONFLICT", "Une synchronisation eBay est déjà en cours pour cette connexion.");
        return { runId: "11111111-1111-1111-1111-111111111111", status: "success" as const, stats: {} as never, durationMs: 1, errorSummary: null, connectionId };
      }),
    });
    const id = `conflict-${Date.now()}`;
    const body = notificationBody("ORDER_CONFIRMATION", { userId: conn!.external_account_id }, id);
    const r = await handleEbayNotification(post(body, { "x-ebay-signature": signatureHeader(body) }), dep);
    expect(await r.json()).toMatchObject({ status: "accepted", connections: 1 });
    expect(await event(id)).toMatchObject({ status: "received" });
    await dep.scheduled[0]!();
    expect(attempts).toBe(3);
    expect(await event(id)).toMatchObject({ status: "processed" });

    // Toujours en conflit : l'événement l'indique clairement (rien n'est perdu : chevauchement du curseur).
    const id2 = `conflict2-${Date.now()}`;
    const body2 = notificationBody("ORDER_CONFIRMATION", { userId: conn!.external_account_id }, id2);
    const dep2 = deps({ runSync: async () => Promise.reject(new AppError("CONFLICT", "déjà en cours")) });
    await handleEbayNotification(post(body2, { "x-ebay-signature": signatureHeader(body2) }), dep2);
    await dep2.scheduled[0]!();
    const e2 = await event(id2);
    expect(e2).toMatchObject({ status: "failed" });
    expect(e2!.error).toMatch(/déjà en cours.*prochaine synchronisation/);
  });

  it("plusieurs connexions actives pour le même compte eBay : chacune est synchronisée ; connexion expirée ignorée", async () => {
    const a = await createFixture();
    const b = await createFixture();
    const c = await createFixture({ status: "expired" });
    const shared = `shared-${Date.now()}`;
    await q("update public.channel_connections set external_account_id = $1 where id = any($2)", [shared, [a.connectionId, b.connectionId, c.connectionId]]);
    const synced: string[] = [];
    const dep = deps({
      runSync: async (connectionId) => {
        synced.push(connectionId);
        return { runId: "x", status: "success", stats: {} as never, durationMs: 1, errorSummary: null, connectionId };
      },
    });
    const body = notificationBody("ITEM_AVAILABILITY", { userId: shared });
    const r = await handleEbayNotification(post(body, { "x-ebay-signature": signatureHeader(body) }), dep);
    expect(await r.json()).toMatchObject({ status: "accepted", connections: 2 });
    await dep.scheduled[0]!();
    expect(synced.sort()).toEqual([a.connectionId, b.connectionId].sort());
  });

  it("notification abandonnée (restée « received » > 10 min, tâche coupée par la plateforme) : marquée « failed » et sa connexion resynchronisée par le cron", async () => {
    const a = await createFixture();
    const b = await createFixture();
    const expired = await createFixture({ status: "expired" });
    const shared = `abandoned-${Date.now()}`;
    await q("update public.channel_connections set external_account_id = $1 where id = any($2)", [shared, [a.connectionId, b.connectionId]]);
    const old = new Date(Date.now() - WEBHOOK_ABANDONED_MS - 60_000).toISOString();
    const fresh = new Date(Date.now() - 2 * 60_000).toISOString();
    const insert = (eventId: string, topic: string, connectionId: string, orgId: string, receivedAt: string, data: Record<string, unknown> = {}) =>
      q("insert into public.webhook_events (provider, event_id, event_type, organization_id, connection_id, payload_hash, payload, signature_valid, status, received_at) values ('ebay', $1, $2, $3, $4, 'h', $5, true, 'received', $6)", [eventId, topic, orgId, connectionId, JSON.stringify({ notification: { data } }), receivedAt]);
    const tag = Date.now();
    await insert(`abandoned-order-${tag}`, "ORDER_CONFIRMATION", a.connectionId, a.orgId, old, { userId: shared });
    await insert(`abandoned-item-${tag}`, "ITEM_AVAILABILITY", a.connectionId, a.orgId, old);
    await insert(`abandoned-expired-${tag}`, "ORDER_CONFIRMATION", expired.connectionId, expired.orgId, old);
    await insert(`recent-${tag}`, "ORDER_CONFIRMATION", a.connectionId, a.orgId, fresh);

    const admin = createPgRestClient() as unknown as Deps["admin"];
    const findConnections: Deps["findConnections"] = async ({ userId }) => q<ChannelConnection>("select * from public.channel_connections where provider = 'ebay' and external_account_id = $1", [userId]);
    const r = await recoverAbandonedWebhookEvents(admin, { findConnections, limit: 1000 });
    expect(r.recovered).toBeGreaterThanOrEqual(3);
    for (const id of [`abandoned-order-${tag}`, `abandoned-item-${tag}`, `abandoned-expired-${tag}`]) {
      const e = await event(id);
      expect(e).toMatchObject({ status: "failed" });
      expect(e!.error).toMatch(/Traitement interrompu.*rattrapage/);
    }
    // Récent : traitement peut-être encore en cours → intact.
    expect(await event(`recent-${tag}`)).toMatchObject({ status: "received", error: null });
    // Connexion « a » : commandes + annonces → synchronisation complète ; « b » (même compte eBay) : commandes ; expirée : exclue.
    const mine = r.connections.filter((c) => [a.connectionId, b.connectionId, expired.connectionId].includes(c.id));
    expect(mine.sort((x, y) => x.id.localeCompare(y.id))).toEqual([{ id: a.connectionId, scope: "full" }, { id: b.connectionId, scope: "orders" }].sort((x, y) => x.id.localeCompare(y.id)));

    // Une seconde exécution (cron concurrent) ne les reprend pas une deuxième fois.
    const again = await recoverAbandonedWebhookEvents(admin, { findConnections, limit: 1000 });
    expect(again.connections.filter((c) => [a.connectionId, b.connectionId].includes(c.id))).toEqual([]);

    // Une relivraison eBay éventuelle d'un événement « failed » reste retraitée.
    const body = notificationBody("ORDER_CONFIRMATION", { userId: shared }, `abandoned-order-${tag}`);
    const dep = deps();
    const res = await handleEbayNotification(post(body, { "x-ebay-signature": signatureHeader(body) }), dep);
    expect(await res.json()).toMatchObject({ status: "accepted", connections: 2 });
    await dep.scheduled[0]!();
    expect(await event(`abandoned-order-${tag}`)).toMatchObject({ status: "processed", error: null });
  });
});
