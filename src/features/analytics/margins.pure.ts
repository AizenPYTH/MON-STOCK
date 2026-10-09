/**
 * Marges par canal et agrégation honnête : un SKU dont le coût est inconnu est EXCLU du total
 * (jamais compté à 0) et le nombre d'exclusions est toujours rendu visible.
 */
import { computeMargin, UNKNOWN_COST_LABEL, type MarginResult, type UnknownCost } from "@/domain/pricing/margin";
import type { MarginContext } from "@/features/stock/model";

export interface ChannelFeesLike {
  provider: string;
  name: string;
  fee_percent: number | null;
  payment_fee_percent: number | null;
  payment_fee_fixed: number | null;
  default_shipping_cost: number | null;
}

/** Contexte de marge d'UN canal (frais NULL = inconnus). Le transport peut venir des réglages de l'organisation. */
export function channelMarginContext(channel: ChannelFeesLike | null, orgSettings: unknown): MarginContext {
  const settings = (orgSettings ?? {}) as { default_shipping_cost?: unknown };
  const orgShipping = typeof settings.default_shipping_cost === "number" && Number.isFinite(settings.default_shipping_cost) ? settings.default_shipping_cost : null;
  return {
    feePercent: channel?.fee_percent ?? null,
    paymentFeePercent: channel?.payment_fee_percent ?? null,
    paymentFeeFixed: channel?.payment_fee_fixed ?? null,
    shippingCost: channel?.default_shipping_cost ?? orgShipping,
  };
}

/** Frais manquants dans un contexte de marge (pour inviter l'utilisateur à les renseigner). */
export function missingChannelFees(ctx: MarginContext): UnknownCost[] {
  const missing: UnknownCost[] = [];
  if (ctx.feePercent === null) missing.push("marketplace_fee");
  if (ctx.paymentFeePercent === null && ctx.paymentFeeFixed === null) missing.push("payment_fee");
  if (ctx.shippingCost === null) missing.push("shipping");
  return missing;
}

export type SalePriceSource = "sku_price" | "avg_30d" | null;

export interface MarginLineInput {
  sku_id: string | null;
  code: string | null;
  product_name: string | null;
  variant_name: string | null;
  currency: string | null;
  sale_price: number | null;
  avg_sale_price_30d: number | null;
  cost_price: number | null;
  units_30d: number | null;
  revenue_30d: number | null;
  quantity_on_hand: number | null;
  /** unités vendues sur 30 j dans une autre devise que celle du SKU (CA non compté) */
  foreign_currency_units_30d?: number | null;
}

export interface MarginLine {
  skuId: string;
  code: string;
  name: string;
  currency: string;
  salePrice: number | null;
  salePriceSource: SalePriceSource;
  costPrice: number | null;
  units30d: number;
  revenue30d: number;
  quantityOnHand: number;
  foreignCurrencyUnits30d: number;
  margin: MarginResult;
  /** units30d × bénéfice net unitaire ; null si le coût ou le prix est inconnu */
  profit30d: number | null;
}

export function buildMarginLine(row: MarginLineInput, ctx: MarginContext): MarginLine {
  const salePriceSource: SalePriceSource = row.sale_price !== null ? "sku_price" : row.avg_sale_price_30d !== null ? "avg_30d" : null;
  const salePrice = row.sale_price ?? row.avg_sale_price_30d ?? null;
  const margin = computeMargin({
    salePrice,
    costPrice: row.cost_price,
    feePercent: ctx.feePercent,
    paymentFeePercent: ctx.paymentFeePercent,
    paymentFeeFixed: ctx.paymentFeeFixed,
    shippingCost: ctx.shippingCost,
  });
  const units30d = row.units_30d ?? 0;
  const variant = row.variant_name && row.variant_name !== "Standard" ? ` · ${row.variant_name}` : "";
  return {
    skuId: row.sku_id ?? "",
    code: row.code ?? "",
    name: `${row.product_name ?? ""}${variant}`,
    currency: row.currency ?? "EUR",
    salePrice,
    salePriceSource,
    costPrice: row.cost_price,
    units30d,
    revenue30d: Number(row.revenue_30d ?? 0),
    quantityOnHand: row.quantity_on_hand ?? 0,
    foreignCurrencyUnits30d: row.foreign_currency_units_30d ?? 0,
    margin,
    profit30d: margin.netProfit === null ? null : Math.round(margin.netProfit * units30d * 100) / 100,
  };
}

