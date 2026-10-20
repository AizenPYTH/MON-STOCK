import { XMLParser } from "fast-xml-parser";
import type { ConnectorAuth } from "@/integrations/core/connector";
import type { EbayConfig } from "@/integrations/ebay/config";
import { clip, htmlToText, maskPersonalData, type MoneyValue } from "@/integrations/ebay/insights-common";
import { arr, assertTradingAck, EBAY_TRADING_NS, int, isoOrNull, money, node, text, tradingCall, type Node } from "@/integrations/ebay/trading";

/**
 * Trading API (XML) en LECTURE SEULE pour le conseiller — même token OAuth que GetMyeBaySelling :
 *  - GetItem (IncludeWatchCount)                 https://developer.ebay.com/devzone/xml/docs/reference/ebay/GetItem.html
 *  - GetBestOffers                                https://developer.ebay.com/devzone/xml/docs/reference/ebay/GetBestOffers.html
 *  - GetMyeBaySelling (SoldList / UnsoldList)    https://developer.ebay.com/devzone/xml/docs/reference/ebay/GetMyeBaySelling.html
 *  - GetFeedback / GetUser                        https://developer.ebay.com/devzone/xml/docs/reference/ebay/GetFeedback.html
 *  - GetMyMessages (ReturnSummary / ReturnHeaders / ReturnMessages)
 *                                                 https://developer.ebay.com/devzone/xml/docs/reference/ebay/GetMyMessages.html
 * Aucun appel « Add / Revise / End / Respond » : rien n'est modifié chez eBay.
 * Analyse tolérante : un élément absent devient null (les éléments répétés sont normalisés par `arr`).
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

function parseCall(xml: string, callName: string): { response: Node; warnings: string[] } {
  const doc = node(parser.parse(xml));
  const response = node(doc?.[`${callName}Response`]);
  const { warnings } = assertTradingAck(callName, response);
  return { response: response ?? {}, warnings };
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function request(callName: string, inner: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="${EBAY_TRADING_NS}">
  <ErrorLanguage>fr_FR</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
${inner}
</${callName}Request>`;
}

function flag(v: unknown): boolean | null {
  const t = text(v);
  return t === "true" ? true : t === "false" ? false : null;
}
function amt(v: unknown): MoneyValue | null {
  const m = money(v);
  return m.value === null && m.currency === null ? null : m;
}
function children(parent: unknown, key: string): Node[] {
  return arr(node(parent)?.[key])
    .map(node)
    .filter((x): x is Node => x !== null);
}

/** Numéro d'objet eBay (ItemID) : uniquement des chiffres. */
export const EBAY_ITEM_ID = /^\d{9,19}$/;

// ---------------------------------------------------------------------------
// GetItem / GetBestOffers
// ---------------------------------------------------------------------------

export function buildGetItemRequest(itemId: string): string {
  return request(
    "GetItem",
    `  <ItemID>${xmlEscape(itemId)}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeWatchCount>true</IncludeWatchCount>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>`,
  );
}

export interface ItemDetails {
  itemId: string | null;
  title: string | null;
  sku: string | null;
  listingType: string | null;
  listingDuration: string | null;
  status: string | null;
  site: string | null;
  startTime: string | null;
  endTime: string | null;
  url: string | null;
  price: { current: MoneyValue | null; start: MoneyValue | null; buyItNow: MoneyValue | null; beforeMarkdown: MoneyValue | null; markdownEnds: string | null };
  quantity: { listed: number | null; sold: number | null; available: number | null };
  watchCount: number | null;
  hitCount: number | null;
  bidCount: number | null;
  bestOffer: { enabled: boolean | null; offersReceived: number | null; autoAcceptPrice: MoneyValue | null; minimumPrice: MoneyValue | null };
  condition: { id: string | null; name: string | null; description: string | null };
  category: { id: string | null; name: string | null };
  dispatchTimeMaxDays: number | null;
  itemLocation: { city: string | null; country: string | null };
  businessPolicies: { shipping: string | null; returns: string | null; payment: string | null };
  returns: { accepted: string | null; within: string | null; shippingPaidBy: string | null };
  shipping: Array<{ service: string | null; cost: MoneyValue | null; free: boolean | null }>;
  itemSpecifics: Record<string, string>;
  variations: Array<{ sku: string | null; specifics: Record<string, string>; quantity: number | null; sold: number | null; price: MoneyValue | null }>;
  pictures: number;
  /** GetItem ne renvoie pas les frais d'insertion : toujours null (jamais estimés). */
  insertionFees: null;
}

