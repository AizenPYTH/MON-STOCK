/**
 * Remédiation base de données (audit 2026-10-22) : migrations 20261023000300 à 20261023000360.
 * Q-17 (SECURITY DEFINER), D-17 (date des mouvements, journal des réserves), D-18 (vues),
 * D-15 (politiques initplan, user_profiles), D-16 (index), D-09 (attestation des sources),
 * D-08 (limite de création, suppression d'organisation), D-10 (purge), D-21 (journal de stock).
 * Chaque bloc vérifie le comportement attendu ET le refus inter-organisation.
 */
import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asService, asSuperuser, asUser, canConnect, createOrgAs, createSkuAs, createUser, expectQueryError, manualChannelId, withRollback } from "./helpers";

const available = await canConnect();
const d = available ? describe : describe.skip;

async function one<T = Record<string, unknown>>(c: Client, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await c.query(sql, params);
  return rows[0] as T;
}

/** Deux organisations A et B (propriétaires distincts), un SKU avec 5 unités dans chacune. */
async function twoOrgs(c: Client, tag: string) {
  const alice = await createUser(c, `alice-${tag}@remediation.test`);
  const bob = await createUser(c, `bob-${tag}@remediation.test`);
  const orgA = await createOrgAs(c, alice, `Org A ${tag}`, `rem-a-${tag}`);
  const orgB = await createOrgAs(c, bob, `Org B ${tag}`, `rem-b-${tag}`);
  const skuA = await createSkuAs(c, alice, orgA, `A-${tag}`, { initial: 5 });
  const skuB = await createSkuAs(c, bob, orgB, `B-${tag}`, { initial: 5 });
  return { alice, bob, orgA, orgB, skuA, skuB };
}

async function addMember(c: Client, orgId: string, email: string, role: "owner" | "admin" | "member" | "viewer"): Promise<string> {
  const id = await createUser(c, email);
  await asSuperuser(c);
  await c.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, $3)", [orgId, id, role]);
  return id;
}

d("Q-17 : fonctions SECURITY DEFINER", () => {
  it("toutes les fonctions SECURITY DEFINER du schéma public fixent un search_path sans parcours implicite de pg_temp", async () => {
    await withRollback(async (c) => {
      const { rows } = await c.query<{ sig: string; cfg: string | null }>(`
        select p.oid::regprocedure::text as sig, array_to_string(p.proconfig, ',') as cfg
        from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef`);
      // search_path = '' (aucun schéma implicite) ou liste se terminant par pg_temp.
      const bad = rows.filter((r) => !/search_path=("")?$|search_path=.*pg_temp/.test(r.cfg ?? ""));
      expect(bad.map((r) => `${r.sig} [${r.cfg}]`)).toEqual([]);
    });
  });

  it("adjust_reserved_quantity : refusée aux clients ; serveur : bornes, verrou, journal", async () => {
    await withRollback(async (c) => {
      const w = await twoOrgs(c, "res");
      const priv = await one<{ a: boolean; s: boolean }>(c, "select has_function_privilege('authenticated', 'public.adjust_reserved_quantity(uuid, uuid, integer)', 'EXECUTE') as a, has_function_privilege('service_role', 'public.adjust_reserved_quantity(uuid, uuid, integer)', 'EXECUTE') as s");
      expect(priv).toEqual({ a: false, s: true });
      await asUser(c, w.alice);
      await expectQueryError(c, "select public.adjust_reserved_quantity($1, $2, 1)", [w.orgA, w.skuA], "permission denied");

      await asService(c);
      await c.query("select public.adjust_reserved_quantity($1, $2, 3)", [w.orgA, w.skuA]);
      await c.query("select public.adjust_reserved_quantity($1, $2, -10)", [w.orgA, w.skuA]); // clamp à 0 (règle inchangée)
      for (const bad of [null, 0, 1_000_001]) {
        await expectQueryError(c, "select public.adjust_reserved_quantity($1, $2, $3)", [w.orgA, w.skuA, bad], "RESERVATION_DELTA_INVALID");
      }
      // SKU d'une autre organisation : introuvable, rien n'est journalisé.
      await expectQueryError(c, "select public.adjust_reserved_quantity($1, $2, 1)", [w.orgA, w.skuB], "SKU_NOT_FOUND");
      const log = await c.query("select delta, reserved_before, reserved_after from public.inventory_reservation_events where sku_id = $1 order by reserved_before", [w.skuA]);
      expect(log.rows).toEqual([
        { delta: 3, reserved_before: 0, reserved_after: 3 },
        { delta: -10, reserved_before: 3, reserved_after: 0 },
      ]);
      expect((await one<{ n: number }>(c, "select count(*)::int as n from public.inventory_reservation_events where sku_id = $1", [w.skuB])).n).toBe(0);

      // Journal : lisible par les membres de A seulement, jamais écrit par un client.
      await asUser(c, w.bob);
      expect((await c.query("select 1 from public.inventory_reservation_events where organization_id = $1", [w.orgA])).rowCount).toBe(0);
      await expectQueryError(c, "insert into public.inventory_reservation_events (organization_id, sku_id, delta, reserved_before, reserved_after) values ($1, $2, 1, 0, 1)", [w.orgB, w.skuB], "permission denied");
      await asUser(c, w.alice);
      expect((await c.query("select 1 from public.inventory_reservation_events where organization_id = $1", [w.orgA])).rowCount).toBe(2);
    });
  });

  it("les RPC client conservent leur comportement et refusent l'autre organisation", async () => {
    await withRollback(async (c) => {
      const w = await twoOrgs(c, "rpc");
      await asUser(c, w.alice);
      const mv = await one<{ q: number }>(c, "select (public.apply_inventory_movement($1, $2, 'receipt', 2, 'manual', null, 'manual', null, now())).quantity_after as q", [w.orgA, w.skuA]);
      expect(mv.q).toBe(7);
      await expectQueryError(c, "select public.apply_inventory_movement($1, $2, 'receipt', 1)", [w.orgB, w.skuB], "FORBIDDEN");
      await expectQueryError(c, "select public.apply_inventory_movement($1, $2, 'receipt', 1)", [w.orgA, w.skuB], "SKU_NOT_FOUND");
    });
  });
});

