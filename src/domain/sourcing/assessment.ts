import { computeUnitEconomics, type PriceOrigin, type RadarCostSettings, type SupplierOrigin } from "@/domain/sourcing/radar";

/**
 * Appréciation expliquée d'une offre fournisseur, en TROIS notes séparées (jamais fusionnées en
 * une seule qui cacherait une information essentielle) :
 *  1. compétitivité de l'offre : coût rendu face aux autres offres du même produit et marge ;
 *  2. fiabilité de la source : origine du prix, historique de synchronisation, achats passés ;
 *  3. confiance des données : complétude et ancienneté.
 * Puis un verdict (« opportunité », « à vérifier », « risquée », « données insuffisantes ») et
 * ses raisons. Une note impossible à calculer vaut null (« données insuffisantes ») : jamais 0
 * ni 100 par défaut. Module pur, partagé avec l'application.
 */

export type AppraisalLabel = "excellent" | "good" | "fair" | "weak" | "insufficient_data";

export interface Appraisal {
  /** 0–100, null = données insuffisantes */
  score: number | null;
  label: AppraisalLabel;
  reasons: string[];
}

export interface DataConfidence extends Appraisal {
  missing: string[];
  ageDays: number | null;
}

export type OfferVerdict = "opportunity" | "to_verify" | "risky" | "insufficient_data";

export interface OfferAssessment {
  competitiveness: Appraisal;
  sourceReliability: Appraisal;
  dataConfidence: DataConfidence;
  verdict: OfferVerdict;
  verdictReasons: string[];
}

export interface SourceHistory {
  /** synchronisations / imports terminés sur la période (réussis + échoués) */
  runs: number;
  successfulRuns: number;
  consecutiveFailures: number;
  /** commandes fournisseur reçues (historique d'achat réel) */
  receivedPurchaseOrders: number;
  /** score interne du fournisseur (null tant que < 3 commandes reçues) */
  supplierScore: number | null;
}

export interface AssessmentInput {
  landedUnitCost: number | null;
  /** coûts rendus des AUTRES offres actives du même produit */
  peerLandedCosts: number[];
  estimatedProfit: number | null;
  marginPercent: number | null;
  availableQuantity: number | null;
  stockStatus: "in_stock" | "low" | "out_of_stock" | "unknown";
  moq: number | null;
  ageDays: number | null;
  priceOrigin: PriceOrigin;
  taxType: "ht" | "ttc" | "unknown";
  vatRegime: string | null;
  shippingKnown: boolean;
  deliveryKnown: boolean;
  gradeOrCondition: boolean;
  warrantyKnown: boolean;
  source: SourceHistory | null;
}

const ORIGIN_RELIABILITY: Record<PriceOrigin, number> = {
  verified_live: 80,
  supplier_communicated: 65,
  // annonce de tiers (eBay Browse) : prix demandé, quantité inconnue, vendeur non vérifié
  marketplace_listing: 45,
  catalog_import: 60,
  observed_public: 50,
  manual_entry: 45,
  unknown: 30,
};

const labelOf = (score: number | null): AppraisalLabel => (score === null ? "insufficient_data" : score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "fair" : "weak");
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Stock confirmé : quantité positive connue, ou « en stock » déclaré. */
export function stockConfirmed(i: Pick<AssessmentInput, "availableQuantity" | "stockStatus">): boolean {
  return (i.availableQuantity !== null && i.availableQuantity > 0) || i.stockStatus === "in_stock" || i.stockStatus === "low";
}

