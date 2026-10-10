/**
 * Fixtures et introspection pour les tests de sécurité multi-tenant.
 * Les tables, vues et fonctions sont ÉNUMÉRÉES depuis pg_catalog (jamais listées à la main) :
 * une table ajoutée par une migration future est automatiquement couverte par la matrice.
 */
import type { Client } from "pg";
import { asService, asSuperuser, asUser, createOrgAs, createUser } from "./helpers";

/** Tables accessibles au seul service_role (aucune policy, aucun privilège client). */
export const SERVICE_ROLE_ONLY_TABLES = ["channel_connection_secrets", "supplier_connection_secrets", "oauth_states"] as const;

/** Tables globales (sans organisation), lisibles par tout utilisateur authentifié. */
export const GLOBAL_READ_TABLES = ["fx_rates"] as const;

export interface RelationInfo {
  name: string;
  kind: "table" | "view" | "matview";
  hasOrgColumn: boolean;
}

export async function listRelations(c: Client): Promise<RelationInfo[]> {
  const { rows } = await c.query<{ name: string; relkind: string; has_org: boolean }>(`
    select c.relname as name, c.relkind,
      exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped) as has_org
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
    order by c.relname`);
  return rows.map((r) => ({ name: r.name, kind: r.relkind === "v" ? "view" : r.relkind === "m" ? "matview" : "table", hasOrgColumn: r.has_org }));
}

export interface FunctionInfo {
  oid: number;
  name: string;
  signature: string;
  securityDefiner: boolean;
  args: Array<{ name: string; type: string; typtype: string; enumFirst: string | null }>;
  returnsTrigger: boolean;
}

export async function listFunctions(c: Client): Promise<FunctionInfo[]> {
  const { rows } = await c.query<{
    oid: number;
    name: string;
    signature: string;
    prosecdef: boolean;
    returns_trigger: boolean;
    args: Array<{ name: string; type: string; typtype: string; enum_first: string | null }> | null;
  }>(`
    select p.oid::int as oid, p.proname as name, p.oid::regprocedure::text as signature, p.prosecdef,
      p.prorettype = 'trigger'::regtype as returns_trigger,
      (select json_agg(json_build_object(
          'name', coalesce(p.proargnames[i], 'arg' || i),
          'type', format_type(p.proargtypes[i - 1], null),
          'typtype', t.typtype,
          'enum_first', (select e.enumlabel from pg_enum e where e.enumtypid = t.oid order by e.enumsortorder limit 1)
        ) order by i)
       from generate_series(1, p.pronargs) as i
       join pg_type t on t.oid = p.proargtypes[i - 1]) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.proname`);
  return rows.map((r) => ({
    oid: r.oid,
    name: r.name,
    signature: r.signature,
    securityDefiner: r.prosecdef,
    returnsTrigger: r.returns_trigger,
    args: (r.args ?? []).map((a) => ({ name: a.name, type: a.type, typtype: a.typtype, enumFirst: a.enum_first })),
  }));
}

/** Identifiants des objets d'une organisation de test (une ligne dans chaque table métier). */
export interface OrgFixture {
  orgId: string;
  ownerId: string;
  name: string;
  ids: Record<string, string>;
}

/**
 * Crée une organisation complète : au moins une ligne dans chaque table métier.
 * Exécuté en superuser (comme le ferait le serveur), mais les triggers d'intégrité
 * (références même organisation) s'appliquent.
 */