d("D-17 : date des mouvements bornée pour les clients", () => {
  it("futur > 10 min ou passé > 7 jours refusés ; petite avance ramenée à now() ; 3 jours accepté", async () => {
    await withRollback(async (c) => {
      const w = await twoOrgs(c, "date");
      await asUser(c, w.alice);
      const call = "select (public.apply_inventory_movement($1, $2, 'receipt', 1, 'manual', null, 'manual', null, $3::timestamptz)).occurred_at as at";
      await expectQueryError(c, call, [w.orgA, w.skuA, new Date(Date.now() + 3_600_000).toISOString()], "MOVEMENT_DATE_OUT_OF_RANGE");
      await expectQueryError(c, call, [w.orgA, w.skuA, new Date(Date.now() - 8 * 86_400_000).toISOString()], "MOVEMENT_DATE_OUT_OF_RANGE");
      const clamped = await one<{ at: Date; now: Date }>(c, `select (${call.replace("select ", "").replace(" as at", "")}) as at, now() as now`, [w.orgA, w.skuA, new Date(Date.now() + 5 * 60_000).toISOString()]);
      expect(new Date(clamped.at).getTime()).toBe(new Date(clamped.now).getTime());
      const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
      const ok = await one<{ at: Date }>(c, call, [w.orgA, w.skuA, past]);
      expect(new Date(ok.at).toISOString()).toBe(past);
      // NULL = maintenant (auparavant : violation NOT NULL).
      const n = await one<{ at: Date | null }>(c, call, [w.orgA, w.skuA, null]);
      expect(n.at).not.toBeNull();
    });
  });

  it("le serveur et les ventes appliquées a posteriori peuvent antidater", async () => {
    await withRollback(async (c) => {
      const w = await twoOrgs(c, "date-srv");
      await asService(c);
      const old = new Date(Date.now() - 95 * 86_400_000).toISOString();
      const r = await one<{ at: Date }>(c, "select (public.apply_inventory_movement($1, $2, 'receipt', 1, 'manual', null, 'manual', null, $3::timestamptz)).occurred_at as at", [w.orgA, w.skuA, old]);
      expect(new Date(r.at).toISOString()).toBe(old);
      // Chemin interne de confiance (drapeau transactionnel posé par apply_pending_sales_for_sku).
      await asSuperuser(c);
      await c.query("select set_config('mon_stock.trusted_movement', 'on', true)");
      await asUser(c, w.alice);
      const t = await one<{ at: Date }>(c, "select (public.apply_inventory_movement($1, $2, 'sale', -1, 'order_item', null, 'ebay', null, $3::timestamptz)).occurred_at as at", [w.orgA, w.skuA, old]);
      expect(new Date(t.at).toISOString()).toBe(old);
      await asSuperuser(c);
      await c.query("select set_config('mon_stock.trusted_movement', '', true)");
    });
  });
});

