import { dayKey, shiftDayKey, type DailySalesLike } from "@/features/analytics/series.pure";
import type { StockRowView } from "@/features/stock/model";

/**
 * « Analyse » (7 / 30 / 90 jours) — même calcul que l'application iPhone
 * (apps/mobile/src/data/intelligence.ts, fetchAnalysis), sur les données réelles (RLS).
 * Une valeur non calculable (coût d'achat inconnu, devise différente…) vaut `null` : l'écran
 * affiche « — », jamais une estimation inventée.
 */

export const ANALYSIS_PERIODS = [7, 30, 90] as const;
export type AnalysisPeriod = (typeof ANALYSIS_PERIODS)[number];
export const DEFAULT_ANALYSIS_PERIOD: AnalysisPeriod = 30;

export function parseAnalysisPeriod(value: unknown): AnalysisPeriod {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return (ANALYSIS_PERIODS as readonly number[]).includes(n) ? (n as AnalysisPeriod) : DEFAULT_ANALYSIS_PERIOD;
}

/** Nombre de jours de ventes quotidiennes à lire pour une période (courante + précédente, ≥ 5 semaines). */
export function analysisSpanDays(period: AnalysisPeriod): number {
  return Math.max(period * 2, 35);
}

export type AnalysisView = {
  row: Pick<StockRowView["row"], "sku_id" | "code" | "product_name" | "variant_name" | "currency" | "units_7d" | "units_30d" | "units_90d" | "quantity_available" | "quantity_on_hand" | "cost_price">;
  margin: Pick<StockRowView["margin"], "netProfit" | "complete">;
};

export interface AnalysisTopProduct {
  skuId: string;
  code: string;
  label: string;
  units: number;
  /** bénéfice net estimé sur la période (unités × bénéfice net unitaire actuel) */
  profit: number;
  /** une partie des frais est inconnue : bénéfice provisoire */
  partial: boolean;
}

export interface AnalysisData {
  period: AnalysisPeriod;
  revenue: number;
  revenuePrevious: number;
  revenueChangePercent: number | null;
  orders: number;
  averageBasket: number | null;
  /** bénéfice net estimé (Σ unités vendues × bénéfice net unitaire des SKU au coût connu) */
  netProfit: number | null;
  netProfitShare: number | null;
  /** SKU vendus sur la période exclus du bénéfice (coût inconnu ou autre devise) */
  skusWithoutMargin: number;
  /** SKU inclus dont certains frais sont inconnus (bénéfice provisoire) */
  skusPartialMargin: number;
  /** couverture moyenne : stock disponible ÷ ventes quotidiennes de la période */
  coverDays: number | null;
  /** valeur du stock au coût d'achat connu */
  stockValue: number;
  /** SKU en stock sans coût d'achat (non comptés dans la valeur) */
  stockWithoutCost: number;
  weekly: { label: string; from: string; value: number }[];
  topProducts: AnalysisTopProduct[];
}

function unitsFor(v: AnalysisView, period: AnalysisPeriod): number {
  return period === 7 ? (v.row.units_7d ?? 0) : period === 30 ? (v.row.units_30d ?? 0) : (v.row.units_90d ?? 0);
}

/** Semaine ISO 8601 (année ISO et numéro) d'un jour AAAA-MM-JJ. */
export function isoWeek(day: string): { year: number; week: number } {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // jeudi de la semaine
  const year = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { year, week };
}

