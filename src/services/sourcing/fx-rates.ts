import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import { parseEcbXml, crossRate } from "@/services/sourcing/ecb-parser";

/**
 * FxRateService — taux de référence quotidiens de la BCE (base EUR), stockés dans
 * fx_rates (table globale, écriture service_role). Aucun taux n'est jamais inventé :
 * si une devise manque, la conversion est « indisponible » et le prix original est conservé.
 */
const log = createLogger("FX_RATES");

export const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const CACHE_TTL_MS = 60 * 60 * 1000;
/** Délai maximal de l'appel à la BCE (connexion + lecture du corps). */
export const ECB_TIMEOUT_MS = 15_000;
/**
 * Âge maximal (jours calendaires) au-delà duquel les taux sont signalés « périmés » : la BCE ne
 * publie pas le week-end ni les jours fériés TARGET (Pâques : jeudi → mardi = 5 jours).
 */
export const FX_MAX_AGE_DAYS = 5;

/** Âge en jours calendaires d'une date de taux (AAAA-MM-JJ) ; null si illisible. */
export function fxRateAgeDays(rateDate: string, now: Date = new Date()): number | null {
  const t = Date.parse(`${rateDate}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((today - t) / 86_400_000));
}

/** Taux trop anciens (BCE injoignable plusieurs jours) ou date illisible. */
export function isFxRateStale(rateDate: string, now: Date = new Date()): boolean {
  const age = fxRateAgeDays(rateDate, now);
  return age === null || age > FX_MAX_AGE_DAYS;
}

interface RateCache {
  loadedAt: number;
  date: string;
  rates: Record<string, number>;
}

let cache: RateCache | null = null;

export function invalidateFxCache(): void {
  cache = null;
}

export async function refreshFxRates(options: { fetchImpl?: typeof fetch; userAgent?: string; timeoutMs?: number; now?: Date } = {}): Promise<{ date: string; count: number; stale: boolean; ageDays: number | null }> {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? ECB_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let xml: string;
  try {
    const res = await doFetch(ECB_DAILY_URL, { headers: { Accept: "application/xml,text/xml", ...(options.userAgent ? { "User-Agent": options.userAgent } : {}) }, signal: controller.signal });
    if (!res.ok) throw new Error(`BCE : HTTP ${res.status}`);
    xml = await res.text();
  } catch (e) {
    if (controller.signal.aborted) throw new Error(`BCE : délai dépassé (${Math.round(timeoutMs / 1000)} s).`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const parsed = parseEcbXml(xml);
  const ageDays = fxRateAgeDays(parsed.date, options.now);
  const stale = isFxRateStale(parsed.date, options.now);
  if (stale) log.warn("fx rates stale", { date: parsed.date, ageDays, maxAgeDays: FX_MAX_AGE_DAYS });
  const admin = createAdminSupabaseClient();
  const rows = Object.entries(parsed.rates)
    .filter(([cur]) => cur !== "EUR")
    .map(([cur, rate]) => ({ base_currency: "EUR", quote_currency: cur, rate, rate_date: parsed.date, source: "ecb", fetched_at: new Date().toISOString() }));
  const { error } = await admin.from("fx_rates").upsert(rows, { onConflict: "base_currency,quote_currency,rate_date" });
  if (error) throw new Error(`fx_rates : ${error.message}`);
  cache = { loadedAt: Date.now(), date: parsed.date, rates: parsed.rates };
  log.info("fx rates refreshed", { date: parsed.date, count: rows.length });
  return { date: parsed.date, count: rows.length, stale, ageDays };
}

/** Dernière journée de taux disponible en base (EUR = 1). */
export async function loadLatestRates(): Promise<{ date: string; rates: Record<string, number> } | null> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return { date: cache.date, rates: cache.rates };
  const admin = createAdminSupabaseClient();
  const { data: latest } = await admin.from("fx_rates").select("rate_date").eq("base_currency", "EUR").order("rate_date", { ascending: false }).limit(1).maybeSingle();
  if (!latest) return null;
  const { data: rows } = await admin.from("fx_rates").select("quote_currency, rate").eq("base_currency", "EUR").eq("rate_date", latest.rate_date);
  const rates: Record<string, number> = { EUR: 1 };
  for (const r of rows ?? []) rates[r.quote_currency.toUpperCase()] = Number(r.rate);
  cache = { loadedAt: Date.now(), date: latest.rate_date, rates };
  return { date: latest.rate_date, rates };
}

export interface FxQuote {
  rate: number;
  date: string | null;
  /** taux plus anciens que FX_MAX_AGE_DAYS (signalé, la conversion reste fournie avec sa date) */
  stale?: boolean;
}

/** Taux from → to via les taux croisés EUR. Même devise → 1. Devise absente → null. */
export async function getFxRate(from: string, to: string): Promise<FxQuote | null> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return { rate: 1, date: null };
  const latest = await loadLatestRates();
  if (!latest) return null;
  const rate = crossRate(latest.rates, f, t);
  if (rate === null) return null;
  const stale = isFxRateStale(latest.date);
  if (stale) log.warn("fx rates stale", { date: latest.date, maxAgeDays: FX_MAX_AGE_DAYS });
  return { rate, date: latest.date, stale };
}
