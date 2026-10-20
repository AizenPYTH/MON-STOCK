import type { ConnectorAuth } from "@/integrations/core/connector";
import type { EbayConfig } from "@/integrations/ebay/config";
import { ebayRestGet } from "@/integrations/ebay/rest";
import { addTo, amount, bool, clip, iso, maskPersonalData, num, rec, recs, str, yyyymmdd, type Json, type MoneyValue } from "@/integrations/ebay/insights-common";

/**
 * Lectures eBay EN DIRECT pour le conseiller (API REST officielles, uniquement des GET) :
 *  - Sell Fulfillment : getOrder, getShippingFulfillments, getOrders
 *      https://developer.ebay.com/api-docs/sell/fulfillment/resources/order/methods/getOrder
 *  - Sell Account     : getPrivileges, getOptedInPrograms, getSubscription, politiques métier
 *      https://developer.ebay.com/api-docs/sell/account/resources/methods
 *  - Sell Inventory   : getInventoryLocations
 *  - Sell Finances    : getTransactions, getPayouts, getSellerFundsSummary (hôte apiz.ebay.com)
 *      https://developer.ebay.com/api-docs/sell/finances/resources/methods
 *  - Sell Analytics   : getTrafficReport, getSellerStandardsProfiles, getCustomerServiceMetric
 *      https://developer.ebay.com/api-docs/sell/analytics/resources/methods
 *  - Sell Marketing   : getCampaigns, getAds, getPromotions
 *      https://developer.ebay.com/api-docs/sell/marketing/resources/methods
 *
 * RIEN n'est modifié chez eBay. Les parseurs sont tolérants : champ absent → null.
 * Données personnelles de l'acheteur : seuls pseudo, nom du destinataire, ville, code postal et pays
 * sont extraits (jamais rue, téléphone ni e-mail) — ces données partent chez le fournisseur IA.
 */

export const DEFAULT_MARKETPLACE = "EBAY_FR";

// ---------------------------------------------------------------------------
// Commandes (Sell Fulfillment)
// ---------------------------------------------------------------------------

export interface OrderLineDetails {
  lineItemId: string | null;
  itemId: string | null;
  sku: string | null;
  title: string | null;
  quantity: number | null;
  variation: Array<{ name: string; value: string }>;
  /** lineItemCost eBay : prix de la ligne AVANT remises (prix unitaire × quantité selon la doc eBay). */
  priceBeforeDiscounts: MoneyValue | null;
  /** total eBay de la ligne (après remises, port et taxes inclus selon le marketplace). */
  total: MoneyValue | null;
  shippingCost: MoneyValue | null;
  fulfillmentStatus: string | null;
  promotions: Array<{ id: string | null; description: string | null; discount: MoneyValue | null }>;
  taxes: Array<{ type: string | null; amount: MoneyValue | null }>;
  ebayCollectedTaxes: Array<{ type: string | null; amount: MoneyValue | null; method: string | null }>;
  refunds: Array<{ date: string | null; amount: MoneyValue | null }>;
  shipBy: string | null;
  estimatedDelivery: { min: string | null; max: string | null };
  guaranteedDelivery: boolean | null;
  soldViaAdCampaign: boolean | null;
}

export interface OrderDetails {
  orderId: string | null;
  legacyOrderId: string | null;
  salesRecordReference: string | null;
  createdAt: string | null;
  lastModifiedAt: string | null;
  status: { payment: string | null; fulfillment: string | null; cancel: string | null };
  /** Minimum utile : jamais rue, téléphone ni e-mail. */
  buyer: { username: string | null; recipientName: string | null; city: string | null; postalCode: string | null; country: string | null };
  pricing: { subtotal: MoneyValue | null; discount: MoneyValue | null; deliveryCost: MoneyValue | null; deliveryDiscount: MoneyValue | null; tax: MoneyValue | null; adjustment: MoneyValue | null; total: MoneyValue | null };
  marketplaceFee: { total: MoneyValue | null; feeBasis: MoneyValue | null };
  totalDueSeller: MoneyValue | null;
  ebayCollectedTaxes: Array<{ type: string | null; amount: MoneyValue | null; method: string | null }>;
  payments: Array<{ method: string | null; status: string | null; date: string | null; amount: MoneyValue | null; holds: Array<{ reason: string | null; state: string | null; amount: MoneyValue | null; expectedReleaseDate: string | null; releasedAt: string | null }> }>;
  refunds: Array<{ date: string | null; amount: MoneyValue | null; status: string | null }>;
  cancellation: { state: string | null; cancelledAt: string | null; requests: Array<{ requestedAt: string | null; completedAt: string | null; initiator: string | null; reason: string | null; state: string | null }> };
  delivery: { type: string | null; carrierCode: string | null; serviceCode: string | null; estimatedMin: string | null; estimatedMax: string | null; ebaySupportedFulfillment: boolean | null };
  buyerCheckoutNotes: string | null;
  lineItems: OrderLineDetails[];
}