function nameValues(container: unknown, max: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const nv of children(container, "NameValueList").slice(0, max)) {
    const name = text(nv.Name);
    const value = arr(nv.Value)
      .map(text)
      .filter((x): x is string => Boolean(x))
      .join(", ");
    if (name && value) out[name] = clip(value, 80) ?? value;
  }
  return out;
}

export function parseGetItemResponse(xml: string): ItemDetails {
  const { response } = parseCall(xml, "GetItem");
  const item = node(response.Item) ?? {};
  const selling = node(item.SellingStatus);
  const details = node(item.ListingDetails);
  const bo = node(item.BestOfferDetails);
  const promo = node(selling?.PromotionalSaleDetails);
  const profiles = node(item.SellerProfiles);
  const ret = node(item.ReturnPolicy);
  const listed = int(item.Quantity);
  const sold = int(selling?.QuantitySold);
  return {
    itemId: text(item.ItemID),
    title: text(item.Title),
    sku: text(item.SKU),
    listingType: text(item.ListingType),
    listingDuration: text(item.ListingDuration),
    status: text(selling?.ListingStatus),
    site: text(item.Site),
    startTime: isoOrNull(details?.StartTime),
    endTime: isoOrNull(details?.EndTime),
    url: text(details?.ViewItemURL),
    price: { current: amt(selling?.CurrentPrice), start: amt(item.StartPrice), buyItNow: amt(item.BuyItNowPrice), beforeMarkdown: amt(promo?.OriginalPrice), markdownEnds: isoOrNull(promo?.EndTime) },
    quantity: { listed, sold, available: listed !== null ? Math.max(0, listed - (sold ?? 0)) : null },
    watchCount: int(item.WatchCount),
    hitCount: int(item.HitCount),
    bidCount: int(selling?.BidCount),
    bestOffer: { enabled: flag(bo?.BestOfferEnabled) ?? flag(item.BestOfferEnabled), offersReceived: int(bo?.BestOfferCount), autoAcceptPrice: amt(details?.BestOfferAutoAcceptPrice), minimumPrice: amt(details?.MinimumBestOfferPrice) },
    condition: { id: text(item.ConditionID), name: text(item.ConditionDisplayName), description: clip(text(item.ConditionDescription), 300) },
    category: { id: text(node(item.PrimaryCategory)?.CategoryID), name: text(node(item.PrimaryCategory)?.CategoryName) },
    dispatchTimeMaxDays: int(item.DispatchTimeMax),
    itemLocation: { city: text(item.Location), country: text(item.Country) },
    businessPolicies: {
      shipping: text(node(profiles?.SellerShippingProfile)?.ShippingProfileName),
      returns: text(node(profiles?.SellerReturnProfile)?.ReturnProfileName),
      payment: text(node(profiles?.SellerPaymentProfile)?.PaymentProfileName),
    },
    returns: { accepted: text(ret?.ReturnsAcceptedOption), within: text(ret?.ReturnsWithinOption), shippingPaidBy: text(ret?.ShippingCostPaidByOption) },
    shipping: children(item.ShippingDetails, "ShippingServiceOptions")
      .slice(0, 5)
      .map((s) => ({ service: text(s.ShippingService), cost: amt(s.ShippingServiceCost), free: flag(s.FreeShipping) })),
    itemSpecifics: nameValues(item.ItemSpecifics, 20),
    variations: children(item.Variations, "Variation")
      .slice(0, 30)
      .map((v) => ({ sku: text(v.SKU), specifics: nameValues(v.VariationSpecifics, 5), quantity: int(v.Quantity), sold: int(node(v.SellingStatus)?.QuantitySold), price: amt(v.StartPrice) })),
    pictures: arr(node(item.PictureDetails)?.PictureURL).length,
    insertionFees: null,
  };
}

