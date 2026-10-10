import { computeUnitEconomics, EMPTY_COST_SETTINGS, type RadarCostSettings, type RadarLine, type SupplierOrigin, type UnitEconomics, type VatRegime } from "@/domain/sourcing/radar";
import { parseDecimal, toNumber, type ParseError } from "./decimal";

/**
 * Calculateur de marge et calculateur de prix de vente (« Mes outils »).
 *
 * Ils réutilisent `computeUnitEconomics`, le MÊME calcul que le radar d'opportunités : coût
 * d'achat rendu, TVA selon le régime, frais de vente, bénéfice. Un champ laissé vide n'est
 * jamais compté comme 0 : il est listé comme « non renseigné » et le résultat est une
 * estimation partielle.
 */

export interface ProfitFormInput {
  purchasePrice: string;
  purchaseBasis: "ht" | "ttc";
  /** transport fournisseur PAR UNITÉ */
  supplierShipping: string;
  origin: SupplierOrigin;
  vatRegime: VatRegime | null;
  vatRate: string;
  vatRecoverable: boolean | null;
  marketplaceFeePercent: string;
  paymentFeePercent: string;
  paymentFeeFixed: string;
  shippingToCustomer: string;
  packagingCost: string;
  returnProvisionPercent: string;
  importDutyPercent: string;
}

export const EMPTY_PROFIT_FORM: ProfitFormInput = {
  purchasePrice: "",
  purchaseBasis: "ht",
  supplierShipping: "",
  origin: "eu",
  vatRegime: null,
  vatRate: "",
  vatRecoverable: null,
  marketplaceFeePercent: "",
  paymentFeePercent: "",
  paymentFeeFixed: "",
  shippingToCustomer: "",
  packagingCost: "",
  returnProvisionPercent: "",
  importDutyPercent: "",
};

type NumericField = Exclude<keyof ProfitFormInput, "purchaseBasis" | "origin" | "vatRegime" | "vatRecoverable">;

const PERCENT_FIELDS = new Set<NumericField>(["vatRate", "marketplaceFeePercent", "paymentFeePercent", "returnProvisionPercent", "importDutyPercent"]);

export const PROFIT_FIELD_LABEL: Record<NumericField, string> = {
  purchasePrice: "Prix d'achat",
  supplierShipping: "Transport fournisseur (par unité)",
  vatRate: "Taux de TVA",
  marketplaceFeePercent: "Commission marketplace",
  paymentFeePercent: "Frais de paiement (%)",
  paymentFeeFixed: "Frais de paiement fixes",
  shippingToCustomer: "Expédition au client",
  packagingCost: "Emballage",
  returnProvisionPercent: "Provision retours / garantie",
  importDutyPercent: "Droits de douane",
};

export type FieldErrors = Partial<Record<NumericField | "salePrice" | "target", string>>;

const ERROR_TEXT: Record<ParseError | "range", string> = {
  empty: "Champ requis.",
  invalid: "Nombre invalide (ex. 12,50).",
  negative: "Valeur négative impossible.",
  too_large: "Valeur trop élevée.",
  range: "Pourcentage entre 0 et 100.",
};

/** Texte → nombre (null si vide), avec erreur par champ. */
function readField(text: string, percent: boolean): { value: number | null; error?: string } {
  if (text.trim() === "") return { value: null };
  const r = parseDecimal(text);
  if (!r.ok) return { value: null, error: ERROR_TEXT[r.error] };
  const n = toNumber(r.value, 6);
  if (percent && n > 100) return { value: null, error: ERROR_TEXT.range };
  return { value: n };
}

export interface ParsedProfitForm {
  purchasePrice: number | null;
  supplierShipping: number | null;
  settings: RadarCostSettings;
  errors: FieldErrors;
  /** champs saisis (affichés comme « données saisies ») */
  entered: { label: string; value: string }[];
}

