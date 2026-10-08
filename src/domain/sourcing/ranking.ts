/**
 * OpportunityRanking — classement multicritère des offres, au-delà du seul prix.
 *
 * Score composite /100, transparent (chaque composante est détaillée) :
 *   prix /30 · qualité (état/grade) /15 · MOQ réalisable /15 · fiabilité fournisseur /15 ·
 *   délai /10 · stock /5 · fraîcheur /5 · complétude des données /5.
 * Une donnée inconnue vaut 0 point dans sa composante ET est listée dans `unknownFactors`.
 *
 * Coût d'approvisionnement pour N unités demandées :
 *   unités achetées = max(N, MOQ, unités imposées par le minimum de commande)
 *   coût total      = unités achetées × coût unitaire rendu (+ port par commande si connu)
 * Économie vs coût actuel et bénéfice estimé : uniquement quand les deux termes sont connus.
 *
 * Podium : 🥇 Meilleure opportunité · 🥈 Meilleur rapport qualité / prix · 🥉 Fournisseur le plus fiable,
 * plus « Prix le plus bas », « Livraison la plus rapide », « MOQ le plus faible ».
 * Jamais de récompense sur une donnée inconnue : « non attribué : données insuffisantes ».
 */
import type { ProductCondition } from "@/domain/sourcing/normalizer";
import { gradeRank } from "@/domain/sourcing/offer-filter";

export interface RankableOffer {
  id: string;
  /** prix unitaire comparable (devise de l'organisation, même base HT/TTC) */
  unitPrice: number | null;
  /** coût unitaire rendu (prix + port + frais connus), null si inconnu */
  landedUnitCost: number | null;
  /** frais de port facturés une fois par commande (null = inconnu ou déjà inclus dans le coût rendu) */
  shippingPerOrder?: number | null;
  moq: number | null;
  minimumOrderValue: number | null;
  stockKnown: boolean;
  availableQuantity: number | null;
  /** rupture annoncée par la source (statut « out_of_stock ») ; une quantité connue à 0 vaut aussi rupture */
  outOfStock?: boolean;
  deliveryDays: number | null;
  grade: string | null;
  condition: ProductCondition;
  /** score de fiabilité fournisseur 0–100 (null = données insuffisantes) */
  supplierReliability: number | null;
  /** âge de la donnée en heures (null = inconnu) */
  freshnessHours: number | null;
  /** part de champs renseignés 0–1 */
  dataCompleteness: number;
  /** marge nette par unité (null si inconnue) */
  marginPerUnit: number | null;
  /** coût unitaire actuel de l'organisation pour ce produit (surcharge le contexte) */
  currentUnitCost?: number | null;
}

export interface RankingContext {
  /** quantité demandée (≥ 1) */
  requestedQuantity: number;
  /** coût unitaire actuel (dernier achat / coût SKU), null si inconnu */
  currentUnitCost?: number | null;
  currency?: string;
  /** podium à trois lauréats distincts (défaut true) */
  distinctPodium?: boolean;
}

export type RankingComponentKey = "price" | "quality" | "moq" | "reliability" | "delivery" | "stock" | "freshness" | "data";

export interface RankingComponent {
  points: number;
  max: number;
  known: boolean;
  note: string;
}

export const RANKING_WEIGHTS: Record<RankingComponentKey, number> = { price: 30, quality: 15, moq: 15, reliability: 15, delivery: 10, stock: 5, freshness: 5, data: 5 };

export const RANKING_COMPONENT_LABEL: Record<RankingComponentKey, string> = {
  price: "Prix",
  quality: "État / grade",
  moq: "MOQ réalisable",
  reliability: "Fiabilité fournisseur",
  delivery: "Délai",
  stock: "Stock",
  freshness: "Fraîcheur",
  data: "Complétude des données",
};