function taxList(v: unknown) {
  return recs(v).map((t) => ({ type: str(t.taxType), amount: amount(t.amount) }));
}
function collectedTaxList(v: unknown) {
  return recs(v).map((t) => ({ type: str(t.taxType), amount: amount(t.amount), method: str(t.collectionMethod) }));
}

function parseLine(li: Json): OrderLineDetails {
  const instr = rec(li.lineItemFulfillmentInstructions);
  const props = rec(li.properties);
  const delivery = rec(li.deliveryCost);
  return {
    lineItemId: str(li.lineItemId),
    itemId: str(li.legacyItemId),
    sku: str(li.sku),
    title: str(li.title),
    quantity: num(li.quantity),
    variation: recs(li.variationAspects)
      .map((a) => ({ name: str(a.name) ?? "", value: str(a.value) ?? "" }))
      .filter((a) => a.name && a.value),
    priceBeforeDiscounts: amount(li.lineItemCost),
    total: amount(li.total),
    shippingCost: amount(delivery?.shippingCost),
    fulfillmentStatus: str(li.lineItemFulfillmentStatus),
    promotions: recs(li.appliedPromotions).map((p) => ({ id: str(p.promotionId), description: clip(str(p.description), 120), discount: amount(p.discountAmount) })),
    taxes: taxList(li.taxes),
    ebayCollectedTaxes: collectedTaxList(li.ebayCollectAndRemitTaxes),
    refunds: recs(li.refunds).map((r) => ({ date: iso(r.refundDate), amount: amount(r.amount) })),
    shipBy: iso(instr?.shipByDate),
    estimatedDelivery: { min: iso(instr?.minEstimatedDeliveryDate), max: iso(instr?.maxEstimatedDeliveryDate) },
    guaranteedDelivery: bool(instr?.guaranteedDelivery),
    soldViaAdCampaign: bool(props?.soldViaAdCampaign),
  };
}

/** Réponse de getOrder → détail compact. Seuls pseudo, nom, ville, code postal et pays de l'acheteur sont conservés. */
export function parseOrderDetails(raw: unknown): OrderDetails {
  const o = rec(raw) ?? {};
  const ps = rec(o.pricingSummary);
  const pay = rec(o.paymentSummary);
  const cancel = rec(o.cancelStatus);
  const instr = recs(o.fulfillmentStartInstructions)[0] ?? null;
  const step = rec(instr?.shippingStep);
  const shipTo = rec(step?.shipTo);
  const address = rec(shipTo?.contactAddress);
  const buyer = rec(o.buyer);
  return {
    orderId: str(o.orderId),
    legacyOrderId: str(o.legacyOrderId),
    salesRecordReference: str(o.salesRecordReference),
    createdAt: iso(o.creationDate),
    lastModifiedAt: iso(o.lastModifiedDate),
    status: { payment: str(o.orderPaymentStatus), fulfillment: str(o.orderFulfillmentStatus), cancel: str(cancel?.cancelState) },
    buyer: {
      username: str(buyer?.username),
      recipientName: str(shipTo?.fullName),
      city: str(address?.city),
      postalCode: str(address?.postalCode),
      country: str(address?.countryCode),
    },
    pricing: {
      subtotal: amount(ps?.priceSubtotal),
      discount: amount(ps?.priceDiscount ?? ps?.priceDiscountSubtotal),
      deliveryCost: amount(ps?.deliveryCost),
      deliveryDiscount: amount(ps?.deliveryDiscount),
      tax: amount(ps?.tax),
      adjustment: amount(ps?.adjustment),
      total: amount(ps?.total),
    },
    marketplaceFee: { total: amount(o.totalMarketplaceFee) ?? amount(ps?.fee), feeBasis: amount(o.totalFeeBasisAmount) },
    totalDueSeller: amount(pay?.totalDueSeller),
    ebayCollectedTaxes: collectedTaxList(o.ebayCollectAndRemitTax),
    payments: recs(pay?.payments).map((p) => ({
      method: str(p.paymentMethod),
      status: str(p.paymentStatus),
      date: iso(p.paymentDate),
      amount: amount(p.amount),
      holds: recs(p.paymentHolds).map((h) => ({ reason: str(h.holdReason), state: str(h.holdState), amount: amount(h.holdAmount), expectedReleaseDate: iso(h.expectedReleaseDate), releasedAt: iso(h.releaseDate) })),
    })),
    refunds: recs(pay?.refunds).map((r) => ({ date: iso(r.refundDate), amount: amount(r.amount), status: str(r.refundStatus) })),
    cancellation: {
      state: str(cancel?.cancelState),
      cancelledAt: iso(cancel?.cancelledDate),
      requests: recs(cancel?.cancelRequests).map((r) => ({ requestedAt: iso(r.cancelRequestedDate), completedAt: iso(r.cancelCompletedDate), initiator: str(r.cancelInitiator), reason: str(r.cancelReason), state: str(r.cancelRequestState) })),
    },
    delivery: {
      type: str(instr?.fulfillmentInstructionsType),
      carrierCode: str(step?.shippingCarrierCode),
      serviceCode: str(step?.shippingServiceCode),
      estimatedMin: iso(instr?.minEstimatedDeliveryDate),
      estimatedMax: iso(instr?.maxEstimatedDeliveryDate),
      ebaySupportedFulfillment: bool(instr?.ebaySupportedFulfillment),
    },
    buyerCheckoutNotes: clip(maskPersonalData(str(o.buyerCheckoutNotes)), 300),
    lineItems: recs(o.lineItems).map(parseLine),
  };
}

