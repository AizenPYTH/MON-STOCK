/**
 * Séries temporelles de ventes : comblement des jours manquants, fenêtres (aujourd'hui / 7 j / 30 j)
 * et géométrie des mini-graphiques. Aucune valeur inventée : un jour sans vente vaut 0 (c'est un fait,
 * pas une estimation).
 *
 * Fuseau : les jours sont des jours civils Europe/Paris (comme la vue v_daily_sales) —
 * « aujourd'hui » commence à minuit heure de Paris.
 * Devises : le chiffre d'affaires n'est jamais additionné entre devises ; les ventes dans une
 * autre devise que celle de l'organisation sont comptées en commandes / unités mais leur montant
 * est rapporté à part (otherCurrencies), sans conversion inventée.
 */
const DAY_MS = 86_400_000;

export const ANALYTICS_TIME_ZONE = "Europe/Paris";

export interface DailySalesLike {
  day: string | null;
  revenue: number | null;
  orders_count: number | null;
  units: number | null;
  /** devise des commandes de la ligne (v_daily_sales) ; absente = devise principale */
  currency?: string | null;
}

export interface DailyPoint {
  /** AAAA-MM-JJ (jour civil Europe/Paris, comme la vue v_daily_sales) */
  day: string;
  revenue: number;
  orders: number;
  units: number;
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dayFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormatters.set(timeZone, f);
  }
  return f;
}

/** Jour civil (AAAA-MM-JJ) d'un instant dans le fuseau d'analyse. */
export function dayKey(d: Date, timeZone: string = ANALYTICS_TIME_ZONE): string {
  const parts = dayFormatter(timeZone).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Ajoute `delta` jours à une clé AAAA-MM-JJ (arithmétique calendaire, sans fuseau). */
export function shiftDayKey(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** Décalage (ms) du fuseau par rapport à UTC à l'instant `utcMs`. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Instant UTC (ISO) de minuit au début du jour `key` dans le fuseau (gère l'heure d'été). */
export function zonedDayStartIso(key: string, timeZone: string = ANALYTICS_TIME_ZONE): string {
  const [y, m, d] = key.split("-").map(Number);
  const guess = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  let utc = guess - zoneOffsetMs(guess, timeZone);
  // Second passage : le décalage peut différer de part et d'autre d'un changement d'heure.
  utc = guess - zoneOffsetMs(utc, timeZone);
  return new Date(utc).toISOString();
}

/** Série continue des `days` derniers jours (le dernier point = aujourd'hui), jours sans vente à 0. */
export function fillDailySeries(rows: readonly DailySalesLike[], days: number, now: Date = new Date(), opts: { currency?: string } = {}): DailyPoint[] {
  const byDay = new Map<string, DailyPoint>();
  for (const r of rows) {
    if (!r.day) continue;
    const key = r.day.slice(0, 10);
    const point = byDay.get(key) ?? { day: key, revenue: 0, orders: 0, units: 0 };
    if (isMainCurrency(r, opts.currency)) point.revenue += Number(r.revenue ?? 0);
    point.orders += Number(r.orders_count ?? 0);
    point.units += Number(r.units ?? 0);
    byDay.set(key, point);
  }
  const today = dayKey(now);
  const out: DailyPoint[] = [];
  for (let i = Math.max(1, days) - 1; i >= 0; i--) {
    const key = shiftDayKey(today, -i);
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

export interface ForeignCurrencyTotal {
  currency: string;
  revenue: number;
  orders: number;
}

export interface SalesWindows {
  today: WindowTotals;
  last7d: WindowTotals;
  last30d: WindowTotals;
  /** ventes des 30 derniers jours dans une autre devise : exclues des montants ci-dessus, jamais converties */
  otherCurrencies: ForeignCurrencyTotal[];
}

function isMainCurrency(r: DailySalesLike, currency: string | undefined): boolean {
  if (!currency || !r.currency) return true;
  return r.currency.toUpperCase() === currency.toUpperCase();
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

export function summarizeSalesWindows(rows: readonly DailySalesLike[], now: Date = new Date(), currency?: string): SalesWindows {
  const series = fillDailySeries(rows, 30, now, { currency });
  const first = series[0]?.day ?? dayKey(now);
  const foreign = new Map<string, ForeignCurrencyTotal>();
  for (const r of rows) {
    if (!r.day || r.day.slice(0, 10) < first || isMainCurrency(r, currency) || !r.currency) continue;
    const key = r.currency.toUpperCase();
    const agg = foreign.get(key) ?? { currency: key, revenue: 0, orders: 0 };
    agg.revenue = Math.round((agg.revenue + Number(r.revenue ?? 0)) * 100) / 100;
    agg.orders += Number(r.orders_count ?? 0);
    foreign.set(key, agg);
  }
  return {
    today: totals(series.slice(-1)),
    last7d: totals(series.slice(-7)),
    last30d: totals(series),
    otherCurrencies: Array.from(foreign.values()).sort((a, b) => a.currency.localeCompare(b.currency)),
  };
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
