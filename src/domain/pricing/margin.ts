/**
 * MarginService — calcul de marge honnête : un coût inconnu n'est jamais supposé nul.
 *
 * bénéfice = prix de vente − prix d'achat − frais marketplace − frais paiement − transport − autres
 */
export interface MarginInput {
  salePrice: number | null;
  costPrice: number | null;
  /** commission marketplace en % du prix de vente (null = inconnue) */
  feePercent: number | null;
  /** frais de paiement en % (null = inconnu) */
  paymentFeePercent: number | null;
  /** frais de paiement fixes par commande (null = inconnu) */
  paymentFeeFixed: number | null;
  /** transport par unité (null = inconnu) */
  shippingCost: number | null;
  /** autres coûts connus par unité (0 si aucun) */
  otherCosts?: number;
}

export type UnknownCost = "sale_price" | "cost_price" | "marketplace_fee" | "payment_fee" | "shipping";

export interface MarginResult {
  /** prix de vente − prix d'achat (null si l'un des deux est inconnu) */
  grossMargin: number | null;
  grossMarginPercent: number | null;
  /** frais connus déduits */
  marketplaceFee: number | null;
  paymentFee: number | null;
  shippingCost: number | null;
  otherCosts: number;
  /** bénéfice net estimé (null si un coût essentiel manque) */
  netProfit: number | null;
  netMarginPercent: number | null;
  /** coût total connu (achat + frais connus) */
  totalKnownCost: number | null;
  unknownCosts: UnknownCost[];
  /** true si tous les coûts sont connus */
  complete: boolean;
  /** impact : ce que le bénéfice ignore encore */
  caveat: string | null;
}

export const UNKNOWN_COST_LABEL: Record<UnknownCost, string> = {
  sale_price: "prix de vente",
  cost_price: "prix d'achat",
  marketplace_fee: "commission marketplace",
  payment_fee: "frais de paiement",
  shipping: "transport",
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeMargin(input: MarginInput): MarginResult {
  const unknown: UnknownCost[] = [];
  const otherCosts = input.otherCosts ?? 0;

  if (input.salePrice === null) unknown.push("sale_price");
  if (input.costPrice === null) unknown.push("cost_price");

  const grossMargin = input.salePrice !== null && input.costPrice !== null ? round2(input.salePrice - input.costPrice) : null;
  const grossMarginPercent = grossMargin !== null && input.salePrice && input.salePrice > 0 ? round2((grossMargin / input.salePrice) * 100) : null;

  const marketplaceFee = input.salePrice !== null && input.feePercent !== null ? round2((input.salePrice * input.feePercent) / 100) : null;
  if (input.feePercent === null) unknown.push("marketplace_fee");

  let paymentFee: number | null = null;
  if (input.salePrice !== null && (input.paymentFeePercent !== null || input.paymentFeeFixed !== null)) {
    paymentFee = round2((input.salePrice * (input.paymentFeePercent ?? 0)) / 100 + (input.paymentFeeFixed ?? 0));
  }
  if (input.paymentFeePercent === null && input.paymentFeeFixed === null) unknown.push("payment_fee");

  const shippingCost = input.shippingCost;
  if (shippingCost === null) unknown.push("shipping");

  const complete = unknown.length === 0;

  // Le bénéfice net n'est calculé que si prix de vente ET prix d'achat sont connus ;
  // les frais inconnus sont alors explicitement listés comme non déduits.
  let netProfit: number | null = null;
  let netMarginPercent: number | null = null;
  let totalKnownCost: number | null = null;
  if (grossMargin !== null && input.salePrice !== null && input.costPrice !== null) {
    const knownFees = (marketplaceFee ?? 0) + (paymentFee ?? 0) + (shippingCost ?? 0) + otherCosts;
    totalKnownCost = round2(input.costPrice + knownFees);
    netProfit = round2(input.salePrice - totalKnownCost);
    netMarginPercent = input.salePrice > 0 ? round2((netProfit / input.salePrice) * 100) : null;
  }

  const missingFees = unknown.filter((u) => u !== "sale_price" && u !== "cost_price");
  let caveat: string | null = null;
  if (unknown.includes("cost_price")) caveat = "Coût d'achat inconnu : impossible de calculer une marge.";
  else if (unknown.includes("sale_price")) caveat = "Prix de vente inconnu : impossible de calculer une marge.";
  else if (missingFees.length > 0) caveat = `Estimation partielle : ${missingFees.map((u) => UNKNOWN_COST_LABEL[u]).join(", ")} non déduit(s).`;

  return {
    grossMargin,
    grossMarginPercent,
    marketplaceFee,
    paymentFee,
    shippingCost,
    otherCosts,
    netProfit,
    netMarginPercent,
    totalKnownCost,
    unknownCosts: unknown,
    complete,
    caveat,
  };
}

/** Coût rendu estimé d'une offre fournisseur (prix + transport + frais connus). */
export interface LandedCostInput {
  unitPrice: number;
  quantity: number;
  shippingCost: number | null;
  /** frais d'import ou autres frais connus pour la commande entière (null = inconnu) */
  importFees: number | null;
  otherFees?: number;
}

export interface LandedCostResult {
  unitLandedCost: number | null;
  totalLandedCost: number | null;
  determinable: boolean;
  unknown: Array<"shipping" | "import_fees">;
}

export function computeLandedCost(input: LandedCostInput): LandedCostResult {
  const unknown: Array<"shipping" | "import_fees"> = [];
  if (input.shippingCost === null) unknown.push("shipping");
  if (input.importFees === null) unknown.push("import_fees");
  const qty = Math.max(1, input.quantity);
  if (input.shippingCost === null) {
    return { unitLandedCost: null, totalLandedCost: null, determinable: false, unknown };
  }
  const total = input.unitPrice * qty + input.shippingCost + (input.importFees ?? 0) + (input.otherFees ?? 0);
  return { unitLandedCost: round2(total / qty), totalLandedCost: round2(total), determinable: unknown.length === 0, unknown };
}