export interface ShipmentTracking {
  fulfillmentId: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  service: string | null;
  shippedAt: string | null;
  lineItems: Array<{ lineItemId: string | null; quantity: number | null }>;
}

export function parseShippingFulfillments(raw: unknown): ShipmentTracking[] {
  return recs(rec(raw)?.fulfillments).map((f) => ({
    fulfillmentId: str(f.fulfillmentId),
    carrier: str(f.shippingCarrierCode),
    trackingNumber: str(f.shipmentTrackingNumber),
    service: str(f.shippingServiceCode),
    shippedAt: iso(f.shippedDate),
    lineItems: recs(f.lineItems).map((l) => ({ lineItemId: str(l.lineItemId), quantity: num(l.quantity) })),
  }));
}

/** Identifiant de commande eBay accepté (ex. 12-34567-89012) : jamais de caractère de chemin. */
export const EBAY_ORDER_ID = /^[0-9A-Za-z!-]{5,64}$/;

export async function fetchOrderDetails(config: EbayConfig, auth: ConnectorAuth, orderId: string): Promise<OrderDetails> {
  const json = await ebayRestGet(auth, `${config.apiBase}/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}?fieldGroups=TAX_BREAKDOWN`, "fulfillment:getOrder");
  return parseOrderDetails(json);
}

export async function fetchShippingFulfillments(config: EbayConfig, auth: ConnectorAuth, orderId: string): Promise<ShipmentTracking[]> {
  const json = await ebayRestGet(auth, `${config.apiBase}/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}/shipping_fulfillment`, "fulfillment:getShippingFulfillments");
  return parseShippingFulfillments(json);
}

export interface LiveOrder {
  orderId: string | null;
  legacyOrderId: string | null;
  createdAt: string | null;
  payment: string | null;
  fulfillment: string | null;
  cancel: string | null;
  buyer: string | null;
  country: string | null;
  total: MoneyValue | null;
  marketplaceFee: MoneyValue | null;
  shipBy: string | null;
  items: Array<{ title: string | null; sku: string | null; itemId: string | null; quantity: number | null; total: MoneyValue | null }>;
}

export function parseLiveOrder(raw: unknown): LiveOrder {
  const o = rec(raw) ?? {};
  const ps = rec(o.pricingSummary);
  const instr = recs(o.fulfillmentStartInstructions)[0] ?? null;
  const shipTo = rec(rec(instr?.shippingStep)?.shipTo);
  const lines = recs(o.lineItems);
  const shipBy = lines
    .map((l) => iso(rec(l.lineItemFulfillmentInstructions)?.shipByDate))
    .filter((d): d is string => d !== null)
    .sort()[0] ?? null;
  return {
    orderId: str(o.orderId),
    legacyOrderId: str(o.legacyOrderId),
    createdAt: iso(o.creationDate),
    payment: str(o.orderPaymentStatus),
    fulfillment: str(o.orderFulfillmentStatus),
    cancel: str(rec(o.cancelStatus)?.cancelState),
    buyer: str(rec(o.buyer)?.username),
    country: str(rec(shipTo?.contactAddress)?.countryCode),
    total: amount(ps?.total),
    marketplaceFee: amount(o.totalMarketplaceFee) ?? amount(ps?.fee),
    shipBy,
    items: lines.map((l) => ({ title: clip(str(l.title), 90), sku: str(l.sku), itemId: str(l.legacyItemId), quantity: num(l.quantity), total: amount(l.total) })),
  };
}

