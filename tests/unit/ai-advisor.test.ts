import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdvisorStreamEvent } from "@/features/mobile-api/contract";

/**
 * Conseiller e-commerce IA (serveur). Tout est simulé : le modèle (faux `LlmClient` qui diffuse le texte), la base
 * (faux client Supabase / magasin en mémoire). Aucun appel réseau, aucun achat.
 */
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => ({}) }));

const { computeProfitability, productProfits, periodRange, parisMidnight, change, percent, money } = await import("@/services/ai/advisor-metrics");
const { runAdvisorTurn, historyForModel, advisorSystemVolatile, ADVISOR_SYSTEM_STABLE, ADVISOR_LIMITS } = await import("@/services/ai/advisor");
const { ADVISOR_TOOLS, ADVISOR_TOOL_DEFINITIONS, runAdvisorTool } = await import("@/services/ai/advisor-tools");
const { decideAdvisorAction, ACTION_TTL_MS } = await import("@/services/ai/advisor-actions");
const { fakeSupabase } = await import("./helpers/fake-supabase");

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const OTHER_USER = "33333333-3333-4333-8333-333333333333";
const ACTION = "44444444-4444-4444-8444-444444444444";
const SKU = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-10-14T10:00:00Z"); // mercredi

function orgCtx(supabase: unknown, role: "owner" | "admin" | "member" | "viewer" = "owner") {
  return { supabase, user: { id: USER }, profile: {}, organization: { id: ORG, name: "Boutique", default_currency: "EUR" }, role, memberships: [] } as never;
}

// ---------------------------------------------------------------------------
// Calculs
// ---------------------------------------------------------------------------

