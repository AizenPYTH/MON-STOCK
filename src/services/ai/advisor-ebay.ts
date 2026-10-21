import "server-only";
import { z } from "zod";
import type { AdvisorCardDTO, AdvisorCardRowDTO, AdvisorCardTone } from "@/features/mobile-api/contract";
import type { ConnectorAuth } from "@/integrations/core/connector";
import { isConnectorError } from "@/integrations/core/errors";
import { getEbayConnector } from "@/integrations/core/registry";
import { EBAY_SCOPE, hasEbayScope, type EbayConfig } from "@/integrations/ebay/config";
import { fetchEbayAccountInfo } from "@/integrations/ebay/identity";
import { addTo, type MoneyValue } from "@/integrations/ebay/insights-common";
import {
  accountUrls,
  buildPayoutsUrl,
  CUSTOMER_SERVICE_METRIC_TYPES,
  customerServiceMetricUrl,
  DEFAULT_MARKETPLACE,
  EBAY_ORDER_ID,
  fetchLiveOrders,
  fetchOrderDetails,
  fetchShippingFulfillments,
  fetchTransactions,
  marketingUrls,
  parseAds,
  parseCampaigns,
  parseCustomerServiceMetric,
  parseFulfillmentPolicies,
  parseFundsSummary,
  parseLocations,
  parseOptedInPrograms,
  parsePaymentPolicies,
  parsePayouts,
  parsePrivilege,
  parsePromotions,
  parseReturnPolicies,
  parseSellerStandards,
  parseSubscriptions,
  parseTrafficReport,
  buildTrafficReportUrl,
  restGet,
  summarizeTransactions,
  type FinanceTransaction,
  type FulfillmentPolicySummary,
  type ReturnPolicySummary,
  type LiveShippingFilter,
} from "@/integrations/ebay/insights";
import {
  EBAY_ITEM_ID,
  EBAY_MESSAGE_ID,
  fetchBestOffers,
  fetchFeedback,
  fetchItemDetails,
  fetchMessageBody,
  fetchMessageHeaders,
  fetchMessagesSummary,
  fetchSellerProfile,
  fetchSoldUnsold,
  SOLD_UNSOLD_MAX_DAYS,
} from "@/integrations/ebay/trading-insights";
import { connectorAuthFor } from "@/services/channels/connection-store";
import { card, row } from "./advisor-cards";
import { money, toCents } from "./advisor-metrics";
import { dedupeRows, ebayServiceName, frDuration, frHandlingTime, frQuantity } from "./ebay-display";
import type { AdvisorToolContext, AdvisorToolOutput, AdvisorToolSpec } from "./advisor-tools";

/**
 * Outils du conseiller qui lisent le compte eBay EN DIRECT, au moment de la question.
 *
 *  - LECTURE SEULE : uniquement des GET REST et des appels Trading « Get* ». Rien n'est modifié chez eBay.
 *  - DROITS : la connexion est cherchée avec le client Supabase DE L'UTILISATEUR (RLS) et filtrée sur
 *    SON organisation ; le token est ensuite obtenu par le mécanisme commun (connectorAuthFor :
 *    déchiffrement, rafraîchissement avec les scopes accordés). Aucun token n'atteint le modèle.
 *  - FIABILITÉ : chaque résultat porte `readAt` (date de lecture chez eBay) ; un champ inconnu vaut null ;
 *    eBay non connecté / autorisation expirée / API refusée → `available: false` + raison claire.
 *  - CACHE : mémoire du processus, 60 s par connexion et par requête (questions enchaînées), jamais partagé
 *    entre organisations (clé = identifiant de connexion).
 *  - VIE PRIVÉE : acheteur = pseudo, nom du destinataire, ville, code postal, pays au maximum ; e-mails et
 *    téléphones masqués dans les textes libres ; corps d'un message seulement sur demande explicite.
 */

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 300;
const cache = new Map<string, { expires: number; readAt: string; value: unknown }>();

export function clearEbayAdvisorCache(): void {
  cache.clear();
}

async function live<T>(link: EbayLink, key: string, load: () => Promise<T>, ttlMs = CACHE_TTL_MS): Promise<{ value: T; readAt: string; cached: boolean }> {
  const k = `${link.connectionId}|${key}`;
  const hit = cache.get(k);
  if (hit && hit.expires > Date.now()) return { value: hit.value as T, readAt: hit.readAt, cached: true };
  const value = await load();
  const readAt = new Date().toISOString();
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(k, { expires: Date.now() + ttlMs, readAt, value });
  return { value, readAt, cached: false };
}

// ---------------------------------------------------------------------------
// Connexion eBay de l'organisation
// ---------------------------------------------------------------------------

export interface EbayLink {
  connectionId: string;
  username: string | null;
  environment: string;
  scopes: string[];
  config: EbayConfig;
  auth: ConnectorAuth;
  itemBase: string;
}

export interface EbayUnavailable {
  available: false;
  reason: string;
  whatToDo: string | null;
}

export const EXTENDED_REQUIRED =
  "Donnée accessible uniquement avec l'analyse complète eBay : reconnectez eBay avec l'analyse complète dans Réglages → Intégrations (bouton « Autoriser l'analyse complète », réservé aux administrateurs).";
const RECONNECT = "Reconnectez eBay dans Réglages → Intégrations (administrateur).";

function unavailable(reason: string, whatToDo: string | null = null): EbayUnavailable {
  return { available: false, reason, whatToDo };
}

export async function resolveEbayLink(ctx: AdvisorToolContext): Promise<EbayLink | EbayUnavailable> {
  const config = getEbayConnector().config();
  if (!config) return unavailable("L'intégration eBay n'est pas configurée sur le serveur (clés de l'application eBay absentes) : aucune lecture eBay possible.");
  const { data, error } = await ctx.supabase
    .from("channel_connections")
    .select("id, status, external_username, environment, scopes")
    .eq("organization_id", ctx.organizationId)
    .eq("provider", "ebay")
    .neq("status", "disconnected")
    .order("connected_at", { ascending: false, nullsFirst: false })
    .limit(5);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const usable = rows.find((c) => c.status === "connected") ?? rows.find((c) => c.status === "error");
  if (!usable) {
    if (rows.some((c) => c.status === "expired" || c.status === "pending")) return unavailable("L'autorisation eBay de cette organisation a expiré (ou n'a pas été finalisée) : le compte ne peut pas être consulté.", RECONNECT);
    return unavailable("Aucun compte eBay n'est connecté à cette organisation.", "Connectez eBay dans Réglages → Intégrations (administrateur).");
  }
  return {
    connectionId: usable.id,
    username: usable.external_username,
    environment: usable.environment,
    scopes: usable.scopes ?? [],
    config,
    auth: connectorAuthFor(usable.id),
    itemBase: usable.environment === "sandbox" ? "https://www.sandbox.ebay.com" : "https://www.ebay.fr",
  };
}

function isUnavailable(x: EbayLink | EbayUnavailable): x is EbayUnavailable {
  return "available" in x;
}

/** Erreur d'appel eBay → explication claire (jamais de token ni de détail technique sensible). */
export function ebayFailure(e: unknown): EbayUnavailable {
  if (isConnectorError(e)) {
    switch (e.code) {
      case "AUTH_EXPIRED":
        return e.httpStatus === 403
          ? unavailable(`eBay refuse l'accès à cette donnée (autorisation insuffisante pour ce compte ou cette API) : ${e.message.slice(0, 200)}`, RECONNECT)
          : unavailable("L'autorisation eBay a expiré ou a été révoquée : lecture impossible.", RECONNECT);
      case "RATE_LIMITED":
        return unavailable("Quota d'appels eBay atteint : réessayez dans quelques minutes.");
      case "NOT_CONFIGURED":
        return unavailable("L'intégration eBay n'est pas configurée correctement sur le serveur.");
      case "INVALID_RESPONSE":
        return unavailable("eBay a renvoyé une réponse illisible : donnée non disponible pour le moment.");
      default:
        return unavailable(`eBay a refusé ou n'a pas pu traiter la demande${e.httpStatus ? ` (HTTP ${e.httpStatus})` : ""} : ${e.message.slice(0, 200)}`);
    }
  }
  return unavailable(`Lecture eBay impossible : ${e instanceof Error ? e.message.slice(0, 200) : "erreur inconnue"}`);
}

