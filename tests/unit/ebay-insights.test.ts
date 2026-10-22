import { describe, expect, it } from "vitest";
import { createEbayConfig } from "@/integrations/ebay/config";
import { htmlToText, maskPersonalData } from "@/integrations/ebay/insights-common";
import { ORDER } from "./helpers/ebay-fixtures";
import {
  buildLiveOrdersUrl,
  buildTrafficReportUrl,
  buildTransactionsUrl,
  parseCampaigns,
  parseCustomerServiceMetric,
  parseFulfillmentPolicies,
  parseFundsSummary,
  parseLiveOrder,
  parseLocations,
  parseOrderDetails,
  parsePayouts,
  parsePrivilege,
  parsePromotions,
  parseReturnPolicies,
  parseSellerStandards,
  parseShippingFulfillments,
  parseTrafficReport,
  parseTransaction,
  summarizeTransactions,
} from "@/integrations/ebay/insights";

/** Réponses eBay SIMULÉES (formes documentées) : aucun appel réseau. */
const cfg = createEbayConfig({ EBAY_ENV: "production", EBAY_CLIENT_ID: "app", EBAY_CLIENT_SECRET: "cert", EBAY_RU_NAME: "ru" });

const EUR = (value: string) => ({ value, currency: "EUR" });

describe("getOrder → détail compact", () => {
  it("extrait statuts, montants, frais, remises, remboursements, blocages, annulation, livraison et lignes", () => {
    const o = parseOrderDetails(ORDER);
    expect(o.status).toEqual({ payment: "PARTIALLY_REFUNDED", fulfillment: "IN_PROGRESS", cancel: "NONE_REQUESTED" });
    expect(o.pricing.total).toEqual({ value: 409.9, currency: "EUR" });
    expect(o.pricing.discount).toEqual({ value: -20, currency: "EUR" });
    expect(o.marketplaceFee.total).toEqual({ value: 54.9, currency: "EUR" });
    expect(o.totalDueSeller?.value).toBe(355);
    expect(o.payments[0]?.holds[0]).toMatchObject({ reason: "NEW_SELLER", state: "HELD", amount: { value: 100, currency: "EUR" } });
    expect(o.refunds).toEqual([{ date: "2026-10-19T08:00:00.000Z", amount: { value: 15, currency: "EUR" }, status: "REFUNDED" }]);
    expect(o.cancellation.requests[0]).toMatchObject({ initiator: "BUYER", reason: "ORDERED_BY_MISTAKE", state: "REJECTED" });
    expect(o.delivery).toMatchObject({ carrierCode: "COLISSIMO", estimatedMin: "2026-10-21T00:00:00.000Z", estimatedMax: "2026-10-23T00:00:00.000Z" });
    const line = o.lineItems[0]!;
    expect(line).toMatchObject({ itemId: "405123456789", sku: "IP13-128-NOIR", quantity: 1, fulfillmentStatus: "NOT_STARTED", shipBy: "2026-10-20T22:59:59.000Z", soldViaAdCampaign: true });
    expect(line.promotions[0]).toEqual({ id: "P1", description: "Soldes -20 €", discount: { value: 20, currency: "EUR" } });
    expect(line.variation).toEqual([{ name: "Couleur", value: "Noir" }]);
  });

  it("acheteur : pseudo, nom, ville, code postal, pays UNIQUEMENT (jamais rue, téléphone, e-mail)", () => {
    const o = parseOrderDetails(ORDER);
    expect(o.buyer).toEqual({ username: "acheteur_77", recipientName: "Jean Dupont", city: "Lyon", postalCode: "69003", country: "FR" });
    const json = JSON.stringify(o);
    expect(json).not.toContain("rue Secrète");
    expect(json).not.toContain("Bât B");
    expect(json).not.toContain("0612345678");
    expect(json).not.toContain("jean.dupont@example.com");
    expect(json).not.toContain("06 12 34 56 78");
    expect(o.buyerCheckoutNotes).toContain("[téléphone masqué]");
    expect(o.buyerCheckoutNotes).toContain("[e-mail masqué]");
  });

  it("réponse vide ou inattendue : null partout, rien d'inventé", () => {
    const o = parseOrderDetails({ unexpected: true });
    expect(o.orderId).toBeNull();
    expect(o.pricing.total).toBeNull();
    expect(o.lineItems).toEqual([]);
    expect(parseOrderDetails(null).buyer.username).toBeNull();
  });

  it("suivis d'expédition (transporteur, numéro, date)", () => {
    const t = parseShippingFulfillments({ fulfillments: [{ fulfillmentId: "F1", shipmentTrackingNumber: "6A12345678901", shippingCarrierCode: "COLISSIMO", shippedDate: "2026-10-19T15:00:00.000Z", lineItems: [{ lineItemId: "10001", quantity: 1 }] }] });
    expect(t).toEqual([{ fulfillmentId: "F1", carrier: "COLISSIMO", trackingNumber: "6A12345678901", service: null, shippedAt: "2026-10-19T15:00:00.000Z", lineItems: [{ lineItemId: "10001", quantity: 1 }] }]);
    expect(parseShippingFulfillments({})).toEqual([]);
  });

  it("commandes en direct : URL getOrders (filtres) et résumé d'une commande (pays seulement)", () => {
    const url = new URL(buildLiveOrdersUrl(cfg, { since: new Date("2026-10-13T00:00:00.000Z"), shipping: "not_shipped", limit: 200, offset: 0 }));
    expect(url.pathname).toBe("/sell/fulfillment/v1/order");
    expect(url.searchParams.get("filter")).toBe("creationdate:[2026-10-13T00:00:00.000Z..],orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}");
    const o = parseLiveOrder(ORDER);
    expect(o).toMatchObject({ orderId: "12-34567-89012", buyer: "acheteur_77", country: "FR", shipBy: "2026-10-20T22:59:59.000Z", total: { value: 409.9, currency: "EUR" }, marketplaceFee: { value: 54.9, currency: "EUR" } });
    expect(JSON.stringify(o)).not.toContain("Lyon");
  });
});

