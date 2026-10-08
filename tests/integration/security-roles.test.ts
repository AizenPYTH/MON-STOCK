/**
 * Rôles et cycle de vie des membres : viewer en lecture seule (tables ET RPC), membre sans
 * droits d'administration, admin sans pouvoir sur les propriétaires, dernier propriétaire
 * protégé, organisation courante limitée aux organisations dont on est membre, invitations.
 */
import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asService, asSuperuser, asUser, canConnect, createOrgAs, createUser, expectQueryError, withRollback } from "./helpers";
import { addMember, as, buildArgs, listFunctions, listRelations, orgSnapshot, quoteIdent, seedFullOrg, trySql, type OrgFixture } from "./security-fixtures";

const available = await canConnect();
const d = available ? describe : describe.skip;

const DENIED = /row-level security|permission denied/;

async function insertableColumns(c: Client, table: string): Promise<string[]> {
  const { rows } = await c.query<{ attname: string }>(
    "select attname from pg_attribute where attrelid = $1::regclass and attnum > 0 and not attisdropped and attgenerated = '' order by attnum",
    [`public.${table}`],
  );
  return rows.map((r) => r.attname);
}

/** Tente INSERT (copie d'une ligne existante), UPDATE et DELETE sur chaque table de l'organisation. */
async function writeMatrix(c: Client, org: OrgFixture, userId: string, tables: string[]): Promise<string[]> {
  const problems: string[] = [];
  for (const table of tables) {
    await asSuperuser(c);
    const cols = await insertableColumns(c, table);
    const key = table === "organizations" ? "id" : "organization_id";
    const { rows } = await c.query<{ j: Record<string, unknown> }>(`select to_jsonb(t) as j from public.${quoteIdent(table)} t where ${key} = $1 limit 1`, [org.orgId]);
    await as(c, userId);
    if (rows.length > 0) {
      const row = { ...rows[0]!.j };
      if ("id" in row) row["id"] = (await c.query("select gen_random_uuid() as u")).rows[0].u;
      const colList = cols.map(quoteIdent).join(", ");
      const ins = await trySql(c, `insert into public.${quoteIdent(table)} (${colList}) select ${colList} from jsonb_populate_record(null::public.${quoteIdent(table)}, $1::jsonb)`, [JSON.stringify(row)]);
      if (ins.ok) problems.push(`${table}: INSERT accepté`);
      else if (!DENIED.test(ins.error)) problems.push(`${table}: INSERT erreur inattendue ${ins.error}`);
    }
    const settable = cols.find((col) => !["id", "organization_id", "user_id", "sku_id", "connection_id", "state"].includes(col)) ?? cols[0]!;
    const upd = await trySql(c, `update public.${quoteIdent(table)} set ${quoteIdent(settable)} = ${quoteIdent(settable)} where ${key} = $1`, [org.orgId]);
    if (upd.ok && upd.rowCount > 0) problems.push(`${table}: UPDATE accepté (${upd.rowCount})`);
    else if (!upd.ok && !DENIED.test(upd.error)) problems.push(`${table}: UPDATE erreur inattendue ${upd.error}`);
    // Quitter l'organisation (supprimer SA propre adhésion) est autorisé : testé à part.
    const del =
      table === "organization_members"
        ? await trySql(c, "delete from public.organization_members where organization_id = $1 and user_id <> $2", [org.orgId, userId])
        : await trySql(c, `delete from public.${quoteIdent(table)} where ${key} = $1`, [org.orgId]);
    if (del.ok && del.rowCount > 0) problems.push(`${table}: DELETE accepté (${del.rowCount})`);
    else if (!del.ok && !DENIED.test(del.error)) problems.push(`${table}: DELETE erreur inattendue ${del.error}`);
  }
  return problems;
}

