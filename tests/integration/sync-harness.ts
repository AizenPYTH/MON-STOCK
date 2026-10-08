/**
 * Harness des tests d'intégration de la synchronisation :
 *  - `PgRestClient` : sous-ensemble du client supabase-js (from/select/insert/update/upsert/delete,
 *    filtres, embed, rpc) exécuté DIRECTEMENT sur PostgreSQL (pool pg, rôle service_role,
 *    une requête = une transaction, comme PostgREST). Le moteur de sync réel tourne donc contre
 *    le vrai schéma, les vraies contraintes et les vraies fonctions SQL.
 *  - `FakeConnector` : connecteur marketplace scripté (aucun appel réseau).
 * Rien ici ne contacte eBay.
 */
import { Pool, types } from "pg";
import type { ChannelProvider } from "@/db/types";
import type { ConnectorAuth, GetOrdersParams, ListingsPage, MarketplaceConnector, OrdersPage, RevokeResult } from "@/integrations/core/connector";
import type { AccountInfo, InventoryLevel, ListingRef, NormalizedListing, NormalizedOrder, TokenSet, UpdateInventoryResult } from "@/integrations/core/types";
import { DATABASE_URL } from "./helpers";

// Formats PostgREST : dates ISO, numeric et bigint en nombres.
const toIso = (v: string) => new Date(v.includes("T") ? v : v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString();
types.setTypeParser(1184, toIso); // timestamptz
types.setTypeParser(1114, (v) => toIso(`${v}Z`)); // timestamp
types.setTypeParser(1700, (v) => Number(v)); // numeric
types.setTypeParser(20, (v) => Number(v)); // int8

type Row = Record<string, unknown>;
type PgError = { code: string; message: string; details: string | null; hint: string | null };
type Result = { data: unknown; error: PgError | null; count?: number | null };

let pool: Pool | null = null;
export function testPool(): Pool {
  if (!pool) {
    // Chaque connexion agit comme la clé service_role de PostgREST (rôle + claims JWT).
    pool = new Pool({ connectionString: DATABASE_URL, max: 12, options: '-c role=service_role -c request.jwt.claims={"role":"service_role"}' });
  }
  return pool;
}
export async function closePool(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
}

const columnTypes = new Map<string, Map<string, { udt: string; isArray: boolean }>>();
async function columnsOf(table: string): Promise<Map<string, { udt: string; isArray: boolean }>> {
  const cached = columnTypes.get(table);
  if (cached) return cached;
  const { rows } = await testPool().query<{ column_name: string; udt_name: string; data_type: string }>(
    "select column_name, udt_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1",
    [table],
  );
  const map = new Map(rows.map((r) => [r.column_name, { udt: r.udt_name, isArray: r.data_type === "ARRAY" }]));
  columnTypes.set(table, map);
  return map;
}

interface FkInfo {
  column: string;
  refTable: string;
  refColumn: string;
}
const fkCache = new Map<string, FkInfo[]>();
async function foreignKeys(table: string): Promise<FkInfo[]> {
  const cached = fkCache.get(table);
  if (cached) return cached;
  const { rows } = await testPool().query<{ column: string; ref_table: string; ref_column: string }>(
    `select a.attname as column, cf.relname as ref_table, af.attname as ref_column
       from pg_constraint c
       join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
       join pg_class cf on cf.oid = c.confrelid
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
      where c.contype = 'f' and n.nspname = 'public' and cl.relname = $1`,
    [table],
  );
  const list = rows.map((r) => ({ column: r.column, refTable: r.ref_table, refColumn: r.ref_column }));
  fkCache.set(table, list);
  return list;
}

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`identifiant invalide : ${name}`);
  return `"${name}"`;
}

/** payload->notification->data->>username → "payload"->'notification'->'data'->>'username' */
function colRef(alias: string, col: string): string {
  const parts = col.split(/(->>?)/);
  let sql = `${alias}.${ident(parts[0]!)}`;
  for (let i = 1; i < parts.length; i += 2) sql += `${parts[i]}'${parts[i + 1]!.replace(/'/g, "''")}'`;
  return sql;
}

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