export type LiveShippingFilter = "all" | "not_shipped" | "shipped";

/** URL getOrders : filtre creationdate (UTC, ms) et, côté eBay, statut d'expédition. */
export function buildLiveOrdersUrl(config: EbayConfig, params: { since: Date; shipping: LiveShippingFilter; limit: number; offset: number }): string {
  const url = new URL(`${config.apiBase}/sell/fulfillment/v1/order`);
  const filters = [`creationdate:[${params.since.toISOString()}..]`];
  if (params.shipping === "not_shipped") filters.push("orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}");
  if (params.shipping === "shipped") filters.push("orderfulfillmentstatus:{FULFILLED}");
  url.searchParams.set("filter", filters.join(","));
  url.searchParams.set("limit", String(params.limit));
  url.searchParams.set("offset", String(params.offset));
  return url.toString();
}

export async function fetchLiveOrders(config: EbayConfig, auth: ConnectorAuth, params: { since: Date; shipping: LiveShippingFilter; maxOrders: number }): Promise<{ orders: LiveOrder[]; total: number | null; truncated: boolean }> {
  const orders: LiveOrder[] = [];
  let total: number | null = null;
  for (let offset = 0; offset < params.maxOrders; ) {
    const limit = Math.min(200, params.maxOrders - offset);
    const json = rec(await ebayRestGet(auth, buildLiveOrdersUrl(config, { since: params.since, shipping: params.shipping, limit, offset }), "fulfillment:getOrders"));
    total = num(json?.total);
    const page = recs(json?.orders);
    orders.push(...page.map(parseLiveOrder));
    if (!str(json?.next) || page.length === 0) return { orders, total, truncated: false };
    offset += page.length;
  }
  return { orders, total, truncated: total !== null && total > orders.length };
}

// ---------------------------------------------------------------------------
// Compte (Sell Account / Inventory)
// ---------------------------------------------------------------------------

export interface PrivilegeInfo {
  sellerRegistrationCompleted: boolean | null;
  sellingLimit: { amount: MoneyValue | null; quantity: number | null };
}

export function parsePrivilege(raw: unknown): PrivilegeInfo {
  const r = rec(raw);
  const lim = rec(r?.sellingLimit);
  return { sellerRegistrationCompleted: bool(r?.sellerRegistrationCompleted), sellingLimit: { amount: amount(lim?.amount), quantity: num(lim?.quantity) } };
}

export function parseOptedInPrograms(raw: unknown): string[] {
  return recs(rec(raw)?.programs)
    .map((p) => str(p.programType))
    .filter((x): x is string => x !== null);
}

export function parseSubscriptions(raw: unknown): Array<{ marketplaceId: string | null; level: string | null; type: string | null; term: string | null }> {
  return recs(rec(raw)?.subscriptions).map((s) => {
    const term = rec(s.term);
    return { marketplaceId: str(s.marketplaceId), level: str(s.subscriptionLevel), type: str(s.subscriptionType), term: term ? [str(term.value), str(term.unit)].filter(Boolean).join(" ") || null : null };
  });
}

function duration(v: unknown): string | null {
  const d = rec(v);
  if (!d) return null;
  return [str(d.value), str(d.unit)].filter(Boolean).join(" ") || null;
}

export interface FulfillmentPolicySummary {
  id: string | null;
  name: string | null;
  handlingTime: string | null;
  domestic: Array<{ carrier: string | null; service: string | null; cost: MoneyValue | null; free: boolean | null }>;
  international: Array<{ carrier: string | null; service: string | null; cost: MoneyValue | null; free: boolean | null }>;
  localPickup: boolean | null;
}

export function parseFulfillmentPolicies(raw: unknown): FulfillmentPolicySummary[] {
  return recs(rec(raw)?.fulfillmentPolicies).map((p) => {
    const options = recs(p.shippingOptions);
    const services = (type: string) =>
      options
        .filter((o) => str(o.optionType) === type)
        .flatMap((o) => recs(o.shippingServices))
        .slice(0, 5)
        .map((s) => ({ carrier: str(s.shippingCarrierCode), service: str(s.shippingServiceCode), cost: amount(s.shippingCost), free: bool(s.freeShipping) }));
    return { id: str(p.fulfillmentPolicyId), name: str(p.name), handlingTime: duration(p.handlingTime), domestic: services("DOMESTIC"), international: services("INTERNATIONAL"), localPickup: bool(p.localPickup) };
  });
}