describe("calculs : CA, coût d'achat, frais, marges", () => {
  const orders = [
    { id: "o1", currency: "EUR", feeCents: 1200 },
    { id: "o2", currency: "EUR", feeCents: null },
  ];
  const lines = [
    { orderId: "o1", skuId: "s1", sku: "IP13", title: "iPhone 13", quantity: 1, totalCents: 40000, currency: "EUR", unitCostCents: 30000 },
    { orderId: "o1", skuId: "s2", sku: "COQ", title: "Coque", quantity: 2, totalCents: 2000, currency: "EUR", unitCostCents: null },
    { orderId: "o2", skuId: "s1", sku: "IP13", title: "iPhone 13", quantity: 1, totalCents: 41000, currency: "EUR", unitCostCents: 30000 },
    { orderId: "o2", skuId: null, sku: null, title: "Vente USD", quantity: 1, totalCents: 5000, currency: "USD", unitCostCents: null },
  ];

  it("distingue CA, marge brute (coûts connus), frais et bénéfice estimé ; signale les manques", () => {
    const p = computeProfitability(lines, orders, "EUR");
    expect(p.revenueCents).toBe(83000);
    expect(p.orders).toBe(2);
    expect(p.units).toBe(4);
    expect(p.revenueWithCostCents).toBe(81000);
    expect(p.costCents).toBe(60000);
    expect(p.grossMarginCents).toBe(21000);
    expect(p.feesCents).toBe(1200);
    // o2 sans frais communiqués : bénéfice net non calculable (jamais supposé à 0 €)
    expect(p.netProfitEstimateCents).toBeNull();
    expect(p.coverage).toMatchObject({ linesWithoutCost: 1, unitsWithoutCost: 2, ordersWithoutFees: 1 });
    expect(p.otherCurrencies).toEqual({ USD: 5000 });
    expect(p.missing.join(" ")).toMatch(/Prix d'achat inconnu pour 1 ligne/);
    expect(p.missing.join(" ")).toMatch(/Frais de vente non communiqués pour 1 commande/);
    expect(p.missing.join(" ")).toMatch(/Ventes en USD/);
    expect(p.missing.join(" ")).toMatch(/non enregistrés/);
  });

  it("frais répartis au prorata : bénéfice estimé quand tout est connu", () => {
    const p = computeProfitability([lines[0]!, { ...lines[1]!, unitCostCents: 300 }], [orders[0]!], "EUR");
    // frais 12 € répartis 400/420 et 20/420
    expect(p.feesOnCostedLinesCents).toBe(1200);
    expect(p.netProfitEstimateCents).toBe(42000 - 30600 - 1200);
    expect(p.netMarginRate).toBeCloseTo(10200 / 42000, 6);
  });

  it("aucune vente : zéros, pas de marge inventée", () => {
    const p = computeProfitability([], [], "EUR");
    expect(p.revenueCents).toBe(0);
    expect(p.grossMarginCents).toBeNull();
    expect(p.netProfitEstimateCents).toBeNull();
    expect(change(0, 0)).toBeNull();
    expect(change(150, 100)).toBeCloseTo(0.5);
  });

  it("rentabilité par produit : null si coût ou frais manquent", () => {
    const r = productProfits(lines, orders, "EUR");
    const ip = r.find((x) => x.sku === "IP13")!;
    expect(ip.units).toBe(2);
    expect(ip.profitCents).toBeNull(); // o2 sans frais
    const coque = r.find((x) => x.sku === "COQ")!;
    expect(coque.costCents).toBeNull();
    expect(coque.profitCents).toBeNull();
  });

  it("formats français", () => {
    expect(money(123450, "EUR")).toMatch(/^1\s?234,50\s€$/);
    expect(percent(0.256)).toMatch(/^25,6\s%$/);
    expect(percent(null)).toBe("—");
  });
});

describe("périodes (calendrier de Paris)", () => {
  it("cette semaine = depuis lundi minuit à Paris, comparée à la même durée", () => {
    const r = periodRange("this_week", NOW);
    expect(r.from).toBe("2026-10-11T22:00:00.000Z"); // lundi 12/10 00:00 à Paris (UTC+2)
    expect(r.to).toBe("2026-10-14T22:00:00.000Z");
    expect(r.previous.from).toBe("2026-10-04T22:00:00.000Z");
    expect(r.label).toMatch(/lundi 12\/10\/2026/);
  });
  it("ce mois-ci / mois dernier ; heure d'hiver", () => {
    expect(periodRange("this_month", NOW).from).toBe("2026-09-30T22:00:00.000Z");
    const last = periodRange("last_month", NOW);
    expect([last.from, last.to]).toEqual(["2026-08-31T22:00:00.000Z", "2026-09-30T22:00:00.000Z"]);
    expect(parisMidnight("2026-12-01").toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Boucle de conversation
// ---------------------------------------------------------------------------

type Msg = { model: string; finish: "stop" | "tool_calls" | "length" | "refusal"; text: string; toolCalls: { id: string; name: string; input: unknown }[] };
function fakeModel(responses: (Msg | Error)[]) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    async complete(req: object, opts: { onText?: (d: string) => void } = {}) {
      calls.push(structuredClone(req) as Record<string, unknown>);
      const r = responses.shift();
      if (!r) throw new Error("plus de réponse simulée");
      if (r instanceof Error) throw r;
      for (const part of r.text.match(/.{1,12}/gs) ?? []) opts.onText?.(part);
      return r;
    },
  };
  return { client, calls };
}

function memoryStore(history: { role: "user" | "assistant" | "notice"; content: string }[] = []) {
  const saved: { role: string; content: string; cards?: unknown[]; interrupted?: boolean }[] = [];
  return {
    saved,
    store: {
      openConversation: async (id: string | null | undefined) => id ?? "conv-1",
      history: async () => history,
      addMessage: async (_c: string, m: { role: string; content: string; cards?: unknown[]; interrupted?: boolean }) => {
        saved.push(m);
        return `msg-${saved.length}`;
      },
    },
  };
}

const text = (t: string, finish: Msg["finish"] = "stop"): Msg => ({ model: "gpt-5.4-mini", finish, text: t, toolCalls: [] });
const toolUse = (name: string, input: unknown, id = "call_1"): Msg => ({ model: "gpt-5.4-mini", finish: "tool_calls", text: "", toolCalls: [{ id, name, input }] });

describe("conversation textuelle et vocale", () => {
  it("diffuse la réponse au fil de l'eau et enregistre question + réponse", async () => {
    const { client, calls } = fakeModel([text("Bonjour ! Posez-moi une question sur vos ventes.")]);
    const { store, saved } = memoryStore();
    const events: AdvisorStreamEvent[] = [];
    const reply = await runAdvisorTurn(orgCtx(fakeSupabase().client), { message: "Salut" }, (e) => events.push(e), { client, store, now: NOW, runTool: vi.fn() });
    expect(events[0]).toEqual({ type: "conversation", conversationId: "conv-1" });
    const deltas = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta);
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join("")).toBe(reply.answer);
    expect(events.at(-1)).toMatchObject({ type: "done", reply: { answer: reply.answer, interrupted: false } });
    expect(saved.map((m) => m.role)).toEqual(["user", "assistant"]);
    // invite : partie stable EN TÊTE (cache d'invite), outils déclarés, effort et plafond explicites
    const p = calls[0]! as { system: string; tools: { name: string }[]; effort: string; maxTokens: number; cacheKey: string };
    expect(p.system.startsWith(ADVISOR_SYSTEM_STABLE)).toBe(true);
    expect(p.tools.length).toBe(ADVISOR_TOOL_DEFINITIONS.length);
    expect(p.effort).toBe("medium");
    expect(p.cacheKey).toBe("mon-stock-advisor");
    expect(p.maxTokens).toBe(ADVISOR_LIMITS.maxTokens);
  });

  it("question dictée : consigne de réponse courte lue à voix haute", () => {
    expect(advisorSystemVolatile({ name: "B", currency: "EUR", role: "owner" }, "mardi", true)).toMatch(/LUE À VOIX HAUTE/);
    expect(advisorSystemVolatile({ name: "B", currency: "EUR", role: "viewer" }, "mardi", false)).toMatch(/lecture seule/);
  });

  it("appelle un outil, affiche son état et ses cartes, puis répond avec ses chiffres", async () => {
    const { client, calls } = fakeModel([toolUse("business_report", { period: "this_week" }), text("Cette semaine : 830 € de chiffre d'affaires.")]);
    const { store, saved } = memoryStore();
    const card = { kind: "kpis", title: "Bilan des ventes", subtitle: null, rows: [], warnings: [], action: null, text: null };
    const runTool = vi.fn(async () => ({ content: JSON.stringify({ revenue: "830,00 €" }), isError: false, cards: [card] }));
    const events: AdvisorStreamEvent[] = [];
    const reply = await runAdvisorTurn(orgCtx(fakeSupabase().client), { message: "Quel est mon CA cette semaine ?" }, (e) => events.push(e), { client, store, now: NOW, runTool: runTool as never });
    expect(runTool).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG, conversationId: "conv-1" }), "business_report", { period: "this_week" });
    expect(events).toContainEqual({ type: "status", label: "Bilan de l'activité" });
    expect(events).toContainEqual({ type: "card", card });
    expect(reply.sources).toEqual(["Bilan de l'activité"]);
    expect(reply.cards).toEqual([card]);
    expect(saved.at(-1)).toMatchObject({ role: "assistant", cards: [card] });
    // l'appel d'outil puis son résultat sont renvoyés au modèle (message « tool » lié à l'appel)
    const second = calls[1] as { messages: Record<string, unknown>[] };
    expect(second.messages.at(-2)).toMatchObject({ role: "assistant", toolCalls: [{ id: "call_1", name: "business_report" }] });
    expect(second.messages.at(-1)).toEqual({ role: "tool", toolCallId: "call_1", content: JSON.stringify({ revenue: "830,00 €" }) });
  });

  it("erreur d'outil transmise comme telle (préfixe ERREUR), jamais complétée", async () => {
    const { client, calls } = fakeModel([toolUse("order_lookup", { orderNumber: "X" }), text("Je n'ai pas pu lire la commande.")]);
    const runTool = vi.fn(async () => ({ content: "Lecture des données impossible : timeout", isError: true, cards: [] }));
    await runAdvisorTurn(orgCtx(fakeSupabase().client), { message: "commande X ?" }, () => undefined, { client, store: memoryStore().store, now: NOW, runTool: runTool as never });
    expect((calls[1] as { messages: { content: string }[] }).messages.at(-1)!.content).toBe("ERREUR : Lecture des données impossible : timeout");
  });

  it("refus du modèle : message clair", async () => {
    const { client } = fakeModel([{ model: "m", finish: "refusal", text: "", toolCalls: [] }]);
    const r = await runAdvisorTurn(orgCtx(fakeSupabase().client), { message: "?" }, () => undefined, { client, store: memoryStore().store, now: NOW, runTool: vi.fn() });
    expect(r.answer).toMatch(/ne peux pas répondre/);
  });

  it("erreur réseau / API : erreur utilisateur, réponse partielle enregistrée comme interrompue", async () => {
    const { client } = fakeModel([new Error("ECONNRESET")]);
    const { store, saved } = memoryStore();
    await expect(runAdvisorTurn(orgCtx(fakeSupabase().client), { message: "bilan" }, () => undefined, { client, store, now: NOW, runTool: vi.fn() })).rejects.toThrow(/erreur inattendue|indisponible|injoignable/);
    expect(saved.at(-1)).toMatchObject({ role: "assistant", interrupted: true });
  });

  it("trop d'étapes d'outils : réponse marquée interrompue", async () => {
    const loops = Array.from({ length: ADVISOR_LIMITS.maxSteps }, (_, i) => toolUse("today_briefing", {}, `call_${i}`));
    const { client } = fakeModel(loops);
    const r = await runAdvisorTurn(orgCtx(fakeSupabase().client), { message: "tout" }, () => undefined, {
      client,
      store: memoryStore().store,
      now: NOW,
      runTool: (async () => ({ content: "{}", isError: false, cards: [] })) as never,
    });
    expect(r.interrupted).toBe(true);
  });

  it("historique borné, rôles alternés, notes de l'application identifiées", () => {
    const h = historyForModel(
      [
        { role: "assistant", content: "orphelin" },
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "notice", content: "Action confirmée et exécutée : stock mis à jour." },
        { role: "user", content: "c" },
      ],
      10_000,
    );
    expect(h.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(h[2]!.content).toBe("[Note de l'application] Action confirmée et exécutée : stock mis à jour.\n\nc");
    const long = historyForModel([{ role: "user", content: "x".repeat(9000) }, { role: "assistant", content: "y".repeat(9000) }, { role: "user", content: "z" }], 10_000);
    expect(long.map((m) => m.content.length)).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// Outils : lecture, préparation, catégories
// ---------------------------------------------------------------------------

function toolCtx(supabase: unknown, role: "owner" | "viewer" = "owner") {
  return { supabase, organizationId: ORG, currency: "EUR", org: orgCtx(supabase, role), conversationId: "conv-1", now: NOW } as never;
}

describe("outils du conseiller", () => {
  it("aucun outil d'exécution n'est exposé au modèle ; schémas fermés", () => {
    const names = ADVISOR_TOOL_DEFINITIONS.map((t) => t.name);
    for (const n of names) expect(n).not.toMatch(/(^|_)(execute|confirm|buy|purchase|send|publish|delete|update|sql)(_|$)/);
    for (const t of Object.values(ADVISOR_TOOLS)) expect(["read", "prepare"]).toContain(t.category);
    for (const d of ADVISOR_TOOL_DEFINITIONS) expect((d.input_schema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    expect(ADVISOR_TOOLS.prepare_stock_adjustment!.category).toBe("prepare");
  });

  it("bilan : ventes de la période filtrées par organisation, statuts exclus, manques listés", async () => {
    const { client, queries } = fakeSupabase({
      order_items: {
        data: [
          { order_id: "o1", sku_id: SKU, title: "iPhone 13", quantity: 2, unit_price: 400, total: 800, currency: "EUR", skus: { code: "IP13", cost_price: 300, currency: "EUR" }, orders: { id: "o1", placed_at: "2026-10-13T09:00:00Z", status: "paid", currency: "EUR", fee_total: 96 } },
          { order_id: "o2", sku_id: null, title: "Câble", quantity: 1, unit_price: 30, total: 30, currency: "EUR", skus: null, orders: { id: "o2", placed_at: "2026-10-13T10:00:00Z", status: "shipped", currency: "EUR", fee_total: null } },
        ],
      },
      orders: { data: [{ status: "refunded", total: 120, currency: "EUR" }] },
    });
    const r = await runAdvisorTool(toolCtx(client), "business_report", { period: "this_week" });
    expect(r.isError).toBe(false);
    const result = JSON.parse(r.content);
    expect(result.current.revenue).toMatch(/^830,00\s€$/);
    expect(result.current.grossMargin).toMatch(/^200,00\s€$/);
    expect(result.current.netProfitEstimate).toMatch(/^104,00\s€$/);
    expect(result.cancellationsAndRefunds.refundedOrders).toBe(1);
    expect(result.current.missing.join(" ")).toMatch(/Prix d'achat inconnu pour 1 ligne/);
    const sales = queries.find((q) => q.target === "order_items")!;
    expect(sales.calls).toContainEqual({ method: "eq", args: ["organization_id", ORG] });
    expect(sales.calls).toContainEqual({ method: "not", args: ["orders.status", "in", "(cancelled,refunded)"] });
    expect(r.cards[0]).toMatchObject({ kind: "kpis", title: "Bilan des ventes" });
  });

  it("aucune vente : zéro, aucune marge inventée", async () => {
    const { client } = fakeSupabase({ order_items: { data: [] }, orders: { data: [] } });
    const r = JSON.parse((await runAdvisorTool(toolCtx(client), "business_report", {})).content);
    expect(r.current.revenue).toMatch(/^0,00\s€$/);
    expect(r.current.grossMargin).toBeNull();
    expect(r.current.netProfitEstimate).toBeNull();
  });

  it("paramètres invalides refusés (jamais devinés)", async () => {
    const r = await runAdvisorTool(toolCtx(fakeSupabase().client), "business_report", { period: "demain" });
    expect(r).toMatchObject({ isError: true });
    expect((await runAdvisorTool(toolCtx(fakeSupabase().client), "execute_sql", {})).content).toMatch(/Outil inconnu/);
  });

  it("préparer un ajustement : rôle lecture seule refusé, SKU introuvable signalé", async () => {
    const viewer = await runAdvisorTool(toolCtx(fakeSupabase().client, "viewer"), "prepare_stock_adjustment", { sku: "IP13", change: 2 });
    expect(JSON.parse(viewer.content)).toMatchObject({ prepared: false });
    const { client } = fakeSupabase({ v_stock_overview: { data: [] } });
    const missing = await runAdvisorTool(toolCtx(client), "prepare_stock_adjustment", { sku: "XX", change: 2 });
    expect(JSON.parse(missing.content).reason).toMatch(/introuvable/);
  });

  it("préparer un ajustement : demande « en attente » avec phrase exacte, rien n'est exécuté", async () => {
    const pending = { id: ACTION, kind: "adjust_stock", status: "pending", summary: "Ajouter 2 unité(s)…", amount: null, currency: null, expires_at: "2026-10-14T10:10:00Z", result: null, error: null };
    const { client, queries } = fakeSupabase({
      v_stock_overview: { data: [{ sku_id: SKU, code: "IP13", product_name: "iPhone 13", variant_name: "128 Go", quantity_available: 3, quantity_on_hand: 3, cost_price: 300, sale_price: 429, currency: "EUR" }] },
      advisor_actions: { data: pending },
    });
    const r = await runAdvisorTool(toolCtx(client), "prepare_stock_adjustment", { sku: "IP13", change: 2, reason: "receipt" });
    const insert = queries.find((q) => q.target === "advisor_actions")!.calls.find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ kind: "adjust_stock", sku_id: SKU, organization_id: ORG, user_id: USER, payload: { change: 2, expectedAvailable: 3, reason: "receipt", code: "IP13", note: null } });
    expect(insert.summary).toBe("Ajouter 2 unité(s) au stock de iPhone 13 — 128 Go (IP13) : 3 → 5 disponible(s).");
    expect(new Date(insert.expires_at as string).getTime() - NOW.getTime()).toBe(ACTION_TTL_MS);
    expect(queries.some((q) => q.target.startsWith("rpc:"))).toBe(false);
    expect(JSON.parse(r.content)).toMatchObject({ prepared: true, actionId: ACTION });
    expect(r.cards[0]).toMatchObject({ kind: "action", action: { id: ACTION, status: "pending" } });
  });

  it("retrait supérieur au stock refusé dès la préparation", async () => {
    const { client } = fakeSupabase({ v_stock_overview: { data: [{ sku_id: SKU, code: "IP13", product_name: "iPhone 13", variant_name: null, quantity_available: 1 }] } });
    const r = JSON.parse((await runAdvisorTool(toolCtx(client), "prepare_stock_adjustment", { sku: "IP13", change: -3 })).content);
    expect(r).toMatchObject({ prepared: false });
  });

  it("changement de prix : montant exact, annonces eBay explicitement non modifiées ; prix invalide refusé", async () => {
    const { client, queries } = fakeSupabase({
      v_stock_overview: { data: [{ sku_id: SKU, code: "IP13", product_name: "iPhone 13", variant_name: null, quantity_available: 3, cost_price: 300, sale_price: 429, currency: "EUR" }] },
      advisor_actions: { data: { id: ACTION, kind: "update_sku_price", status: "pending", summary: "x", amount: 449.9, currency: "EUR", expires_at: "2026-10-14T10:10:00Z", result: null, error: null } },
    });
    await runAdvisorTool(toolCtx(client), "prepare_price_change", { sku: "IP13", newPrice: "449,90" });
    const insert = queries.find((q) => q.target === "advisor_actions")!.calls.find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ amount: 449.9, currency: "EUR", payload: { newPrice: "449.90", expectedPrice: 429 } });
    expect(insert.summary).toMatch(/429,00\s€ → 449,90\s€\. Les annonces eBay ne sont pas modifiées\. Marge brute unitaire : 149,90\s€/);
    const bad = JSON.parse((await runAdvisorTool(toolCtx(client), "prepare_price_change", { sku: "IP13", newPrice: "0" })).content);
    expect(bad).toMatchObject({ prepared: false });
  });

  it("brouillon de message acheteur : carte avec texte, jamais envoyé", async () => {
    const r = await runAdvisorTool(toolCtx(fakeSupabase().client), "draft_buyer_message", { orderNumber: "12-345", subject: "Retard de livraison", text: "Bonjour, votre colis…" });
    expect(JSON.parse(r.content)).toMatchObject({ drafted: true, sent: false });
    expect(r.cards[0]).toMatchObject({ kind: "draft", text: "Bonjour, votre colis…" });
  });

  it("commande inconnue : dit qu'elle n'existe pas", async () => {
    const r = JSON.parse((await runAdvisorTool(toolCtx(fakeSupabase({ orders: { data: [] } }).client), "order_lookup", { orderNumber: "99" })).content);
    expect(r).toMatchObject({ found: false });
  });

  it("frais de port sans plateforme ni grille : « aucun tarif réel », aucun achat", async () => {
    const r = await runAdvisorTool(toolCtx(fakeSupabase({ shipping_rate_cards: { data: [] } }).client), "shipping_quotes", { weightKg: 1, lengthCm: 30, widthCm: 20, heightCm: 10, fromPostcode: "75011", toPostcode: "69003" });
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.content).realQuotes).toEqual([]);
    expect(r.cards[0]!.warnings[0]).toMatch(/Aucun tarif réel disponible/);
  });
});

