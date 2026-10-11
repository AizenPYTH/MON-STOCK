import "server-only";
import type { LlmTool } from "./llm";
import { z } from "zod";
import type { OrgContext } from "@/features/auth/dal";
import type { AdvisorActionDTO, AdvisorCardDTO, AdvisorCardRowDTO, AdvisorCardTone } from "@/features/mobile-api/contract";
import { isDeadStock } from "@/features/analytics/stock.pure";
import { loadStockViews } from "@/features/analytics/stock-analytics";
import { computeRecommendations } from "@/features/analytics/replenishment";
import { getOperationalCounts } from "@/features/analytics/dashboard";
import { compareManualCards, parseParcel, rateCardFromRow } from "@/domain/tools/shipping";
import { parseDecimal, toPlainDecimal } from "@/domain/tools/decimal";
import { quoteShipping } from "@/services/shipping/quotes";
import { ASSISTANT_TOOLS, runAssistantTool, type ToolContext } from "./assistant-tools";
import { prepareAdvisorAction } from "./advisor-actions";
import { ADVISOR_PERIODS, change, computeProfitability, money, percent, periodRange, productProfits, toCents, type MetricLine, type MetricOrder } from "./advisor-metrics";

/**
 * Outils du conseiller e-commerce, en trois catégories :
 *   - « read »    : lecture et calcul sur les données de l'organisation, sous la session de
 *                   l'utilisateur (RLS) — aucune écriture ;
 *   - « prepare » : brouillon ou proposition SANS effet (action en attente de confirmation,
 *                   brouillon de message) ;
 *   - exécution   : AUCUN outil du modèle. Une action préparée n'est exécutée que par la route
 *                   POST /advisor/actions/confirm, déclenchée par le bouton « Confirmer » de
 *                   l'utilisateur, avec revérification des droits côté serveur.
 * Le modèle n'a ni accès SQL libre ni accès aux secrets : chaque outil a un schéma fermé, validé.
 * Les cartes affichées à l'écran sont construites ICI à partir des données (pas par le modèle).
 */

export type AdvisorToolCategory = "read" | "prepare";

export interface AdvisorToolContext extends ToolContext {
  org: OrgContext;
  conversationId: string;
}

export interface AdvisorToolOutput {
  result: unknown;
  cards: AdvisorCardDTO[];
}