export function buildGetBestOffersRequest(itemId: string): string {
  return request(
    "GetBestOffers",
    `  <ItemID>${xmlEscape(itemId)}</ItemID>
  <BestOfferStatus>All</BestOfferStatus>
  <DetailLevel>ReturnAll</DetailLevel>`,
  );
}

export interface BestOffer {
  id: string | null;
  status: string | null;
  price: MoneyValue | null;
  quantity: number | null;
  buyer: string | null;
  expiresAt: string | null;
  buyerMessage: string | null;
}

export function parseGetBestOffersResponse(xml: string): BestOffer[] {
  const { response } = parseCall(xml, "GetBestOffers");
  return children(response.BestOfferArray, "BestOffer").map((b) => ({
    id: text(b.BestOfferID),
    status: text(b.Status),
    price: amt(b.Price),
    quantity: int(b.Quantity),
    buyer: text(node(b.Buyer)?.UserID),
    expiresAt: isoOrNull(b.ExpirationTime),
    buyerMessage: clip(maskPersonalData(text(b.BuyerMessage)), 200),
  }));
}

export async function fetchItemDetails(config: EbayConfig, auth: ConnectorAuth, itemId: string): Promise<ItemDetails> {
  return parseGetItemResponse(await tradingCall(config, auth, "GetItem", buildGetItemRequest(itemId)));
}

export async function fetchBestOffers(config: EbayConfig, auth: ConnectorAuth, itemId: string): Promise<BestOffer[]> {
  return parseGetBestOffersResponse(await tradingCall(config, auth, "GetBestOffers", buildGetBestOffersRequest(itemId)));
}

// ---------------------------------------------------------------------------
// GetMyeBaySelling : vendus / invendus (60 jours max chez eBay)
// ---------------------------------------------------------------------------

export const SOLD_UNSOLD_MAX_DAYS = 60;

export function buildSoldUnsoldRequest(params: { days: number; entriesPerPage: number; page?: number }): string {
  const days = Math.max(1, Math.min(SOLD_UNSOLD_MAX_DAYS, Math.trunc(params.days)));
  const pagination = `<Pagination><EntriesPerPage>${Math.max(1, Math.min(200, Math.trunc(params.entriesPerPage)))}</EntriesPerPage><PageNumber>${Math.max(1, Math.trunc(params.page ?? 1))}</PageNumber></Pagination>`;
  return request(
    "GetMyeBaySelling",
    `  <DetailLevel>ReturnAll</DetailLevel>
  <ActiveList><Include>false</Include></ActiveList>
  <ScheduledList><Include>false</Include></ScheduledList>
  <DeletedFromSoldList><Include>false</Include></DeletedFromSoldList>
  <DeletedFromUnsoldList><Include>false</Include></DeletedFromUnsoldList>
  <SellingSummary><Include>true</Include></SellingSummary>
  <SoldList><Include>true</Include><DurationInDays>${days}</DurationInDays>${pagination}</SoldList>
  <UnsoldList><Include>true</Include><DurationInDays>${days}</DurationInDays>${pagination}</UnsoldList>`,
  );
}

export interface SoldEntry {
  orderId: string | null;
  orderLineItemId: string | null;
  itemId: string | null;
  title: string | null;
  sku: string | null;
  quantity: number | null;
  unitPrice: MoneyValue | null;
  total: MoneyValue | null;
  soldAt: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  buyer: string | null;
  feedbackReceived: string | null;
}

export interface UnsoldEntry {
  itemId: string | null;
  title: string | null;
  sku: string | null;
  price: MoneyValue | null;
  quantity: number | null;
  watchCount: number | null;
  bidCount: number | null;
  startTime: string | null;
  endTime: string | null;
  listingType: string | null;
}

export interface SoldUnsold {
  summary: { totalSoldCount: number | null; totalSoldValue: MoneyValue | null; soldDurationInDays: number | null; amountLimitRemaining: MoneyValue | null; quantityLimitRemaining: number | null; activeAuctions: number | null };
  sold: { totalEntries: number | null; entries: SoldEntry[] };
  unsold: { totalEntries: number | null; entries: UnsoldEntry[] };
  warnings: string[];
}

