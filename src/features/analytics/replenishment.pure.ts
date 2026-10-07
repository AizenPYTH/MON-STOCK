/**
 * Préparation des recommandations de réapprovisionnement à partir des lignes de stock enrichies
 * et des données fournisseur (offre la moins chère, commandes en cours). Le calcul lui-même
 * est délégué à computeReplenishment (domaine), toujours expliqué.
 */
import { computeReplenishment, type ReplenishmentResult } from "@/domain/replenishment/replenishment";
import type { StockLevel } from "@/domain/inventory/alerts";
import type { StockRowView } from "@/features/stock/model";
import { skuLabel } from "@/features/stock/model";
import type { TablesInsert } from "@/db/types";
import { urgencyComparator } from "@/features/analytics/stock.pure";

export const ON_ORDER_STATUSES = ["sent", "confirmed", "partially_received"] as const;

export interface SupplierLike {
  id: string;
  name: string;
  average_lead_time_days: number | null;
  default_moq: number | null;
}

export interface OfferLike {
  id: string;
  sku_id: string | null;
  supplier_id: string;
  normalized_price: number | null;
  normalized_currency: string | null;
  moq: number | null;
  available_quantity: number | null;
  delivery_min_days: number | null;
  delivery_max_days: number | null;
  shipping_cost: number | null;
  last_seen_at: string | null;
}

/** Offre active la moins chère (prix normalisé) ; une offre sans prix normalisé n'est retenue qu'à défaut. */
export function pickCheapestOffer<T extends { normalized_price: number | null }>(offers: readonly T[]): T | null {
  let best: T | null = null;
  for (const o of offers) {
    if (!best) {
      best = o;
      continue;
    }
    if (o.normalized_price === null) continue;
    if (best.normalized_price === null || o.normalized_price < best.normalized_price) best = o;
  }
  return best;
}

export type LeadTimeSource = "sku" | "offer" | "supplier" | null;

export function resolveLeadTime(input: { skuLeadTimeDays: number | null; offerDeliveryMaxDays: number | null; supplierAverageLeadTimeDays: number | null }): { leadTimeDays: number | null; source: LeadTimeSource } {
  if (input.skuLeadTimeDays !== null) return { leadTimeDays: input.skuLeadTimeDays, source: "sku" };
  if (input.offerDeliveryMaxDays !== null) return { leadTimeDays: input.offerDeliveryMaxDays, source: "offer" };
  if (input.supplierAverageLeadTimeDays !== null) return { leadTimeDays: input.supplierAverageLeadTimeDays, source: "supplier" };
  return { leadTimeDays: null, source: null };
}

export interface OnOrderItemLike {
  sku_id: string;
  quantity_ordered: number;
  quantity_received: number;
  status: string;
}

/** Quantités commandées non reçues, par SKU, pour les commandes fournisseur en cours. */
export function onOrderBySku(items: readonly OnOrderItemLike[]): Map<string, number> {
  const out = new Map<string, number>();
  const open = new Set<string>(ON_ORDER_STATUSES);
  for (const it of items) {
    if (!open.has(it.status)) continue;
    const remaining = Math.max(0, it.quantity_ordered - it.quantity_received);
    if (remaining === 0) continue;
    out.set(it.sku_id, (out.get(it.sku_id) ?? 0) + remaining);
  }
  return out;
}

export interface RecommendationDraft {
  skuId: string;
  code: string;
  label: string;
  level: StockLevel;
  levelReason: string;
  currentStock: number;
  dailyVelocity: number | null;
  velocityExplanation: string;
  daysOfCover: number | null;
  leadTimeDays: number | null;
  leadTimeSource: LeadTimeSource;
  safetyStock: number;
  moq: number | null;
  moqSource: "offer" | "supplier" | null;
  onOrder: number;
  supplierAvailable: number | null;
  supplier: { id: string; name: string } | null;
  offerId: string | null;
  unitPrice: number | null;
  currency: string;
  result: ReplenishmentResult;
}

