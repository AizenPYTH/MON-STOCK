/**
 * RADAR D'OPPORTUNITÉS D'ACHAT — calcul économique complet et honnête (module pur, partagé).
 *
 * Pour une offre fournisseur rapprochée d'un SKU que vous vendez :
 *   coût d'achat rendu = prix d'achat (HT si la TVA est récupérable, sinon payé)
 *                        + transport fournisseur réparti sur la quantité minimale
 *                        + droits de douane (hors UE)
 *   chiffre d'affaires = prix de vente réellement constaté (moyenne 30 j) ou prix de vente du SKU
 *   marge brute        = CA hors TVA − coût d'achat rendu
 *   bénéfice estimé    = marge brute − commission marketplace − frais de paiement
 *                        − expédition client − emballage − provision retours/garantie
 *
 * Règles : un coût inconnu n'est JAMAIS supposé nul — il est listé dans `missing` et le
 * bénéfice devient une estimation partielle ; la TVA n'est jamais supposée récupérable ; un prix
 * ancien ou non vérifié est signalé ; aucune décision n'est prise à la place de l'utilisateur.
 */

export type VatRegime = "normal" | "margin" | "franchise";

/** Paramètres de coûts de l'organisation (null = inconnu, jamais 0 par défaut). */
export interface RadarCostSettings {
  vatRegime: VatRegime | null;
  /** taux de TVA en % (20 en France) */
  vatRate: number | null;
  /** la TVA payée aux fournisseurs est-elle récupérable (régime normal, facture avec TVA) */
  vatRecoverable: boolean | null;
  marketplaceFeePercent: number | null;
  paymentFeePercent: number | null;
  paymentFeeFixed: number | null;
  /** expédition au client, par unité */
  shippingToCustomer: number | null;
  /** emballage, par unité */
  packagingCost: number | null;
  /** provision retours / garantie / remise en état, en % du prix de vente */
  returnProvisionPercent: number | null;
  /** droits de douane et frais d'import pour un achat hors UE, en % du prix d'achat */
  importDutyPercent: number | null;
}

export const EMPTY_COST_SETTINGS: RadarCostSettings = {
  vatRegime: null,
  vatRate: null,
  vatRecoverable: null,
  marketplaceFeePercent: null,
  paymentFeePercent: null,
  paymentFeeFixed: null,
  shippingToCustomer: null,
  packagingCost: null,
  returnProvisionPercent: null,
  importDutyPercent: null,
};

/** Origine du prix fournisseur (la plus précise connue). */
export type PriceOrigin = "verified_live" | "observed_public" | "catalog_import" | "supplier_communicated" | "manual_entry" | "unknown";

export const PRICE_ORIGIN_LABEL: Record<PriceOrigin, string> = {
  verified_live: "Prix vérifié à la dernière interrogation",
  observed_public: "Prix observé sur le site du fournisseur",
  catalog_import: "Prix importé d'un catalogue fournisseur",
  supplier_communicated: "Prix communiqué par le fournisseur",
  manual_entry: "Prix saisi manuellement",
  unknown: "Origine du prix inconnue",
};

export type Freshness = "fresh" | "recent" | "stale" | "unknown";

export interface RadarOfferInput {
  offerId: string;
  supplierName: string;
  supplierCountry: string | null;
  title: string;
  sourceUrl: string | null;
  price: number | null;
  currency: string | null;
  taxType: "ht" | "ttc" | "unknown";
  shippingCost: number | null;
  moq: number | null;
  availableQuantity: number | null;
  stockStatus: "in_stock" | "low" | "out_of_stock" | "unknown";
  lastSeenAt: string | null;
  priceOrigin: PriceOrigin;
  /** prix précédent (historique), pour signaler une baisse */
  previousPrice: number | null;
  saved: boolean;
}

export interface RadarSkuInput {
  skuId: string;
  code: string;
  name: string;
  currency: string;
  /** prix de vente moyen réellement constaté sur 30 jours */
  avgSalePrice30d: number | null;
  /** prix de vente renseigné sur le SKU */
  salePrice: number | null;
  /** coût d'achat actuel renseigné sur le SKU */
  currentCost: number | null;
  units30d: number;
  quantityAvailable: number;
  reorderPoint: number | null;
}

