import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLastModifiedFilter, iterateEbayOrders, mapEbayOrderStatus, normalizeEbayOrder } from "@/integrations/ebay/fulfillment";
import { createEbayConfig } from "@/integrations/ebay/config";
import { ConnectorError } from "@/integrations/core/errors";
import { variationKey } from "@/integrations/core/variation";

/** Échantillon réaliste de la Sell Fulfillment API (getOrders). */
const sampleOrder = {
  orderId: "12-34567-89012",
  legacyOrderId: "123456789012-1234567890123",
  creationDate: "2026-10-01T09:15:30.000Z",
  lastModifiedDate: "2026-10-02T11:20:00.000Z",
  orderFulfillmentStatus: "NOT_STARTED",
  orderPaymentStatus: "PAID",
  sellerId: "vendeur_fr",
  buyer: { username: "acheteur_75", taxAddress: { city: "Paris", countryCode: "FR" } },
  cancelStatus: { cancelState: "NONE_REQUESTED", cancelRequests: [] },
  pricingSummary: {
    priceSubtotal: { value: "249.00", currency: "EUR" },
    deliveryCost: { value: "5.90", currency: "EUR" },
    tax: { value: "0.00", currency: "EUR" },
    total: { value: "254.90", currency: "EUR" },
  },
  totalMarketplaceFee: { value: "31.20", currency: "EUR" },
  lineItems: [
    {
      lineItemId: "10045678901234",
      legacyItemId: "123456789012",
      sku: "IPH13-128-BLK-A",
      title: "Apple iPhone 13 128 Go Noir reconditionné",
      quantity: 1,
      lineItemCost: { value: "229.00", currency: "EUR" },
      total: { value: "229.00", currency: "EUR" },
      lineItemFulfillmentStatus: "NOT_STARTED",
    },
    {
      lineItemId: "10045678901235",
      legacyItemId: "223456789013",
      legacyVariationId: "523456789014",
      sku: "COQUE-RED",
      title: "Coque silicone",
      quantity: 2,
      lineItemCost: { value: "10.00", currency: "EUR" },
      total: { value: "20.00", currency: "EUR" },
      variationAspects: [
        { name: "Couleur", value: "Rouge" },
        { name: "Taille", value: "M" },
      ],
    },
  ],
};