/** Lundi de la semaine ISO d'un jour AAAA-MM-JJ. */
function mondayOf(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  return shiftDayKey(day.slice(0, 10), -((d.getUTCDay() + 6) % 7));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeAnalysis(input: { rows: readonly DailySalesLike[]; views: readonly AnalysisView[]; currency: string; period: AnalysisPeriod; now?: Date; topLimit?: number }): AnalysisData {
  const { period, currency } = input;
  const now = input.now ?? new Date();
  const cur = currency.toUpperCase();
  const today = dayKey(now);
  const rows = input.rows.filter((r) => !r.currency || r.currency.toUpperCase() === cur);
  const currentStart = shiftDayKey(today, -(period - 1));
  const previousStart = shiftDayKey(today, -(2 * period - 1));
  const sum = (from: string, to: string, pick: (r: DailySalesLike) => number) =>
    rows.filter((r) => r.day !== null && r.day.slice(0, 10) >= from && r.day.slice(0, 10) <= to).reduce((s, r) => s + pick(r), 0);
  const revenue = round2(sum(currentStart, today, (r) => Number(r.revenue ?? 0)));
  const revenuePrevious = round2(sum(previousStart, shiftDayKey(currentStart, -1), (r) => Number(r.revenue ?? 0)));
  const orders = sum(currentStart, today, (r) => Number(r.orders_count ?? 0));

  let profit = 0;
  let withMargin = 0;
  let skusWithoutMargin = 0;
  let skusPartialMargin = 0;
  const top: AnalysisTopProduct[] = [];
  for (const v of input.views) {
    const units = unitsFor(v, period);
    if (units === 0) continue;
    if (v.margin.netProfit === null || (v.row.currency && v.row.currency.toUpperCase() !== cur)) {
      skusWithoutMargin++;
      continue;
    }
    withMargin++;
    if (!v.margin.complete) skusPartialMargin++;
    const p = round2(units * v.margin.netProfit);
    profit += p;
    const variant = v.row.variant_name && v.row.variant_name !== "Standard" ? ` · ${v.row.variant_name}` : "";
    top.push({ skuId: v.row.sku_id ?? "", code: v.row.code ?? "", label: `${v.row.product_name ?? v.row.code ?? "Produit"}${variant}`, units, profit: p, partial: !v.margin.complete });
  }
  const unitsSold = input.views.reduce((s, v) => s + unitsFor(v, period), 0);
  const available = input.views.reduce((s, v) => s + Math.max(0, v.row.quantity_available ?? 0), 0);
  let stockValue = 0;
  let stockWithoutCost = 0;
  for (const v of input.views) {
    const onHand = v.row.quantity_on_hand ?? 0;
    if (onHand <= 0) continue;
    if (v.row.cost_price === null) stockWithoutCost++;
    else stockValue += v.row.cost_price * onHand;
  }

  // CA des 5 dernières semaines ISO (la semaine en cours en dernier, incomplète).
  const weeks: { key: string; label: string; from: string; value: number }[] = [];
  for (let i = 4; i >= 0; i--) {
    const day = shiftDayKey(today, -7 * i);
    const w = isoWeek(day);
    weeks.push({ key: `${w.year}-${w.week}`, label: `S${w.week}`, from: mondayOf(day), value: 0 });
  }
  const byKey = new Map(weeks.map((w) => [w.key, w]));
  for (const r of rows) {
    if (!r.day) continue;
    const w = isoWeek(r.day);
    const slot = byKey.get(`${w.year}-${w.week}`);
    if (slot) slot.value += Number(r.revenue ?? 0);
  }

  return {
    period,
    revenue,
    revenuePrevious,
    revenueChangePercent: revenuePrevious > 0 ? Math.round(((revenue - revenuePrevious) / revenuePrevious) * 1000) / 10 : null,
    orders,
    averageBasket: orders > 0 ? round2(revenue / orders) : null,
    netProfit: withMargin > 0 ? round2(profit) : null,
    netProfitShare: withMargin > 0 && revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null,
    skusWithoutMargin,
    skusPartialMargin,
    coverDays: unitsSold > 0 ? Math.round(available / (unitsSold / period)) : null,
    stockValue: round2(stockValue),
    stockWithoutCost,
    weekly: weeks.map((w) => ({ label: w.label, from: w.from, value: round2(w.value) })),
    topProducts: top.sort((a, b) => b.profit - a.profit).slice(0, input.topLimit ?? 5),
  };
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1 };

/** Alerte ouverte la plus grave puis la plus récente (même règle que l'accueil iPhone). */
export function pickTopAlert<T extends { severity: string; created_at: string }>(alerts: readonly T[]): T | null {
  const sorted = [...alerts].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 2) - (SEVERITY_RANK[b.severity] ?? 2) || b.created_at.localeCompare(a.created_at));
  return sorted[0] ?? null;
}