d("D-18 : vues en lecture seule", () => {
  it("authenticated et anon n'ont plus INSERT/UPDATE/DELETE sur les 5 vues ; SELECT conservé et isolé", async () => {
    await withRollback(async (c) => {
      const { rows } = await c.query<{ v: string; sel: boolean; w: boolean; anon: boolean }>(`
        select v,
          has_table_privilege('authenticated', 'public.' || v, 'SELECT') as sel,
          has_table_privilege('authenticated', 'public.' || v, 'INSERT') or has_table_privilege('authenticated', 'public.' || v, 'UPDATE') or has_table_privilege('authenticated', 'public.' || v, 'DELETE') as w,
          has_table_privilege('anon', 'public.' || v, 'SELECT') or has_table_privilege('anon', 'public.' || v, 'INSERT') as anon
        from unnest(array['v_stock_overview', 'v_daily_sales', 'v_sku_sales_stats', 'v_unmapped_listings', 'supplier_offers']) as v`);
      expect(rows).toHaveLength(5);
      for (const r of rows) expect(r, r.v).toMatchObject({ sel: true, w: false, anon: false });
      const w = await twoOrgs(c, "views");
      await asUser(c, w.alice);
      await expectQueryError(c, "delete from public.supplier_offers", [], "permission denied");
      await expectQueryError(c, "insert into public.supplier_offers (organization_id) values ($1)", [w.orgA], "permission denied");
      const seen = await c.query("select distinct organization_id from public.v_stock_overview");
      expect(seen.rows.map((r) => r.organization_id)).toEqual([w.orgA]);
    });
  });
});

d("D-15 : politiques (select auth.uid()) et user_profiles", () => {
  it("plus aucun auth.uid() évalué par ligne dans les politiques visées ; une seule politique SELECT sur user_profiles", async () => {
    await withRollback(async (c) => {
      const { rows } = await c.query<{ t: string; p: string; e: string }>(`
        select tablename as t, policyname as p, coalesce(qual, '') || ' ' || coalesce(with_check, '') as e
        from pg_policies where schemaname = 'public'
          and tablename in ('advisor_actions', 'advisor_conversations', 'advisor_messages', 'ai_usage_events', 'organization_members', 'user_profiles')
          and policyname <> 'advisor_messages_insert'`);
      expect(rows.length).toBeGreaterThan(10);
      // auth.uid() autorisé uniquement sous la forme ( SELECT auth.uid() AS uid ).
      const bare = rows.filter((r) => r.e.replace(/\(\s*SELECT auth\.uid\(\) AS uid\s*\)/gi, "").includes("auth.uid()"));
      expect(bare.map((r) => `${r.t}.${r.p}`)).toEqual([]);
      const sel = await c.query("select policyname from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and cmd = 'SELECT'");
      expect(sel.rows.map((r) => r.policyname)).toEqual(["user_profiles_select"]);
    });
  });

  it("même visibilité qu'avant : soi-même et co-membres, jamais un inconnu ni un membre d'une autre organisation", async () => {
    await withRollback(async (c) => {
      const w = await twoOrgs(c, "prof");
      const carol = await addMember(c, w.orgA, "carol-prof@remediation.test", "viewer");
      const loner = await createUser(c, "loner-prof@remediation.test");
      await asUser(c, w.alice);
      const seen = (await c.query("select user_id from public.user_profiles")).rows.map((r) => r.user_id).sort();
      expect(seen).toEqual([w.alice, carol].sort());
      await asUser(c, loner);
      expect((await c.query("select user_id from public.user_profiles")).rows.map((r) => r.user_id)).toEqual([loner]);
      // Mise à jour : uniquement son propre profil.
      await asUser(c, w.alice);
      expect((await c.query("update public.user_profiles set full_name = 'X' where user_id = $1", [w.bob])).rowCount).toBe(0);
      expect((await c.query("update public.user_profiles set full_name = 'Alice' where user_id = $1", [w.alice])).rowCount).toBe(1);
    });
  });
});

