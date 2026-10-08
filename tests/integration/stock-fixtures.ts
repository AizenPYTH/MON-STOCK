/**
 * Fixtures COMMITÉES pour les tests de concurrence stock / commandes fournisseurs :
 * deux connexions PostgreSQL distinctes doivent voir les mêmes lignes, ce qui exclut
 * le harness « une transaction annulée » de helpers.ts. Chaque fixture crée une
 * organisation unique et la supprime (cascade) à la fin.
 */
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { asSuperuser, asUser, connect, createOrgAs, createSkuAs, createUser } from "./helpers";

export interface CommittedOrg {
  userId: string;
  orgId: string;
  suffix: string;
  cleanup: () => Promise<void>;
}

export async function createCommittedOrg(label: string): Promise<CommittedOrg> {
  const suffix = randomUUID().slice(0, 8);
  const c = await connect();
  try {
    await c.query("begin");
    const userId = await createUser(c, `${label}-${suffix}@example.test`);
    const orgId = await createOrgAs(c, userId, `Org ${label}`, `${label}-${suffix}`);
    await c.query("commit");
    return {
      userId,
      orgId,
      suffix,
      cleanup: async () => {
        const k = await connect();
        try {
          await k.query("delete from public.organizations where id = $1", [orgId]);
          await k.query("delete from auth.users where id = $1", [userId]);
        } finally {
          await k.end();
        }
      },
    };
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
}

export async function createCommittedSku(org: CommittedOrg, code: string, opts: { initial?: number; cost?: number | null; sale?: number | null } = {}): Promise<string> {
  const c = await connect();
  try {
    await c.query("begin");
    const id = await createSkuAs(c, org.userId, org.orgId, code, opts);
    await c.query("commit");
    return id;
  } finally {
    await c.end();
  }
}

/** Ouvre une transaction authentifiée (comme une requête PostgREST) sur une nouvelle connexion. */
export async function userSession(userId: string): Promise<Client> {
  const c = await connect();
  await c.query("begin");
  await asUser(c, userId);
  return c;
}

export async function closeSession(c: Client, mode: "commit" | "rollback" = "commit"): Promise<void> {
  try {
    await c.query(mode);
  } finally {
    await c.end();
  }
}

/** Exécute `sql` dans sa propre transaction utilisateur, commitée (ou annulée en cas d'erreur). */
export async function runAsUser<T = unknown>(userId: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await userSession(userId);
  try {
    const { rows } = await c.query(sql, params);
    await c.query("commit");
    return rows as T[];
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
}

export async function superQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await connect();
  try {
    await asSuperuser(c);
    const { rows } = await c.query(sql, params);
    return rows as T[];
  } finally {
    await c.end();
  }
}

/** Vrai si la promesse est encore en attente après `ms` millisecondes (bloquée sur un verrou). */
export async function isStillPending(p: Promise<unknown>, ms = 250): Promise<boolean> {
  let settled = false;
  p.then(
    () => (settled = true),
    () => (settled = true),
  );
  await new Promise((r) => setTimeout(r, ms));
  return !settled;
}

export function errorOf(p: Promise<unknown>): Promise<string | null> {
  return p.then(
    () => null,
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  );
}
