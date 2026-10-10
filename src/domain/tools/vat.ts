import { add, dec, div, HUNDRED, isNegative, mul, ONE, parseDecimal, sub, type Dec, type ParseError } from "./decimal";

/**
 * Calculateur de TVA (module pur). Résultat = estimation mathématique, pas un avis fiscal : le
 * taux applicable dépend du produit, du pays, du régime (normal, marge, franchise…) et n'est
 * jamais choisi automatiquement.
 */

export type VatMode = "ht_to_ttc" | "ttc_to_ht" | "vat_only";
export type AmountBasis = "ht" | "ttc";

export interface VatRateOption {
  id: string;
  /** taux en %, saisi en texte décimal français (« 5,5 ») pour rester exact */
  rate: string;
  label: string;
  /** usage indicatif — jamais une règle d'application */
  hint: string;
  custom?: boolean;
}

/** Taux français courants, proposés sans présumer qu'ils s'appliquent à une marchandise donnée. */
export const DEFAULT_VAT_RATES: VatRateOption[] = [
  { id: "fr-20", rate: "20", label: "20 %", hint: "Taux normal en France." },
  { id: "fr-10", rate: "10", label: "10 %", hint: "Taux intermédiaire en France (certains produits et services)." },
  { id: "fr-5.5", rate: "5,5", label: "5,5 %", hint: "Taux réduit en France (certains produits de première nécessité)." },
  { id: "fr-2.1", rate: "2,1", label: "2,1 %", hint: "Taux particulier en France (cas très spécifiques)." },
];

export const VAT_DISCLAIMER =
  "Estimation mathématique : le taux applicable dépend du produit, du pays et de votre régime de TVA (normal, sur marge, franchise). Vérifiez-le auprès de votre expert-comptable.";

export const VAT_MODE_LABEL: Record<VatMode, string> = {
  ht_to_ttc: "HT → TTC",
  ttc_to_ht: "TTC → HT",
  vat_only: "TVA seule",
};

export type VatRateError = ParseError | "out_of_range";

/** Taux accepté : 0 à 100 %, au plus 3 décimales. */
export function parseVatRate(input: string): { ok: true; value: Dec } | { ok: false; error: VatRateError } {
  const r = parseDecimal(input, { maxIntegerDigits: 3 });
  if (!r.ok) return r;
  if (isNegative(r.value) || r.value.n > r.value.d * 100n) return { ok: false, error: "out_of_range" };
  return r;
}

export interface VatResult {
  ht: Dec;
  vat: Dec;
  ttc: Dec;
  /** base sur laquelle le montant saisi a été interprété */
  inputBasis: AmountBasis;
  rate: Dec;
}

/** Calcul exact (aucun arrondi intermédiaire). */
export function computeVat(amount: Dec, rate: Dec, basis: AmountBasis): VatResult {
  const factor = add(ONE, div(rate, HUNDRED));
  if (basis === "ht") {
    const vat = div(mul(amount, rate), HUNDRED);
    return { ht: amount, vat, ttc: add(amount, vat), inputBasis: "ht", rate };
  }
  const ht = div(amount, factor);
  return { ht, vat: sub(amount, ht), ttc: amount, inputBasis: "ttc", rate };
}

/** Base implicite de chaque mode (« TVA seule » : base choisie explicitement par l'utilisateur). */
export function basisForMode(mode: VatMode, vatOnlyBasis: AmountBasis): AmountBasis {
  return mode === "ht_to_ttc" ? "ht" : mode === "ttc_to_ht" ? "ttc" : vatOnlyBasis;
}

/** Inverser le sens : HT → TTC devient TTC → HT en reprenant le résultat comme nouvelle saisie. */
export function invertMode(mode: VatMode): VatMode {
  return mode === "ht_to_ttc" ? "ttc_to_ht" : mode === "ttc_to_ht" ? "ht_to_ttc" : mode;
}

export type VatComputation =
  | { state: "empty" }
  | { state: "error"; field: "amount" | "rate"; error: ParseError | VatRateError }
  | { state: "ok"; result: VatResult };

/** Point d'entrée de l'écran : textes saisis → état affichable (champ vide = aucun résultat). */
export function evaluateVatForm(input: { mode: VatMode; amount: string; rate: string; vatOnlyBasis: AmountBasis }): VatComputation {
  if (input.amount.trim() === "") return { state: "empty" };
  const amount = parseDecimal(input.amount);
  if (!amount.ok) return { state: "error", field: "amount", error: amount.error };
  const rate = parseVatRate(input.rate);
  if (!rate.ok) return { state: "error", field: "rate", error: rate.error };
  return { state: "ok", result: computeVat(amount.value, rate.value, basisForMode(input.mode, input.vatOnlyBasis)) };
}

export const RATE_ERROR_LABEL: Record<VatRateError, string> = {
  empty: "Choisissez ou saisissez un taux.",
  invalid: "Taux invalide (ex. 5,5).",
  negative: "Le taux ne peut pas être négatif.",
  too_large: "Taux invalide.",
  out_of_range: "Le taux doit être compris entre 0 et 100 %.",
};

/** Taux personnalisé valide → option (id stable dérivé du taux). */
export function customRateOption(text: string): VatRateOption | null {
  const r = parseVatRate(text);
  if (!r.ok) return null;
  const label = text.trim().replace(".", ",");
  return { id: `custom-${label}`, rate: label, label: `${label} %`, hint: "Taux personnalisé.", custom: true };
}

export const rateDec = (o: VatRateOption): Dec => {
  const r = parseVatRate(o.rate);
  return r.ok ? r.value : dec(0);
};