export function assessCompetitiveness(i: AssessmentInput): Appraisal {
  const reasons: string[] = [];
  if (i.landedUnitCost === null) return { score: null, label: "insufficient_data", reasons: ["Coût rendu non calculable (prix, devise ou type de prix manquant)."] };
  const parts: { w: number; v: number }[] = [];
  const peers = i.peerLandedCosts.filter((c) => Number.isFinite(c) && c > 0);
  if (peers.length > 0) {
    const best = Math.min(...peers, i.landedUnitCost);
    const priceScore = (best / i.landedUnitCost) * 100;
    parts.push({ w: 0.6, v: priceScore });
    if (i.landedUnitCost <= best) reasons.push(`Coût rendu le plus bas parmi ${peers.length + 1} offres.`);
    else reasons.push(`Coût rendu ${Math.round(((i.landedUnitCost - best) / best) * 100)} % au-dessus de la meilleure offre.`);
  } else reasons.push("Aucune autre offre active pour ce produit : pas de comparaison de prix.");
  if (i.marginPercent !== null && i.estimatedProfit !== null) {
    // 30 % de marge (sur le prix de vente HT) ou plus = note maximale ; perte = 0
    parts.push({ w: 0.4, v: i.estimatedProfit <= 0 ? 0 : (Math.min(30, i.marginPercent) / 30) * 100 });
    reasons.push(i.estimatedProfit > 0 ? `Marge estimée ${i.marginPercent} %.` : "Marge nulle ou négative.");
  } else reasons.push("Marge non calculable (prix de vente ou coûts inconnus).");
  if (parts.length === 0) return { score: null, label: "insufficient_data", reasons };
  const totalW = parts.reduce((a, p) => a + p.w, 0);
  let score = clamp(parts.reduce((a, p) => a + p.w * p.v, 0) / totalW);
  if (i.stockStatus === "out_of_stock" || i.availableQuantity === 0) {
    score = Math.min(score, 20);
    reasons.push("Rupture chez le fournisseur : note plafonnée à 20.");
  } else if (!stockConfirmed(i)) {
    score = Math.min(score, 70);
    reasons.push("Stock non confirmé : note plafonnée à 70.");
  } else if (i.moq !== null && i.availableQuantity !== null && i.availableQuantity < i.moq) {
    score = Math.min(score, 50);
    reasons.push(`Stock (${i.availableQuantity}) inférieur au minimum de commande (${i.moq}).`);
  }
  return { score, label: labelOf(score), reasons };
}

export function assessSourceReliability(i: Pick<AssessmentInput, "priceOrigin" | "source">): Appraisal {
  const reasons: string[] = [];
  const s = i.source;
  const hasHistory = s !== null && (s.runs >= 3 || s.receivedPurchaseOrders >= 3);
  if (i.priceOrigin === "unknown" && !hasHistory) return { score: null, label: "insufficient_data", reasons: ["Source inconnue et sans historique : données insuffisantes pour juger sa fiabilité."] };
  let score = ORIGIN_RELIABILITY[i.priceOrigin];
  reasons.push(
    {
      verified_live: "Prix lu en direct via l'API du fournisseur.",
      marketplace_listing: "Annonce publiée sur une place de marché : prix demandé par un vendeur tiers, pas une vente constatée.",
      supplier_communicated: "Prix communiqué par le fournisseur (flux ou fichier).",
      catalog_import: "Prix importé d'un fichier fournisseur.",
      observed_public: "Prix relevé sur une page publique.",
      manual_entry: "Prix saisi manuellement.",
      unknown: "Origine du prix inconnue.",
    }[i.priceOrigin],
  );
  if (s && s.runs >= 3) {
    const rate = s.successfulRuns / s.runs;
    score += (rate - 0.8) * 50; // 100 % de succès : +10 ; 60 % : −10
    reasons.push(`${Math.round(rate * 100)} % de synchronisations réussies (${s.runs}).`);
  } else reasons.push("Moins de 3 synchronisations : historique insuffisant.");
  if (s && s.consecutiveFailures > 0) {
    score -= Math.min(30, s.consecutiveFailures * 10);
    reasons.push(`${s.consecutiveFailures} échec(s) consécutif(s) de synchronisation.`);
  }
  if (s && s.supplierScore !== null) {
    score = score * 0.6 + s.supplierScore * 0.4;
    reasons.push(`Score fournisseur ${s.supplierScore}/100 (commandes reçues).`);
  } else if (s && s.receivedPurchaseOrders > 0) reasons.push(`${s.receivedPurchaseOrders} commande(s) reçue(s) : score fournisseur à partir de 3.`);
  else reasons.push("Aucune commande reçue de ce fournisseur.");
  // un fournisseur jamais acheté ne peut pas être jugé excellent
  if (!s || (s.supplierScore === null && s.receivedPurchaseOrders < 3)) score = Math.min(score, 70);
  const final = clamp(score);
  return { score: final, label: labelOf(final), reasons };
}

