/**
 * Migrations 20261023000800 → 0820 (PostgreSQL réel) : limites de débit atomiques (S-15, I-29),
 * supervision des tâches planifiées (D-06, S-17, Q-07), compteur quotidien d'appels eBay (I-12).
 * Chaque test tourne dans une transaction annulée ; les assertions ne portent que sur ses lignes.
 */
import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asService, asSuperuser, asUser, canConnect, createOrgAs, createUser, expectQueryError, withRollback } from "./helpers";
import { addMember } from "./security-fixtures";

const available = await canConnect();
const d = available ? describe : describe.skip;

type Rate = { allowed: boolean; reason: string | null; retry_after_seconds: number | null };

async function reserve(c: Client, org: string, user: string, bucket: string, subject: string | null, limits: { cooldown?: number | null; user?: number | null; userWindow?: number; org?: number | null; orgWindow?: number }): Promise<Rate> {
  await asService(c);
  const { rows } = await c.query<{ r: Rate }>("select public.api_rate_reserve($1, $2, $3, $4, $5, $6, $7, $8, $9) as r", [org, user, bucket, subject, limits.cooldown ?? null, limits.user ?? null, limits.userWindow ?? 3600, limits.org ?? null, limits.orgWindow ?? 3600]);
  return rows[0]!.r;
}

async function ebayConnection(c: Client, org: string, patch: { lastSuccessHoursAgo: number | null; createdHoursAgo?: number; interval?: number; status?: string }): Promise<string> {
  await asSuperuser(c);
  const { rows: ch } = await c.query<{ id: string }>("insert into public.sales_channels (organization_id, provider, name) values ($1, 'ebay', 'eBay') returning id", [org]);
  const { rows } = await c.query<{ id: string }>(
    `insert into public.channel_connections (organization_id, sales_channel_id, provider, status, auto_sync, sync_interval_minutes, created_at, last_successful_sync_at)
     values ($1, $2, 'ebay', $3, true, $4, now() - make_interval(hours => $5), case when $6::int is null then null else now() - make_interval(hours => $6::int) end) returning id`,
    [org, ch[0]!.id, patch.status ?? "connected", patch.interval ?? 60, patch.createdHoursAgo ?? 48, patch.lastSuccessHoursAgo],
  );
  return rows[0]!.id;
}

d("Limites de débit atomiques (S-15, I-29)", () => {
  it("réservée au serveur ; délai par objet, plafond par utilisateur et par organisation ; table inaccessible aux clients", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "rl-owner@example.test");
      const org = await createOrgAs(c, owner, "Org RL", "rl-org");
      const member = await addMember(c, org, "rl-member@example.test", "member");

      await asUser(c, owner);
      await expectQueryError(c, "select public.api_rate_reserve($1, $2, 'ebay_sync', null, null, 1, 60, 1, 60)", [org, owner], /permission denied/);
      await expectQueryError(c, "select * from public.api_rate_events", [], /permission denied/);
      await expectQueryError(c, "insert into public.api_rate_events (organization_id, user_id, bucket) values ($1, $2, 'ebay_sync')", [org, owner], /permission denied/);

      // Délai minimal par objet : la même connexion est refusée, une autre passe.
      expect(await reserve(c, org, owner, "ebay_sync", "conn-1", { cooldown: 120 })).toEqual({ allowed: true, reason: null, retry_after_seconds: null });
      const again = await reserve(c, org, owner, "ebay_sync", "conn-1", { cooldown: 120 });
      expect(again).toMatchObject({ allowed: false, reason: "subject_cooldown" });
      expect(again.retry_after_seconds).toBeGreaterThan(100);
      expect((await reserve(c, org, member, "ebay_sync", "conn-2", { cooldown: 120 })).allowed).toBe(true);

      // Plafond par utilisateur (fenêtre glissante), compté par catégorie.
      expect((await reserve(c, org, owner, "shipping_quotes", null, { user: 2, userWindow: 60 })).allowed).toBe(true);
      expect((await reserve(c, org, owner, "shipping_quotes", null, { user: 2, userWindow: 60 })).allowed).toBe(true);
      expect(await reserve(c, org, owner, "shipping_quotes", null, { user: 2, userWindow: 60 })).toMatchObject({ allowed: false, reason: "user_limit" });
      expect((await reserve(c, org, member, "shipping_quotes", null, { user: 2, userWindow: 60 })).allowed).toBe(true);
      // Plafond de l'organisation (3 devis déjà acceptés).
      expect(await reserve(c, org, member, "shipping_quotes", null, { user: 10, userWindow: 60, org: 3, orgWindow: 60 })).toMatchObject({ allowed: false, reason: "org_limit" });

      // Paramètres invalides : erreur (le serveur refuse alors la demande : 503).
      await expectQueryError(c, "select public.api_rate_reserve($1, $2, 'Bad Bucket', null, null, 1, 60, 1, 60)", [org, owner], /API_RATE_BUCKET_INVALID/);

      await asSuperuser(c);
      const { rows } = await c.query("select bucket, count(*)::int as n from public.api_rate_events where organization_id = $1 group by bucket order by bucket", [org]);
      expect(rows).toEqual([
        { bucket: "ebay_sync", n: 2 },
        { bucket: "shipping_quotes", n: 3 },
      ]);
    });
  });
});