export interface ProcurementPlan {
  requestedQuantity: number;
  /** unités à acheter réellement (MOQ / minimum de commande) */
  unitsToBuy: number;
  /** unités achetées au-delà du besoin */
  overstockUnits: number;
  /** null : MOQ inconnu ; true : MOQ ≤ quantité demandée */
  moqFeasible: boolean | null;
  /** unités imposées par le minimum de commande (null si non applicable / inconnu) */
  unitsForMinimumOrderValue: number | null;
  /** marchandise seule : unités × prix unitaire (null si prix inconnu) */
  goodsCost: number | null;
  /** coût total rendu : unités × coût rendu (+ port par commande), null si coût rendu inconnu */
  totalCost: number | null;
  /** capital immobilisé dans le surplus (null si coût inconnu ou pas de surplus) */
  overstockCost: number | null;
  /** null : stock inconnu */
  stockSufficient: boolean | null;
  /** économie pour N unités vs coût actuel (null si l'un des deux est inconnu) */
  savings: number | null;
  /** bénéfice estimé sur les unités servies (null si marge inconnue) */
  expectedProfit: number | null;
  notes: string[];
}

export type AwardKey = "best_opportunity" | "best_value" | "most_reliable" | "lowest_price" | "fastest_delivery" | "lowest_moq";

export interface Award {
  key: AwardKey;
  emoji: string;
  label: string;
  offerId: string | null;
  /** explication de l'attribution, ou « non attribué : données insuffisantes (…) » */
  reason: string;
  /** base de l'attribution du 🥇 */
  basis?: "profit" | "composite";
}

export interface RankedOffer<T> {
  offer: T;
  rank: number;
  score: number;
  components: Record<RankingComponentKey, RankingComponent>;
  unknownFactors: string[];
  procurement: ProcurementPlan;
  /** prix utilisé pour la comparaison (coût rendu ou prix unitaire selon `priceBasis`) */
  effectiveUnitCost: number | null;
  /** prix pondéré par la qualité (🥈), null si prix ou qualité inconnus */
  qualityAdjustedPrice: number | null;
  why: string[];
  awards: AwardKey[];
}

export interface RankingResult<T> {
  ranked: Array<RankedOffer<T>>;
  /** 🥇 🥈 🥉 */
  podium: Award[];
  /** Prix le plus bas · Livraison la plus rapide · MOQ le plus faible */
  highlights: Award[];
  /** « landed » : toutes les offres à prix connu ont un coût rendu ; sinon « unit » (prix seul) */
  priceBasis: "landed" | "unit";
  priceBasisNote: string;
}

export const AWARD_META: Record<AwardKey, { emoji: string; label: string }> = {
  best_opportunity: { emoji: "🥇", label: "Meilleure opportunité" },
  best_value: { emoji: "🥈", label: "Meilleur rapport qualité / prix" },
  most_reliable: { emoji: "🥉", label: "Fournisseur le plus fiable" },
  lowest_price: { emoji: "💶", label: "Prix le plus bas" },
  fastest_delivery: { emoji: "🚚", label: "Livraison la plus rapide" },
  lowest_moq: { emoji: "📦", label: "MOQ le plus faible" },
};

export const NOT_AWARDED = "non attribué : données insuffisantes";