d("D-16 : index des organization_id", () => {
  it("les clés organization_id signalées par le conseiller sont couvertes par un index", async () => {
    await withRollback(async (c) => {
      const { rows } = await c.query<{ t: string }>(`
        select c.conrelid::regclass::text as t
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1 and a.attname = 'organization_id'
          and c.conrelid::regclass::text = any (array['price_history', 'supplier_price_history', 'supplier_stock_history', 'sync_errors',
            'purchase_order_items', 'mapping_suggestions', 'advisor_messages', 'oauth_states', 'sourcing_import_issues', 'supplier_feed_secrets'])
          and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])`);
      expect(rows.map((r) => r.t)).toEqual([]);
    });
  });
});

d("D-09 : attestation d'accès des sources", () => {
  async function source(c: Client, orgId: string, as: string, confirmed: boolean, text: string | null): Promise<string> {
    await asSuperuser(c);
    const sup = await one<{ id: string }>(c, "insert into public.suppliers (organization_id, name) values ($1, 'Fournisseur') returning id", [orgId]);
    await asUser(c, as);
    const r = await one<{ id: string }>(
      c,
      "insert into public.supplier_sources (organization_id, supplier_id, name, source_type, automated_access_confirmed, access_conditions, access_attested_by, access_attested_at) values ($1, $2, 'Site', 'PUBLIC_WEB', $3, $4, $5, '2000-01-01') returning id",
      // access_attested_by / _at fournis par le client : ignorés (le trigger les pose).
      [orgId, sup.id, confirmed, text, "00000000-0000-0000-0000-000000000000"],
    );
    return r.id;
  }

  it("création : auteur et date posés par trigger (valeurs du client ignorées) ; journal « insert »", async () => {
    await withRollback(async (c) => {
      const w = await twoOrgs(c, "att1");
      const id = await source(c, w.orgA, w.alice, true, "CGU §4 vérifiées");
      await asSuperuser(c);
      const s = await one<{ by: string; at: Date; now: Date }>(c, "select access_attested_by as by, access_attested_at as at, now() as now from public.supplier_sources where id = $1", [id]);
      expect(s.by).toBe(w.alice);
      expect(new Date(s.at).getTime()).toBe(new Date(s.now).getTime());
      const j = await c.query("select automated_access_confirmed, access_conditions, attested_by, origin from public.supplier_source_attestations where source_id = $1", [id]);
      expect(j.rows).toEqual([{ automated_access_confirmed: true, access_conditions: "CGU §4 vérifiées", attested_by: w.alice, origin: "insert" }]);
      // Source sans attestation : rien n'est posé, rien n'est journalisé.
      const plain = await source(c, w.orgA, w.alice, false, null);
      await asSuperuser(c);
      expect(await one(c, "select access_attested_by as by, access_attested_at as at from public.supplier_sources where id = $1", [plain])).toEqual({ by: null, at: null });
      expect((await c.query("select 1 from public.supplier_source_attestations where source_id = $1", [plain])).rowCount).toBe(0);
    });
  });

  it("modification directe de l'attestation refusée au client ; autres colonnes toujours modifiables", async () => {
    await withRollback(async (c) => {
      const w = await twoOrgs(c, "att2");
      const id = await source(c, w.orgA, w.alice, false, null);
      await asUser(c, w.alice);
      for (const col of ["automated_access_confirmed = true", "access_conditions = 'x'", "access_attested_by = null", "access_attested_at = now()"]) {
        await expectQueryError(c, `update public.supplier_sources set ${col} where id = $1`, [id], "permission denied");
      }
      expect((await c.query("update public.supplier_sources set name = 'Renommée', status = 'paused', sync_frequency = 'daily' where id = $1", [id])).rowCount).toBe(1);
      // Le serveur (service_role) garde la main ; l'auteur est alors NULL (serveur), la date posée.
      await asService(c);
      await c.query("update public.supplier_sources set automated_access_confirmed = true, access_conditions = 'Accord serveur' where id = $1", [id]);
      const s = await one<{ by: string | null; at: Date | null }>(c, "select access_attested_by as by, access_attested_at as at from public.supplier_sources where id = $1", [id]);
      expect(s.by).toBeNull();
      expect(s.at).not.toBeNull();
      expect((await one<{ o: string }>(c, "select origin as o from public.supplier_source_attestations where source_id = $1", [id])).o).toBe("update");
    });
  });

  it("RPC attest_supplier_source_access : rédacteur seulement, texte obligatoire, autre organisation introuvable", async () => {
    await withRollback(async (c) => {
      const w = await twoOrgs(c, "att3");
      const id = await source(c, w.orgA, w.alice, false, null);
      const viewer = await addMember(c, w.orgA, "viewer-att3@remediation.test", "viewer");
      const member = await addMember(c, w.orgA, "member-att3@remediation.test", "member");
      const rpc = "select (public.attest_supplier_source_access($1, $2, $3)).automated_access_confirmed as ok";

      await asUser(c, w.bob);
      await expectQueryError(c, rpc, [id, "Accès", true], "SOURCE_NOT_FOUND");
      await asUser(c, viewer);
      await expectQueryError(c, rpc, [id, "Accès", true], "FORBIDDEN");
      await asUser(c, member);
      await expectQueryError(c, rpc, [id, "   ", true], "ATTESTATION_TEXT_REQUIRED");
      await expectQueryError(c, rpc, [id, "x".repeat(2001), true], "ATTESTATION_INVALID");
      expect((await one<{ ok: boolean }>(c, rpc, [id, "Accord écrit du 12/09/2026", true])).ok).toBe(true);

      await asSuperuser(c);
      const s = await one<{ by: string; c: string }>(c, "select access_attested_by as by, access_conditions as c from public.supplier_sources where id = $1", [id]);
      expect(s).toEqual({ by: member, c: "Accord écrit du 12/09/2026" });
      const j = await c.query("select attested_by, origin from public.supplier_source_attestations where source_id = $1", [id]);
      expect(j.rows).toEqual([{ attested_by: member, origin: "rpc" }]);

      // Journal : visible par les membres de A, invisible pour B, jamais écrit par un client.
      await asUser(c, viewer);
      expect((await c.query("select 1 from public.supplier_source_attestations where source_id = $1", [id])).rowCount).toBe(1);
      await asUser(c, w.bob);
      expect((await c.query("select 1 from public.supplier_source_attestations where source_id = $1", [id])).rowCount).toBe(0);
      await expectQueryError(c, "update public.supplier_source_attestations set attested_by = null", [], "permission denied");
      await expectQueryError(c, "delete from public.supplier_source_attestations", [], "permission denied");
    });
  });
});