describe("normalizeEbayOrder", () => {
  it("normalise une commande réaliste de la Fulfillment API", () => {
    const o = normalizeEbayOrder(sampleOrder);
    expect(o.externalOrderId).toBe("12-34567-89012");
    expect(o.orderNumber).toBe("123456789012-1234567890123");
    expect(o.status).toBe("paid");
    expect(o.paymentStatus).toBe("PAID");
    expect(o.fulfillmentStatus).toBe("NOT_STARTED");
    expect(o.cancelStatus).toBe("NONE_REQUESTED");
    expect(o.buyerUsername).toBe("acheteur_75");
    expect(o.currency).toBe("EUR");
    expect(o.subtotal).toBe(249);
    expect(o.shippingTotal).toBe(5.9);
    expect(o.taxTotal).toBe(0);
    expect(o.feeTotal).toBe(31.2);
    expect(o.total).toBe(254.9);
    expect(o.placedAt).toBe("2026-10-01T09:15:30.000Z");
    expect(o.externalModifiedAt).toBe("2026-10-02T11:20:00.000Z");
    expect(o.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(o.items).toHaveLength(2);

    const [simple, variation] = o.items;
    expect(simple).toMatchObject({ externalLineItemId: "10045678901234", externalListingId: "123456789012", externalVariationId: "", externalSku: "IPH13-128-BLK-A", quantity: 1, unitPrice: 229, total: 229, currency: "EUR" });
    // Variation : la clé est le SKU de variation (même clé que côté annonces).
    expect(variation?.externalVariationId).toBe("COQUE-RED");
    expect(variation?.externalVariationId).toBe(variationKey({ sku: "COQUE-RED", aspects: { Couleur: "Rouge", Taille: "M" } }));
    expect(variation?.quantity).toBe(2);
  });

  it("utilise les caractéristiques quand la variation n'a pas de SKU, puis l'identifiant legacy", () => {
    const noSku = { ...sampleOrder, lineItems: [{ ...sampleOrder.lineItems[1], sku: undefined }] };
    expect(normalizeEbayOrder(noSku).items[0]?.externalVariationId).toBe("Couleur=Rouge|Taille=M");
    const onlyId = { ...sampleOrder, lineItems: [{ ...sampleOrder.lineItems[1], sku: undefined, variationAspects: undefined }] };
    expect(normalizeEbayOrder(onlyId).items[0]?.externalVariationId).toBe("523456789014");
  });

  it("le hash de payload est stable pour un même contenu et différent sinon", () => {
    const a = normalizeEbayOrder(sampleOrder).payloadHash;
    const b = normalizeEbayOrder({ ...sampleOrder }).payloadHash;
    const c = normalizeEbayOrder({ ...sampleOrder, orderPaymentStatus: "PENDING" }).payloadHash;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("lève INVALID_RESPONSE pour un format inattendu (jamais de commande inventée)", () => {
    expect(() => normalizeEbayOrder({ orderId: "x" })).toThrowError(ConnectorError);
    try {
      normalizeEbayOrder({ orderId: "x", lineItems: [{ lineItemId: "1", quantity: 0 }] });
    } catch (e) {
      expect((e as ConnectorError).code).toBe("INVALID_RESPONSE");
      expect((e as ConnectorError).details.orderId).toBe("x");
    }
  });
});

describe("mapEbayOrderStatus", () => {
  it("priorise l'annulation, puis le remboursement, puis l'expédition, puis le paiement", () => {
    expect(mapEbayOrderStatus({ cancelState: "CANCELED", paymentStatus: "PAID", fulfillmentStatus: "FULFILLED" })).toBe("cancelled");
    expect(mapEbayOrderStatus({ cancelState: "NONE_REQUESTED", paymentStatus: "FULLY_REFUNDED", fulfillmentStatus: "FULFILLED" })).toBe("refunded");
    expect(mapEbayOrderStatus({ paymentStatus: "PAID", fulfillmentStatus: "FULFILLED" })).toBe("shipped");
    expect(mapEbayOrderStatus({ paymentStatus: "PARTIALLY_REFUNDED", fulfillmentStatus: "IN_PROGRESS" })).toBe("paid");
    expect(mapEbayOrderStatus({ paymentStatus: "PAID", fulfillmentStatus: "NOT_STARTED" })).toBe("paid");
    expect(mapEbayOrderStatus({ paymentStatus: "PENDING", fulfillmentStatus: "NOT_STARTED" })).toBe("pending");
    expect(mapEbayOrderStatus({ paymentStatus: "FAILED" })).toBe("pending");
    expect(mapEbayOrderStatus({ cancelState: "IN_PROGRESS", paymentStatus: "PAID" })).toBe("paid");
    expect(mapEbayOrderStatus({})).toBe("unknown");
  });
});

describe("buildLastModifiedFilter", () => {
  it("formate la fenêtre au format eBay", () => {
    const since = new Date("2026-10-01T00:00:00.000Z");
    expect(buildLastModifiedFilter(since)).toBe("lastmodifieddate:[2026-10-01T00:00:00.000Z..]");
    expect(buildLastModifiedFilter(since, new Date("2026-10-02T00:00:00.000Z"))).toBe("lastmodifieddate:[2026-10-01T00:00:00.000Z..2026-10-02T00:00:00.000Z]");
  });
});

describe("iterateEbayOrders (fetch simulé)", () => {
  const config = createEbayConfig({ EBAY_ENV: "sandbox", EBAY_CLIENT_ID: "id", EBAY_CLIENT_SECRET: "secret", EBAY_RU_NAME: "ru" });
  afterEach(() => vi.unstubAllGlobals());

  it("pagine avec limit/offset, compte les entrées invalides et s'arrête sans `next`", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(url);
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
        const offset = Number(new URL(url).searchParams.get("offset"));
        if (offset === 0) return new Response(JSON.stringify({ total: 3, limit: 100, offset: 0, next: "…", orders: [sampleOrder, { orderId: "bad" }] }), { status: 200 });
        return new Response(JSON.stringify({ total: 3, limit: 100, offset: 2, orders: [{ ...sampleOrder, orderId: "12-00000-00001" }] }), { status: 200 });
      }),
    );
    const auth = { getAccessToken: async () => "tok" };
    const pages = [];
    for await (const p of iterateEbayOrders(config, auth, { since: new Date("2026-09-01T00:00:00Z"), until: new Date("2026-10-01T00:00:00Z") })) pages.push(p);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.orders).toHaveLength(1);
    expect(pages[0]?.invalid).toEqual([{ orderId: "bad", message: expect.stringContaining("format inattendu") }]);
    expect(pages[1]?.orders[0]?.externalOrderId).toBe("12-00000-00001");
    expect(calls[0]).toContain("api.sandbox.ebay.com/sell/fulfillment/v1/order");
    expect(decodeURIComponent(calls[0] ?? "")).toContain("lastmodifieddate:[2026-09-01T00:00:00.000Z..2026-10-01T00:00:00.000Z]");
    expect(new URL(calls[1] ?? "").searchParams.get("offset")).toBe("2");
  });

  it("force un rafraîchissement sur 401 puis lève AUTH_EXPIRED si eBay refuse encore", async () => {
    const forced: boolean[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ errorId: 1001, message: "Invalid access token" }] }), { status: 401 })));
    const auth = { getAccessToken: async (o?: { forceRefresh?: boolean }) => (forced.push(Boolean(o?.forceRefresh)), "tok") };
    const it = iterateEbayOrders(config, auth, { since: new Date() });
    await expect(it.next()).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
    expect(forced).toEqual([false, true]);
  });
});
