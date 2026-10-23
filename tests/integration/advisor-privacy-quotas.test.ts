/**
 * Migrations 20261023000500 → 0530 (PostgreSQL réel) : quota IA atomique et réservé au serveur,
 * messages du conseiller insérables par le client en rôle « user » seulement, exécution atomique des
 * actions et reprise des actions bloquées, conservation limitée et purge à la suppression d'un compte eBay.
 */
import { describe, expect, it } from "vitest";
import { asService, asSuperuser, asUser, canConnect, connect, createOrgAs, createSkuAs, createUser, expectQueryError, withRollback } from "./helpers";
import { addMember } from "./security-fixtures";
import type { Client } from "pg";

const available = await canConnect();
const d = available ? describe : describe.skip;

type Reserve = { allowed: boolean; reason: string | null; event_id: string | null };

async function reserve(c: Client, org: string, user: string, kind: string, userLimit: number, orgLimit = 1000, extra: { tokens?: number | null; burst?: number | null } = {}): Promise<Reserve> {
  await asService(c);
  const { rows } = await c.query<{ r: Reserve }>("select public.ai_reserve_usage($1, $2, $3, $4, 3600, $5, 86400, $6, $7, $8, 60) as r", [org, user, kind, userLimit, orgLimit, [kind], extra.tokens ?? null, extra.burst ?? null]);
  return rows[0]!.r;
}

async function conversationWithAction(c: Client, owner: string, org: string, sku: string, kind: "adjust_stock" | "update_sku_price", payload: Record<string, unknown>): Promise<{ conv: string; action: string }> {
  await asUser(c, owner);
  const { rows: conv } = await c.query("insert into public.advisor_conversations (organization_id) values ($1) returning id", [org]);
  const { rows } = await c.query("insert into public.advisor_actions (organization_id, conversation_id, kind, sku_id, payload, summary, expires_at) values ($1, $2, $3, $4, $5::jsonb, 'Action', now() + interval '10 minutes') returning id", [org, conv[0].id, kind, sku, JSON.stringify(payload)]);
  return { conv: conv[0].id as string, action: rows[0].id as string };
}

async function claim(c: Client, action: string) {
  await asService(c);
  await c.query("update public.advisor_actions set status = 'executing', claimed_at = now() where id = $1 and status = 'pending'", [action]);
}