export interface ReturnPolicySummary {
  id: string | null;
  name: string | null;
  returnsAccepted: boolean | null;
  period: string | null;
  shippingCostPayer: string | null;
  refundMethod: string | null;
  international: { returnsAccepted: boolean | null; period: string | null; shippingCostPayer: string | null } | null;
}

export function parseReturnPolicies(raw: unknown): ReturnPolicySummary[] {
  return recs(rec(raw)?.returnPolicies).map((p) => {
    const intl = rec(p.internationalOverride);
    return {
      id: str(p.returnPolicyId),
      name: str(p.name),
      returnsAccepted: bool(p.returnsAccepted),
      period: duration(p.returnPeriod),
      shippingCostPayer: str(p.returnShippingCostPayer),
      refundMethod: str(p.refundMethod),
      international: intl ? { returnsAccepted: bool(intl.returnsAccepted), period: duration(intl.returnPeriod), shippingCostPayer: str(intl.returnShippingCostPayer) } : null,
    };
  });
}

export function parsePaymentPolicies(raw: unknown): Array<{ id: string | null; name: string | null; immediatePay: boolean | null }> {
  return recs(rec(raw)?.paymentPolicies).map((p) => ({ id: str(p.paymentPolicyId), name: str(p.name), immediatePay: bool(p.immediatePay) }));
}

/** Emplacements d'inventaire du VENDEUR (ville / code postal / pays ; pas de rue). */
export function parseLocations(raw: unknown): Array<{ key: string | null; name: string | null; status: string | null; city: string | null; postalCode: string | null; country: string | null }> {
  return recs(rec(raw)?.locations).map((l) => {
    const address = rec(rec(l.location)?.address);
    return { key: str(l.merchantLocationKey), name: str(l.name), status: str(l.merchantLocationStatus), city: str(address?.city), postalCode: str(address?.postalCode), country: str(address?.country) };
  });
}

export function accountUrls(config: EbayConfig, marketplaceId: string) {
  const m = encodeURIComponent(marketplaceId);
  return {
    privilege: `${config.apiBase}/sell/account/v1/privilege`,
    programs: `${config.apiBase}/sell/account/v1/program/get_opted_in_programs`,
    subscription: `${config.apiBase}/sell/account/v1/subscription`,
    fulfillmentPolicies: `${config.apiBase}/sell/account/v1/fulfillment_policy?marketplace_id=${m}`,
    returnPolicies: `${config.apiBase}/sell/account/v1/return_policy?marketplace_id=${m}`,
    paymentPolicies: `${config.apiBase}/sell/account/v1/payment_policy?marketplace_id=${m}`,
    locations: `${config.apiBase}/sell/inventory/v1/location?limit=100`,
  };
}

// ---------------------------------------------------------------------------
// Finances (Sell Finances — sell.finances, hôte apiz)
// ---------------------------------------------------------------------------

export interface FinanceTransaction {
  id: string | null;
  type: string | null;
  status: string | null;
  date: string | null;
  /** CREDIT (en faveur du vendeur) ou DEBIT */
  bookingEntry: string | null;
  amount: MoneyValue | null;
  orderId: string | null;
  buyer: string | null;
  totalFee: MoneyValue | null;
  /** Frais eBay par ligne de commande (lineItemId → frais par type) */
  lines: Array<{ lineItemId: string | null; feeBasis: MoneyValue | null; fees: Array<{ type: string | null; amount: MoneyValue | null }> }>;
  fees: Array<{ type: string | null; amount: MoneyValue | null }>;
  /** NON_SALE_CHARGE : type de frais (publicité, abonnement…) */
  feeType: string | null;
  memo: string | null;
  payoutId: string | null;
}

export function parseTransaction(raw: unknown): FinanceTransaction {
  const t = rec(raw) ?? {};
  const lines = recs(t.orderLineItems).map((li) => ({ lineItemId: str(li.lineItemId), feeBasis: amount(li.feeBasisAmount), fees: recs(li.marketplaceFees).map((f) => ({ type: str(f.feeType), amount: amount(f.amount) })) }));
  const fees = lines.flatMap((l) => l.fees);
  return {
    id: str(t.transactionId),
    type: str(t.transactionType),
    status: str(t.transactionStatus),
    date: iso(t.transactionDate),
    bookingEntry: str(t.bookingEntry),
    amount: amount(t.amount),
    orderId: str(t.orderId),
    buyer: str(rec(t.buyer)?.username),
    totalFee: amount(t.totalFeeAmount),
    lines,
    fees,
    feeType: str(t.feeType),
    memo: clip(str(t.transactionMemo), 160),
    payoutId: str(t.payoutId),
  };
}

