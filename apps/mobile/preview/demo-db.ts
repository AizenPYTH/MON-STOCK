/**
 * APERÇU VISUEL UNIQUEMENT (jamais embarqué dans l'application : voir metro.config.js, MONSTOCK_PREVIEW=1).
 *
 * Base en mémoire qui imite le sous-ensemble de PostgREST utilisé par l'application (select avec
 * relations imbriquées, filtres, tri, pagination, comptage). Elle sert à afficher les écrans dans un
 * navigateur pour les contrôler visuellement, sans aucun accès à Supabase. Les données sont celles de
 * `demoTables()` : une organisation de démonstration marquée comme telle.
 */

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

type Field =
  | { kind: "star" }
  | { kind: "col"; name: string; alias: string }
  | { kind: "count" }
  | { kind: "rel"; alias: string; table: string; inner: boolean; fields: Field[] };

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function parseSelect(s: string): Field[] {
  return splitTop(s.replace(/\s+/g, " ")).map((tok): Field => {
    if (tok === "*") return { kind: "star" };
    if (tok === "count") return { kind: "count" };
    const open = tok.indexOf("(");
    if (open >= 0) {
      const head = tok.slice(0, open).trim();
      const inner = tok.slice(open + 1, tok.lastIndexOf(")"));
      const [aliasPart, rest] = head.includes(":") ? head.split(":", 2) : [null, head];
      const [table, hint] = (rest ?? "").split("!");
      const t = (table ?? "").trim();
      return { kind: "rel", alias: (aliasPart ?? t).trim(), table: t, inner: hint === "inner", fields: parseSelect(inner) };
    }
    const [a, b] = tok.includes(":") ? tok.split(":", 2) : [tok, tok];
    return { kind: "col", alias: (a ?? tok).trim(), name: (b ?? tok).trim() };
  });
}

const singular = (t: string) => (t.endsWith("ies") ? `${t.slice(0, -3)}y` : t.endsWith("s") ? t.slice(0, -1) : t);

function project(db: Tables, table: string, row: Row, fields: Field[]): Row | null {
  const out: Row = { ...row };
  for (const f of fields) {
    if (f.kind === "col") out[f.alias] = row[f.name];
    if (f.kind !== "rel") continue;
    const target = db[f.table] ?? [];
    const fkCandidates = [`${f.alias}_id`, `${singular(f.table)}_id`];
    const fk = fkCandidates.find((k) => k in row);
    let value: unknown;
    if (fk) {
      const ref = row[fk];
      const hit = ref == null ? undefined : target.find((r) => r.id === ref);
      value = hit ? project(db, f.table, hit, f.fields) : null;
    } else {
      const back = `${singular(table)}_id`;
      const children = target.filter((r) => r[back] === row.id);
      value = f.fields.some((x) => x.kind === "count") ? [{ count: children.length }] : children.map((c) => project(db, f.table, c, f.fields));
    }
    if (f.inner && (value == null || (Array.isArray(value) && value.length === 0))) return null;
    out[f.alias] = value;
  }
  return out;
}

function valuesAt(row: Row, path: string): unknown[] {
  const [head, ...rest] = path.split(".");
  const v = row[head ?? ""];
  if (rest.length === 0) return [v];
  const items = Array.isArray(v) ? v : [v];
  return items.flatMap((x) => (x && typeof x === "object" ? valuesAt(x as Row, rest.join(".")) : []));
}

const likeToRegExp = (pattern: string, flags: string) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, flags);
const cmp = (a: unknown, b: unknown) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0);

type Pred = (row: Row) => boolean;
type Result = { data: unknown; error: null; count: number | null };

const OPS: Record<string, (v: unknown, x: unknown) => boolean> = {
  eq: (v, x) => v === x || String(v) === String(x),
  neq: (v, x) => v !== x && String(v) !== String(x),
  gt: (v, x) => v != null && cmp(v, x) > 0,
  gte: (v, x) => v != null && cmp(v, x) >= 0,
  lt: (v, x) => v != null && cmp(v, x) < 0,
  lte: (v, x) => v != null && cmp(v, x) <= 0,
  is: (v, x) => (x === null ? v == null : v === x),
  in: (v, x) => Array.isArray(x) && x.some((y) => y === v || String(y) === String(v)),
  ilike: (v, x) => typeof v === "string" && likeToRegExp(String(x), "i").test(v),
  like: (v, x) => typeof v === "string" && likeToRegExp(String(x), "").test(v),
};

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

