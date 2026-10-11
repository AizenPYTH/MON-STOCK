/**
 * Migration 20261011000200 : conversations, messages et actions du conseiller IA (PostgreSQL réel, RLS).
 * - une conversation est PERSONNELLE : invisible des autres membres de la même organisation ;
 * - aucune ligne d'une autre organisation n'est lisible ni insérable ;
 * - une action ne peut être créée qu'« en attente » et ne peut pas être modifiée par l'utilisateur
 *   (seul le serveur, service_role, change son statut après confirmation).
 */
import { describe, expect, it } from "vitest";
import { asService, asUser, canConnect, createOrgAs, createSkuAs, createUser, expectQueryError, withRollback } from "./helpers";
import { addMember } from "./security-fixtures";

const available = await canConnect();
const d = available ? describe : describe.skip;

d("Conseiller IA : isolation et actions à confirmer", () => {
  it("conversations et messages : visibles par leur seul auteur", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "adv-owner@example.test");
      const org = await createOrgAs(c, owner, "Org", "adv-org");
      const colleague = await addMember(c, org, "adv-colleague@example.test", "member");
      const outsider = await createUser(c, "adv-out@example.test");
      await createOrgAs(c, outsider, "Autre", "adv-other");

      await asUser(c, owner);
      const { rows } = await c.query("insert into public.advisor_conversations (organization_id, title) values ($1, 'Bilan') returning id, user_id", [org]);
      const conv = rows[0].id as string;
      expect(rows[0].user_id).toBe(owner);
      await c.query("insert into public.advisor_messages (organization_id, conversation_id, role, content) values ($1, $2, 'user', 'Quel est mon CA ?')", [org, conv]);
      await expectQueryError(c, "insert into public.advisor_messages (organization_id, conversation_id, role, content) values ($1, $2, 'system', 'x')", [org, conv], /check constraint/);
      const upd = await c.query("update public.advisor_messages set content = 'falsifié' where conversation_id = $1", [conv]).catch((e: Error) => e);
      expect(upd instanceof Error ? upd.message : (upd as { rowCount: number }).rowCount).toSatisfy((v: unknown) => v === 0 || /permission denied|row-level security/.test(String(v)));

      await asUser(c, colleague);
      expect((await c.query("select count(*)::int as n from public.advisor_conversations")).rows[0].n).toBe(0);
      expect((await c.query("select count(*)::int as n from public.advisor_messages")).rows[0].n).toBe(0);
      await expectQueryError(c, "insert into public.advisor_messages (organization_id, conversation_id, role, content) values ($1, $2, 'user', 'intrus')", [org, conv], /row-level security|CROSS_ORGANIZATION_REFERENCE/);
      expect((await c.query("delete from public.advisor_conversations where id = $1", [conv])).rowCount).toBe(0);

      await asUser(c, outsider);
      expect((await c.query("select count(*)::int as n from public.advisor_conversations where organization_id = $1", [org])).rows[0].n).toBe(0);
      await expectQueryError(c, "insert into public.advisor_conversations (organization_id, title) values ($1, 'x')", [org], /row-level security/);

      await asUser(c, owner);
      expect((await c.query("delete from public.advisor_conversations where id = $1", [conv])).rowCount).toBe(1);
      expect((await c.query("select count(*)::int as n from public.advisor_messages where conversation_id = $1", [conv])).rows[0].n).toBe(0);
    });
  });

  it("actions : créées « en attente » seulement, jamais modifiables par l'utilisateur, statut changé par le serveur", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "act-owner@example.test");
      const org = await createOrgAs(c, owner, "Org", "act-org");
      const sku = await createSkuAs(c, owner, org, "IP13", { initial: 3, cost: 300, sale: 429 });
      await asUser(c, owner);
      const { rows: conv } = await c.query("insert into public.advisor_conversations (organization_id) values ($1) returning id", [org]);
      const insert = "insert into public.advisor_actions (organization_id, conversation_id, kind, sku_id, payload, summary, status, expires_at) values ($1, $2, 'adjust_stock', $3, '{}'::jsonb, 'Ajouter 2 unités', $4, now() + interval '10 minutes') returning id";
      await expectQueryError(c, insert, [org, conv[0].id, sku, "executed"], /row-level security/);
      const { rows } = await c.query(insert, [org, conv[0].id, sku, "pending"]);
      const action = rows[0].id as string;
      await expectQueryError(c, "insert into public.advisor_actions (organization_id, kind, sku_id, payload, summary, expires_at) values ($1, 'adjust_stock', $2, '{}'::jsonb, 'x', now() + interval '2 hours')", [org, sku], /check constraint/);
      await expectQueryError(c, "insert into public.advisor_actions (organization_id, kind, sku_id, payload, summary, expires_at) values ($1, 'buy_label', $2, '{}'::jsonb, 'x', now() + interval '5 minutes')", [org, sku], /check constraint/);

      // L'utilisateur ne peut pas « confirmer » en écrivant le statut lui-même.
      const r = await c.query("update public.advisor_actions set status = 'executed' where id = $1", [action]).catch((e: Error) => e);
      expect(r instanceof Error ? r.message : (r as { rowCount: number }).rowCount).toSatisfy((v: unknown) => v === 0 || /permission denied|row-level security/.test(String(v)));
      expect((await c.query("delete from public.advisor_actions where id = $1", [action]).catch(() => ({ rowCount: 0 }))).rowCount).toBe(0);
      expect((await c.query("select status from public.advisor_actions where id = $1", [action])).rows[0].status).toBe("pending");

      // Le serveur (service_role) réserve l'action une seule fois.
      await asService(c);
      expect((await c.query("update public.advisor_actions set status = 'executing' where id = $1 and status = 'pending'", [action])).rowCount).toBe(1);
      expect((await c.query("update public.advisor_actions set status = 'executing' where id = $1 and status = 'pending'", [action])).rowCount).toBe(0);
    });
  });

  it("une action ne peut viser un SKU d'une autre organisation", async () => {
    await withRollback(async (c) => {
      const a = await createUser(c, "x-a@example.test");
      const b = await createUser(c, "x-b@example.test");
      const orgA = await createOrgAs(c, a, "A", "x-a");
      const orgB = await createOrgAs(c, b, "B", "x-b");
      const skuB = await createSkuAs(c, b, orgB, "B1", { initial: 1 });
      await asUser(c, a);
      await expectQueryError(
        c,
        "insert into public.advisor_actions (organization_id, kind, sku_id, payload, summary, expires_at) values ($1, 'adjust_stock', $2, '{}'::jsonb, 'x', now() + interval '5 minutes')",
        [orgA, skuB],
        /CROSS_ORGANIZATION_REFERENCE|row-level security/,
      );
    });
  });
});
