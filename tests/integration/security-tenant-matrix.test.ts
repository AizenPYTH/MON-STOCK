/**
 * Matrice d'isolation multi-tenant GÉNÉRÉE : pour chaque table et vue énumérée depuis
 * pg_catalog, un membre de l'organisation A ne peut ni lire, ni insérer, ni modifier,
 * ni supprimer les lignes de l'organisation B ; anon et un compte sans organisation ne
 * lisent rien ; chaque fonction SECURITY DEFINER appelée avec les identifiants de B
 * échoue ou n'a aucun effet (et ne divulgue aucun identifiant de B).
 */
import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asSuperuser, canConnect, createUser, withRollback } from "./helpers";
import {
  as,
  buildArgs,
  GLOBAL_READ_TABLES,
  listFunctions,
  listRelations,
  orgRowIds,
  orgSnapshot,
  quoteIdent,
  SERVICE_ROLE_ONLY_TABLES,
  seedFullOrg,
  trySql,
  type OrgFixture,
} from "./security-fixtures";

const available = await canConnect();
const d = available ? describe : describe.skip;

// Refus attendus : RLS, privilèges, garde-fous d'intégrité (y compris ceux des triggers métier qui
// ne « trouvent » pas l'objet parent d'un autre tenant, ex. PURCHASE_ORDER_NOT_FOUND).
const DENIED = /row-level security|permission denied|CROSS_ORGANIZATION_REFERENCE|ORGANIZATION_IMMUTABLE|_NOT_FOUND/;

/**
 * Fuites connues, signalées au propriétaire du code (migration 20261008002000_stock_po_integrity.sql,
 * hors périmètre de cet audit) : la liste doit être VIDÉE dès la correction — le test échoue aussi
 * si une fuite disparaît sans mise à jour de la liste, ou si une nouvelle apparaît.
 */
const KNOWN_VALUE_LEAKS: string[] = [];

/** Fonctions non déterministes par nature (créent un objet neuf à chaque appel) : comparaison sans objet. */
const NON_DETERMINISTIC = new Set(["create_organization_with_owner"]);

interface World {
  a: OrgFixture;
  b: OrgFixture;
}

async function world(c: Client): Promise<World> {
  const a = await seedFullOrg(c, "alice@tenant-a.test", "Org A", "tenant-a");
  const b = await seedFullOrg(c, "bob@tenant-b.test", "Org B", "tenant-b");
  return { a, b };
}

/** Colonnes insérables (hors colonnes générées) d'une table. */
async function insertableColumns(c: Client, table: string): Promise<string[]> {
  const { rows } = await c.query<{ attname: string }>(
    "select attname from pg_attribute where attrelid = $1::regclass and attnum > 0 and not attisdropped and attgenerated = '' order by attnum",
    [`public.${table}`],
  );
  return rows.map((r) => r.attname);
}

