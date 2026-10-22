/**
 * Intégration (PostgreSQL local) des migrations 20261023000200 / 0210 / 0220 :
 *   - S-18 : préparation transactionnelle d'un import (fournisseur → source → flux), recherche du
 *     fournisseur par égalité insensible à la casse SANS joker, RLS de l'utilisateur ;
 *   - S-04 : lots d'import réservés au serveur ;
 *   - I-05 : une nouvelle source de la bibliothèque exige une validation humaine tracée, celle de
 *     l'utilisateur connecté ;
 *   - I-16 : créneau par hôte partagé (réservation atomique), réservé au serveur.
 */
import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asService, asSuperuser, asUser, canConnect, createOrgAs, createUser, expectQueryError, withRollback } from "./helpers";

const available = await canConnect();
const d = available ? describe : describe.skip;

async function prepare(c: Client, org: string, name: string | null, supplierId: string | null = null) {
  const { rows } = await c.query(
    "select * from public.sourcing_prepare_catalog_import($1, $2, $3, 'CSV', 'EUR', 'ht', 'FR', 'csv', '{\"price\":\"Prix\"}'::jsonb, '{}'::jsonb)",
    [org, supplierId, name],
  );
  return rows[0] as { supplier_id: string; supplier_name: string; source_id: string; feed_id: string; supplier_created: boolean };
}

d("S-18 : préparation transactionnelle d'un import de catalogue", () => {
  it("égalité insensible à la casse, sans joker ; réutilisation de la source et du flux ; un seul jeu d'objets", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "rem-alice@example.test");
      const org = await createOrgAs(c, alice, "Org rem", "rem-a");
      await asUser(c, alice);
      await c.query("insert into public.suppliers (organization_id, name) values ($1, 'AxB')", [org]);
      // « A_B » ne retrouve PAS « AxB » (avant : ilike, « _ » = n'importe quel caractère)
      const first = await prepare(c, org, "A_B");
      expect(first.supplier_created).toBe(true);
      expect(first.supplier_name).toBe("A_B");
      // même nom, casse et espaces différents : même fournisseur, même source, même flux
      const again = await prepare(c, org, "  a_b ");
      expect(again).toMatchObject({ supplier_id: first.supplier_id, source_id: first.source_id, feed_id: first.feed_id, supplier_created: false });
      const pct = await prepare(c, org, "10%");
      expect(pct.supplier_created).toBe(true);
      const { rows: counts } = await c.query("select (select count(*) from public.suppliers where organization_id = $1)::int s, (select count(*) from public.supplier_sources where organization_id = $1)::int src, (select count(*) from public.supplier_feeds where organization_id = $1)::int f", [org]);
      expect(counts[0]).toEqual({ s: 3, src: 2, f: 2 });
      const { rows: src } = await c.query("select config, sync_frequency, status, automated_access_confirmed from public.supplier_sources where id = $1", [first.source_id]);
      expect(src[0]).toMatchObject({ config: { kind: "catalog_file_import" }, sync_frequency: "manual", status: "not_connected", automated_access_confirmed: true });
    });
  });

  it("RLS : un lecteur ne peut rien créer ; un fournisseur d'une autre organisation est introuvable ; aucun objet orphelin en cas d'échec", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "rem-own@example.test");
      const bob = await createUser(c, "rem-bob@example.test");
      const viewer = await createUser(c, "rem-viewer@example.test");
      const org = await createOrgAs(c, alice, "Org rem2", "rem-b");
      const other = await createOrgAs(c, bob, "Org rem3", "rem-c");
      await asSuperuser(c);
      await c.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'viewer')", [org, viewer]);
      await asUser(c, bob);
      const { rows: bs } = await c.query("insert into public.suppliers (organization_id, name) values ($1, 'Bob SA') returning id", [other]);
      await asUser(c, viewer);
      await expectQueryError(c, "select * from public.sourcing_prepare_catalog_import($1, null, 'Nouveau', 'CSV', 'EUR', 'ht', null, 'csv', '{}'::jsonb, '{}'::jsonb)", [org], /Droits insuffisants/);
      await asUser(c, alice);
      await expectQueryError(c, "select * from public.sourcing_prepare_catalog_import($1, $2, null, 'CSV', 'EUR', 'ht', null, 'csv', '{}'::jsonb, '{}'::jsonb)", [org, bs[0].id], /Fournisseur introuvable/);
      // format invalide : échec APRÈS la création du fournisseur → tout est annulé (transaction)
      await expectQueryError(c, "select * from public.sourcing_prepare_catalog_import($1, null, 'Orphelin', 'CSV', 'EUR', 'ht', null, 'pdf', '{}'::jsonb, '{}'::jsonb)", [org], /feed_format/);
      const { rows } = await c.query("select count(*)::int n from public.suppliers where organization_id = $1 and name = 'Orphelin'", [org]);
      expect(rows[0].n).toBe(0);
    });
  });
});