/** Requête paresseuse : exécutée quand elle est attendue (comme le client Supabase). */
export class DemoQuery implements PromiseLike<Result> {
  private preds: Pred[] = [];
  private fields: Field[] = [{ kind: "star" }];
  private orders: { col: string; asc: boolean }[] = [];
  private from = 0;
  private to = Number.POSITIVE_INFINITY;
  private mode: "many" | "single" | "maybe" = "many";
  private head = false;
  private counting = false;
  private write: { kind: "insert" | "update" | "upsert" | "delete"; values: Row | Row[] | null } | null = null;

  constructor(
    private readonly db: Tables,
    private readonly table: string,
  ) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }): this {
    this.fields = parseSelect(cols);
    this.head = Boolean(opts?.head);
    this.counting = Boolean(opts?.count);
    return this;
  }
  private add(op: keyof typeof OPS, col: string, x: unknown, negate = false): this {
    const fn = OPS[op];
    if (fn) this.preds.push((r) => valuesAt(r, col).some((v) => fn(v, x)) !== negate);
    return this;
  }
  eq(c: string, v: unknown) { return this.add("eq", c, v); }
  neq(c: string, v: unknown) { return this.add("neq", c, v); }
  gt(c: string, v: unknown) { return this.add("gt", c, v); }
  gte(c: string, v: unknown) { return this.add("gte", c, v); }
  lt(c: string, v: unknown) { return this.add("lt", c, v); }
  lte(c: string, v: unknown) { return this.add("lte", c, v); }
  is(c: string, v: unknown) { return this.add("is", c, v); }
  in(c: string, v: unknown[]) { return this.add("in", c, v); }
  ilike(c: string, v: string) { return this.add("ilike", c, v); }
  like(c: string, v: string) { return this.add("like", c, v); }
  not(c: string, op: string, v: unknown) {
    const parsed = op === "in" && typeof v === "string" ? v.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, "")) : v === "null" ? null : v;
    return op in OPS ? this.add(op as keyof typeof OPS, c, parsed, true) : this;
  }
  /** Filtres « or » non interprétés : sans effet dans l'aperçu. */
  or() { return this; }
  filter(c: string, op: string, v: unknown) { return op in OPS ? this.add(op as keyof typeof OPS, c, v) : this; }
  match(obj: Row) { for (const [k, v] of Object.entries(obj)) this.add("eq", k, v); return this; }
  contains() { return this; }
  overlaps() { return this; }
  textSearch() { return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, asc: opts?.ascending !== false }); return this; }
  limit(n: number) { this.to = Math.min(this.to, this.from + n - 1); return this; }
  range(a: number, b: number) { this.from = a; this.to = b; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  abortSignal() { return this; }
  returns() { return this; }
  insert(values: Row | Row[]) { this.write = { kind: "insert", values }; return this; }
  upsert(values: Row | Row[]) { this.write = { kind: "upsert", values }; return this; }
  update(values: Row) { this.write = { kind: "update", values }; return this; }
  delete() { this.write = { kind: "delete", values: null }; return this; }

  private run(): Result {
    const rows = (this.db[this.table] ??= []);
    if (this.write?.kind === "insert" || this.write?.kind === "upsert") {
      const list = (Array.isArray(this.write.values) ? this.write.values : [this.write.values ?? {}]).map((v) => ({ id: newId(), created_at: new Date().toISOString(), ...v }));
      rows.push(...list);
      return this.shape(list);
    }
    if (this.write?.kind === "update") {
      const hit = rows.filter((r) => this.preds.every((p) => p(r)));
      for (const r of hit) Object.assign(r, this.write.values);
      return this.shape(hit);
    }
    if (this.write?.kind === "delete") {
      this.db[this.table] = rows.filter((r) => !this.preds.every((p) => p(r)));
      return { data: null, error: null, count: null };
    }
    let out = rows.map((r) => project(this.db, this.table, r, this.fields)).filter((r): r is Row => r !== null && this.preds.every((p) => p(r)));
    for (const o of [...this.orders].reverse()) out = [...out].sort((a, b) => cmp(a[o.col], b[o.col]) * (o.asc ? 1 : -1));
    const total = out.length;
    out = out.slice(this.from, Number.isFinite(this.to) ? this.to + 1 : undefined);
    if (this.head) return { data: null, error: null, count: total };
    return { ...this.shape(out), count: this.counting ? total : null };
  }

  private shape(list: Row[]): Result {
    if (this.mode === "many") return { data: list, error: null, count: null };
    return { data: list[0] ?? null, error: null, count: null };
  }

  then<A = Result, B = never>(onOk?: ((v: Result) => A | PromiseLike<A>) | null, onErr?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onOk, onErr);
  }
}

