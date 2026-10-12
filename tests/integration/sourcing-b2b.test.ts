import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asService, asSuperuser, asUser, canConnect, createOrgAs, createUser, expectQueryError, withRollback } from "./helpers";

const available = await canConnect();
const d = available ? describe : describe.skip;

const SIG = "a".repeat(64);

/** Organisation avec un fournisseur, une source, un flux et (côté serveur) un job d'import, un incident, un mapping et un secret. */
async function seedOrg(c: Client, userId: string, slug: string) {
  const org = await createOrgAs(c, userId, `Org ${slug}`, slug);
  await asUser(c, userId);
  const { rows: s } = await c.query("insert into public.suppliers (organization_id, name) values ($1, 'Grossiste') returning id", [org]);
  const { rows: src } = await c.query("insert into public.supplier_sources (organization_id, supplier_id, name, source_type) values ($1, $2, 'Flux', 'CSV') returning id", [org, s[0].id]);
  const { rows: f } = await c.query("insert into public.supplier_feeds (organization_id, supplier_id, source_id, type, url, format) values ($1, $2, $3, 'catalog', 'https://feed.example.com/a.csv', 'csv') returning id", [org, s[0].id, src[0].id]);
  await asService(c);
  const { rows: j } = await c.query("insert into public.sourcing_import_jobs (organization_id, supplier_id, source_id, format, status) values ($1, $2, $3, 'csv', 'completed') returning id", [org, s[0].id, src[0].id]);
  await c.query("insert into public.sourcing_import_issues (organization_id, job_id, line, kind, message) values ($1, $2, 3, 'invalid', 'Prix manquant')", [org, j[0].id]);
  await c.query("insert into public.sourcing_mapping_profiles (organization_id, supplier_id, header_signature, mapping) values ($1, $2, $3, '{\"price\":\"Prix\"}')", [org, s[0].id, SIG]);
  await c.query("insert into public.supplier_feed_secrets (feed_id, organization_id, credentials_enc) values ($1, $2, 'v1:chiffré')", [f[0].id, org]);
  return { org, supplier: s[0].id as string, source: src[0].id as string, feed: f[0].id as string, job: j[0].id as string };
}