/** Lecture d'une partie facultative : la valeur, ou l'erreur expliquée (le reste de la réponse est conservé). */
async function part<T>(errors: string[], label: string, load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (e) {
    errors.push(`${label} : ${ebayFailure(e).reason}`);
    return null;
  }
}

type Runner = (ctx: AdvisorToolContext, link: EbayLink, input: unknown) => Promise<AdvisorToolOutput>;

/** Enveloppe commune : connexion de l'organisation, scope requis, erreurs eBay expliquées. */
function withEbay(run: Runner, requiredScope?: string): AdvisorToolSpec["run"] {
  return async (ctx, input) => {
    const link = await resolveEbayLink(ctx);
    if (isUnavailable(link)) return { result: link, cards: [] };
    if (requiredScope && !hasEbayScope(link.scopes, requiredScope)) {
      return { result: unavailable(EXTENDED_REQUIRED, "Réglages → Intégrations → « Autoriser l'analyse complète »."), cards: [] };
    }
    try {
      return await run(ctx, link, input);
    } catch (e) {
      if (e instanceof z.ZodError) throw e;
      return { result: ebayFailure(e), cards: [] };
    }
  };
}

// ---------------------------------------------------------------------------
// Formatage
// ---------------------------------------------------------------------------

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const marketplaceProp = { type: "string", description: "Marketplace eBay (ex. EBAY_FR, EBAY_DE, EBAY_GB). Défaut : EBAY_FR." };
const marketplaceSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^EBAY_[A-Z]{2}(_[A-Z]{2,10})?$/, "Marketplace eBay invalide (ex. EBAY_FR).")
  .default(DEFAULT_MARKETPLACE);

function fm(m: MoneyValue | null | undefined, fallbackCurrency: string): string {
  if (!m || m.value === null) return "—";
  return money(toCents(m.value) ?? 0, m.currency ?? fallbackCurrency);
}
function fmTotals(t: Record<string, number>, fallbackCurrency: string): string {
  const entries = Object.entries(t);
  if (!entries.length) return "—";
  return entries.map(([c, v]) => money(toCents(v) ?? 0, c === "?" ? fallbackCurrency : c)).join(" + ");
}
const day = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const DAY_MS = 86_400_000;

const PARIS = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

export function readAtParis(readAt: string): string {
  return PARIS.format(new Date(readAt));
}

function source(link: EbayLink, api: string, readAt: string, cached: boolean) {
  return { source: `eBay en direct — ${api}`, account: link.username, environment: link.environment, readAt, readAtParis: readAtParis(readAt), ...(cached ? { fromShortCache: true } : {}) };
}

function liveCard(kind: AdvisorCardDTO["kind"], title: string, rows: AdvisorCardRowDTO[], readAt: string, extra: Partial<AdvisorCardDTO> = {}): AdvisorCardDTO {
  return card(kind, title, rows, { subtitle: `eBay, lu le ${readAtParis(readAt)}`, ...extra });
}

// ---------------------------------------------------------------------------
// 1. Détail d'une commande (Fulfillment getOrder + suivis ; frais par ligne via Finances si accordé)
// ---------------------------------------------------------------------------

const orderInput = z.object({ order: z.string().trim().min(3).max(64) });

async function orderDetails(ctx: AdvisorToolContext, link: EbayLink, raw: unknown): Promise<AdvisorToolOutput> {
  const { order } = orderInput.parse(raw);
  const ref = order.replace(/[^0-9A-Za-z!-]/g, "");
  // Numéro connu de MON STOCK (order_number = legacyOrderId, external_order_id = orderId), sinon tel quel.
  const { data } = await ctx.supabase.from("orders").select("external_order_id").eq("organization_id", ctx.organizationId).eq("provider", "ebay").or(`order_number.eq.${ref},external_order_id.eq.${ref}`).limit(1);
  const orderId = data?.[0]?.external_order_id ?? ref;
  if (!EBAY_ORDER_ID.test(orderId)) return { result: { found: false, order, note: "Numéro de commande eBay invalide (ex. 12-34567-89012)." }, cards: [] };
  let details;
  try {
    details = await live(link, `order:${orderId}`, () => fetchOrderDetails(link.config, link.auth, orderId));
  } catch (e) {
    if (isConnectorError(e) && e.httpStatus === 404) return { result: { found: false, order, note: "eBay ne trouve pas cette commande sur le compte connecté (numéro erroné, autre compte, ou commande de plus de 2 ans)." }, cards: [] };
    throw e;
  }
  const errors: string[] = [];
  const o = details.value;
  const finances = hasEbayScope(link.scopes, EBAY_SCOPE.finances);
  const [tracking, txs] = await Promise.all([
    part(errors, "Suivis d'expédition", () => live(link, `tracking:${orderId}`, () => fetchShippingFulfillments(link.config, link.auth, orderId))),
    finances
      ? part(errors, "Frais par ligne (Finances)", () =>
          live(link, `order-fees:${orderId}`, () =>
            fetchTransactions(link.config, link.auth, { from: new Date((o.createdAt ? new Date(o.createdAt).getTime() : Date.now()) - DAY_MS), to: new Date(), orderId, marketplaceId: DEFAULT_MARKETPLACE, maxTransactions: 50 }),
          ),
        )
      : Promise.resolve(null),
  ]);
  const feesByLine = new Map<string, Array<{ type: string | null; amount: MoneyValue | null }>>();
  for (const t of txs?.value.transactions ?? []) for (const l of t.lines) if (l.lineItemId) feesByLine.set(l.lineItemId, [...(feesByLine.get(l.lineItemId) ?? []), ...l.fees]);
  const inMonStock = Boolean(data?.[0]);
  const result = {
    ...source(link, "Sell Fulfillment getOrder", details.readAt, details.cached),
    found: true,
    inMonStock,
    order: {
      ...o,
      lineItems: o.lineItems.map((l) => ({ ...l, marketplaceFees: l.lineItemId && finances ? (feesByLine.get(l.lineItemId) ?? []) : null })),
    },
    shipments: tracking?.value ?? null,
    financeTransactions: txs ? txs.value.transactions.map((t) => ({ type: t.type, status: t.status, date: t.date, bookingEntry: t.bookingEntry, amount: t.amount, totalFee: t.totalFee, payoutId: t.payoutId })) : null,
    errors,
    note: finances
      ? "Frais par ligne : Finances API (marketplaceFees). Données acheteur limitées au pseudo, nom, ville, code postal et pays."
      : `Frais par ligne non disponibles sans l'analyse complète (seul le total des frais de la commande est connu). ${EXTENDED_REQUIRED} Données acheteur limitées au pseudo, nom, ville, code postal et pays.`,
  };
  const c = ctx.currency;
  const rows = [
    row("Statut", [o.status.payment, o.status.fulfillment].filter(Boolean).join(" · ") || "—", o.status.cancel && o.status.cancel !== "NONE_REQUESTED" ? `annulation : ${o.status.cancel}` : null, o.status.cancel === "CANCELED" ? "danger" : "neutral"),
    row("Total", fm(o.pricing.total, c), `frais eBay ${fm(o.marketplaceFee.total, c)} — net vendeur ${fm(o.totalDueSeller, c)}`),
    row("Acheteur", o.buyer.username ?? "—", [o.buyer.city, o.buyer.postalCode, o.buyer.country].filter(Boolean).join(" ") || null),
    ...o.lineItems.slice(0, 5).map((l) => row(l.title ?? l.itemId ?? "Article", `${l.quantity ?? "?"} × ${fm(l.total, c)}`, [l.fulfillmentStatus, l.shipBy ? `à expédier avant le ${day(l.shipBy)}` : null].filter(Boolean).join(" · ") || null)),
    ...(tracking?.value ?? []).slice(0, 3).map((t) => row(`Suivi ${t.carrier ?? ""}`.trim(), t.trackingNumber ?? "—", t.shippedAt ? `expédié le ${day(t.shippedAt)}` : null, "success")),
    ...o.refunds.slice(0, 2).map((r) => row("Remboursement", fm(r.amount, c), `${r.status ?? ""} ${day(r.date)}`.trim(), "warning")),
  ];
  return { result, cards: [liveCard("list", `Commande eBay ${o.legacyOrderId ?? o.orderId ?? orderId}`, rows, details.readAt, { warnings: errors.slice(0, 3) })] };
}