export function parseProfitForm(f: ProfitFormInput): ParsedProfitForm {
  const errors: FieldErrors = {};
  const entered: { label: string; value: string }[] = [];
  const read = (key: NumericField): number | null => {
    const r = readField(f[key], PERCENT_FIELDS.has(key));
    if (r.error) errors[key] = r.error;
    else if (r.value !== null) entered.push({ label: PROFIT_FIELD_LABEL[key], value: `${f[key].trim()}${PERCENT_FIELDS.has(key) ? " %" : ""}` });
    return r.value;
  };
  const purchasePrice = read("purchasePrice");
  const supplierShipping = read("supplierShipping");
  const settings: RadarCostSettings = {
    ...EMPTY_COST_SETTINGS,
    vatRegime: f.vatRegime,
    vatRate: read("vatRate"),
    vatRecoverable: f.vatRecoverable,
    marketplaceFeePercent: read("marketplaceFeePercent"),
    paymentFeePercent: read("paymentFeePercent"),
    paymentFeeFixed: read("paymentFeeFixed"),
    shippingToCustomer: read("shippingToCustomer"),
    packagingCost: read("packagingCost"),
    returnProvisionPercent: read("returnProvisionPercent"),
    importDutyPercent: read("importDutyPercent"),
  };
  // Franchise en base de TVA : pas de TVA collectée ni récupérée → rien à demander.
  if (f.vatRegime === "franchise" && settings.vatRecoverable === null) settings.vatRecoverable = false;
  return { purchasePrice, supplierShipping, settings, errors, entered };
}

/** Réglages du radar (organisation) → valeurs de départ du formulaire (l'utilisateur peut tout modifier). */
export function profitFormFromSettings(s: RadarCostSettings, base: ProfitFormInput = EMPTY_PROFIT_FORM): ProfitFormInput {
  const t = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
  return {
    ...base,
    vatRegime: s.vatRegime,
    vatRate: t(s.vatRate),
    vatRecoverable: s.vatRecoverable,
    marketplaceFeePercent: t(s.marketplaceFeePercent),
    paymentFeePercent: t(s.paymentFeePercent),
    paymentFeeFixed: t(s.paymentFeeFixed),
    shippingToCustomer: t(s.shippingToCustomer),
    packagingCost: t(s.packagingCost),
    returnProvisionPercent: t(s.returnProvisionPercent),
    importDutyPercent: t(s.importDutyPercent),
  };
}