export async function seedFullOrg(c: Client, ownerEmail: string, name: string, slug: string): Promise<OrgFixture> {
  const ownerId = await createUser(c, ownerEmail);
  const orgId = await createOrgAs(c, ownerId, name, slug);
  await asSuperuser(c);
  const ids: Record<string, string> = {};
  const one = async (key: string, sql: string, params: unknown[]): Promise<string> => {
    const { rows } = await c.query<{ id: string }>(sql, params);
    ids[key] = rows[0]!.id;
    return rows[0]!.id;
  };
  const tag = slug.toUpperCase();

  const product = await one("products", "insert into public.products (organization_id, name, brand) values ($1, $2, 'Apple') returning id", [orgId, `iPhone 13 ${tag}`]);
  const variant = await one("product_variants", "insert into public.product_variants (organization_id, product_id, name, condition) values ($1, $2, '128 Go', 'refurbished') returning id", [orgId, product]);
  const supplier = await one("suppliers", "insert into public.suppliers (organization_id, name) values ($1, $2) returning id", [orgId, `Fournisseur ${tag}`]);
  const sku = await one(
    "skus",
    "insert into public.skus (organization_id, product_id, variant_id, code, cost_price, sale_price, default_supplier_id) values ($1, $2, $3, $4, 200, 300, $5) returning id",
    [orgId, product, variant, `SKU-${tag}`, supplier],
  );
  await one("inventory", "update public.inventory set quantity_on_hand = 5 where sku_id = $1 returning sku_id as id", [sku]);
  await one("inventory_movements", "insert into public.inventory_movements (organization_id, sku_id, type, quantity, quantity_after) values ($1, $2, 'initial', 5, 5) returning id", [orgId, sku]);
  await one("price_history", "select id from public.price_history where sku_id = $1 limit 1", [sku]);
  const channel = await one("sales_channels", "insert into public.sales_channels (organization_id, provider, name) values ($1, 'ebay', $2) returning id", [orgId, `eBay ${tag}`]);
  const connection = await one(
    "channel_connections",
    "insert into public.channel_connections (organization_id, sales_channel_id, provider, status) values ($1, $2, 'ebay', 'connected') returning id",
    [orgId, channel],
  );
  await one("channel_connection_secrets", "insert into public.channel_connection_secrets (connection_id, access_token_enc) values ($1, 'enc') returning connection_id as id", [connection]);
  await one("oauth_states", "insert into public.oauth_states (state, organization_id, provider, created_by) values ($1, $2, 'ebay', $3) returning state as id", [`state-${slug}`, orgId, ownerId]);
  const listing = await one(
    "channel_listings",
    "insert into public.channel_listings (organization_id, sales_channel_id, connection_id, provider, external_listing_id, title, sku_id, mapping_status, status) values ($1, $2, $3, 'ebay', $4, 'Annonce', $5, 'mapped', 'active') returning id",
    [orgId, channel, connection, `ITEM-${tag}`, sku],
  );
  await one("mapping_suggestions", "insert into public.mapping_suggestions (organization_id, listing_id, sku_id, confidence, method) values ($1, $2, $3, 0.9, 'sku_exact') returning id", [orgId, listing, sku]);
  const order = await one(
    "orders",
    "insert into public.orders (organization_id, sales_channel_id, connection_id, provider, external_order_id, status, placed_at, total) values ($1, $2, $3, 'ebay', $4, 'paid', now(), 300) returning id",
    [orgId, channel, connection, `ORDER-${tag}`],
  );
  await one(
    "order_items",
    "insert into public.order_items (organization_id, order_id, external_line_item_id, external_listing_id, channel_listing_id, sku_id, quantity, unit_price) values ($1, $2, 'L1', $3, $4, $5, 1, 300) returning id",
    [orgId, order, `ITEM-${tag}`, listing, sku],
  );
  const run = await one("sync_runs", "insert into public.sync_runs (organization_id, source_kind, source_ref, provider, trigger, status) values ($1, 'channel', $2, 'ebay', 'manual', 'success') returning id", [orgId, connection]);
  await one("sync_errors", "insert into public.sync_errors (organization_id, sync_run_id, code, message) values ($1, $2, 'E', 'erreur') returning id", [orgId, run]);
  await one(
    "webhook_events",
    "insert into public.webhook_events (provider, event_id, event_type, organization_id, connection_id, payload_hash) values ('ebay', $1, 'ORDER', $2, $3, 'h') returning id",
    [`EVT-${tag}`, orgId, connection],
  );
  const source = await one(
    "supplier_sources",
    "insert into public.supplier_sources (organization_id, supplier_id, name, source_type, status) values ($1, $2, 'Saisie', 'MANUAL', 'active') returning id",
    [orgId, supplier],
  );
  const feed = await one("supplier_feeds", "insert into public.supplier_feeds (organization_id, supplier_id, source_id, format) values ($1, $2, $3, 'csv') returning id", [orgId, supplier, source]);
  const sconn = await one(
    "supplier_connections",
    "insert into public.supplier_connections (organization_id, supplier_id, source_id, connector_key) values ($1, $2, $3, 'partner_feed') returning id",
    [orgId, supplier, source],
  );
  await one("supplier_connection_secrets", "insert into public.supplier_connection_secrets (connection_id, credentials_enc) values ($1, 'enc') returning connection_id as id", [sconn]);
  const sprod = await one(
    "sourcing_products",
    "insert into public.sourcing_products (organization_id, normalized_key, title_display, sku_id) values ($1, $2, 'iPhone 13 128 Go', $3) returning id",
    [orgId, `apple|iphone 13|${slug}`, sku],
  );
  const offer = await one(
    "sourcing_offers",
    `insert into public.sourcing_offers (organization_id, supplier_id, source_id, feed_id, source_type, external_offer_id, title_original, original_price, original_currency, normalized_price, normalized_currency, available_quantity, stock_status, normalized_product_id, sku_id)
     values ($1, $2, $3, $4, 'MANUAL', $5, 'iPhone 13 128 Go', 180, 'EUR', 180, 'EUR', 10, 'in_stock', $6, $7) returning id`,
    [orgId, supplier, source, feed, `OFFER-${tag}`, sprod, sku],
  );
  await one("supplier_price_history", "select id from public.supplier_price_history where offer_id = $1 limit 1", [offer]);
  await one("supplier_stock_history", "select id from public.supplier_stock_history where offer_id = $1 limit 1", [offer]);
  await one(
    "product_matches",
    "insert into public.product_matches (organization_id, offer_id, sourcing_product_id, sku_id, confidence, method, status) values ($1, $2, $3, $4, 0.95, 'ean', 'suggested') returning id",
    [orgId, offer, sprod, sku],
  );
  await one("sourcing_searches", "insert into public.sourcing_searches (organization_id, user_id, query_text) values ($1, $2, 'iphone 13') returning id", [orgId, ownerId]);
  const alert = await one("sourcing_alerts", "insert into public.sourcing_alerts (organization_id, user_id, name, query_text, sku_id) values ($1, $2, 'Alerte', 'iphone 13', $3) returning id", [orgId, ownerId, sku]);
  await one(
    "sourcing_alert_events",
    "insert into public.sourcing_alert_events (organization_id, alert_id, offer_id, kind, message) values ($1, $2, $3, 'new_offer', 'Nouvelle offre') returning id",
    [orgId, alert, offer],
  );
  const po = await one("purchase_orders", "insert into public.purchase_orders (organization_id, supplier_id, reference, status) values ($1, $2, $3, 'sent') returning id", [orgId, supplier, `PO-${tag}`]);
  await one(
    "purchase_order_items",
    "insert into public.purchase_order_items (organization_id, purchase_order_id, sku_id, offer_id, quantity_ordered, unit_cost) values ($1, $2, $3, $4, 3, 180) returning id",
    [orgId, po, sku, offer],
  );
  await one("alerts", "insert into public.alerts (organization_id, type, title, message, dedupe_key) values ($1, 'negative_stock', 'Alerte', 'Message', 'k') returning id", [orgId]);
  await one(
    "replenishment_recommendations",
    "insert into public.replenishment_recommendations (organization_id, sku_id, current_stock, explanation, supplier_id, offer_id, purchase_order_id) values ($1, $2, 5, 'Explication', $3, $4, $5) returning id",
    [orgId, sku, supplier, offer, po],
  );
  await one("sourcing_saved_offers", "insert into public.sourcing_saved_offers (organization_id, offer_id, price_at_save, currency_at_save) values ($1, $2, 180, 'EUR') returning id", [orgId, offer]);
  await one("ai_usage_events", "insert into public.ai_usage_events (organization_id, user_id, kind) values ($1, $2, 'assistant') returning id", [orgId, ownerId]);
  await one("organization_invitations", "insert into public.organization_invitations (organization_id, email, role) values ($1, $2, 'member') returning id", [orgId, `invite-${slug}@example.test`]);
  ids["organizations"] = orgId;
  ids["organization_members"] = ownerId;
  ids["user_profiles"] = ownerId;
  const manual = await c.query<{ id: string }>("select id from public.sales_channels where organization_id = $1 and provider = 'manual'", [orgId]);
  ids["manual_channel"] = manual.rows[0]!.id;
  return { orgId, ownerId, name, ids };
}

