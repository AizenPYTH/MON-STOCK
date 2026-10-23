/**
 * Suppression de compte (audit M-01 / Q-04) : migration 20261023000600 + orchestration réelle
 * (src/services/account/delete-account.ts) exécutée contre PostgreSQL local. Les ports appellent
 * les MÊMES fonctions SQL que l'adaptateur Supabase, avec les mêmes rôles :
 *   - delete_organization sous le jeton de l'utilisateur (rôle authenticated + claims) ;
 *   - account_deletion_plan / delete_account_organization / delete_account_data en service_role ;
 *   - auth.users supprimé comme le ferait l'API d'administration (cascade).
 */
import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asService, asSuperuser, asUser, canConnect, createOrgAs, createSkuAs, createUser, expectQueryError, manualChannelId, pgErrorMessage, withRollback } from "./helpers";
import { deleteAccount, type AccountDeletionPlanRow, type AccountDeletionPorts } from "@/services/account/delete-account";
import { dbErrorCode } from "@/services/account/supabase-ports";

const available = await canConnect();
const d = available ? describe : describe.skip;

async function one<T = Record<string, unknown>>(c: Client, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await c.query(sql, params);
  return rows[0] as T;
}

async function count(c: Client, sql: string, params: unknown[] = []): Promise<number> {
  await asSuperuser(c);
  return (await one<{ n: number }>(c, `select count(*)::int as n from (${sql}) q`, params)).n;
}

/** Ports PostgreSQL : un savepoint par appel (une erreur n'avorte pas la transaction du test). */
function pgPorts(c: Client, opts: { remoteRevocation: "ok" | "fail" } = { remoteRevocation: "fail" }): AccountDeletionPorts & { disconnected: string[] } {
  const disconnected: string[] = [];
  async function inSavepoint<T>(fn: () => Promise<T>): Promise<T> {
    await c.query("savepoint port_call");
    try {
      const r = await fn();
      await c.query("release savepoint port_call");
      return r;
    } catch (e) {
      await c.query("rollback to savepoint port_call");
      throw e;
    }
  }
  return {
    disconnected,
    plan: (userId) =>
      inSavepoint(async () => {
        await asService(c);
        const { rows } = await c.query("select * from public.account_deletion_plan($1)", [userId]);
        return rows.map(
          (r): AccountDeletionPlanRow => ({
            organizationId: r.organization_id,
            organizationName: r.organization_name,
            role: r.role,
            isDemo: r.is_demo,
            otherMembers: r.other_members,
            otherOwners: r.other_owners,
            hasOrders: r.has_orders,
            activeChannelConnectionIds: r.active_channel_connection_ids,
            activeSupplierConnections: r.active_supplier_connections,
          }),
        );
      }),
    async deleteOrganizationAsUser(orgId, name) {
      try {
        await inSavepoint(async () => {
          // Utilisateur courant = celui du plan (le test fixe les claims avant l'appel).
          await asUser(c, currentUser);
          await c.query("select public.delete_organization($1, $2)", [orgId, name]);
        });
        return { ok: true };
      } catch (e) {
        const message = pgErrorMessage(e);
        return { ok: false, code: dbErrorCode({ message }), message };
      }
    },
    async disconnectChannel(connectionId) {
      disconnected.push(connectionId);
      if (opts.remoteRevocation === "fail") throw new Error("eBay injoignable");
      return { revoked: true };
    },
    deleteOrganizationForAccount: (userId, orgId) =>
      inSavepoint(async () => {
        await asService(c);
        const r = (await one<{ r: { deleted: boolean; channel_connections_disconnected?: number } }>(c, "select public.delete_account_organization($1, $2) as r", [userId, orgId])).r;
        return { deleted: r.deleted, channelConnectionsDisconnected: r.channel_connections_disconnected ?? 0 };
      }),
    deleteAccountData: (userId) =>
      inSavepoint(async () => {
        await asService(c);
        const r = (await one<{ r: { memberships_removed: number; profile_deleted: boolean } }>(c, "select public.delete_account_data($1) as r", [userId])).r;
        return { membershipsRemoved: r.memberships_removed, profileDeleted: r.profile_deleted };
      }),
    deleteAuthUser: (userId) =>
      inSavepoint(async () => {
        await asSuperuser(c);
        await c.query("delete from auth.users where id = $1", [userId]);
      }),
  };
}
let currentUser = "";

async function addMember(c: Client, orgId: string, userId: string, role: "owner" | "admin" | "member" | "viewer") {
  await asSuperuser(c);
  await c.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, $3)", [orgId, userId, role]);
}