d("Rôle viewer : lecture seule partout", () => {
  it("un viewer lit son organisation mais n'écrit dans aucune table (énumérées depuis pg_catalog)", async () => {
    await withRollback(async (c) => {
      const org = await seedFullOrg(c, "owner@viewer.test", "Org V", "org-viewer");
      const viewer = await addMember(c, org.orgId, "viewer@viewer.test", "viewer");
      const tables = (await listRelations(c)).filter((r) => r.kind === "table" && r.hasOrgColumn).map((r) => r.name);
      await as(c, viewer);
      const read = await c.query("select count(*)::int as n from public.skus where organization_id = $1", [org.orgId]);
      expect(read.rows[0].n).toBe(1);
      const before = await orgSnapshot(c, org.orgId);
      const problems = await writeMatrix(c, org, viewer, [...tables, "organizations"]);
      expect(problems).toEqual([]);
      expect(await orgSnapshot(c, org.orgId)).toEqual(before);
    });
  });

  it("un viewer ne modifie rien via les fonctions SECURITY DEFINER (toutes énumérées)", async () => {
    await withRollback(async (c) => {
      const org = await seedFullOrg(c, "owner@viewer2.test", "Org V2", "org-viewer2");
      const viewer = await addMember(c, org.orgId, "viewer@viewer2.test", "viewer");
      const fns = (await listFunctions(c)).filter((f) => f.securityDefiner && !f.returnsTrigger);
      const changed: string[] = [];
      for (const f of fns) {
        const call = buildArgs(f, org, { userId: viewer });
        if (!call) continue;
        const before = await orgSnapshot(c, org.orgId);
        await as(c, viewer);
        await trySql(c, call.sql, call.params);
        const after = await orgSnapshot(c, org.orgId);
        for (const [k, v] of Object.entries(before)) {
          // Créer SA propre organisation bascule SON profil sur celle-ci : ce n'est pas une écriture dans l'organisation.
          if (k === "user_profiles" && f.name === "create_organization_with_owner") continue;
          if (after[k] !== v) changed.push(`${f.signature} a modifié ${k}`);
        }
      }
      expect(changed).toEqual([]);
      await as(c, viewer);
      for (const sql of [
        "select public.apply_inventory_movement($1, $2, 'receipt', 1)",
        "select public.adjust_reserved_quantity($1, $2, 1)",
      ]) {
        await expectQueryError(c, sql, [org.orgId, org.ids["skus"]], "FORBIDDEN");
      }
      await expectQueryError(c, "select public.map_listing_to_sku($1, $2)", [org.ids["channel_listings"], org.ids["skus"]], "FORBIDDEN");
      await expectQueryError(c, "select public.apply_pending_sales_for_sku($1)", [org.ids["skus"]], "FORBIDDEN");
      await expectQueryError(c, "select public.create_sku($1, '{}'::jsonb, '{\"code\":\"V\"}'::jsonb, null, '{\"name\":\"V\"}'::jsonb, 0)", [org.orgId], "FORBIDDEN");
      await expectQueryError(c, "select public.receive_purchase_order_items($1, '[]'::jsonb)", [org.ids["purchase_orders"]], "FORBIDDEN");
    });
  });
});