// ---------------------------------------------------------------------------
// 2. Commandes récentes directement chez eBay
// ---------------------------------------------------------------------------

const PAYMENT_STATUSES = ["PAID", "PENDING", "FAILED", "PARTIALLY_REFUNDED", "FULLY_REFUNDED"] as const;
const liveOrdersInput = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  payment: z.enum(PAYMENT_STATUSES).optional(),
  shipping: z.enum(["all", "not_shipped", "shipped"]).default("all"),
  limit: z.coerce.number().int().min(1).max(30).default(15),
});

async function ordersLive(ctx: AdvisorToolContext, link: EbayLink, raw: unknown): Promise<AdvisorToolOutput> {
  const input = liveOrdersInput.parse(raw);
  const since = new Date((ctx.now ?? new Date()).getTime() - input.days * DAY_MS);
  since.setUTCMinutes(0, 0, 0); // clé de cache stable à l'heure près
  const res = await live(link, `orders:${since.toISOString()}:${input.shipping}`, () => fetchLiveOrders(link.config, link.auth, { since, shipping: input.shipping as LiveShippingFilter, maxOrders: 400 }));
  const all = res.value.orders.filter((o) => !input.payment || o.payment === input.payment).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const ids = all.map((o) => o.orderId).filter((x): x is string => Boolean(x));
  const known = new Set<string>();
  if (ids.length) {
    const { data } = await ctx.supabase.from("orders").select("external_order_id").eq("organization_id", ctx.organizationId).eq("provider", "ebay").in("external_order_id", ids.slice(0, 400));
    for (const r of data ?? []) known.add(r.external_order_id);
  }
  const totals: Record<string, number> = {};
  const fees: Record<string, number> = {};
  for (const o of all) {
    addTo(totals, o.total);
    addTo(fees, o.marketplaceFee);
  }
  const toShip = all.filter((o) => o.payment === "PAID" && o.fulfillment !== "FULFILLED" && o.cancel !== "CANCELED");
  const result = {
    ...source(link, "Sell Fulfillment getOrders", res.readAt, res.cached),
    period: { days: input.days, since: since.toISOString() },
    filters: { payment: input.payment ?? "tous", shipping: input.shipping },
    count: all.length,
    totalsByCurrency: totals,
    marketplaceFeesByCurrency: fees,
    paidAwaitingShipment: toShip.length,
    notYetInMonStock: all.filter((o) => o.orderId && !known.has(o.orderId)).length,
    orders: all.slice(0, input.limit).map((o) => ({ ...o, inMonStock: o.orderId ? known.has(o.orderId) : false })),
    truncated: res.value.truncated,
    note: "Lecture directe chez eBay (y compris les commandes pas encore synchronisées). Totaux = commandes lues, par devise, annulations comprises si elles ne sont pas filtrées.",
  };
  const c = ctx.currency;
  const rows = [
    row("Commandes", String(all.length), `${input.days} derniers jours`),
    row("Montant total", fmTotals(totals, c), `frais eBay : ${fmTotals(fees, c)}`),
    row("Payées à expédier", String(toShip.length), null, toShip.length ? "warning" : "success"),
    ...all.slice(0, 6).map((o) => row(o.items[0]?.title ?? o.orderId ?? "Commande", fm(o.total, c), `${o.legacyOrderId ?? o.orderId ?? ""} · ${o.payment ?? "?"} · ${o.fulfillment ?? "?"}${o.orderId && !known.has(o.orderId) ? " · pas encore synchronisée" : ""}`)),
  ];
  return { result, cards: [liveCard("list", "Commandes eBay (en direct)", rows, res.readAt)] };
}

// ---------------------------------------------------------------------------
// 3. Vue d'ensemble du compte (identité, limites, programmes, politiques, emplacements, réputation)
// ---------------------------------------------------------------------------

// Lignes lisibles de la carte « Compte eBay » : montant et nombre d'objets séparés, politiques
// décrites par leurs services et durées (les noms de politique générés par eBay contiennent des
// codes et des numéros tronqués : ils restent dans le résultat transmis au modèle).
function limitRows(lim: ReturnType<typeof parsePrivilege> | null, summary: { amountLimitRemaining: MoneyValue | null; quantityLimitRemaining: number | null } | null, c: string): AdvisorCardRowDTO[] {
  const limAmount = lim?.sellingLimit.amount ?? null;
  const limQty = lim?.sellingLimit.quantity ?? null;
  const out: AdvisorCardRowDTO[] = [];
  if (summary && (summary.amountLimitRemaining?.value ?? null) !== null) out.push(row("Montant restant ce mois-ci", fm(summary.amountLimitRemaining, c), limAmount?.value != null ? `limite : ${fm(limAmount, c)}` : null));
  else if (limAmount?.value != null) out.push(row("Limite de vente (montant)", fm(limAmount, c)));
  if (summary && summary.quantityLimitRemaining !== null) out.push(row("Objets restants ce mois-ci", frQuantity(summary.quantityLimitRemaining), limQty !== null ? `limite : ${frQuantity(limQty)} objets` : null));
  else if (limQty !== null) out.push(row("Limite de vente (objets)", frQuantity(limQty)));
  return out;
}

function shippingRow(c: string) {
  return (p: FulfillmentPolicySummary): AdvisorCardRowDTO => {
    const services = p.domestic
      .filter((d) => d.service)
      .slice(0, 2)
      .map((d) => `${ebayServiceName(d.service)}${d.free ? " : gratuit" : d.cost?.value != null ? ` : ${fm(d.cost, c)}` : ""}`);
    const handling = frHandlingTime(p.handlingTime);
    return row("Expédition", services.join(", ") || "—", handling ? `préparation : ${handling}` : null);
  };
}

function returnRow(p: ReturnPolicySummary): AdvisorCardRowDTO {
  const payer = p.shippingCostPayer === "SELLER" ? "le vendeur" : p.shippingCostPayer === "BUYER" ? "l'acheteur" : null;
  const value = p.returnsAccepted === false ? "refusés" : [p.returnsAccepted ? "acceptés" : null, frDuration(p.period)].filter(Boolean).join(" · ") || "—";
  return row("Retours", value, payer ? `port retour payé par ${payer}` : null);
}