/** Ajoute un membre avec un rôle donné (comme le ferait accept_invitation). */
export async function addMember(c: Client, orgId: string, email: string, role: "owner" | "admin" | "member" | "viewer"): Promise<string> {
  const userId = await createUser(c, email);
  await asService(c);
  await c.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, $3)", [orgId, userId, role]);
  await asSuperuser(c);
  return userId;
}

/**
 * Empreinte de toutes les données d'une organisation (toutes les tables énumérées,
 * plus l'organisation, ses membres, invitations et secrets rattachés). Sert à prouver
 * qu'un appel n'a RIEN modifié.
 */
export async function orgSnapshot(c: Client, orgId: string): Promise<Record<string, string>> {
  await asSuperuser(c);
  const out: Record<string, string> = {};
  for (const rel of await listRelations(c)) {
    if (rel.kind !== "table" || !rel.hasOrgColumn) continue;
    const { rows } = await c.query<{ h: string | null; n: number }>(
      `select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h, count(*)::int as n from public.${quoteIdent(rel.name)} t where organization_id = $1`,
      [orgId],
    );
    out[rel.name] = `${rows[0]!.n}:${rows[0]!.h}`;
  }
  const org = await c.query("select o::text as t from public.organizations o where id = $1", [orgId]);
  out["organizations"] = org.rows[0]?.t ?? "";
  const ccs = await c.query(
    "select md5(coalesce(string_agg(s::text, '|' order by s::text), '')) as h from public.channel_connection_secrets s join public.channel_connections cc on cc.id = s.connection_id where cc.organization_id = $1",
    [orgId],
  );
  out["channel_connection_secrets"] = ccs.rows[0]!.h;
  const scs = await c.query(
    "select md5(coalesce(string_agg(s::text, '|' order by s::text), '')) as h from public.supplier_connection_secrets s join public.supplier_connections sc on sc.id = s.connection_id where sc.organization_id = $1",
    [orgId],
  );
  out["supplier_connection_secrets"] = scs.rows[0]!.h;
  const profiles = await c.query(
    "select md5(coalesce(string_agg(p::text, '|' order by p::text), '')) as h from public.user_profiles p where p.user_id in (select user_id from public.organization_members where organization_id = $1)",
    [orgId],
  );
  out["user_profiles"] = profiles.rows[0]!.h;
  return out;
}