d("Rôle member : aucune administration", () => {
  it("un membre ne gère ni les membres, ni les invitations, ni l'organisation, ni les canaux et connexions", async () => {
    await withRollback(async (c) => {
      const org = await seedFullOrg(c, "owner@member.test", "Org M", "org-member");
      const member = await addMember(c, org.orgId, "member@member.test", "member");
      const other = await addMember(c, org.orgId, "other@member.test", "viewer");
      await as(c, member);
      // Il travaille normalement sur le catalogue…
      const ok = await c.query("update public.skus set location = 'A1' where organization_id = $1", [org.orgId]);
      expect(ok.rowCount).toBe(1);
      // … mais n'administre rien.
      const problems = await writeMatrix(c, org, member, ["organization_members", "organization_invitations", "sales_channels", "channel_connections", "organizations"]);
      expect(problems).toEqual([]);
      const promote = await c.query("update public.organization_members set role = 'admin' where organization_id = $1 and user_id = $2", [org.orgId, other]);
      expect(promote.rowCount).toBe(0);
      const invitations = await c.query("select * from public.organization_invitations where organization_id = $1", [org.orgId]);
      expect(invitations.rowCount).toBe(0);
      await expectQueryError(c, "insert into public.organization_invitations (organization_id, email, role) values ($1, 'x@member.test', 'viewer')", [org.orgId], /row-level security/);
      const conn = await c.query("update public.channel_connections set auto_sync = false where organization_id = $1", [org.orgId]);
      expect(conn.rowCount).toBe(0);
      const delChannel = await c.query("delete from public.sales_channels where organization_id = $1", [org.orgId]);
      expect(delChannel.rowCount).toBe(0);
    });
  });

  it("un viewer ne voit pas les invitations ; un admin si", async () => {
    await withRollback(async (c) => {
      const org = await seedFullOrg(c, "owner@inv-sel.test", "Org IS", "org-inv-sel");
      const viewer = await addMember(c, org.orgId, "viewer@inv-sel.test", "viewer");
      const admin = await addMember(c, org.orgId, "admin@inv-sel.test", "admin");
      await as(c, viewer);
      expect((await c.query("select token from public.organization_invitations")).rowCount).toBe(0);
      await as(c, admin);
      expect((await c.query("select token from public.organization_invitations")).rowCount).toBe(1);
    });
  });
});