async function accountOverview(ctx: AdvisorToolContext, link: EbayLink, raw: unknown): Promise<AdvisorToolOutput> {
  const { marketplace } = z.object({ marketplace: marketplaceSchema }).parse(raw);
  const errors: string[] = [];
  const u = accountUrls(link.config, marketplace);
  const get = (key: string, url: string, label: string) => live(link, `account:${key}:${marketplace}`, () => restGet(link.auth, url, label, marketplace));
  const [identity, privilege, programs, subscription, fulfillment, returns, payment, locations, seller, selling] = await Promise.all([
    part(errors, "Identité", () => live(link, "identity", () => fetchEbayAccountInfo(link.config, link.auth))),
    part(errors, "Limites de vente", () => get("privilege", u.privilege, "account:getPrivileges")),
    part(errors, "Programmes", () => get("programs", u.programs, "account:getOptedInPrograms")),
    part(errors, "Abonnement Boutique", () => get("subscription", u.subscription, "account:getSubscription")),
    part(errors, "Politiques d'expédition", () => get("fulfillment", u.fulfillmentPolicies, "account:getFulfillmentPolicies")),
    part(errors, "Politiques de retour", () => get("returns", u.returnPolicies, "account:getReturnPolicies")),
    part(errors, "Politiques de paiement", () => get("payment", u.paymentPolicies, "account:getPaymentPolicies")),
    part(errors, "Emplacements", () => get("locations", u.locations, "inventory:getInventoryLocations")),
    part(errors, "Profil vendeur (GetUser)", () => live(link, "trading:GetUser", () => fetchSellerProfile(link.config, link.auth))),
    part(errors, "Résumé des ventes (GetMyeBaySelling)", () => live(link, "trading:summary30", () => fetchSoldUnsold(link.config, link.auth, { days: 30, entriesPerPage: 1 }))),
  ]);
  // Date de lecture la plus ancienne parmi les parties lues (certaines peuvent venir du cache de 60 s).
  const readAt = [identity, privilege, programs, subscription, fulfillment, returns, payment, locations, seller, selling].map((p) => p?.readAt).filter((x): x is string => Boolean(x)).sort()[0] ?? new Date().toISOString();
  const lim = privilege ? parsePrivilege(privilege.value) : null;
  const result = {
    ...source(link, "Identity, Account, Inventory, Trading GetUser / GetMyeBaySelling", readAt, false),
    marketplace,
    identity: identity ? { username: identity.value.username, accountType: identity.value.accountType, registrationMarketplace: identity.value.registrationMarketplaceId } : null,
    sellerProfile: seller?.value ?? null,
    sellingLimits: lim,
    remainingThisMonth: selling ? { amount: selling.value.summary.amountLimitRemaining, quantity: selling.value.summary.quantityLimitRemaining } : null,
    soldLast30Days: selling ? { count: selling.value.summary.totalSoldCount, value: selling.value.summary.totalSoldValue } : null,
    optedInPrograms: programs ? parseOptedInPrograms(programs.value) : null,
    storeSubscriptions: subscription ? parseSubscriptions(subscription.value) : null,
    policies: {
      shipping: fulfillment ? parseFulfillmentPolicies(fulfillment.value) : null,
      returns: returns ? parseReturnPolicies(returns.value) : null,
      payment: payment ? parsePaymentPolicies(payment.value) : null,
    },
    inventoryLocations: locations ? parseLocations(locations.value) : null,
    extendedAnalysis: {
      finances: hasEbayScope(link.scopes, EBAY_SCOPE.finances),
      analytics: hasEbayScope(link.scopes, EBAY_SCOPE.analyticsReadonly),
      marketing: hasEbayScope(link.scopes, EBAY_SCOPE.marketingReadonly),
    },
    errors,
    note: "« remainingThisMonth » = limites de vente restantes renvoyées par GetMyeBaySelling (null si eBay ne les fournit pas pour ce compte).",
  };
  const c = ctx.currency;
  const s = seller?.value;
  const rows = dedupeRows([
    row("Compte", identity?.value.username ?? link.username ?? "—", [identity?.value.accountType, identity?.value.registrationMarketplaceId].filter(Boolean).join(" · ") || null),
    ...(s ? [row("Évaluations", s.feedbackScore === null ? "—" : frQuantity(s.feedbackScore), s.positiveFeedbackPercent === null ? null : `${String(s.positiveFeedbackPercent).replace(".", ",")} % positives${s.topRatedSeller ? " · Top Fiabilité" : ""}`, "success")] : []),
    ...limitRows(lim, selling?.value.summary ?? null, c),
    ...(result.policies.shipping ?? []).slice(0, 2).map(shippingRow(c)),
    ...(result.policies.returns ?? []).slice(0, 2).map(returnRow),
  ]);
  return { result, cards: [liveCard("kpis", "Compte eBay", rows, readAt, { warnings: errors.slice(0, 3) })] };
}

// ---------------------------------------------------------------------------
// 4. Trading API : annonce, vendus / invendus, évaluations, messages
// ---------------------------------------------------------------------------

const listingInput = z.object({ itemId: z.string().trim().max(32).optional(), query: z.string().trim().max(80).optional() }).refine((v) => Boolean(v.itemId || v.query), "Indiquez un numéro d'objet eBay (itemId) ou un mot du titre / SKU (query).");

async function listingDetails(ctx: AdvisorToolContext, link: EbayLink, raw: unknown): Promise<AdvisorToolOutput> {
  const input = listingInput.parse(raw);
  let itemId = input.itemId?.replace(/\D/g, "") ?? "";
  if (!EBAY_ITEM_ID.test(itemId)) {
    const q = (input.query ?? input.itemId ?? "").replace(/[%,()*\\"']/g, " ").replace(/\s+/g, " ").trim();
    if (!q) return { result: { found: false, note: "Numéro d'objet eBay invalide." }, cards: [] };
    const { data, error } = await ctx.supabase.from("channel_listings").select("external_listing_id, title, external_sku, status").eq("organization_id", ctx.organizationId).eq("provider", "ebay").or(`title.ilike.%${q}%,external_sku.ilike.%${q}%`).order("last_synced_at", { ascending: false }).limit(6);
    if (error) throw new Error(error.message);
    const ids = [...new Set((data ?? []).map((l) => l.external_listing_id))];
    if (ids.length !== 1) {
      return { result: { found: false, query: q, candidates: (data ?? []).map((l) => ({ itemId: l.external_listing_id, title: l.title, sku: l.external_sku, status: l.status })), note: ids.length ? "Plusieurs annonces correspondent : demandez laquelle (ou rappelez l'outil avec son itemId)." : "Aucune annonce synchronisée ne correspond : demandez le numéro d'objet eBay." }, cards: [] };
    }
    itemId = ids[0]!;
  }
  const res = await live(link, `item:${itemId}`, () => fetchItemDetails(link.config, link.auth, itemId));
  const item = res.value;
  const errors: string[] = [];
  const offers = (item.bestOffer.offersReceived ?? 0) > 0 ? await part(errors, "Offres reçues (GetBestOffers)", () => live(link, `offers:${itemId}`, () => fetchBestOffers(link.config, link.auth, itemId))) : null;
  const result = {
    ...source(link, "Trading GetItem", res.readAt, res.cached),
    item,
    bestOffersReceived: offers?.value ?? null,
    errors,
    note: "Frais d'insertion : non renvoyés par GetItem (null). hitCount = compteur de visites eBay s'il est activé, sinon null ; pour vues/impressions détaillées, voir ebay_traffic (analyse complète).",
  };
  const c = ctx.currency;
  const rows = [
    row("Prix", fm(item.price.current, c), item.price.beforeMarkdown ? `avant promotion : ${fm(item.price.beforeMarkdown, c)}` : item.listingType),
    row("Quantités", `${item.quantity.available ?? "?"} dispo`, `${item.quantity.sold ?? 0} vendu(s) sur ${item.quantity.listed ?? "?"}`),
    row("Observateurs", item.watchCount === null ? "—" : String(item.watchCount), item.hitCount === null ? null : `${item.hitCount} visites`),
    row("Offres", item.bestOffer.enabled ? `${item.bestOffer.offersReceived ?? 0} reçue(s)` : "désactivées", item.bestOffer.autoAcceptPrice ? `acceptation auto ≥ ${fm(item.bestOffer.autoAcceptPrice, c)}` : null),
    row("État", item.condition.name ?? "—", item.category.name),
    row("Dates", `${day(item.startTime)} → ${day(item.endTime)}`, item.status),
  ];
  return { result, cards: [liveCard("list", item.title ?? `Annonce ${itemId}`, rows, res.readAt, { warnings: errors.slice(0, 2) })] };
}

const soldInput = z.object({ days: z.coerce.number().int().min(1).max(SOLD_UNSOLD_MAX_DAYS).default(30), limit: z.coerce.number().int().min(1).max(30).default(15), show: z.enum(["both", "sold", "unsold"]).default("both") });

async function soldUnsold(ctx: AdvisorToolContext, link: EbayLink, raw: unknown): Promise<AdvisorToolOutput> {
  const input = soldInput.parse(raw);
  const res = await live(link, `trading:soldunsold:${input.days}`, () => fetchSoldUnsold(link.config, link.auth, { days: input.days, entriesPerPage: 100 }));
  const v = res.value;
  const result = {
    ...source(link, "Trading GetMyeBaySelling (SoldList / UnsoldList)", res.readAt, res.cached),
    days: input.days,
    summary: v.summary,
    sold: input.show === "unsold" ? undefined : { totalEntries: v.sold.totalEntries, entries: v.sold.entries.slice(0, input.limit) },
    unsold: input.show === "sold" ? undefined : { totalEntries: v.unsold.totalEntries, entries: v.unsold.entries.slice(0, input.limit) },
    warnings: v.warnings,
    note: `Vendus = transactions des ${input.days} derniers jours ; invendus = annonces terminées sans vente sur la même période (eBay limite à ${SOLD_UNSOLD_MAX_DAYS} jours). Acheteur : pseudo uniquement.`,
  };
  const c = ctx.currency;
  const cards: AdvisorCardDTO[] = [];
  if (input.show !== "unsold") cards.push(liveCard("list", `Vendus (${input.days} j)`, v.sold.entries.slice(0, 8).map((s) => row(s.title ?? s.itemId ?? "Objet", fm(s.total ?? s.unitPrice, c), `${s.quantity ?? "?"} u. · ${day(s.soldAt)}${s.shippedAt ? " · expédié" : s.paidAt ? " · payé, à expédier" : ""}`, "success")), res.readAt, { subtitle: `${v.sold.totalEntries ?? v.sold.entries.length} vente(s) — eBay, lu le ${readAtParis(res.readAt)}` }));
  if (input.show !== "sold") cards.push(liveCard("list", `Invendus (${input.days} j)`, v.unsold.entries.slice(0, 8).map((u) => row(u.title ?? u.itemId ?? "Objet", fm(u.price, c), `fin le ${day(u.endTime)}${u.watchCount ? ` · ${u.watchCount} observateur(s)` : ""}`, "warning")), res.readAt, { subtitle: `${v.unsold.totalEntries ?? v.unsold.entries.length} annonce(s) terminée(s) sans vente — eBay, lu le ${readAtParis(res.readAt)}` }));
  return { result, cards };
}

async function feedback(_ctx: AdvisorToolContext, link: EbayLink, raw: unknown): Promise<AdvisorToolOutput> {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(25).default(10) }).parse(raw);
  const errors: string[] = [];
  const [all, bad, profile] = await Promise.all([
    live(link, "trading:feedback", () => fetchFeedback(link.config, link.auth)),
    part(errors, "Évaluations négatives / neutres", () => live(link, "trading:feedback:bad", () => fetchFeedback(link.config, link.auth, ["Negative", "Neutral"]))),
    part(errors, "Profil (GetUser)", () => live(link, "trading:GetUser", () => fetchSellerProfile(link.config, link.auth))),
  ]);
  const f = all.value;
  const result = {
    ...source(link, "Trading GetFeedback / GetUser", all.readAt, all.cached),
    score: f.score ?? profile?.value.feedbackScore ?? null,
    positivePercent: profile?.value.positiveFeedbackPercent ?? null,
    topRatedSeller: profile?.value.topRatedSeller ?? null,
    periods: f.periods,
    detailedRatings: f.detailedRatings,
    recent: f.entries.slice(0, limit),
    negativeAndNeutral: bad ? bad.value.entries.slice(0, limit) : null,
    errors,
    note: "positivePercent = valeur eBay (GetUser, 12 derniers mois). periods = nombres d'évaluations reçues par période (30/180/365 jours) tels que renvoyés par eBay. Commentaires : coordonnées masquées.",
  };
  const p365 = f.periods["365j"];
  const rows = [
    row("Score", result.score === null ? "—" : String(result.score), result.positivePercent === null ? null : `${String(result.positivePercent).replace(".", ",")} % positives`, "success"),
    ...(p365 ? [row("12 derniers mois", `${p365.positive ?? 0} / ${p365.neutral ?? 0} / ${p365.negative ?? 0}`, "positives / neutres / négatives", (p365.negative ?? 0) > 0 ? "warning" : "success")] : []),
    ...(bad?.value.entries ?? []).slice(0, 4).map((e) => row(`${e.type === "Negative" ? "Négative" : "Neutre"} — ${e.buyer ?? "?"}`, day(e.at), e.comment, (e.type === "Negative" ? "danger" : "warning") as AdvisorCardTone)),
  ];
  return { result, cards: [liveCard("list", "Évaluations eBay", rows, all.readAt, { warnings: errors.slice(0, 2) })] };
}

