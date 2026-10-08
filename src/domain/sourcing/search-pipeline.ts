/**
 * Pipeline pur des résultats de recherche (sans réseau ni base) :
 *
 *   offres candidates → OfferValidator (filterOffers : conservées / écartées, raison par offre)
 *                     → déduplication (optionnelle, fournie par l'appelant)
 *                     → OpportunityRanking (rankOpportunities : score, podium, « pourquoi »)
 *                     → économies pour N unités (uniquement sur des offres réelles à prix connu)
 *
 * Utilisé par searchOffers (offres en base), par le script de test des recherches
 * (scripts/sourcing-test-searches.ts) et par les tests unitaires. Rien n'est inventé :
 * une économie n'est calculée que si le coût actuel ET le prix de l'offre sont connus.
 */
import { normalizeProduct, type ProductCondition } from "@/domain/sourcing/normalizer";
import { filterOffers, FILTER_REASON_LABEL, type CandidateOffer, type FilterCriteria, type FilterReason, type FilterReasonCode, type KeptOffer, type OfferFilterOptions, type OfferFilterResult, type RejectedOffer } from "@/domain/sourcing/offer-filter";
import { rankOpportunities, type RankableOffer, type RankedOffer, type RankingResult } from "@/domain/sourcing/ranking";
import { validateOffer } from "@/domain/sourcing/validation";
import { computeDataCompleteness } from "@/domain/sourcing/scoring";
import type { RawOffer } from "@/domain/sourcing/types";

export type PipelineOffer = CandidateOffer &
  RankableOffer & {
    /** offre associée (confirmée) au SKU recherché : l'association manuelle prime sur l'identité déduite du titre */
    linkedToTarget?: boolean;
  };

/** Raisons d'identité qu'une association SKU confirmée par l'utilisateur peut lever. */
export const CONFIRMED_LINK_OVERRIDABLE: ReadonlySet<FilterReasonCode> = new Set<FilterReasonCode>(["brand_mismatch", "model_mismatch", "storage_mismatch"]);

/**
 * filterOffers + associations confirmées : une offre explicitement associée au SKU recherché
 * n'est pas écartée pour une seule différence d'identité déduite du titre (marque / modèle /
 * stockage) ; elle reste conservée avec un avertissement. Toute autre raison (accessoire,
 * expirée, prix aberrant…) l'écarte comme les autres.
 */
export function filterWithConfirmedLinks<T extends CandidateOffer & { linkedToTarget?: boolean }>(criteria: FilterCriteria, offers: T[], options: OfferFilterOptions = {}): OfferFilterResult<T> {
  const base = filterOffers(criteria, offers, options);
  const kept: Array<KeptOffer<T>> = [...base.kept];
  const rejected: Array<RejectedOffer<T>> = [];
  for (const r of base.rejected) {
    if (r.offer.linkedToTarget && r.reasons.every((x) => CONFIRMED_LINK_OVERRIDABLE.has(x.code))) {
      kept.push({ offer: r.offer, warnings: [{ code: "confirmed_link", message: `Associée manuellement à ce SKU malgré : ${r.reasons.map((x) => x.message.toLowerCase()).join(" ; ")}` }, ...r.warnings] });
    } else rejected.push(r);
  }
  const rejectionCounts: Partial<Record<FilterReasonCode, number>> = {};
  for (const r of rejected) for (const code of new Set(r.reasons.map((x) => x.code))) rejectionCounts[code] = (rejectionCounts[code] ?? 0) + 1;
  // ordre d'entrée conservé pour les offres conservées
  const order = new Map(offers.map((o, i) => [o, i] as const));
  kept.sort((a, b) => (order.get(a.offer) ?? 0) - (order.get(b.offer) ?? 0));
  return { kept, rejected, referenceMedian: base.referenceMedian, rejectionCounts };
}

export interface RejectionGroup {
  code: FilterReasonCode;
  label: string;
  count: number;
}