describe("Account API", () => {
  it("limites de vente, politiques détaillées, emplacements (sans rue)", () => {
    expect(parsePrivilege({ sellerRegistrationCompleted: true, sellingLimit: { amount: EUR("25000.00"), quantity: 500 } })).toEqual({ sellerRegistrationCompleted: true, sellingLimit: { amount: { value: 25000, currency: "EUR" }, quantity: 500 } });
    const ship = parseFulfillmentPolicies({ fulfillmentPolicies: [{ fulfillmentPolicyId: "1", name: "Colissimo 48h", handlingTime: { value: 1, unit: "DAY" }, shippingOptions: [{ optionType: "DOMESTIC", shippingServices: [{ shippingCarrierCode: "Colissimo", shippingServiceCode: "FR_Colissimo", shippingCost: EUR("0.00"), freeShipping: true }] }] }] });
    expect(ship[0]).toMatchObject({ name: "Colissimo 48h", handlingTime: "1 DAY", domestic: [{ service: "FR_Colissimo", free: true }], international: [] });
    const ret = parseReturnPolicies({ returnPolicies: [{ returnPolicyId: "2", name: "30 jours", returnsAccepted: true, returnPeriod: { value: 30, unit: "DAY" }, returnShippingCostPayer: "BUYER" }] });
    expect(ret[0]).toMatchObject({ returnsAccepted: true, period: "30 DAY", shippingCostPayer: "BUYER", international: null });
    const loc = parseLocations({ locations: [{ merchantLocationKey: "entrepot", name: "Entrepôt", merchantLocationStatus: "ENABLED", location: { address: { addressLine1: "1 rue X", city: "Paris", postalCode: "75011", country: "FR" } } }] });
    expect(loc).toEqual([{ key: "entrepot", name: "Entrepôt", status: "ENABLED", city: "Paris", postalCode: "75011", country: "FR" }]);
  });
});

