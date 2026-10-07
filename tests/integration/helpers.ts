/**
 * Harness des tests d'intégration : PostgreSQL local + shim Supabase (voir scripts/db-local-reset.sh).
 * Chaque test ouvre une transaction, positionne le rôle et les claims JWT comme le ferait PostgREST,
 * puis annule la transaction à la fin : la base reste propre.
 */
import { Client } from "pg";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/mon_stock_test";

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

export async function canConnect(): Promise<boolean> {
  try {
    const c = await connect();
    await c.query("select 1");
    await c.end();
    return true;
  } catch {
    return false;
  }
}

/** Simule un appel PostgREST authentifié (rôle authenticated + claims JWT). */
export async function asUser(client: Client, userId: string): Promise<void> {
  await client.query("select set_config('role', 'authenticated', true)");
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
}

/** Simule la clé service_role (bypass RLS). */
export async function asService(client: Client): Promise<void> {
  await client.query("select set_config('role', 'service_role', true)");
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
}

export async function asSuperuser(client: Client): Promise<void> {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', '', true)");
}

export async function createUser(client: Client, email: string): Promise<string> {
  await asSuperuser(client);
  const { rows } = await client.query<{ id: string }>("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [email, JSON.stringify({ full_name: email.split("@")[0] })]);
  return rows[0]!.id;
}

export async function createOrgAs(client: Client, userId: string, name: string, slug: string): Promise<string> {
  await asUser(client, userId);
  const { rows } = await client.query<{ id: string }>("select public.create_organization_with_owner($1, $2, false) as id", [name, slug]);
  return rows[0]!.id;
}

export async function createSkuAs(client: Client, userId: string, orgId: string, code: string, opts: { initial?: number; cost?: number | null; sale?: number | null; name?: string } = {}): Promise<string> {
  await asUser(client, userId);
  const { rows } = await client.query<{ r: { sku_id: string } }>(
    `select public.create_sku($1, $2::jsonb, $3::jsonb, null, $4::jsonb, $5) as r`,
    [
      orgId,
      JSON.stringify({ name: "128 Go / Noir / Grade A", condition: "refurbished", grade: "A", attributes: { storage: "128GB", color: "Black", grade: "A" } }),
      JSON.stringify({ code, cost_price: opts.cost ?? null, sale_price: opts.sale ?? null, currency: "EUR", reorder_point: 2, safety_stock: 1 }),
      JSON.stringify({ name: opts.name ?? "Apple iPhone 13", brand: "Apple", category: "Smartphones" }),
      opts.initial ?? 0,
    ],
  );
  return rows[0]!.r.sku_id;
}

export async function manualChannelId(client: Client, orgId: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>("select id from public.sales_channels where organization_id = $1 and provider = 'manual'", [orgId]);
  return rows[0]!.id;
}

export async function withRollback(fn: (client: Client) => Promise<void>): Promise<void> {
  const client = await connect();
  try {
    await client.query("begin");
    await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}

export function pgErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Exécute une requête censée échouer, dans un savepoint pour ne pas avorter la transaction. */
export async function expectQueryError(client: Client, sql: string, params: unknown[], pattern: RegExp | string): Promise<void> {
  await client.query("savepoint expect_err");
  let message: string | null = null;
  try {
    await client.query(sql, params);
  } catch (e) {
    message = pgErrorMessage(e);
  }
  await client.query("rollback to savepoint expect_err");
  if (message === null) throw new Error(`La requête aurait dû échouer : ${sql}`);
  const ok = typeof pattern === "string" ? message.includes(pattern) : pattern.test(message);
  if (!ok) throw new Error(`Erreur inattendue : ${message}`);
}

/** Variante pour les helpers asynchrones (ex. createSkuAs) censés échouer. */
export async function expectAsyncError(client: Client, fn: () => Promise<unknown>, pattern: RegExp | string): Promise<void> {
  await client.query("savepoint expect_err2");
  let message: string | null = null;
  try {
    await fn();
  } catch (e) {
    message = pgErrorMessage(e);
  }
  await client.query("rollback to savepoint expect_err2");
  if (message === null) throw new Error("L'opération aurait dû échouer");
  const ok = typeof pattern === "string" ? message.includes(pattern) : pattern.test(message);
  if (!ok) throw new Error(`Erreur inattendue : ${message}`);
}