export function assessDataConfidence(i: AssessmentInput): DataConfidence {
  const checks: [boolean, string][] = [
    [i.landedUnitCost !== null, "prix exploitable"],
    [i.availableQuantity !== null || i.stockStatus !== "unknown", "disponibilité"],
    [i.moq !== null, "quantité minimale"],
    [i.taxType !== "unknown", "HT / TTC"],
    [i.shippingKnown, "frais de port"],
    [i.gradeOrCondition, "état / grade"],
    [i.deliveryKnown, "délai de livraison"],
    [i.vatRegime !== null && i.vatRegime !== "unknown", "régime de TVA"],
    [i.warrantyKnown, "garantie"],
  ];
  const missing = checks.filter(([ok]) => !ok).map(([, l]) => l);
  const completeness = (checks.length - missing.length) / checks.length;
  const reasons: string[] = [`${checks.length - missing.length}/${checks.length} informations connues.`];
  let score = completeness * 100;
  if (i.ageDays === null) {
    score -= 25;
    reasons.push("Date de vérification inconnue.");
  } else if (i.ageDays > 30) {
    score -= 50;
    reasons.push(`Données vieilles de ${i.ageDays} jours : très probablement obsolètes.`);
  } else if (i.ageDays > 7) {
    score -= 25;
    reasons.push(`Données vieilles de ${i.ageDays} jours : à revérifier.`);
  } else reasons.push(i.ageDays <= 2 ? "Données récentes (moins de 48 h)." : `Données de ${i.ageDays} jours.`);
  if (i.landedUnitCost === null) return { score: null, label: "insufficient_data", reasons, missing, ageDays: i.ageDays };
  const final = clamp(score);
  return { score: final, label: labelOf(final), reasons, missing, ageDays: i.ageDays };
}

export function assessOffer(i: AssessmentInput): OfferAssessment {
  const competitiveness = assessCompetitiveness(i);
  const sourceReliability = assessSourceReliability(i);
  const dataConfidence = assessDataConfidence(i);
  const why: string[] = [];
  let verdict: OfferVerdict;
  if (competitiveness.score === null || dataConfidence.score === null) {
    verdict = "insufficient_data";
    why.push("Coût rendu ou marge non calculable : complétez les données avant de décider.");
  } else if ((i.estimatedProfit !== null && i.estimatedProfit <= 0) || i.stockStatus === "out_of_stock" || i.availableQuantity === 0 || (i.ageDays !== null && i.ageDays > 30)) {
    verdict = "risky";
    if (i.estimatedProfit !== null && i.estimatedProfit <= 0) why.push("Aucun bénéfice avec les coûts connus.");
    if (i.stockStatus === "out_of_stock" || i.availableQuantity === 0) why.push("Rupture chez le fournisseur.");
    if (i.ageDays !== null && i.ageDays > 30) why.push("Prix trop ancien pour être fiable.");
  } else if (
    i.estimatedProfit !== null &&
    i.estimatedProfit > 0 &&
    stockConfirmed(i) &&
    i.ageDays !== null &&
    i.ageDays <= 7 &&
    competitiveness.score >= 60 &&
    dataConfidence.score >= 50 &&
    (i.marginPercent ?? 0) >= 10
  ) {
    verdict = "opportunity";
    why.push("Bénéfice positif, stock confirmé, prix de moins de 7 jours et coût rendu compétitif.");
  } else {
    verdict = "to_verify";
    if (!stockConfirmed(i)) why.push("Stock non confirmé par le fournisseur.");
    if (i.ageDays === null || i.ageDays > 7) why.push("Prix à revérifier (plus de 7 jours ou date inconnue).");
    if ((i.marginPercent ?? 0) < 10) why.push("Marge faible (moins de 10 %).");
    if (competitiveness.score < 60) why.push("D'autres offres sont plus compétitives.");
    if (dataConfidence.score < 50) why.push(`Informations manquantes : ${dataConfidence.missing.join(", ")}.`);
  }
  return { competitiveness, sourceReliability, dataConfidence, verdict, verdictReasons: why };
}

