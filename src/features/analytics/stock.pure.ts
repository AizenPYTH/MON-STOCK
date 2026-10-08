/**
 * Regroupement des lignes de stock enrichies (vitesse, couverture, statut, marge) :
 * compteurs par niveau, totaux honnêtes (valeur de stock = coûts connus uniquement),
 * meilleures ventes, stock dormant et anomalies de stock négatif.
 */
import { STOCK_LEVEL_ORDER, type StockLevel } from "@/domain/inventory/alerts";
import type { StockRowView } from "@/features/stock/model";
import { daysSince } from "@/features/analytics/util.pure";

export const DEAD_STOCK_DAYS = 60;

export interface StockTotals {
  skus: number;
  unitsOnHand: number;
  /** Σ coût × quantité en main, uniquement pour les SKU au coût connu et au stock positif */
  stockValueKnown: number;
  skusValued: number;
  /** SKU actifs dont le coût d'achat est inconnu */
  skusUnknownCost: number;
  /** parmi eux, ceux qui ont du stock (donc exclus de la valorisation) */
  skusUnknownCostWithStock: number;
  /** SKU valorisés dans une autre devise que celle de l'organisation (exclus de stockValueKnown) */
  skusOtherCurrency: number;
}

export interface StockAnalytics {
  all: StockRowView[];
  byLevel: Record<StockLevel, StockRowView[]>;
  counts: Record<StockLevel, number>;
  totals: StockTotals;
  topSellers: StockRowView[];
  deadStock: StockRowView[];
  negativeStock: StockRowView[];
  /** true si la limite de chargement a été atteinte (les compteurs sont alors des minima) */
  truncated: boolean;
}

/** Niveau (rupture d'abord), puis couverture croissante (inconnue en dernier), puis ventes 30 j décroissantes. */
export function urgencyComparator(a: StockRowView, b: StockRowView): number {
  const la = STOCK_LEVEL_ORDER[a.classification.level];
  const lb = STOCK_LEVEL_ORDER[b.classification.level];
  if (la !== lb) return la - lb;
  const da = a.daysOfCover ?? Number.POSITIVE_INFINITY;
  const db = b.daysOfCover ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  const ua = a.row.units_30d ?? 0;
  const ub = b.row.units_30d ?? 0;
  if (ua !== ub) return ub - ua;
  return (a.row.product_name ?? "").localeCompare(b.row.product_name ?? "", "fr");
}

/** Stock disponible mais aucune vente depuis 60 jours (ou jamais vendu). */
export function isDeadStock(view: StockRowView, now: Date, days = DEAD_STOCK_DAYS): boolean {
  if ((view.row.quantity_available ?? 0) <= 0) return false;
  const since = daysSince(view.row.last_sale_at, now);
  return since === null || since >= days;
}

export function groupStockViews(views: readonly StockRowView[], now: Date = new Date(), opts: { topN?: number; truncated?: boolean; currency?: string } = {}): StockAnalytics {
  const byLevel: Record<StockLevel, StockRowView[]> = { out_of_stock: [], at_risk: [], low: [], normal: [] };
  const totals: StockTotals = { skus: views.length, unitsOnHand: 0, stockValueKnown: 0, skusValued: 0, skusUnknownCost: 0, skusUnknownCostWithStock: 0, skusOtherCurrency: 0 };
  const negativeStock: StockRowView[] = [];
  const deadStock: StockRowView[] = [];

  for (const v of views) {
    byLevel[v.classification.level].push(v);
    const onHand = v.row.quantity_on_hand ?? 0;
    totals.unitsOnHand += Math.max(0, onHand);
    if (v.row.cost_price === null) {
      totals.skusUnknownCost++;
      if (onHand > 0) totals.skusUnknownCostWithStock++;
    } else if (onHand > 0) {
      if (opts.currency && v.row.currency && v.row.currency.toUpperCase() !== opts.currency.toUpperCase()) {
        // Jamais d'addition entre devises : signalé à part.
        totals.skusOtherCurrency++;
      } else {
        totals.stockValueKnown += v.row.cost_price * onHand;
        totals.skusValued++;
      }
    }
    if (onHand < 0 || (v.row.quantity_available ?? 0) < 0) negativeStock.push(v);
    if (isDeadStock(v, now)) deadStock.push(v);
  }
  totals.stockValueKnown = Math.round(totals.stockValueKnown * 100) / 100;

  for (const level of Object.keys(byLevel) as StockLevel[]) byLevel[level].sort(urgencyComparator);

  const topSellers = views
    .filter((v) => (v.row.units_30d ?? 0) > 0)
    .sort((a, b) => (b.row.units_30d ?? 0) - (a.row.units_30d ?? 0) || Number(b.row.revenue_30d ?? 0) - Number(a.row.revenue_30d ?? 0))
    .slice(0, opts.topN ?? 10);

  const valueOf = (v: StockRowView) => (v.row.cost_price === null ? -1 : v.row.cost_price * Math.max(0, v.row.quantity_on_hand ?? 0));
  deadStock.sort((a, b) => valueOf(b) - valueOf(a) || (b.row.quantity_available ?? 0) - (a.row.quantity_available ?? 0));
  negativeStock.sort((a, b) => (a.row.quantity_available ?? 0) - (b.row.quantity_available ?? 0));

  return {
    all: [...views],
    byLevel,
    counts: { out_of_stock: byLevel.out_of_stock.length, at_risk: byLevel.at_risk.length, low: byLevel.low.length, normal: byLevel.normal.length },
    totals,
    topSellers,
    deadStock,
    negativeStock,
    truncated: opts.truncated ?? false,
  };
}