d("D-08 : création limitée, suppression contrôlée", () => {
  it("au plus 3 organisations créées par 24 h ; au plus une démo", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "limit@remediation.test");
      await createOrgAs(c, u, "Un", "lim-un");
      await createOrgAs(c, u, "Deux", "lim-deux");
      await asUser(c, u);
      await c.query("select public.create_organization_with_owner('Démo', 'lim-demo', true)");
      await expectQueryError(c, "select public.create_organization_with_owner('Quatre', 'lim-quatre', false)", [], "ORGANIZATION_CREATION_LIMIT");
      // Hors fenêtre de 24 h : de nouveau possible ; mais toujours une seule démo.
      await asSuperuser(c);
      await c.query("update public.organizations set created_at = now() - interval '25 hours' where created_by = $1", [u]);
      await asUser(c, u);
      await expectQueryError(c, "select public.create_organization_with_owner('Démo 2', 'lim-demo-2', true)", [], "DEMO_ORGANIZATION_EXISTS");
      await c.query("select public.create_organization_with_owner('Quatre', 'lim-quatre', null)");
      await asSuperuser(c);
      const n = await one<{ n: number; demos: number }>(c, "select count(*)::int as n, count(*) filter (where is_demo)::int as demos from public.organizations where created_by = $1", [u]);
      expect(n).toEqual({ n: 4, demos: 1 });
    });
  });

  it("delete_organization : propriétaire seulement, confirmation exacte, refus si membres / commandes / connexion, autre organisation introuvable", async () => {
    await withRollback(async (c) => {
      const w = await twoOrgs(c, "del");
      const del = "select public.delete_organization($1, $2)";
      // Autre organisation : introuvable, rien ne bouge.
      await asUser(c, w.alice);
      await expectQueryError(c, del, [w.orgB, "Org B del"], "ORGANIZATION_NOT_FOUND");
      await asSuperuser(c);
      expect((await c.query("select 1 from public.organizations where id = $1", [w.orgB])).rowCount).toBe(1);
      // Admin de A : interdit.
      const admin = await addMember(c, w.orgA, "admin-del@remediation.test", "admin");
      await asUser(c, admin);
      await expectQueryError(c, del, [w.orgA, "Org A del"], "FORBIDDEN");
      // Propriétaire : confirmation exacte, puis autres membres.
      await asUser(c, w.alice);
      await expectQueryError(c, del, [w.orgA, "org a del"], "ORGANIZATION_DELETE_CONFIRMATION");
      await expectQueryError(c, del, [w.orgA, "Org A del"], "ORGANIZATION_HAS_MEMBERS");
      await asSuperuser(c);
      await c.query("delete from public.organization_members where user_id = $1", [admin]);
      // Commande réelle.
      const ch = await manualChannelId(c, w.orgA);
      await c.query("insert into public.orders (organization_id, sales_channel_id, provider, external_order_id, status, placed_at) values ($1, $2, 'manual', 'O-1', 'paid', now())", [w.orgA, ch]);
      await asUser(c, w.alice);
      await expectQueryError(c, del, [w.orgA, "Org A del"], "ORGANIZATION_HAS_ORDERS");
      await asSuperuser(c);
      await c.query("delete from public.orders where organization_id = $1", [w.orgA]);
      // Connexion eBay active.
      const ebay = await one<{ id: string }>(c, "insert into public.sales_channels (organization_id, provider, name) values ($1, 'ebay', 'eBay') returning id", [w.orgA]);
      const conn = await one<{ id: string }>(c, "insert into public.channel_connections (organization_id, sales_channel_id, provider, status) values ($1, $2, 'ebay', 'connected') returning id", [w.orgA, ebay.id]);
      await asUser(c, w.alice);
      await expectQueryError(c, del, [w.orgA, "Org A del"], "ORGANIZATION_HAS_CONNECTION");
      await asSuperuser(c);
      await c.query("update public.channel_connections set status = 'disconnected' where id = $1", [conn.id]);

      // Suppression : tout part en cascade, y compris le journal de stock (D-21) ; B intact.
      await asUser(c, w.alice);
      const r = await one<{ r: { deleted: boolean; organization_id: string } }>(c, "select public.delete_organization($1, $2) as r", [w.orgA, " Org A del "]);
      expect(r.r).toEqual({ deleted: true, organization_id: w.orgA });
      await asSuperuser(c);
      for (const t of ["organizations", "skus", "inventory_movements", "organization_members", "sales_channels"]) {
        const col = t === "organizations" ? "id" : "organization_id";
        expect((await c.query(`select 1 from public.${t} where ${col} = $1`, [w.orgA])).rowCount, t).toBe(0);
      }
      expect((await one<{ c: string | null }>(c, "select current_organization_id as c from public.user_profiles where user_id = $1", [w.alice])).c).toBeNull();
      expect((await c.query("select 1 from public.inventory_movements where organization_id = $1", [w.orgB])).rowCount).toBeGreaterThan(0);
    });
  });

  it("démo : supprimable malgré ses commandes fictives ; pas si une commande vient d'une connexion", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "demo-del@remediation.test");
      await asUser(c, u);
      const org = (await one<{ id: string }>(c, "select public.create_organization_with_owner('Démonstration', 'demo-del', true) as id")).id;
      await asSuperuser(c);
      const ch = await manualChannelId(c, org);
      await c.query("insert into public.orders (organization_id, sales_channel_id, provider, external_order_id, status, placed_at) values ($1, $2, 'ebay', 'D-1', 'paid', now())", [org, ch]);
      const ebay = await one<{ id: string }>(c, "insert into public.sales_channels (organization_id, provider, name) values ($1, 'ebay', 'eBay') returning id", [org]);
      const conn = await one<{ id: string }>(c, "insert into public.channel_connections (organization_id, sales_channel_id, provider, status) values ($1, $2, 'ebay', 'disconnected') returning id", [org, ebay.id]);
      await c.query("insert into public.orders (organization_id, sales_channel_id, connection_id, provider, external_order_id, status, placed_at) values ($1, $2, $3, 'ebay', 'R-1', 'paid', now())", [org, ebay.id, conn.id]);
      await asUser(c, u);
      await expectQueryError(c, "select public.delete_organization($1, 'Démonstration')", [org], "ORGANIZATION_HAS_ORDERS");
      await asSuperuser(c);
      await c.query("delete from public.orders where connection_id = $1", [conn.id]);
      await asUser(c, u);
      await c.query("select public.delete_organization($1, 'Démonstration')", [org]);
      await asSuperuser(c);
      expect((await c.query("select 1 from public.organizations where id = $1", [org])).rowCount).toBe(0);
    });
  });
});