export interface RejectionSummary {
  count: number;
  /** une offre peut figurer dans plusieurs groupes (plusieurs raisons) ; tri par nombre décroissant */
  groups: RejectionGroup[];
}

export function summarizeRejections(rejected: ReadonlyArray<{ reasons: FilterReason[] }>): RejectionSummary {
  const counts = new Map<FilterReasonCode, number>();
  for (const r of rejected) for (const code of new Set(r.reasons.map((x) => x.code))) counts.set(code, (counts.get(code) ?? 0) + 1);
  const groups = Array.from(counts.entries())
    .map(([code, count]) => ({ code, label: FILTER_REASON_LABEL[code] ?? code, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));
  return { count: rejected.length, groups };
}

export interface OfferSavings {
  /** économie pour N unités (négative = surcoût) */
  amount: number;
  perUnit: number;
  quantity: number;
  /** « landed » : coût rendu connu ; « unit » : prix unitaire seul (frais de port non communiqués) */
  basis: "landed" | "unit";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Économie d'une offre classée pour N unités vs coût actuel : coût rendu si connu, sinon prix unitaire (signalé). */
export function savingsOf(r: Pick<RankedOffer<RankableOffer>, "procurement" | "offer">, currentUnitCost: number | null): OfferSavings | null {
  const n = r.procurement.requestedQuantity;
  if (r.procurement.savings !== null) return { amount: r.procurement.savings, perUnit: round2(r.procurement.savings / n), quantity: n, basis: "landed" };
  if (currentUnitCost === null || !Number.isFinite(currentUnitCost) || r.offer.unitPrice === null || !Number.isFinite(r.offer.unitPrice) || r.offer.unitPrice <= 0) return null;
  const perUnit = round2(currentUnitCost - r.offer.unitPrice);
  return { amount: round2(perUnit * n), perUnit, quantity: n, basis: "unit" };
}

export interface BestSavings extends OfferSavings {
  offerId: string;
}

/** Plus forte économie POSITIVE parmi les offres classées (null : aucune offre moins chère, ou coût actuel inconnu). */
export function bestSavings<T extends RankableOffer>(ranked: ReadonlyArray<RankedOffer<T>>, currentUnitCost: number | null): BestSavings | null {
  let best: BestSavings | null = null;
  for (const r of ranked) {
    const s = savingsOf(r, currentUnitCost);
    if (!s || s.amount <= 0) continue;
    if (!best || s.amount > best.amount) best = { ...s, offerId: r.offer.id };
  }
  return best;
}

export interface PipelineOptions<T> {
  now?: Date;
  requestedQuantity: number;
  currentUnitCost?: number | null;
  currency?: string;
  /** déduplication appliquée aux offres conservées, avant le classement */
  dedupe?: (kept: T[]) => T[];
}

export interface PipelineResult<T extends PipelineOffer> {
  filter: OfferFilterResult<T>;
  /** offres conservées après déduplication, dans l'ordre d'entrée */
  unique: T[];
  ranking: RankingResult<T>;
  rejection: RejectionSummary;
  bestSavings: BestSavings | null;
  /** avertissements du filtre par offre conservée */
  warnings: Map<string, FilterReason[]>;
}

export function runOfferPipeline<T extends PipelineOffer>(criteria: FilterCriteria, offers: T[], options: PipelineOptions<T>): PipelineResult<T> {
  const now = options.now ?? new Date();
  const filter = filterWithConfirmedLinks(criteria, offers, { now });
  const kept = filter.kept.map((k) => k.offer);
  const unique = options.dedupe ? options.dedupe(kept) : kept;
  const currentUnitCost = options.currentUnitCost ?? null;
  const ranking = rankOpportunities(unique, { requestedQuantity: options.requestedQuantity, currentUnitCost, currency: options.currency ?? "EUR" });
  const warnings = new Map<string, FilterReason[]>();
  for (const k of filter.kept) warnings.set(k.offer.id, k.warnings);
  return { filter, unique, ranking, rejection: summarizeRejections(filter.rejected), bestSavings: bestSavings(ranking.ranked, currentUnitCost), warnings };
}

// ---------------------------------------------------------------------------
// RawOffer → PipelineOffer (offres non enregistrées : script de test, fixtures)
// ---------------------------------------------------------------------------

export interface RawPipelineContext {
  now: Date;
  /** devise de comparaison ; une offre dans une autre devise n'a pas de prix comparable (aucune conversion inventée) */
  currency: string;
  /** source vérifiée (attestée / connectée par l'utilisateur) */
  supplierVerified: boolean;
  supplierReliability?: number | null;
  /** date de récupération (défaut : now) */
  retrievedAt?: Date;
}

export type RawPipelineOffer = PipelineOffer & { raw: RawOffer; title: string; currencyOriginal: string | null; originalPrice: number | null };

/** Normalisation + validation d'une offre brute, sans enregistrement : prix comparable seulement dans la devise demandée. */
export function rawOfferToPipelineOffer(raw: RawOffer, id: string, ctx: RawPipelineContext): RawPipelineOffer {
  const n = normalizeProduct(raw.title, { brand: raw.brand, model: raw.model, storage: raw.storage, color: raw.color, grade: raw.grade, condition: typeof raw.condition === "string" ? raw.condition : null, ean: raw.ean, mpn: raw.mpn });
  const currency = raw.currency ? raw.currency.toUpperCase() : null;
  const v = validateOffer({ title: raw.title, price: raw.price, currency, moq: raw.moq ?? null, availableQuantity: raw.availableQuantity ?? null, sourceUrl: raw.url ?? null }, { previousPrice: null, prices30d: [] });
  const condition: ProductCondition = raw.condition === "new" || raw.condition === "refurbished" || raw.condition === "used" ? raw.condition : n.condition;
  const unitPrice = v.effectivePrice !== null && currency === ctx.currency.toUpperCase() ? v.effectivePrice : null;
  const quantity = v.effectiveQuantity;
  const stockKnown = quantity !== null || (raw.stockStatus !== undefined && raw.stockStatus !== "unknown");
  const landedUnitCost = unitPrice !== null && raw.shippingCost !== null && raw.shippingCost !== undefined && (raw.shippingCurrency ?? currency) === currency ? round2(unitPrice + raw.shippingCost / Math.max(1, v.effectiveMoq ?? 1)) : null;
  const retrievedAt = ctx.retrievedAt ?? ctx.now;
  return {
    id,
    raw,
    title: raw.title,
    currencyOriginal: currency,
    originalPrice: v.effectivePrice,
    brand: n.brand,
    model: n.model,
    modelInferred: n.inferred.includes("model"),
    storage: n.storage,
    color: n.color,
    grade: n.grade,
    condition,
    price: unitPrice,
    status: v.status,
    anomalies: v.anomalies.map((a) => ({ code: a.code, severity: a.severity, message: a.message })),
    lastSeenAt: retrievedAt.toISOString(),
    supplierVerified: ctx.supplierVerified,
    unitPrice,
    landedUnitCost,
    shippingPerOrder: null,
    moq: v.effectiveMoq,
    minimumOrderValue: raw.minimumOrderValue ?? null,
    stockKnown,
    availableQuantity: quantity,
    outOfStock: raw.stockStatus === "out_of_stock" || quantity === 0,
    deliveryDays: raw.deliveryMaxDays ?? raw.deliveryMinDays ?? null,
    supplierReliability: ctx.supplierReliability ?? null,
    freshnessHours: Math.max(0, (ctx.now.getTime() - retrievedAt.getTime()) / 3_600_000),
    dataCompleteness: computeDataCompleteness({ price: v.effectivePrice, currency, tax: raw.taxType ?? null, moq: v.effectiveMoq, stock: quantity ?? (raw.stockStatus && raw.stockStatus !== "unknown" ? raw.stockStatus : null), shipping: raw.shippingCost ?? null, delivery: raw.deliveryMaxDays ?? raw.deliveryMinDays ?? null, country: raw.country ?? null, grade: n.grade, condition }),
    marginPerUnit: null,
  };
}