d("Rôle admin et propriétaires", () => {
  it("un admin ne peut ni promouvoir en propriétaire, ni rétrograder/retirer un propriétaire, ni inviter un propriétaire, ni changer son propre rôle", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "owner@admin.test");
      const org = await createOrgAs(c, owner, "Org Adm", "org-adm");
      const admin = await addMember(c, org, "admin@admin.test", "admin");
      const member = await addMember(c, org, "member@admin.test", "member");
      await asUser(c, admin);
      await expectQueryError(c, "update public.organization_members set role = 'owner' where organization_id = $1 and user_id = $2", [org, member], /row-level security/);
      expect((await c.query("update public.organization_members set role = 'admin' where organization_id = $1 and user_id = $2", [org, owner])).rowCount).toBe(0);
      expect((await c.query("delete from public.organization_members where organization_id = $1 and user_id = $2", [org, owner])).rowCount).toBe(0);
      await expectQueryError(c, "insert into public.organization_invitations (organization_id, email, role) values ($1, 'boss@admin.test', 'owner')", [org], /row-level security/);
      expect((await c.query("update public.organization_members set role = 'member' where organization_id = $1 and user_id = $2", [org, admin])).rowCount).toBe(0);
      // Colonnes protégées : on ne déplace pas un membre et on n'en fabrique pas un autre.
      await expectQueryError(c, "update public.organization_members set user_id = $2 where organization_id = $1 and user_id = $3", [org, admin, member], /permission denied/);
      await expectQueryError(c, "insert into public.organization_members (organization_id, user_id, role) values ($1, gen_random_uuid(), 'member')", [org], /permission denied/);
      // Gestion légitime d'un membre simple.
      expect((await c.query("update public.organization_members set role = 'viewer' where organization_id = $1 and user_id = $2", [org, member])).rowCount).toBe(1);
      expect((await c.query("delete from public.organization_members where organization_id = $1 and user_id = $2", [org, member])).rowCount).toBe(1);
      // Paramètres de l'organisation : seulement les colonnes métier.
      expect((await c.query("update public.organizations set name = 'Renommée', settings = '{\"vat_rate\": 20}' where id = $1", [org])).rowCount).toBe(1);
      for (const col of ["slug = 'pirate'", "is_demo = true", "created_by = null"]) {
        await expectQueryError(c, `update public.organizations set ${col} where id = $1`, [org], /permission denied/);
      }
    });
  });

  it("un utilisateur ne change jamais son propre rôle (membre, admin, propriétaire)", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "owner@self.test");
      const org = await createOrgAs(c, owner, "Org Self", "org-self");
      const owner2 = await addMember(c, org, "owner2@self.test", "owner");
      const member = await addMember(c, org, "member@self.test", "member");
      for (const [user, role] of [
        [member, "admin"],
        [owner, "viewer"],
        [owner2, "admin"],
      ] as const) {
        await asUser(c, user);
        expect((await c.query("update public.organization_members set role = $3 where organization_id = $1 and user_id = $2", [org, user, role])).rowCount).toBe(0);
      }
    });
  });

  it("le dernier propriétaire ne peut ni partir, ni être retiré, ni être rétrogradé — même côté serveur", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "owner@last.test");
      const org = await createOrgAs(c, owner, "Org Last", "org-last");
      const owner2 = await addMember(c, org, "owner2@last.test", "owner");
      // Avec deux propriétaires : l'un peut rétrograder l'autre.
      await asUser(c, owner);
      expect((await c.query("update public.organization_members set role = 'admin' where organization_id = $1 and user_id = $2", [org, owner2])).rowCount).toBe(1);
      // owner est maintenant seul propriétaire : il ne peut pas quitter l'organisation.
      await expectQueryError(c, "delete from public.organization_members where organization_id = $1 and user_id = $2", [org, owner], "LAST_OWNER");
      // L'ex-propriétaire (admin) ne peut pas le retirer.
      await asUser(c, owner2);
      expect((await c.query("delete from public.organization_members where organization_id = $1 and user_id = $2", [org, owner])).rowCount).toBe(0);
      // Même le serveur (service_role) ne peut pas laisser l'organisation sans propriétaire.
      await asService(c);
      await expectQueryError(c, "delete from public.organization_members where organization_id = $1 and user_id = $2", [org, owner], "LAST_OWNER");
      await expectQueryError(c, "update public.organization_members set role = 'admin' where organization_id = $1 and user_id = $2", [org, owner], "LAST_OWNER");
      // Avec un second propriétaire, le premier peut partir.
      await c.query("update public.organization_members set role = 'owner' where organization_id = $1 and user_id = $2", [org, owner2]);
      await asUser(c, owner);
      expect((await c.query("delete from public.organization_members where organization_id = $1 and user_id = $2", [org, owner])).rowCount).toBe(1);
      // La suppression de l'organisation (cascade) et d'un compte restent possibles.
      await asSuperuser(c);
      await c.query("delete from auth.users where id = $1", [owner2]);
      await c.query("delete from public.organizations where id = $1", [org]);
      expect((await c.query("select count(*)::int as n from public.organization_members where organization_id = $1", [org])).rows[0].n).toBe(0);
    });
  });

  it("un membre (non propriétaire) peut quitter l'organisation ; son organisation courante est alors réinitialisée", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "owner@leave.test");
      const org = await createOrgAs(c, owner, "Org Leave", "org-leave");
      const member = await addMember(c, org, "member@leave.test", "member");
      await asUser(c, member);
      await c.query("update public.user_profiles set current_organization_id = $1 where user_id = $2", [org, member]);
      expect((await c.query("delete from public.organization_members where organization_id = $1 and user_id = $2", [org, member])).rowCount).toBe(1);
      const { rows } = await c.query("select current_organization_id from public.user_profiles where user_id = $1", [member]);
      expect(rows[0].current_organization_id).toBeNull();
    });
  });
});

