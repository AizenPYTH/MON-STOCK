/**
 * Base en mémoire au comportement proche de PostgREST, pour tester les services serveur de
 * bout en bout sans réseau : select (colonnes et relations `alias:table(...)` résolues par
 * `<alias>_id`), insert / update / upsert / delete, filtres eq / neq / in / is / not / lt / lte /
 * gt / gte / ilike, order, limit, range (pagination réelle), single / maybeSingle, count head, rpc
 * (fonctions simulées passées à `memoryDb`).
 *
 * Limites assumées :
 * - pas de RLS ni de déclencheurs ;
 * - un filtre sur une colonne de relation (`variant.ean`) ne retient aucune ligne ;
 * - les clés uniques ne sont contrôlées que via `upsert` (option onConflict) et `uniques`.
 */
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

let seq = 0;
const uuid = () => {
  seq++;
  const hex = seq.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
};

export interface MemoryDb {
  tables: Record<string, Row[]>;
  client: never;
  /** contraintes uniques simulées pour insert : table → listes de colonnes */
  uniques: Record<string, string[][]>;
}

/** Fonction RPC simulée : reçoit les arguments et la base, renvoie { data, error }. */
export type RpcHandler = (args: Record<string, unknown>, db: MemoryDb) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>;

export function memoryDb(seed: Record<string, Row[]> = {}, uniques: Record<string, string[][]> = {}, rpcHandlers: Record<string, RpcHandler> = {}): MemoryDb {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const db: MemoryDb = { tables, uniques, client: null as never };

  const tableOf = (name: string) => (tables[name] ??= []);

  function resolveSelect(row: Row, select: string | null): Row {
    if (!select || select.trim() === "*") return { ...row };
    const out: Row = {};
    // découpe de premier niveau (les parenthèses imbriquées sont ignorées)
    const parts: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of select) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        parts.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    for (const part of parts) {
      if (part === "*") Object.assign(out, row);
      const rel = /^(\w+):(\w+)(?:!\w+)?\((.*)\)$/s.exec(part);
      if (rel) {
        const [, alias, table, inner] = rel;
        const fk = row[`${alias}_id`];
        const target = fk ? tableOf(table!).find((r) => r.id === fk) : undefined;
        out[alias!] = target ? resolveSelect(target, inner!) : null;
        continue;
      }
      if (part !== "*") out[part] = row[part] ?? null;
    }
    return out;
  }

  function builder(table: string) {
    const filters: Filter[] = [];
    let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let selectCols: string | null = null;
    let returning = false;
    let orderBy: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
    let limitN: number | null = null;
    let offsetN = 0;
    let single: "one" | "maybe" | null = null;
    let head = false;
    let countMode = false;
    let onConflict: string[] | null = null;
    let ignoreDuplicates = false;

    const api: Record<string, unknown> = {
      select(cols?: string, opts?: { count?: string; head?: boolean }) {
        if (op === "select") selectCols = cols ?? "*";
        else {
          returning = true;
          selectCols = cols ?? "*";
        }
        if (opts?.count) countMode = true;
        if (opts?.head) head = true;
        return api;
      },
      insert(v: Row | Row[]) {
        op = "insert";
        payload = v;
        return api;
      },
      update(v: Row) {
        op = "update";
        payload = v;
        return api;
      },
      upsert(v: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
        op = "upsert";
        payload = v;
        onConflict = opts?.onConflict ? opts.onConflict.split(",").map((s) => s.trim()) : ["id"];
        ignoreDuplicates = Boolean(opts?.ignoreDuplicates);
        return api;
      },
      delete() {
        op = "delete";
        return api;
      },
      eq(c: string, v: unknown) {
        filters.push((r) => !c.includes(".") && r[c] === v);
        return api;
      },
      neq(c: string, v: unknown) {
        filters.push((r) => r[c] !== v);
        return api;
      },
      in(c: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[c]));
        return api;
      },
      is(c: string, v: unknown) {
        filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v));
        return api;
      },
      not(c: string, o: string, v: unknown) {
        filters.push((r) => (o === "is" && v === null ? r[c] !== null && r[c] !== undefined : r[c] !== v));
        return api;
      },
      lt(c: string, v: unknown) {
        filters.push((r) => r[c] !== null && r[c] !== undefined && (typeof r[c] === "number" && typeof v === "number" ? (r[c] as number) < v : String(r[c]) < String(v)));
        return api;
      },
      lte(c: string, v: unknown) {
        filters.push((r) => r[c] !== null && r[c] !== undefined && (typeof r[c] === "number" && typeof v === "number" ? (r[c] as number) <= v : String(r[c]) <= String(v)));
        return api;
      },
      gt(c: string, v: unknown) {
        filters.push((r) => r[c] !== null && r[c] !== undefined && (typeof r[c] === "number" && typeof v === "number" ? (r[c] as number) > v : String(r[c]) > String(v)));
        return api;
      },
      gte(c: string, v: unknown) {
        filters.push((r) => r[c] !== null && r[c] !== undefined && (typeof r[c] === "number" && typeof v === "number" ? (r[c] as number) >= v : String(r[c]) >= String(v)));
        return api;
      },
      ilike(c: string, pattern: string) {
        const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "i");
        filters.push((r) => !c.includes(".") && typeof r[c] === "string" && re.test(r[c] as string));
        return api;
      },
      or() {
        return api;
      },
      order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
        orderBy.push({ col, asc: opts?.ascending !== false, nullsFirst: opts?.nullsFirst });
        return api;
      },
      limit(n: number) {
        limitN = n;
        return api;
      },
      range(from: number, to: number) {
        offsetN = from;
        limitN = to - from + 1;
        return api;
      },
      single() {
        single = "one";
        return api;
      },
      maybeSingle() {
        single = "maybe";
        return api;
      },
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        try {
          resolve(execute());
        } catch (e) {
          if (reject) reject(e);
          else throw e;
        }
      },
    };

    function conflictRow(rows: Row[], r: Row, cols: string[]): Row | undefined {
      return rows.find((x) => cols.every((c) => x[c] === r[c]));
    }

    function execute(): { data: unknown; error: unknown; count: number | null } {
      const rows = tableOf(table);
      const match = (r: Row) => filters.every((f) => f(r));
      let affected: Row[] = [];
      if (op === "insert" || op === "upsert") {
        const items = Array.isArray(payload) ? payload : [payload as Row];
        for (const raw of items) {
          const r: Row = { ...raw };
          if (op === "upsert") {
            const existing = conflictRow(rows, r, onConflict!);
            if (existing) {
              if (!ignoreDuplicates) Object.assign(existing, r);
              affected.push(existing);
              continue;
            }
          } else {
            for (const cols of uniques[table] ?? []) {
              if (cols.every((c) => r[c] !== undefined && r[c] !== null) && conflictRow(rows, r, cols)) {
                return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint (${cols.join(", ")})` }, count: null };
              }
            }
          }
          if (r.id === undefined && table !== "supplier_feed_secrets") r.id = table === "sourcing_import_issues" ? rows.length + 1 : uuid();
          const now = new Date().toISOString();
          for (const c of ["created_at", "updated_at", "started_at"]) if (r[c] === undefined && (table.includes("sourcing") || table.includes("supplier") || table === "sync_runs")) r[c] = now;
          rows.push(r);
          affected.push(r);
        }
      } else if (op === "update") {
        affected = rows.filter(match);
        for (const r of affected) Object.assign(r, payload as Row);
      } else if (op === "delete") {
        affected = rows.filter(match);
        tables[table] = rows.filter((r) => !match(r));
      } else {
        affected = rows.filter(match);
      }
      if (op !== "select" && !returning) return { data: null, error: null, count: null };
      let out = [...affected];
      for (const o of [...orderBy].reverse()) {
        out.sort((a, b) => {
          const va = a[o.col];
          const vb = b[o.col];
          if (va === vb) return 0;
          if (va === null || va === undefined) return o.nullsFirst ? -1 : 1;
          if (vb === null || vb === undefined) return o.nullsFirst ? 1 : -1;
          return (va < vb ? -1 : 1) * (o.asc ? 1 : -1);
        });
      }
      const count = countMode ? out.length : null;
      if (limitN !== null) out = out.slice(offsetN, offsetN + limitN);
      const data = out.map((r) => resolveSelect(r, selectCols));
      if (head) return { data: null, error: null, count };
      if (single === "one") return data.length === 1 ? { data: data[0], error: null, count } : { data: null, error: { code: "PGRST116", message: `${data.length} lignes au lieu d'une` }, count };
      if (single === "maybe") return { data: data[0] ?? null, error: null, count };
      return { data, error: null, count };
    }

    // reset entre deux usages du même builder (non partagé)
    void orderBy;
    orderBy = [];
    return api;
  }

  db.client = { from: (t: string) => builder(t), rpc: async (name: string, args: Record<string, unknown> = {}) => (rpcHandlers[name] ? rpcHandlers[name]!(args, db) : { data: null, error: null }) } as never;
  return db;
}