d("Quota IA atomique (S-09, S-10, I-14)", () => {
  it("insertion directe interdite aux clients ; réservation réservée au serveur ; limites par type, organisation, rafale et jetons", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "q-owner@example.test");
      const org = await createOrgAs(c, owner, "Org", "q-org");
      const outsider = await createUser(c, "q-out@example.test");

      // Un membre ne peut plus insérer lui-même (épuiser le quota de l'organisation ou se l'octroyer).
      await asUser(c, owner);
      await expectQueryError(c, "insert into public.ai_usage_events (organization_id, kind) values ($1, 'assistant')", [org], /permission denied|row-level security/);
      await expectQueryError(c, "select public.ai_reserve_usage($1, $2, 'assistant', 40, 3600, 400, 86400, array['assistant'])", [org, owner], /permission denied/);
      await expectQueryError(c, "select public.ai_record_usage_tokens(gen_random_uuid(), 1, 1)", [], /permission denied/);

      // Serveur : 2 autorisés, le 3e refusé (limite utilisateur).
      expect(await reserve(c, org, owner, "model_call", 2)).toMatchObject({ allowed: true, event_id: expect.any(String) });
      expect((await reserve(c, org, owner, "model_call", 2)).allowed).toBe(true);
      expect(await reserve(c, org, owner, "model_call", 2)).toEqual({ allowed: false, reason: "user_limit", event_id: null });
      // Les autres types ont leur propre compteur.
      expect((await reserve(c, org, owner, "speech", 1)).allowed).toBe(true);
      expect(await reserve(c, org, owner, "speech", 1)).toMatchObject({ allowed: false, reason: "user_limit" });
      // Limite de l'organisation.
      expect(await reserve(c, org, owner, "assistant", 100, 0)).toMatchObject({ allowed: false, reason: "org_limit" });
      // Rafale (questions par minute).
      expect((await reserve(c, org, owner, "assistant", 100, 1000, { burst: 1 })).allowed).toBe(true);
      expect(await reserve(c, org, owner, "assistant", 100, 1000, { burst: 1 })).toMatchObject({ allowed: false, reason: "burst_limit" });
      // Non-membre : refus explicite, rien d'inséré.
      expect(await reserve(c, org, outsider, "assistant", 100)).toMatchObject({ allowed: false, reason: "not_member" });
      // Type inconnu : erreur (le serveur refuse alors la demande : fail-closed).
      await expectQueryError(c, "select public.ai_reserve_usage($1, $2, 'image', 1, 3600, 1, 86400, array['image'])", [org, owner], /AI_USAGE_KIND_INVALID/);

      // Jetons : enregistrés une seule fois, budget de l'organisation appliqué.
      const r = await reserve(c, org, owner, "product_draft", 100);
      expect((await c.query("select public.ai_record_usage_tokens($1, 900, 100) as ok", [r.event_id])).rows[0].ok).toBe(true);
      expect((await c.query("select public.ai_record_usage_tokens($1, 1, 1) as ok", [r.event_id])).rows[0].ok).toBe(false);
      expect(await reserve(c, org, owner, "product_draft", 100, 1000, { tokens: 1000 })).toMatchObject({ allowed: false, reason: "org_tokens" });
      expect((await reserve(c, org, owner, "product_draft", 100, 1000, { tokens: 1001 })).allowed).toBe(true);

      await asSuperuser(c);
      const { rows } = await c.query("select kind, count(*)::int as n from public.ai_usage_events where organization_id = $1 group by kind order by kind", [org]);
      expect(rows).toEqual([
        { kind: "assistant", n: 1 },
        { kind: "model_call", n: 2 },
        { kind: "product_draft", n: 2 },
        { kind: "speech", n: 1 },
      ]);
      // Lecture : toujours possible pour ses propres lignes (compteur affiché sur le web).
      await asUser(c, owner);
      expect((await c.query("select count(*)::int as n from public.ai_usage_events where user_id = $1 and kind = 'assistant'", [owner])).rows[0].n).toBe(1);
    });
  });

  it("réservations SIMULTANÉES : jamais plus que la limite (verrou, pas de lecture-puis-insertion)", async () => {
    const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const setup = await connect();
    let org = "";
    let user = "";
    try {
      await setup.query("begin");
      user = await createUser(setup, `q-conc-${tag}@example.test`);
      org = await createOrgAs(setup, user, "Conc", `q-conc-${tag}`);
      await setup.query("commit");
      await asSuperuser(setup);
      const clients = await Promise.all(Array.from({ length: 12 }, () => connect()));
      try {
        const results = await Promise.all(
          clients.map(async (c) => {
            await c.query("begin");
            const r = await reserve(c, org, user, "assistant", 5);
            await c.query("commit");
            return r.allowed;
          }),
        );
        expect(results.filter(Boolean)).toHaveLength(5);
      } finally {
        await Promise.all(clients.map((c) => c.end()));
      }
      const { rows } = await setup.query("select count(*)::int as n from public.ai_usage_events where organization_id = $1", [org]);
      expect(rows[0].n).toBe(5);
    } finally {
      await asSuperuser(setup);
      if (org) await setup.query("delete from public.organizations where id = $1", [org]);
      if (user) await setup.query("delete from auth.users where id = $1", [user]);
      await setup.end();
    }
  });
});

