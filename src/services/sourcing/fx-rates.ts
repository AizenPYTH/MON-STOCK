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

interface RateCache {
  loadedAt: number;
  date: string;
  rates: Record<string, number>;
}

let cache: RateCache | null = null;

export function invalidateFxCache(): void {
  cache = null;
}

export async function refreshFxRates(options: { fetchImpl?: typeof fetch; userAgent?: string } = {}): Promise<{ date: string; count: number }> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(ECB_DAILY_URL, { headers: { Accept: "application/xml,text/xml", ...(options.userAgent ? { "User-Agent": options.userAgent } : {}) } });
  if (!res.ok) throw new Error(`BCE : HTTP ${res.status}`);
  const xml = await res.text();
  const parsed = parseEcbXml(xml);
  const admin = createAdminSupabaseClient();
  const rows = Object.entries(parsed.rates)
    .filter(([cur]) => cur !== "EUR")
    .map(([cur, rate]) => ({ base_currency: "EUR", quote_currency: cur, rate, rate_date: parsed.date, source: "ecb", fetched_at: new Date().toISOString() }));
  const { error } = await admin.from("fx_rates").upsert(rows, { onConflict: "base_currency,quote_currency,rate_date" });
  if (error) throw new Error(`fx_rates : ${error.message}`);
  cache = { loadedAt: Date.now(), date: parsed.date, rates: parsed.rates };
  log.info("fx rates refreshed", { date: parsed.date, count: rows.length });
  return { date: parsed.date, count: rows.length };
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
}

/** Taux from → to via les taux croisés EUR. Même devise → 1. Devise absente → null. */
export async function getFxRate(from: string, to: string): Promise<FxQuote | null> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return { rate: 1, date: null };
  const latest = await loadLatestRates();
  if (!latest) return null;
  const rate = crossRate(latest.rates, f, t);
  return rate === null ? null : { rate, date: latest.date };
}