/** Organisation « boutique » : commande réelle, connexion eBay active avec jetons, compte fournisseur connecté. */
async function shopWithHistory(c: Client, userId: string, tag: string) {
  const org = await createOrgAs(c, userId, `Boutique ${tag}`, `acc-shop-${tag}`);
  await createSkuAs(c, userId, org, `SHOP-${tag}`, { initial: 4 });
  await asSuperuser(c);
  const manual = await manualChannelId(c, org);
  await c.query("insert into public.orders (organization_id, sales_channel_id, provider, external_order_id, status, placed_at) values ($1, $2, 'manual', $3, 'paid', now())", [org, manual, `O-${tag}`]);
  const ebay = await one<{ id: string }>(c, "insert into public.sales_channels (organization_id, provider, name) values ($1, 'ebay', 'eBay') returning id", [org]);
  const conn = await one<{ id: string }>(c, "insert into public.channel_connections (organization_id, sales_channel_id, provider, status) values ($1, $2, 'ebay', 'connected') returning id", [org, ebay.id]);
  await c.query("insert into public.channel_connection_secrets (connection_id, access_token_enc, refresh_token_enc) values ($1, 'enc-a', 'enc-r')", [conn.id]);
  const supplier = await one<{ id: string }>(c, "insert into public.suppliers (organization_id, name) values ($1, 'Grossiste') returning id", [org]);
  const sc = await one<{ id: string }>(c, "insert into public.supplier_connections (organization_id, supplier_id, connector_key, status) values ($1, $2, 'test', 'connected') returning id", [org, supplier.id]);
  await c.query("insert into public.supplier_connection_secrets (connection_id, credentials_enc) values ($1, 'enc-c')", [sc.id]);
  return { org, connection: conn.id, supplierConnection: sc.id };
}

