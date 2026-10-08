import { describe, expect, it, beforeAll } from "vitest";
import { asUser, canConnect, createOrgAs, createSkuAs, createUser, withRollback, asService, expectQueryError } from "./helpers";

const available = await canConnect();
const d = available ? describe : describe.skip;

d("RLS multi-tenant (permissions)", () => {
  beforeAll(() => {
    if (!available) console.warn("Base locale indisponible : tests d'intégration ignorés (voir scripts/db-local-reset.sh)");
  });

  it("un utilisateur ne voit jamais les données d'une autre organisation", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "alice@example.test");
      const bob = await createUser(c, "bob@example.test");
      const orgA = await createOrgAs(c, alice, "Org A", "org-a");
      const orgB = await createOrgAs(c, bob, "Org B", "org-b");
      await createSkuAs(c, alice, orgA, "SKU-A", { initial: 5 });
      await createSkuAs(c, bob, orgB, "SKU-B", { initial: 7 });

      await asUser(c, alice);
      const mine = await c.query("select code from public.skus order by code");
      expect(mine.rows.map((r) => r.code)).toEqual(["SKU-A"]);
      const orgs = await c.query("select id from public.organizations");
      expect(orgs.rows.map((r) => r.id)).toEqual([orgA]);
      const inv = await c.query("select organization_id from public.v_stock_overview");
      expect(inv.rows.every((r) => r.organization_id === orgA)).toBe(true);

      await asUser(c, bob);
      const his = await c.query("select code from public.skus order by code");
      expect(his.rows.map((r) => r.code)).toEqual(["SKU-B"]);
    });
  });

  it("un utilisateur ne peut pas insérer dans une organisation dont il n'est pas membre", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "alice2@example.test");
      const bob = await createUser(c, "bob2@example.test");
      const orgA = await createOrgAs(c, alice, "Org A", "org-a2");
      await createOrgAs(c, bob, "Org B", "org-b2");
      await asUser(c, bob);
      await expectQueryError(c, "insert into public.products (organization_id, name) values ($1, 'Intrus')", [orgA], /row-level security/);
    });
  });

  it("un rôle viewer lit mais n'écrit pas", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "owner@example.test");
      const viewer = await createUser(c, "viewer@example.test");
      const org = await createOrgAs(c, owner, "Org V", "org-v");
      await asService(c);
      await c.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'viewer')", [org, viewer]);
      await asUser(c, viewer);
      const { rows } = await c.query("select name from public.organizations");
      expect(rows.map((r) => r.name)).toEqual(["Org V"]);
      await expectQueryError(c, "insert into public.suppliers (organization_id, name) values ($1, 'X')", [org], /row-level security/);
      await expectQueryError(c, "select public.apply_inventory_movement($1, gen_random_uuid(), 'receipt', 1)", [org], "FORBIDDEN");
    });
  });

  it("les secrets de connexion sont inaccessibles aux utilisateurs authentifiés", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "alice3@example.test");
      await createOrgAs(c, alice, "Org S", "org-s");
      await asUser(c, alice);
      await expectQueryError(c, "select * from public.channel_connection_secrets", [], /permission denied/);
      await expectQueryError(c, "select * from public.oauth_states", [], /permission denied/);
      await expectQueryError(c, "select * from public.supplier_connection_secrets", [], /permission denied/);
    });
  });

  it("le journal de mouvements est immuable côté client", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "alice4@example.test");
      const org = await createOrgAs(c, alice, "Org M", "org-m");
      const sku = await createSkuAs(c, alice, org, "SKU-M", { initial: 3 });
      await asUser(c, alice);
      const upd = await c.query("update public.inventory_movements set quantity = 99 where sku_id = $1", [sku]);
      expect(upd.rowCount).toBe(0);
      const del = await c.query("delete from public.inventory_movements where sku_id = $1", [sku]);
      expect(del.rowCount).toBe(0);
      const direct = await c.query("update public.inventory set quantity_on_hand = 1000 where sku_id = $1", [sku]);
      expect(direct.rowCount).toBe(0);
      const { rows } = await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku]);
      expect(rows[0].quantity_on_hand).toBe(3);
    });
  });
});

d("Protection du rôle propriétaire", () => {
  it("un admin ne peut ni devenir propriétaire, ni rétrograder ou retirer le propriétaire", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "owner2@example.test");
      const admin = await createUser(c, "admin2@example.test");
      const org = await createOrgAs(c, owner, "Org O", "org-owner");
      await asService(c);
      await c.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'admin')", [org, admin]);
      await asUser(c, admin);
      // La clause WITH CHECK rejette la ligne modifiée (erreur RLS) : un admin ne peut pas s'attribuer le rôle owner.
      await expectQueryError(c, "update public.organization_members set role = 'owner' where organization_id = $1 and user_id = $2", [org, admin], /row-level security/);
      const demote = await c.query("update public.organization_members set role = 'viewer' where organization_id = $1 and user_id = $2", [org, owner]);
      expect(demote.rowCount).toBe(0);
      const remove = await c.query("delete from public.organization_members where organization_id = $1 and user_id = $2", [org, owner]);
      expect(remove.rowCount).toBe(0);
      // Un admin peut gérer un membre simple.
      const member = await createUser(c, "member2@example.test");
      await asService(c);
      await c.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'member')", [org, member]);
      await asUser(c, admin);
      const ok = await c.query("update public.organization_members set role = 'viewer' where organization_id = $1 and user_id = $2", [org, member]);
      expect(ok.rowCount).toBe(1);
      // Une invitation ne rétrograde jamais un membre existant.
      await asService(c);
      const { rows: inv } = await c.query("insert into public.organization_invitations (organization_id, email, role) values ($1, 'owner2@example.test', 'viewer') returning token", [org]);
      await asUser(c, owner);
      await c.query("select public.accept_invitation($1)", [inv[0].token]);
      const role = await c.query("select role from public.organization_members where organization_id = $1 and user_id = $2", [org, owner]);
      expect(role.rows[0].role).toBe("owner");
    });
  });
});