d("Messages du conseiller : le client n'insère que ses questions (S-10)", () => {
  it("role « assistant » / « notice » et cartes refusés pour l'utilisateur ; acceptés pour le serveur", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "m-owner@example.test");
      const org = await createOrgAs(c, owner, "Org", "m-org");
      await asUser(c, owner);
      const { rows } = await c.query("insert into public.advisor_conversations (organization_id) values ($1) returning id", [org]);
      const conv = rows[0].id as string;
      await c.query("insert into public.advisor_messages (organization_id, conversation_id, role, content) values ($1, $2, 'user', 'Quel est mon CA ?')", [org, conv]);
      await expectQueryError(c, "insert into public.advisor_messages (organization_id, conversation_id, role, content) values ($1, $2, 'assistant', 'Texte arbitraire à faire lire')", [org, conv], /row-level security/);
      await expectQueryError(c, "insert into public.advisor_messages (organization_id, conversation_id, role, content) values ($1, $2, 'notice', 'Action confirmée et exécutée')", [org, conv], /row-level security/);
      await expectQueryError(c, "insert into public.advisor_messages (organization_id, conversation_id, role, content, cards) values ($1, $2, 'user', 'q', '[{\"kind\":\"draft\"}]'::jsonb)", [org, conv], /row-level security/);
      await asService(c);
      await c.query("insert into public.advisor_messages (organization_id, conversation_id, user_id, role, content) values ($1, $2, $3, 'assistant', '830 €')", [org, conv, owner]);
      await asUser(c, owner);
      expect((await c.query("select role from public.advisor_messages where conversation_id = $1 order by created_at, role desc", [conv])).rows.map((r) => r.role).sort()).toEqual(["assistant", "user"]);
    });
  });
});