/* ───────── Scénarios de quantité ───────── */

export interface QuantityScenario {
  quantity: number;
  /** ce que représente ce scénario */
  label: string;
  unitLandedCost: number | null;
  unitProfit: number | null;
  /** capital nécessaire (coût rendu × quantité) */
  capital: number | null;
  totalProfit: number | null;
  /** la quantité dépasse le stock annoncé */
  exceedsStock: boolean;
  missing: string[];
  /** hypothèse appliquée (transport) */
  assumption: string | null;
}

export interface ScenarioInput {
  salePrice: number | null;
  saleLabel: string;
  purchasePrice: number | null;
  purchaseTaxType: "ht" | "ttc" | "unknown";
  /** frais de port fournisseur annoncés (pour une commande) */
  supplierShipping: number | null;
  moq: number | null;
  orderMultiple: number | null;
  availableQuantity: number | null;
  supplierOrigin: SupplierOrigin;
  originLabel: string | null;
}

/** Quantité commandable la plus proche ≥ q (respect du minimum et du multiple de commande). */
export function orderableQuantity(q: number, moq: number | null, multiple: number | null): number {
  let n = Math.max(1, Math.ceil(q), moq ?? 1);
  if (multiple && multiple > 1) n = Math.ceil(n / multiple) * multiple;
  return n;
}

/**
 * Scénarios : quantité minimale, deux fois le minimum, tout le stock annoncé (si connu) et
 * quantités demandées. Le transport annoncé est réparti sur la quantité : hypothèse d'un forfait
 * par commande, signalée comme telle (le fournisseur peut facturer davantage pour un gros volume).
 */
export function quantityScenarios(i: ScenarioInput, settings: RadarCostSettings, extra: number[] = []): QuantityScenario[] {
  const base = orderableQuantity(i.moq ?? 1, i.moq, i.orderMultiple);
  const wanted: { q: number; label: string }[] = [
    { q: base, label: i.moq ? "Quantité minimale" : "À l'unité" },
    { q: orderableQuantity(base * 2, i.moq, i.orderMultiple), label: "Deux fois le minimum" },
  ];
  if (i.availableQuantity !== null && i.availableQuantity > base * 2) wanted.push({ q: i.availableQuantity, label: "Tout le stock annoncé" });
  for (const e of extra) if (e > 0) wanted.push({ q: orderableQuantity(e, i.moq, i.orderMultiple), label: `${e} unités demandées` });
  const seen = new Set<number>();
  const out: QuantityScenario[] = [];
  for (const w of wanted) {
    if (seen.has(w.q)) continue;
    seen.add(w.q);
    const eco = computeUnitEconomics(
      { salePrice: i.salePrice, saleLabel: i.saleLabel, purchasePrice: i.purchasePrice, purchaseTaxType: i.purchaseTaxType, supplierShipping: i.supplierShipping, moq: i.moq, quantity: w.q, supplierOrigin: i.supplierOrigin, originLabel: i.originLabel },
      settings,
    );
    const unitLanded = eco.landedCost;
    const unitProfit = eco.estimatedProfit;
    out.push({
      quantity: w.q,
      label: w.label,
      unitLandedCost: unitLanded,
      unitProfit,
      capital: unitLanded === null ? null : Math.round(unitLanded * w.q * 100) / 100,
      totalProfit: unitProfit === null ? null : Math.round(unitProfit * w.q * 100) / 100,
      exceedsStock: i.availableQuantity !== null && w.q > i.availableQuantity,
      missing: eco.missing,
      assumption: i.supplierShipping !== null ? `Transport annoncé (${i.supplierShipping}) réparti sur ${w.q} unités : forfait par commande supposé.` : null,
    });
  }
  return out;
}