function soldEntry(t: Node, orderId: string | null): SoldEntry {
  const item = node(t.Item);
  const qty = int(t.QuantityPurchased);
  const unit = amt(t.TransactionPrice) ?? amt(node(item?.SellingStatus)?.CurrentPrice);
  return {
    orderId: orderId ?? text(node(t.ContainingOrder)?.OrderID),
    orderLineItemId: text(t.OrderLineItemID),
    itemId: text(item?.ItemID),
    title: text(item?.Title),
    sku: text(item?.SKU) ?? text(node(t.Variation)?.SKU),
    quantity: qty,
    unitPrice: unit,
    total: amt(t.TotalTransactionPrice) ?? amt(t.TotalPrice),
    soldAt: isoOrNull(t.CreatedDate),
    paidAt: isoOrNull(t.PaidTime),
    shippedAt: isoOrNull(t.ShippedTime),
    buyer: text(node(t.Buyer)?.UserID),
    feedbackReceived: text(node(t.FeedbackReceived)?.CommentType),
  };
}

export function parseSoldUnsoldResponse(xml: string): SoldUnsold {
  const { response, warnings } = parseCall(xml, "GetMyeBaySelling");
  const summary = node(response.Summary);
  const soldList = node(response.SoldList);
  const unsoldList = node(response.UnsoldList);
  const sold: SoldEntry[] = [];
  for (const ot of children(soldList?.OrderTransactionArray, "OrderTransaction")) {
    const order = node(ot.Order);
    if (order) {
      const orderId = text(order.OrderID);
      for (const t of children(order.TransactionArray, "Transaction")) sold.push(soldEntry(t, orderId));
    }
    const single = node(ot.Transaction);
    if (single) sold.push(soldEntry(single, null));
  }
  const unsold: UnsoldEntry[] = children(unsoldList?.ItemArray, "Item").map((i) => {
    const details = node(i.ListingDetails);
    const selling = node(i.SellingStatus);
    return {
      itemId: text(i.ItemID),
      title: text(i.Title),
      sku: text(i.SKU),
      price: amt(selling?.CurrentPrice) ?? amt(i.BuyItNowPrice) ?? amt(i.StartPrice),
      quantity: int(i.Quantity),
      watchCount: int(i.WatchCount),
      bidCount: int(selling?.BidCount),
      startTime: isoOrNull(details?.StartTime),
      endTime: isoOrNull(details?.EndTime),
      listingType: text(i.ListingType),
    };
  });
  return {
    summary: {
      totalSoldCount: int(summary?.TotalSoldCount),
      totalSoldValue: amt(summary?.TotalSoldValue),
      soldDurationInDays: int(summary?.SoldDurationInDays),
      amountLimitRemaining: amt(summary?.AmountLimitRemaining),
      quantityLimitRemaining: int(summary?.QuantityLimitRemaining),
      activeAuctions: int(summary?.ActiveAuctionCount),
    },
    sold: { totalEntries: int(node(soldList?.PaginationResult)?.TotalNumberOfEntries), entries: sold.sort((a, b) => (b.soldAt ?? "").localeCompare(a.soldAt ?? "")) },
    unsold: { totalEntries: int(node(unsoldList?.PaginationResult)?.TotalNumberOfEntries), entries: unsold.sort((a, b) => (b.endTime ?? "").localeCompare(a.endTime ?? "")) },
    warnings,
  };
}

export async function fetchSoldUnsold(config: EbayConfig, auth: ConnectorAuth, params: { days: number; entriesPerPage: number }): Promise<SoldUnsold> {
  return parseSoldUnsoldResponse(await tradingCall(config, auth, "GetMyeBaySelling", buildSoldUnsoldRequest(params)));
}

// ---------------------------------------------------------------------------
// GetFeedback / GetUser
// ---------------------------------------------------------------------------

export type FeedbackCommentType = "Positive" | "Neutral" | "Negative";