d("Supervision des tâches planifiées (D-06)", () => {
  it("connexion sans synchronisation réussie depuis plus de 2 h : alerte dans `alerts`, résolue au retour de la synchro ; idempotente", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "sup-owner@example.test");
      const org = await createOrgAs(c, owner, "Org Sup", "sup-org");
      const stale = await ebayConnection(c, org, { lastSuccessHoursAgo: 16 });
      const fresh = await ebayConnection(c, org, { lastSuccessHoursAgo: 1 });
      const never = await ebayConnection(c, org, { lastSuccessHoursAgo: null, createdHoursAgo: 3 });
      const slow = await ebayConnection(c, org, { lastSuccessHoursAgo: 3, interval: 240 }); // intervalle de 4 h : pas en retard
      const off = await ebayConnection(c, org, { lastSuccessHoursAgo: 30, status: "disconnected" });

      await asUser(c, owner);
      await expectQueryError(c, "select public.ops_supervise()", [], /permission denied/);

      await asService(c);
      await c.query("select public.ops_supervise()");
      await c.query("select public.ops_supervise()"); // rejeu : aucune alerte en double

      await asSuperuser(c);
      const alerts = async () => (await c.query<{ entity_id: string; status: string; type: string; title: string }>("select entity_id, status, type, title from public.alerts where organization_id = $1 and type = 'sync_stale' order by entity_id", [org])).rows;
      const open = (await alerts()).filter((a) => a.status !== "resolved").map((a) => a.entity_id).sort();
      expect(open).toEqual([stale, never].sort());
      expect((await alerts()).every((a) => a.title === "Synchronisation eBay en retard")).toBe(true);
      for (const id of [fresh, slow, off]) expect(open).not.toContain(id);
      const { rows: ev } = await c.query<{ source_ref: string; occurrences: number }>("select source_ref, occurrences from public.ops_supervision_events where kind = 'sync_stale' and organization_id = $1 order by source_ref", [org]);
      expect(ev.map((e) => e.source_ref).sort()).toEqual([stale, never].sort());
      expect(ev.every((e) => e.occurrences === 2)).toBe(true);

      // La synchronisation réussit de nouveau : alerte et événement résolus.
      await c.query("update public.channel_connections set last_successful_sync_at = now() where id = $1", [stale]);
      await asService(c);
      const { rows: r } = await c.query<{ r: { alerts_resolved: number } }>("select public.ops_supervise() as r");
      expect(r[0]!.r.alerts_resolved).toBeGreaterThanOrEqual(1);
      await asSuperuser(c);
      expect((await alerts()).find((a) => a.entity_id === stale)).toMatchObject({ status: "resolved" });
      const { rows: resolved } = await c.query("select resolved_at is not null as done from public.ops_supervision_events where kind = 'sync_stale' and source_ref = $1", [stale]);
      expect(resolved[0]).toEqual({ done: true });
      await expectQueryError(c, "select public.ops_supervise(interval '1 minute')", [], /OPS_SUPERVISE_INTERVAL_INVALID/);
    });
  });

  it("réponses pg_net non 2xx recopiées (une fois) depuis net._http_response ; journal inaccessible aux clients", async () => {
    await withRollback(async (c) => {
      await asSuperuser(c);
      const { rows: hasNet } = await c.query("select to_regclass('net._http_response') is not null as present");
      if (!hasNet[0].present) {
        // Base locale sans pg_net : table simulée avec les colonnes de pg_net (annulée en fin de test).
        await c.query("create schema if not exists net");
        await c.query("create table net._http_response (id bigint primary key, status_code integer, content_type text, headers jsonb, content text, timed_out boolean, error_msg text, created timestamptz not null default now())");
      }
      const base = 900_000_000 + Math.floor(Math.random() * 1_000_000);
      await c.query(
        `insert into net._http_response (id, status_code, content, timed_out, error_msg, created) values
          ($1, 200, '{"ok":true}', false, null, now()),
          ($2, 546, '{"code":"WORKER_RESOURCE_LIMIT"}', false, null, now()),
          ($3, null, null, true, 'Timeout of 150000 ms reached', now()),
          ($4, 503, 'x', false, null, now() - interval '3 days')`,
        [base, base + 1, base + 2, base + 3],
      );
      await asService(c);
      await c.query("select public.ops_supervise()");
      await c.query("select public.ops_supervise()");
      await asSuperuser(c);
      const { rows } = await c.query<{ source_ref: string; status_code: number | null; message: string; details: { timed_out: boolean; excerpt: string } }>(
        "select source_ref, status_code, message, details from public.ops_supervision_events where kind = 'cron_http_failure' and source_ref = any($1::text[]) order by source_ref",
        [[base, base + 1, base + 2, base + 3].map(String)],
      );
      expect(rows.map((r) => [r.source_ref, r.status_code])).toEqual([
        [String(base + 1), 546],
        [String(base + 2), null],
      ]);
      expect(rows[0]!.details.excerpt).toContain("WORKER_RESOURCE_LIMIT");
      expect(rows[1]).toMatchObject({ message: expect.stringMatching(/Timeout/), details: { timed_out: true } });

      const viewer = await createUser(c, "sup-viewer@example.test");
      await asUser(c, viewer);
      await expectQueryError(c, "select * from public.ops_supervision_events", [], /permission denied/);
    });
  });
});