const messagesInput = z.object({ days: z.coerce.number().int().min(1).max(60).default(14), limit: z.coerce.number().int().min(1).max(30).default(15), unreadOnly: z.boolean().default(false) });

async function messages(ctx: AdvisorToolContext, link: EbayLink, raw: unknown): Promise<AdvisorToolOutput> {
  const input = messagesInput.parse(raw);
  const to = new Date((ctx.now ?? new Date()).getTime());
  to.setUTCSeconds(0, 0);
  const from = new Date(to.getTime() - input.days * DAY_MS);
  const errors: string[] = [];
  const [summary, headers] = await Promise.all([
    part(errors, "Résumé de la messagerie", () => live(link, "trading:messages:summary", () => fetchMessagesSummary(link.config, link.auth))),
    live(link, `trading:messages:${input.days}:${to.toISOString().slice(0, 15)}`, () => fetchMessageHeaders(link.config, link.auth, { from, to, maxPages: 3, itemBase: link.itemBase })),
  ]);
  const list = headers.value.headers.filter((h) => !input.unreadOnly || h.read === false).sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""));
  const result = {
    ...source(link, "Trading GetMyMessages (en-têtes uniquement)", headers.readAt, headers.cached),
    period: { days: input.days, from: from.toISOString() },
    inbox: summary?.value ?? null,
    count: list.length,
    unread: headers.value.headers.filter((h) => h.read === false).length,
    messages: list.slice(0, input.limit),
    truncated: headers.value.truncated,
    errors,
    note: "En-têtes seulement (expéditeur = pseudo, sujet, date, lu/non lu, objet concerné). Le texte d'un message n'est lu qu'avec ebay_message, si l'utilisateur le demande explicitement.",
  };
  const rows = list.slice(0, 8).map((m) => row(m.subject ?? "(sans sujet)", m.read === false ? "non lu" : m.replied ? "répondu" : "lu", `${m.sender ?? "?"} · ${day(m.receivedAt)}${m.itemTitle ? ` · ${m.itemTitle}` : ""}`, m.read === false ? "warning" : "neutral"));
  return { result, cards: [liveCard("list", input.unreadOnly ? "Messages eBay non lus" : "Messages eBay", rows, headers.readAt, { warnings: errors.slice(0, 2) })] };
}

/**
 * Le corps d'un message n'est lu que si la question de l'utilisateur le demande explicitement :
 * verbe de contenu (« dit », « écrit », « lis », « contenu », « demande »…) ou « le message / le mail »
 * au singulier. « Combien de messages non lus ? » ne suffit pas (en-têtes seulement). Garde-fou
 * côté serveur, en plus de la consigne donnée au modèle.
 */
export function questionAsksForMessageContent(question: string | undefined): boolean {
  if (!question) return false;
  const words = question.toLowerCase().normalize("NFC").split(/[^\p{L}\p{N}-]+/u);
  const triggers = /^(message|mail|e-?mail|courriel|écrit|ecrit|écrite|ecrite|dit|disent|contenu|lis|lire|lis-moi|texte|corps|demande|demandé|demandait|veut|voulait|réclame|réclamation|raconte|explique)$/u;
  return words.some((w) => triggers.test(w));
}

async function messageBody(ctx: AdvisorToolContext, link: EbayLink, raw: unknown): Promise<AdvisorToolOutput> {
  const { messageId } = z.object({ messageId: z.string().trim().regex(EBAY_MESSAGE_ID, "Identifiant de message eBay invalide.") }).parse(raw);
  if (!questionAsksForMessageContent(ctx.question)) {
    return { result: { read: false, reason: "Le contenu d'un message n'est lu que si l'utilisateur le demande explicitement (« que dit le message de… »). Proposez-lui de le demander." }, cards: [] };
  }
  const res = await live(link, `trading:message:${messageId}`, () => fetchMessageBody(link.config, link.auth, messageId, link.itemBase));
  if (!res.value) return { result: { ...source(link, "Trading GetMyMessages", res.readAt, res.cached), found: false, note: "Message introuvable sur le compte eBay connecté." }, cards: [] };
  const m = res.value;
  return {
    result: { ...source(link, "Trading GetMyMessages (ReturnMessages)", res.readAt, res.cached), found: true, message: m, note: "Coordonnées (e-mail, téléphone) masquées. Lecture seule : aucune réponse n'est envoyée." },
    cards: [liveCard("draft", m.subject ?? "Message eBay", [row("De", m.sender ?? "?", day(m.receivedAt))], res.readAt, { text: m.body })],
  };
}

