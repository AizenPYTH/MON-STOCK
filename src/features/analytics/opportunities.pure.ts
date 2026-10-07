/**
 * Règles d'éligibilité des opportunités d'achat : une opportunité n'est annoncée que lorsque
 * le prix de vente ET le prix fournisseur sont réellement connus. Sinon la liste des données
 * manquantes est explicite.
 */
import { computeMargin, type MarginResult } from "@/domain/pricing/margin";
import type { MarginContext } from "@/features/stock/model";

export type OpportunityStatus = "potential" | "unprofitable" | "insufficient_data";
export type SalePriceBasis = "avg_30d" | "sku_price" | null;
export type CostBasis = "landed" | "price" | null;

export interface OpportunityInput {
  /** prix de vente retenu (moyenne 30 j si disponible, sinon prix du SKU) */
  salePrice: number | null;
  salePriceBasis: SalePriceBasis;
  /** prix fournisseur normalisé (devise de l'organisation) */
  supplierPrice: number | null;
  /** coût rendu unitaire (prix + transport) lorsque le transport est connu */
  landedUnitCost: number | null;
  taxType: "ht" | "ttc" | "unknown";
  fees: MarginContext;
}

export interface OpportunityEvaluation {
  status: OpportunityStatus;
  /** données manquantes rendant le calcul impossible */
  missing: string[];
  /** réserves n'empêchant pas le calcul mais à afficher */
  notes: string[];
  margin: MarginResult | null;
  unitCost: number | null;
  costBasis: CostBasis;
}

export function evaluateOpportunity(input: OpportunityInput): OpportunityEvaluation {
  const missing: string[] = [];
  if (input.salePrice === null) missing.push("prix de vente : aucune vente sur 30 jours et aucun prix de vente renseigné sur le SKU");
  if (input.supplierPrice === null) missing.push("prix fournisseur : prix non normalisé (devise ou prix manquant)");
  if (missing.length > 0) {
    return { status: "insufficient_data", missing, notes: [], margin: null, unitCost: null, costBasis: null };
  }
  const salePrice = input.salePrice as number;
  const supplierPrice = input.supplierPrice as number;
  const costBasis: CostBasis = input.landedUnitCost !== null ? "landed" : "price";
  const unitCost = input.landedUnitCost ?? supplierPrice;
  const margin = computeMargin({
    salePrice,
    costPrice: unitCost,
    feePercent: input.fees.feePercent,
    paymentFeePercent: input.fees.paymentFeePercent,
    paymentFeeFixed: input.fees.paymentFeeFixed,
    shippingCost: input.fees.shippingCost,
  });
  const notes: string[] = [];
  if (input.salePriceBasis === "sku_price") notes.push("Prix de vente issu de la fiche SKU (aucune vente sur 30 jours).");
  if (input.taxType === "unknown") notes.push("Le fournisseur ne précise pas si son prix est HT ou TTC.");
  if (input.taxType === "ttc") notes.push("Prix fournisseur TTC : la TVA récupérable n'est pas déduite.");
  if (costBasis === "price") notes.push("Transport fournisseur inconnu : non inclus dans le coût d'achat.");
  if (margin.caveat) notes.push(margin.caveat);
  const status: OpportunityStatus = margin.netProfit !== null && margin.netProfit > 0 ? "potential" : "unprofitable";
  return { status, missing, notes, margin, unitCost, costBasis };
}

const STATUS_RANK: Record<OpportunityStatus, number> = { potential: 0, unprofitable: 1, insufficient_data: 2 };

/** Opportunités potentielles d'abord (meilleur bénéfice unitaire en tête), puis non rentables, puis données insuffisantes. */
export function compareOpportunities(a: { evaluation: OpportunityEvaluation }, b: { evaluation: OpportunityEvaluation }): number {
  const ra = STATUS_RANK[a.evaluation.status];
  const rb = STATUS_RANK[b.evaluation.status];
  if (ra !== rb) return ra - rb;
  const pa = a.evaluation.margin?.netProfit ?? Number.NEGATIVE_INFINITY;
  const pb = b.evaluation.margin?.netProfit ?? Number.NEGATIVE_INFINITY;
  return pb - pa;
}

export const OFFER_STALE_DAYS = 7;

/** Une offre non revue depuis plus de 7 jours est signalée comme possiblement périmée. */
export function isStaleOffer(lastSeenAt: string | null, now: Date, staleDays = OFFER_STALE_DAYS): boolean {
  if (!lastSeenAt) return true;
  const t = new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > staleDays * 86_400_000;
}

/** Coût rendu unitaire : prix + transport réparti sur la quantité minimale (MOQ) ; null si transport inconnu. */
export function landedUnitCost(unitPrice: number | null, shippingCost: number | null, moq: number | null): number | null {
  if (unitPrice === null || shippingCost === null) return null;
  const qty = Math.max(1, moq ?? 1);
  return Math.round((unitPrice + shippingCost / qty) * 100) / 100;
}
