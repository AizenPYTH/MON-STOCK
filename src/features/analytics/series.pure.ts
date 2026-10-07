/**
 * Séries temporelles de ventes : comblement des jours manquants, fenêtres (aujourd'hui / 7 j / 30 j)
 * et géométrie des mini-graphiques. Aucune valeur inventée : un jour sans vente vaut 0 (c'est un fait,
 * pas une estimation).
 */
const DAY_MS = 86_400_000;

export interface DailySalesLike {
  day: string | null;
  revenue: number | null;
  orders_count: number | null;
  units: number | null;
}

export interface DailyPoint {
  /** AAAA-MM-JJ (UTC, comme la vue v_daily_sales) */
  day: string;
  revenue: number;
  orders: number;
  units: number;
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Série continue des `days` derniers jours (le dernier point = aujourd'hui), jours sans vente à 0. */
export function fillDailySeries(rows: readonly DailySalesLike[], days: number, now: Date = new Date()): DailyPoint[] {
  const byDay = new Map<string, DailyPoint>();
  for (const r of rows) {
    if (!r.day) continue;
    const key = r.day.slice(0, 10);
    const point = byDay.get(key) ?? { day: key, revenue: 0, orders: 0, units: 0 };
    point.revenue += Number(r.revenue ?? 0);
    point.orders += Number(r.orders_count ?? 0);
    point.units += Number(r.units ?? 0);
    byDay.set(key, point);
  }
  const end = startOfUtcDay(now);
  const out: DailyPoint[] = [];
  for (let i = Math.max(1, days) - 1; i >= 0; i--) {
    const key = dayKey(new Date(end - i * DAY_MS));
    const found = byDay.get(key);
    out.push(found ? { ...found, revenue: Math.round(found.revenue * 100) / 100 } : { day: key, revenue: 0, orders: 0, units: 0 });
  }
  return out;
}

export interface WindowTotals {
  revenue: number;
  orders: number;
  units: number;
  days: number;
}

export interface SalesWindows {
  today: WindowTotals;
  last7d: WindowTotals;
  last30d: WindowTotals;
}

function totals(points: readonly DailyPoint[]): WindowTotals {
  let revenue = 0;
  let orders = 0;
  let units = 0;
  for (const p of points) {
    revenue += p.revenue;
    orders += p.orders;
    units += p.units;
  }
  return { revenue: Math.round(revenue * 100) / 100, orders, units, days: points.length };
}

export function summarizeSalesWindows(rows: readonly DailySalesLike[], now: Date = new Date()): SalesWindows {
  const series = fillDailySeries(rows, 30, now);
  return { today: totals(series.slice(-1)), last7d: totals(series.slice(-7)), last30d: totals(series) };
}

/** Graduations « rondes » pour un axe (0 … max). Toujours au moins [0, step]. */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const rough = max / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const nice = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  const step = nice * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.0001; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  if ((ticks[ticks.length - 1] ?? 0) < max) ticks.push(Math.round((ticks.length * step) * 1e6) / 1e6);
  return ticks;
}

/** Points (x, y) d'une sparkline dans une boîte width × height, avec marge `pad`. */
export function sparklinePoints(values: readonly number[], width: number, height: number, pad = 2): Array<[number, number]> {
  if (values.length === 0) return [];
  const max = Math.max(...values, 0);
  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;
  return values.map((v, i) => {
    const x = pad + i * stepX;
    const y = max > 0 ? pad + innerH - (Math.max(0, v) / max) * innerH : pad + innerH;
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
  });
}