d("Actions du conseiller : exécution atomique et reprise (S-19)", () => {
  it("ajustement : refusé tant que le serveur n'a pas réservé ; contrôle du stock et mouvement dans la même transaction", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "a-owner@example.test");
      const org = await createOrgAs(c, owner, "Org", "a-org");
      const sku = await createSkuAs(c, owner, org, "IP13", { initial: 3, cost: 300, sale: 429 });
      const { action } = await conversationWithAction(c, owner, org, sku, "adjust_stock", { change: 2, reason: "receipt", note: null, expectedAvailable: 3, code: "IP13" });

      // Non réservée (« pending ») : la confirmation explicite reste le seul chemin.
      await asUser(c, owner);
      await expectQueryError(c, "select public.advisor_execute_action($1)", [action], /ADVISOR_ACTION_NOT_CLAIMED/);

      await claim(c, action);
      await asUser(c, owner);
      const { rows } = await c.query("select public.advisor_execute_action($1) as r", [action]);
      expect(rows[0].r).toEqual({ kind: "adjust_stock", code: "IP13", quantityAfter: 5 });
      await asSuperuser(c);
      expect((await c.query("select status, result from public.advisor_actions where id = $1", [action])).rows[0]).toMatchObject({ status: "executed", result: { quantityAfter: 5 } });
      const mv = await c.query("select quantity, reference_type, reference_id, created_by from public.inventory_movements where sku_id = $1 and type = 'receipt'", [sku]);
      expect(mv.rows).toEqual([{ quantity: 2, reference_type: "advisor_action", reference_id: action, created_by: owner }]);
      // Rejeu : déjà exécutée → refus, aucun second mouvement.
      await asUser(c, owner);
      await expectQueryError(c, "select public.advisor_execute_action($1)", [action], /ADVISOR_ACTION_NOT_CLAIMED/);
    });
  });

  it("stock modifié entre la préparation et la confirmation : rien n'est modifié, l'action reste reprenable", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "s-owner@example.test");
      const org = await createOrgAs(c, owner, "Org", "s-org");
      const sku = await createSkuAs(c, owner, org, "S21", { initial: 3 });
      const { action } = await conversationWithAction(c, owner, org, sku, "adjust_stock", { change: -2, reason: "adjustment", note: null, expectedAvailable: 3, code: "S21" });
      await asUser(c, owner);
      await c.query("select public.apply_inventory_movement($1, $2, 'adjustment', -1)", [org, sku]);
      await claim(c, action);
      await asUser(c, owner);
      await expectQueryError(c, "select public.advisor_execute_action($1)", [action], /ADVISOR_STOCK_CHANGED/);
      await asSuperuser(c);
      expect((await c.query("select quantity_on_hand from public.inventory where sku_id = $1", [sku])).rows[0].quantity_on_hand).toBe(2);
      expect((await c.query("select status from public.advisor_actions where id = $1", [action])).rows[0].status).toBe("executing");
    });
  });

  it("prix : contrôle du prix attendu atomique ; autre utilisateur et rôle lecture seule refusés", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "p-owner@example.test");
      const org = await createOrgAs(c, owner, "Org", "p-org");
      const viewer = await addMember(c, org, "p-viewer@example.test", "viewer");
      const colleague = await addMember(c, org, "p-member@example.test", "member");
      const sku = await createSkuAs(c, owner, org, "PX", { initial: 1, sale: 429 });
      const { action } = await conversationWithAction(c, owner, org, sku, "update_sku_price", { newPrice: "449.90", expectedPrice: 429, code: "PX" });
      await claim(c, action);
      await asUser(c, colleague);
      await expectQueryError(c, "select public.advisor_execute_action($1)", [action], /ADVISOR_ACTION_NOT_FOUND/);
      await asUser(c, owner);
      expect((await c.query("select public.advisor_execute_action($1) as r", [action])).rows[0].r).toMatchObject({ kind: "update_sku_price", code: "PX" });
      await asSuperuser(c);
      expect(Number((await c.query("select sale_price from public.skus where id = $1", [sku])).rows[0].sale_price)).toBe(449.9);

      // Prix modifié depuis la préparation : refus, rien n'est modifié.
      const { action: stale } = await conversationWithAction(c, owner, org, sku, "update_sku_price", { newPrice: "10.00", expectedPrice: 429, code: "PX" });
      await claim(c, stale);
      await asUser(c, owner);
      await expectQueryError(c, "select public.advisor_execute_action($1)", [stale], /ADVISOR_PRICE_CHANGED/);

      // Membre en lecture seule (action insérée directement, réservée) : refus par la base.
      const { action: other } = await conversationWithAction(c, viewer, org, sku, "update_sku_price", { newPrice: "10.00", expectedPrice: 449.9, code: "PX" });
      await claim(c, other);
      await asUser(c, viewer);
      await expectQueryError(c, "select public.advisor_execute_action($1)", [other], /FORBIDDEN|permission denied/);
      await asSuperuser(c);
      expect(Number((await c.query("select sale_price from public.skus where id = $1", [sku])).rows[0].sale_price)).toBe(449.9);
    });
  });

  it("reprise des actions restées « executing » : échec explicite, réservée au serveur", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "r-owner@example.test");
      const org = await createOrgAs(c, owner, "Org", "r-org");
      const sku = await createSkuAs(c, owner, org, "RX", { initial: 1 });
      const { action } = await conversationWithAction(c, owner, org, sku, "adjust_stock", { change: 1, reason: "receipt", note: null, expectedAvailable: 1, code: "RX" });
      await asService(c);
      await c.query("update public.advisor_actions set status = 'executing', claimed_at = now() - interval '5 minutes' where id = $1", [action]);
      await asUser(c, owner);
      await expectQueryError(c, "select public.advisor_recover_stuck_actions()", [], /permission denied/);
      await asService(c);
      expect((await c.query("select public.advisor_recover_stuck_actions(interval '10 minutes') as n")).rows[0].n).toBe(0);
      expect((await c.query("select public.advisor_recover_stuck_actions(interval '2 minutes', $1) as n", [action])).rows[0].n).toBe(1);
      expect((await c.query("select status, error from public.advisor_actions where id = $1", [action])).rows[0]).toMatchObject({ status: "failed", error: expect.stringMatching(/rien n'a été modifié/) });
    });
  });
});

