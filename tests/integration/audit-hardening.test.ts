/**
 * Migration 20261010000100 : fonctions de déclencheur non exécutables via l'API, search_path figé,
 * offres enregistrées (radar) isolées par organisation, journal d'usage IA limité à soi-même.
 */
import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asSuperuser, asUser, canConnect, createOrgAs, createUser, expectQueryError, withRollback } from "./helpers";

const available = await canConnect();
const d = available ? describe : describe.skip;

async function offerFor(c: Client, user: string, org: string, tag: string): Promise<string> {
  await asUser(c, user);
  const { rows: s } = await c.query("insert into public.suppliers (organization_id, name) values ($1, $2) returning id", [org, `Fournisseur ${tag}`]);
  const { rows: src } = await c.query("insert into public.supplier_sources (organization_id, supplier_id, name, source_type) values ($1, $2, 'Import', 'MANUAL') returning id", [org, s[0].id]);
  const { rows } = await c.query(
    `insert into public.sourcing_offers (organization_id, supplier_id, source_id, source_type, external_offer_id, title_original, original_price, original_currency, normalized_price, normalized_currency)
     values ($1, $2, $3, 'MANUAL', $4, 'Ecran iPhone 13', 79.9, 'EUR', 79.9, 'EUR') returning id`,
    [org, s[0].id, src[0].id, `OFF-${tag}`],
  );
  return rows[0].id;
}

d("Durcissement de l'audit (10/10/2026)", () => {
  it("aucune fonction de déclencheur SECURITY DEFINER n'est exécutable par un utilisateur connecté", async () => {
    await withRollback(async (c) => {
      await asSuperuser(c);
      const { rows } = await c.query(
        `select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prorettype = 'trigger'::regtype
           and has_function_privilege('authenticated', p.oid, 'execute')`,
      );
      expect(rows).toEqual([]);
      // Les déclencheurs fonctionnent toujours : création d'utilisateur (handle_new_auth_user) et d'organisation.
      const u = await createUser(c, "audit-trigger@example.test");
      const { rows: prof } = await c.query("select user_id from public.user_profiles where user_id = $1", [u]);
      expect(prof).toHaveLength(1);
    });
  });

  it("toutes les fonctions du schéma public ont un search_path figé", async () => {
    await withRollback(async (c) => {
      await asSuperuser(c);
      const { rows } = await c.query(
        `select p.proname from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proconfig is null
           and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
           and not exists (select 1 from pg_depend dep where dep.objid = p.oid and dep.deptype = 'e')`,
      );
      expect(rows.map((r: { proname: string }) => r.proname)).toEqual([]);
    });
  });

  it("offres enregistrées : visibles et modifiables uniquement par l'organisation propriétaire", async () => {
    await withRollback(async (c) => {
      const a = await createUser(c, "saved-a@example.test");
      const b = await createUser(c, "saved-b@example.test");
      const orgA = await createOrgAs(c, a, "A", "saved-a");
      const orgB = await createOrgAs(c, b, "B", "saved-b");
      const offerA = await offerFor(c, a, orgA, "A");
      const offerB = await offerFor(c, b, orgB, "B");

      await asUser(c, a);
      const { rows } = await c.query("insert into public.sourcing_saved_offers (organization_id, offer_id, note, price_at_save, currency_at_save) values ($1, $2, 'à comparer', 79.9, 'EUR') returning id, created_by", [orgA, offerA]);
      expect(rows[0].created_by).toBe(a);
      // L'offre d'une autre organisation ne peut pas être enregistrée, même dans sa propre organisation.
      await expectQueryError(c, "insert into public.sourcing_saved_offers (organization_id, offer_id) values ($1, $2)", [orgA, offerB], /row-level security|CROSS_ORGANIZATION_REFERENCE/);
      // Ni enregistrée dans l'organisation d'autrui.
      await expectQueryError(c, "insert into public.sourcing_saved_offers (organization_id, offer_id) values ($1, $2)", [orgB, offerB], /row-level security|CROSS_ORGANIZATION_REFERENCE/);
      // Le prix enregistré est figé.
      await expectQueryError(c, "update public.sourcing_saved_offers set price_at_save = 1 where id = $1", [rows[0].id], /SAVED_OFFER_IMMUTABLE/);
      await c.query("update public.sourcing_saved_offers set note = 'meilleur prix' where id = $1", [rows[0].id]);

      await asUser(c, b);
      const { rows: seen } = await c.query("select id from public.sourcing_saved_offers");
      expect(seen).toEqual([]);
      const del = await c.query("delete from public.sourcing_saved_offers where id = $1", [rows[0].id]);
      expect(del.rowCount).toBe(0);
    });
  });

  it("journal d'usage IA : chacun n'insère que pour soi, dans ses organisations, sans antidater", async () => {
    await withRollback(async (c) => {
      const a = await createUser(c, "ai-a@example.test");
      const b = await createUser(c, "ai-b@example.test");
      const orgA = await createOrgAs(c, a, "A", "ai-a");
      await createOrgAs(c, b, "B", "ai-b");
      await asUser(c, a);
      await c.query("insert into public.ai_usage_events (organization_id, kind) values ($1, 'assistant')", [orgA]);
      await expectQueryError(c, "insert into public.ai_usage_events (organization_id, user_id, kind) values ($1, $2, 'assistant')", [orgA, b], /row-level security/);
      await expectQueryError(c, "insert into public.ai_usage_events (organization_id, kind, created_at) values ($1, 'assistant', now() - interval '2 hours')", [orgA], /row-level security/);
      await asUser(c, b);
      await expectQueryError(c, "insert into public.ai_usage_events (organization_id, kind) values ($1, 'assistant')", [orgA], /row-level security/);
      const { rows } = await c.query("select count(*)::int as n from public.ai_usage_events");
      expect(rows[0].n).toBe(0);
    });
  });
});