/** Facteur qualité (1 = neuf). Prix pondéré = prix / facteur. null si la qualité est inconnue. */
export function qualityFactor(condition: ProductCondition, grade: string | null): number | null {
  if (condition === "new") return 1;
  const r = gradeRank(grade);
  if (r === null) return null;
  if (r <= 0.5) return 0.97;
  if (r <= 1) return 0.95;
  if (r <= 1.5) return 0.9;
  if (r <= 2) return 0.85;
  if (r <= 2.5) return 0.8;
  return 0.75;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function known(n: number | null | undefined): n is number {
  return n !== null && n !== undefined && Number.isFinite(n);
}

export function formatMoney(amount: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Plan d'achat pour N unités : MOQ, minimum de commande, surplus, coût total, économie, bénéfice. */
export function computeProcurement(offer: RankableOffer, requestedQuantity: number, currentUnitCost: number | null = null, currency = "EUR"): ProcurementPlan {
  const n = Math.max(1, Math.floor(requestedQuantity));
  const notes: string[] = [];
  const moq = known(offer.moq) && offer.moq >= 1 ? Math.floor(offer.moq) : null;
  const moqFeasible = moq === null ? null : moq <= n;

  let unitsForMov: number | null = null;
  if (known(offer.minimumOrderValue) && offer.minimumOrderValue > 0 && known(offer.unitPrice) && offer.unitPrice > 0) {
    unitsForMov = Math.ceil(round2(offer.minimumOrderValue / offer.unitPrice));
  }
  const unitsToBuy = Math.max(n, moq ?? 1, unitsForMov ?? 1);
  const overstockUnits = unitsToBuy - n;

  if (moq !== null && moq > n) notes.push(`MOQ ${moq} supérieur à la quantité demandée (${n}) : achat de ${moq} unités, ${moq - n} en surplus`);
  if (unitsForMov !== null && unitsForMov > Math.max(n, moq ?? 1)) notes.push(`Minimum de commande de ${formatMoney(offer.minimumOrderValue as number, currency)} : achat de ${unitsForMov} unités minimum`);
  if (known(offer.minimumOrderValue) && offer.minimumOrderValue > 0 && !known(offer.unitPrice)) notes.push(`Minimum de commande de ${formatMoney(offer.minimumOrderValue, currency)} (prix inconnu : impact non calculable)`);
  if (moq === null) notes.push("MOQ non communiqué");

  const goodsCost = known(offer.unitPrice) ? round2(unitsToBuy * offer.unitPrice) : null;
  const shipping = known(offer.shippingPerOrder) ? offer.shippingPerOrder : 0;
  const totalCost = known(offer.landedUnitCost) ? round2(unitsToBuy * offer.landedUnitCost + shipping) : null;
  if (!known(offer.landedUnitCost)) notes.push("Coût rendu inconnu : coût total non calculable");
  const overstockCost = overstockUnits > 0 && known(offer.landedUnitCost) ? round2(overstockUnits * offer.landedUnitCost) : null;

  let stockSufficient: boolean | null = null;
  if (offer.stockKnown && known(offer.availableQuantity)) {
    stockSufficient = offer.availableQuantity >= unitsToBuy;
    if (!stockSufficient) notes.push(`Stock insuffisant : ${offer.availableQuantity} disponible(s) pour ${unitsToBuy} à acheter`);
  } else notes.push("Stock non communiqué");

  // économie pour N unités : coût rendu par unité (port par commande réparti) vs coût actuel
  const current = known(offer.currentUnitCost) ? offer.currentUnitCost : currentUnitCost;
  let savings: number | null = null;
  if (known(current) && known(offer.landedUnitCost)) {
    const perUnitWithShipping = offer.landedUnitCost + shipping / unitsToBuy;
    savings = round2((current - perUnitWithShipping) * n);
  }

  // bénéfice : marge par unité × unités réellement servies (bornées par le stock connu)
  let expectedProfit: number | null = null;
  if (known(offer.marginPerUnit)) {
    const served = stockSufficient === false && known(offer.availableQuantity) ? Math.min(n, offer.availableQuantity) : n;
    expectedProfit = round2(offer.marginPerUnit * served);
  }

  return { requestedQuantity: n, unitsToBuy, overstockUnits, moqFeasible, unitsForMinimumOrderValue: unitsForMov, goodsCost, totalCost, overstockCost, stockSufficient, savings, expectedProfit, notes };
}

function relative(value: number, min: number, max: number, points: number): number {
  if (max === min) return points;
  const ratio = (value - min) / (max - min);
  // plancher à 20 % : la moins bonne valeur connue vaut toujours plus qu'une inconnue
  return round1(points * (0.2 + 0.8 * Math.max(0, Math.min(1, 1 - ratio))));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function freshnessPoints(hours: number): number {
  if (hours <= 24) return 5;
  if (hours <= 48) return 4;
  if (hours <= 24 * 7) return 2;
  if (hours <= 24 * 30) return 1;
  return 0;
}

function ageLabel(hours: number): string {
  if (hours < 1) return "il y a moins d'une heure";
  if (hours < 24) return `il y a ${Math.round(hours)} h`;
  const d = Math.round(hours / 24);
  return `il y a ${d} jour${d > 1 ? "s" : ""}`;
}

function conditionLabel(o: RankableOffer): string | null {
  if (o.condition === "new") return "Neuf";
  if (o.grade) return `${o.condition === "used" ? "Occasion" : "Reconditionné"} grade ${o.grade}`;
  return null;
}

type Comparator<T> = (a: T, b: T) => number;

/** Rupture de stock connue (statut ou quantité à 0) : l'offre n'est pas achetable en l'état. */
export function isOutOfStock(o: Pick<RankableOffer, "outOfStock" | "stockKnown" | "availableQuantity">): boolean {
  return o.outOfStock === true || (o.stockKnown && o.availableQuantity === 0);
}

/**
 * Classe les offres et attribue le podium. Tri : offres en rupture connue en dernier, puis score
 * composite décroissant, bénéfice estimé décroissant, coût effectif croissant, identifiant
 * croissant (déterministe). Le podium privilégie les offres disponibles.
 */
export function rankOpportunities<T extends RankableOffer>(offers: T[], context: RankingContext): RankingResult<T> {
  const n = Math.max(1, Math.floor(context.requestedQuantity));
  const currency = context.currency ?? "EUR";
  const currentUnitCost = known(context.currentUnitCost) ? context.currentUnitCost : null;

  const priced = offers.filter((o) => known(o.unitPrice) && o.unitPrice > 0);
  const priceBasis: "landed" | "unit" = priced.length > 0 && priced.every((o) => known(o.landedUnitCost)) ? "landed" : "unit";
  const priceBasisNote = priceBasis === "landed" ? "Comparaison sur le coût rendu (prix + frais connus)" : "Comparaison sur le prix unitaire : coût rendu inconnu pour au moins une offre";
  const effective = (o: RankableOffer): number | null => {
    const v = priceBasis === "landed" ? o.landedUnitCost : o.unitPrice;
    return known(v) && v > 0 ? v : null;
  };

  const costs = offers.map(effective).filter(known);
  const minC = Math.min(...costs);
  const maxC = Math.max(...costs);
  const days = offers.map((o) => o.deliveryDays).filter(known);
  const minD = Math.min(...days);
  const maxD = Math.max(...days);

  const items: Array<RankedOffer<T>> = offers.map((o) => {
    const procurement = computeProcurement(o, n, currentUnitCost, currency);
    const cost = effective(o);
    const unknownFactors: string[] = [];
    const why: string[] = [];

    const price: RankingComponent =
      cost !== null
        ? { points: relative(cost, minC, maxC, RANKING_WEIGHTS.price), max: RANKING_WEIGHTS.price, known: true, note: cost === minC ? "Meilleur prix du résultat" : `${Math.round((cost / minC - 1) * 100)} % au-dessus du meilleur prix` }
        : { points: 0, max: RANKING_WEIGHTS.price, known: false, note: "Prix non comparable" };
    if (!price.known) unknownFactors.push("prix");

    const qf = qualityFactor(o.condition, o.grade);
    const quality: RankingComponent =
      qf !== null
        ? { points: round1(RANKING_WEIGHTS.quality * Math.max(0, (qf - 0.7) / 0.3)), max: RANKING_WEIGHTS.quality, known: true, note: conditionLabel(o) ?? "Qualité connue" }
        : { points: 0, max: RANKING_WEIGHTS.quality, known: false, note: "État / grade non communiqué" };
    if (!quality.known) unknownFactors.push("état / grade");

    const moq: RankingComponent =
      procurement.moqFeasible === null
        ? { points: 0, max: RANKING_WEIGHTS.moq, known: false, note: "MOQ non communiqué" }
        : procurement.moqFeasible
          ? { points: RANKING_WEIGHTS.moq, max: RANKING_WEIGHTS.moq, known: true, note: `MOQ ${o.moq} ≤ ${n} demandé(s)` }
          : { points: round1(RANKING_WEIGHTS.moq * (n / (o.moq as number))), max: RANKING_WEIGHTS.moq, known: true, note: `MOQ ${o.moq} > ${n} demandé(s)` };
    if (!moq.known) unknownFactors.push("MOQ");

    const reliability: RankingComponent = known(o.supplierReliability)
      ? { points: round1((Math.max(0, Math.min(100, o.supplierReliability)) / 100) * RANKING_WEIGHTS.reliability), max: RANKING_WEIGHTS.reliability, known: true, note: `Score fournisseur ${Math.round(o.supplierReliability)}/100` }
      : { points: 0, max: RANKING_WEIGHTS.reliability, known: false, note: "Fiabilité fournisseur inconnue (données insuffisantes)" };
    if (!reliability.known) unknownFactors.push("fiabilité fournisseur");

    const delivery: RankingComponent = known(o.deliveryDays)
      ? { points: relative(o.deliveryDays, minD, maxD, RANKING_WEIGHTS.delivery), max: RANKING_WEIGHTS.delivery, known: true, note: `Livraison sous ${o.deliveryDays} j${o.deliveryDays === minD ? " (la plus rapide)" : ""}` }
      : { points: 0, max: RANKING_WEIGHTS.delivery, known: false, note: "Délai non communiqué" };
    if (!delivery.known) unknownFactors.push("délai");

    const stock: RankingComponent =
      procurement.stockSufficient === null
        ? { points: 0, max: RANKING_WEIGHTS.stock, known: false, note: "Stock non communiqué" }
        : procurement.stockSufficient
          ? { points: RANKING_WEIGHTS.stock, max: RANKING_WEIGHTS.stock, known: true, note: `${o.availableQuantity} en stock` }
          : { points: round1(RANKING_WEIGHTS.stock * Math.min(1, (o.availableQuantity as number) / procurement.unitsToBuy)), max: RANKING_WEIGHTS.stock, known: true, note: `Stock insuffisant (${o.availableQuantity})` };
    if (!stock.known) unknownFactors.push("stock");

    const freshness: RankingComponent = known(o.freshnessHours)
      ? { points: freshnessPoints(o.freshnessHours), max: RANKING_WEIGHTS.freshness, known: true, note: `Vérifié ${ageLabel(o.freshnessHours)}` }
      : { points: 0, max: RANKING_WEIGHTS.freshness, known: false, note: "Date de vérification inconnue" };
    if (!freshness.known) unknownFactors.push("fraîcheur");

    const completeness = Math.max(0, Math.min(1, o.dataCompleteness));
    const data: RankingComponent = { points: round1(completeness * RANKING_WEIGHTS.data), max: RANKING_WEIGHTS.data, known: true, note: `${Math.round(completeness * 100)} % des données renseignées` };

    const components = { price, quality, moq, reliability, delivery, stock, freshness, data };
    const score = round1(Object.values(components).reduce((s, c) => s + c.points, 0));

    // --- pourquoi (phrases françaises, uniquement sur données connues ou manques explicites)
    if (procurement.expectedProfit !== null) why.push(`Bénéfice estimé de ${formatMoney(procurement.expectedProfit, currency)} pour ${n} unité(s) (${formatMoney(o.marginPerUnit as number, currency)} par unité)`);
    if (procurement.savings !== null) {
      why.push(procurement.savings >= 0 ? `Économie de ${formatMoney(procurement.savings, currency)} pour ${n} unité(s) par rapport à votre coût actuel` : `Surcoût de ${formatMoney(-procurement.savings, currency)} pour ${n} unité(s) par rapport à votre coût actuel`);
    }
    if (price.known) why.push(price.note);
    if (quality.known) why.push(quality.note);
    else why.push("État / grade non communiqué");
    if (procurement.moqFeasible === false) {
      why.push(`MOQ ${o.moq} > ${n} demandé(s) : achat de ${procurement.unitsToBuy} unités (${procurement.overstockUnits} en surplus${procurement.overstockCost !== null ? `, ${formatMoney(procurement.overstockCost, currency)} immobilisés` : ""})`);
    } else if (procurement.moqFeasible === true) why.push(`MOQ ${o.moq} compatible avec ${n} unité(s)`);
    else why.push("MOQ non communiqué");
    if (procurement.totalCost !== null) why.push(`Coût total pour ${procurement.unitsToBuy} unité(s) : ${formatMoney(procurement.totalCost, currency)}`);
    if (reliability.known) why.push(o.supplierReliability! >= 70 ? `Fournisseur fiable (score ${Math.round(o.supplierReliability!)}/100)` : reliability.note);
    else why.push("Fiabilité fournisseur inconnue");
    if (delivery.known) why.push(delivery.note);
    if (isOutOfStock(o)) why.unshift("Rupture de stock annoncée par la source : classée après les offres disponibles");
    else if (procurement.stockSufficient === false) why.push(`Stock insuffisant : ${o.availableQuantity} disponible(s)`);
    else if (procurement.stockSufficient === null) why.push("Stock non communiqué");
    if (freshness.known) why.push(freshness.note);

    const qualityAdjustedPrice = cost !== null && qf !== null ? round2(cost / qf) : null;
    return { offer: o, rank: 0, score, components, unknownFactors, procurement, effectiveUnitCost: cost, qualityAdjustedPrice, why, awards: [] };
  });

  // --- tri déterministe
  const byId: Comparator<RankedOffer<T>> = (a, b) => (a.offer.id < b.offer.id ? -1 : a.offer.id > b.offer.id ? 1 : 0);
  const nullsLast = (get: (r: RankedOffer<T>) => number | null, asc: boolean): Comparator<RankedOffer<T>> => (a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return asc ? va - vb : vb - va;
  };
  const chain =
    (...cmps: Array<Comparator<RankedOffer<T>>>): Comparator<RankedOffer<T>> =>
    (a, b) => {
      for (const c of cmps) {
        const r = c(a, b);
        if (r !== 0) return r;
      }
      return 0;
    };
  const availableFirst: Comparator<RankedOffer<T>> = (a, b) => (isOutOfStock(a.offer) ? 1 : 0) - (isOutOfStock(b.offer) ? 1 : 0);
  const tieBreak = chain(availableFirst, nullsLast((r) => r.score, false), nullsLast((r) => r.procurement.expectedProfit, false), nullsLast((r) => r.effectiveUnitCost, true), byId);
  items.sort(tieBreak);
  items.forEach((r, i) => (r.rank = i + 1));

  // --- récompenses
  const distinct = context.distinctPodium !== false;
  const podiumTaken = new Set<string>();
  const award = (key: AwardKey, winner: RankedOffer<T> | null, reason: string, basis?: Award["basis"]): Award => {
    if (winner) {
      winner.awards.push(key);
      return { key, ...AWARD_META[key], offerId: winner.offer.id, reason, ...(basis ? { basis } : {}) };
    }
    return { key, ...AWARD_META[key], offerId: null, reason, ...(basis ? { basis } : {}) };
  };
  const pick = (candidates: Array<RankedOffer<T>>, cmp: Comparator<RankedOffer<T>>, podium: boolean) => {
    const pool = podium && distinct ? candidates.filter((c) => !podiumTaken.has(c.offer.id)) : candidates;
    const sorted = [...pool].sort(chain(cmp, tieBreak));
    const w = sorted[0] ?? null;
    if (w && podium) podiumTaken.add(w.offer.id);
    return { winner: w, hadCandidates: candidates.length > 0 };
  };
  const notAwarded = (detail: string, hadCandidates: boolean) => (hadCandidates ? "non attribué : aucune autre offre éligible" : `${NOT_AWARDED} (${detail})`);
  const feasibleFirst: Comparator<RankedOffer<T>> = (a, b) => availableFirst(a, b) || (a.procurement.moqFeasible === false ? 1 : 0) - (b.procurement.moqFeasible === false ? 1 : 0);

  // 🥇 meilleure opportunité : bénéfice estimé le plus élevé (MOQ réalisable en priorité), sinon meilleur score
  const podium: Award[] = [];
  const withProfit = items.filter((r) => r.procurement.expectedProfit !== null);
  if (withProfit.length > 0) {
    const { winner } = pick(withProfit, chain(feasibleFirst, nullsLast((r) => r.procurement.expectedProfit, false)), true);
    podium.push(award("best_opportunity", winner, winner ? `Bénéfice estimé le plus élevé : ${formatMoney(winner.procurement.expectedProfit as number, currency)} pour ${n} unité(s)${winner.procurement.moqFeasible === false ? ` (MOQ ${winner.offer.moq} : ${winner.procurement.overstockUnits} unité(s) en surplus)` : ""}` : NOT_AWARDED, "profit"));
  } else {
    const eligible = items.filter((r) => r.components.price.known);
    const { winner, hadCandidates } = pick(eligible, chain(availableFirst, nullsLast((r) => r.score, false)), true);
    podium.push(award("best_opportunity", winner, winner ? `Meilleur score global (${winner.score}/100) — marge inconnue : bénéfice non calculable` : notAwarded("aucun prix comparable", hadCandidates), "composite"));
  }

  // 🥈 meilleur rapport qualité / prix : prix pondéré par la qualité, MOQ réalisable en priorité
  {
    const eligible = items.filter((r) => r.qualityAdjustedPrice !== null);
    const { winner, hadCandidates } = pick(eligible, chain(feasibleFirst, nullsLast((r) => r.qualityAdjustedPrice, true)), true);
    podium.push(
      award(
        "best_value",
        winner,
        winner ? `Prix pondéré par la qualité le plus bas : ${formatMoney(winner.qualityAdjustedPrice as number, currency)} (${conditionLabel(winner.offer) ?? "qualité connue"}, ${formatMoney(winner.effectiveUnitCost as number, currency)})${winner.procurement.moqFeasible === false ? ` — MOQ ${winner.offer.moq} supérieur au besoin` : ""}` : notAwarded("prix ou état / grade inconnus", hadCandidates),
      ),
    );
  }

  // 🥉 fournisseur le plus fiable : fiabilité + fraîcheur + stock connu
  {
    const eligible = items.filter((r) => known(r.offer.supplierReliability));
    const reliabilityScore = (r: RankedOffer<T>) => (r.offer.supplierReliability as number) * 0.7 + (r.components.freshness.points / RANKING_WEIGHTS.freshness) * 20 + (r.procurement.stockSufficient !== null ? 10 : 0);
    const { winner, hadCandidates } = pick(eligible, chain(availableFirst, nullsLast(reliabilityScore, false)), true);
    podium.push(
      award(
        "most_reliable",
        winner,
        winner ? `Score fournisseur ${Math.round(winner.offer.supplierReliability as number)}/100${winner.components.freshness.known ? `, ${winner.components.freshness.note.toLowerCase()}` : ""}${winner.procurement.stockSufficient !== null ? ", stock communiqué" : ""}` : notAwarded("aucun fournisseur avec un score de fiabilité", hadCandidates),
      ),
    );
  }

  // --- distinctions secondaires (non exclusives)
  const highlights: Award[] = [];
  {
    const eligible = items.filter((r) => r.effectiveUnitCost !== null);
    const { winner } = pick(eligible, nullsLast((r) => r.effectiveUnitCost, true), false);
    highlights.push(award("lowest_price", winner, winner ? `${formatMoney(winner.effectiveUnitCost as number, currency)} par unité (${priceBasis === "landed" ? "coût rendu" : "prix unitaire"})` : `${NOT_AWARDED} (aucun prix comparable)`));
  }
  {
    const eligible = items.filter((r) => known(r.offer.deliveryDays));
    const { winner } = pick(eligible, nullsLast((r) => r.offer.deliveryDays, true), false);
    highlights.push(award("fastest_delivery", winner, winner ? `Livraison sous ${winner.offer.deliveryDays} j` : `${NOT_AWARDED} (aucun délai communiqué)`));
  }
  {
    const eligible = items.filter((r) => known(r.offer.moq) && (r.offer.moq as number) >= 1);
    const { winner } = pick(eligible, nullsLast((r) => r.offer.moq, true), false);
    highlights.push(award("lowest_moq", winner, winner ? `MOQ de ${winner.offer.moq} unité(s)` : `${NOT_AWARDED} (aucun MOQ communiqué)`));
  }

  return { ranked: items, podium, highlights, priceBasis, priceBasisNote };
}