d("S-04 : lots d'import réservés au serveur", () => {
  it("un membre ne lit ni n'écrit les lots (contenu brut des fichiers) ; le serveur oui ; contrôle de progression", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "rem-chunks@example.test");
      const org = await createOrgAs(c, alice, "Org chunks", "rem-d");
      await asService(c);
      const { rows: j } = await c.query("insert into public.sourcing_import_jobs (organization_id, format, status, chunks_total) values ($1, 'csv', 'running', 1) returning id", [org]);
      await c.query("insert into public.sourcing_import_chunks (job_id, organization_id, chunk_index, first_index, row_count, rows) values ($1, $2, 0, 0, 1, '[{\"i\":0}]')", [j[0].id, org]);
      await expectQueryError(c, "update public.sourcing_import_jobs set chunks_done = 2 where id = $1", [j[0].id], /sourcing_import_jobs_progress_check/);
      await asUser(c, alice);
      await expectQueryError(c, "select * from public.sourcing_import_chunks", [], /permission denied/);
      await expectQueryError(c, "insert into public.sourcing_import_chunks (job_id, organization_id, chunk_index, first_index, row_count, rows) values ($1, $2, 1, 1, 1, '[]')", [j[0].id, org], /permission denied/);
      const { rows: jobs } = await c.query("select rows_processed, chunks_total, attempts from public.sourcing_import_jobs where id = $1", [j[0].id]);
      expect(jobs[0]).toEqual({ rows_processed: 0, chunks_total: 1, attempts: 0 });
    });
  });
});

d("I-05 : validation humaine tracée pour toute nouvelle source de la bibliothèque", () => {
  it("refus sans validateur ; refus si le validateur n'est pas l'utilisateur connecté ; accepté sinon ; les sources existantes ne sont pas touchées", async () => {
    await withRollback(async (c) => {
      const alice = await createUser(c, "rem-lib@example.test");
      const mallory = await createUser(c, "rem-mal@example.test");
      const org = await createOrgAs(c, alice, "Org lib", "rem-e");
      await asUser(c, alice);
      const { rows: s } = await c.query("insert into public.suppliers (organization_id, name) values ($1, 'Foneday') returning id", [org]);
      const insert = "insert into public.supplier_sources (organization_id, supplier_id, name, source_type, automated_access_confirmed, config, access_reviewed_by, access_reviewed_at, terms_url, terms_status) values ($1, $2, 'Foneday', 'PUBLIC_WEB', true, '{\"library_key\":\"foneday\",\"adapter\":\"shopify-storefront\"}', $3, $4, $5, $6) returning id";
      await expectQueryError(c, insert, [org, s[0].id, null, null, null, null], /validation tracée/);
      await expectQueryError(c, insert, [org, s[0].id, mallory, new Date().toISOString(), null, null], /utilisateur connecté/);
      await expectQueryError(c, insert, [org, s[0].id, alice, new Date().toISOString(), "http://www.foneday.shop/cgv", "user_declared"], /supplier_sources_terms_url_check/);
      await expectQueryError(c, insert, [org, s[0].id, alice, new Date().toISOString(), null, "lu par le serveur"], /supplier_sources_terms_status_check/);
      const ok = await c.query(insert, [org, s[0].id, alice, new Date().toISOString(), "https://www.foneday.shop/pages/terms", "user_declared"]);
      expect(ok.rows).toHaveLength(1);
      // source hors bibliothèque (import, saisie) : aucune exigence nouvelle
      await c.query("insert into public.supplier_sources (organization_id, supplier_id, name, source_type, automated_access_confirmed, config) values ($1, $2, 'Import', 'CSV', true, '{\"kind\":\"catalog_file_import\"}')", [org, s[0].id]);
      // le serveur (service_role) doit aussi nommer un validateur
      await asService(c);
      await expectQueryError(c, insert, [org, s[0].id, null, null, null, null], /validation tracée/);
      // une source déjà active n'est pas désactivée par la mise à jour (garde à l'insertion seulement)
      await c.query("update public.supplier_sources set access_conditions = 'x' where id = $1", [ok.rows[0].id]);
    });
  });
});

d("I-16 : créneau par hôte partagé", () => {
  it("réservations successives espacées du délai demandé ; refus (-1) au-delà de l'attente maximale ; réservé au serveur", async () => {
    await withRollback(async (c) => {
      await asService(c);
      const { rows } = await c.query("select public.sourcing_reserve_host_slot('https://Shop.Example', 3000, 10000) a, public.sourcing_reserve_host_slot('https://shop.example', 3000, 10000) b, public.sourcing_reserve_host_slot('https://shop.example', 3000, 4000) c, public.sourcing_reserve_host_slot('https://autre.example', 3000, 0) d");
      expect(rows[0].a).toBe(0);
      expect(rows[0].b).toBeGreaterThan(2_900);
      expect(rows[0].c).toBe(-1);
      expect(rows[0].d).toBe(0);
      const { rows: hosts } = await c.query("select host from public.sourcing_host_policies order by host");
      expect(hosts.map((h) => h.host)).toEqual(["https://autre.example", "https://shop.example"]);
      const u = await createUser(c, "rem-host@example.test");
      await asUser(c, u);
      await expectQueryError(c, "select public.sourcing_reserve_host_slot('https://x.example', 1, 1)", [], /permission denied/);
      await expectQueryError(c, "select * from public.sourcing_host_policies", [], /permission denied/);
    });
  });
});