d("D-10 : purge paramétrée", () => {
  it("réservée au serveur ; simulation par défaut ; garde-fous ; conserve le dernier run de chaque source et les runs en cours", async () => {
    await withRollback(async (c) => {
      const w = await twoOrgs(c, "purge");
      await asUser(c, w.alice);
      await expectQueryError(c, "select public.purge_retention()", [], "permission denied");
      await asSuperuser(c);
      const src = "11111111-1111-1111-1111-111111111111";
      const ins = "insert into public.sync_runs (organization_id, source_kind, source_ref, provider, trigger, status, started_at, finished_at) values ($1, 'channel', $2, 'ebay', 'manual', $3::public.sync_status, now() - $4::interval, case when $3::text = 'running' then null else now() - $4::interval end) returning id";
      const oldA = (await one<{ id: string }>(c, ins, [w.orgA, src, "success", "200 days"])).id;
      const latestA = (await one<{ id: string }>(c, ins, [w.orgA, src, "failed", "150 days"])).id;
      const runningOld = (await one<{ id: string }>(c, ins, [w.orgA, null, "running", "300 days"])).id;
      const recent = (await one<{ id: string }>(c, ins, [w.orgB, "22222222-2222-2222-2222-222222222222", "success", "1 day"])).id;
      await c.query("insert into public.sync_errors (organization_id, sync_run_id, code, message) values ($1, $2, 'E', 'x')", [w.orgA, oldA]);
      await c.query("insert into public.webhook_events (provider, event_id, event_type, payload_hash, status, received_at) values ('ebay', 'p-old', 'X', 'h', 'processed', now() - interval '200 days'), ('ebay', 'p-pending', 'X', 'h', 'received', now() - interval '200 days')");

      await asService(c);
      const dry = await one<{ r: { dry_run: boolean; counts: Record<string, number> } }>(c, "select public.purge_retention() as r");
      expect(dry.r.dry_run).toBe(true);
      expect(dry.r.counts).toMatchObject({ sync_runs: 1, sync_errors: 1, webhook_events: 1 });
      expect((await c.query("select 1 from public.sync_runs where id = $1", [oldA])).rowCount).toBe(1);

      await expectQueryError(c, "select public.purge_retention(false, 3)", [], "7 jours minimum");
      const real = await one<{ r: { dry_run: boolean; counts: Record<string, number> } }>(c, "select public.purge_retention(false) as r");
      expect(real.r).toMatchObject({ dry_run: false, counts: { sync_runs: 1, sync_errors: 1, webhook_events: 1 } });
      const left = (await c.query("select id from public.sync_runs where id = any($1::uuid[])", [[oldA, latestA, runningOld, recent]])).rows.map((r) => r.id).sort();
      expect(left).toEqual([latestA, runningOld, recent].sort());
      expect((await c.query("select event_id from public.webhook_events where event_id like 'p-%'")).rows.map((r) => r.event_id)).toEqual(["p-pending"]);
    });
  });
});

d("D-21 : le journal de stock ne disparaît plus avec un SKU", () => {
  it("SKU avec mouvements : suppression refusée même en service_role ; SKU sans mouvement supprimable", async () => {
    await withRollback(async (c) => {
      const w = await twoOrgs(c, "restrict");
      const fk = await one<{ a: string }>(c, "select confdeltype::text as a from pg_constraint where conname = 'inventory_movements_sku_id_fkey'");
      expect(fk.a).toBe("r");
      await asService(c);
      await expectQueryError(c, "delete from public.skus where id = $1", [w.skuA], /violates foreign key constraint "inventory_movements_sku_id_fkey"/);
      const fresh = await createSkuAs(c, w.alice, w.orgA, "RESTRICT-FRESH");
      await asService(c);
      expect((await c.query("delete from public.skus where id = $1", [fresh])).rowCount).toBe(1);
      // Suppression d'organisation par le serveur (auto-tests e2e-check) : toujours possible.
      expect((await c.query("delete from public.organizations where id = $1", [w.orgB])).rowCount).toBe(1);
    });
  });
});