export type RadarStatus = "profitable" | "estimated" | "unprofitable" | "insufficient_data";

export interface RadarLine {
  label: string;
  amount: number | null;
}

export interface RadarEvaluation {
  status: RadarStatus;
  /** CA unitaire retenu (prix de vente) */
  revenue: number | null;
  revenueBasis: "avg_sale_30d" | "sku_sale_price" | null;
  revenueExVat: number | null;
  purchaseCost: number | null;
  landedCost: number | null;
  grossMargin: number | null;
  /** bénéfice estimé avec les coûts CONNUS uniquement */
  estimatedProfit: number | null;
  marginPercent: number | null;
  /** détail affichable du calcul */
  breakdown: RadarLine[];
  /** coûts / données manquants (le bénéfice ne les déduit pas) */
  missing: string[];
  /** réserves sur la qualité des données */
  cautions: string[];
  /** pourquoi l'offre est intéressante (ou pas) */
  reasons: string[];
  freshness: Freshness;
  ageDays: number | null;
  /** score de tri 0..100 (bénéfice, marge, disponibilité, qualité des données) */
  score: number;
}

const EU = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);

export const FRESH_DAYS = 2;
export const STALE_DAYS = 7;

const r2 = (n: number) => Math.round(n * 100) / 100;

export function freshnessOf(lastSeenAt: string | null, now: Date): { freshness: Freshness; ageDays: number | null } {
  if (!lastSeenAt) return { freshness: "unknown", ageDays: null };
  const t = new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return { freshness: "unknown", ageDays: null };
  const ageDays = Math.max(0, (now.getTime() - t) / 86_400_000);
  return { freshness: ageDays <= FRESH_DAYS ? "fresh" : ageDays <= STALE_DAYS ? "recent" : "stale", ageDays: Math.floor(ageDays) };
}