/** Tous les identifiants (uuid) des lignes d'une organisation : sert à détecter une fuite dans un résultat. */
export async function orgRowIds(c: Client, orgId: string): Promise<Set<string>> {
  await asSuperuser(c);
  const ids = new Set<string>([orgId]);
  for (const rel of await listRelations(c)) {
    if (rel.kind !== "table" || !rel.hasOrgColumn) continue;
    const hasId = await c.query("select 1 from pg_attribute where attrelid = $1::regclass and attname = 'id' and not attisdropped", [`public.${rel.name}`]);
    if (hasId.rowCount === 0) continue;
    const { rows } = await c.query<{ id: string }>(`select id::text as id from public.${quoteIdent(rel.name)} where organization_id = $1`, [orgId]);
    for (const r of rows) ids.add(r.id);
  }
  return ids;
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Construit des arguments pour appeler une fonction avec les identifiants de l'organisation
 * cible : chaque paramètre uuid reçoit l'objet de même nature (p_sku_id → SKU, p_listing_id →
 * annonce…) ; à défaut, l'id de l'organisation. Les jsonb reçoivent des charges plausibles
 * référençant la cible.
 */
export function buildArgs(fn: FunctionInfo, target: OrgFixture, extra: { userId?: string } = {}): { sql: string; params: unknown[] } | null {
  const params: unknown[] = [];
  const parts: string[] = [];
  const idFor = (argName: string): string => {
    const n = argName.replace(/^p_/, "").replace(/_id$/, "");
    const map: Record<string, string | undefined> = {
      organization: target.orgId,
      org: target.orgId,
      sku: target.ids["skus"],
      listing: target.ids["channel_listings"],
      channel_listing: target.ids["channel_listings"],
      purchase_order: target.ids["purchase_orders"],
      sales_channel: target.ids["sales_channels"],
      channel: target.ids["sales_channels"],
      connection: target.ids["channel_connections"],
      product: target.ids["products"],
      variant: target.ids["product_variants"],
      offer: target.ids["sourcing_offers"],
      supplier: target.ids["suppliers"],
      source: target.ids["supplier_sources"],
      feed: target.ids["supplier_feeds"],
      order: target.ids["orders"],
      alert: target.ids["sourcing_alerts"],
      match: target.ids["product_matches"],
      user: extra.userId ?? target.ownerId,
      sourcing_product: target.ids["sourcing_products"],
      recommendation: target.ids["replenishment_recommendations"],
      run: target.ids["sync_runs"],
      sync_run: target.ids["sync_runs"],
    };
    return map[n] ?? target.orgId;
  };
  for (const a of fn.args) {
    const i = params.length + 1;
    const t = a.type;
    if (t === "uuid") {
      params.push(idFor(a.name));
      parts.push(`$${i}::uuid`);
    } else if (t === "uuid[]") {
      params.push([target.ids["skus"], target.ids["sourcing_offers"], target.orgId]);
      parts.push(`$${i}::uuid[]`);
    } else if (t === "jsonb" || t === "json") {
      params.push(JSON.stringify(jsonFor(a.name, target)));
      parts.push(`$${i}::${t}`);
    } else if (t === "text" || t === "character varying" || t === "character") {
      params.push(a.name.includes("token") ? "token-inconnu" : a.name.includes("currency") ? "EUR" : "x");
      parts.push(`$${i}::text`);
    } else if (t === "integer" || t === "bigint" || t === "smallint" || t === "numeric" || t === "double precision" || t === "real") {
      params.push(1);
      parts.push(`$${i}::${t}`);
    } else if (t === "boolean") {
      params.push(false);
      parts.push(`$${i}::boolean`);
    } else if (t.startsWith("timestamp") || t === "date") {
      params.push(new Date().toISOString());
      parts.push(`$${i}::${t}`);
    } else if (a.typtype === "e" && a.enumFirst !== null) {
      params.push(a.enumFirst);
      parts.push(`$${i}::${t}`);
    } else if (t === "text[]") {
      params.push(["x"]);
      parts.push(`$${i}::text[]`);
    } else {
      // Type non géré (regclass, composite…) : on passe NULL typé.
      parts.push(`null::${t}`);
    }
  }
  return { sql: `select public.${quoteIdent(fn.name)}(${parts.join(", ")})::text as r`, params };
}

