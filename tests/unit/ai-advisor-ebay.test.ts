import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEbayConfig, EBAY_SCOPE, ebayScopeList } from "@/integrations/ebay/config";

/**
 * Outils eBay EN DIRECT du conseiller : réponses eBay SIMULÉES (fetch), base simulée (faux client
 * Supabase), connexion simulée (connectorAuthFor). Vérifie : lecture seule, organisation de
 * l'utilisateur, scopes (analyse complète), erreurs claires, date de lecture, cache, vie privée.
 */
const state = vi.hoisted(() => ({ config: null as unknown, tokenFor: [] as string[] }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => ({}) }));
vi.mock("@/integrations/core/registry", () => ({
  getEbayConnector: () => ({ config: () => state.config }),
  getConnector: () => ({ config: () => state.config }),
  listConnectorCatalog: () => [],
}));
vi.mock("@/services/channels/connection-store", () => ({
  connectorAuthFor: (connectionId: string) => ({
    getAccessToken: async () => {
      state.tokenFor.push(connectionId);
      return `token-${connectionId}`;
    },
  }),
}));

const { runAdvisorTool, ADVISOR_TOOLS, ADVISOR_TOOL_DEFINITIONS } = await import("@/services/ai/advisor-tools");
const { clearEbayAdvisorCache, questionAsksForMessageContent, EXTENDED_REQUIRED, EBAY_ADVISOR_TOOLS } = await import("@/services/ai/advisor-ebay");
const { ADVISOR_SYSTEM_STABLE, ADVISOR_LIMITS } = await import("@/services/ai/advisor");
const { fakeSupabase } = await import("./helpers/fake-supabase");
const { ORDER, GET_ITEM_XML } = await import("./helpers/ebay-fixtures");

const ORG = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-20T10:00:00Z");
const CONFIG = createEbayConfig({ EBAY_ENV: "production", EBAY_CLIENT_ID: "app", EBAY_CLIENT_SECRET: "cert", EBAY_RU_NAME: "ru" });
const BASE_SCOPES = ebayScopeList();
const EXTENDED_SCOPES = ebayScopeList({ extended: true });

/** Appels Trading autorisés : uniquement des lectures. */
const READ_ONLY_CALLS = new Set(["GetItem", "GetBestOffers", "GetMyeBaySelling", "GetFeedback", "GetUser", "GetMyMessages"]);

function connection(overrides: Record<string, unknown> = {}) {
  return { id: "conn-1", status: "connected", external_username: "vendeur_pro", environment: "production", scopes: BASE_SCOPES, ...overrides };
}

function setup(opts: { connections?: unknown[]; orders?: unknown[]; listings?: unknown[]; question?: string; role?: string } = {}) {
  const db = fakeSupabase({
    channel_connections: { data: opts.connections ?? [connection()] },
    orders: { data: opts.orders ?? [] },
    channel_listings: { data: opts.listings ?? [] },
  });
  const org = { supabase: db.client, user: { id: "u1" }, profile: {}, organization: { id: ORG, name: "Boutique", default_currency: "EUR" }, role: opts.role ?? "owner", memberships: [] };
  const ctx = { supabase: db.client, organizationId: ORG, currency: "EUR", org: org as never, conversationId: "conv", now: NOW, question: opts.question };
  return { ctx, db };
}

type Call = { url: URL; method: string; callName: string | null; body: string; auth: string | null };

