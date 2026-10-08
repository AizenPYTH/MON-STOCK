/**
 * OfferScoreService — score transparent /100 d'une offre, relatif aux autres offres
 * du résultat : prix /30, MOQ /20, délai /20, fournisseur /20, qualité des données /10.
 * Une donnée inconnue vaut 0 point dans sa composante ET est listée dans `unknownFactors`.
 *
 * SupplierScoringService — score interne d'un fournisseur uniquement lorsque les données
 * sont suffisantes, sinon null avec explication (« Données insuffisantes »).
 */

export interface ScorableOffer {
  id: string;
  /** prix unitaire comparable (devise de l'organisation, même base HT/TTC si possible) */
  comparablePrice: number | null;
  moq: number | null;
  deliveryDays: number | null;
  supplierScore: number | null;
  /** part de champs renseignés (0–1), voir computeDataCompleteness */
  dataCompleteness: number;
  potentialMargin?: number | null;
}

export interface ScoreComponent {
  points: number;
  max: number;
  known: boolean;
  note: string;
}

export interface ScoreBreakdown {
  price: ScoreComponent;
  moq: ScoreComponent;
  delivery: ScoreComponent;
  supplier: ScoreComponent;
  data: ScoreComponent;
}

export type ScoreCoverage = "complete" | "partial" | "price_only" | "none";

export interface OfferScore {
  total: number;
  breakdown: ScoreBreakdown;
  unknownFactors: string[];
  coverage: ScoreCoverage;
  coverageLabel: string;
}

export const SCORE_MAX = { price: 30, moq: 20, delivery: 20, supplier: 20, data: 10 } as const;

export const SCORE_COMPONENT_LABEL: Record<keyof ScoreBreakdown, string> = {
  price: "Prix",
  moq: "MOQ",
  delivery: "Délai",
  supplier: "Fournisseur",
  data: "Qualité des données",
};

function relative(value: number, min: number, max: number, points: number, lowerIsBetter: boolean): number {
  if (max === min) return points;
  const ratio = (value - min) / (max - min);
  const score = lowerIsBetter ? 1 - ratio : ratio;
  // Plancher à 20 % du maximum : la moins bonne offre connue vaut toujours plus qu'une inconnue.
  return Math.round((points * (0.2 + 0.8 * Math.max(0, Math.min(1, score)))) * 10) / 10;
}

function coverageLabel(c: ScoreCoverage): string {
  switch (c) {
    case "complete":
      return "Comparaison complète";
    case "partial":
      return "Comparaison partielle";
    case "price_only":
      return "Comparaison partielle (prix seul)";
    case "none":
      return "Comparaison impossible (données insuffisantes)";
  }
}