// ---------------------------------------------------------------------------
// PARTIE « ANALYSE COMPLÈTE » (scopes étendus)
// ---------------------------------------------------------------------------

const financesInput = z.object({ days: z.coerce.number().int().min(1).max(90).default(30), limit: z.coerce.number().int().min(0).max(30).default(10), marketplace: marketplaceSchema });

async function financesTool(ctx: AdvisorToolContext, link: EbayLink, raw: unknown): Promise<AdvisorToolOutput> {
  const input = financesInput.parse(raw);
  const to = new Date((ctx.now ?? new Date()).getTime());
  to.setUTCMinutes(0, 0, 0);
  const from = new Date(to.getTime() - input.days * DAY_MS);
  const errors: string[] = [];
  const m = input.marketplace;
  const [txs, payouts, funds] = await Promise.all([
    live(link, `finances:tx:${input.days}:${to.toISOString()}:${m}`, () => fetchTransactions(link.config, link.auth, { from, to, marketplaceId: m, maxTransactions: 1000 })),
    part(errors, "Versements", () => live(link, `finances:payouts:${input.days}:${to.toISOString()}:${m}`, () => restGet(link.auth, buildPayoutsUrl(link.config, { from, to, limit: 50 }), "finances:getPayouts", m))),
    part(errors, "Fonds (solde)", () => live(link, `finances:funds:${m}`, () => restGet(link.auth, `${link.config.apizBase}/sell/finances/v1/seller_funds_summary`, "finances:getSellerFundsSummary", m))),
  ]);
  const list: FinanceTransaction[] = [...txs.value.transactions].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const summary = summarizeTransactions(list);
  const payoutList = payouts ? parsePayouts(payouts.value) : null;
  const result = {
    ...source(link, "Sell Finances (transactions, versements, fonds)", txs.readAt, txs.cached),
    period: { days: input.days, from: from.toISOString(), to: to.toISOString() },
    marketplace: m,
    funds: funds ? parseFundsSummary(funds.value) : null,
    summary,
    payouts: payoutList ? payoutList.slice(0, 10) : null,
    recentTransactions: list.slice(0, input.limit).map((t) => ({ type: t.type, date: t.date, bookingEntry: t.bookingEntry, amount: t.amount, orderId: t.orderId, totalFee: t.totalFee, feeType: t.feeType, status: t.status, memo: t.memo })),
    truncated: txs.value.truncated,
    errors,
    note: "summary.byType : nombre et montants (crédits / débits) par type de transaction (SALE, REFUND, DISPUTE, NON_SALE_CHARGE = frais hors vente, SHIPPING_LABEL…). saleFeesByType : frais eBay prélevés sur les ventes, par type. net = crédits − débits des transactions lues. funds : solde disponible, en cours, bloqué.",
  };
  const c = ctx.currency;
  const sale = summary.byType.SALE;
  const refund = summary.byType.REFUND;
  const dispute = summary.byType.DISPUTE;
  const rows = [
    ...(result.funds ? [row("Disponible", fm(result.funds.available, c), `en cours ${fm(result.funds.processing, c)} · bloqué ${fm(result.funds.onHold, c)}`, "success")] : []),
    row("Ventes", sale ? `${sale.count}` : "0", sale ? fmTotals(sale.credits, c) : null),
    row("Frais de vente eBay", fmTotals(summary.totalSaleFees, c), Object.keys(summary.saleFeesByType).slice(0, 3).join(", ") || null, "warning"),
    ...(Object.keys(summary.nonSaleChargesByType).length ? [row("Frais hors vente", Object.entries(summary.nonSaleChargesByType).map(([k, v]) => `${k} ${fmTotals(v, c)}`).slice(0, 2).join(" ; "), null, "warning")] : []),
    ...(refund ? [row("Remboursements", String(refund.count), fmTotals(refund.debits, c), "warning")] : []),
    ...(dispute ? [row("Litiges", String(dispute.count), fmTotals({ ...dispute.debits }, c), "danger")] : []),
    row("Net des transactions", fmTotals(summary.net, c), `${input.days} derniers jours`),
    ...(payoutList ?? []).slice(0, 2).map((p) => row("Versement", fm(p.amount, c), `${p.status ?? ""} ${day(p.date)}`.trim())),
  ];
  return { result, cards: [liveCard("kpis", "Finances eBay", rows, txs.readAt, { warnings: errors.slice(0, 2) })] };
}

const TRAFFIC_SORT = { impressions: "LISTING_IMPRESSION_TOTAL", views: "LISTING_VIEWS_TOTAL", transactions: "TRANSACTION", ctr: "CLICK_THROUGH_RATE", conversion: "SALES_CONVERSION_RATE" } as const;
const trafficInput = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
  dimension: z.enum(["LISTING", "DAY"]).default("LISTING"),
  sort: z.enum(["impressions", "views", "transactions", "ctr", "conversion"]).default("views"),
  limit: z.coerce.number().int().min(1).max(30).default(15),
  itemIds: z.array(z.string().regex(EBAY_ITEM_ID)).max(20).optional(),
  marketplace: marketplaceSchema,
});

async function traffic(ctx: AdvisorToolContext, link: EbayLink, raw: unknown): Promise<AdvisorToolOutput> {
  const input = trafficInput.parse(raw);
  const to = new Date((ctx.now ?? new Date()).getTime());
  const from = new Date(to.getTime() - input.days * DAY_MS);
  const url = buildTrafficReportUrl(link.config, { dimension: input.dimension, marketplaceId: input.marketplace, from, to, listingIds: input.itemIds });
  const res = await live(link, `traffic:${url}`, async () => parseTrafficReport(await restGet(link.auth, url, "analytics:getTrafficReport")));
  const report = res.value;
  const key = TRAFFIC_SORT[input.sort];
  const rows = [...report.rows].sort((a, b) => (input.dimension === "DAY" ? (a.key ?? "").localeCompare(b.key ?? "") : (b.values[key] ?? -1) - (a.values[key] ?? -1)));
  const titles = new Map<string, string>();
  if (input.dimension === "LISTING") {
    const ids = rows.slice(0, input.limit).map((r) => r.key).filter((x): x is string => Boolean(x));
    if (ids.length) {
      const { data } = await ctx.supabase.from("channel_listings").select("external_listing_id, title").eq("organization_id", ctx.organizationId).eq("provider", "ebay").in("external_listing_id", ids);
      for (const l of data ?? []) titles.set(l.external_listing_id, l.title);
    }
  }
  const totals: Record<string, number> = {};
  for (const r of report.rows) for (const k of ["LISTING_IMPRESSION_TOTAL", "LISTING_VIEWS_TOTAL", "TRANSACTION"]) if (r.values[k] !== null && r.values[k] !== undefined) totals[k] = (totals[k] ?? 0) + (r.values[k] ?? 0);
  const shown = (input.dimension === "DAY" ? rows.slice(-input.limit) : rows.slice(0, input.limit)).map((r) => ({ day: input.dimension === "DAY" ? r.key : undefined, itemId: input.dimension === "LISTING" ? r.key : undefined, title: input.dimension === "LISTING" && r.key ? (titles.get(r.key) ?? null) : undefined, impressions: r.values.LISTING_IMPRESSION_TOTAL ?? null, views: r.values.LISTING_VIEWS_TOTAL ?? null, clickThroughRate: r.values.CLICK_THROUGH_RATE ?? null, salesConversionRate: r.values.SALES_CONVERSION_RATE ?? null, transactions: r.values.TRANSACTION ?? null }));
  const result = {
    ...source(link, "Sell Analytics getTrafficReport", res.readAt, res.cached),
    period: { days: input.days, start: report.startDate, end: report.endDate, ebayDataUpdatedAt: report.lastUpdated },
    dimension: input.dimension,
    sortedBy: input.sort,
    rowsInReport: report.rows.length,
    totals: { impressions: totals.LISTING_IMPRESSION_TOTAL ?? null, views: totals.LISTING_VIEWS_TOTAL ?? null, transactions: totals.TRANSACTION ?? null },
    rows: shown,
    warnings: report.warnings,
    note: "Taux de clic (CLICK_THROUGH_RATE) et conversion (SALES_CONVERSION_RATE) tels que renvoyés par eBay (pourcentages, à citer tels quels). Les données eBay ont environ un jour de décalage (ebayDataUpdatedAt).",
  };
  const cardRows = shown.slice(0, 8).map((r) => {
    const label = input.dimension === "DAY" ? String(r.day ?? "—") : String(r.title ?? r.itemId ?? "Annonce");
    return row(label, `${r.views ?? "—"} vues`, `${r.impressions ?? "—"} impressions · clic ${r.clickThroughRate ?? "—"} % · conversion ${r.salesConversionRate ?? "—"} % · ${r.transactions ?? 0} vente(s)`);
  });
  return { result, cards: [liveCard("list", `Trafic des annonces (${input.days} j)`, cardRows, res.readAt)] };
}