export interface TransactionsSummary {
  transactions: number;
  byType: Record<string, { count: number; credits: Record<string, number>; debits: Record<string, number> }>;
  /** Frais de vente eBay (lignes de commande) par type de frais (FINAL_VALUE_FEE, AD_FEE…) */
  saleFeesByType: Record<string, Record<string, number>>;
  /** Frais hors vente (NON_SALE_CHARGE) par type */
  nonSaleChargesByType: Record<string, Record<string, number>>;
  totalSaleFees: Record<string, number>;
  /** Crédits − débits, par devise, sur les transactions lues */
  net: Record<string, number>;
}

export function summarizeTransactions(txs: FinanceTransaction[]): TransactionsSummary {
  const out: TransactionsSummary = { transactions: txs.length, byType: {}, saleFeesByType: {}, nonSaleChargesByType: {}, totalSaleFees: {}, net: {} };
  for (const t of txs) {
    const type = t.type ?? "UNKNOWN";
    const g = (out.byType[type] ??= { count: 0, credits: {}, debits: {} });
    g.count += 1;
    const debit = t.bookingEntry === "DEBIT";
    addTo(debit ? g.debits : g.credits, t.amount);
    addTo(out.net, t.amount, debit ? -1 : 1);
    if (type === "NON_SALE_CHARGE") addTo((out.nonSaleChargesByType[t.feeType ?? "AUTRE"] ??= {}), t.amount);
    for (const f of t.fees) addTo((out.saleFeesByType[f.type ?? "AUTRE"] ??= {}), f.amount);
    if (type === "SALE") addTo(out.totalSaleFees, t.totalFee);
  }
  return out;
}

export function buildTransactionsUrl(config: EbayConfig, params: { from: Date; to: Date; orderId?: string; limit: number; offset: number }): string {
  const url = new URL(`${config.apizBase}/sell/finances/v1/transaction`);
  const filters = [`transactionDate:[${params.from.toISOString()}..${params.to.toISOString()}]`];
  if (params.orderId) filters.push(`orderId:{${params.orderId}}`);
  url.searchParams.set("filter", filters.join(","));
  url.searchParams.set("limit", String(params.limit));
  url.searchParams.set("offset", String(params.offset));
  return url.toString();
}

export async function fetchTransactions(config: EbayConfig, auth: ConnectorAuth, params: { from: Date; to: Date; orderId?: string; marketplaceId: string; maxTransactions: number }): Promise<{ transactions: FinanceTransaction[]; total: number | null; truncated: boolean }> {
  const transactions: FinanceTransaction[] = [];
  let total: number | null = null;
  for (let offset = 0; offset < params.maxTransactions; ) {
    const limit = Math.min(200, params.maxTransactions - offset);
    const json = rec(await ebayRestGet(auth, buildTransactionsUrl(config, { ...params, limit, offset }), "finances:getTransactions", { marketplaceId: params.marketplaceId }));
    total = num(json?.total);
    const page = recs(json?.transactions);
    transactions.push(...page.map(parseTransaction));
    if (!str(json?.next) || page.length === 0) return { transactions, total, truncated: false };
    offset += page.length;
  }
  return { transactions, total, truncated: total !== null && total > transactions.length };
}

export interface Payout {
  id: string | null;
  status: string | null;
  date: string | null;
  amount: MoneyValue | null;
  transactionCount: number | null;
  instrumentType: string | null;
}