export function scoreOffers(offers: ScorableOffer[]): Map<string, OfferScore> {
  const prices = offers.map((o) => o.comparablePrice).filter((p): p is number => p !== null && Number.isFinite(p));
  const moqs = offers.map((o) => o.moq).filter((m): m is number => m !== null && Number.isFinite(m));
  const deliveries = offers.map((o) => o.deliveryDays).filter((d): d is number => d !== null && Number.isFinite(d));
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const minM = Math.min(...moqs);
  const maxM = Math.max(...moqs);
  const minD = Math.min(...deliveries);
  const maxD = Math.max(...deliveries);

  const out = new Map<string, OfferScore>();
  for (const o of offers) {
    const unknown: string[] = [];
    const price: ScoreComponent =
      o.comparablePrice !== null && Number.isFinite(o.comparablePrice)
        ? { points: relative(o.comparablePrice, minP, maxP, SCORE_MAX.price, true), max: SCORE_MAX.price, known: true, note: o.comparablePrice === minP ? "Meilleur prix du résultat" : `Prix ${((o.comparablePrice / minP - 1) * 100).toFixed(0)} % au-dessus du meilleur prix` }
        : { points: 0, max: SCORE_MAX.price, known: false, note: "Prix non comparable" };
    if (!price.known) unknown.push("prix");

    const moq: ScoreComponent =
      o.moq !== null && Number.isFinite(o.moq)
        ? { points: relative(o.moq, minM, maxM, SCORE_MAX.moq, true), max: SCORE_MAX.moq, known: true, note: `MOQ ${o.moq}${o.moq === minM ? " (le plus faible)" : ""}` }
        : { points: 0, max: SCORE_MAX.moq, known: false, note: "MOQ non communiqué" };
    if (!moq.known) unknown.push("MOQ");

    const delivery: ScoreComponent =
      o.deliveryDays !== null && Number.isFinite(o.deliveryDays)
        ? { points: relative(o.deliveryDays, minD, maxD, SCORE_MAX.delivery, true), max: SCORE_MAX.delivery, known: true, note: `Livraison sous ${o.deliveryDays} j${o.deliveryDays === minD ? " (la plus rapide)" : ""}` }
        : { points: 0, max: SCORE_MAX.delivery, known: false, note: "Délai non communiqué" };
    if (!delivery.known) unknown.push("délai");

    const supplier: ScoreComponent =
      o.supplierScore !== null && Number.isFinite(o.supplierScore)
        ? { points: Math.round((o.supplierScore / 100) * SCORE_MAX.supplier * 10) / 10, max: SCORE_MAX.supplier, known: true, note: `Score fournisseur ${Math.round(o.supplierScore)}/100` }
        : { points: 0, max: SCORE_MAX.supplier, known: false, note: "Fournisseur sans score (données insuffisantes)" };
    if (!supplier.known) unknown.push("fournisseur");

    const completeness = Math.max(0, Math.min(1, o.dataCompleteness));
    const data: ScoreComponent = { points: Math.round(completeness * SCORE_MAX.data * 10) / 10, max: SCORE_MAX.data, known: true, note: `${Math.round(completeness * 100)} % des données renseignées` };

    const total = Math.round((price.points + moq.points + delivery.points + supplier.points + data.points) * 10) / 10;
    const knownCount = [price, moq, delivery, supplier].filter((c) => c.known).length;
    const coverage: ScoreCoverage = knownCount === 4 ? "complete" : knownCount === 0 ? "none" : price.known && knownCount === 1 ? "price_only" : "partial";

    out.set(o.id, { total, breakdown: { price, moq, delivery, supplier, data }, unknownFactors: unknown, coverage, coverageLabel: coverageLabel(coverage) });
  }
  return out;
}

export const RANKING_MODES = ["lowest_price", "best_offer", "best_margin", "fastest_delivery", "lowest_moq", "best_supplier"] as const;
export type RankingMode = (typeof RANKING_MODES)[number];

export const RANKING_LABELS: Record<RankingMode, string> = {
  lowest_price: "Prix le plus bas",
  best_offer: "Meilleure offre",
  best_margin: "Meilleure marge",
  fastest_delivery: "Livraison la plus rapide",
  lowest_moq: "MOQ le plus faible",
  best_supplier: "Meilleur fournisseur",
};

function byNullable(get: (o: ScorableOffer) => number | null | undefined, ascending: boolean) {
  return (a: ScorableOffer, b: ScorableOffer) => {
    const va = get(a);
    const vb = get(b);
    const na = va === null || va === undefined || !Number.isFinite(va);
    const nb = vb === null || vb === undefined || !Number.isFinite(vb);
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    return ascending ? (va as number) - (vb as number) : (vb as number) - (va as number);
  };
}

export function rankOffers<T extends ScorableOffer>(offers: T[], mode: RankingMode, scores?: Map<string, OfferScore>): T[] {
  const s = scores ?? scoreOffers(offers);
  const score = (o: ScorableOffer) => s.get(o.id)?.total ?? null;
  const tieBreak = byNullable(score, false);
  let cmp: (a: ScorableOffer, b: ScorableOffer) => number;
  switch (mode) {
    case "lowest_price":
      cmp = byNullable((o) => o.comparablePrice, true);
      break;
    case "best_margin":
      cmp = byNullable((o) => o.potentialMargin ?? null, false);
      break;
    case "fastest_delivery":
      cmp = byNullable((o) => o.deliveryDays, true);
      break;
    case "lowest_moq":
      cmp = byNullable((o) => o.moq, true);
      break;
    case "best_supplier":
      cmp = byNullable((o) => o.supplierScore, false);
      break;
    case "best_offer":
    default:
      cmp = tieBreak;
  }
  return [...offers].sort((a, b) => cmp(a, b) || tieBreak(a, b));
}