export function evaluateRadarOffer(offer: RadarOfferInput, sku: RadarSkuInput, s: RadarCostSettings, now: Date = new Date()): RadarEvaluation {
  const missing: string[] = [];
  const cautions: string[] = [];
  const reasons: string[] = [];
  const breakdown: RadarLine[] = [];
  const { freshness, ageDays } = freshnessOf(offer.lastSeenAt, now);

  // --- prix de vente (jamais inventé)
  const revenueBasis = sku.avgSalePrice30d !== null ? "avg_sale_30d" : sku.salePrice !== null ? "sku_sale_price" : null;
  const revenue = sku.avgSalePrice30d ?? sku.salePrice ?? null;
  if (revenue === null) missing.push("prix de vente (aucune vente sur 30 jours et aucun prix de vente sur le SKU)");
  if (revenueBasis === "sku_sale_price") cautions.push("Prix de vente issu de la fiche SKU (pas de vente constatée sur 30 jours).");

  // --- prix d'achat
  if (offer.price === null) missing.push("prix fournisseur");
  if (offer.currency && sku.currency && offer.currency.toUpperCase() !== sku.currency.toUpperCase()) {
    missing.push(`devise différente (${offer.currency} vs ${sku.currency}) : aucune conversion supposée`);
  }
  if (missing.length > 0) {
    return { status: "insufficient_data", revenue, revenueBasis, revenueExVat: null, purchaseCost: null, landedCost: null, grossMargin: null, estimatedProfit: null, marginPercent: null, breakdown, missing, cautions, reasons, freshness, ageDays, score: 0 };
  }
  const price = offer.price as number;
  const sale = revenue as number;
  const country = offer.supplierCountry?.toUpperCase() ?? null;
  const eco = computeUnitEconomics(
    {
      salePrice: sale,
      saleLabel: revenueBasis === "avg_sale_30d" ? "Prix de vente moyen constaté (30 j)" : "Prix de vente du SKU",
      purchasePrice: price,
      purchaseTaxType: offer.taxType,
      supplierShipping: offer.shippingCost,
      moq: offer.moq,
      supplierOrigin: country ? (EU.has(country) ? "eu" : "non_eu") : "unknown",
      originLabel: country,
    },
    s,
  );
  missing.push(...eco.missing);
  cautions.push(...eco.cautions);
  breakdown.push(...eco.breakdown);
  const { purchaseCost, landedCost: landed, revenueExVat, grossMargin } = eco;
  const estimatedProfit = eco.estimatedProfit as number;
  const marginPercent = eco.marginPercent;

  // qualité des données
  if (freshness === "stale") cautions.push(`Prix vu il y a ${ageDays} jours : à revérifier avant de commander.`);
  if (freshness === "unknown") cautions.push("Date de relevé du prix inconnue.");
  if (offer.priceOrigin !== "verified_live") cautions.push(PRICE_ORIGIN_LABEL[offer.priceOrigin] + ".");
  if (offer.stockStatus === "unknown" && offer.availableQuantity === null) cautions.push("Disponibilité non communiquée.");
  if (offer.stockStatus === "out_of_stock" || offer.availableQuantity === 0) cautions.push("Rupture chez le fournisseur.");

  // raisons
  if (sku.currentCost !== null && sku.currentCost > 0 && purchaseCost !== null && purchaseCost < sku.currentCost) {
    const pct = Math.round(((sku.currentCost - purchaseCost) / sku.currentCost) * 100);
    if (pct >= 3) reasons.push(`Prix ${pct} % sous votre coût d'achat actuel (${sku.currentCost.toFixed(2)}).`);
  }
  if (offer.previousPrice !== null && offer.previousPrice > price) {
    const pct = Math.round(((offer.previousPrice - price) / offer.previousPrice) * 100);
    if (pct >= 5) reasons.push(`Prix en baisse de ${pct} % chez ce fournisseur.`);
  }
  const lowStock = sku.quantityAvailable <= Math.max(sku.reorderPoint ?? 0, 1);
  if (sku.units30d > 0 && lowStock) reasons.push(`Stock bas (${sku.quantityAvailable}) pour un produit vendu ${sku.units30d} fois en 30 jours.`);
  else if (sku.units30d > 0) reasons.push(`Vous en vendez ${sku.units30d} par mois.`);
  if (estimatedProfit > 0 && marginPercent !== null) reasons.push(`Bénéfice estimé ${estimatedProfit.toFixed(2)} par unité (${marginPercent} %).`);

  const status: RadarStatus = estimatedProfit <= 0 ? "unprofitable" : missing.length === 0 && freshness !== "stale" ? "profitable" : "estimated";

  // score : bénéfice et marge d'abord, puis rotation, disponibilité et qualité des données
  let score = 0;
  if (estimatedProfit > 0) {
    score += Math.min(40, estimatedProfit / 2);
    score += Math.min(20, Math.max(0, marginPercent ?? 0) / 2);
  }
  score += Math.min(15, sku.units30d * 2);
  if (offer.stockStatus === "in_stock" || (offer.availableQuantity ?? 0) > 0) score += 10;
  score += freshness === "fresh" ? 10 : freshness === "recent" ? 6 : 0;
  score += missing.length === 0 ? 5 : Math.max(0, 5 - missing.length);
  return { status, revenue: sale, revenueBasis, revenueExVat, purchaseCost, landedCost: landed, grossMargin, estimatedProfit, marginPercent, breakdown, missing, cautions, reasons, freshness, ageDays, score: Math.round(Math.min(100, score)) };
}

export type SupplierOrigin = "eu" | "non_eu" | "unknown";

export interface UnitEconomicsInput {
  /** prix de vente unitaire (TTC en régime normal, prix encaissé en marge / franchise) */
  salePrice: number | null;
  saleLabel: string;
  purchasePrice: number | null;
  purchaseTaxType: "ht" | "ttc" | "unknown";
  /** transport fournisseur pour la commande minimale (réparti sur `moq`) */
  supplierShipping: number | null;
  moq: number | null;
  supplierOrigin: SupplierOrigin;
  /** code pays affiché dans les messages (douane) */
  originLabel?: string | null;
}

