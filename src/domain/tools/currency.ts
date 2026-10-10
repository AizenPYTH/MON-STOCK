import { add, div, fromNumber, isZero, mul, ONE, parseDecimal, percentOf, sub, ZERO, type Dec, type ParseError } from "./decimal";

/**
 * Convertisseur de devises : taux de référence BCE (base EUR, publiés chaque jour ouvré) et
 * frais bancaires configurables, présentés SÉPARÉMENT. Le taux de référence n'est pas le taux
 * appliqué par votre banque : il sert d'estimation.
 */

export interface FxRate {
  /** devise cotée pour 1 EUR */
  currency: string;
  rate: number;
  rateDate: string;
  source: string;
}

/** Dernier taux connu par devise (lignes `fx_rates`, base EUR). */
export function latestRates(rows: { base_currency: string; quote_currency: string; rate: number | string; rate_date: string; source: string }[]): FxRate[] {
  const best = new Map<string, FxRate>();
  for (const r of rows) {
    if (r.base_currency.trim().toUpperCase() !== "EUR") continue;
    const currency = r.quote_currency.trim().toUpperCase();
    const rate = typeof r.rate === "string" ? Number(r.rate) : r.rate;
    if (!Number.isFinite(rate) || rate <= 0) continue;
    const prev = best.get(currency);
    if (!prev || r.rate_date > prev.rateDate) best.set(currency, { currency, rate, rateDate: r.rate_date, source: r.source });
  }
  return [...best.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export interface ConversionInput {
  amount: string;
  from: string;
  to: string;
  /** frais bancaires en % du montant converti */
  bankFeePercent: string;
  /** frais fixes, dans la devise d'arrivée */
  bankFeeFixed: string;
}

export interface ConversionResult {
  amount: Dec;
  from: string;
  to: string;
  /** 1 `from` = `rate` `to` (taux de référence, sans frais) */
  rate: Dec;
  /** date du taux le plus ancien utilisé (deux taux pour une conversion croisée) */
  rateDate: string | null;
  source: string;
  /** montant converti au taux de référence */
  converted: Dec;
  bankFees: Dec;
  /** coût total dans la devise d'arrivée (converti + frais) */
  totalWithFees: Dec;
  /** taux effectif frais compris */
  effectiveRate: Dec | null;
  feesEntered: boolean;
}

type Field = "amount" | "bankFeePercent" | "bankFeeFixed" | "currency";

export type ConversionComputation = { state: "empty" } | { state: "invalid"; errors: Partial<Record<Field, string>> } | { state: "ok"; result: ConversionResult };

const ERROR_TEXT: Record<ParseError, string> = {
  empty: "Champ requis.",
  invalid: "Nombre invalide (ex. 129,90).",
  negative: "Valeur négative impossible.",
  too_large: "Valeur trop élevée.",
};

function rateOf(currency: string, rates: FxRate[]): { rate: Dec; date: string | null; source: string } | null {
  if (currency.toUpperCase() === "EUR") return { rate: ONE, date: null, source: "" };
  const r = rates.find((x) => x.currency === currency.toUpperCase());
  return r ? { rate: fromNumber(r.rate), date: r.rateDate, source: r.source } : null;
}

export function convertCurrency(input: ConversionInput, rates: FxRate[]): ConversionComputation {
  if (input.amount.trim() === "") return { state: "empty" };
  const errors: Partial<Record<Field, string>> = {};
  const amount = parseDecimal(input.amount);
  if (!amount.ok) errors.amount = ERROR_TEXT[amount.error];
  const read = (f: "bankFeePercent" | "bankFeeFixed"): Dec | null => {
    if (input[f].trim() === "") return null;
    const r = parseDecimal(input[f]);
    if (!r.ok) {
      errors[f] = ERROR_TEXT[r.error];
      return null;
    }
    return r.value;
  };
  const feePct = read("bankFeePercent");
  const feeFixed = read("bankFeeFixed");
  const from = rateOf(input.from, rates);
  const to = rateOf(input.to, rates);
  if (!from || !to) errors.currency = `Aucun taux disponible pour ${!from ? input.from : input.to}.`;
  if (Object.keys(errors).length > 0 || !amount.ok || !from || !to) return { state: "invalid", errors };

  // 1 from = (to / from) to ; les deux taux sont exprimés pour 1 EUR.
  const rate = div(to.rate, from.rate);
  const converted = mul(amount.value, rate);
  const bankFees = add(feePct ? percentOf(converted, feePct) : ZERO, feeFixed ?? ZERO);
  const totalWithFees = add(converted, bankFees);
  const dates = [from.date, to.date].filter((d): d is string => d !== null).sort();
  return {
    state: "ok",
    result: {
      amount: amount.value,
      from: input.from.toUpperCase(),
      to: input.to.toUpperCase(),
      rate,
      rateDate: dates[0] ?? null,
      source: from.source || to.source || "ecb",
      converted,
      bankFees,
      totalWithFees,
      effectiveRate: isZero(amount.value) ? null : div(totalWithFees, amount.value),
      feesEntered: feePct !== null || feeFixed !== null,
    },
  };
}

/** Écart entre taux effectif et taux de référence, en % (coût réel des frais). */
export function feeImpactPercent(r: ConversionResult): Dec | null {
  if (!r.effectiveRate || isZero(r.rate)) return null;
  return mul(div(sub(r.effectiveRate, r.rate), r.rate), { n: 100n, d: 1n });
}

/** Âge du taux en jours (BCE : pas de publication le week-end ni les jours fériés TARGET). */
export function rateAgeDays(rateDate: string | null, now: Date): number | null {
  if (!rateDate) return null;
  const t = Date.parse(`${rateDate}T16:00:00Z`);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}