export function buildRecommendation(view: StockRowView, deps: { offer: OfferLike | null; offerSupplier: SupplierLike | null; defaultSupplier: SupplierLike | null; onOrder: number }): RecommendationDraft {
  const row = view.row;
  const supplier = deps.offer ? deps.offerSupplier : deps.defaultSupplier;
  const lead = resolveLeadTime({
    skuLeadTimeDays: row.lead_time_days ?? null,
    offerDeliveryMaxDays: deps.offer?.delivery_max_days ?? deps.offer?.delivery_min_days ?? null,
    supplierAverageLeadTimeDays: supplier?.average_lead_time_days ?? null,
  });
  const moq = deps.offer?.moq ?? supplier?.default_moq ?? null;
  const moqSource: "offer" | "supplier" | null = deps.offer?.moq !== null && deps.offer?.moq !== undefined ? "offer" : supplier?.default_moq ? "supplier" : null;
  const available = row.quantity_available ?? 0;
  const result = computeReplenishment({
    skuLabel: row.code ?? "",
    availableStock: available,
    onOrder: deps.onOrder,
    dailyVelocity: view.velocity.dailyVelocity,
    leadTimeDays: lead.leadTimeDays,
    safetyStock: row.safety_stock ?? 0,
    moq,
    supplierAvailable: deps.offer?.available_quantity ?? null,
  });
  return {
    skuId: row.sku_id ?? "",
    code: row.code ?? "",
    label: skuLabel(row),
    level: view.classification.level,
    levelReason: view.classification.reason,
    currentStock: available,
    dailyVelocity: view.velocity.dailyVelocity,
    velocityExplanation: view.velocity.explanation,
    daysOfCover: view.daysOfCover,
    leadTimeDays: lead.leadTimeDays,
    leadTimeSource: lead.source,
    safetyStock: row.safety_stock ?? 0,
    moq,
    moqSource,
    onOrder: deps.onOrder,
    supplierAvailable: deps.offer?.available_quantity ?? null,
    supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
    offerId: deps.offer?.id ?? null,
    unitPrice: deps.offer?.normalized_price ?? null,
    currency: deps.offer?.normalized_currency ?? row.currency ?? "EUR",
    result,
  };
}

/** Un SKU mérite un instantané s'il n'est pas « normal » ou si une commande est nécessaire. */
export function shouldSnapshot(draft: RecommendationDraft): boolean {
  return draft.level !== "normal" || draft.result.needed;
}

export function sortDrafts(drafts: RecommendationDraft[], views: Map<string, StockRowView>): RecommendationDraft[] {
  return [...drafts].sort((a, b) => {
    const va = views.get(a.skuId);
    const vb = views.get(b.skuId);
    if (va && vb) {
      const c = urgencyComparator(va, vb);
      if (c !== 0) return c;
    }
    return (b.result.recommendedQuantity ?? -1) - (a.result.recommendedQuantity ?? -1);
  });
}

export function draftToInsert(draft: RecommendationDraft, organizationId: string, computedAt: string): TablesInsert<"replenishment_recommendations"> {
  const days = draft.daysOfCover !== null && Number.isFinite(draft.daysOfCover) ? Math.round(draft.daysOfCover * 100) / 100 : null;
  return {
    organization_id: organizationId,
    sku_id: draft.skuId,
    computed_at: computedAt,
    current_stock: draft.currentStock,
    daily_velocity: draft.dailyVelocity !== null ? Math.round(draft.dailyVelocity * 10000) / 10000 : null,
    days_of_cover: days,
    lead_time_days: draft.leadTimeDays,
    safety_stock: draft.safetyStock,
    target_quantity: draft.result.targetQuantity,
    recommended_quantity: draft.result.recommendedQuantity,
    supplier_id: draft.supplier?.id ?? null,
    offer_id: draft.offerId,
    explanation: draft.result.explanation,
    inputs: {
      level: draft.level,
      level_reason: draft.levelReason,
      velocity_explanation: draft.velocityExplanation,
      lead_time_source: draft.leadTimeSource,
      moq: draft.moq,
      moq_source: draft.moqSource,
      on_order: draft.onOrder,
      supplier_available: draft.supplierAvailable,
      unit_price: draft.unitPrice,
      currency: draft.currency,
      warnings: draft.result.warnings,
      used_default_lead_time: draft.result.usedDefaultLeadTime,
    },
    status: "open",
  };
}