d("Matrice d'isolation multi-tenant (générée)", () => {
  it("les fixtures couvrent chaque table métier (une ligne par organisation)", async () => {
    await withRollback(async (c) => {
      const { a, b } = await world(c);
      await asSuperuser(c);
      const missing: string[] = [];
      for (const rel of await listRelations(c)) {
        if (rel.kind !== "table" || !rel.hasOrgColumn) continue;
        for (const org of [a, b]) {
          const { rows } = await c.query<{ n: number }>(`select count(*)::int as n from public.${quoteIdent(rel.name)} where organization_id = $1`, [org.orgId]);
          if (rows[0]!.n === 0) missing.push(`${rel.name} (${org.name})`);
        }
      }
      expect(missing, "ajoutez une ligne dans seedFullOrg (tests/integration/security-fixtures.ts)").toEqual([]);
    });
  });

  it("SELECT : A ne voit aucune ligne de B, dans aucune table ni vue", async () => {
    await withRollback(async (c) => {
      const { a, b } = await world(c);
      const rels = await listRelations(c);
      await as(c, a.ownerId);
      const leaks: string[] = [];
      for (const rel of rels) {
        if (SERVICE_ROLE_ONLY_TABLES.includes(rel.name as (typeof SERVICE_ROLE_ONLY_TABLES)[number])) {
          const r = await trySql(c, `select * from public.${quoteIdent(rel.name)}`);
          if (r.ok) leaks.push(`${rel.name}: lisible (${r.rowCount} lignes)`);
          continue;
        }
        if (rel.hasOrgColumn) {
          const r = await trySql(c, `select count(*)::int as n from public.${quoteIdent(rel.name)} where organization_id = $1`, [b.orgId]);
          if (!r.ok) leaks.push(`${rel.name}: erreur inattendue ${r.error}`);
          else if ((r.rows[0] as { n: number }).n !== 0) leaks.push(`${rel.name}: ${(r.rows[0] as { n: number }).n} ligne(s) de B visibles`);
          const own = await trySql(c, `select count(*)::int as n from public.${quoteIdent(rel.name)} where organization_id is distinct from $1`, [a.orgId]);
          if (own.ok && (own.rows[0] as { n: number }).n !== 0) leaks.push(`${rel.name}: lignes hors organisation A visibles`);
        }
      }
      // Tables sans organization_id
      const orgs = await c.query("select id from public.organizations");
      expect(orgs.rows.map((r) => r.id)).toEqual([a.orgId]);
      const profiles = await c.query("select user_id from public.user_profiles");
      expect(profiles.rows.map((r) => r.user_id)).toEqual([a.ownerId]);
      // Les vues sans organization_id doivent être traitées explicitement ici.
      const viewsWithoutOrg = rels.filter((r) => r.kind !== "table" && !r.hasOrgColumn).map((r) => r.name);
      expect(viewsWithoutOrg, "vue sans organization_id : ajoutez un contrôle dédié").toEqual([]);
      expect(leaks).toEqual([]);
    });
  });

  it("INSERT : A ne peut insérer aucune ligne dans B (copie d'une ligne réelle de B)", async () => {
    await withRollback(async (c) => {
      const { a, b } = await world(c);
      const rels = (await listRelations(c)).filter((r) => r.kind === "table" && r.hasOrgColumn);
      const accepted: string[] = [];
      for (const rel of rels) {
        await asSuperuser(c);
        const cols = await insertableColumns(c, rel.name);
        const { rows } = await c.query<{ j: Record<string, unknown> }>(`select to_jsonb(t) as j from public.${quoteIdent(rel.name)} t where organization_id = $1 limit 1`, [b.orgId]);
        if (rows.length === 0) continue;
        const row = { ...rows[0]!.j };
        if ("id" in row) row["id"] = (await c.query("select gen_random_uuid() as u")).rows[0].u;
        const colList = cols.map(quoteIdent).join(", ");
        await as(c, a.ownerId);
        const r = await trySql(
          c,
          `insert into public.${quoteIdent(rel.name)} (${colList}) select ${colList} from jsonb_populate_record(null::public.${quoteIdent(rel.name)}, $1::jsonb)`,
          [JSON.stringify(row)],
        );
        if (r.ok) accepted.push(rel.name);
        else if (!DENIED.test(r.error)) accepted.push(`${rel.name} (erreur inattendue : ${r.error})`);
      }
      expect(accepted).toEqual([]);
    });
  });

  it("UPDATE / DELETE : A ne modifie ni ne supprime aucune ligne de B", async () => {
    await withRollback(async (c) => {
      const { a, b } = await world(c);
      const before = await orgSnapshot(c, b.orgId);
      const rels = (await listRelations(c)).filter((r) => r.kind === "table");
      await as(c, a.ownerId);
      const problems: string[] = [];
      for (const rel of rels) {
        const where = rel.hasOrgColumn ? "organization_id = $1" : rel.name === "organizations" ? "id = $1" : rel.name === "user_profiles" ? "user_id = $1" : null;
        if (where === null) continue;
        const params = rel.name === "user_profiles" ? [b.ownerId] : [b.orgId];
        // UPDATE no-op sur une colonne autorisée : on cherche seulement si une ligne de B est atteignable.
        const setCol = rel.name === "organization_members" ? "role = role" : rel.name === "organizations" ? "name = name" : rel.name === "user_profiles" ? "full_name = full_name" : "organization_id = organization_id";
        const upd = await trySql(c, `update public.${quoteIdent(rel.name)} set ${setCol} where ${where}`, params);
        if (upd.ok && upd.rowCount > 0) problems.push(`${rel.name}: UPDATE a touché ${upd.rowCount} ligne(s) de B`);
        if (!upd.ok && !DENIED.test(upd.error)) problems.push(`${rel.name}: UPDATE erreur inattendue ${upd.error}`);
        const del = await trySql(c, `delete from public.${quoteIdent(rel.name)} where ${where}`, params);
        if (del.ok && del.rowCount > 0) problems.push(`${rel.name}: DELETE a supprimé ${del.rowCount} ligne(s) de B`);
        if (!del.ok && !DENIED.test(del.error)) problems.push(`${rel.name}: DELETE erreur inattendue ${del.error}`);
      }
      // Tables de secrets (sans organization_id) : aucun accès.
      for (const t of ["channel_connection_secrets", "supplier_connection_secrets"]) {
        const r = await trySql(c, `delete from public.${t}`);
        if (r.ok) problems.push(`${t}: DELETE autorisé`);
      }
      expect(problems).toEqual([]);
      expect(await orgSnapshot(c, b.orgId)).toEqual(before);
    });
  });

  it("anon ne lit, n'écrit et n'exécute rien", async () => {
    await withRollback(async (c) => {
      const { a } = await world(c);
      const rels = await listRelations(c);
      const fns = (await listFunctions(c)).filter((f) => !f.returnsTrigger);
      await as(c, "anon");
      const problems: string[] = [];
      for (const rel of rels) {
        const r = await trySql(c, `select * from public.${quoteIdent(rel.name)} limit 1`);
        if (r.ok) problems.push(`${rel.name}: SELECT autorisé à anon (${r.rowCount} ligne(s))`);
        if (rel.kind === "table") {
          const del = await trySql(c, `delete from public.${quoteIdent(rel.name)}`);
          if (del.ok) problems.push(`${rel.name}: DELETE autorisé à anon`);
        }
      }
      for (const f of fns) {
        const call = buildArgs(f, a);
        if (!call) continue;
        const r = await trySql(c, call.sql, call.params);
        if (r.ok || !/permission denied/.test(r.error)) problems.push(`${f.signature}: exécutable par anon (${r.ok ? "succès" : r.error})`);
      }
      expect(problems).toEqual([]);
    });
  });

  it("un utilisateur authentifié sans organisation ne lit rien (hors référentiels globaux et son profil)", async () => {
    await withRollback(async (c) => {
      await world(c);
      const loner = await createUser(c, "loner@example.test");
      const rels = await listRelations(c);
      await as(c, loner);
      const problems: string[] = [];
      for (const rel of rels) {
        if (GLOBAL_READ_TABLES.includes(rel.name as (typeof GLOBAL_READ_TABLES)[number])) continue;
        const r = await trySql(c, `select count(*)::int as n from public.${quoteIdent(rel.name)}${rel.name === "user_profiles" ? " where user_id <> $1" : ""}`, rel.name === "user_profiles" ? [loner] : []);
        if (r.ok && (r.rows[0] as { n: number }).n > 0) problems.push(`${rel.name}: ${(r.rows[0] as { n: number }).n} ligne(s) visibles`);
        if (!r.ok && !/permission denied/.test(r.error)) problems.push(`${rel.name}: erreur inattendue ${r.error}`);
      }
      expect(problems).toEqual([]);
    });
  });

  it("chaque fonction SECURITY DEFINER appelée par A avec les identifiants de B échoue ou n'a aucun effet, sans rien divulguer", async () => {
    await withRollback(async (c) => {
      const { a, b } = await world(c);
      const fns = (await listFunctions(c)).filter((f) => f.securityDefiner && !f.returnsTrigger);
      expect(fns.length).toBeGreaterThan(5);
      const before = await orgSnapshot(c, b.orgId);
      const bIds = await orgRowIds(c, b.orgId);
      const problems: string[] = [];
      const refused: string[] = [];
      const valueLeaks: string[] = [];
      for (const f of fns) {
        const call = buildArgs(f, b, { userId: b.ownerId });
        if (!call) continue;
        await as(c, a.ownerId);
        const r = await trySql(c, call.sql, call.params);
        if (!r.ok) {
          refused.push(f.name);
          continue;
        }
        const text = String((r.rows[0] as { r: unknown }).r ?? "");
        for (const id of bIds) if (text.includes(id) && !call.params.includes(id)) problems.push(`${f.signature}: renvoie l'identifiant ${id} de B`);
        if (text.includes(b.name)) problems.push(`${f.signature}: renvoie le nom de B`);
        const after = await orgSnapshot(c, b.orgId);
        for (const [k, v] of Object.entries(before)) if (after[k] !== v) problems.push(`${f.signature}: a modifié ${k} de B`);
        // Fuite par la VALEUR (total, booléen, compteur…) : le résultat ne doit pas dépendre des données de B.
        // On rejoue l'appel après avoir supprimé l'organisation B (dans un savepoint annulé ensuite).
        await asSuperuser(c);
        await c.query("savepoint without_b");
        await c.query("delete from public.organizations where id = $1", [b.orgId]);
        await as(c, a.ownerId);
        const again = await trySql(c, call.sql, call.params);
        await asSuperuser(c);
        await c.query("rollback to savepoint without_b");
        const textWithoutB = again.ok ? String((again.rows[0] as { r: unknown }).r ?? "") : `erreur`;
        if (textWithoutB !== text && !NON_DETERMINISTIC.has(f.name)) valueLeaks.push(f.name);
      }
      expect(problems).toEqual([]);
      expect(valueLeaks.sort(), "fonctions dont le résultat dépend des données d'une autre organisation").toEqual([...KNOWN_VALUE_LEAKS].sort());
      // Les RPC métier doivent explicitement refuser (pas seulement ne rien faire).
      for (const name of ["apply_inventory_movement", "adjust_reserved_quantity", "create_sku", "map_listing_to_sku", "apply_pending_sales_for_sku", "receive_purchase_order_items", "ingest_external_order"]) {
        if (fns.some((f) => f.name === name)) expect(refused, name).toContain(name);
      }
    });
  });

  it("RPC métier : refus explicites sur les identifiants d'une autre organisation", async () => {
    await withRollback(async (c) => {
      const { a, b } = await world(c);
      await as(c, a.ownerId);
      const cases: Array<[string, unknown[], RegExp]> = [
        ["select public.apply_inventory_movement($1, $2, 'receipt', 1)", [b.orgId, b.ids["skus"]], /FORBIDDEN/],
        ["select public.apply_inventory_movement($1, $2, 'receipt', 1)", [a.orgId, b.ids["skus"]], /SKU_NOT_FOUND/],
        ["select public.adjust_reserved_quantity($1, $2, 1)", [b.orgId, b.ids["skus"]], /FORBIDDEN/],
        ["select public.adjust_reserved_quantity($1, $2, 1)", [a.orgId, b.ids["skus"]], /SKU_NOT_FOUND/],
        ["select public.create_sku($1, '{}'::jsonb, '{\"code\":\"X\"}'::jsonb, null, '{\"name\":\"X\"}'::jsonb, 0)", [b.orgId], /FORBIDDEN/],
        ["select public.create_sku($1, '{}'::jsonb, '{\"code\":\"X\"}'::jsonb, $2, null, 0)", [a.orgId, b.ids["products"]], /PRODUCT_NOT_FOUND/],
        ["select public.create_sku($1, '{}'::jsonb, jsonb_build_object('code', 'X', 'default_supplier_id', $2::text), null, '{\"name\":\"X\"}'::jsonb, 0)", [a.orgId, b.ids["suppliers"]], /CROSS_ORGANIZATION_REFERENCE/],
        ["select public.map_listing_to_sku($1, $2)", [b.ids["channel_listings"], a.ids["skus"]], /FORBIDDEN/],
        ["select public.map_listing_to_sku($1, $2)", [a.ids["channel_listings"], b.ids["skus"]], /SKU_NOT_FOUND/],
        ["select public.apply_pending_sales_for_sku($1)", [b.ids["skus"]], /FORBIDDEN/],
        ["select public.receive_purchase_order_items($1, '[]'::jsonb)", [b.ids["purchase_orders"]], /FORBIDDEN/],
        ["select public.receive_purchase_order_items($1, jsonb_build_array(jsonb_build_object('item_id', $2::text, 'quantity', 1)))", [a.ids["purchase_orders"], b.ids["purchase_order_items"]], /PURCHASE_ORDER_ITEM_NOT_FOUND/],
        ["select public.ingest_external_order($1, $2, null, 'ebay', '{\"external_order_id\":\"Z\"}'::jsonb, '[]'::jsonb)", [b.orgId, b.ids["sales_channels"]], /FORBIDDEN|permission denied for function ingest_external_order/],
        ["select public.ingest_external_order($1, $2, null, 'ebay', '{\"external_order_id\":\"Z\"}'::jsonb, '[]'::jsonb)", [a.orgId, b.ids["sales_channels"]], /CHANNEL_NOT_FOUND|CROSS_ORGANIZATION_REFERENCE|permission denied for function ingest_external_order/],
        ["select public.ingest_external_order($1, $2, $3, 'ebay', '{\"external_order_id\":\"Z\"}'::jsonb, '[]'::jsonb)", [a.orgId, a.ids["sales_channels"], b.ids["channel_connections"]], /CONNECTION_NOT_FOUND|CROSS_ORGANIZATION_REFERENCE|permission denied for function ingest_external_order/],
      ];
      const problems: string[] = [];
      for (const [sql, params, pattern] of cases) {
        const r = await trySql(c, sql, params);
        if (r.ok) problems.push(`${sql} : accepté`);
        else if (!pattern.test(r.error)) problems.push(`${sql} : erreur inattendue ${r.error}`);
      }
      expect(problems).toEqual([]);
    });
  });

  it("références croisées : aucune ligne de A ne peut pointer vers un objet de B (toutes les clés étrangères énumérées)", async () => {
    await withRollback(async (c) => {
      const { a, b } = await world(c);
      await asSuperuser(c);
      const { rows: fks } = await c.query<{ tbl: string; col: string; ref: string }>(`
        select c.conrelid::regclass::text as tbl, a.attname as col, c.confrelid::regclass::text as ref
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
          and c.confrelid <> 'public.organizations'::regclass
          and exists (select 1 from pg_attribute x where x.attrelid = c.conrelid and x.attname = 'organization_id' and not x.attisdropped)
          and exists (select 1 from pg_attribute x where x.attrelid = c.confrelid and x.attname = 'organization_id' and not x.attisdropped)
        order by 1, 2`);
      expect(fks.length).toBeGreaterThan(30);
      const problems: string[] = [];
      const strip = (s: string) => s.replace(/^public\./, "");
      for (const fk of fks) {
        const tbl = strip(fk.tbl);
        const ref = strip(fk.ref);
        const target = ref === "inventory" ? b.ids["skus"] : b.ids[ref];
        if (!target) {
          problems.push(`${tbl}.${fk.col}: aucune fixture pour ${ref}`);
          continue;
        }
        const keyCol = tbl === "inventory" ? "sku_id" : "id";
        const rowId = tbl === "inventory" ? a.ids["skus"] : a.ids[tbl];
        if (!rowId) {
          problems.push(`${tbl}: aucune fixture`);
          continue;
        }
        // En service_role (la RLS ne protège plus) : l'intégrité doit être garantie par la base elle-même.
        await as(c, "service");
        const r = await trySql(c, `update public.${quoteIdent(tbl)} set ${quoteIdent(fk.col)} = $1 where ${keyCol} = $2`, [target, rowId]);
        if (r.ok) problems.push(`${tbl}.${fk.col} → ${ref} de B accepté`);
        else if (!/CROSS_ORGANIZATION_REFERENCE/.test(r.error)) problems.push(`${tbl}.${fk.col}: erreur inattendue ${r.error}`);
      }
      expect(problems).toEqual([]);
    });
  });

  it("organization_id est immuable : aucune ligne ne peut changer d'organisation (même en service_role)", async () => {
    await withRollback(async (c) => {
      const { a, b } = await world(c);
      const rels = (await listRelations(c)).filter((r) => r.kind === "table" && r.hasOrgColumn);
      await as(c, "service");
      const problems: string[] = [];
      for (const rel of rels) {
        const r = await trySql(c, `update public.${quoteIdent(rel.name)} set organization_id = $1 where organization_id = $2`, [b.orgId, a.orgId]);
        if (r.ok && r.rowCount > 0) problems.push(`${rel.name}: ${r.rowCount} ligne(s) déplacée(s)`);
        else if (!r.ok && !/ORGANIZATION_IMMUTABLE/.test(r.error)) problems.push(`${rel.name}: erreur inattendue ${r.error}`);
      }
      expect(problems).toEqual([]);
      // La suppression d'une organisation reste possible (cascades, SET NULL sur webhook_events).
      await asSuperuser(c);
      await c.query("delete from public.organizations where id = $1", [a.orgId]);
      const left = await c.query("select count(*)::int as n from public.skus where organization_id = $1", [a.orgId]);
      expect(left.rows[0].n).toBe(0);
    });
  });
});