export interface UnitEconomics {
  revenueExVat: number | null;
  purchaseCost: number | null;
  landedCost: number | null;
  grossMargin: number | null;
  /** bénéfice avec les coûts CONNUS uniquement */
  estimatedProfit: number | null;
  marginPercent: number | null;
  /** total des frais de vente connus */
  sellingFees: number | null;
  breakdown: RadarLine[];
  missing: string[];
  cautions: string[];
}

/**
 * Économie unitaire d'une vente (partagée par le radar et « Mes outils ») : coût d'achat rendu,
 * CA hors TVA selon le régime, marge brute, frais de vente, bénéfice. Un coût inconnu n'est
 * jamais supposé nul : il est listé dans `missing` et n'est pas déduit.
 */
export function computeUnitEconomics(input: UnitEconomicsInput, s: RadarCostSettings): UnitEconomics {
  const missing: string[] = [];
  const cautions: string[] = [];
  const breakdown: RadarLine[] = [];
  if (input.salePrice === null || input.purchasePrice === null) {
    if (input.salePrice === null) missing.push("prix de vente");
    if (input.purchasePrice === null) missing.push("prix d'achat");
    return { revenueExVat: null, purchaseCost: null, landedCost: null, grossMargin: null, estimatedProfit: null, marginPercent: null, sellingFees: null, breakdown, missing, cautions };
  }
  const price = input.purchasePrice;
  const sale = input.salePrice;
  const vatRate = s.vatRate;

  // TVA sur l'achat : récupérable uniquement si déclarée récupérable (régime normal)
  let purchaseCost: number;
  if (input.purchaseTaxType === "ht") {
    if (s.vatRecoverable === true) purchaseCost = price;
    else if (s.vatRecoverable === false && vatRate !== null) {
      purchaseCost = r2(price * (1 + vatRate / 100));
      cautions.push("TVA non récupérable : TVA ajoutée au prix d'achat HT.");
    } else {
      purchaseCost = price;
      missing.push("récupération de la TVA sur achats (paramètres de coûts)");
    }
  } else if (input.purchaseTaxType === "ttc") {
    if (s.vatRecoverable === true && vatRate !== null) purchaseCost = r2(price / (1 + vatRate / 100));
    else {
      purchaseCost = price;
      if (s.vatRecoverable === null) missing.push("récupération de la TVA sur achats (paramètres de coûts)");
    }
  } else {
    purchaseCost = price;
    missing.push("type de prix fournisseur (HT ou TTC)");
  }
  breakdown.push({ label: "Prix d'achat retenu", amount: purchaseCost });

  // transport fournisseur
  let landed = purchaseCost;
  if (input.supplierShipping !== null) {
    const perUnit = r2(input.supplierShipping / Math.max(1, input.moq ?? 1));
    landed = r2(landed + perUnit);
    breakdown.push({ label: `Transport fournisseur (÷ ${Math.max(1, input.moq ?? 1)})`, amount: perUnit });
  } else missing.push("transport fournisseur");

  // douane
  if (input.supplierOrigin === "non_eu") {
    if (s.importDutyPercent !== null) {
      const duty = r2((price * s.importDutyPercent) / 100);
      landed = r2(landed + duty);
      breakdown.push({ label: `Douane / import (${s.importDutyPercent} %)`, amount: duty });
    } else missing.push(`droits de douane (fournisseur hors UE${input.originLabel ? ` : ${input.originLabel}` : ""})`);
  } else if (input.supplierOrigin === "unknown") cautions.push("Pays du fournisseur inconnu : frais d'import éventuels non évalués.");
  breakdown.push({ label: "Coût d'achat rendu", amount: landed });

  // CA hors TVA selon le régime
  let revenueExVat: number | null = null;
  let marginVat = 0;
  if (s.vatRegime === "normal") {
    if (vatRate !== null) revenueExVat = r2(sale / (1 + vatRate / 100));
    else missing.push("taux de TVA");
  } else if (s.vatRegime === "margin") {
    revenueExVat = sale;
    if (vatRate !== null) {
      const m = sale - landed;
      marginVat = m > 0 ? r2((m * vatRate) / (100 + vatRate)) : 0;
    } else missing.push("taux de TVA");
  } else if (s.vatRegime === "franchise") revenueExVat = sale;
  else missing.push("régime de TVA (normal, marge ou franchise)");
  const base = revenueExVat ?? sale;
  breakdown.unshift({ label: input.saleLabel, amount: sale });
  if (revenueExVat !== null && revenueExVat !== sale) breakdown.splice(1, 0, { label: "CA hors TVA", amount: revenueExVat });

  const grossMargin = r2(base - landed - marginVat);
  if (marginVat > 0) breakdown.push({ label: "TVA sur marge", amount: marginVat });
  breakdown.push({ label: "Marge brute", amount: grossMargin });

  // frais de vente
  let fees = 0;
  const fee = (label: string, value: number | null, missingLabel: string) => {
    if (value === null) missing.push(missingLabel);
    else {
      fees += value;
      breakdown.push({ label, amount: r2(value) });
    }
  };
  fee("Commission marketplace", s.marketplaceFeePercent === null ? null : (sale * s.marketplaceFeePercent) / 100, "commission marketplace");
  fee(
    "Frais de paiement",
    s.paymentFeePercent === null && s.paymentFeeFixed === null ? null : (sale * (s.paymentFeePercent ?? 0)) / 100 + (s.paymentFeeFixed ?? 0),
    "frais de paiement",
  );
  fee("Expédition au client", s.shippingToCustomer, "expédition au client");
  fee("Emballage", s.packagingCost, "emballage");
  fee("Provision retours / garantie", s.returnProvisionPercent === null ? null : (sale * s.returnProvisionPercent) / 100, "provision retours / garantie");

  const estimatedProfit = r2(grossMargin - fees);
  const marginPercent = sale > 0 ? r2((estimatedProfit / sale) * 100) : null;
  breakdown.push({ label: missing.length ? "Bénéfice estimé (coûts connus seulement)" : "Bénéfice estimé", amount: estimatedProfit });
  return { revenueExVat, purchaseCost, landedCost: landed, grossMargin, estimatedProfit, marginPercent, sellingFees: r2(fees), breakdown, missing, cautions };
}