d("Sourcing B2B : historique d'import, mappings et secrets de flux (RLS)", () => {
  it("chaque organisation ne lit que ses jobs, incidents et mappings ; les secrets restent invisibles", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "b2b-alice@example.test");
      const bob = await createUser(c, "b2b-bob@example.test");
      const a = await seedOrg(c, alice, "b2b-a");
      const b = await seedOrg(c, bob, "b2b-b");

      await asUser(c, alice);
      const jobs = await c.query("select id from public.sourcing_import_jobs");
      expect(jobs.rows.map((r) => r.id)).toEqual([a.job]);
      const issues = await c.query("select job_id from public.sourcing_import_issues");
      expect(issues.rows.map((r) => r.job_id)).toEqual([a.job]);
      const profiles = await c.query("select supplier_id from public.sourcing_mapping_profiles");
      expect(profiles.rows.map((r) => r.supplier_id)).toEqual([a.supplier]);
      await expectQueryError(c, "select * from public.supplier_feed_secrets", [], /permission denied/);

      await asUser(c, bob);
      const bobJobs = await c.query("select id from public.sourcing_import_jobs");
      expect(bobJobs.rows.map((r) => r.id)).toEqual([b.job]);
    });
  });

  it("aucune écriture client : l'historique et les mappings ne sont modifiables que par le serveur", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "b2b-w@example.test");
      const a = await seedOrg(c, alice, "b2b-w");
      await asUser(c, alice);
      await expectQueryError(c, "insert into public.sourcing_import_jobs (organization_id, format) values ($1, 'csv')", [a.org], /permission denied/);
      await expectQueryError(c, "update public.sourcing_import_jobs set status = 'failed' where id = $1", [a.job], /permission denied/);
      await expectQueryError(c, "delete from public.sourcing_import_jobs where id = $1", [a.job], /permission denied/);
      await expectQueryError(c, "insert into public.sourcing_import_issues (organization_id, job_id, kind, message) values ($1, $2, 'warning', 'x')", [a.org, a.job], /permission denied/);
      await expectQueryError(c, "update public.sourcing_mapping_profiles set mapping = '{}' where supplier_id = $1", [a.supplier], /permission denied/);
      await expectQueryError(c, "insert into public.supplier_feed_secrets (feed_id, organization_id, credentials_enc) values ($1, $2, 'x')", [a.feed, a.org], /permission denied/);
    });
  });

  it("anonyme : aucun accès", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "b2b-anon@example.test");
      await seedOrg(c, alice, "b2b-anon");
      await asSuperuser(c);
      await c.query("select set_config('role', 'anon', true)");
      await expectQueryError(c, "select * from public.sourcing_import_jobs", [], /permission denied/);
      await expectQueryError(c, "select * from public.sourcing_mapping_profiles", [], /permission denied/);
      await expectQueryError(c, "select * from public.supplier_feed_secrets", [], /permission denied/);
    });
  });

  it("même le serveur ne peut pas rattacher un job, un mapping ou un secret à l'objet d'une autre organisation", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "b2b-x1@example.test");
      const bob = await createUser(c, "b2b-x2@example.test");
      const a = await seedOrg(c, alice, "b2b-x1");
      const b = await seedOrg(c, bob, "b2b-x2");
      await asService(c);
      await expectQueryError(c, "insert into public.sourcing_import_jobs (organization_id, supplier_id, format) values ($1, $2, 'csv')", [a.org, b.supplier], /CROSS_ORGANIZATION_REFERENCE/);
      await expectQueryError(c, "insert into public.sourcing_import_issues (organization_id, job_id, kind, message) values ($1, $2, 'warning', 'x')", [a.org, b.job], /CROSS_ORGANIZATION_REFERENCE/);
      await expectQueryError(c, "insert into public.sourcing_mapping_profiles (organization_id, supplier_id, header_signature, mapping) values ($1, $2, $3, '{}')", [a.org, b.supplier, "b".repeat(64)], /CROSS_ORGANIZATION_REFERENCE/);
      await c.query("delete from public.supplier_feed_secrets where feed_id = $1", [b.feed]); // sinon l'échec viendrait de la clé primaire
      await expectQueryError(c, "insert into public.supplier_feed_secrets (feed_id, organization_id, credentials_enc) values ($1, $2, 'x')", [b.feed, a.org], /CROSS_ORGANIZATION_REFERENCE/);
    });
  });

  it("champs d'offre complémentaires validés (pays ISO, régime de TVA, garantie, multiple)", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "b2b-o@example.test");
      const a = await seedOrg(c, alice, "b2b-o");
      await asService(c);
      const base = `insert into public.sourcing_offers (organization_id, supplier_id, source_id, source_type, external_offer_id, title_original, original_price, original_currency, normalized_price, normalized_currency, tax_type`;
      const { rows } = await c.query(
        `${base}, vat_regime, ship_from_country, warranty_months, order_multiple, last_import_job_id) values ($1, $2, $3, 'CSV', 'R-1', 'iPhone 13', 289, 'EUR', 289, 'EUR', 'ht', 'margin', 'DE', 12, 5, $4) returning vat_regime, ship_from_country`,
        [a.org, a.supplier, a.source, a.job],
      );
      expect(rows[0]).toEqual({ vat_regime: "margin", ship_from_country: "DE" });
      await expectQueryError(c, `${base}, vat_regime) values ($1, $2, $3, 'CSV', 'R-2', 'x', 1, 'EUR', 1, 'EUR', 'ht', 'deduced_from_country')`, [a.org, a.supplier, a.source], /check constraint/);
      await expectQueryError(c, `${base}, ship_from_country) values ($1, $2, $3, 'CSV', 'R-3', 'x', 1, 'EUR', 1, 'EUR', 'ht', 'de')`, [a.org, a.supplier, a.source], /check constraint/);
      await expectQueryError(c, `${base}, warranty_months) values ($1, $2, $3, 'CSV', 'R-4', 'x', 1, 'EUR', 1, 'EUR', 'ht', 500)`, [a.org, a.supplier, a.source], /check constraint/);
      await expectQueryError(c, `${base}, order_multiple) values ($1, $2, $3, 'CSV', 'R-5', 'x', 1, 'EUR', 1, 'EUR', 'ht', 0)`, [a.org, a.supplier, a.source], /check constraint/);
    });
  });

  it("supprimer un job d'import ne supprime aucune offre (lien remis à null)", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "b2b-del@example.test");
      const a = await seedOrg(c, alice, "b2b-del");
      await asService(c);
      const { rows } = await c.query(
        `insert into public.sourcing_offers (organization_id, supplier_id, source_id, source_type, external_offer_id, title_original, original_price, original_currency, normalized_price, normalized_currency, tax_type, last_import_job_id)
         values ($1, $2, $3, 'CSV', 'K-1', 'iPhone 13', 289, 'EUR', 289, 'EUR', 'ht', $4) returning id`,
        [a.org, a.supplier, a.source, a.job],
      );
      await c.query("delete from public.sourcing_import_jobs where id = $1", [a.job]);
      const after = await c.query("select last_import_job_id from public.sourcing_offers where id = $1", [rows[0].id]);
      expect(after.rows).toEqual([{ last_import_job_id: null }]);
      const issues = await c.query("select count(*)::int as n from public.sourcing_import_issues where job_id = $1", [a.job]);
      expect(issues.rows[0].n).toBe(0);
    });
  });
});