let aliasSeq = 0;
async function selectList(table: string, alias: string, select: string): Promise<string> {
  const parts = splitTopLevel(select || "*");
  const out: string[] = [];
  for (const p of parts) {
    const m = /^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)(?:!inner)?\((.*)\)$/is.exec(p);
    if (!m) {
      out.push(p === "*" ? `${alias}.*` : `${colRef(alias, p)} as ${ident(p.split(/->>?/).at(-1)!)}`);
      continue;
    }
    const [, as, target, inner] = m as unknown as [string, string | undefined, string, string];
    const sub = `e${++aliasSeq}`;
    const innerList = await selectList(target, sub, inner);
    const outgoing = (await foreignKeys(table)).find((f) => f.refTable === target);
    if (outgoing) {
      out.push(`(select to_jsonb(x) from (select ${innerList} from public.${ident(target)} ${sub} where ${sub}.${ident(outgoing.refColumn)} = ${alias}.${ident(outgoing.column)}) x) as ${ident(as ?? target)}`);
      continue;
    }
    const incoming = (await foreignKeys(target)).find((f) => f.refTable === table);
    if (!incoming) throw new Error(`relation ${table} → ${target} introuvable`);
    out.push(`(select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select ${innerList} from public.${ident(target)} ${sub} where ${sub}.${ident(incoming.column)} = ${alias}.${ident(incoming.refColumn)}) x) as ${ident(as ?? target)}`);
  }
  return out.join(", ");
}

function toPgError(e: unknown): PgError {
  const err = e as { code?: string; message?: string; detail?: string; hint?: string };
  return { code: err.code ?? "XX000", message: err.message ?? String(e), details: err.detail ?? null, hint: err.hint ?? null };
}

type Filter = { sql: (alias: string, p: (v: unknown) => string) => string };

class QueryBuilder implements PromiseLike<Result> {
  private mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private columns = "*";
  private returning: string | null = null;
  private countMode: { head: boolean } | null = null;
  private rows: Row[] = [];
  private patch: Row = {};
  private onConflict: string | null = null;
  private ignoreDuplicates = false;
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private singleMode: "single" | "maybe" | null = null;

  constructor(private readonly table: string) {}

  select(cols = "*", opts?: { count?: "exact"; head?: boolean }) {
    if (this.mode === "select") {
      this.columns = cols;
      if (opts?.count) this.countMode = { head: Boolean(opts.head) };
    } else this.returning = cols;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = "insert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.mode = "upsert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    this.onConflict = opts.onConflict ?? null;
    this.ignoreDuplicates = Boolean(opts.ignoreDuplicates);
    return this;
  }
  update(patch: Row) {
    this.mode = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  private op(col: string, sqlOp: string, value: unknown) {
    this.filters.push({ sql: (a, p) => `${colRef(a, col)} ${sqlOp} ${p(value)}` });
    return this;
  }
  eq(col: string, v: unknown) {
    return this.op(col, "=", v);
  }
  neq(col: string, v: unknown) {
    this.filters.push({ sql: (a, p) => `${colRef(a, col)} is distinct from ${p(v)}` });
    return this;
  }
  lt(col: string, v: unknown) {
    return this.op(col, "<", v);
  }
  lte(col: string, v: unknown) {
    return this.op(col, "<=", v);
  }
  gt(col: string, v: unknown) {
    return this.op(col, ">", v);
  }
  gte(col: string, v: unknown) {
    return this.op(col, ">=", v);
  }
  in(col: string, values: unknown[]) {
    this.filters.push({ sql: (a, p) => (values.length === 0 ? "false" : `${colRef(a, col)} in (${values.map((v) => p(v)).join(", ")})`) });
    return this;
  }
  is(col: string, v: null | boolean) {
    this.filters.push({ sql: (a) => `${colRef(a, col)} is ${v === null ? "null" : v ? "true" : "false"}` });
    return this;
  }
  not(col: string, operator: string, v: unknown) {
    if (operator !== "is" || v !== null) throw new Error("not() : seul not(col, 'is', null) est supporté");
    this.filters.push({ sql: (a) => `${colRef(a, col)} is not null` });
    return this;
  }
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orders.push(`${colRef("t", col)} ${opts.ascending === false ? "desc" : "asc"}${opts.nullsFirst === undefined ? "" : opts.nullsFirst ? " nulls first" : " nulls last"}`);
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }

  then<A = Result, B = never>(onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<Result> {
    const cols = await columnsOf(this.table);
    const params: unknown[] = [];
    const encode = (col: string | null, v: unknown) => {
      const info = col ? cols.get(col) : undefined;
      if (v !== null && typeof v === "object" && !(v instanceof Date) && (!info || !info.isArray)) return JSON.stringify(v);
      return v;
    };
    const p = (v: unknown, col: string | null = null) => {
      params.push(encode(col, v));
      return `$${params.length}`;
    };
    const buildWhere = () => (this.filters.length ? ` where ${this.filters.map((f) => f.sql("t", (v) => p(v))).join(" and ")}` : "");
    const t = `public.${ident(this.table)}`;
    let sql: string;
    try {
      if (this.mode === "select") {
        if (this.countMode) {
          const countParams: unknown[] = [];
          const where = this.filters.length ? ` where ${this.filters.map((f) => f.sql("t", (v) => (countParams.push(encode(null, v)), `$${countParams.length}`))).join(" and ")}` : "";
          const { rows } = await testPool().query<{ n: number }>(`select count(*)::int as n from ${t} t${where}`, countParams);
          if (this.countMode.head) return { data: null, error: null, count: rows[0]?.n ?? 0 };
        }
        const list = await selectList(this.table, "t", this.columns);
        sql = `select ${list} from ${t} t${buildWhere()}`;
        if (this.orders.length) sql += ` order by ${this.orders.join(", ")}`;
        if (this.limitN !== null) sql += ` limit ${this.limitN}`;
        if (this.offsetN !== null) sql += ` offset ${this.offsetN}`;
      } else if (this.mode === "insert" || this.mode === "upsert") {
        const keys = [...new Set(this.rows.flatMap((r) => Object.keys(r)))];
        const values = this.rows.map((r) => `(${keys.map((k) => (k in r ? p(r[k], k) : "default")).join(", ")})`).join(", ");
        sql = `insert into ${t} as t (${keys.map(ident).join(", ")}) values ${values}`;
        if (this.mode === "upsert") {
          const conflict = (this.onConflict ?? "id").split(",").map((c) => c.trim());
          const updatable = keys.filter((k) => !conflict.includes(k));
          sql += ` on conflict (${conflict.map(ident).join(", ")}) ${this.ignoreDuplicates || updatable.length === 0 ? "do nothing" : `do update set ${updatable.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(", ")}`}`;
        }
      } else if (this.mode === "update") {
        const sets = Object.entries(this.patch).map(([k, v]) => `${ident(k)} = ${p(v, k)}`);
        sql = `update ${t} as t set ${sets.join(", ")}${buildWhere()}`;
      } else {
        sql = `delete from ${t} as t${buildWhere()}`;
      }
      if (this.mode !== "select" && this.returning !== null) {
        sql += ` returning ${this.returning === "*" ? "t.*" : await selectList(this.table, "t", this.returning)}`;
      }
      const res = await testPool().query(sql, params);
      const rows = this.mode === "select" || this.returning !== null ? res.rows : null;
      if (this.singleMode) {
        const list = rows ?? [];
        if (list.length > 1 || (this.singleMode === "single" && list.length === 0)) {
          return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null } };
        }
        return { data: list[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    } catch (e) {
      return { data: null, error: toPgError(e) };
    }
  }
}

export interface PgRestClient {
  from(table: string): QueryBuilder;
  rpc(fn: string, args?: Record<string, unknown>): Promise<Result>;
}

export function createPgRestClient(): PgRestClient {
  return {
    from(table: string) {
      return new QueryBuilder(table);
    },
    async rpc(fn: string, args: Record<string, unknown> = {}) {
      const entries = Object.entries(args);
      const params = entries.map(([, v]) => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v));
      const call = `public.${ident(fn)}(${entries.map(([k], i) => `${ident(k)} => $${i + 1}`).join(", ")})`;
      try {
        const res = await testPool().query(`select to_jsonb(r) as r from ${call} r`, params);
        const rows = res.rows.map((x: { r: unknown }) => x.r);
        return { data: rows.length === 1 ? rows[0] : rows, error: null };
      } catch (e) {
        return { data: null, error: toPgError(e) };
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Connecteur scripté
// ---------------------------------------------------------------------------------------------

export type OrdersScript = (params: GetOrdersParams, auth: ConnectorAuth) => AsyncIterable<OrdersPage>;
export type ListingsScript = (auth: ConnectorAuth) => AsyncIterable<ListingsPage>;

export class FakeConnector implements MarketplaceConnector {
  readonly provider: ChannelProvider = "ebay";
  readonly label = "eBay";
  readonly available = true;
  readonly scopes = [];
  orders: OrdersScript = async function* () {};
  listings: ListingsScript = async function* () {};
  refresh: (refreshToken: string) => Promise<TokenSet> = async () => {
    throw new Error("refreshToken non scripté");
  };
  exchange: (code: string) => Promise<TokenSet> = async () => {
    throw new Error("exchangeCode non scripté");
  };
  account: AccountInfo = { externalAccountId: "ebay-user-1", username: "vendeur_test", accountType: "BUSINESS", registrationMarketplaceId: "EBAY_FR" };
  pushed: Array<{ ref: ListingRef; quantity: number }> = [];
  calls = { refresh: 0, orders: [] as GetOrdersParams[] };

  isConfigured() {
    return true;
  }
  configurationIssues() {
    return [];
  }
  config() {
    return { environment: "production" as const };
  }
  getAuthorizeUrl(state: string) {
    return `https://auth.ebay.com/oauth2/authorize?state=${state}`;
  }
  exchangeCode(code: string) {
    return this.exchange(code);
  }
  refreshToken(refreshToken: string) {
    this.calls.refresh++;
    return this.refresh(refreshToken);
  }
  async getAccountInfo(auth: ConnectorAuth) {
    await auth.getAccessToken();
    return this.account;
  }
  getOrders(auth: ConnectorAuth, params: GetOrdersParams) {
    this.calls.orders.push(params);
    return this.orders(params, auth);
  }
  getListings(auth: ConnectorAuth) {
    return this.listings(auth);
  }
  async *getInventory(): AsyncIterable<InventoryLevel[]> {}
  async updateListingInventory(auth: ConnectorAuth, ref: ListingRef, quantity: number): Promise<UpdateInventoryResult> {
    await auth.getAccessToken();
    this.pushed.push({ ref, quantity });
    return { ok: true, quantity, warnings: [] };
  }
  async revoke(): Promise<RevokeResult> {
    return { revoked: false, note: "test" };
  }
}

let currentConnector = new FakeConnector();
export function fakeConnector(): FakeConnector {
  return currentConnector;
}
export function resetFakeConnector(): FakeConnector {
  currentConnector = new FakeConnector();
  return currentConnector;
}

// ---------------------------------------------------------------------------------------------
// Données de test
// ---------------------------------------------------------------------------------------------

export function order(id: string, overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
  return {
    externalOrderId: id,
    orderNumber: `NUM-${id}`,
    status: "paid",
    paymentStatus: "PAID",
    fulfillmentStatus: "NOT_STARTED",
    cancelStatus: null,
    buyerUsername: "acheteur_1",
    currency: "EUR",
    subtotal: 100,
    shippingTotal: 0,
    taxTotal: 0,
    feeTotal: null,
    total: 100,
    placedAt: "2026-10-07T08:00:00.000Z",
    externalModifiedAt: "2026-10-07T08:00:00.000Z",
    payloadHash: `hash-${id}`,
    items: [{ externalLineItemId: `${id}-L1`, externalListingId: "ITEM-1", externalVariationId: "", externalSku: "SYNC-SKU-1", title: "Article", quantity: 1, unitPrice: 100, currency: "EUR", total: 100 }],
    ...overrides,
  };
}

export function listing(id: string, overrides: Partial<NormalizedListing> = {}): NormalizedListing {
  return {
    externalListingId: id,
    title: `Annonce ${id}`,
    sku: null,
    externalProductId: null,
    quantityListed: 5,
    quantitySold: 0,
    quantityAvailable: 5,
    price: 10,
    currency: "EUR",
    listingUrl: null,
    imageUrl: null,
    status: "active",
    startedAt: null,
    endsAt: null,
    variations: [],
    ...overrides,
  };
}

export async function* pages<T>(...items: T[]): AsyncIterable<T> {
  for (const i of items) yield i;
}

export interface Fixture {
  orgId: string;
  userId: string;
  channelId: string;
  connectionId: string;
  skuId: string;
}

let fixtureSeq = 0;
/** Organisation + SKU (stock 10) + canal eBay + connexion « connected » (+ secrets chiffrés éventuels). */
export async function createFixture(options: { skuCode?: string; initialStock?: number; secrets?: { access: string | null; refresh: string | null }; tokenExpiresAt?: Date | null; refreshExpiresAt?: Date | null; status?: string; cursor?: Date | null } = {}): Promise<Fixture> {
  const { connect, createUser, createOrgAs, createSkuAs, asSuperuser } = await import("./helpers");
  const c = await connect();
  try {
    await c.query("begin");
    const tag = `${Date.now().toString(36)}-${++fixtureSeq}-${Math.random().toString(36).slice(2, 6)}`;
    const userId = await createUser(c, `sync-${tag}@example.test`);
    const orgId = await createOrgAs(c, userId, `Org ${tag}`, `org-sync-${tag}`);
    const skuId = await createSkuAs(c, userId, orgId, options.skuCode ?? "SYNC-SKU-1", { initial: options.initialStock ?? 10 });
    await asSuperuser(c);
    const { rows: ch } = await c.query<{ id: string }>("insert into public.sales_channels (organization_id, provider, name) values ($1, 'ebay', 'eBay · vendeur_test') returning id", [orgId]);
    const channelId = ch[0]!.id;
    const { rows: cn } = await c.query<{ id: string }>(
      `insert into public.channel_connections (organization_id, sales_channel_id, provider, status, external_account_id, external_username, token_expires_at, refresh_token_expires_at, last_orders_cursor)
       values ($1, $2, 'ebay', $3, $4, 'vendeur_test', $5, $6, $7) returning id`,
      [orgId, channelId, options.status ?? "connected", `ebay-user-${tag}`, options.tokenExpiresAt === undefined ? new Date(Date.now() + 3_600_000) : options.tokenExpiresAt, options.refreshExpiresAt ?? null, options.cursor ?? null],
    );
    const connectionId = cn[0]!.id;
    if (options.secrets) {
      const { encryptSecret } = await import("@/lib/crypto");
      await c.query("insert into public.channel_connection_secrets (connection_id, access_token_enc, refresh_token_enc) values ($1, $2, $3)", [
        connectionId,
        options.secrets.access ? encryptSecret(options.secrets.access) : null,
        options.secrets.refresh ? encryptSecret(options.secrets.refresh) : null,
      ]);
    }
    await c.query("commit");
    return { orgId, userId, channelId, connectionId, skuId };
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
}

export async function q<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await testPool().query<T>(sql, params);
  return rows;
}

/** Variables d'environnement minimales des modules serveur (aucun service externe réel). */
export function setTestEnv(): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test-key";
  process.env.NEXT_PUBLIC_APP_URL ??= "https://app.monstock.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test-key";
  process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
}