d("M-01 : suppression de compte (migration 20261023000600 + service)", () => {
  it("fonctions réservées au serveur : ni anon ni authenticated ne peuvent les exécuter", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "priv@account.test");
      for (const sig of ["public.account_deletion_plan(uuid)", "public.delete_account_organization(uuid, uuid)", "public.delete_account_data(uuid)"]) {
        const p = await one<{ a: boolean; anon: boolean; s: boolean }>(c, "select has_function_privilege('authenticated', $1, 'EXECUTE') as a, has_function_privilege('anon', $1, 'EXECUTE') as anon, has_function_privilege('service_role', $1, 'EXECUTE') as s", [sig]);
        expect(p, sig).toEqual({ a: false, anon: false, s: true });
      }
      // Un utilisateur ne peut pas supprimer le compte d'un autre (ni le sien) en appelant la procédure.
      await asUser(c, u);
      await expectQueryError(c, "select public.delete_account_data($1)", [u], "permission denied");
      await expectQueryError(c, "select * from public.account_deletion_plan($1)", [u], "permission denied");
    });
  });

  it("parcours complet : organisation vide (RPC), boutique avec commandes et connexions (procédure dédiée), organisation partagée quittée", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "alice@account.test");
      const bob = await createUser(c, "bob@account.test");
      currentUser = alice;
      const empty = await createOrgAs(c, alice, "Atelier vide", "acc-empty");
      const shop = await shopWithHistory(c, alice, "a");
      const shared = await createOrgAs(c, bob, "Boutique de Bob", "acc-bob");
      await addMember(c, shared, alice, "member");
      const bobSku = await createSkuAs(c, bob, shared, "BOB-1", { initial: 2 });
      // Alice a écrit dans l'organisation de Bob (mouvement) et a une conversation du conseiller.
      await asUser(c, alice);
      await c.query("select public.apply_inventory_movement($1, $2, 'adjustment', 1)", [shared, bobSku]);
      expect(await count(c, "select 1 from public.inventory_movements where created_by = $1 and organization_id = $2", [alice, shared])).toBe(1);
      await asSuperuser(c);
      await c.query("insert into public.advisor_conversations (organization_id, user_id, title) values ($1, $2, 'Mes ventes')", [shared, alice]);

      const ports = pgPorts(c, { remoteRevocation: "fail" });
      const logged: unknown[] = [];
      const result = await deleteAccount(ports, { userId: alice, confirmation: "SUPPRIMER" }, { info: (...a) => logged.push(a), warn: (...a) => logged.push(a) });

      expect(result).toEqual({ deleted: true, organizationsDeleted: 2, organizationsLeft: 1, channelConnectionsDisconnected: 1, remoteRevocationIncomplete: true });
      expect(ports.disconnected).toEqual([shop.connection]);
      // Organisations d'Alice seule : supprimées avec leurs données et secrets.
      expect(await count(c, "select 1 from public.organizations where id = any($1)", [[empty, shop.org]])).toBe(0);
      expect(await count(c, "select 1 from public.channel_connection_secrets where connection_id = $1", [shop.connection])).toBe(0);
      expect(await count(c, "select 1 from public.supplier_connection_secrets where connection_id = $1", [shop.supplierConnection])).toBe(0);
      expect(await count(c, "select 1 from public.orders where organization_id = $1", [shop.org])).toBe(0);
      // Organisation de Bob : intacte, Bob toujours propriétaire, Alice n'en fait plus partie ; son
      // mouvement reste dans le journal sans auteur (on delete set null), sa conversation est purgée.
      expect(await count(c, "select 1 from public.organization_members where organization_id = $1 and user_id = $2 and role = 'owner'", [shared, bob])).toBe(1);
      expect(await count(c, "select 1 from public.organization_members where user_id = $1", [alice])).toBe(0);
      expect(await count(c, "select 1 from public.inventory_movements where organization_id = $1", [shared])).toBeGreaterThan(0);
      expect(await count(c, "select 1 from public.inventory_movements where created_by = $1", [alice])).toBe(0);
      expect(await count(c, "select 1 from public.advisor_conversations where user_id = $1", [alice])).toBe(0);
      // Profil et utilisateur d'authentification supprimés.
      expect(await count(c, "select 1 from public.user_profiles where user_id = $1", [alice])).toBe(0);
      expect(await count(c, "select 1 from auth.users where id = $1", [alice])).toBe(0);
      expect(await count(c, "select 1 from auth.users where id = $1", [bob])).toBe(1);
      // Journal : aucune donnée personnelle (identifiant, e-mail, nom d'organisation).
      const text = JSON.stringify(logged);
      for (const secret of [alice, "alice@account.test", "Atelier vide", "Boutique a", shared]) expect(text).not.toContain(secret);
    });
  });

  it("seul propriétaire d'une organisation partagée : refus, RIEN n'est supprimé", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "owner@account.test");
      const member = await createUser(c, "member@account.test");
      currentUser = owner;
      const solo = await createOrgAs(c, owner, "Solo", "acc-solo");
      const team = await createOrgAs(c, owner, "Équipe", "acc-team");
      await addMember(c, team, member, "admin");
      const err = await deleteAccount(pgPorts(c), { userId: owner, confirmation: "SUPPRIMER" }).catch((e) => e);
      expect(err).toMatchObject({ code: "CONFLICT", message: expect.stringContaining("« Équipe »") });
      expect(await count(c, "select 1 from public.organizations where id = any($1)", [[solo, team]])).toBe(2);
      expect(await count(c, "select 1 from public.user_profiles where user_id = $1", [owner])).toBe(1);
      expect(await count(c, "select 1 from auth.users where id = $1", [owner])).toBe(1);
      // Même garde-fou côté base si l'appelant saute l'étape du plan.
      await asService(c);
      await expectQueryError(c, "select public.delete_account_data($1)", [owner], "ACCOUNT_ORGANIZATIONS_REMAIN");
    });
  });

  it("copropriétaire : l'organisation reste à l'autre propriétaire", async () => {
    await withRollback(async (c) => {
      const a = await createUser(c, "coa@account.test");
      const b = await createUser(c, "cob@account.test");
      currentUser = a;
      const org = await createOrgAs(c, a, "Co", "acc-co");
      await addMember(c, org, b, "owner");
      const r = await deleteAccount(pgPorts(c), { userId: a, confirmation: "SUPPRIMER" });
      expect(r).toMatchObject({ organizationsDeleted: 0, organizationsLeft: 1 });
      expect(await count(c, "select 1 from public.organization_members where organization_id = $1 and user_id = $2 and role = 'owner'", [org, b])).toBe(1);
      expect(await count(c, "select 1 from auth.users where id = $1", [a])).toBe(0);
    });
  });

  it("garde-fous SQL directs : membre ajouté entre-temps, organisation restante, seul propriétaire ; idempotence", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "guards@account.test");
      const other = await createUser(c, "other@account.test");
      const org = await createOrgAs(c, u, "Garde", "acc-guard");
      await asService(c);
      // Organisation encore présente dont il est seul membre : profil non supprimé.
      await expectQueryError(c, "select public.delete_account_data($1)", [u], "ACCOUNT_ORGANIZATIONS_REMAIN");
      // Un membre arrive : la procédure dédiée refuse (verrou + revérification).
      await addMember(c, org, other, "member");
      await asService(c);
      await expectQueryError(c, "select public.delete_account_organization($1, $2)", [u, org], "ORGANIZATION_HAS_MEMBERS");
      await expectQueryError(c, "select public.delete_account_data($1)", [u], "ACCOUNT_SOLE_OWNER");
      // Utilisateur non membre : refus, rien ne bouge.
      const stranger = await createUser(c, "stranger@account.test");
      await asService(c);
      await expectQueryError(c, "select public.delete_account_organization($1, $2)", [stranger, org], "ORGANIZATION_NOT_MEMBER");
      await expectQueryError(c, "select public.delete_account_organization(null, $1)", [org], "ACCOUNT_DELETE_INVALID");
      // Organisation déjà supprimée : résultat neutre (reprise après une coupure).
      const r = await one<{ r: { deleted: boolean; reason: string } }>(c, "select public.delete_account_organization($1, gen_random_uuid()) as r", [u]);
      expect(r.r).toMatchObject({ deleted: false, reason: "not_found" });
      // Compte sans organisation : suppression des données répétable.
      await asService(c);
      const r1 = await one<{ r: { memberships_removed: number; profile_deleted: boolean } }>(c, "select public.delete_account_data($1) as r", [stranger]);
      const r2 = await one<{ r: { memberships_removed: number; profile_deleted: boolean } }>(c, "select public.delete_account_data($1) as r", [stranger]);
      expect(r1.r).toMatchObject({ memberships_removed: 0, profile_deleted: true });
      expect(r2.r).toMatchObject({ memberships_removed: 0, profile_deleted: false });
      expect(await count(c, "select 1 from public.organizations where id = $1", [org])).toBe(1);
    });
  });
});