export interface ProfitResult {
  economics: UnitEconomics;
  /** bénéfice ÷ coût d'achat rendu × 100 */
  marginOnCostPercent: number | null;
  /** bénéfice ÷ CA hors TVA × 100 (taux de marque) */
  marginOnRevenuePercent: number | null;
  breakdown: RadarLine[];
  /** true si un coût manque : le bénéfice n'est qu'une estimation partielle */
  partial: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function economics(parsed: ParsedProfitForm, origin: SupplierOrigin, basis: "ht" | "ttc", salePrice: number): UnitEconomics {
  return computeUnitEconomics(
    { salePrice, saleLabel: "Prix de vente", purchasePrice: parsed.purchasePrice, purchaseTaxType: basis, supplierShipping: parsed.supplierShipping, moq: 1, supplierOrigin: origin, originLabel: null },
    parsed.settings,
  );
}

function rates(eco: UnitEconomics, sale: number): Pick<ProfitResult, "marginOnCostPercent" | "marginOnRevenuePercent"> {
  if (eco.estimatedProfit === null) return { marginOnCostPercent: null, marginOnRevenuePercent: null };
  const revenue = eco.revenueExVat ?? sale;
  return {
    marginOnCostPercent: eco.landedCost && eco.landedCost > 0 ? r2((eco.estimatedProfit / eco.landedCost) * 100) : null,
    marginOnRevenuePercent: revenue > 0 ? r2((eco.estimatedProfit / revenue) * 100) : null,
  };
}

export type ProfitComputation = { state: "empty" } | { state: "invalid"; errors: FieldErrors } | { state: "ok"; result: ProfitResult; entered: { label: string; value: string }[] };

/** Calculateur de marge : prix d'achat + prix de vente + frais → bénéfice et taux. */
export function evaluateProfit(f: ProfitFormInput, salePriceText: string): ProfitComputation {
  if (f.purchasePrice.trim() === "" || salePriceText.trim() === "") return { state: "empty" };
  const parsed = parseProfitForm(f);
  const sale = readField(salePriceText, false);
  if (sale.error) parsed.errors.salePrice = sale.error;
  if (Object.keys(parsed.errors).length > 0) return { state: "invalid", errors: parsed.errors };
  const salePrice = sale.value as number;
  const eco = economics(parsed, f.origin, f.purchaseBasis, salePrice);
  return {
    state: "ok",
    entered: [{ label: "Prix de vente", value: salePriceText.trim() }, ...parsed.entered],
    result: { economics: eco, ...rates(eco, salePrice), breakdown: eco.breakdown, partial: eco.missing.length > 0 },
  };
}

export type PriceTarget = { kind: "profit"; amount: string } | { kind: "margin_on_cost"; percent: string } | { kind: "margin_on_revenue"; percent: string };

export type SellingPriceComputation =
  | { state: "empty" }
  | { state: "invalid"; errors: FieldErrors }
  | { state: "impossible"; reason: string }
  | { state: "ok"; salePrice: number; result: ProfitResult; entered: { label: string; value: string }[] };

/**
 * Calculateur de prix de vente : prix de vente minimal (au centime supérieur) pour atteindre la
 * cible, en résolvant l'équation du radar, puis VÉRIFIÉ en rejouant le calcul du radar.
 */
export function solveSellingPrice(f: ProfitFormInput, target: PriceTarget): SellingPriceComputation {
  const targetText = target.kind === "profit" ? target.amount : target.percent;
  if (f.purchasePrice.trim() === "" || targetText.trim() === "") return { state: "empty" };
  const parsed = parseProfitForm(f);
  const t = readField(targetText, false);
  if (t.error) parsed.errors.target = t.error;
  if (target.kind === "margin_on_revenue" && t.value !== null && t.value >= 100) parsed.errors.target = "Le taux de marque doit être inférieur à 100 %.";
  if (Object.keys(parsed.errors).length > 0) return { state: "invalid", errors: parsed.errors };
  const s = parsed.settings;
  const tv = t.value as number;

  // Coût rendu (indépendant du prix de vente) et frais connus.
  const probe = economics(parsed, f.origin, f.purchaseBasis, 0);
  const L = probe.landedCost ?? 0;
  const pct = ((s.marketplaceFeePercent ?? 0) + (s.paymentFeePercent ?? 0) + (s.returnProvisionPercent ?? 0)) / 100;
  const F = (s.paymentFeeFixed ?? 0) + (s.shippingToCustomer ?? 0) + (s.packagingCost ?? 0);
  const v = s.vatRate;
  const regime = s.vatRegime === "normal" && v !== null ? "normal" : s.vatRegime === "margin" && v !== null ? "margin" : "none";
  const k = regime === "margin" ? (v as number) / (100 + (v as number)) : 0;
  const exVatFactor = regime === "normal" ? 1 / (1 + (v as number) / 100) : 1;

  let price: number;
  if (target.kind === "margin_on_revenue") {
    const m = tv / 100;
    const coef = regime === "margin" ? 1 - k - pct - m : exVatFactor * (1 - m) - pct;
    if (coef <= 0) return { state: "impossible", reason: "Les frais en pourcentage et le taux visé dépassent 100 % du prix : aucun prix ne permet d'atteindre cette cible." };
    price = (L + F - k * L) / coef;
  } else {
    const T = target.kind === "profit" ? tv : (tv / 100) * L;
    const coef = regime === "margin" ? 1 - k - pct : exVatFactor - pct;
    if (coef <= 0) return { state: "impossible", reason: "Les frais en pourcentage atteignent ou dépassent 100 % du prix : aucun prix ne permet d'atteindre cette cible." };
    price = (T + L + F - k * L) / coef;
  }
  // TVA sur marge : formule valable si le prix dépasse le coût (sinon pas de TVA sur marge).
  if (regime === "margin" && price <= L) price = target.kind === "margin_on_revenue" ? (L + F) / (1 - pct - tv / 100) : (L + F + (target.kind === "profit" ? tv : (tv / 100) * L)) / (1 - pct);

  let sale = Math.ceil(Math.round(price * 1e6) / 1e4) / 100;
  // Vérification avec le calcul du radar (arrondis au centime) : on remonte d'un centime si besoin.
  const reached = (eco: UnitEconomics, salePrice: number) => {
    if (eco.estimatedProfit === null) return false;
    if (target.kind === "profit") return eco.estimatedProfit >= tv - 1e-9;
    const r = rates(eco, salePrice);
    return target.kind === "margin_on_cost" ? (r.marginOnCostPercent ?? -Infinity) >= tv - 0.005 : (r.marginOnRevenuePercent ?? -Infinity) >= tv - 0.005;
  };
  let eco = economics(parsed, f.origin, f.purchaseBasis, sale);
  for (let i = 0; i < 5 && !reached(eco, sale); i++) {
    sale = r2(sale + 0.01);
    eco = economics(parsed, f.origin, f.purchaseBasis, sale);
  }
  const label = target.kind === "profit" ? "Bénéfice visé" : target.kind === "margin_on_cost" ? "Taux de marge visé" : "Taux de marque visé";
  return {
    state: "ok",
    salePrice: sale,
    entered: [{ label, value: `${targetText.trim()}${target.kind === "profit" ? "" : " %"}` }, ...parsed.entered],
    result: { economics: eco, ...rates(eco, sale), breakdown: eco.breakdown, partial: eco.missing.length > 0 },
  };
}