/** Part de champs renseignés parmi ceux attendus pour une offre. */
export function computeDataCompleteness(fields: Record<string, unknown>): number {
  const keys = Object.keys(fields);
  if (keys.length === 0) return 0;
  const known = keys.filter((k) => {
    const v = fields[k];
    return v !== null && v !== undefined && v !== "" && v !== "unknown";
  }).length;
  return Math.round((known / keys.length) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Score fournisseur
// ---------------------------------------------------------------------------
export interface SupplierScoreInput {
  /** commandes reçues (au moins partiellement) */
  receivedOrders: number;
  /** délais réels constatés (jours entre envoi et réception) */
  leadTimeSamples: number[];
  /** délai annoncé par le fournisseur (null = inconnu) */
  expectedLeadTimeDays: number | null;
  /** commandes avec problème (annulée, incomplète…) */
  problemCount: number;
  activeOffers: number;
}

export interface SupplierScoreBreakdown {
  reliability: ScoreComponent;
  problems: ScoreComponent;
  history: ScoreComponent;
}

export interface SupplierScoreResult {
  score: number | null;
  breakdown: SupplierScoreBreakdown | null;
  reason: string;
  averageLeadTimeDays: number | null;
}

export const SUPPLIER_SCORE_MIN_ORDERS = 3;

export function computeSupplierScore(input: SupplierScoreInput): SupplierScoreResult {
  const avgLead = input.leadTimeSamples.length > 0 ? Math.round((input.leadTimeSamples.reduce((a, b) => a + b, 0) / input.leadTimeSamples.length) * 10) / 10 : null;
  if (input.receivedOrders < SUPPLIER_SCORE_MIN_ORDERS) {
    return {
      score: null,
      breakdown: null,
      reason: `Données insuffisantes : ${input.receivedOrders} commande(s) reçue(s), ${SUPPLIER_SCORE_MIN_ORDERS} minimum nécessaires pour calculer un score.`,
      averageLeadTimeDays: avgLead,
    };
  }

  // Fiabilité du délai : part des livraisons dans le délai annoncé (ou ≤ 1,25 × moyenne si inconnu).
  let reliability: ScoreComponent;
  if (input.leadTimeSamples.length === 0) {
    reliability = { points: 0, max: 40, known: false, note: "Aucun délai réel mesuré" };
  } else {
    const reference = input.expectedLeadTimeDays ?? (avgLead ?? 0) * 1.25;
    const onTime = input.leadTimeSamples.filter((d) => d <= reference).length / input.leadTimeSamples.length;
    reliability = { points: Math.round(onTime * 40 * 10) / 10, max: 40, known: true, note: `${Math.round(onTime * 100)} % des livraisons dans le délai${input.expectedLeadTimeDays ? ` annoncé (${input.expectedLeadTimeDays} j)` : " habituel"}` };
  }

  const problemRate = input.receivedOrders > 0 ? input.problemCount / (input.receivedOrders + input.problemCount) : 0;
  const problems: ScoreComponent = { points: Math.round((1 - Math.min(1, problemRate)) * 30 * 10) / 10, max: 30, known: true, note: `${input.problemCount} commande(s) avec problème sur ${input.receivedOrders + input.problemCount}` };

  const historyRatio = Math.min(1, input.receivedOrders / 10);
  const history: ScoreComponent = { points: Math.round(historyRatio * 30 * 10) / 10, max: 30, known: true, note: `${input.receivedOrders} commande(s) reçue(s) (10 = historique complet)` };

  const score = Math.round((reliability.points + problems.points + history.points) * 10) / 10;
  return { score, breakdown: { reliability, problems, history }, reason: "Score calculé à partir de votre historique d'achats.", averageLeadTimeDays: avgLead };
}