d("M-16 : brouillon de commande fournisseur atomique (migration 20261023000610)", () => {
  it("en-tête + ligne en une transaction ; ligne refusée → aucun brouillon orphelin ; lecture seule refusée", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "po@account.test");
      const org = await createOrgAs(c, u, "Achats", "acc-po");
      const sku = await createSkuAs(c, u, org, "PO-1", { initial: 1 });
      await asSuperuser(c);
      const supplier = await one<{ id: string }>(c, "insert into public.suppliers (organization_id, name) values ($1, 'Grossiste') returning id", [org]);
      const call = "select public.create_draft_purchase_order($1, $2, 'EUR', $3, null, $4, 12.5, 'test') as id";
      await asUser(c, u);
      const po = (await one<{ id: string }>(c, call, [org, supplier.id, sku, 3])).id;
      await asSuperuser(c);
      const rows = await c.query("select p.status, i.quantity_ordered, i.unit_cost::float as unit_cost from public.purchase_orders p join public.purchase_order_items i on i.purchase_order_id = p.id where p.id = $1", [po]);
      expect(rows.rows).toEqual([{ status: "draft", quantity_ordered: 3, unit_cost: 12.5 }]);
      // SKU d'une autre organisation : la ligne est refusée et l'en-tête n'existe pas non plus.
      const other = await createUser(c, "po-other@account.test");
      const otherOrg = await createOrgAs(c, other, "Autre", "acc-po-other");
      const otherSku = await createSkuAs(c, other, otherOrg, "PO-X", { initial: 0 });
      await asSuperuser(c);
      const before = (await one<{ n: number }>(c, "select count(*)::int as n from public.purchase_orders where organization_id = $1", [org])).n;
      await asUser(c, u);
      await expectQueryError(c, call, [org, supplier.id, otherSku, 1], /CROSS_ORGANIZATION_REFERENCE|SKU_NOT_FOUND|violates|permission|row-level/);
      await expectQueryError(c, call, [org, supplier.id, sku, 0], "PURCHASE_ORDER_QUANTITY_INVALID");
      await asSuperuser(c);
      expect((await one<{ n: number }>(c, "select count(*)::int as n from public.purchase_orders where organization_id = $1", [org])).n).toBe(before);
      // Rôle lecture seule : refusé par la RLS, rien n'est créé.
      const viewer = await createUser(c, "po-viewer@account.test");
      await addMember(c, org, viewer, "viewer");
      await asUser(c, viewer);
      await expectQueryError(c, call, [org, supplier.id, sku, 1], /row-level security|permission|FORBIDDEN/);
    });
  });
});