/** GetFeedback : EntriesPerPage minimum 25 côté eBay (le nombre affiché est réduit ensuite). */
export function buildGetFeedbackRequest(params: { commentTypes?: FeedbackCommentType[]; entriesPerPage?: number }): string {
  const types = (params.commentTypes ?? []).map((t) => `  <CommentType>${t}</CommentType>`).join("\n");
  return request(
    "GetFeedback",
    `  <DetailLevel>ReturnAll</DetailLevel>
  <FeedbackType>FeedbackReceivedAsSeller</FeedbackType>${types ? `\n${types}` : ""}
  <Pagination><EntriesPerPage>${Math.max(25, Math.min(200, params.entriesPerPage ?? 25))}</EntriesPerPage><PageNumber>1</PageNumber></Pagination>`,
  );
}

export interface FeedbackEntry {
  type: string | null;
  comment: string | null;
  at: string | null;
  buyer: string | null;
  buyerScore: number | null;
  itemId: string | null;
  itemTitle: string | null;
  itemPrice: MoneyValue | null;
  sellerResponse: string | null;
}

export interface FeedbackReport {
  score: number | null;
  periods: Record<string, { positive: number | null; neutral: number | null; negative: number | null; total: number | null }>;
  /** Note détaillée (étoiles) par critère et période, si eBay la renvoie */
  detailedRatings: Array<{ period: string | null; criterion: string | null; rating: number | null; count: number | null }>;
  uniqueCounts: { positive: number | null; neutral: number | null; negative: number | null };
  totalEntries: number | null;
  entries: FeedbackEntry[];
}

function periodCounts(container: unknown): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const p of children(container, "FeedbackPeriod")) {
    const days = text(p.PeriodInDays);
    if (days) out.set(days, int(p.Count));
  }
  return out;
}

export function parseGetFeedbackResponse(xml: string): FeedbackReport {
  const { response } = parseCall(xml, "GetFeedback");
  const summary = node(response.FeedbackSummary);
  const pos = periodCounts(summary?.PositiveFeedbackPeriodArray);
  const neu = periodCounts(summary?.NeutralFeedbackPeriodArray);
  const neg = periodCounts(summary?.NegativeFeedbackPeriodArray);
  const tot = periodCounts(summary?.TotalFeedbackPeriodArray);
  const periods: FeedbackReport["periods"] = {};
  for (const days of new Set([...pos.keys(), ...neu.keys(), ...neg.keys(), ...tot.keys()])) {
    periods[`${days}j`] = { positive: pos.get(days) ?? null, neutral: neu.get(days) ?? null, negative: neg.get(days) ?? null, total: tot.get(days) ?? null };
  }
  const detailedRatings = children(summary?.SellerRatingSummaryArray, "AverageRatingSummary").flatMap((s) =>
    children(s, "AverageRatingDetails").map((d) => {
      const rating = text(d.Rating);
      return { period: text(s.FeedbackSummaryPeriod), criterion: text(d.RatingDetail), rating: rating !== null && Number.isFinite(Number(rating)) ? Number(rating) : null, count: int(d.RatingCount) };
    }),
  );
  return {
    score: int(response.FeedbackScore),
    periods,
    detailedRatings,
    uniqueCounts: { positive: int(summary?.UniquePositiveFeedbackCount), neutral: int(summary?.UniqueNeutralFeedbackCount), negative: int(summary?.UniqueNegativeFeedbackCount) },
    totalEntries: int(node(response.PaginationResult)?.TotalNumberOfEntries) ?? int(response.FeedbackDetailItemTotal),
    entries: children(response.FeedbackDetailArray, "FeedbackDetail").map((f) => ({
      type: text(f.CommentType),
      comment: clip(maskPersonalData(text(f.CommentText)), 300),
      at: isoOrNull(f.CommentTime),
      buyer: text(f.CommentingUser),
      buyerScore: int(f.CommentingUserScore),
      itemId: text(f.ItemID),
      itemTitle: text(f.ItemTitle),
      itemPrice: amt(f.ItemPrice),
      sellerResponse: clip(text(f.FeedbackResponse), 200),
    })),
  };
}