export interface MarginAggregate {
  lines: number;
  /** SKU dont le bénéfice a pu être calculé (prix de vente ET coût connus) */
  included: number;
  excludedUnknownCost: number;
  excludedUnknownSalePrice: number;
  /** SKU dans une autre devise que celle de l'organisation : exclus des montants (jamais additionnés) */
  excludedOtherCurrency: number;
  /** unités vendues dans une autre devise (CA non inclus dans revenue30d) */
  foreignCurrencyUnits30d: number;
  /** unités vendues sur 30 j par les SKU dont le CA est compté (même périmètre que revenue30d) */
  units30d: number;
  /** unités vendues sur 30 j par les SKU exclus car dans une autre devise (non comptées dans units30d) */
  unitsOtherCurrency30d: number;
  /** unités vendues sur 30 j par les SKU inclus */
  unitsIncluded: number;
  revenue30d: number;
  /** Σ units30d × bénéfice net (SKU inclus uniquement) ; null si aucun SKU n'est calculable */
  profit30d: number | null;
  /** frais non déduits dans l'estimation (contexte de marge incomplet) */
  missingFees: UnknownCost[];
  caveat: string | null;
}

export function aggregateMargins(lines: readonly MarginLine[], currency?: string): MarginAggregate {
  let included = 0;
  let excludedUnknownCost = 0;
  let excludedUnknownSalePrice = 0;
  let excludedOtherCurrency = 0;
  let foreignCurrencyUnits30d = 0;
  let units30d = 0;
  let unitsOtherCurrency30d = 0;
  let unitsIncluded = 0;
  let revenue30d = 0;
  let profit = 0;
  const missing = new Set<UnknownCost>();
  for (const l of lines) {
    if (currency && l.currency.toUpperCase() !== currency.toUpperCase()) {
      excludedOtherCurrency++;
      unitsOtherCurrency30d += l.units30d;
      continue;
    }
    // Unités et CA sur le même périmètre : un SKU dans une autre devise n'entre dans aucun des deux.
    units30d += l.units30d;
    revenue30d += l.revenue30d;
    foreignCurrencyUnits30d += l.foreignCurrencyUnits30d;
    if (l.costPrice === null) {
      excludedUnknownCost++;
      continue;
    }
    if (l.salePrice === null) {
      excludedUnknownSalePrice++;
      continue;
    }
    included++;
    unitsIncluded += l.units30d;
    profit += l.profit30d ?? 0;
    for (const u of l.margin.unknownCosts) if (u !== "cost_price" && u !== "sale_price") missing.add(u);
  }
  const missingFees = Array.from(missing);
  const parts: string[] = [];
  if (excludedUnknownCost > 0) parts.push(`${excludedUnknownCost} SKU exclu${excludedUnknownCost > 1 ? "s" : ""} : coût inconnu`);
  if (excludedUnknownSalePrice > 0) parts.push(`${excludedUnknownSalePrice} SKU exclu${excludedUnknownSalePrice > 1 ? "s" : ""} : prix de vente inconnu`);
  if (excludedOtherCurrency > 0) parts.push(`${excludedOtherCurrency} SKU exclu${excludedOtherCurrency > 1 ? "s" : ""} : autre devise`);
  if (foreignCurrencyUnits30d > 0) parts.push(`CA de ${foreignCurrencyUnits30d} unité${foreignCurrencyUnits30d > 1 ? "s" : ""} vendue${foreignCurrencyUnits30d > 1 ? "s" : ""} dans une autre devise non compté`);
  if (missingFees.length > 0) parts.push(`non déduit${missingFees.length > 1 ? "s" : ""} : ${missingFees.map((u) => UNKNOWN_COST_LABEL[u]).join(", ")}`);
  return {
    lines: lines.length,
    included,
    excludedUnknownCost,
    excludedUnknownSalePrice,
    excludedOtherCurrency,
    foreignCurrencyUnits30d,
    units30d,
    unitsOtherCurrency30d,
    unitsIncluded,
    revenue30d: Math.round(revenue30d * 100) / 100,
    profit30d: included > 0 ? Math.round(profit * 100) / 100 : null,
    missingFees,
    caveat: parts.length > 0 ? parts.join(" · ") : null,
  };
}

export const MARGIN_SORTS = ["profit_total", "net_margin", "gross_margin", "units", "name"] as const;
export type MarginSort = (typeof MARGIN_SORTS)[number];

/** Tri : les lignes non calculables vont toujours en fin de liste. */
export function sortMarginLines(lines: MarginLine[], sort: MarginSort): MarginLine[] {
  const nullsLast = (a: number | null, b: number | null, desc = true): number => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return desc ? b - a : a - b;
  };
  const byName = (a: MarginLine, b: MarginLine) => a.name.localeCompare(b.name, "fr") || a.code.localeCompare(b.code, "fr");
  return [...lines].sort((a, b) => {
    switch (sort) {
      case "net_margin":
        return nullsLast(a.margin.netMarginPercent, b.margin.netMarginPercent) || byName(a, b);
      case "gross_margin":
        return nullsLast(a.margin.grossMarginPercent, b.margin.grossMarginPercent) || byName(a, b);
      case "units":
        return b.units30d - a.units30d || byName(a, b);
      case "name":
        return byName(a, b);
      case "profit_total":
      default:
        return nullsLast(a.profit30d, b.profit30d) || b.units30d - a.units30d || byName(a, b);
    }
  });
}