describe("Finances API", () => {
  const txs = [
    { transactionId: "T1", transactionType: "SALE", bookingEntry: "CREDIT", amount: EUR("355.00"), totalFeeAmount: EUR("54.90"), orderId: "12-34567-89012", buyer: { username: "acheteur_77" }, transactionDate: "2026-10-18T09:20:00.000Z", orderLineItems: [{ lineItemId: "10001", feeBasisAmount: EUR("409.90"), marketplaceFees: [{ feeType: "FINAL_VALUE_FEE", amount: EUR("52.60") }, { feeType: "FINAL_VALUE_FEE_FIXED_PER_ORDER", amount: EUR("0.35") }, { feeType: "AD_FEE", amount: EUR("1.95") }] }] },
    { transactionId: "T2", transactionType: "REFUND", bookingEntry: "DEBIT", amount: EUR("15.00"), orderId: "12-34567-89012", transactionDate: "2026-10-19T08:00:00.000Z" },
    { transactionId: "T3", transactionType: "NON_SALE_CHARGE", bookingEntry: "DEBIT", amount: EUR("39.00"), feeType: "SUBSCRIPTION_FEE", transactionDate: "2026-10-01T00:00:00.000Z" },
    { transactionId: "T4", transactionType: "DISPUTE", bookingEntry: "DEBIT", amount: EUR("120.00"), transactionDate: "2026-10-05T00:00:00.000Z" },
  ].map(parseTransaction);

  it("frais par ligne et par type, remboursements, litiges, frais hors vente, net", () => {
    expect(txs[0]!.lines[0]).toMatchObject({ lineItemId: "10001", feeBasis: { value: 409.9, currency: "EUR" } });
    const s = summarizeTransactions(txs);
    expect(s.transactions).toBe(4);
    expect(s.byType.SALE).toEqual({ count: 1, credits: { EUR: 355 }, debits: {} });
    expect(s.byType.REFUND?.debits).toEqual({ EUR: 15 });
    expect(s.byType.DISPUTE?.debits).toEqual({ EUR: 120 });
    expect(s.saleFeesByType).toEqual({ FINAL_VALUE_FEE: { EUR: 52.6 }, FINAL_VALUE_FEE_FIXED_PER_ORDER: { EUR: 0.35 }, AD_FEE: { EUR: 1.95 } });
    expect(s.nonSaleChargesByType).toEqual({ SUBSCRIPTION_FEE: { EUR: 39 } });
    expect(s.totalSaleFees).toEqual({ EUR: 54.9 });
    expect(s.net).toEqual({ EUR: 181 }); // 355 − 15 − 39 − 120
  });

  it("URL transactions (domaine apiz, filtre date + commande), versements triés, fonds", () => {
    const url = new URL(buildTransactionsUrl(cfg, { from: new Date("2026-09-20T00:00:00.000Z"), to: new Date("2026-10-20T00:00:00.000Z"), orderId: "12-34567-89012", limit: 200, offset: 0 }));
    expect(url.host).toBe("apiz.ebay.com");
    expect(url.searchParams.get("filter")).toBe("transactionDate:[2026-09-20T00:00:00.000Z..2026-10-20T00:00:00.000Z],orderId:{12-34567-89012}");
    const payouts = parsePayouts({ payouts: [{ payoutId: "P1", payoutStatus: "SUCCEEDED", payoutDate: "2026-10-10T00:00:00.000Z", amount: EUR("800.00"), transactionCount: 4, payoutInstrument: { instrumentType: "BANK", accountLastFourDigits: "1234", nickname: "Compte pro" } }, { payoutId: "P2", payoutStatus: "INITIATED", payoutDate: "2026-10-17T00:00:00.000Z", amount: EUR("300.00") }] });
    expect(payouts.map((p) => p.id)).toEqual(["P2", "P1"]);
    expect(JSON.stringify(payouts)).not.toContain("1234");
    expect(parseFundsSummary({ availableFunds: EUR("120.00"), processingFunds: EUR("355.00"), fundsOnHold: EUR("100.00"), totalFunds: EUR("575.00") })).toEqual({ available: { value: 120, currency: "EUR" }, processing: { value: 355, currency: "EUR" }, onHold: { value: 100, currency: "EUR" }, total: { value: 575, currency: "EUR" } });
  });
});