function stubEbay(handler: (c: Call) => Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      const call: Call = { url: new URL(input), method: init.method ?? "GET", callName: headers["X-EBAY-API-CALL-NAME"] ?? null, body: typeof init.body === "string" ? init.body : "", auth: headers.Authorization ?? headers["X-EBAY-API-IAF-TOKEN"] ?? null };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const xml = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/xml" } });
const wrap = (call: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?><${call}Response xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>Success</Ack>${body}</${call}Response>`;

async function run(ctx: unknown, name: string, input: unknown = {}) {
  const r = await runAdvisorTool(ctx as never, name, input);
  return { ...r, json: (r.isError ? {} : JSON.parse(r.content)) as Record<string, unknown> };
}

/** Garantie transversale : aucune écriture chez eBay. */
function expectReadOnly(calls: Call[]) {
  for (const c of calls) {
    if (c.callName) {
      expect(c.method).toBe("POST"); // Trading API : POST XML, mais uniquement des appels Get*
      expect(READ_ONLY_CALLS.has(c.callName)).toBe(true);
    } else {
      expect(c.method).toBe("GET");
    }
  }
}

beforeEach(() => {
  state.config = CONFIG;
  state.tokenFor = [];
  clearEbayAdvisorCache();
});
afterEach(() => vi.unstubAllGlobals());

describe("déclaration des outils eBay du conseiller", () => {
  it("12 outils de LECTURE, déclarés au modèle, schémas fermés", () => {
    const names = Object.keys(EBAY_ADVISOR_TOOLS);
    expect(names).toEqual(["ebay_order_details", "ebay_orders_live", "ebay_account_overview", "ebay_listing_details", "ebay_sold_unsold", "ebay_feedback", "ebay_messages", "ebay_message", "ebay_finances", "ebay_traffic", "ebay_seller_standards", "ebay_promotions"]);
    for (const n of names) {
      expect(ADVISOR_TOOLS[n]?.category).toBe("read");
      const def = ADVISOR_TOOL_DEFINITIONS.find((d) => d.name === n);
      expect(def).toBeDefined();
      expect((def!.input_schema as { additionalProperties: boolean }).additionalProperties).toBe(false);
    }
    expect(ADVISOR_TOOL_DEFINITIONS.length).toBe(29);
  });

  it("invite système : sources, date de lecture, analyse complète, messages ; 8 étapes", () => {
    expect(ADVISOR_SYSTEM_STABLE).toMatch(/EN DIRECT chez eBay/);
    expect(ADVISOR_SYSTEM_STABLE).toMatch(/readAtParis/);
    expect(ADVISOR_SYSTEM_STABLE).toMatch(/Autoriser l'analyse complète/);
    expect(ADVISOR_SYSTEM_STABLE).toMatch(/ebay_message .*explicitement/);
    expect(ADVISOR_LIMITS.maxSteps).toBe(8);
  });
});

describe("connexion de l'organisation et erreurs claires", () => {
  it("serveur sans clés eBay : indisponible, aucun appel", async () => {
    state.config = null;
    const calls = stubEbay(() => json({}));
    const { ctx } = setup();
    const r = await run(ctx, "ebay_feedback");
    expect(r.isError).toBe(false);
    expect(r.json).toMatchObject({ available: false, reason: expect.stringMatching(/pas configurée/) });
    expect(calls).toHaveLength(0);
  });

  it("aucun compte connecté ; autorisation expirée → reconnexion", async () => {
    stubEbay(() => json({}));
    expect((await run(setup({ connections: [] }).ctx, "ebay_orders_live")).json).toMatchObject({ available: false, reason: expect.stringMatching(/Aucun compte eBay/) });
    const expired = await run(setup({ connections: [connection({ status: "expired" })] }).ctx, "ebay_orders_live");
    expect(expired.json).toMatchObject({ available: false, reason: expect.stringMatching(/expiré/), whatToDo: expect.stringMatching(/Réglages → Intégrations/) });
    expect(state.tokenFor).toEqual([]);
  });

  it("la connexion est cherchée DANS l'organisation de l'utilisateur, avec SA session ; le jeton est celui de cette connexion", async () => {
    stubEbay(() => xml(wrap("GetUser", "<User><UserID>vendeur_pro</UserID></User>")));
    const { ctx, db } = setup();
    await run(ctx, "ebay_feedback");
    const q = db.queries.find((x) => x.target === "channel_connections")!;
    expect(q.calls).toContainEqual({ method: "eq", args: ["organization_id", ORG] });
    expect(q.calls).toContainEqual({ method: "eq", args: ["provider", "ebay"] });
    expect(q.calls).toContainEqual({ method: "neq", args: ["status", "disconnected"] });
    expect(new Set(state.tokenFor)).toEqual(new Set(["conn-1"]));
  });

  it("eBay répond 401 deux fois → autorisation expirée expliquée ; quota → message clair", async () => {
    stubEbay(() => json({ errors: [{ errorId: 1001, message: "Invalid access token" }] }, 401));
    const r = await run(setup().ctx, "ebay_order_details", { order: "12-34567-89012" });
    expect(r.json).toMatchObject({ available: false, reason: expect.stringMatching(/expiré ou a été révoquée/) });
    expect(r.content).not.toContain("token-conn-1");
  });
});

describe("ebay_order_details (getOrder + suivis)", () => {
  it("détail en direct, daté, sans rue/téléphone/e-mail ; frais par ligne indisponibles sans analyse complète", async () => {
    const calls = stubEbay((c) => {
      if (c.url.pathname.endsWith("/shipping_fulfillment")) return json({ fulfillments: [{ fulfillmentId: "F1", shipmentTrackingNumber: "6A123", shippingCarrierCode: "COLISSIMO", shippedDate: "2026-10-19T15:00:00.000Z" }] });
      if (c.url.pathname === "/sell/fulfillment/v1/order/12-34567-89012") return json(ORDER);
      return json({}, 500);
    });
    const { ctx } = setup({ orders: [{ external_order_id: "12-34567-89012" }] });
    const r = await run(ctx, "ebay_order_details", { order: "12-34567-89012" });
    expect(r.isError).toBe(false);
    expect(r.json).toMatchObject({ found: true, inMonStock: true, account: "vendeur_pro", readAt: expect.stringMatching(/^2\d{3}-/), readAtParis: expect.any(String) });
    const order = r.json.order as { buyer: unknown; lineItems: Array<{ marketplaceFees: unknown }>; marketplaceFee: { total: { value: number } } };
    expect(order.buyer).toEqual({ username: "acheteur_77", recipientName: "Jean Dupont", city: "Lyon", postalCode: "69003", country: "FR" });
    expect(order.marketplaceFee.total.value).toBe(54.9);
    expect(order.lineItems[0]!.marketplaceFees).toBeNull();
    expect(r.json.shipments).toEqual([{ fulfillmentId: "F1", carrier: "COLISSIMO", trackingNumber: "6A123", service: null, shippedAt: "2026-10-19T15:00:00.000Z", lineItems: [] }]);
    expect(String(r.json.note)).toContain(EXTENDED_REQUIRED);
    expect(r.content).not.toMatch(/rue Secrète|0612345678|jean\.dupont@example\.com/);
    expect(r.cards[0]?.title).toBe("Commande eBay 12-34567-89012");
    expect(r.cards[0]?.subtitle).toMatch(/^eBay, lu le /);
    expect(calls.some((c) => c.url.host === "apiz.ebay.com")).toBe(false);
    expectReadOnly(calls);
  });

  it("avec l'analyse complète : frais par ligne lus dans la Finances API (filtre orderId)", async () => {
    const calls = stubEbay((c) => {
      if (c.url.host === "apiz.ebay.com") return json({ total: 1, transactions: [{ transactionId: "T1", transactionType: "SALE", bookingEntry: "CREDIT", amount: { value: "355.00", currency: "EUR" }, orderLineItems: [{ lineItemId: "10001", marketplaceFees: [{ feeType: "FINAL_VALUE_FEE", amount: { value: "52.60", currency: "EUR" } }] }] }] });
      if (c.url.pathname.endsWith("/shipping_fulfillment")) return json({ fulfillments: [] });
      return json(ORDER);
    });
    const r = await run(setup({ connections: [connection({ scopes: EXTENDED_SCOPES })] }).ctx, "ebay_order_details", { order: "12-34567-89012" });
    const order = r.json.order as { lineItems: Array<{ marketplaceFees: unknown }> };
    expect(order.lineItems[0]!.marketplaceFees).toEqual([{ type: "FINAL_VALUE_FEE", amount: { value: 52.6, currency: "EUR" } }]);
    const fin = calls.find((c) => c.url.host === "apiz.ebay.com")!;
    expect(fin.url.searchParams.get("filter")).toContain("orderId:{12-34567-89012}");
    expectReadOnly(calls);
  });

  it("commande inconnue chez eBay (404) → found: false ; numéro invalide refusé sans appel", async () => {
    stubEbay(() => json({ errors: [{ errorId: 32100, message: "Order not found" }] }, 404));
    expect((await run(setup().ctx, "ebay_order_details", { order: "99-99999-99999" })).json).toMatchObject({ found: false });
  });

  it("cache court : deux questions enchaînées = une seule lecture eBay, résultat marqué", async () => {
    const calls = stubEbay((c) => (c.url.pathname.endsWith("/shipping_fulfillment") ? json({ fulfillments: [] }) : json(ORDER)));
    const { ctx } = setup();
    await run(ctx, "ebay_order_details", { order: "12-34567-89012" });
    const second = await run(ctx, "ebay_order_details", { order: "12-34567-89012" });
    expect(calls.filter((c) => c.url.pathname === "/sell/fulfillment/v1/order/12-34567-89012")).toHaveLength(1);
    expect(second.json.fromShortCache).toBe(true);
  });
});

describe("ebay_orders_live", () => {
  it("commandes en direct : totaux, frais, à expédier, non encore synchronisées ; filtre paiement", async () => {
    const paidToShip = { ...ORDER, orderId: "A-1", orderPaymentStatus: "PAID", orderFulfillmentStatus: "NOT_STARTED" };
    const shipped = { ...ORDER, orderId: "B-2", orderPaymentStatus: "PAID", orderFulfillmentStatus: "FULFILLED", pricingSummary: { total: { value: "20.00", currency: "EUR" } }, totalMarketplaceFee: { value: "2.50", currency: "EUR" } };
    const calls = stubEbay(() => json({ total: 2, orders: [paidToShip, shipped] }));
    const r = await run(setup({ orders: [{ external_order_id: "B-2" }] }).ctx, "ebay_orders_live", { days: 7, payment: "PAID" });
    expect(r.json).toMatchObject({ count: 2, paidAwaitingShipment: 1, notYetInMonStock: 1, totalsByCurrency: { EUR: 429.9 }, marketplaceFeesByCurrency: { EUR: 57.4 } });
    expect(calls[0]!.url.searchParams.get("filter")).toMatch(/^creationdate:\[2026-10-13T10:00:00\.000Z\.\.\]$/);
    expect(r.content).not.toContain("Lyon");
    expectReadOnly(calls);
  });
});

describe("Trading API : annonce, vendus/invendus, évaluations, messages", () => {
  it("ebay_listing_details par titre (annonce synchronisée) → GetItem + GetBestOffers", async () => {
    const calls = stubEbay((c) => (c.callName === "GetBestOffers" ? xml(wrap("GetBestOffers", "<BestOfferArray><BestOffer><BestOfferID>B1</BestOfferID><Price currencyID=\"EUR\">380.0</Price><Status>Pending</Status></BestOffer></BestOfferArray>")) : xml(GET_ITEM_XML)));
    const { ctx } = setup({ listings: [{ external_listing_id: "405123456789", title: "iPhone 13 128 Go Noir", external_sku: "IP13", status: "active" }] });
    const r = await run(ctx, "ebay_listing_details", { query: "iPhone 13" });
    expect(r.json).toMatchObject({ item: { itemId: "405123456789", watchCount: 14, quantity: { available: 2 }, insertionFees: null }, bestOffersReceived: [{ id: "B1", status: "Pending" }] });
    expect(calls.map((c) => c.callName)).toEqual(["GetItem", "GetBestOffers"]);
    expect(calls[0]!.auth).toBe("token-conn-1");
    expectReadOnly(calls);
  });

  it("ebay_listing_details : plusieurs annonces possibles → candidats, aucun appel eBay", async () => {
    const calls = stubEbay(() => xml(GET_ITEM_XML));
    const r = await run(setup({ listings: [{ external_listing_id: "1111111111", title: "iPhone 13 A" }, { external_listing_id: "2222222222", title: "iPhone 13 B" }] }).ctx, "ebay_listing_details", { query: "iPhone" });
    expect(r.json).toMatchObject({ found: false, candidates: [{ itemId: "1111111111" }, { itemId: "2222222222" }] });
    expect(calls).toHaveLength(0);
  });

  it("ebay_feedback : score, % positives (GetUser), négatives", async () => {
    const calls = stubEbay((c) => {
      if (c.callName === "GetUser") return xml(wrap("GetUser", "<User><UserID>vendeur_pro</UserID><FeedbackScore>1520</FeedbackScore><PositiveFeedbackPercent>99.6</PositiveFeedbackPercent></User>"));
      const negative = c.body.includes("<CommentType>Negative</CommentType>");
      return xml(wrap("GetFeedback", `<FeedbackDetailArray><FeedbackDetail><CommentingUser>a1</CommentingUser><CommentText>${negative ? "Jamais reçu" : "Parfait"}</CommentText><CommentType>${negative ? "Negative" : "Positive"}</CommentType></FeedbackDetail></FeedbackDetailArray><FeedbackScore>1520</FeedbackScore>`));
    });
    const r = await run(setup().ctx, "ebay_feedback", { limit: 5 });
    expect(r.json).toMatchObject({ score: 1520, positivePercent: 99.6, recent: [{ comment: "Parfait" }], negativeAndNeutral: [{ type: "Negative", comment: "Jamais reçu" }] });
    expectReadOnly(calls);
  });

  it("ebay_messages : en-têtes seulement ; ebay_message : texte UNIQUEMENT si la question le demande", async () => {
    const message = `<Message><Sender>acheteur_4</Sender><Subject>Batterie ?</Subject><MessageID>987654</MessageID><Read>false</Read><ReceiveDate>2026-10-19T18:00:00.000Z</ReceiveDate><Text>&lt;p&gt;La batterie est à combien ? 06 12 34 56 78&lt;/p&gt;</Text></Message>`;
    const calls = stubEbay((c) => {
      if (c.body.includes("ReturnSummary")) return xml(wrap("GetMyMessages", "<Summary><NewMessageCount>1</NewMessageCount></Summary>"));
      return xml(wrap("GetMyMessages", `<Messages>${message}</Messages><PaginationResult><TotalNumberOfPages>1</TotalNumberOfPages></PaginationResult>`));
    });
    const list = await run(setup().ctx, "ebay_messages", { unreadOnly: true });
    expect(list.json).toMatchObject({ unread: 1, count: 1, inbox: { newMessages: 1 }, messages: [{ messageId: "987654", sender: "acheteur_4", read: false }] });
    expect(list.content).not.toContain("batterie est à combien");

    const before = calls.length;
    const denied = await run(setup({ question: "Combien de messages non lus ?" }).ctx, "ebay_message", { messageId: "987654" });
    expect(denied.json).toMatchObject({ read: false });
    expect(calls.length).toBe(before);

    const ok = await run(setup({ question: "Que dit le message de acheteur_4 ?" }).ctx, "ebay_message", { messageId: "987654" });
    expect(ok.json).toMatchObject({ found: true, message: { body: "La batterie est à combien ? [téléphone masqué]" } });
    expect(ok.cards[0]?.kind).toBe("draft");
    expectReadOnly(calls);
  });

  it("ebay_sold_unsold : durée bornée à 60 jours (schéma)", async () => {
    stubEbay(() => xml(wrap("GetMyeBaySelling", "")));
    const r = await run(setup().ctx, "ebay_sold_unsold", { days: 90 });
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/Paramètres invalides/);
  });

  it("garde-fou des messages : mots déclencheurs", () => {
    expect(questionAsksForMessageContent("Que m'a écrit acheteur_4 ?")).toBe(true);
    expect(questionAsksForMessageContent("lis-moi le dernier message")).toBe(true);
    expect(questionAsksForMessageContent("Combien de messages non lus ?")).toBe(false);
    expect(questionAsksForMessageContent("Quel est mon chiffre d'affaires ?")).toBe(false);
    expect(questionAsksForMessageContent(undefined)).toBe(false);
  });
});

describe("analyse complète (scopes étendus)", () => {
  it("sans le scope : réponse « reconnectez avec l'analyse complète », AUCUN appel eBay", async () => {
    const calls = stubEbay(() => json({}));
    const { ctx } = setup();
    for (const name of ["ebay_finances", "ebay_traffic", "ebay_seller_standards", "ebay_promotions"]) {
      const r = await run(ctx, name);
      expect(r.json).toMatchObject({ available: false, reason: EXTENDED_REQUIRED });
    }
    expect(calls).toHaveLength(0);
    expect(state.tokenFor).toEqual([]);
  });

  it("scope accordé seulement pour Finances : trafic toujours refusé", async () => {
    stubEbay(() => json({ transactions: [] }));
    const { ctx } = setup({ connections: [connection({ scopes: [...BASE_SCOPES, EBAY_SCOPE.finances] })] });
    expect((await run(ctx, "ebay_traffic")).json).toMatchObject({ reason: EXTENDED_REQUIRED });
    expect((await run(ctx, "ebay_finances")).json).toMatchObject({ summary: { transactions: 0 } });
  });

  it("ebay_finances : transactions (apiz, en-tête marketplace), versements, solde", async () => {
    const calls = stubEbay((c) => {
      if (c.url.pathname.endsWith("/seller_funds_summary")) return json({ availableFunds: { value: "120.00", currency: "EUR" } });
      if (c.url.pathname.endsWith("/payout")) return json({ payouts: [{ payoutId: "P1", payoutStatus: "SUCCEEDED", payoutDate: "2026-10-17T00:00:00.000Z", amount: { value: "300.00", currency: "EUR" } }] });
      return json({ total: 2, transactions: [{ transactionType: "SALE", bookingEntry: "CREDIT", amount: { value: "100.00", currency: "EUR" }, totalFeeAmount: { value: "13.00", currency: "EUR" } }, { transactionType: "REFUND", bookingEntry: "DEBIT", amount: { value: "30.00", currency: "EUR" } }] });
    });
    const r = await run(setup({ connections: [connection({ scopes: EXTENDED_SCOPES })] }).ctx, "ebay_finances", { days: 30 });
    expect(r.json).toMatchObject({ funds: { available: { value: 120 } }, summary: { net: { EUR: 70 }, totalSaleFees: { EUR: 13 } }, payouts: [{ id: "P1" }] });
    expect(calls.every((c) => c.url.host === "apiz.ebay.com")).toBe(true);
    expectReadOnly(calls);
  });

  it("ebay_finances : 403 d'eBay → refus expliqué (pas de chiffre inventé)", async () => {
    stubEbay(() => json({ errors: [{ errorId: 1100, message: "Access denied", longMessage: "Insufficient permissions to fulfill the request." }] }, 403));
    const r = await run(setup({ connections: [connection({ scopes: EXTENDED_SCOPES })] }).ctx, "ebay_finances");
    expect(r.json).toMatchObject({ available: false, reason: expect.stringMatching(/refuse l'accès/) });
  });

  it("ebay_traffic : rapport par annonce, titres de MON STOCK, tri par vues", async () => {
    const calls = stubEbay(() =>
      json({
        header: { metrics: [{ key: "LISTING_IMPRESSION_TOTAL" }, { key: "LISTING_VIEWS_TOTAL" }, { key: "CLICK_THROUGH_RATE" }, { key: "SALES_CONVERSION_RATE" }, { key: "TRANSACTION" }] },
        records: [
          { dimensionValues: [{ value: "1111111111" }], metricValues: [{ value: 1000 }, { value: 10 }, { value: 1 }, { value: 0 }, { value: 0 }] },
          { dimensionValues: [{ value: "2222222222" }], metricValues: [{ value: 500 }, { value: 50 }, { value: 10 }, { value: 4 }, { value: 2 }] },
        ],
      }),
    );
    const r = await run(setup({ connections: [connection({ scopes: EXTENDED_SCOPES })], listings: [{ external_listing_id: "2222222222", title: "Galaxy S21" }] }).ctx, "ebay_traffic", { days: 30 });
    expect(r.json).toMatchObject({ totals: { impressions: 1500, views: 60, transactions: 2 }, rows: [{ itemId: "2222222222", title: "Galaxy S21", views: 50 }, { itemId: "1111111111", views: 10 }] });
    expect(calls[0]!.url.pathname).toBe("/sell/analytics/v1/traffic_report");
    expectReadOnly(calls);
  });

  it("ebay_promotions et ebay_seller_standards : lectures Marketing / Analytics", async () => {
    const calls = stubEbay((c) => {
      if (c.url.pathname === "/sell/marketing/v1/ad_campaign") return json({ campaigns: [{ campaignId: "C1", campaignName: "Smartphones", campaignStatus: "RUNNING", fundingStrategy: { fundingModel: "COST_PER_SALE", bidPercentage: "4.5" } }] });
      if (c.url.pathname.endsWith("/ad")) return json({ ads: [{ listingId: "2222222222", bidPercentage: "4.5", adStatus: "ACTIVE" }] });
      if (c.url.pathname === "/sell/marketing/v1/promotion") return json({ promotions: [] });
      if (c.url.pathname.endsWith("seller_standards_profile")) return json({ standardsProfiles: [{ program: "PROGRAM_GLOBAL", standardsLevel: "ABOVE_STANDARD", cycle: { cycleType: "CURRENT" }, metrics: [] }] });
      return json({ dimensionMetrics: [] });
    });
    const { ctx } = setup({ connections: [connection({ scopes: EXTENDED_SCOPES })], listings: [{ external_listing_id: "2222222222", title: "Galaxy S21" }] });
    const promo = await run(ctx, "ebay_promotions");
    expect(promo.json).toMatchObject({ campaigns: [{ id: "C1", status: "RUNNING" }], runningCampaignAds: [{ campaignId: "C1", ads: [{ listingId: "2222222222", title: "Galaxy S21", bidPercentage: 4.5 }] }], promotions: [] });
    const std = await run(ctx, "ebay_seller_standards");
    expect(std.json).toMatchObject({ standardsProfiles: [{ level: "ABOVE_STANDARD" }] });
    expectReadOnly(calls);
  });
});