export function parsePayouts(raw: unknown): Payout[] {
  return recs(rec(raw)?.payouts)
    .map((p) => ({ id: str(p.payoutId), status: str(p.payoutStatus), date: iso(p.payoutDate), amount: amount(p.amount), transactionCount: num(p.transactionCount), instrumentType: str(rec(p.payoutInstrument)?.instrumentType) }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export function buildPayoutsUrl(config: EbayConfig, params: { from: Date; to: Date; limit: number }): string {
  const url = new URL(`${config.apizBase}/sell/finances/v1/payout`);
  url.searchParams.set("filter", `payoutDate:[${params.from.toISOString()}..${params.to.toISOString()}]`);
  url.searchParams.set("limit", String(params.limit));
  return url.toString();
}

export function parseFundsSummary(raw: unknown): { available: MoneyValue | null; processing: MoneyValue | null; onHold: MoneyValue | null; total: MoneyValue | null } {
  const r = rec(raw);
  return { available: amount(r?.availableFunds), processing: amount(r?.processingFunds), onHold: amount(r?.fundsOnHold), total: amount(r?.totalFunds) };
}

// ---------------------------------------------------------------------------
// Analytics (sell.analytics.readonly)
// ---------------------------------------------------------------------------

export const TRAFFIC_METRICS = ["LISTING_IMPRESSION_TOTAL", "LISTING_VIEWS_TOTAL", "CLICK_THROUGH_RATE", "SALES_CONVERSION_RATE", "TRANSACTION"] as const;
export type TrafficMetric = (typeof TRAFFIC_METRICS)[number];

export function buildTrafficReportUrl(config: EbayConfig, params: { dimension: "LISTING" | "DAY"; marketplaceId: string; from: Date; to: Date; listingIds?: string[] }): string {
  const url = new URL(`${config.apiBase}/sell/analytics/v1/traffic_report`);
  const filters = [`marketplace_ids:{${params.marketplaceId}}`, `date_range:[${yyyymmdd(params.from)}..${yyyymmdd(params.to)}]`];
  if (params.listingIds?.length) filters.push(`listing_ids:{${params.listingIds.join("|")}}`);
  url.searchParams.set("dimension", params.dimension);
  url.searchParams.set("filter", filters.join(","));
  url.searchParams.set("metric", TRAFFIC_METRICS.join(","));
  return url.toString();
}

export interface TrafficReport {
  startDate: string | null;
  endDate: string | null;
  lastUpdated: string | null;
  metrics: string[];
  rows: Array<{ key: string | null; values: Record<string, number | null> }>;
  warnings: string[];
}

/** Rapport de trafic : en-tête (clés de métriques) + enregistrements (valeurs dans le même ordre). */
export function parseTrafficReport(raw: unknown): TrafficReport {
  const r = rec(raw) ?? {};
  const header = rec(r.header);
  const metrics = recs(header?.metrics).map((m) => str(m.key) ?? "?");
  return {
    startDate: iso(r.startDate),
    endDate: iso(r.endDate),
    lastUpdated: iso(r.lastUpdatedDate),
    metrics,
    rows: recs(r.records).map((rowRaw) => {
      const values: Record<string, number | null> = {};
      recs(rowRaw.metricValues).forEach((v, i) => {
        values[metrics[i] ?? `metric_${i}`] = bool(v.applicable) === false ? null : num(v.value);
      });
      return { key: str(recs(rowRaw.dimensionValues)[0]?.value), values };
    }),
    warnings: recs(r.warnings)
      .map((w) => str(w.message) ?? str(w.longMessage))
      .filter((x): x is string => x !== null),
  };
}

/** Valeur de métrique eBay : nombre, texte, ou objet { value, numerator, denominator }. */
export function metricValue(v: unknown): { value: number | string | null; numerator: number | null; denominator: number | null } {
  const r = rec(v);
  if (r) return { value: num(r.value) ?? str(r.value), numerator: num(r.numerator), denominator: num(r.denominator) };
  return { value: num(v) ?? str(v), numerator: null, denominator: null };
}

export interface SellerStandardsProfile {
  program: string | null;
  cycle: string | null;
  evaluatedAt: string | null;
  level: string | null;
  defaultProgram: boolean | null;
  evaluationReason: string | null;
  metrics: Array<{ key: string | null; name: string | null; level: string | null; value: ReturnType<typeof metricValue>; thresholdLower: ReturnType<typeof metricValue> | null; thresholdUpper: ReturnType<typeof metricValue> | null; lookback: string | null }>;
}

export function parseSellerStandards(raw: unknown): SellerStandardsProfile[] {
  return recs(rec(raw)?.standardsProfiles).map((p) => {
    const cycle = rec(p.cycle);
    return {
      program: str(p.program),
      cycle: str(cycle?.cycleType),
      evaluatedAt: iso(cycle?.evaluationDate) ?? str(cycle?.evaluationMonth),
      level: str(p.standardsLevel),
      defaultProgram: bool(p.defaultProgram),
      evaluationReason: str(p.evaluationReason),
      metrics: recs(p.metrics).map((m) => {
        const lookback = rec(m.lookback);
        return {
          key: str(m.metricKey),
          name: str(m.name),
          level: str(m.level),
          value: metricValue(m.value),
          thresholdLower: m.thresholdLowerBound === undefined ? null : metricValue(m.thresholdLowerBound),
          thresholdUpper: m.thresholdUpperBound === undefined ? null : metricValue(m.thresholdUpperBound),
          lookback: lookback ? [str(lookback.value), str(lookback.unit)].filter(Boolean).join(" ") || null : null,
        };
      }),
    };
  });
}

export interface CustomerServiceMetric {
  type: string;
  marketplaceId: string | null;
  evaluation: { type: string | null; start: string | null; end: string | null };
  dimensions: Array<{ name: string | null; value: string | null; metrics: Array<{ key: string | null; value: number | string | null; rating: string | null }> }>;
}

export function parseCustomerServiceMetric(type: string, raw: unknown): CustomerServiceMetric {
  const r = rec(raw) ?? {};
  const cycle = rec(r.evaluationCycle);
  return {
    type,
    marketplaceId: str(r.marketplaceId),
    evaluation: { type: str(cycle?.evaluationType), start: iso(cycle?.startDate), end: iso(cycle?.endDate) },
    dimensions: recs(r.dimensionMetrics)
      .slice(0, 10)
      .map((d) => {
        const dim = rec(d.dimension);
        return {
          name: str(dim?.name) ?? str(dim?.dimensionKey),
          value: str(dim?.value),
          metrics: recs(d.metrics).map((m) => ({ key: str(m.metricKey), value: metricValue(m.value).value, rating: str(rec(m.benchmark)?.rating) })),
        };
      }),
  };
}

export const CUSTOMER_SERVICE_METRIC_TYPES = ["ITEM_NOT_AS_DESCRIBED", "ITEM_NOT_RECEIVED"] as const;

export function customerServiceMetricUrl(config: EbayConfig, type: string, marketplaceId: string): string {
  return `${config.apiBase}/sell/analytics/v1/customer_service_metric/${encodeURIComponent(type)}/${encodeURIComponent(marketplaceId)}?evaluation_type=CURRENT`;
}

// ---------------------------------------------------------------------------
// Marketing (sell.marketing.readonly)
// ---------------------------------------------------------------------------

export interface Campaign {
  id: string | null;
  name: string | null;
  status: string | null;
  marketplaceId: string | null;
  start: string | null;
  end: string | null;
  fundingModel: string | null;
  bidPercentage: number | null;
  dailyBudget: MoneyValue | null;
}

export function parseCampaigns(raw: unknown): Campaign[] {
  return recs(rec(raw)?.campaigns).map((c) => {
    const funding = rec(c.fundingStrategy);
    return {
      id: str(c.campaignId),
      name: str(c.campaignName),
      status: str(c.campaignStatus),
      marketplaceId: str(c.marketplaceId),
      start: iso(c.startDate),
      end: iso(c.endDate),
      fundingModel: str(funding?.fundingModel),
      bidPercentage: num(funding?.bidPercentage),
      dailyBudget: amount(rec(rec(c.budget)?.daily)?.amount),
    };
  });
}

export function parseAds(raw: unknown): Array<{ listingId: string | null; bidPercentage: number | null; status: string | null }> {
  return recs(rec(raw)?.ads).map((a) => ({ listingId: str(a.listingId), bidPercentage: num(a.bidPercentage), status: str(a.adStatus) }));
}

export interface Promotion {
  id: string | null;
  name: string | null;
  type: string | null;
  status: string | null;
  start: string | null;
  end: string | null;
  priority: string | null;
  description: string | null;
}

export function parsePromotions(raw: unknown): Promotion[] {
  return recs(rec(raw)?.promotions).map((p) => ({
    id: str(p.promotionId),
    name: str(p.name),
    type: str(p.promotionType),
    status: str(p.promotionStatus),
    start: iso(p.startDate),
    end: iso(p.endDate),
    priority: str(p.priority),
    description: clip(str(p.description), 160),
  }));
}

export function marketingUrls(config: EbayConfig, marketplaceId: string) {
  return {
    campaigns: `${config.apiBase}/sell/marketing/v1/ad_campaign?limit=50`,
    ads: (campaignId: string) => `${config.apiBase}/sell/marketing/v1/ad_campaign/${encodeURIComponent(campaignId)}/ad?limit=100`,
    promotions: `${config.apiBase}/sell/marketing/v1/promotion?marketplace_id=${encodeURIComponent(marketplaceId)}&limit=50`,
  };
}

export async function restGet(auth: ConnectorAuth, url: string, label: string, marketplaceId?: string): Promise<unknown> {
  return ebayRestGet(auth, url, label, marketplaceId ? { marketplaceId } : {});
}
