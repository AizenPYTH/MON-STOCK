/**
 * Webhook eBay : la tâche exécutée après la réponse (`after`) est bornée par la durée maximale de la
 * route. Horloge simulée (fake timers) et base factice : à l'échéance, l'événement est marqué
 * « failed » avec une raison claire (il ne reste jamais « received » sans suite).
 */
import { createSign, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type { ChannelConnection } from "@/db/types";
import {
  handleEbayNotification,
  WEBHOOK_CONFLICT_RETRIES,
  WEBHOOK_CONFLICT_WAIT_MS,
  WEBHOOK_DEADLINE_MESSAGE,
  WEBHOOK_ORDERS_MAX_PAGES,
  WEBHOOK_PROCESSING_BUDGET_MS,
  WEBHOOK_ROUTE_MAX_DURATION_S,
  withDeadline,
  DEADLINE,
} from "@/services/sync/ebay-webhook";

type Deps = Parameters<typeof handleEbayNotification>[1];

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();

function signed(topic: string, data: Record<string, unknown>): Request {
  const body = JSON.stringify({ metadata: { topic, schemaVersion: "1.0" }, notification: { notificationId: `n-${Math.random().toString(36).slice(2)}`, data } });
  const signer = createSign("sha1");
  signer.update(body);
  const header = Buffer.from(JSON.stringify({ alg: "ecdsa", kid: "kid-test", signature: signer.sign(privateKey, "base64"), digest: "SHA1" })).toString("base64");
  return new Request("https://app.monstock.test/api/webhooks/ebay", { method: "POST", body, headers: { "content-type": "application/json", "x-ebay-signature": header } });
}

/** Base factice : enregistre les insertions et mises à jour de webhook_events. */
function fakeAdmin() {
  const events = new Map<string, { status: string; error: string | null }>();
  const admin = {
    from(table: string) {
      expect(table).toBe("webhook_events");
      return {
        insert(row: { status: string }) {
          const id = `row-${events.size + 1}`;
          events.set(id, { status: row.status, error: null });
          return { select: () => ({ maybeSingle: async () => ({ data: { id }, error: null }) }) };
        },
        update(patch: { status: string; error: string | null }) {
          return {
            eq: async (_col: string, id: string) => {
              events.set(id, { status: patch.status, error: patch.error });
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { admin: admin as unknown as Deps["admin"], events };
}

const connection = { id: "conn-1", organization_id: "org-1", status: "connected" } as ChannelConnection;

function deps(overrides: Partial<Deps> = {}) {
  const db = fakeAdmin();
  const scheduled: Array<() => Promise<void>> = [];
  const d: Deps = {
    admin: db.admin,
    isConfigured: () => true,
    getPublicKey: async () => ({ key: pem, algorithm: "ECDSA", digest: "SHA1" }),
    findConnections: async () => [connection],
    runSync: async () => ({ runId: "run-1", status: "success", stats: {} as never, durationMs: 1, errorSummary: null, connectionId: "conn-1" }),
    schedule: (task) => {
      scheduled.push(task);
    },
    ...overrides,
  };
  return { d, db, scheduled };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("webhook eBay : échéance de la tâche après réponse", () => {
  it("budget aligné sur maxDuration de la route (valeur littérale) avec une marge pour enregistrer l'issue", () => {
    const route = readFileSync(path.resolve(__dirname, "../../src/app/api/webhooks/ebay/route.ts"), "utf8");
    expect(route).toMatch(new RegExp(`export const maxDuration = ${WEBHOOK_ROUTE_MAX_DURATION_S};`));
    expect(WEBHOOK_PROCESSING_BUDGET_MS).toBeLessThan(WEBHOOK_ROUTE_MAX_DURATION_S * 1000);
    // Pire cas des attentes sur conflit : laisse du temps pour synchroniser.
    expect(WEBHOOK_CONFLICT_RETRIES * WEBHOOK_CONFLICT_WAIT_MS).toBeLessThan(WEBHOOK_PROCESSING_BUDGET_MS / 2);
  });

  it("synchronisation qui dépasse l'échéance → événement « failed » avec la raison, avant la limite de la plateforme", async () => {
    vi.useFakeTimers();
    const runSync = vi.fn(() => new Promise<never>(() => undefined)); // ne se termine jamais (plateforme lente)
    const { d, db, scheduled } = deps({ runSync });
    const res = await handleEbayNotification(signed("ORDER_CONFIRMATION", { userId: "u-1" }), d);
    expect(await res.json()).toMatchObject({ status: "accepted", connections: 1 });
    expect([...db.events.values()][0]).toMatchObject({ status: "received" });

    let settled = false;
    const task = scheduled[0]!().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(WEBHOOK_PROCESSING_BUDGET_MS - 1_000);
    expect(settled).toBe(false);
    expect([...db.events.values()][0]).toMatchObject({ status: "received" });
    await vi.advanceTimersByTimeAsync(1_000);
    await task;
    expect(settled).toBe(true);
    const ev = [...db.events.values()][0]!;
    expect(ev.status).toBe("failed");
    expect(ev.error).toBe(WEBHOOK_DEADLINE_MESSAGE);
    expect(ev.error).toMatch(/délai maximal.*prochaine synchronisation planifiée/);
    // Périmètre et budget de pages bornés pour tenir dans la durée de la route.
    expect(runSync).toHaveBeenCalledWith("conn-1", { trigger: "webhook", scope: "orders", orders: { maxPages: WEBHOOK_ORDERS_MAX_PAGES } });
  });

  it("le budget court depuis la RÉCEPTION (le temps passé avant la réponse est décompté)", async () => {
    vi.useFakeTimers();
    let now = 1_000_000;
    const { d, db, scheduled } = deps({ runSync: () => new Promise<never>(() => undefined), now: () => now });
    await handleEbayNotification(signed("ORDER_CONFIRMATION", { userId: "u-1" }), d);
    now += WEBHOOK_PROCESSING_BUDGET_MS - 5_000; // la tâche `after` démarre tard
    const task = scheduled[0]!();
    await vi.advanceTimersByTimeAsync(5_000);
    await task;
    expect([...db.events.values()][0]).toMatchObject({ status: "failed", error: WEBHOOK_DEADLINE_MESSAGE });
  });

  it("conflit persistant : attentes bornées par l'échéance (aucune attente qui ne laisserait pas le temps de synchroniser)", async () => {
    vi.useFakeTimers();
    const runSync = vi.fn(async () => Promise.reject(new AppError("CONFLICT", "déjà en cours")));
    const { d, db, scheduled } = deps({ runSync });
    await handleEbayNotification(signed("ORDER_CONFIRMATION", { userId: "u-1" }), d);
    const task = scheduled[0]!();
    await vi.advanceTimersByTimeAsync(WEBHOOK_PROCESSING_BUDGET_MS);
    await task;
    expect(runSync).toHaveBeenCalledTimes(WEBHOOK_CONFLICT_RETRIES + 1);
    const ev = [...db.events.values()][0]!;
    expect(ev.status).toBe("failed");
    expect(ev.error).toMatch(/déjà en cours.*prochaine synchronisation/);

    // Budget presque épuisé : aucune attente, échec immédiat et explicite.
    const tight = deps({ runSync: vi.fn(async () => Promise.reject(new AppError("CONFLICT", "déjà en cours"))), processingBudgetMs: WEBHOOK_CONFLICT_WAIT_MS });
    await handleEbayNotification(signed("ORDER_CONFIRMATION", { userId: "u-1" }), tight.d);
    await tight.scheduled[0]!();
    expect(tight.d.runSync).toHaveBeenCalledTimes(1);
    expect([...tight.db.events.values()][0]).toMatchObject({ status: "failed" });
  });

  it("synchronisation terminée dans les temps → « processed » ; erreur inattendue → « failed » (jamais « received »)", async () => {
    const ok = deps();
    await handleEbayNotification(signed("ITEM_AVAILABILITY", { userId: "u-1" }), ok.d);
    await ok.scheduled[0]!();
    expect([...ok.db.events.values()][0]).toMatchObject({ status: "processed", error: null });

    const boom = deps({ runSync: async () => Promise.reject(new Error("panne inattendue")) });
    await handleEbayNotification(signed("ITEM_AVAILABILITY", { userId: "u-1" }), boom.d);
    await boom.scheduled[0]!();
    expect([...boom.db.events.values()][0]).toMatchObject({ status: "failed" });
  });

  it("withDeadline : résultat si le travail finit avant, DEADLINE sinon", async () => {
    vi.useFakeTimers();
    const fast = withDeadline(Promise.resolve(42), 1_000);
    await expect(fast).resolves.toBe(42);
    const slow = withDeadline(new Promise<number>((r) => setTimeout(() => r(1), 5_000)), 1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(slow).resolves.toBe(DEADLINE);
  });
});
