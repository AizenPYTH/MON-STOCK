import { div, HUNDRED, isZero, mul, parseDecimal, sub, cmp, type Dec, type ParseError } from "./decimal";

/**
 * Calculateur de remise (module pur, calcul exact) :
 *   - prix après remise   : prix initial × (1 − remise %)
 *   - pourcentage de remise : (initial − final) ÷ initial × 100
 *   - prix initial à retrouver : final ÷ (1 − remise %)
 */

export type DiscountMode = "final_price" | "discount_rate" | "initial_price";

export const DISCOUNT_MODE_LABEL: Record<DiscountMode, string> = {
  final_price: "Prix remisé",
  discount_rate: "% de remise",
  initial_price: "Prix initial",
};

export interface DiscountInput {
  mode: DiscountMode;
  initialPrice: string;
  finalPrice: string;
  percent: string;
}

export interface DiscountResult {
  initialPrice: Dec;
  finalPrice: Dec;
  /** montant économisé */
  saving: Dec;
  percent: Dec;
  /** champ calculé (les deux autres sont saisis) */
  computed: "finalPrice" | "percent" | "initialPrice";
}

type Field = "initialPrice" | "finalPrice" | "percent";

export type DiscountComputation = { state: "empty" } | { state: "invalid"; errors: Partial<Record<Field, string>> } | { state: "ok"; result: DiscountResult };

const ERROR_TEXT: Record<ParseError, string> = {
  empty: "Champ requis.",
  invalid: "Nombre invalide (ex. 129,90).",
  negative: "Valeur négative impossible.",
  too_large: "Valeur trop élevée.",
};

const INPUTS: Record<DiscountMode, [Field, Field]> = {
  final_price: ["initialPrice", "percent"],
  discount_rate: ["initialPrice", "finalPrice"],
  initial_price: ["finalPrice", "percent"],
};

export function evaluateDiscount(input: DiscountInput): DiscountComputation {
  const [a, b] = INPUTS[input.mode];
  if (input[a].trim() === "" || input[b].trim() === "") return { state: "empty" };
  const errors: Partial<Record<Field, string>> = {};
  const v: Partial<Record<Field, Dec>> = {};
  for (const f of [a, b]) {
    const r = parseDecimal(input[f]);
    if (!r.ok) errors[f] = ERROR_TEXT[r.error];
    else v[f] = r.value;
  }
  if (v.percent && cmp(v.percent, HUNDRED) > 0) errors.percent = "La remise ne peut pas dépasser 100 %.";
  if (input.mode === "initial_price" && v.percent && cmp(v.percent, HUNDRED) === 0) errors.percent = "Avec 100 % de remise, le prix initial ne peut pas être retrouvé.";
  if (input.mode === "discount_rate" && v.initialPrice && isZero(v.initialPrice)) errors.initialPrice = "Le prix initial doit être supérieur à 0.";
  if (input.mode === "discount_rate" && v.initialPrice && v.finalPrice && cmp(v.finalPrice, v.initialPrice) > 0) errors.finalPrice = "Le prix remisé est supérieur au prix initial (ce n'est pas une remise).";
  if (Object.keys(errors).length > 0) return { state: "invalid", errors };

  const keepRatio = (p: Dec) => div(sub(HUNDRED, p), HUNDRED);
  if (input.mode === "final_price") {
    const initialPrice = v.initialPrice as Dec;
    const percent = v.percent as Dec;
    const finalPrice = mul(initialPrice, keepRatio(percent));
    return { state: "ok", result: { initialPrice, finalPrice, saving: sub(initialPrice, finalPrice), percent, computed: "finalPrice" } };
  }
  if (input.mode === "discount_rate") {
    const initialPrice = v.initialPrice as Dec;
    const finalPrice = v.finalPrice as Dec;
    const saving = sub(initialPrice, finalPrice);
    return { state: "ok", result: { initialPrice, finalPrice, saving, percent: div(mul(saving, HUNDRED), initialPrice), computed: "percent" } };
  }
  const finalPrice = v.finalPrice as Dec;
  const percent = v.percent as Dec;
  const initialPrice = div(finalPrice, keepRatio(percent));
  return { state: "ok", result: { initialPrice, finalPrice, saving: sub(initialPrice, finalPrice), percent, computed: "initialPrice" } };
}