describe("Analytics et Marketing API", () => {
  it("rapport de trafic : URL (dates yyyyMMdd, marketplace) et valeurs dans l'ordre de l'en-tête", () => {
    const url = new URL(buildTrafficReportUrl(cfg, { dimension: "LISTING", marketplaceId: "EBAY_FR", from: new Date("2026-09-20T12:00:00Z"), to: new Date("2026-10-20T12:00:00Z") }));
    expect(url.searchParams.get("filter")).toBe("marketplace_ids:{EBAY_FR},date_range:[20260920..20261020]");
    expect(url.searchParams.get("metric")).toBe("LISTING_IMPRESSION_TOTAL,LISTING_VIEWS_TOTAL,CLICK_THROUGH_RATE,SALES_CONVERSION_RATE,TRANSACTION");
    const report = parseTrafficReport({
      startDate: "2026-09-20T00:00:00.000Z",
      endDate: "2026-10-19T00:00:00.000Z",
      lastUpdatedDate: "2026-10-19T08:00:00.000Z",
      header: { dimensionKeys: [{ key: "LISTING_ID" }], metrics: [{ key: "LISTING_VIEWS_TOTAL" }, { key: "TRANSACTION" }, { key: "CLICK_THROUGH_RATE" }] },
      records: [{ dimensionValues: [{ value: "405123456789", applicable: true }], metricValues: [{ value: 120, applicable: true }, { value: 2, applicable: true }, { value: "1.5", applicable: false }] }],
    });
    expect(report.rows).toEqual([{ key: "405123456789", values: { LISTING_VIEWS_TOTAL: 120, TRANSACTION: 2, CLICK_THROUGH_RATE: null } }]);
    expect(report.lastUpdated).toBe("2026-10-19T08:00:00.000Z");
  });

  it("niveau vendeur, service client, campagnes, promotions (formes tolérées)", () => {
    const p = parseSellerStandards({ standardsProfiles: [{ program: "PROGRAM_GLOBAL", standardsLevel: "TOP_RATED", defaultProgram: true, cycle: { cycleType: "CURRENT", evaluationDate: "2026-10-20T00:00:00.000Z" }, metrics: [{ metricKey: "DEFECTIVE_TRANSACTION_RATE", name: "Taux de transactions défectueuses", level: "TOP_RATED", value: { value: "0.4", numerator: 1, denominator: 250 }, thresholdUpperBound: { value: "0.5" } }] }] });
    expect(p[0]).toMatchObject({ program: "PROGRAM_GLOBAL", level: "TOP_RATED", cycle: "CURRENT" });
    expect(p[0]!.metrics[0]).toMatchObject({ value: { value: 0.4, numerator: 1, denominator: 250 }, thresholdUpper: { value: 0.5 }, thresholdLower: null });
    const csm = parseCustomerServiceMetric("ITEM_NOT_RECEIVED", { marketplaceId: "EBAY_FR", evaluationCycle: { evaluationType: "CURRENT" }, dimensionMetrics: [{ dimension: { dimensionKey: "SHIPPING_REGION", name: "France", value: "FR" }, metrics: [{ metricKey: "RATE", value: "0.8", benchmark: { rating: "AVERAGE" } }] }] });
    expect(csm.dimensions[0]).toEqual({ name: "France", value: "FR", metrics: [{ key: "RATE", value: 0.8, rating: "AVERAGE" }] });
    expect(parseCampaigns({ campaigns: [{ campaignId: "C1", campaignName: "Smartphones", campaignStatus: "RUNNING", fundingStrategy: { fundingModel: "COST_PER_SALE", bidPercentage: "4.5" } }] })[0]).toMatchObject({ id: "C1", status: "RUNNING", fundingModel: "COST_PER_SALE", bidPercentage: 4.5 });
    expect(parsePromotions({ promotions: [{ promotionId: "PR1", name: "-10 % accessoires", promotionType: "MARKDOWN_SALE", promotionStatus: "RUNNING", endDate: "2026-10-31T23:00:00.000Z" }] })[0]).toMatchObject({ type: "MARKDOWN_SALE", status: "RUNNING" });
  });
});

describe("textes libres", () => {
  it("masque e-mails et téléphones, garde numéros de commande et d'objet", () => {
    expect(maskPersonalData("Appelez le +33 6 12 34 56 78 ou le 06.12.34.56.78, mail a.b@c.fr — commande 12-34567-89012, objet 405123456789")).toBe(
      "Appelez le [téléphone masqué] ou le [téléphone masqué], mail [e-mail masqué] — commande 12-34567-89012, objet 405123456789",
    );
  });
  it("téléphones avec tirets masqués (I-26) ; numéros de commande (même commençant par 0) et d'objet conservés", () => {
    expect(maskPersonalData("Rappelez au 06-12-34-56-78 ou +33-6-12-34-56-78. Commandes 12-34567-89012 et 02-34567-89012, objet 405123456789")).toBe(
      "Rappelez au [téléphone masqué] ou [téléphone masqué]. Commandes 12-34567-89012 et 02-34567-89012, objet 405123456789",
    );
  });
  it("HTML → texte", () => {
    expect(htmlToText("<div>Bonjour,<br/>le colis est-il parti&nbsp;?</div><script>x()</script><p>Merci &amp; bonne journée</p>")).toBe("Bonjour,\nle colis est-il parti ?\nMerci & bonne journée");
  });
});