d("Conservation limitée et suppression de compte eBay (I-08, D-10, Q-09)", () => {
  it("purge selon la politique configurable ; serveur uniquement", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "ret-owner@example.test");
      const org = await createOrgAs(c, owner, "Org", "ret-org");
      await asService(c);
      const { rows: convs } = await c.query(
        "insert into public.advisor_conversations (organization_id, user_id, title, last_message_at) values ($1, $2, 'vieille', now() - interval '200 days'), ($1, $2, 'récente', now() - interval '1 day') returning id, title",
        [org, owner],
      );
      const recent = convs.find((r) => r.title === "récente")!.id;
      const old = convs.find((r) => r.title === "vieille")!.id;
      await c.query("insert into public.advisor_messages (organization_id, conversation_id, user_id, role, content, cards, created_at) values ($1, $2, $3, 'assistant', 'ancienne réponse', '[{\"kind\":\"list\"}]'::jsonb, now() - interval '40 days'), ($1, $2, $3, 'assistant', 'récente', '[{\"kind\":\"list\"}]'::jsonb, now())", [org, recent, owner]);
      await c.query("insert into public.ai_usage_events (organization_id, user_id, kind, created_at) values ($1, $2, 'assistant', now() - interval '400 days'), ($1, $2, 'assistant', now())", [org, owner]);

      await asUser(c, owner);
      await expectQueryError(c, "select public.advisor_purge_expired()", [], /permission denied/);
      await expectQueryError(c, "select * from public.advisor_retention_policy", [], /permission denied/);

      await asService(c);
      // La purge est globale (cron) : d'autres fichiers de test peuvent avoir laissé des lignes
      // anciennes dans la base partagée. Les compteurs sont donc des minimums, et l'effet exact est
      // vérifié ligne par ligne sur les données créées ici.
      const { rows } = await c.query("select public.advisor_purge_expired() as r");
      expect(rows[0].r.conversationsDeleted).toBeGreaterThanOrEqual(1);
      expect(rows[0].r.messagesCardsCleared).toBeGreaterThanOrEqual(1);
      expect(rows[0].r.usageEventsDeleted).toBeGreaterThanOrEqual(1);
      await asSuperuser(c);
      const usage = (await c.query("select created_at > now() - interval '1 day' as recent from public.ai_usage_events where organization_id = $1", [org])).rows;
      expect(usage).toEqual([{ recent: true }]);
      expect((await c.query("select count(*)::int as n from public.advisor_conversations where id = $1", [recent])).rows[0].n).toBe(1);
      expect((await c.query("select count(*)::int as n from public.advisor_conversations where id = $1", [old])).rows[0].n).toBe(0);
      const msgs = (await c.query("select content, cards from public.advisor_messages where conversation_id = $1 order by created_at", [recent])).rows;
      expect(msgs).toEqual([
        { content: "ancienne réponse", cards: [] },
        { content: "récente", cards: [{ kind: "list" }] },
      ]);

      // Durées configurables (ex. conversations conservées 1 jour seulement).
      await asService(c);
      await c.query("update public.advisor_retention_policy set conversation_days = 1, card_days = 0");
      expect((await c.query("select public.advisor_purge_expired(now() + interval '2 days') as r")).rows[0].r.conversationsDeleted).toBeGreaterThanOrEqual(1);
      await asSuperuser(c);
      expect((await c.query("select count(*)::int as n from public.advisor_conversations where id = $1", [recent])).rows[0].n).toBe(0);
      await asService(c);
      await expectQueryError(c, "update public.advisor_retention_policy set usage_event_days = 1", [], /check constraint/);
    });
  });

  it("compte eBay supprimé : cartes et textes du conseiller purgés (fonction et déclencheurs d'anonymisation)", async () => {
    await withRollback(async (c) => {
      const owner = await createUser(c, "del-owner@example.test");
      const org = await createOrgAs(c, owner, "Org", "del-org");
      await asService(c);
      const { rows: conv } = await c.query("insert into public.advisor_conversations (organization_id, user_id, title) values ($1, $2, 'Commande de jean.d_77 ?') returning id", [org, owner]);
      const card = JSON.stringify([{ kind: "list", title: "Commande", rows: [{ label: "Acheteur", value: "Acheteur K7QM — jean.d_77", detail: "Jean Dupont · Lyon · 69003", tone: "neutral" }] }]);
      const other = JSON.stringify([{ kind: "kpis", title: "Bilan", rows: [{ label: "CA", value: "1 €", detail: "jean.d_778", tone: "neutral" }] }]);
      await c.query(
        "insert into public.advisor_messages (organization_id, conversation_id, user_id, role, content, cards) values ($1, $2, $3, 'user', 'Que veut JEAN.D_77 ?', '[]'), ($1, $2, $3, 'assistant', 'jean.d_77 attend sa commande. Voir jean.d_778.', $4::jsonb), ($1, $2, $3, 'assistant', 'Bilan', $5::jsonb)",
        [org, conv[0].id, owner, card, other],
      );
      // Déclencheur : le serveur anonymise le pseudo d'une commande (notification eBay).
      const { rows: ch } = await c.query("insert into public.sales_channels (organization_id, provider, name) values ($1, 'ebay', 'eBay') returning id", [org]);
      const { rows: cn } = await c.query("insert into public.channel_connections (organization_id, sales_channel_id, provider, status, external_username) values ($1, $2, 'ebay', 'connected', 'vendeur_x') returning id", [org, ch[0].id]);
      await c.query("insert into public.orders (organization_id, sales_channel_id, connection_id, provider, external_order_id, buyer_username, placed_at) values ($1, $2, $3, 'ebay', 'D-1', 'jean.d_77', now()), ($1, $2, $3, 'ebay', 'D-2', 'jean.d_77', now())", [org, ch[0].id, cn[0].id]);
      await c.query("update public.orders set buyer_username = '[compte eBay supprimé]' where provider = 'ebay' and buyer_username = 'jean.d_77'");

      await asSuperuser(c);
      const msgs = (await c.query("select role, content, cards from public.advisor_messages where conversation_id = $1 order by role desc, content", [conv[0].id])).rows;
      expect(msgs.find((m) => m.role === "user")!.content).toBe("Que veut [compte eBay supprimé] ?");
      const answer = msgs.find((m) => m.content.startsWith("[compte"))!;
      expect(answer.content).toBe("[compte eBay supprimé] attend sa commande. Voir jean.d_778.");
      expect(answer.cards).toEqual([]);
      // un autre pseudo (préfixe identique) n'est pas touché
      expect(msgs.find((m) => m.content === "Bilan")!.cards).toHaveLength(1);
      expect((await c.query("select title from public.advisor_conversations where id = $1", [conv[0].id])).rows[0].title).toBe("Commande de [compte eBay supprimé] ?");

      // Vendeur supprimé : même purge via la connexion ; pseudo court ignoré.
      await asService(c);
      await c.query("insert into public.advisor_messages (organization_id, conversation_id, user_id, role, content) values ($1, $2, $3, 'assistant', 'Compte vendeur_x en règle.')", [org, conv[0].id, owner]);
      await c.query("update public.channel_connections set external_username = '[compte eBay supprimé]' where id = $1", [cn[0].id]);
      expect((await c.query("select count(*)::int as n from public.advisor_messages where content like '%vendeur_x%'")).rows[0].n).toBe(0);
      expect((await c.query("select public.advisor_purge_ebay_account('a') as r")).rows[0].r).toEqual({ cardsCleared: 0, messagesRewritten: 0, titlesRewritten: 0 });
      await asUser(c, owner);
      await expectQueryError(c, "select public.advisor_purge_ebay_account('x_y_z')", [], /permission denied/);
    });
  });
});
