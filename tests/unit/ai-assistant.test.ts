import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * IA côté serveur : brouillon de produit dicté et assistant « Intelligence ».
 * L'API Claude est simulée (aucun appel réseau) ; les outils lisent un faux client Supabase dont
 * on vérifie les filtres (organisation, statuts exclus) et les agrégats calculés.
 */
const create = vi.fn();
vi.mock("@/services/ai/claude", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/ai/claude")>();
  return { ...real, claudeClient: () => ({ beta: { messages: { create } } }) };
});

const { parseProductDraft, draftProductFromText, productDraftSystemPrompt } = await import("@/services/ai/product-draft");
const { askAssistant, assistantRequestSchema } = await import("@/services/ai/assistant");
const { runAssistantTool } = await import("@/services/ai/assistant-tools");
const { fakeSupabase } = await import("./helpers/fake-supabase");

const ORG = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-10T12:00:00Z");

beforeEach(() => create.mockReset());

function textMessage(text: string, stop = "end_turn") {
  return { model: "claude-opus-5-5", stop_reason: stop, content: [{ type: "text", text }] };
}

describe("brouillon de produit dicté", () => {
  const draft = {
    understood: true,
    brand: "Apple",
    model: "iPhone 13",
    name: null,
    category: "Smartphone",
    variants: [
      { storage: "128 Go", color: "Noir", grade: "A", condition: "refurbished", cost_price: 310, sale_price: 429, initial_quantity: 3 },
      { storage: "256 Go", color: " Bleu ", grade: null, condition: "refurbished", cost_price: null, sale_price: null, initial_quantity: 2 },
    ],
    notes: ["Montant 350 € : prix d'achat ou de vente ?", "  "],
  };

  it("convertit la réponse structurée en brouillon (valeurs non dites laissées vides)", () => {
    const d = parseProductDraft(JSON.stringify(draft), "trois iPhone 13…");
    expect(d.brand).toBe("Apple");
    expect(d.variants).toHaveLength(2);
    expect(d.variants[0]).toEqual({ storage: "128 Go", color: "Noir", grade: "A", condition: "refurbished", costPrice: 310, salePrice: 429, initialQuantity: 3 });
    expect(d.variants[1]).toMatchObject({ color: "Bleu", grade: null, costPrice: null, salePrice: null });
    expect(d.notes).toEqual(["Montant 350 € : prix d'achat ou de vente ?"]);
  });

  it("refuse une réponse illisible ou hors bornes au lieu de deviner", () => {
    expect(() => parseProductDraft("pas du json", "x")).toThrow(/illisible/);
    expect(() => parseProductDraft(JSON.stringify({ ...draft, variants: [{ ...draft.variants[0], cost_price: -5 }] }), "x")).toThrow(/incomplète/);
    expect(() => parseProductDraft(JSON.stringify({ ...draft, variants: [{ ...draft.variants[0], grade: "D" }] }), "x")).toThrow(/incomplète/);
  });

  it("appelle Claude avec une sortie structurée et l'interdiction d'inventer", async () => {
    create.mockResolvedValueOnce(textMessage(JSON.stringify(draft)));
    const d = await draftProductFromText("trois iPhone 13 128 gigas noir grade A achetés 310 revendus 429", "EUR");
    expect(d.model).toBe("iPhone 13");
    const req = create.mock.calls[0]![0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.fallbacks).toBe("default");
    expect(req.system).toContain("n'invente AUCUNE valeur");
    expect(req.messages[0].content).toContain("128 gigas");
    expect(productDraftSystemPrompt("EUR")).toContain("ne suppose jamais 1");
  });

  it("refus du modèle → message clair, aucun brouillon", async () => {
    create.mockResolvedValueOnce({ model: "claude-opus-5-5", stop_reason: "refusal", content: [] });
    await expect(draftProductFromText("bonjour", "EUR")).rejects.toThrow(/Reformulez/);
  });
});