interface AdvisorToolSpec {
  label: string;
  category: AdvisorToolCategory;
  definition: LlmTool;
  run: (ctx: AdvisorToolContext, input: unknown) => Promise<AdvisorToolOutput>;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const periodProp = { type: "string", enum: [...ADVISOR_PERIODS], description: "Période (calendrier de Paris). « this_week » = depuis lundi, « this_month » = depuis le 1er. Défaut : 30d." };
const periodSchema = z.enum(ADVISOR_PERIODS).default("30d");
const skuRef = z.string().trim().min(1).max(64);

export function card(kind: AdvisorCardDTO["kind"], title: string, rows: AdvisorCardRowDTO[], extra: Partial<AdvisorCardDTO> = {}): AdvisorCardDTO {
  return { kind, title, subtitle: null, rows: rows.slice(0, 12), warnings: [], action: null, text: null, ...extra };
}
export const row = (label: string, value: string, detail: string | null = null, tone: AdvisorCardTone = "neutral"): AdvisorCardRowDTO => ({ label, value, detail, tone });
const units = (n: number) => `${n} u.`;
const signedPct = (r: number | null) => (r === null ? null : `${r >= 0 ? "+" : ""}${percent(r)}`);

// ---------------------------------------------------------------------------
// Lignes de ventes d'une période (CA, coût d'achat, frais)
// ---------------------------------------------------------------------------

type SaleRow = {
  order_id: string;
  sku_id: string | null;
  title: string;
  quantity: number;
  unit_price: number | null;
  total: number | null;
  currency: string | null;
  skus: { code: string | null; cost_price: number | null; currency: string | null } | null;
  orders: { id: string; placed_at: string; status: string; currency: string; fee_total: number | null };
};

async function loadSales(ctx: AdvisorToolContext, from: string, to: string): Promise<{ lines: MetricLine[]; orders: MetricOrder[]; truncated: boolean }> {
  const lines: MetricLine[] = [];
  const orders = new Map<string, MetricOrder>();
  let truncated = false;
  for (let start = 0; start < 5000; start += 1000) {
    const { data, error } = await ctx.supabase
      .from("order_items")
      .select("order_id, sku_id, title, quantity, unit_price, total, currency, skus(code, cost_price, currency), orders!inner(id, placed_at, status, currency, fee_total)")
      .eq("organization_id", ctx.organizationId)
      .gte("orders.placed_at", from)
      .lt("orders.placed_at", to)
      .not("orders.status", "in", "(cancelled,refunded)")
      .order("id")
      .range(start, start + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as SaleRow[];
    for (const r of rows) {
      const currency = (r.currency ?? r.orders.currency ?? ctx.currency).toUpperCase();
      const lineTotal = toCents(r.total) ?? (r.unit_price !== null ? toCents(r.unit_price * r.quantity) : null);
      const costCurrency = r.skus?.currency?.toUpperCase() ?? currency;
      lines.push({
        orderId: r.order_id,
        skuId: r.sku_id,
        sku: r.skus?.code ?? null,
        title: r.title,
        quantity: r.quantity,
        totalCents: lineTotal,
        currency,
        // un prix d'achat dans une autre devise n'est pas converti : considéré inconnu
        unitCostCents: costCurrency === currency ? toCents(r.skus?.cost_price) : null,
      });
      orders.set(r.orders.id, { id: r.orders.id, currency: r.orders.currency, feeCents: toCents(r.orders.fee_total) });
    }
    if (rows.length < 1000) break;
    if (start + 1000 >= 5000) truncated = true;
  }
  return { lines, orders: [...orders.values()], truncated };
}

async function cancelledInPeriod(ctx: AdvisorToolContext, from: string, to: string) {
  const { data, error } = await ctx.supabase.from("orders").select("status, total, currency").eq("organization_id", ctx.organizationId).gte("placed_at", from).lt("placed_at", to).in("status", ["cancelled", "refunded"]).limit(2000);
  if (error) throw new Error(error.message);
  const out = { cancelled: 0, refunded: 0, refundedCents: 0 };
  for (const o of data ?? []) {
    if (o.status === "cancelled") out.cancelled += 1;
    else {
      out.refunded += 1;
      if (o.currency === ctx.currency) out.refundedCents += toCents(o.total) ?? 0;
    }
  }
  return out;
}

const reportInput = z.object({ period: periodSchema });

async function businessReport(ctx: AdvisorToolContext, raw: unknown): Promise<AdvisorToolOutput> {
  const { period } = reportInput.parse(raw);
  const range = periodRange(period, ctx.now ?? new Date());
  const [cur, prev, cancels] = await Promise.all([loadSales(ctx, range.from, range.to), loadSales(ctx, range.previous.from, range.previous.to), cancelledInPeriod(ctx, range.from, range.to)]);
  const p = computeProfitability(cur.lines, cur.orders, ctx.currency);
  const q = computeProfitability(prev.lines, prev.orders, ctx.currency);
  const c = ctx.currency;
  const result = {
    period: { label: range.label, from: range.from, to: range.to, timezone: "Europe/Paris" },
    current: { ...p, revenue: money(p.revenueCents, c), cost: money(p.costCents, c), fees: money(p.feesCents, c), grossMargin: p.grossMarginCents === null ? null : money(p.grossMarginCents, c), netProfitEstimate: p.netProfitEstimateCents === null ? null : money(p.netProfitEstimateCents, c) },
    previous: { label: range.previous.label, revenue: money(q.revenueCents, c), orders: q.orders, units: q.units, grossMargin: q.grossMarginCents === null ? null : money(q.grossMarginCents, c) },
    changes: { revenue: change(p.revenueCents, q.revenueCents), orders: change(p.orders, q.orders), units: change(p.units, q.units) },
    cancellationsAndRefunds: { cancelledOrders: cancels.cancelled, refundedOrders: cancels.refunded, refundedAmount: money(cancels.refundedCents, c), note: "Exclus du chiffre d'affaires ci-dessus." },
    truncated: cur.truncated || prev.truncated,
    definitions: "CA = lignes de commande hors port facturé, annulations/remboursements exclus. Marge brute = CA − coût d'achat (lignes au coût connu). Bénéfice estimé = marge brute − frais de vente des mêmes lignes ; port payé par le vendeur, retours et remboursements partiels non déduits.",
  };
  const rows = [
    row("Chiffre d'affaires", money(p.revenueCents, c), signedPct(result.changes.revenue) ? `${signedPct(result.changes.revenue)} vs ${range.previous.label}` : `aucune vente sur ${range.previous.label}`),
    row("Commandes", String(p.orders), `${units(p.units)} vendues`),
    row("Marge brute", p.grossMarginCents === null ? "non calculable" : money(p.grossMarginCents, c), p.grossMarginRate === null ? "coûts d'achat manquants" : `${percent(p.grossMarginRate)} du CA au coût connu`, p.grossMarginCents === null ? "warning" : p.grossMarginCents >= 0 ? "success" : "danger"),
    row("Frais de vente", money(p.feesCents, c), p.coverage.ordersWithoutFees ? `${p.coverage.ordersWithoutFees} commande(s) sans frais communiqués` : null),
    row("Bénéfice estimé", p.netProfitEstimateCents === null ? "non calculable" : money(p.netProfitEstimateCents, c), p.netMarginRate === null ? "données manquantes" : `${percent(p.netMarginRate)} — estimation`, p.netProfitEstimateCents === null ? "warning" : p.netProfitEstimateCents >= 0 ? "success" : "danger"),
  ];
  if (cancels.cancelled || cancels.refunded) rows.push(row("Annulées / remboursées", `${cancels.cancelled} / ${cancels.refunded}`, `remboursé : ${money(cancels.refundedCents, c)}`, "warning"));
  return { result, cards: [card("kpis", "Bilan des ventes", rows, { subtitle: range.label, warnings: p.missing.slice(0, 4) })] };
}

const profitInput = z.object({ period: periodSchema, sort: z.enum(["profit", "revenue", "units", "margin"]).default("profit"), limit: z.coerce.number().int().min(1).max(20).default(8) });

async function productProfitability(ctx: AdvisorToolContext, raw: unknown): Promise<AdvisorToolOutput> {
  const input = profitInput.parse(raw);
  const range = periodRange(input.period, ctx.now ?? new Date());
  const sales = await loadSales(ctx, range.from, range.to);
  const all = productProfits(sales.lines, sales.orders, ctx.currency);
  const key = (p: (typeof all)[number]) => (input.sort === "revenue" ? p.revenueCents : input.sort === "units" ? p.units : input.sort === "margin" ? (p.marginRate ?? -Infinity) : (p.profitCents ?? -Infinity));
  const ranked = [...all].sort((a, b) => key(b) - key(a)).slice(0, input.limit);
  const unknown = all.filter((p) => p.profitCents === null).length;
  const c = ctx.currency;
  const result = {
    period: range.label,
    sortedBy: input.sort,
    products: ranked.map((p) => ({ product: p.title, sku: p.sku, units: p.units, revenue: money(p.revenueCents, c), purchaseCost: p.costCents === null ? null : money(p.costCents, c), fees: p.feesCents === null ? null : money(p.feesCents, c), estimatedProfit: p.profitCents === null ? null : money(p.profitCents, c), margin: p.marginRate === null ? null : percent(p.marginRate) })),
    productsWithoutProfit: unknown,
    note: "Bénéfice estimé = CA − coût d'achat actuel − frais de vente répartis ; null si le coût ou les frais manquent. Port payé et retours non déduits.",
    truncated: sales.truncated,
  };
  const rows = ranked.map((p) =>
    row(p.sku ? `${p.title} (${p.sku})` : p.title, p.profitCents === null ? money(p.revenueCents, c) : money(p.profitCents, c), p.profitCents === null ? `CA, ${units(p.units)} — bénéfice non calculable` : `bénéfice estimé, ${units(p.units)}, marge ${percent(p.marginRate)}`, p.profitCents === null ? "warning" : p.profitCents >= 0 ? "success" : "danger"),
  );
  return { result, cards: [card("list", "Rentabilité par produit", rows, { subtitle: range.label, warnings: unknown ? [`${unknown} produit(s) sans bénéfice calculable (coût d'achat ou frais manquants).`] : [] })] };
}

// ---------------------------------------------------------------------------
// Stock : ruptures, risques, stock dormant ; réapprovisionnement
// ---------------------------------------------------------------------------

const stockRiskInput = z.object({ kind: z.enum(["rupture", "dormant", "all"]).default("all"), limit: z.coerce.number().int().min(1).max(20).default(8) });

async function stockRisks(ctx: AdvisorToolContext, raw: unknown): Promise<AdvisorToolOutput> {
  const input = stockRiskInput.parse(raw);
  const bundle = await loadStockViews(ctx.org);
  const now = ctx.now ?? bundle.now;
  const name = (v: (typeof bundle.views)[number]) => [v.row.product_name, v.row.variant_name].filter(Boolean).join(" — ") || v.row.code || "SKU";
  const risks = bundle.views
    .filter((v) => v.classification.level !== "normal" && ((v.row.units_90d ?? 0) > 0 || v.classification.level === "out_of_stock"))
    .sort((a, b) => (a.daysOfCover ?? -1) - (b.daysOfCover ?? -1));
  const dormant = bundle.views
    .filter((v) => isDeadStock(v, now))
    .map((v) => ({ v, value: v.row.cost_price !== null && v.row.cost_price !== undefined ? toCents(v.row.cost_price * Math.max(0, v.row.quantity_on_hand ?? 0)) : null }))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const c = ctx.currency;
  const result = {
    rupture: input.kind === "dormant" ? undefined : risks.slice(0, input.limit).map((v) => ({ product: name(v), sku: v.row.code, available: v.row.quantity_available, level: v.classification.level, reason: v.classification.reason, daysOfCover: v.daysOfCover, dailySales: v.velocity.dailyVelocity, velocityExplanation: v.velocity.explanation })),
    ruptureCount: risks.length,
    dormant: input.kind === "rupture" ? undefined : dormant.slice(0, input.limit).map(({ v, value }) => ({ product: name(v), sku: v.row.code, onHand: v.row.quantity_on_hand, lastSaleAt: v.row.last_sale_at, immobilisedAtCost: value === null ? null : money(value, c) })),
    dormantCount: dormant.length,
    dormantValueKnown: money(dormant.reduce((s, d) => s + (d.value ?? 0), 0), c),
    dormantWithoutCost: dormant.filter((d) => d.value === null).length,
    note: "Dormant = en stock sans vente depuis 60 jours. Valeur immobilisée = quantité × prix d'achat (inconnue si pas de prix d'achat). Risque de rupture : stock sous le seuil ou couverture inférieure au délai fournisseur (7 j par défaut si inconnu).",
    truncated: bundle.truncated,
  };
  const cards: AdvisorCardDTO[] = [];
  if (input.kind !== "dormant")
    cards.push(card("list", "Ruptures et risques de rupture", risks.slice(0, input.limit).map((v) => row(name(v), `${v.row.quantity_available ?? 0} dispo`, v.classification.reason, v.classification.level === "out_of_stock" ? "danger" : "warning")), { subtitle: `${risks.length} SKU concerné(s)` }));
  if (input.kind !== "rupture")
    cards.push(card("list", "Stock dormant (60 j sans vente)", dormant.slice(0, input.limit).map(({ v, value }) => row(name(v), value === null ? `${v.row.quantity_on_hand ?? 0} u.` : money(value, c), value === null ? "prix d'achat inconnu" : `${v.row.quantity_on_hand ?? 0} u. immobilisées`, "warning")), { subtitle: `${dormant.length} SKU — ${result.dormantValueKnown} au coût connu` }));
  return { result, cards };
}

async function restockPlan(ctx: AdvisorToolContext, raw: unknown): Promise<AdvisorToolOutput> {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(20).default(10) }).parse(raw);
  const drafts = (await computeRecommendations(ctx.org)).filter((d) => d.result.needed).slice(0, limit);
  const result = {
    proposals: drafts.map((d) => ({ product: d.label, sku: d.code, currentStock: d.currentStock, onOrder: d.onOrder, recommendedQuantity: d.result.recommendedQuantity, explanation: d.result.explanation, supplier: d.supplier?.name ?? null, unitPrice: d.unitPrice, currency: d.currency, warnings: d.result.warnings })),
    note: "Proposition calculée (vitesse de vente, délai, stock de sécurité, quantités déjà commandées). AUCUNE commande fournisseur n'est passée : l'utilisateur décide.",
  };
  return {
    result,
    cards: [card("list", "Proposition de réapprovisionnement", drafts.map((d) => row(`${d.label} (${d.code})`, `${d.result.recommendedQuantity ?? "?"} u.`, `${d.supplier?.name ?? "fournisseur à choisir"}${d.unitPrice !== null ? ` — ${d.unitPrice} ${d.currency}/u.` : ""}`)), { subtitle: "Proposition : aucune commande passée", warnings: drafts.length ? [] : ["Aucun réapprovisionnement nécessaire selon les données actuelles."] })],
  };
}