async function sellerStandards(ctx: AdvisorToolContext, link: EbayLink, raw: unknown): Promise<AdvisorToolOutput> {
  const { marketplace } = z.object({ marketplace: marketplaceSchema }).parse(raw);
  const errors: string[] = [];
  const [profiles, ...metrics] = await Promise.all([
    live(link, "analytics:standards", async () => parseSellerStandards(await restGet(link.auth, `${link.config.apiBase}/sell/analytics/v1/seller_standards_profile`, "analytics:getSellerStandardsProfiles"))),
    ...CUSTOMER_SERVICE_METRIC_TYPES.map((type) => part(errors, `Service client ${type}`, () => live(link, `analytics:csm:${type}:${marketplace}`, async () => parseCustomerServiceMetric(type, await restGet(link.auth, customerServiceMetricUrl(link.config, type, marketplace), "analytics:getCustomerServiceMetric"))))),
  ]);
  const result = {
    ...source(link, "Sell Analytics (seller_standards_profile, customer_service_metric)", profiles.readAt, profiles.cached),
    standardsProfiles: profiles.value,
    customerServiceMetrics: metrics.map((m) => m?.value ?? null).filter((m) => m !== null),
    errors,
    note: "level : TOP_RATED (Top Fiabilité), ABOVE_STANDARD (supérieur aux exigences), BELOW_STANDARD (inférieur). cycle CURRENT = évaluation en vigueur, PROJECTED = projection. Valeurs des métriques telles que renvoyées par eBay.",
  };
  const rows = profiles.value.slice(0, 4).map((p) => row(`${p.program ?? "Programme"} (${p.cycle ?? "?"})`, p.level ?? "—", p.metrics.slice(0, 2).map((x) => `${x.name ?? x.key} : ${x.value.value ?? "—"}`).join(" · ") || null, p.level === "BELOW_STANDARD" ? "danger" : p.level === "TOP_RATED" ? "success" : "neutral"));
  return { result, cards: [liveCard("list", "Niveau vendeur eBay", rows, profiles.readAt, { warnings: errors.slice(0, 2) })] };
}

async function promotions(ctx: AdvisorToolContext, link: EbayLink, raw: unknown): Promise<AdvisorToolOutput> {
  const { marketplace } = z.object({ marketplace: marketplaceSchema }).parse(raw);
  const u = marketingUrls(link.config, marketplace);
  const errors: string[] = [];
  const [campaignsRes, promosRes] = await Promise.all([
    part(errors, "Campagnes Promoted Listings", () => live(link, "marketing:campaigns", async () => parseCampaigns(await restGet(link.auth, u.campaigns, "marketing:getCampaigns")))),
    part(errors, "Promotions", () => live(link, `marketing:promotions:${marketplace}`, async () => parsePromotions(await restGet(link.auth, u.promotions, "marketing:getPromotions", marketplace)))),
  ]);
  if (!campaignsRes && !promosRes) return { result: unavailable(`Lecture Marketing impossible. ${errors.join(" ")}`), cards: [] };
  const campaigns = campaignsRes?.value ?? [];
  const running = campaigns.filter((c) => c.status === "RUNNING" && c.id).slice(0, 3);
  const ads = await Promise.all(running.map((c) => part(errors, `Annonces de la campagne ${c.name ?? c.id}`, () => live(link, `marketing:ads:${c.id}`, async () => parseAds(await restGet(link.auth, u.ads(c.id!), "marketing:getAds"))))));
  const ids = [...new Set(ads.flatMap((a) => a?.value ?? []).map((a) => a.listingId).filter((x): x is string => Boolean(x)))].slice(0, 200);
  const titles = new Map<string, string>();
  if (ids.length) {
    const { data } = await ctx.supabase.from("channel_listings").select("external_listing_id, title").eq("organization_id", ctx.organizationId).eq("provider", "ebay").in("external_listing_id", ids);
    for (const l of data ?? []) titles.set(l.external_listing_id, l.title);
  }
  const readAt = campaignsRes?.readAt ?? promosRes?.readAt ?? new Date().toISOString();
  const result = {
    ...source(link, "Sell Marketing (campagnes, annonces sponsorisées, promotions)", readAt, false),
    marketplace,
    campaigns,
    runningCampaignAds: running.map((c, i) => ({ campaignId: c.id, campaignName: c.name, ads: (ads[i]?.value ?? []).slice(0, 30).map((a) => ({ ...a, title: a.listingId ? (titles.get(a.listingId) ?? null) : null })), totalAdsRead: ads[i]?.value.length ?? null })),
    promotions: promosRes?.value ?? null,
    errors,
    note: "Lecture seule : aucune campagne ni promotion n'est créée ou modifiée. Les performances détaillées des campagnes (rapports publicitaires) ne sont pas lues (création de rapport côté eBay = écriture).",
  };
  const rows = [
    ...campaigns.slice(0, 5).map((c) => row(c.name ?? c.id ?? "Campagne", c.status ?? "—", [c.fundingModel, c.bidPercentage !== null ? `taux ${String(c.bidPercentage).replace(".", ",")} %` : null, c.end ? `fin ${day(c.end)}` : null].filter(Boolean).join(" · ") || null, c.status === "RUNNING" ? "success" : "neutral")),
    ...(promosRes?.value ?? []).slice(0, 5).map((p) => row(p.name ?? p.id ?? "Promotion", p.status ?? "—", [p.type, p.end ? `fin ${day(p.end)}` : null].filter(Boolean).join(" · ") || null)),
  ];
  return { result, cards: [liveCard("list", "Publicité et promotions eBay", rows, readAt, { warnings: errors.slice(0, 2) })] };
}

// ---------------------------------------------------------------------------
// Déclaration des outils
// ---------------------------------------------------------------------------

const LIVE = "Lecture EN DIRECT chez eBay (lecture seule) ; résultat daté (readAt).";