d("Profil utilisateur", () => {
  it("current_organization_id ne peut désigner qu'une organisation dont on est membre", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "alice@profile.test");
      const bob = await createUser(c, "bob@profile.test");
      const orgA = await createOrgAs(c, alice, "Org PA", "org-pa");
      const orgB = await createOrgAs(c, bob, "Org PB", "org-pb");
      await asUser(c, alice);
      await expectQueryError(c, "update public.user_profiles set current_organization_id = $1 where user_id = $2", [orgB, alice], "ORGANIZATION_NOT_MEMBER");
      expect((await c.query("update public.user_profiles set current_organization_id = $1 where user_id = $2", [orgA, alice])).rowCount).toBe(1);
      expect((await c.query("update public.user_profiles set current_organization_id = null where user_id = $1", [alice])).rowCount).toBe(1);
      // Même côté serveur, l'invariant tient.
      await asService(c);
      await expectQueryError(c, "update public.user_profiles set current_organization_id = $1 where user_id = $2", [orgB, alice], "ORGANIZATION_NOT_MEMBER");
    });
  });

  it("un utilisateur ne peut modifier ni son email ni l'identité de son profil ; ni le profil d'un autre", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "alice@email.test");
      const bob = await createUser(c, "bob@email.test");
      await asUser(c, alice);
      await expectQueryError(c, "update public.user_profiles set email = 'victim@email.test' where user_id = $1", [alice], /permission denied/);
      await expectQueryError(c, "update public.user_profiles set user_id = $2 where user_id = $1", [alice, bob], /permission denied/);
      await expectQueryError(c, "insert into public.user_profiles (user_id, email) values (gen_random_uuid(), 'x@email.test')", [], /permission denied/);
      await expectQueryError(c, "delete from public.user_profiles where user_id = $1", [alice], /permission denied/);
      expect((await c.query("update public.user_profiles set full_name = 'Alice' where user_id = $1", [alice])).rowCount).toBe(1);
      expect((await c.query("update public.user_profiles set full_name = 'Pirate' where user_id = $1", [bob])).rowCount).toBe(0);
    });
  });

  it("l'email du profil suit l'email confirmé de Supabase Auth", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "old@sync.test");
      await asSuperuser(c);
      await c.query("update auth.users set email = 'new@sync.test' where id = $1", [alice]);
      const { rows } = await c.query("select email from public.user_profiles where user_id = $1", [alice]);
      expect(rows[0].email).toBe("new@sync.test");
    });
  });
});