// ---------------------------------------------------------------------------
// Commandes, colis, devis d'expédition, priorités du jour
// ---------------------------------------------------------------------------

async function orderLookup(ctx: AdvisorToolContext, raw: unknown): Promise<AdvisorToolOutput> {
  const { orderNumber } = z.object({ orderNumber: z.string().trim().min(1).max(64).transform((s) => s.replace(/[%,()*\\"']/g, "")) }).parse(raw);
  const { data, error } = await ctx.supabase
    .from("orders")
    .select("id, order_number, external_order_id, provider, status, payment_status, fulfillment_status, placed_at, subtotal, shipping_total, fee_total, total, currency, buyer_username, inventory_applied, order_items(title, quantity, unit_price, sku_id)")
    .eq("organization_id", ctx.organizationId)
    .or(`order_number.eq.${orderNumber},external_order_id.eq.${orderNumber}`)
    .limit(2);
  if (error) throw new Error(error.message);
  const order = data?.[0];
  if (!order) return { result: { found: false, orderNumber, note: "Aucune commande avec ce numéro dans MON STOCK (vérifiez le numéro ou la synchronisation eBay)." }, cards: [] };
  const { data: parcels } = await ctx.supabase.from("tracked_parcels").select("tracking_number, carrier_code, status, estimated_delivery, delivered_at, last_checked_at").eq("organization_id", ctx.organizationId).eq("order_id", order.id).limit(5);
  const c = order.currency;
  const fmt = (v: number | null) => (v === null ? "—" : money(toCents(v) ?? 0, c));
  const result = { found: true, order: { ...order, id: undefined }, parcels: parcels ?? [], note: "Seul le pseudo de l'acheteur est stocké (pas d'adresse)." };
  const rows = [
    row("Statut", order.status, [order.payment_status, order.fulfillment_status].filter(Boolean).join(" · ") || null),
    row("Total", fmt(order.total), `dont port ${fmt(order.shipping_total)} — frais canal ${fmt(order.fee_total)}`),
    ...(order.order_items ?? []).slice(0, 6).map((i) => row(i.title, `${i.quantity} × ${fmt(i.unit_price)}`, i.sku_id ? "lié au stock" : "non lié au stock", i.sku_id ? "neutral" : "warning")),
    ...(parcels ?? []).map((p) => row(`Colis ${p.tracking_number}`, p.status, p.estimated_delivery ? `livraison estimée par le transporteur : ${p.estimated_delivery}` : null)),
  ];
  return { result, cards: [card("list", `Commande ${order.order_number ?? orderNumber}`, rows, { subtitle: `${order.provider} — ${order.placed_at.slice(0, 10).split("-").reverse().join("/")}` })] };
}

async function parcelsOverview(ctx: AdvisorToolContext, raw: unknown): Promise<AdvisorToolOutput> {
  const { filter } = z.object({ filter: z.enum(["problems", "in_progress", "all"]).default("in_progress") }).parse(raw);
  let q = ctx.supabase.from("tracked_parcels").select("tracking_number, label, carrier_code, status, estimated_delivery, delivered_at, last_checked_at, last_error").eq("organization_id", ctx.organizationId).is("archived_at", null);
  if (filter === "problems") q = q.in("status", ["exception", "failed_attempt", "returned", "expired", "not_found"]);
  if (filter === "in_progress") q = q.not("status", "in", "(delivered,returned,expired)");
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(15);
  if (error) throw new Error(error.message);
  const list = data ?? [];
  return {
    result: { filter, parcels: list, note: "Statuts et dates uniquement issus des API de suivi ; « unknown » = jamais vérifié (clé d'API absente ou numéro non trouvé)." },
    cards: [card("list", "Colis suivis", list.slice(0, 10).map((p) => row(p.label || p.tracking_number, p.status, p.estimated_delivery ? `estimée : ${p.estimated_delivery}` : p.last_checked_at ? null : "jamais vérifié", ["exception", "failed_attempt", "returned", "not_found"].includes(p.status) ? "danger" : p.status === "delivered" ? "success" : "neutral")), { subtitle: `${list.length} colis` })],
  };
}

const shippingInput = z.object({
  weightKg: z.coerce.number().positive().max(70),
  lengthCm: z.coerce.number().positive().max(300),
  widthCm: z.coerce.number().positive().max(300),
  heightCm: z.coerce.number().positive().max(300),
  fromPostcode: z.string().trim().min(2).max(12),
  toPostcode: z.string().trim().min(2).max(12),
  fromCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default("FR"),
  toCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default("FR"),
});

async function shippingQuotesTool(ctx: AdvisorToolContext, raw: unknown): Promise<AdvisorToolOutput> {
  const input = shippingInput.parse(raw);
  const [api, cardsRes] = await Promise.all([
    quoteShipping({ ...input }),
    ctx.supabase.from("shipping_rate_cards").select("id, carrier, service, from_countries, to_countries, bands, currency, max_length_cm, max_dimensions_sum_cm, volumetric_divisor, transit_days_min, transit_days_max, tracking, delivery_mode, notes, verified_at").eq("organization_id", ctx.organizationId).limit(200),
  ]);
  const { parcel } = parseParcel({ weightKg: String(input.weightKg), lengthCm: String(input.lengthCm), widthCm: String(input.widthCm), heightCm: String(input.heightCm), fromCountry: input.fromCountry, toCountry: input.toCountry });
  const manual = parcel ? compareManualCards((cardsRes.data ?? []).map(rateCardFromRow), parcel, "price").options : [];
  const apiRows = api.quotes
    .map((q) => ({ q, price: q.priceInclVat ?? q.priceExclVat ?? q.priceVatUnknown }))
    .filter((x): x is { q: (typeof api.quotes)[number]; price: string } => x.price !== null && /[1-9]/.test(x.price))
    .sort((a, b) => Number(a.price) - Number(b.price));
  const vat = (q: (typeof api.quotes)[number]) => (q.priceInclVat ? "TTC" : q.priceExclVat ? "HT" : "HT/TTC inconnu");
  const result = {
    realQuotes: apiRows.slice(0, 10).map(({ q, price }) => ({ via: q.providerLabel, carrier: q.carrier, service: q.service, price, currency: q.currency, vat: vat(q), transitDays: q.transitDaysMax, conditions: q.restrictions })),
    estimatesFromUserRateCards: manual.slice(0, 5).map((o) => ({ carrier: o.carrier, service: o.service, price: toPlainDecimal(o.price), currency: o.currency, note: "estimation : grille saisie par l'utilisateur" })),
    providers: api.providers,
    note: "Consultation uniquement : aucune étiquette n'est achetée. Sans plateforme connectée ni grille, aucun prix n'est disponible.",
  };
  const rows = [
    ...apiRows.slice(0, 6).map(({ q, price }) => row(`${q.carrier} — ${q.service}`, money(toCents(price) ?? 0, q.currency), `devis réel ${q.providerLabel} · ${vat(q)}`, "success")),
    ...manual.slice(0, 3).map((o) => row(`${o.carrier} — ${o.service}`, money(toCents(toPlainDecimal(o.price)) ?? 0, o.currency), "estimation (votre grille)")),
  ];
  return { result, cards: [card("list", "Frais de port", rows, { subtitle: `${input.weightKg} kg, ${input.fromPostcode} → ${input.toPostcode}`, warnings: rows.length ? ["Aucune étiquette achetée : devis et estimations seulement."] : ["Aucun tarif réel disponible : aucune plateforme connectée et aucune grille applicable."] })] };
}

async function todayBriefing(ctx: AdvisorToolContext): Promise<AdvisorToolOutput> {
  const org = ctx.organizationId;
  const [counts, toShip, problems, pending, bundle] = await Promise.all([
    getOperationalCounts(ctx.org),
    ctx.supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "paid"),
    ctx.supabase.from("tracked_parcels").select("id", { count: "exact", head: true }).eq("organization_id", org).is("archived_at", null).in("status", ["exception", "failed_attempt", "returned", "not_found"]),
    ctx.supabase.from("advisor_actions").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("user_id", ctx.org.user.id).eq("status", "pending").gt("expires_at", (ctx.now ?? new Date()).toISOString()),
    loadStockViews(ctx.org),
  ]);
  const ruptures = bundle.views.filter((v) => v.classification.level === "out_of_stock" && (v.row.units_30d ?? 0) > 0).length;
  const atRisk = bundle.views.filter((v) => v.classification.level === "at_risk" || v.classification.level === "low").length;
  const result = {
    ordersToShip: toShip.count ?? 0,
    ruptureOfSellingProducts: ruptures,
    lowOrAtRiskStock: atRisk,
    parcelsWithProblems: problems.count ?? 0,
    listingsNotLinkedToStock: counts.unmappedListings,
    salesNotDeductedFromStock: counts.pendingSales,
    failedSyncs24h: counts.syncFailed24h,
    openAlerts: counts.openAlerts,
    pendingAdvisorActions: pending.count ?? 0,
    note: "« ordersToShip » = commandes au statut payé (non expédiées) selon la dernière synchronisation.",
  };
  const rows = [
    row("Commandes à expédier", String(result.ordersToShip), null, result.ordersToShip ? "warning" : "success"),
    row("Ruptures sur produits qui se vendent", String(ruptures), null, ruptures ? "danger" : "success"),
    row("Stock bas ou à risque", String(atRisk), null, atRisk ? "warning" : "neutral"),
    row("Colis en difficulté", String(result.parcelsWithProblems), null, result.parcelsWithProblems ? "danger" : "neutral"),
    row("Annonces non liées au stock", String(counts.unmappedListings), null, counts.unmappedListings ? "warning" : "neutral"),
    row("Ventes non déduites du stock", String(counts.pendingSales), null, counts.pendingSales ? "warning" : "neutral"),
    row("Synchronisations en échec (24 h)", String(counts.syncFailed24h), null, counts.syncFailed24h ? "danger" : "neutral"),
  ];
  return { result, cards: [card("kpis", "À faire aujourd'hui", rows)] };
}

// ---------------------------------------------------------------------------
// Préparation (aucun effet tant que l'utilisateur ne confirme pas)
// ---------------------------------------------------------------------------

async function findSku(ctx: AdvisorToolContext, ref: string) {
  const clean = ref.replace(/[%,()*\\"']/g, "");
  const { data, error } = await ctx.supabase
    .from("v_stock_overview")
    .select("sku_id, code, product_name, variant_name, quantity_available, quantity_on_hand, cost_price, sale_price, currency")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true)
    .or(`code.ilike.${clean},barcode.eq.${clean}`)
    .limit(2);
  if (error) throw new Error(error.message);
  return data?.length === 1 ? data[0]! : null;
}

function requireWriter(ctx: AdvisorToolContext): string | null {
  return ctx.org.role === "viewer" ? "Votre rôle (lecture seule) ne permet pas de préparer une modification. Demandez à un administrateur." : null;
}

const adjustInput = z.object({
  sku: skuRef,
  change: z.coerce.number().int().min(-100_000).max(100_000).refine((n) => n !== 0, "Variation nulle."),
  reason: z.enum(["receipt", "adjustment", "return", "correction"]).default("adjustment"),
  note: z.string().trim().max(200).optional(),
});

async function prepareStockAdjustment(ctx: AdvisorToolContext, raw: unknown): Promise<AdvisorToolOutput> {
  const denied = requireWriter(ctx);
  if (denied) return { result: { prepared: false, reason: denied }, cards: [] };
  const input = adjustInput.parse(raw);
  const sku = await findSku(ctx, input.sku);
  if (!sku?.sku_id) return { result: { prepared: false, reason: `SKU « ${input.sku} » introuvable (ou ambigu) : demandez le code exact.` }, cards: [] };
  const before = sku.quantity_available ?? 0;
  if (before + input.change < 0) return { result: { prepared: false, reason: `Impossible : ${before} unité(s) disponible(s), retrait de ${-input.change} demandé.` }, cards: [] };
  const label = [sku.product_name, sku.variant_name].filter(Boolean).join(" — ");
  const summary = `${input.change > 0 ? "Ajouter" : "Retirer"} ${Math.abs(input.change)} unité(s) au stock de ${label} (${sku.code}) : ${before} → ${before + input.change} disponible(s).`;
  const action = await prepareAdvisorAction(ctx, { kind: "adjust_stock", skuId: sku.sku_id, summary, amount: null, currency: null, payload: { change: input.change, reason: input.reason, note: input.note ?? null, expectedAvailable: before, code: sku.code } });
  return actionOutput(action, "Ajustement de stock à confirmer");
}

const priceInput = z.object({ sku: skuRef, newPrice: z.union([z.string(), z.number()]).transform((v) => String(v)) });

async function preparePriceChange(ctx: AdvisorToolContext, raw: unknown): Promise<AdvisorToolOutput> {
  const denied = requireWriter(ctx);
  if (denied) return { result: { prepared: false, reason: denied }, cards: [] };
  const input = priceInput.parse(raw);
  const parsed = parseDecimal(input.newPrice);
  if (!parsed.ok || !/[1-9]/.test(toPlainDecimal(parsed.value))) return { result: { prepared: false, reason: "Prix invalide : indiquez un montant positif (ex. 429,90)." }, cards: [] };
  const sku = await findSku(ctx, input.sku);
  if (!sku?.sku_id) return { result: { prepared: false, reason: `SKU « ${input.sku} » introuvable (ou ambigu) : demandez le code exact.` }, cards: [] };
  const cents = toCents(toPlainDecimal(parsed.value, 6)) ?? 0;
  const newPrice = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
  const label = [sku.product_name, sku.variant_name].filter(Boolean).join(" — ");
  const c = sku.currency ?? ctx.currency;
  const old = sku.sale_price === null ? "non renseigné" : money(toCents(sku.sale_price) ?? 0, c);
  const marginNote = sku.cost_price !== null ? ` Marge brute unitaire : ${money((toCents(newPrice) ?? 0) - (toCents(sku.cost_price) ?? 0), c)} (avant frais).` : " Prix d'achat inconnu : marge non calculable.";
  const summary = `Changer le prix de vente MON STOCK de ${label} (${sku.code}) : ${old} → ${money(toCents(newPrice) ?? 0, c)}. Les annonces eBay ne sont pas modifiées.${marginNote}`;
  const action = await prepareAdvisorAction(ctx, { kind: "update_sku_price", skuId: sku.sku_id, summary: summary.slice(0, 400), amount: newPrice, currency: c, payload: { newPrice, expectedPrice: sku.sale_price, code: sku.code } });
  return actionOutput(action, "Changement de prix à confirmer");
}

function actionOutput(action: AdvisorActionDTO, title: string): AdvisorToolOutput {
  return {
    result: { prepared: true, actionId: action.id, summary: action.summary, expiresAt: action.expiresAt, instruction: "Action PRÉPARÉE, non exécutée. L'utilisateur doit toucher « Confirmer » dans l'application (une réponse orale ne suffit pas). Ne dis pas que c'est fait." },
    cards: [card("action", title, [], { action, subtitle: "Rien n'est modifié sans votre confirmation." })],
  };
}

const draftInput = z.object({ orderNumber: z.string().trim().max(64).optional(), subject: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(1500) });

async function draftBuyerMessage(ctx: AdvisorToolContext, raw: unknown): Promise<AdvisorToolOutput> {
  const input = draftInput.parse(raw);
  return {
    result: { drafted: true, sent: false, note: "Brouillon affiché avec un bouton « Copier ». MON STOCK n'envoie pas de message eBay (intégration non disponible) : l'utilisateur le copie dans eBay." },
    cards: [card("draft", input.subject, [], { subtitle: input.orderNumber ? `Commande ${input.orderNumber} — brouillon non envoyé` : "Brouillon non envoyé", text: input.text })],
  };
}

// ---------------------------------------------------------------------------
// Cartes des outils de lecture existants (assistant « Intelligence »)
// ---------------------------------------------------------------------------

function wrapAssistantTool(name: string): AdvisorToolSpec["run"] {
  return async (ctx, input) => {
    const r = await runAssistantTool(ctx, name, input);
    if (r.isError) throw new Error(r.content);
    try {
      return { result: JSON.parse(r.content) as unknown, cards: [] };
    } catch {
      return { result: r.content, cards: [] }; // résultat tronqué : transmis tel quel
    }
  };
}

const READ_TOOLS_FROM_ASSISTANT = ["sales_ranking", "sales_summary", "stock_search", "recent_orders", "ebay_account", "listings_search"] as const;

export const ADVISOR_TOOLS: Record<string, AdvisorToolSpec> = {
  ...Object.fromEntries(READ_TOOLS_FROM_ASSISTANT.map((n) => [n, { label: ASSISTANT_TOOLS[n]!.label, category: "read" as const, definition: ASSISTANT_TOOLS[n]!.definition, run: wrapAssistantTool(n) }])),
  business_report: {
    label: "Bilan de l'activité",
    category: "read",
    definition: {
      name: "business_report",
      description:
        "Bilan chiffré d'une période comparé à la précédente : chiffre d'affaires, commandes, unités, coût d'achat connu, marge brute, frais de vente, bénéfice estimé, annulations/remboursements, et liste des données manquantes. À utiliser pour « chiffre d'affaires cette semaine », « marge réelle », « bilan », « pourquoi mes ventes baissent ».",
      input_schema: obj({ period: periodProp }),
    },
    run: businessReport,
  },
  product_profitability: {
    label: "Rentabilité par produit",
    category: "read",
    definition: {
      name: "product_profitability",
      description: "Classement des produits vendus par bénéfice estimé, CA, unités ou marge sur une période (frais de vente répartis, coût d'achat actuel). Pour « qu'est-ce qui me rapporte le plus », « mieux vendu ce mois-ci ».",
      input_schema: obj({ period: periodProp, sort: { type: "string", enum: ["profit", "revenue", "units", "margin"] }, limit: { type: "integer", description: "1 à 20 (défaut 8)." } }),
    },
    run: productProfitability,
  },
  stock_risks: {
    label: "Risques de stock",
    category: "read",
    definition: {
      name: "stock_risks",
      description: "Produits en rupture ou à risque de rupture (vitesse de vente, couverture, délai fournisseur) et stock dormant (60 jours sans vente) avec la valeur immobilisée au coût d'achat.",
      input_schema: obj({ kind: { type: "string", enum: ["rupture", "dormant", "all"] }, limit: { type: "integer", description: "1 à 20 (défaut 8)." } }),
    },
    run: stockRisks,
  },
  restock_plan: {
    label: "Réapprovisionnement",
    category: "prepare",
    definition: {
      name: "restock_plan",
      description: "PROPOSITION de réapprovisionnement (quantités recommandées, fournisseur et prix connus, explication). Ne passe aucune commande. Pour « que dois-je racheter ».",
      input_schema: obj({ limit: { type: "integer", description: "1 à 20 (défaut 10)." } }),
    },
    run: restockPlan,
  },
  order_lookup: {
    label: "Commande",
    category: "read",
    definition: { name: "order_lookup", description: "Détail d'une commande par son numéro : lignes, montants, frais, statut, colis suivis liés.", input_schema: obj({ orderNumber: { type: "string" } }, ["orderNumber"]) },
    run: orderLookup,
  },
  parcels_overview: {
    label: "Colis",
    category: "read",
    definition: { name: "parcels_overview", description: "Colis suivis : en cours, en difficulté ou tous, avec statut et date estimée UNIQUEMENT si l'API de suivi l'a fournie.", input_schema: obj({ filter: { type: "string", enum: ["problems", "in_progress", "all"] } }) },
    run: parcelsOverview,
  },
  shipping_quotes: {
    label: "Frais de port",
    category: "read",
    definition: {
      name: "shipping_quotes",
      description: "Compare les devis réels des plateformes connectées (Packlink, Boxtal, Sendcloud) et les estimations des grilles de l'utilisateur pour un colis. Consultation uniquement : n'achète jamais d'étiquette. Demande poids, dimensions et codes postaux s'ils manquent.",
      input_schema: obj(
        {
          weightKg: { type: "number" },
          lengthCm: { type: "number" },
          widthCm: { type: "number" },
          heightCm: { type: "number" },
          fromPostcode: { type: "string" },
          toPostcode: { type: "string" },
          fromCountry: { type: "string", description: "ISO 2 lettres, défaut FR" },
          toCountry: { type: "string", description: "ISO 2 lettres, défaut FR" },
        },
        ["weightKg", "lengthCm", "widthCm", "heightCm", "fromPostcode", "toPostcode"],
      ),
    },
    run: shippingQuotesTool,
  },
  today_briefing: {
    label: "Priorités du jour",
    category: "read",
    definition: { name: "today_briefing", description: "Compteurs du jour : commandes à expédier, ruptures, stock à risque, colis en difficulté, annonces non liées, ventes non déduites, synchronisations en échec, actions en attente. Pour « que dois-je faire aujourd'hui ».", input_schema: obj({}) },
    run: (ctx) => todayBriefing(ctx),
  },
  prepare_stock_adjustment: {
    label: "Ajustement de stock (à confirmer)",
    category: "prepare",
    definition: {
      name: "prepare_stock_adjustment",
      description: "PRÉPARE un ajustement de stock d'un SKU (entrée positive, sortie négative). N'exécute rien : crée une demande que l'utilisateur doit confirmer avec le bouton « Confirmer ». Demande le code SKU exact s'il est ambigu.",
      input_schema: obj({ sku: { type: "string", description: "Code SKU ou code-barres exact." }, change: { type: "integer", description: "Variation : +3 pour ajouter 3 unités, -2 pour en retirer 2." }, reason: { type: "string", enum: ["receipt", "adjustment", "return", "correction"] }, note: { type: "string" } }, ["sku", "change"]),
    },
    run: prepareStockAdjustment,
  },
  prepare_price_change: {
    label: "Changement de prix (à confirmer)",
    category: "prepare",
    definition: {
      name: "prepare_price_change",
      description: "PRÉPARE le changement du prix de vente d'un SKU dans MON STOCK (pas les annonces eBay). N'exécute rien : l'utilisateur doit confirmer avec le bouton « Confirmer ».",
      input_schema: obj({ sku: { type: "string" }, newPrice: { type: "string", description: "Nouveau prix, ex. « 429.90 »." } }, ["sku", "newPrice"]),
    },
    run: preparePriceChange,
  },
  draft_buyer_message: {
    label: "Brouillon de message acheteur",
    category: "prepare",
    definition: {
      name: "draft_buyer_message",
      description: "Affiche un brouillon de message à un acheteur (avec bouton Copier). Rien n'est envoyé : MON STOCK n'a pas d'envoi de messages eBay. Consulte d'abord la commande avec order_lookup si un numéro est donné.",
      input_schema: obj({ orderNumber: { type: "string" }, subject: { type: "string" }, text: { type: "string", description: "Texte du message, poli et factuel, sans promesse non vérifiée." } }, ["subject", "text"]),
    },
    run: draftBuyerMessage,
  },
};

export const ADVISOR_TOOL_DEFINITIONS: LlmTool[] = Object.values(ADVISOR_TOOLS).map((t) => t.definition);

/** Extensions futures (données ou intégration non disponibles) : citées au modèle, jamais simulées. */
export const ADVISOR_FUTURE_CAPABILITIES = [
  "achat d'étiquette d'expédition (Sendcloud est branché en consultation seulement)",
  "envoi de messages aux acheteurs eBay",
  "modification des annonces eBay (prix, quantité)",
  "passage de commandes fournisseurs",
];

const MAX_RESULT_CHARS = 20_000;

/** Exécute un outil ; une erreur devient un résultat `is_error` lisible par le modèle (jamais inventé). */
export async function runAdvisorTool(ctx: AdvisorToolContext, name: string, input: unknown): Promise<{ content: string; isError: boolean; cards: AdvisorCardDTO[] }> {
  const tool = ADVISOR_TOOLS[name];
  if (!tool) return { content: `Outil inconnu : ${name}`, isError: true, cards: [] };
  try {
    const out = await tool.run(ctx, input ?? {});
    const json = JSON.stringify(out.result);
    return { content: json.length > MAX_RESULT_CHARS ? `${json.slice(0, MAX_RESULT_CHARS)}…[résultat tronqué]` : json, isError: false, cards: out.cards };
  } catch (e) {
    if (e instanceof z.ZodError) return { content: `Paramètres invalides : ${e.issues[0]?.message ?? "inconnus"}`, isError: true, cards: [] };
    return { content: `Lecture des données impossible : ${e instanceof Error ? e.message.slice(0, 200) : "erreur"}`, isError: true, cards: [] };
  }
}