export function buildGetUserRequest(): string {
  return request("GetUser", "  <DetailLevel>ReturnAll</DetailLevel>");
}

export interface SellerProfile {
  userId: string | null;
  feedbackScore: number | null;
  positiveFeedbackPercent: number | null;
  feedbackStar: string | null;
  registeredAt: string | null;
  site: string | null;
  status: string | null;
  topRatedSeller: boolean | null;
  storeOwner: boolean | null;
  storeUrl: string | null;
  businessType: string | null;
}

/** GetUser (compte du token) — l'e-mail et l'adresse d'inscription ne sont JAMAIS extraits. */
export function parseGetUserResponse(xml: string): SellerProfile {
  const { response } = parseCall(xml, "GetUser");
  const user = node(response.User) ?? {};
  const seller = node(user.SellerInfo);
  const pct = text(user.PositiveFeedbackPercent);
  return {
    userId: text(user.UserID),
    feedbackScore: int(user.FeedbackScore),
    positiveFeedbackPercent: pct !== null && Number.isFinite(Number(pct)) ? Number(pct) : null,
    feedbackStar: text(user.FeedbackRatingStar),
    registeredAt: isoOrNull(user.RegistrationDate),
    site: text(user.Site),
    status: text(user.Status),
    topRatedSeller: flag(seller?.TopRatedSeller),
    storeOwner: flag(seller?.StoreOwner),
    storeUrl: text(seller?.StoreURL),
    businessType: text(seller?.SellerBusinessType),
  };
}

export async function fetchFeedback(config: EbayConfig, auth: ConnectorAuth, commentTypes?: FeedbackCommentType[]): Promise<FeedbackReport> {
  return parseGetFeedbackResponse(await tradingCall(config, auth, "GetFeedback", buildGetFeedbackRequest({ commentTypes })));
}

export async function fetchSellerProfile(config: EbayConfig, auth: ConnectorAuth): Promise<SellerProfile> {
  return parseGetUserResponse(await tradingCall(config, auth, "GetUser", buildGetUserRequest()));
}

// ---------------------------------------------------------------------------
// GetMyMessages : résumé, en-têtes, et corps d'UN message (sur demande explicite)
// ---------------------------------------------------------------------------

/** Dossier « Boîte de réception » de Mes messages eBay. */
export const EBAY_INBOX_FOLDER_ID = "0";

export function buildMessagesSummaryRequest(): string {
  return request("GetMyMessages", "  <DetailLevel>ReturnSummary</DetailLevel>");
}

export function buildMessageHeadersRequest(params: { from: Date; to: Date; entriesPerPage: number; page: number }): string {
  return request(
    "GetMyMessages",
    `  <DetailLevel>ReturnHeaders</DetailLevel>
  <FolderID>${EBAY_INBOX_FOLDER_ID}</FolderID>
  <StartTime>${params.from.toISOString()}</StartTime>
  <EndTime>${params.to.toISOString()}</EndTime>
  <Pagination><EntriesPerPage>${Math.max(1, Math.min(200, params.entriesPerPage))}</EntriesPerPage><PageNumber>${Math.max(1, params.page)}</PageNumber></Pagination>`,
  );
}

export const EBAY_MESSAGE_ID = /^\d{1,20}$/;

export function buildMessageBodyRequest(messageId: string): string {
  return request(
    "GetMyMessages",
    `  <DetailLevel>ReturnMessages</DetailLevel>
  <MessageIDs><MessageID>${xmlEscape(messageId)}</MessageID></MessageIDs>`,
  );
}

export interface MessagesSummary {
  newMessages: number | null;
  totalMessages: number | null;
  flagged: number | null;
  newHighPriority: number | null;
  folders: Array<{ id: string | null; name: string | null; newMessages: number | null; total: number | null }>;
}

export function parseMessagesSummaryResponse(xml: string): MessagesSummary {
  const { response } = parseCall(xml, "GetMyMessages");
  const s = node(response.Summary);
  return {
    newMessages: int(s?.NewMessageCount),
    totalMessages: int(s?.TotalMessageCount),
    flagged: int(s?.FlaggedMessageCount),
    newHighPriority: int(s?.NewHighPriorityCount),
    folders: children(s, "FolderSummary").map((f) => ({ id: text(f.FolderID), name: text(f.FolderName), newMessages: int(f.NewMessageCount), total: int(f.TotalMessageCount) })),
  };
}

