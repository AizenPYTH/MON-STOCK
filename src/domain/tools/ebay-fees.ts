import { add, div, HUNDRED, mul, parseDecimal, percentOf, sub, sum, ZERO, type Dec, type ParseError } from "./decimal";

/**
 * Calculateur de frais eBay. AUCUN taux n'est codé en dur : les taux varient selon la catégorie,
 * le statut (particulier / professionnel), les options et changent dans le temps. L'utilisateur
 * saisit ceux de sa grille (ou ceux de ses réglages du canal eBay, repris tels quels).
 */

export interface EbayFeesInput {
  /** prix de l'objet payé par l'acheteur */
  itemPrice: string;
  /** frais de port facturés à l'acheteur */
  shippingCharged: string;
  /** commission sur la valeur finale, en % */
  finalValueFeePercent: string;
  /** la commission s'applique au montant total (objet + port) */
  feeOnShipping: boolean;
  /** frais fixes par commande */
  fixedFeePerOrder: string;
  /** annonce sponsorisée, en % du prix de vente */
  promotedPercent: string;
  /** autres frais (options, frais internationaux…), montant */
  otherFees: string;
  /** coût réel de l'envoi (étiquette) */
  actualShippingCost: string;
  /** coût d'achat de l'objet, facultatif */
  purchaseCost: string;
}

export const EMPTY_EBAY_FEES: EbayFeesInput = {
  itemPrice: "",
  shippingCharged: "",
  finalValueFeePercent: "",
  feeOnShipping: true,
  fixedFeePerOrder: "",
  promotedPercent: "",
  otherFees: "",
  actualShippingCost: "",
  purchaseCost: "",
};

export interface FeeLine {
  label: string;
  amount: Dec;
}

export interface EbayFeesResult {
  /** total encaissé auprès de l'acheteur (objet + port) */
  grossReceived: Dec;
  feeBase: Dec;
  fees: FeeLine[];
  totalFees: Dec;
  /** ce qu'il reste après les frais eBay */
  netAfterFees: Dec;
  /** après frais eBay et coût réel d'envoi (null si coût d'envoi non saisi) */
  netAfterShipping: Dec | null;
  /** après achat (null si coût d'achat ou d'envoi non saisi) */
  profit: Dec | null;
  /** frais / encaissement × 100 */
  feesPercentOfGross: Dec | null;
  /** éléments non saisis (non déduits) */
  notEntered: string[];
}

type Field = Exclude<keyof EbayFeesInput, "feeOnShipping">;

export type EbayFeesComputation = { state: "empty" } | { state: "invalid"; errors: Partial<Record<Field, string>> } | { state: "ok"; result: EbayFeesResult };

const ERROR_TEXT: Record<ParseError | "range", string> = {
  empty: "Champ requis.",
  invalid: "Nombre invalide (ex. 12,50).",
  negative: "Valeur négative impossible.",
  too_large: "Valeur trop élevée.",
  range: "Pourcentage entre 0 et 100.",
};

const PERCENT: Field[] = ["finalValueFeePercent", "promotedPercent"];

export function evaluateEbayFees(input: EbayFeesInput): EbayFeesComputation {
  if (input.itemPrice.trim() === "") return { state: "empty" };
  const errors: Partial<Record<Field, string>> = {};
  const values: Partial<Record<Field, Dec | null>> = {};
  for (const key of Object.keys(EMPTY_EBAY_FEES) as (keyof EbayFeesInput)[]) {
    if (key === "feeOnShipping") continue;
    const text = input[key];
    if (text.trim() === "") {
      values[key] = null;
      continue;
    }
    const r = parseDecimal(text);
    if (!r.ok) errors[key] = ERROR_TEXT[r.error];
    else if (PERCENT.includes(key) && r.value.n > r.value.d * 100n) errors[key] = ERROR_TEXT.range;
    else values[key] = r.value;
  }
  if (Object.keys(errors).length > 0) return { state: "invalid", errors };

  const item = values.itemPrice as Dec;
  const shipping = values.shippingCharged ?? ZERO;
  const gross = add(item, shipping);
  const feeBase = input.feeOnShipping ? gross : item;
  const notEntered: string[] = [];
  const fees: FeeLine[] = [];
  if (values.finalValueFeePercent) fees.push({ label: `Commission sur la valeur finale${input.feeOnShipping ? " (objet + port)" : " (objet)"}`, amount: percentOf(feeBase, values.finalValueFeePercent) });
  else notEntered.push("commission sur la valeur finale");
  if (values.fixedFeePerOrder) fees.push({ label: "Frais fixes par commande", amount: values.fixedFeePerOrder });
  else notEntered.push("frais fixes par commande");
  if (values.promotedPercent) fees.push({ label: "Annonce sponsorisée", amount: percentOf(item, values.promotedPercent) });
  if (values.otherFees) fees.push({ label: "Autres frais", amount: values.otherFees });
  const totalFees = sum(fees.map((f) => f.amount));
  const netAfterFees = sub(gross, totalFees);
  const netAfterShipping = values.actualShippingCost ? sub(netAfterFees, values.actualShippingCost) : null;
  if (!values.actualShippingCost) notEntered.push("coût réel de l'envoi");
  const profit = netAfterShipping && values.purchaseCost ? sub(netAfterShipping, values.purchaseCost) : null;
  if (!values.purchaseCost) notEntered.push("coût d'achat");
  return {
    state: "ok",
    result: {
      grossReceived: gross,
      feeBase,
      fees,
      totalFees,
      netAfterFees,
      netAfterShipping,
      profit,
      feesPercentOfGross: gross.n === 0n ? null : percentOfRatio(totalFees, gross),
      notEntered,
    },
  };
}

/** (a ÷ b) × 100 */
function percentOfRatio(a: Dec, b: Dec): Dec {
  return div(mul(a, HUNDRED), b);
}

/** Réglages du canal eBay de l'organisation → champs préremplis (rien n'est inventé si vide). */
export function ebayFeesFromChannel(channel: { fee_percent: number | null; payment_fee_fixed: number | null } | null, base: EbayFeesInput = EMPTY_EBAY_FEES): { input: EbayFeesInput; prefilled: string[] } {
  if (!channel) return { input: base, prefilled: [] };
  const t = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
  const prefilled: string[] = [];
  if (channel.fee_percent !== null) prefilled.push("commission");
  if (channel.payment_fee_fixed !== null) prefilled.push("frais fixes");
  return { input: { ...base, finalValueFeePercent: t(channel.fee_percent), fixedFeePerOrder: t(channel.payment_fee_fixed) }, prefilled };
}