export interface DemoUser {
  id: string;
  email: string;
}

/** Client minimal compatible avec les appels de l'application (lecture surtout). */
export function createDemoClient(db: Tables, user: DemoUser) {
  const session = { access_token: "preview-token", refresh_token: "preview", expires_in: 3600, token_type: "bearer", user: { id: user.id, email: user.email, app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" } };
  return {
    from: (table: string) => new DemoQuery(db, table),
    rpc: async () => ({ data: null, error: null }),
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session.user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      startAutoRefresh: async () => undefined,
      stopAutoRefresh: async () => undefined,
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ data: { session }, error: null }),
      updateUser: async () => ({ data: { user: session.user }, error: null }),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Données de démonstration
// ---------------------------------------------------------------------------------------------

export const DEMO_USER: DemoUser = { id: "11111111-1111-4111-8111-111111111111", email: "demo@monstock.app" };
export const DEMO_ORG_ID = "22222222-2222-4222-8222-222222222222";

interface DemoSku {
  code: string;
  product: string;
  brand: string;
  category: string;
  variant: string;
  condition: string;
  grade: string | null;
  qty: number;
  reorder: number;
  cost: number;
  price: number;
  units30: number;
  ebay: boolean;
}

const SKUS: DemoSku[] = [
  { code: "IP13-128-A-MID", product: "iPhone 13", brand: "Apple", category: "Smartphones", variant: "128 Go · Minuit · Grade A", condition: "refurbished", grade: "A", qty: 6, reorder: 3, cost: 318, price: 449, units30: 14, ebay: true },
  { code: "IP13-128-B-BLU", product: "iPhone 13", brand: "Apple", category: "Smartphones", variant: "128 Go · Bleu · Grade B", condition: "refurbished", grade: "B", qty: 2, reorder: 3, cost: 289, price: 399, units30: 9, ebay: true },
  { code: "IP12-64-A-BLK", product: "iPhone 12", brand: "Apple", category: "Smartphones", variant: "64 Go · Noir · Grade A", condition: "refurbished", grade: "A", qty: 0, reorder: 2, cost: 225, price: 319, units30: 7, ebay: true },
  { code: "IP14P-256-A-GLD", product: "iPhone 14 Pro", brand: "Apple", category: "Smartphones", variant: "256 Go · Or · Grade A", condition: "refurbished", grade: "A", qty: 3, reorder: 1, cost: 612, price: 789, units30: 4, ebay: true },
  { code: "SGS21-128-A-GRY", product: "Galaxy S21", brand: "Samsung", category: "Smartphones", variant: "128 Go · Gris · Grade A", condition: "refurbished", grade: "A", qty: 4, reorder: 2, cost: 199, price: 289, units30: 5, ebay: true },
  { code: "ECR-IP13-OLED", product: "Écran OLED iPhone 13", brand: "Apple", category: "Pièces détachées", variant: "Qualité origine", condition: "new", grade: null, qty: 11, reorder: 5, cost: 92, price: 149, units30: 12, ebay: true },
  { code: "BAT-IP12", product: "Batterie iPhone 12", brand: "Apple", category: "Pièces détachées", variant: "Compatible · 2815 mAh", condition: "new", grade: null, qty: 1, reorder: 6, cost: 11.5, price: 29.9, units30: 18, ebay: true },
  { code: "BAT-IP11", product: "Batterie iPhone 11", brand: "Apple", category: "Pièces détachées", variant: "Compatible · 3110 mAh", condition: "new", grade: null, qty: 0, reorder: 6, cost: 10.9, price: 27.9, units30: 15, ebay: false },
  { code: "IPAD9-64-A-SLV", product: "iPad 9e génération", brand: "Apple", category: "Tablettes", variant: "64 Go · Argent · Wi-Fi", condition: "refurbished", grade: "A", qty: 5, reorder: 2, cost: 199, price: 279, units30: 3, ebay: true },
  { code: "APP2-CASE", product: "AirPods Pro 2", brand: "Apple", category: "Audio", variant: "Boîtier MagSafe USB-C", condition: "refurbished", grade: "A", qty: 7, reorder: 3, cost: 129, price: 189, units30: 6, ebay: false },
  { code: "CHG-USBC-20W", product: "Chargeur USB-C 20 W", brand: "Générique", category: "Accessoires", variant: "Blanc", condition: "new", grade: null, qty: 42, reorder: 10, cost: 3.2, price: 12.9, units30: 21, ebay: false },
  { code: "MBA-M1-256", product: "MacBook Air M1", brand: "Apple", category: "Ordinateurs", variant: "8 Go · 256 Go · Gris sidéral", condition: "refurbished", grade: "B", qty: 2, reorder: 1, cost: 489, price: 649, units30: 2, ebay: true },
];

interface DemoSupplier {
  key: string;
  name: string;
  website: string;
  country: string;
}

const SUPPLIERS: DemoSupplier[] = [
  { key: "foxway", name: "Foxway", website: "https://www.foxway.com", country: "EE" },
  { key: "brico-phone", name: "Brico-phone", website: "https://www.brico-phone.com", country: "FR" },
  { key: "bigbuy", name: "BigBuy", website: "https://www.bigbuy.eu", country: "ES" },
  { key: "mobilax", name: "Mobilax", website: "https://www.mobilax.fr", country: "FR" },
  { key: "refreshed-apples", name: "Refreshed Apples", website: "https://refreshedapples.com", country: "NL" },
  { key: "ebay", name: "eBay France", website: "https://www.ebay.fr", country: "FR" },
];

const uid = (prefix: number, n: number) => `${String(prefix).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Jeu de données cohérent (stock, ventes, fournisseurs, offres, imports), daté par rapport à `now`. */
export function demoTables(now = new Date()): Tables {
  const iso = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();
  const H = 3_600_000;
  const D = 24 * H;
  const org = DEMO_ORG_ID;
  const db: Tables = {};

  db.organizations = [{ id: org, name: "Atelier Démo", slug: "atelier-demo", is_demo: true, default_currency: "EUR", country: "FR", settings: { costs: { packagingCost: 1.2, shippingCost: 6.5 } }, created_at: iso(200 * D) }];
  db.organization_members = [{ id: uid(3, 1), user_id: DEMO_USER.id, organization_id: org, role: "owner" }];
  db.user_profiles = [{ user_id: DEMO_USER.id, current_organization_id: org }];
  db.sales_channels = [
    { id: uid(4, 1), organization_id: org, provider: "ebay", name: "eBay", currency: "EUR", is_active: true, fee_percent: 11.9, payment_fee_percent: 0, payment_fee_fixed: 0.35, default_shipping_cost: 6.5 },
    { id: uid(4, 2), organization_id: org, provider: "manual", name: "Boutique", currency: "EUR", is_active: true, fee_percent: 0, payment_fee_percent: 1.4, payment_fee_fixed: 0.25, default_shipping_cost: 0 },
  ];

  db.products = [];
  db.product_variants = [];
  db.skus = [];
  db.v_stock_overview = [];
  db.channel_listings = [];
  const productIds = new Map<string, string>();
  SKUS.forEach((s, i) => {
    let pid = productIds.get(s.product);
    if (!pid) {
      pid = uid(5, productIds.size + 1);
      productIds.set(s.product, pid);
      db.products!.push({ id: pid, organization_id: org, name: s.product, brand: s.brand, category: s.category, description: null, attributes: {}, image_url: null, is_archived: false, updated_at: iso(3 * D) });
    }
    const vid = uid(6, i + 1);
    const sid = uid(7, i + 1);
    db.product_variants!.push({ id: vid, organization_id: org, product_id: pid, name: s.variant, condition: s.condition, grade: s.grade, ean: null, attributes: {}, updated_at: iso(3 * D) });
    db.skus!.push({ id: sid, organization_id: org, product_id: pid, variant_id: vid, code: s.code, cost_price: s.cost, sale_price: s.price, currency: "EUR", location: i % 2 ? "Étagère B" : "Étagère A", reorder_point: s.reorder, safety_stock: 1, barcode: null, is_active: true, updated_at: iso(2 * D) });
    db.v_stock_overview!.push({
      organization_id: org, sku_id: sid, code: s.code, product_id: pid, product_name: s.product, variant_id: vid, variant_name: s.variant, brand: s.brand, category: s.category, condition: s.condition, grade: s.grade,
      image_url: null, is_active: true, product_archived: false, location: i % 2 ? "Étagère B" : "Étagère A", barcode: null,
      quantity_on_hand: s.qty, quantity_reserved: 0, quantity_available: s.qty, reorder_point: s.reorder, safety_stock: 1,
      cost_price: s.cost, sale_price: s.price, currency: "EUR", stock_value: Math.round(s.qty * s.cost * 100) / 100, unit_margin: Math.round((s.price - s.cost) * 100) / 100,
      units_7d: Math.round(s.units30 / 4), units_30d: s.units30, units_90d: s.units30 * 3, units_prev_7d: Math.round(s.units30 / 4.5), units_prev_30d: Math.round(s.units30 * 0.85),
      revenue_30d: Math.round(s.units30 * s.price), avg_sale_price_30d: Math.round(s.price * 0.97 * 100) / 100, foreign_currency_units_30d: 0,
      active_listings_count: s.ebay ? 1 : 0, channel_providers: s.ebay ? ["ebay"] : [], last_sale_at: iso((i + 1) * 5 * H), first_sale_at: iso(180 * D), last_movement_at: iso((i + 1) * 4 * H),
      lead_time_days: 5, default_supplier_id: null, supplier_ids: [], supplier_offers_count: 0, best_supplier_price: null,
    });
    if (s.ebay)
      db.channel_listings!.push({ id: uid(8, i + 1), organization_id: org, provider: "ebay", sales_channel_id: uid(4, 1), sku_id: sid, title: `${s.product} ${s.variant}`, price: s.price, currency: "EUR", quantity_available: s.qty, quantity_listed: s.qty, quantity_sold: s.units30, status: s.qty > 0 ? "active" : "out_of_stock", external_listing_id: String(2049_0000_0000 + i), external_sku: s.code, mapping_status: "mapped", last_synced_at: iso(40 * 60_000), listing_url: null, image_url: null });
  });

  // ventes sur 30 jours (déterministes)
  db.orders = [];
  db.order_items = [];
  let n = 0;
  for (let day = 0; day < 30; day++) {
    const perDay = 2 + ((day * 7) % 5);
    for (let k = 0; k < perDay; k++) {
      const s = SKUS[(day * 3 + k * 5) % SKUS.length]!;
      const sku = db.skus[(day * 3 + k * 5) % SKUS.length]!;
      n++;
      const oid = uid(9, n);
      const qty = s.price < 40 && k % 2 === 0 ? 2 : 1;
      const placed = iso(day * D + (k + 1) * 1.7 * H);
      const status = day === 0 && k < 2 ? "paid" : "shipped";
      db.orders.push({ id: oid, organization_id: org, provider: k % 3 === 0 ? "manual" : "ebay", sales_channel_id: k % 3 === 0 ? uid(4, 2) : uid(4, 1), order_number: `MS-${String(4810 - n)}`, external_order_id: `${17 - (n % 9)}-${12000 + n}-${55000 + n * 3}`, buyer_username: ["lucas_r", "amelie.m", "techshop75", "jordanb", "sophie_l", "karim.d"][n % 6], status, placed_at: placed, total: Math.round(s.price * qty * 100) / 100, currency: "EUR", fee_total: k % 3 === 0 ? 0 : Math.round(s.price * qty * 0.119 * 100) / 100, inventory_applied: !(day === 0 && k === 0), created_at: placed });
      db.order_items.push({ id: uid(10, n), organization_id: org, order_id: oid, sku_id: sku.id, title: `${s.product} ${s.variant}`, quantity: qty, unit_price: s.price, currency: "EUR", total: s.price * qty, inventory_applied: !(day === 0 && k === 0) });
    }
  }
  const byDay = new Map<string, { revenue: number; orders: number; units: number }>();
  for (const o of db.orders) {
    const d = String(o.placed_at).slice(0, 10);
    const cur = byDay.get(d) ?? { revenue: 0, orders: 0, units: 0 };
    cur.revenue += Number(o.total);
    cur.orders += 1;
    cur.units += db.order_items.filter((it) => it.order_id === o.id).reduce((a, it) => a + Number(it.quantity), 0);
    byDay.set(d, cur);
  }
  db.v_daily_sales = [...byDay.entries()].map(([day, v]) => ({ organization_id: org, day, currency: "EUR", revenue: Math.round(v.revenue * 100) / 100, orders_count: v.orders, units: v.units }));

  db.inventory_movements = db.skus.slice(0, 8).map((s, i) => ({ id: uid(11, i + 1), organization_id: org, sku_id: s.id, type: i % 3 === 0 ? "purchase" : "sale", quantity: i % 3 === 0 ? 5 : -1, quantity_after: SKUS[i]!.qty, note: null, channel: i % 3 === 0 ? null : "ebay", occurred_at: iso((i + 1) * 3 * H), created_at: iso((i + 1) * 3 * H) }));

  db.alerts = [
    { id: uid(12, 1), organization_id: org, type: "stockout", severity: "critical", status: "open", title: "Rupture : iPhone 12 64 Go", message: "7 ventes sur 30 jours, plus aucune unité disponible.", entity_type: "sku", entity_id: db.skus[2]!.id, action_href: null, created_at: iso(5 * H) },
    { id: uid(12, 2), organization_id: org, type: "low_stock", severity: "warning", status: "open", title: "Stock faible : Batterie iPhone 12", message: "1 unité restante pour 18 ventes sur 30 jours.", entity_type: "sku", entity_id: db.skus[6]!.id, action_href: null, created_at: iso(9 * H) },
  ];

  // fournisseurs et sourcing
  db.suppliers = SUPPLIERS.map((s, i) => ({ id: uid(13, i + 1), organization_id: org, name: s.name, website: s.website, country: s.country, currency: "EUR", is_archived: false, created_at: iso(60 * D) }));
  const sup = (key: string) => db.suppliers![SUPPLIERS.findIndex((s) => s.key === key)]!;
  db.supplier_sources = [
    { id: uid(14, 1), organization_id: org, supplier_id: sup("foxway").id, name: "Foxway — liste de stock", source_type: "CSV", status: "active", config: {}, automated_access_confirmed: false, robots_allowed: null, sync_frequency: "manual", base_url: null, country: "EE", last_sync_at: iso(2 * D), last_successful_sync_at: iso(2 * D), last_error: null, next_run_at: null, consecutive_failures: 0 },
    { id: uid(14, 2), organization_id: org, supplier_id: sup("brico-phone").id, name: "Brico-phone", source_type: "PUBLIC_WEB", status: "active", config: { library_key: "brico-phone" }, automated_access_confirmed: true, robots_allowed: true, sync_frequency: "weekly", base_url: "https://www.brico-phone.com", country: "FR", last_sync_at: iso(1 * D), last_successful_sync_at: iso(1 * D), last_error: null, next_run_at: iso(-6 * D), consecutive_failures: 0 },
    { id: uid(14, 3), organization_id: org, supplier_id: sup("refreshed-apples").id, name: "Refreshed Apples", source_type: "PUBLIC_WEB", status: "active", config: { library_key: "refreshed-apples" }, automated_access_confirmed: true, robots_allowed: true, sync_frequency: "weekly", base_url: "https://refreshedapples.com", country: "NL", last_sync_at: iso(3 * D), last_successful_sync_at: iso(3 * D), last_error: null, next_run_at: iso(-4 * D), consecutive_failures: 0 },
    { id: uid(14, 4), organization_id: org, supplier_id: sup("bigbuy").id, name: "BigBuy — API", source_type: "API", status: "error", config: {}, automated_access_confirmed: true, robots_allowed: null, sync_frequency: "daily", base_url: null, country: "ES", last_sync_at: iso(6 * H), last_successful_sync_at: null, last_error: "Clé API refusée par BigBuy (HTTP 401).", next_run_at: null, consecutive_failures: 3 },
    { id: uid(14, 5), organization_id: org, supplier_id: sup("ebay").id, name: "eBay France", source_type: "API", status: "active", config: { adapter: "ebay-browse", kind: "marketplace" }, automated_access_confirmed: true, robots_allowed: null, sync_frequency: "manual", base_url: null, country: "FR", last_sync_at: iso(30 * 60_000), last_successful_sync_at: iso(30 * 60_000), last_error: null, next_run_at: null, consecutive_failures: 0 },
  ];
  db.supplier_connections = [{ id: uid(15, 1), organization_id: org, supplier_id: sup("bigbuy").id, connector_key: "bigbuy", status: "error", source_id: uid(14, 4), last_sync_at: iso(6 * H), last_error: "Clé API refusée par BigBuy (HTTP 401).", config: {} }];
  db.supplier_feeds = [];
  db.sync_runs = [];

  interface DemoOffer { src: number; sup: string; title: string; price: number; qty: number | null; model: string; storage: string | null; grade: string | null; condition: string; type: string }
  const offers: DemoOffer[] = [
    { src: 1, sup: "foxway", title: "Apple iPhone 13 128GB Midnight Grade A", price: 279, qty: 40, model: "iphone 13", storage: "128", grade: "A", condition: "refurbished", type: "CSV" },
    { src: 1, sup: "foxway", title: "Apple iPhone 13 128GB Blue Grade B", price: 251, qty: 65, model: "iphone 13", storage: "128", grade: "B", condition: "refurbished", type: "CSV" },
    { src: 1, sup: "foxway", title: "Apple iPhone 12 64GB Black Grade A", price: 199, qty: 22, model: "iphone 12", storage: "64", grade: "A", condition: "refurbished", type: "CSV" },
    { src: 1, sup: "foxway", title: "Apple iPhone 14 Pro 256GB Gold Grade A", price: 569, qty: 8, model: "iphone 14 pro", storage: "256", grade: "A", condition: "refurbished", type: "CSV" },
    { src: 3, sup: "refreshed-apples", title: "iPhone 13 128GB Midnight - Grade A", price: 299, qty: 12, model: "iphone 13", storage: "128", grade: "A", condition: "refurbished", type: "PUBLIC_WEB" },
    { src: 3, sup: "refreshed-apples", title: "iPhone 12 64GB Black - Grade B", price: 185, qty: 9, model: "iphone 12", storage: "64", grade: "B", condition: "refurbished", type: "PUBLIC_WEB" },
    { src: 2, sup: "brico-phone", title: "Écran OLED iPhone 13 qualité origine", price: 84.9, qty: null, model: "iphone 13", storage: null, grade: null, condition: "new", type: "PUBLIC_WEB" },
    { src: 2, sup: "brico-phone", title: "Batterie iPhone 12 compatible 2815 mAh", price: 9.9, qty: null, model: "iphone 12", storage: null, grade: null, condition: "new", type: "PUBLIC_WEB" },
    { src: 2, sup: "brico-phone", title: "Batterie iPhone 11 compatible 3110 mAh", price: 9.5, qty: null, model: "iphone 11", storage: null, grade: null, condition: "new", type: "PUBLIC_WEB" },
    { src: 5, sup: "ebay", title: "Apple iPhone 13 128 Go Minuit - Très bon état", price: 419, qty: 1, model: "iphone 13", storage: "128", grade: "A", condition: "refurbished", type: "API" },
    { src: 5, sup: "ebay", title: "iPhone 13 128Go Minuit reconditionné grade A", price: 435, qty: 1, model: "iphone 13", storage: "128", grade: "A", condition: "refurbished", type: "API" },
    { src: 5, sup: "ebay", title: "iPhone 13 bleu 128 Go bon état", price: 389, qty: 1, model: "iphone 13", storage: "128", grade: "B", condition: "refurbished", type: "API" },
    { src: 5, sup: "ebay", title: "Apple iPhone 12 64 Go noir état correct", price: 289, qty: 1, model: "iphone 12", storage: "64", grade: "A", condition: "refurbished", type: "API" },
    { src: 5, sup: "ebay", title: "iPhone 13 128 Go noir minuit grade A comme neuf", price: 409, qty: 1, model: "iphone 13", storage: "128", grade: "A", condition: "refurbished", type: "API" },
    { src: 5, sup: "ebay", title: "Apple iPhone 13 128Go Midnight excellent état", price: 445, qty: 2, model: "iphone 13", storage: "128", grade: "A", condition: "refurbished", type: "API" },
    { src: 5, sup: "ebay", title: "iPhone 13 128 Go bleu reconditionné", price: 375, qty: 1, model: "iphone 13", storage: "128", grade: "B", condition: "refurbished", type: "API" },
    { src: 5, sup: "ebay", title: "Apple iPhone 13 bleu 128Go état correct", price: 395, qty: 1, model: "iphone 13", storage: "128", grade: "B", condition: "refurbished", type: "API" },
    { src: 5, sup: "ebay", title: "iPhone 12 64 Go noir très bon état", price: 279, qty: 1, model: "iphone 12", storage: "64", grade: "A", condition: "refurbished", type: "API" },
    { src: 5, sup: "ebay", title: "Apple iPhone 12 64Go black reconditionné grade A", price: 299, qty: 1, model: "iphone 12", storage: "64", grade: "A", condition: "refurbished", type: "API" },
  ];
  db.sourcing_offers = offers.map((o, i) => {
    const supplier = sup(o.sup);
    return {
      id: uid(16, i + 1), organization_id: org, source_id: uid(14, o.src), supplier_id: supplier.id, source_type: o.type, status: "active",
      title_original: o.title, original_price: o.price, original_currency: "EUR", normalized_price: o.price, normalized_currency: "EUR", fx_rate: 1, tax_type: o.src === 5 ? "ttc" : "ht",
      available_quantity: o.qty, stock_status: o.qty === null ? "unknown" : o.qty > 5 ? "in_stock" : "low", source_url: `${String(supplier.website)}/p/${i + 1}`,
      last_seen_at: iso((i + 1) * 2 * H), first_seen_at: iso(10 * D), brand: "Apple", model: o.model, storage: o.storage, condition: o.condition, grade: o.grade,
      shipping_cost: o.src === 5 ? 0 : 9, shipping_currency: "EUR", moq: o.type === "CSV" ? 5 : 1, ship_from_country: String(supplier.country), sku_id: null, confidence: 0.82,
    };
  });

  db.sourcing_import_jobs = [
    { id: uid(17, 1), organization_id: org, supplier_id: sup("foxway").id, source_id: uid(14, 1), origin: "file", file_name: "foxway-stocklist-semaine-41.xlsx", file_size: 482_113, format: "xlsx", mode: "snapshot", status: "partial", rows_read: 1284, rows_valid: 1241, offers_created: 312, offers_updated: 874, offers_unchanged: 55, duplicates: 9, rows_invalid: 34, offers_rejected: 0, products_unrecognized: 18, offers_expired: 41, truncated: false, message: null, created_by: DEMO_USER.id, started_at: iso(2 * D), finished_at: iso(2 * D - 41_000) },
    { id: uid(17, 2), organization_id: org, supplier_id: sup("mobilax").id, source_id: null, origin: "file", file_name: "mobilax-tarifs.csv", file_size: 88_412, format: "csv", mode: "partial", status: "failed", rows_read: 0, rows_valid: 0, offers_created: 0, offers_updated: 0, offers_unchanged: 0, duplicates: 0, rows_invalid: 0, offers_rejected: 0, products_unrecognized: 0, offers_expired: 0, truncated: false, message: "Aucune colonne de prix reconnue : associez la colonne « Prix HT » au prix.", created_by: DEMO_USER.id, started_at: iso(5 * D), finished_at: iso(5 * D - 3_000) },
    { id: uid(17, 3), organization_id: org, supplier_id: sup("foxway").id, source_id: uid(14, 1), origin: "file", file_name: "foxway-stocklist-semaine-40.xlsx", file_size: 470_002, format: "xlsx", mode: "snapshot", status: "completed", rows_read: 1190, rows_valid: 1190, offers_created: 1190, offers_updated: 0, offers_unchanged: 0, duplicates: 0, rows_invalid: 0, offers_rejected: 0, products_unrecognized: 0, offers_expired: 0, truncated: false, message: null, created_by: DEMO_USER.id, started_at: iso(9 * D), finished_at: iso(9 * D - 38_000) },
  ];
  db.sourcing_import_issues = [
    { id: uid(18, 1), organization_id: org, job_id: uid(17, 1), line: 14, kind: "invalid", reference: "FX-IP13-128-MID-A", message: "Prix manquant.", excerpt: { model: "iPhone 13", price: "" } },
    { id: uid(18, 2), organization_id: org, job_id: uid(17, 1), line: 87, kind: "duplicate", reference: "FX-IP12-64-BLK-B", message: "Référence déjà présente à la ligne 86 : seule la première est conservée.", excerpt: null },
    { id: uid(18, 3), organization_id: org, job_id: uid(17, 1), line: 203, kind: "unrecognized", reference: "FX-ACC-0042", message: "Produit non reconnu (modèle absent).", excerpt: { title: "Coque silicone premium" } },
    { id: uid(18, 4), organization_id: org, job_id: uid(17, 1), line: 377, kind: "warning", reference: "FX-IPAD9-64", message: "Devise absente : EUR appliqué par défaut.", excerpt: null },
  ];

  db.purchase_orders = [{ id: uid(19, 1), organization_id: org, supplier_id: sup("foxway").id, reference: "PO-2026-018", status: "sent", currency: "EUR", total: 2790, expected_at: iso(-3 * D), created_at: iso(4 * D) }];
  db.purchase_order_items = [{ id: uid(20, 1), organization_id: org, purchase_order_id: uid(19, 1), sku_id: db.skus[0]!.id, quantity_ordered: 10, quantity_received: 0, unit_cost: 279, currency: "EUR" }];
  db.tracked_parcels = [];
  db.shipping_rate_cards = [];
  db.sourcing_saved_offers = [];
  db.advisor_conversations = [];
  db.advisor_messages = [];
  db.fx_rates = [{ base_currency: "EUR", quote_currency: "USD", rate: 1.09, rate_date: iso(D).slice(0, 10), source: "ECB" }];
  db.supplier_directory_checks = [];
  db.sourcing_library_checks = [];
  return db;
}