export type RadarSort = "score" | "profit" | "margin" | "availability" | "freshness";

const STATUS_ORDER: Record<RadarStatus, number> = { profitable: 0, estimated: 1, unprofitable: 2, insufficient_data: 3 };

export function compareRadar(sort: RadarSort) {
  return (a: { evaluation: RadarEvaluation; offer: Pick<RadarOfferInput, "availableQuantity" | "stockStatus"> }, b: { evaluation: RadarEvaluation; offer: Pick<RadarOfferInput, "availableQuantity" | "stockStatus"> }): number => {
    const st = STATUS_ORDER[a.evaluation.status] - STATUS_ORDER[b.evaluation.status];
    const n = (v: number | null | undefined) => v ?? Number.NEGATIVE_INFINITY;
    switch (sort) {
      case "profit":
        return n(b.evaluation.estimatedProfit) - n(a.evaluation.estimatedProfit) || st;
      case "margin":
        return n(b.evaluation.marginPercent) - n(a.evaluation.marginPercent) || st;
      case "availability":
        return n(b.offer.availableQuantity) - n(a.offer.availableQuantity) || st;
      case "freshness":
        return (a.evaluation.ageDays ?? Number.POSITIVE_INFINITY) - (b.evaluation.ageDays ?? Number.POSITIVE_INFINITY) || st;
      default:
        return st || b.evaluation.score - a.evaluation.score;
    }
  };
}

/** Paramètres de coûts manquants (à compléter pour un bénéfice complet). */
export function missingSettings(s: RadarCostSettings): string[] {
  const out: string[] = [];
  if (s.vatRegime === null) out.push("régime de TVA");
  if (s.vatRate === null) out.push("taux de TVA");
  if (s.vatRecoverable === null) out.push("TVA récupérable sur achats");
  if (s.marketplaceFeePercent === null) out.push("commission marketplace");
  if (s.paymentFeePercent === null && s.paymentFeeFixed === null) out.push("frais de paiement");
  if (s.shippingToCustomer === null) out.push("expédition au client");
  if (s.packagingCost === null) out.push("emballage");
  if (s.returnProvisionPercent === null) out.push("provision retours / garantie");
  return out;
}