d("Compteur quotidien d'appels eBay (I-12)", () => {
  it("cumul atomique par connexion et par jour UTC ; total de l'application ; lecture par les membres, écriture serveur", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "usage-owner@example.test");
      const org = await createOrgAs(c, owner, "Org Usage", "usage-org");
      const other = await createUser(c, "usage-other@example.test");
      const orgB = await createOrgAs(c, other, "Org Usage B", "usage-org-b");
      const conn = await ebayConnection(c, org, { lastSuccessHoursAgo: 1 });
      const connB = await ebayConnection(c, orgB, { lastSuccessHoursAgo: 1 });

      await asService(c);
      const add = async (id: string, n: number) => (await c.query<{ r: { calls: number; app_calls: number; usage_date: string } }>("select public.ebay_api_usage_add($1, $2) as r", [id, n])).rows[0]!.r;
      const before = (await add(conn, 0)).app_calls;
      expect(await add(conn, 17)).toMatchObject({ calls: 17, app_calls: before + 17 });
      expect(await add(conn, 3)).toMatchObject({ calls: 20 });
      expect(await add(connB, 5)).toMatchObject({ calls: 5, app_calls: before + 25 });
      await expectQueryError(c, "select public.ebay_api_usage_add($1, -1)", [conn], /EBAY_API_USAGE_INVALID/);

      await asUser(c, owner);
      await expectQueryError(c, "select public.ebay_api_usage_add($1, 1)", [conn], /permission denied/);
      const { rows } = await c.query("select connection_id, calls from public.ebay_api_usage_daily");
      // RLS : seules les lignes de sa propre organisation sont visibles.
      expect(rows).toEqual([{ connection_id: conn, calls: 20 }]);
      await expectQueryError(c, "update public.ebay_api_usage_daily set calls = 0", [], /permission denied/);
    });
  });
});