export const EBAY_ADVISOR_TOOLS: Record<string, AdvisorToolSpec> = {
  ebay_order_details: {
    label: "Commande eBay (en direct)",
    category: "read",
    definition: {
      name: "ebay_order_details",
      description: `${LIVE} Détail complet d'UNE commande eBay : statut de paiement et d'expédition par ligne, prix, remises/promotions, port, taxes (dont taxes collectées par eBay), frais eBay (total ; par ligne si analyse complète), net vendeur, paiements et blocages de fonds, remboursements, demandes d'annulation, date limite d'expédition et livraison estimée, suivis (transporteur, numéro, date d'expédition), acheteur (pseudo, nom, ville, code postal, pays). À utiliser pour toute question précise sur une commande.`,
      input_schema: obj({ order: { type: "string", description: "Numéro de commande eBay (ex. 12-34567-89012)." } }, ["order"]),
    },
    run: withEbay(orderDetails),
  },
  ebay_orders_live: {
    label: "Commandes eBay (en direct)",
    category: "read",
    definition: {
      name: "ebay_orders_live",
      description: `${LIVE} Commandes récentes directement chez eBay, y compris celles pas encore synchronisées dans MON STOCK : totaux et frais par devise, nombre de commandes payées à expédier, liste (statuts, acheteur, articles, date limite d'expédition). Filtres : jours (≤ 90), paiement, expédition.`,
      input_schema: obj({
        days: { type: "integer", description: "1 à 90 (défaut 7)." },
        payment: { type: "string", enum: [...PAYMENT_STATUSES] },
        shipping: { type: "string", enum: ["all", "not_shipped", "shipped"] },
        limit: { type: "integer", description: "Commandes détaillées : 1 à 30 (défaut 15)." },
      }),
    },
    run: withEbay(ordersLive),
  },
  ebay_account_overview: {
    label: "Compte eBay (en direct)",
    category: "read",
    definition: {
      name: "ebay_account_overview",
      description: `${LIVE} Vue d'ensemble du compte vendeur : pseudo, type de compte, score et % d'évaluations positives, Top Fiabilité, limites de vente (montant/quantité) et restant ce mois-ci, ventes des 30 derniers jours, programmes, abonnement Boutique, politiques d'expédition (délai, services, coûts), de retour (délai, qui paie le retour) et de paiement, emplacements d'inventaire, et autorisations d'analyse complète accordées.`,
      input_schema: obj({ marketplace: marketplaceProp }),
    },
    run: withEbay(accountOverview),
  },
  ebay_listing_details: {
    label: "Annonce eBay (en direct)",
    category: "read",
    definition: {
      name: "ebay_listing_details",
      description: `${LIVE} Détail d'UNE annonce (Trading GetItem) : prix actuel et avant promotion, quantités mises en vente / vendues / disponibles, nombre d'observateurs, offres (activées, reçues avec montant et statut, acceptation automatique), état, catégorie, dates de début et de fin, délai d'expédition, politiques, caractéristiques, variations. Donne itemId (numéro d'objet) ou query (mot du titre ou SKU d'une annonce synchronisée).`,
      input_schema: obj({ itemId: { type: "string", description: "Numéro d'objet eBay." }, query: { type: "string", description: "Mot du titre ou SKU si le numéro est inconnu." } }),
    },
    run: withEbay(listingDetails),
  },
  ebay_sold_unsold: {
    label: "Vendus / invendus eBay (en direct)",
    category: "read",
    definition: {
      name: "ebay_sold_unsold",
      description: `${LIVE} Ce qui s'est vendu (transactions : objet, quantité, prix, date, payé/expédié, pseudo acheteur) et ce qui a expiré SANS vendre (annonces terminées : prix, observateurs, date de fin) sur les N derniers jours (≤ 60), plus le total vendu. Pour « qu'est-ce qui n'a pas vendu », « mes dernières ventes eBay ».`,
      input_schema: obj({ days: { type: "integer", description: "1 à 60 (défaut 30)." }, limit: { type: "integer", description: "1 à 30 (défaut 15)." }, show: { type: "string", enum: ["both", "sold", "unsold"] } }),
    },
    run: withEbay(soldUnsold),
  },
  ebay_feedback: {
    label: "Évaluations eBay (en direct)",
    category: "read",
    definition: {
      name: "ebay_feedback",
      description: `${LIVE} Réputation : score, % positives, Top Fiabilité, nombre d'évaluations positives/neutres/négatives sur 1, 6 et 12 mois, notes détaillées, évaluations récentes et dernières négatives/neutres avec leur commentaire, l'objet et la réponse du vendeur.`,
      input_schema: obj({ limit: { type: "integer", description: "1 à 25 (défaut 10)." } }),
    },
    run: withEbay(feedback),
  },
  ebay_messages: {
    label: "Messages eBay (en direct)",
    category: "read",
    definition: {
      name: "ebay_messages",
      description: `${LIVE} Messagerie eBay : nombre de messages non lus, et EN-TÊTES des messages reçus (expéditeur, sujet, date, lu/non lu, répondu, objet concerné avec lien). Ne lit PAS le texte des messages.`,
      input_schema: obj({ days: { type: "integer", description: "1 à 60 (défaut 14)." }, limit: { type: "integer", description: "1 à 30 (défaut 15)." }, unreadOnly: { type: "boolean" } }),
    },
    run: withEbay(messages),
  },
  ebay_message: {
    label: "Message eBay (contenu)",
    category: "read",
    definition: {
      name: "ebay_message",
      description: `${LIVE} Texte d'UN message eBay (identifiant obtenu avec ebay_messages). À appeler UNIQUEMENT si l'utilisateur demande explicitement dans sa question le contenu d'un message (« que dit le message de… », « lis-moi le message »). Coordonnées masquées.`,
      input_schema: obj({ messageId: { type: "string" } }, ["messageId"]),
    },
    run: withEbay(messageBody),
  },
  ebay_finances: {
    label: "Finances eBay (analyse complète)",
    category: "read",
    definition: {
      name: "ebay_finances",
      description: `${LIVE} NÉCESSITE l'analyse complète. Finances eBay sur une période (≤ 90 j) : solde disponible / en cours / bloqué, transactions par type (ventes, remboursements, litiges, frais hors vente, étiquettes), frais eBay par type (frais de vente, publicité…), net, derniers versements et transactions. Pour « combien eBay m'a pris en frais », « quand arrive mon prochain virement ».`,
      input_schema: obj({ days: { type: "integer", description: "1 à 90 (défaut 30)." }, limit: { type: "integer", description: "Transactions détaillées : 0 à 30 (défaut 10)." }, marketplace: marketplaceProp }),
    },
    run: withEbay(financesTool, EBAY_SCOPE.finances),
  },
  ebay_traffic: {
    label: "Trafic eBay (analyse complète)",
    category: "read",
    definition: {
      name: "ebay_traffic",
      description: `${LIVE} NÉCESSITE l'analyse complète. Rapport de trafic eBay (≤ 90 j) par annonce ou par jour : impressions, vues, taux de clic, taux de conversion, ventes. Tri par vues, impressions, ventes, clic ou conversion. Pour « quelles annonces sont vues mais ne vendent pas ».`,
      input_schema: obj({
        days: { type: "integer", description: "1 à 90 (défaut 30)." },
        dimension: { type: "string", enum: ["LISTING", "DAY"] },
        sort: { type: "string", enum: ["impressions", "views", "transactions", "ctr", "conversion"] },
        limit: { type: "integer", description: "1 à 30 (défaut 15)." },
        itemIds: { type: "array", items: { type: "string" }, description: "Limiter à ces numéros d'objet (20 max)." },
        marketplace: marketplaceProp,
      }),
    },
    run: withEbay(traffic, EBAY_SCOPE.analyticsReadonly),
  },
  ebay_seller_standards: {
    label: "Niveau vendeur eBay (analyse complète)",
    category: "read",
    definition: {
      name: "ebay_seller_standards",
      description: `${LIVE} NÉCESSITE l'analyse complète. Niveau vendeur (Top Fiabilité / supérieur / inférieur aux exigences) actuel et projeté, métriques (taux de défauts, retards, litiges fermés sans résolution…) avec seuils, et métriques de service client (objet non reçu, non conforme).`,
      input_schema: obj({ marketplace: marketplaceProp }),
    },
    run: withEbay(sellerStandards, EBAY_SCOPE.analyticsReadonly),
  },
  ebay_promotions: {
    label: "Publicité eBay (analyse complète)",
    category: "read",
    definition: {
      name: "ebay_promotions",
      description: `${LIVE} NÉCESSITE l'analyse complète. Campagnes Promoted Listings (statut, modèle, taux, budget, dates, annonces sponsorisées et leur taux) et promotions (soldes, remises sur commande, coupons : statut et dates).`,
      input_schema: obj({ marketplace: marketplaceProp }),
    },
    run: withEbay(promotions, EBAY_SCOPE.marketingReadonly),
  },
};
