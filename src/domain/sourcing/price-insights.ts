/**
 * PriceInsights — lecture de l'historique de prix observé (par offre, ou par produit
 * normalisé en fusionnant les offres de plusieurs sources).
 *
 * Fiabilité : un « prix habituel » n'est donné que si l'historique contient au moins
 * 5 relevés répartis sur au moins 14 jours, issus d'au moins 1 source. Sinon :
 * « Historique insuffisant » et aucune conclusion (pas de fourchette, pas d'opportunité).
 *
 *   - fourchette habituelle observée : P25–P75 (et médiane) ;
 *   - tendance : médiane de la 2ᵉ moitié de la période vs 1ʳᵉ moitié (hausse / baisse / stable) ;
 *   - meilleur prix observé + date ;
 *   - 🔥 opportunité : prix courant sous P25 et au moins 5 % sous la médiane habituelle ;
 *   - ⚠️ prix anormalement bas : plus de 35 % sous la médiane habituelle (l'opportunité n'est
 *     alors PAS signalée : un tel écart doit d'abord être vérifié — erreur, état, contrefaçon).
 */

export interface InsightPoint {
  price: number;
  recordedAt: string | Date;
  /** source / fournisseur à l'origine du relevé (null = inconnue, comptée comme une source) */
  sourceId?: string | null;
  offerId?: string | null;
}

export interface PriceInsightsOptions {
  now?: Date;
  currency?: string;
  /** fenêtre d'analyse en jours (défaut 90) */
  windowDays?: number;
  minPoints?: number;
  minSpanDays?: number;
  minSources?: number;
  /** écart minimal sous la médiane pour une opportunité, en % (défaut 5) */
  opportunityMinPercent?: number;
  /** écart au-delà duquel le prix est « anormalement bas », en % (défaut 35) */
  abnormalLowPercent?: number;
  /** variation sous laquelle la tendance est « stable », en % (défaut 3) */
  stableThresholdPercent?: number;
}

export type TrendDirection = "hausse" | "baisse" | "stable";

export interface PriceInsights {
  reliable: boolean;
  /** raison d'indisponibilité (« Historique insuffisant : … »), null si fiable */
  reason: string | null;
  pointCount: number;
  spanDays: number;
  sourceCount: number;
  usualRange: { p25: number; median: number; p75: number; label: string } | null;
  trend: { direction: TrendDirection; changePercent: number; label: string } | null;
  bestObserved: { price: number; recordedAt: string; label: string } | null;
  currentPrice: number | null;
  /** écart du prix courant vs médiane habituelle, en % (négatif = moins cher) */
  vsUsualPercent: number | null;
  opportunity: { percentBelow: number; message: string } | null;
  abnormalLow: { percentBelow: number; message: string } | null;
}