// ---------------------------------------------------------------------------
// Confirmations : exécution seulement après le bouton « Confirmer », droits revérifiés
// ---------------------------------------------------------------------------

describe("confirmation des actions", () => {
  const pendingRow = {
    id: ACTION,
    organization_id: ORG,
    user_id: USER,
    conversation_id: "conv-1",
    kind: "adjust_stock",
    sku_id: SKU,
    payload: { change: 2, reason: "receipt", note: null, expectedAvailable: 3, code: "IP13" },
    summary: "Ajouter 2 unité(s) au stock de iPhone 13 (IP13) : 3 → 5 disponible(s).",
    amount: null,
    currency: null,
    status: "pending",
    expires_at: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
    result: null,
    error: null,
  };
  let admin: ReturnType<typeof fakeSupabase>;
  beforeEach(() => {
    admin = fakeSupabase({ advisor_actions: { data: { ...pendingRow, status: "executed", result: { message: "ok" } } } });
  });

  it("confirmer : réserve, revalide le stock, exécute via la base, enregistre et note dans la conversation", async () => {
    const user = fakeSupabase({ advisor_actions: { data: pendingRow }, v_stock_overview: { data: { quantity_available: 3 } }, "rpc:apply_inventory_movement": { data: { quantity_after: 5 } }, skus: { data: { code: "IP13" } } });
    const r = await decideAdvisorAction(orgCtx(user.client), ACTION, "confirm", { admin: admin.client, now: NOW });
    expect(r.message).toBe("Stock de IP13 mis à jour : 5 disponible(s).");
    const rpc = user.queries.find((q) => q.target === "rpc:apply_inventory_movement")!;
    expect(rpc.calls[0]!.args[0]).toMatchObject({ p_organization_id: ORG, p_sku_id: SKU, p_type: "receipt", p_quantity: 2 });
    const claim = admin.queries.find((q) => q.calls.some((c) => c.method === "update" && (c.args[0] as { status?: string }).status === "executing"))!;
    expect(claim.calls).toContainEqual({ method: "eq", args: ["status", "pending"] });
    expect(user.queries.some((q) => q.target === "advisor_messages")).toBe(true);
  });

  it("stock modifié depuis la préparation : rien n'est exécuté, action en échec", async () => {
    const user = fakeSupabase({ advisor_actions: { data: pendingRow }, v_stock_overview: { data: { quantity_available: 1 } } });
    const failed = fakeSupabase({ advisor_actions: { data: { ...pendingRow, status: "failed", error: "Le stock a changé" } } });
    const r = await decideAdvisorAction(orgCtx(user.client), ACTION, "confirm", { admin: failed.client, now: NOW });
    expect(r.message).toMatch(/a changé depuis la préparation/);
    expect(user.queries.some((q) => q.target.startsWith("rpc:"))).toBe(false);
    expect(r.action.status).toBe("failed");
  });

  it("action d'un autre utilisateur : introuvable, aucune exécution", async () => {
    const user = fakeSupabase({ advisor_actions: { data: { ...pendingRow, user_id: OTHER_USER } } });
    await expect(decideAdvisorAction(orgCtx(user.client), ACTION, "confirm", { admin: admin.client, now: NOW })).rejects.toThrow(/introuvable/);
    expect(admin.queries).toHaveLength(0);
  });

  it("rôle lecture seule : exécution refusée côté serveur", async () => {
    const user = fakeSupabase({ advisor_actions: { data: pendingRow } });
    await expect(decideAdvisorAction(orgCtx(user.client, "viewer"), ACTION, "confirm", { admin: admin.client, now: NOW })).rejects.toThrow(/lecture seule/);
    expect(user.queries.some((q) => q.target.startsWith("rpc:"))).toBe(false);
  });

  it("demande expirée : rien n'est exécuté", async () => {
    const user = fakeSupabase({ advisor_actions: { data: { ...pendingRow, expires_at: new Date(NOW.getTime() - 1000).toISOString() } } });
    const expired = fakeSupabase({ advisor_actions: { data: { ...pendingRow, status: "expired" } } });
    const r = await decideAdvisorAction(orgCtx(user.client), ACTION, "confirm", { admin: expired.client, now: NOW });
    expect(r.message).toMatch(/expirée/);
    expect(user.queries.some((q) => q.target.startsWith("rpc:"))).toBe(false);
  });

  it("déjà traitée (double appui) : aucune seconde exécution", async () => {
    const user = fakeSupabase({ advisor_actions: { data: { ...pendingRow, status: "executed" } } });
    const r = await decideAdvisorAction(orgCtx(user.client), ACTION, "confirm", { admin: admin.client, now: NOW });
    expect(r.message).toMatch(/déjà été traitée/);
    expect(admin.queries).toHaveLength(0);
  });

  it("réservation perdue (concurrence) : pas d'exécution", async () => {
    const user = fakeSupabase({ advisor_actions: { data: pendingRow } });
    const lost = fakeSupabase({ advisor_actions: { data: null } });
    const r = await decideAdvisorAction(orgCtx(user.client), ACTION, "confirm", { admin: lost.client, now: NOW });
    expect(r.message).toMatch(/déjà en cours ou traitée/);
    expect(user.queries.some((q) => q.target.startsWith("rpc:"))).toBe(false);
  });

  it("annuler : aucune modification de stock", async () => {
    const user = fakeSupabase({ advisor_actions: { data: pendingRow } });
    const cancelled = fakeSupabase({ advisor_actions: { data: { ...pendingRow, status: "cancelled" } } });
    const r = await decideAdvisorAction(orgCtx(user.client), ACTION, "cancel", { admin: cancelled.client, now: NOW });
    expect(r.action.status).toBe("cancelled");
    expect(user.queries.some((q) => q.target.startsWith("rpc:"))).toBe(false);
  });
});