describe("assistant Intelligence", () => {
  const orderRows = [
    { sku_id: "sku-1", title: "iPhone 13 128 Go Noir", quantity: 2, unit_price: 420, total: 840, currency: "EUR", orders: { placed_at: "2026-10-01T10:00:00Z", status: "paid", provider: "ebay", currency: "EUR", order_number: "A1" } },
    { sku_id: "sku-1", title: "iPhone 13 128 Go Noir", quantity: 1, unit_price: 410, total: null, currency: "EUR", orders: { placed_at: "2026-10-05T10:00:00Z", status: "shipped", provider: "ebay", currency: "EUR", order_number: "A2" } },
    { sku_id: null, title: "Coque iPhone 12", quantity: 1, unit_price: 15, total: 15, currency: "EUR", orders: { placed_at: "2026-10-06T10:00:00Z", status: "paid", provider: "ebay", currency: "EUR", order_number: "A3" } },
  ];
  const stock = [{ sku_id: "sku-1", code: "IP13-128-NOIR", product_name: "Apple iPhone 13", variant_name: "128 Go Noir", quantity_available: 4 }];

  it("classe les produits vendus à partir des vraies lignes de commande de l'organisation", async () => {
    const { client, queries } = fakeSupabase({ order_items: { data: orderRows }, v_stock_overview: { data: stock } });
    const r = await runAssistantTool({ supabase: client, organizationId: ORG, currency: "EUR", now: NOW }, "sales_ranking", { days: 30 });
    expect(r.isError).toBe(false);
    const out = JSON.parse(r.content);
    expect(out.products[0]).toMatchObject({ rank: 1, product: "Apple iPhone 13 — 128 Go Noir", sku: "IP13-128-NOIR", unitsSold: 3, revenue: { EUR: 1250 }, orders: 2, stockAvailableNow: 4 });
    expect(out.products[1]).toMatchObject({ product: "Coque iPhone 12", mappedToStock: false, unitsSold: 1 });
    expect(out.totals).toMatchObject({ distinctProducts: 2, unitsSold: 4, revenue: { EUR: 1265 } });
    const calls = queries.find((q) => q.target === "order_items")!.calls;
    expect(calls).toContainEqual({ method: "eq", args: ["organization_id", ORG] });
    expect(calls).toContainEqual({ method: "not", args: ["orders.status", "in", "(cancelled,refunded)"] });
    expect(calls).toContainEqual({ method: "gte", args: ["orders.placed_at", "2026-09-10T12:00:00.000Z"] });
  });

  it("une erreur de lecture est renvoyée au modèle comme erreur (jamais complétée)", async () => {
    const { client } = fakeSupabase({ order_items: { error: { message: "permission denied" } } });
    const r = await runAssistantTool({ supabase: client, organizationId: ORG, currency: "EUR", now: NOW }, "sales_ranking", {});
    expect(r).toEqual({ isError: true, content: expect.stringContaining("permission denied") });
    expect((await runAssistantTool({ supabase: client, organizationId: ORG, currency: "EUR" }, "drop_tables", {})).isError).toBe(true);
    expect((await runAssistantTool({ supabase: client, organizationId: ORG, currency: "EUR" }, "sales_ranking", { days: 9999 })).content).toMatch(/Paramètres invalides/);
  });

  it("stock dormant et stock bas calculés sur les vraies colonnes", async () => {
    const rows = [
      { code: "A", quantity_available: 1, quantity_on_hand: 1, reorder_point: null, last_sale_at: "2026-10-01T00:00:00Z", stock_value: 100, currency: "EUR", units_30d: 3 },
      { code: "B", quantity_available: 5, quantity_on_hand: 5, reorder_point: null, last_sale_at: null, stock_value: 900, currency: "EUR", units_30d: 0 },
      { code: "C", quantity_available: 0, quantity_on_hand: 0, reorder_point: 2, last_sale_at: null, stock_value: 0, currency: "EUR", units_30d: 0 },
    ];
    const { client } = fakeSupabase({ v_stock_overview: { data: rows } });
    const ctx = { supabase: client, organizationId: ORG, currency: "EUR", now: NOW };
    const codes = async (filter: string) => (JSON.parse((await runAssistantTool(ctx, "stock_search", { filter })).content).items as { code: string }[]).map((i) => i.code);
    expect(await codes("low")).toEqual(["A"]);
    expect(await codes("dormant")).toEqual(["B"]);
    expect(await codes("out_of_stock")).toEqual(["C"]);
    expect(await codes("best_sellers")).toEqual(["A"]);
  });

  it("boucle outils → réponse : la réponse finale s'appuie sur le résultat de l'outil", async () => {
    const { client } = fakeSupabase({ order_items: { data: orderRows }, v_stock_overview: { data: stock } });
    create
      .mockResolvedValueOnce({ model: "claude-opus-5-5", stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu_1", name: "sales_ranking", input: { days: 365 } }] })
      .mockResolvedValueOnce(textMessage("Votre produit le plus vendu est l'Apple iPhone 13 128 Go Noir : 3 unités."));
    const reply = await askAssistant({ supabase: client, organizationId: ORG, organizationName: "Boutique", currency: "EUR", now: NOW }, { messages: [{ role: "user", content: "Quel est le produit que j'ai le plus vendu ?" }] });
    expect(reply.answer).toContain("3 unités");
    expect(reply.sources).toEqual([{ tool: "sales_ranking", label: "Ventes par produit" }]);
    const second = create.mock.calls[1]![0];
    const toolResult = second.messages[2].content[0];
    expect(toolResult).toMatchObject({ type: "tool_result", tool_use_id: "tu_1", is_error: false });
    expect(JSON.parse(toolResult.content).products[0].unitsSold).toBe(3);
    expect(second.system).toContain("doit provenir d'un résultat d'outil");
    expect(second.tools.map((t: { name: string }) => t.name)).toEqual(["sales_ranking", "sales_summary", "stock_search", "recent_orders", "ebay_account", "listings_search"]);
  });

  it("valide la conversation envoyée par l'application", () => {
    expect(assistantRequestSchema.safeParse({ messages: [{ role: "user", content: "Top ventes ?" }] }).success).toBe(true);
    expect(assistantRequestSchema.safeParse({ messages: [{ role: "assistant", content: "x" }] }).success).toBe(false);
    expect(assistantRequestSchema.safeParse({ messages: [{ role: "user", content: "a" }, { role: "user", content: "b" }] }).success).toBe(false);
    expect(assistantRequestSchema.safeParse({ messages: [{ role: "user", content: "x".repeat(4001) }] }).success).toBe(false);
  });
});

describe("configuration", () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved;
  });
  it("sans clé : « non configuré », jamais de réponse simulée", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const real = await vi.importActual<typeof import("@/services/ai/claude")>("@/services/ai/claude");
    expect(real.aiConfigured()).toBe(false);
    expect(() => real.claudeClient()).toThrow(/ANTHROPIC_API_KEY/);
  });
});