export const INSIGHT_MIN_POINTS = 5;
export const INSIGHT_MIN_SPAN_DAYS = 14;
export const INSIGHT_MIN_SOURCES = 1;
export const OPPORTUNITY_MIN_PERCENT = 5;
export const ABNORMAL_LOW_PERCENT = 35;
export const TREND_STABLE_PERCENT = 3;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Percentile par interpolation linéaire sur une liste TRIÉE (p entre 0 et 1). */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * Math.max(0, Math.min(1, p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function medianOf(values: number[]): number | null {
  return percentile([...values].sort((a, b) => a - b), 0.5);
}

/** Montant arrondi sans décimales inutiles : « 270 », « 279,5 ». */
export function formatAmount(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);
}

function currencySymbol(currency: string): string {
  return currency === "EUR" ? "€" : currency === "USD" ? "$" : currency === "GBP" ? "£" : currency;
}

/** Fusionne les historiques de plusieurs offres d'un même produit normalisé (relevés identiques dédupliqués). */
export function mergeHistories(histories: Array<{ offerId: string; sourceId?: string | null; points: Array<{ price: number; recordedAt: string | Date }> }>): InsightPoint[] {
  const seen = new Set<string>();
  const out: InsightPoint[] = [];
  for (const h of histories) {
    for (const p of h.points) {
      const t = (typeof p.recordedAt === "string" ? new Date(p.recordedAt) : p.recordedAt).getTime();
      const key = `${h.offerId}|${t}|${p.price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ price: p.price, recordedAt: p.recordedAt, offerId: h.offerId, sourceId: h.sourceId ?? null });
    }
  }
  return out;
}

export function computePriceInsights(points: InsightPoint[], currentPrice: number | null, options: PriceInsightsOptions = {}): PriceInsights {
  const now = options.now ?? new Date();
  const currency = options.currency ?? "EUR";
  const sym = currencySymbol(currency);
  const windowDays = options.windowDays ?? 90;
  const minPoints = options.minPoints ?? INSIGHT_MIN_POINTS;
  const minSpan = options.minSpanDays ?? INSIGHT_MIN_SPAN_DAYS;
  const minSources = options.minSources ?? INSIGHT_MIN_SOURCES;
  const oppMin = options.opportunityMinPercent ?? OPPORTUNITY_MIN_PERCENT;
  const abnormal = options.abnormalLowPercent ?? ABNORMAL_LOW_PERCENT;
  const stableThreshold = options.stableThresholdPercent ?? TREND_STABLE_PERCENT;
  const cutoff = now.getTime() - windowDays * 86_400_000;

  const clean = points
    .map((p) => ({ price: p.price, at: typeof p.recordedAt === "string" ? new Date(p.recordedAt) : p.recordedAt, source: p.sourceId ?? "__unknown__" }))
    .filter((p) => Number.isFinite(p.price) && p.price > 0 && !Number.isNaN(p.at.getTime()) && p.at.getTime() >= cutoff && p.at.getTime() <= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const pointCount = clean.length;
  const spanDays = pointCount > 1 ? round2((clean[pointCount - 1]!.at.getTime() - clean[0]!.at.getTime()) / 86_400_000) : 0;
  const sourceCount = new Set(clean.map((p) => p.source)).size;
  const cp = currentPrice !== null && Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null;

  const best = clean.length > 0 ? clean.reduce((b, p) => (p.price < b.price ? p : b), clean[0]!) : null;
  const bestObserved = best ? { price: best.price, recordedAt: best.at.toISOString(), label: `Meilleur prix observé : ${formatAmount(best.price)} ${sym} le ${best.at.toLocaleDateString("fr-FR", { timeZone: "UTC" })}` } : null;

  const base: PriceInsights = { reliable: false, reason: null, pointCount, spanDays, sourceCount, usualRange: null, trend: null, bestObserved, currentPrice: cp, vsUsualPercent: null, opportunity: null, abnormalLow: null };

  if (pointCount < minPoints || spanDays < minSpan || sourceCount < minSources) {
    return { ...base, reason: `Historique insuffisant : ${pointCount} relevé(s) sur ${Math.floor(spanDays)} jour(s) (minimum ${minPoints} relevés sur ${minSpan} jours)` };
  }

  const sorted = clean.map((p) => p.price).sort((a, b) => a - b);
  const p25 = round2(percentile(sorted, 0.25)!);
  const med = round2(percentile(sorted, 0.5)!);
  const p75 = round2(percentile(sorted, 0.75)!);
  const usualRange = { p25, median: med, p75, label: `${formatAmount(p25)}–${formatAmount(p75)} ${sym}` };

  // tendance : médiane de la seconde moitié de la période vs première moitié
  const mid = clean[0]!.at.getTime() + (clean[pointCount - 1]!.at.getTime() - clean[0]!.at.getTime()) / 2;
  const early = clean.filter((p) => p.at.getTime() <= mid).map((p) => p.price);
  const late = clean.filter((p) => p.at.getTime() > mid).map((p) => p.price);
  let trend: PriceInsights["trend"] = null;
  const em = medianOf(early);
  const lm = medianOf(late);
  if (em !== null && lm !== null && em > 0) {
    const change = round2(((lm - em) / em) * 100);
    const direction: TrendDirection = Math.abs(change) < stableThreshold ? "stable" : change > 0 ? "hausse" : "baisse";
    const label = direction === "stable" ? "Prix stable sur la période" : `Tendance à la ${direction} : ${change > 0 ? "+" : "−"}${formatAmount(Math.abs(change))} % sur la période`;
    trend = { direction, changePercent: change, label };
  }

  let vsUsualPercent: number | null = null;
  let opportunity: PriceInsights["opportunity"] = null;
  let abnormalLow: PriceInsights["abnormalLow"] = null;
  if (cp !== null && med > 0) {
    vsUsualPercent = round2(((cp - med) / med) * 100);
    const below = -vsUsualPercent;
    if (below > abnormal) {
      abnormalLow = { percentBelow: below, message: `⚠️ Prix anormalement bas — ${formatAmount(Math.round(below))} % sous le prix habituel observé (${usualRange.label}) : à vérifier avant d'acheter` };
    } else if (cp < p25 && below >= oppMin) {
      opportunity = { percentBelow: below, message: `🔥 Opportunité détectée — prix inférieur de ${formatAmount(Math.round(below))} % au prix habituel observé (${usualRange.label})` };
    }
  }

  return { ...base, reliable: true, usualRange, trend, vsUsualPercent, opportunity, abnormalLow };
}