d("Invitations", () => {
  async function setup(c: Client) {
    const owner = await createUser(c, "owner@invite.test");
    const org = await createOrgAs(c, owner, "Org Inv", "org-invite");
    await asUser(c, owner);
    const { rows } = await c.query<{ token: string; invited_by: string }>(
      "insert into public.organization_invitations (organization_id, email, role, invited_by) values ($1, '  Guest@Invite.test ', 'member', gen_random_uuid()) returning token, invited_by",
      [org],
    );
    return { owner, org, token: rows[0]!.token, invitedBy: rows[0]!.invited_by };
  }

  it("l'auteur et l'email sont normalisés ; token, expiration et acceptation ne sont pas forgeables", async () => {
    await withRollback(async (c) => {
      const { owner, org, invitedBy } = await setup(c);
      expect(invitedBy).toBe(owner);
      await asSuperuser(c);
      const { rows } = await c.query("select email from public.organization_invitations where organization_id = $1", [org]);
      expect(rows[0].email).toBe("guest@invite.test");
      await asUser(c, owner);
      await expectQueryError(c, "insert into public.organization_invitations (organization_id, email, role, token) values ($1, 'a@invite.test', 'member', 'choisi')", [org], /permission denied/);
      await expectQueryError(c, "insert into public.organization_invitations (organization_id, email, role, expires_at) values ($1, 'a@invite.test', 'member', now() + interval '10 years')", [org], /permission denied/);
      await expectQueryError(c, "insert into public.organization_invitations (organization_id, email, role, accepted_at) values ($1, 'a@invite.test', 'member', now())", [org], /permission denied/);
      await expectQueryError(c, "update public.organization_invitations set expires_at = now() + interval '1 year' where organization_id = $1", [org], /permission denied/);
      await expectQueryError(c, "insert into public.organization_invitations (organization_id, email, role) values ($1, 'pas-un-email', 'member')", [org], "INVITATION_EMAIL_INVALID");
    });
  });

  it("acceptation : bon email uniquement, une seule fois, jamais après expiration", async () => {
    await withRollback(async (c) => {
      const { org, token } = await setup(c);
      const intruder = await createUser(c, "intruder@invite.test");
      const guest = await createUser(c, "guest@invite.test");
      // Mauvais compte.
      await asUser(c, intruder);
      await expectQueryError(c, "select public.accept_invitation($1)", [token], "INVITATION_EMAIL_MISMATCH");
      // Bon compte.
      await asUser(c, guest);
      const { rows } = await c.query("select public.accept_invitation($1) as org", [token]);
      expect(rows[0].org).toBe(org);
      const role = await c.query("select role from public.organization_members where organization_id = $1 and user_id = $2", [org, guest]);
      expect(role.rows[0].role).toBe("member");
      const profile = await c.query("select current_organization_id from public.user_profiles where user_id = $1", [guest]);
      expect(profile.rows[0].current_organization_id).toBe(org);
      // Réutilisation : refusée, pour lui comme pour un autre.
      await expectQueryError(c, "select public.accept_invitation($1)", [token], "INVITATION_INVALID");
      await asUser(c, intruder);
      await expectQueryError(c, "select public.accept_invitation($1)", [token], "INVITATION_INVALID");
    });
  });

  it("une invitation expirée ou un token inconnu est refusé ; anon ne peut pas appeler accept_invitation", async () => {
    await withRollback(async (c) => {
      const { token } = await setup(c);
      const guest = await createUser(c, "guest@invite.test");
      await asSuperuser(c);
      await c.query("update public.organization_invitations set expires_at = now() - interval '1 minute' where token = $1", [token]);
      await asUser(c, guest);
      await expectQueryError(c, "select public.accept_invitation($1)", [token], "INVITATION_INVALID");
      await expectQueryError(c, "select public.accept_invitation($1)", ["inconnu"], "INVITATION_INVALID");
      await as(c, "anon");
      await expectQueryError(c, "select public.accept_invitation($1)", [token], /permission denied/);
    });
  });

  it("un compte ne peut pas détourner une invitation en réécrivant l'email de son profil", async () => {
    await withRollback(async (c) => {
      const { token } = await setup(c);
      const attacker = await createUser(c, "attacker@invite.test");
      // Même si la colonne miroir était altérée (ici en superuser), l'email de référence est celui d'auth.users.
      await asSuperuser(c);
      await c.query("update public.user_profiles set email = 'guest@invite.test' where user_id = $1", [attacker]);
      await asUser(c, attacker);
      await expectQueryError(c, "select public.accept_invitation($1)", [token], "INVITATION_EMAIL_MISMATCH");
    });
  });

  it("un email non confirmé (Supabase Auth) ne permet pas d'accepter une invitation", async () => {
    await withRollback(async (c) => {
      const { token } = await setup(c);
      const guest = await createUser(c, "guest@invite.test");
      await asSuperuser(c);
      // Le shim local n'a pas la colonne : on l'ajoute dans la transaction (annulée à la fin), comme sur Supabase.
      await c.query("alter table auth.users add column if not exists email_confirmed_at timestamptz");
      await asUser(c, guest);
      await expectQueryError(c, "select public.accept_invitation($1)", [token], "INVITATION_EMAIL_NOT_CONFIRMED");
      await asSuperuser(c);
      await c.query("update auth.users set email_confirmed_at = now() where id = $1", [guest]);
      await asUser(c, guest);
      const { rows } = await c.query("select public.accept_invitation($1) as org", [token]);
      expect(rows[0].org).toBeTruthy();
    });
  });

  it("une invitation ne change jamais le rôle d'un membre existant", async () => {
    await withRollback(async (c) => {
      const { owner, org } = await setup(c);
      await asUser(c, owner);
      const { rows } = await c.query("insert into public.organization_invitations (organization_id, email, role) values ($1, 'owner@invite.test', 'viewer') returning token", [org]);
      await c.query("select public.accept_invitation($1)", [rows[0].token]);
      const role = await c.query("select role from public.organization_members where organization_id = $1 and user_id = $2", [org, owner]);
      expect(role.rows[0].role).toBe("owner");
    });
  });
});