function jsonFor(argName: string, target: OrgFixture): unknown {
  const n = argName.replace(/^p_/, "");
  if (n === "receipts") return [{ item_id: target.ids["purchase_order_items"], quantity: 1 }];
  if (n === "items" || n.endsWith("_items") || n.endsWith("s")) {
    return [
      { item_id: target.ids["purchase_order_items"], quantity: 1, sku_id: target.ids["skus"], offer_id: target.ids["sourcing_offers"], external_line_item_id: "X1", external_listing_id: "ITEM-X", title: "x" },
    ];
  }
  if (n === "order") return { external_order_id: "INTRUSION-1", status: "paid", placed_at: new Date().toISOString() };
  if (n === "sku") return { code: "INTRUSION", default_supplier_id: target.ids["suppliers"] };
  if (n === "product") return { name: "Intrusion" };
  if (n === "variant") return { name: "Intrusion" };
  return {
    organization_id: target.orgId,
    sku_id: target.ids["skus"],
    offer_id: target.ids["sourcing_offers"],
    supplier_id: target.ids["suppliers"],
    listing_id: target.ids["channel_listings"],
    purchase_order_id: target.ids["purchase_orders"],
  };
}

/** Exécute une requête dans un savepoint ; renvoie le résultat ou le message d'erreur. */
export async function trySql(c: Client, sql: string, params: unknown[] = []): Promise<{ ok: true; rows: Array<Record<string, unknown>>; rowCount: number } | { ok: false; error: string }> {
  await c.query("savepoint try_sql");
  try {
    const r = await c.query(sql, params);
    await c.query("release savepoint try_sql");
    return { ok: true, rows: r.rows, rowCount: r.rowCount ?? 0 };
  } catch (e) {
    await c.query("rollback to savepoint try_sql");
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Repositionne l'identité courante (les savepoints n'annulent pas set_config local). */
export async function as(c: Client, who: string | "anon" | "service"): Promise<void> {
  if (who === "service") return asService(c);
  if (who === "anon") {
    await c.query("select set_config('role', 'anon', true)");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    return;
  }
  return asUser(c, who);
}