export interface MessageHeader {
  messageId: string | null;
  sender: string | null;
  subject: string | null;
  receivedAt: string | null;
  read: boolean | null;
  replied: boolean | null;
  flagged: boolean | null;
  highPriority: boolean | null;
  messageType: string | null;
  itemId: string | null;
  itemTitle: string | null;
  itemUrl: string | null;
  responseEnabled: boolean | null;
}

function header(m: Node, itemBase: string): MessageHeader {
  const itemId = text(m.ItemID);
  return {
    messageId: text(m.MessageID),
    sender: text(m.Sender),
    subject: clip(maskPersonalData(text(m.Subject)), 160),
    receivedAt: isoOrNull(m.ReceiveDate),
    read: flag(m.Read),
    replied: flag(m.Replied),
    flagged: flag(m.Flagged),
    highPriority: flag(m.HighPriority),
    messageType: text(m.MessageType),
    itemId,
    itemTitle: text(m.ItemTitle),
    itemUrl: itemId && /^\d+$/.test(itemId) ? `${itemBase}/itm/${itemId}` : null,
    responseEnabled: flag(node(m.ResponseDetails)?.ResponseEnabled),
  };
}

export function parseMessageHeadersResponse(xml: string, itemBase = "https://www.ebay.fr"): { headers: MessageHeader[]; totalPages: number | null; totalEntries: number | null } {
  const { response } = parseCall(xml, "GetMyMessages");
  const pagination = node(response.PaginationResult);
  return {
    headers: children(response.Messages, "Message").map((m) => header(m, itemBase)),
    totalPages: int(pagination?.TotalNumberOfPages),
    totalEntries: int(pagination?.TotalNumberOfEntries),
  };
}

/** Corps du message : HTML → texte, coordonnées masquées, tronqué (3 000 caractères). */
export function parseMessageBodyResponse(xml: string, itemBase = "https://www.ebay.fr"): (MessageHeader & { body: string | null }) | null {
  const { response } = parseCall(xml, "GetMyMessages");
  const m = children(response.Messages, "Message")[0];
  if (!m) return null;
  const raw = text(m.Content) ?? text(m.Text);
  const body = maskPersonalData(htmlToText(raw));
  return { ...header(m, itemBase), body: body && body.length > 3000 ? `${body.slice(0, 2999)}…` : body };
}

export async function fetchMessagesSummary(config: EbayConfig, auth: ConnectorAuth): Promise<MessagesSummary> {
  return parseMessagesSummaryResponse(await tradingCall(config, auth, "GetMyMessages", buildMessagesSummaryRequest()));
}

export async function fetchMessageHeaders(config: EbayConfig, auth: ConnectorAuth, params: { from: Date; to: Date; maxPages: number; itemBase: string }): Promise<{ headers: MessageHeader[]; totalEntries: number | null; truncated: boolean }> {
  const headers: MessageHeader[] = [];
  let totalEntries: number | null = null;
  for (let page = 1; page <= params.maxPages; page++) {
    const parsed = parseMessageHeadersResponse(await tradingCall(config, auth, "GetMyMessages", buildMessageHeadersRequest({ from: params.from, to: params.to, entriesPerPage: 100, page })), params.itemBase);
    headers.push(...parsed.headers);
    totalEntries = parsed.totalEntries;
    if ((parsed.totalPages ?? 1) <= page || parsed.headers.length === 0) return { headers, totalEntries, truncated: false };
  }
  return { headers, totalEntries, truncated: totalEntries !== null && totalEntries > headers.length };
}

export async function fetchMessageBody(config: EbayConfig, auth: ConnectorAuth, messageId: string, itemBase: string): Promise<(MessageHeader & { body: string | null }) | null> {
  return parseMessageBodyResponse(await tradingCall(config, auth, "GetMyMessages", buildMessageBodyRequest(messageId)), itemBase);
}
