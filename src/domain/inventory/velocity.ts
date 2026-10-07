/**
 * InventoryAnalyticsService — calcul de la vitesse de vente.
 *
 * Règles :
 *  - jamais de vitesse inventée : sans historique de vente → null + « Pas assez de données »
 *  - la fenêtre est choisie selon la densité des ventes (7 / 30 / 90 jours), et bornée
 *    par l'ancienneté de la première vente (un produit lancé il y a 10 jours n'est pas
 *    moyenné sur 30 jours)
 *  - la tendance compare la semaine écoulée à la précédente
 * L'architecture permet de remplacer la formule (pondération, saisonnalité) sans toucher aux appelants.
 */

export interface SalesWindowStats {
  units7d: number;
  units30d: number;
  units90d: number;
  unitsPrev7d: number;
  unitsPrev30d: number;
  firstSaleAt: Date | null;
  lastSaleAt: Date | null;
}

export type VelocityBasis = "7d" | "30d" | "90d";
export type Trend = "up" | "down" | "stable" | "unknown";
export type Confidence = "none" | "low" | "medium" | "high";

export interface VelocityResult {
  /** unités / jour, null si pas assez de données */
  dailyVelocity: number | null;
  basis: VelocityBasis | null;
  /** nombre de jours effectivement utilisés pour la moyenne */
  basisDays: number | null;
  trend: Trend;
  /** variation en % entre les 7 derniers jours et les 7 précédents */
  trendPercent: number | null;
  confidence: Confidence;
  /** explication lisible, affichée telle quelle dans l'interface */
  explanation: string;
}

export interface VelocityOptions {
  now?: Date;
  /** ventes minimales pour considérer une fenêtre comme fiable */
  minUnitsForWindow?: number;
}

const DAY_MS = 86_400_000;

function effectiveDays(windowDays: number, firstSaleAt: Date | null, now: Date): number {
  if (!firstSaleAt) return windowDays;
  const age = Math.max(1, Math.ceil((now.getTime() - firstSaleAt.getTime()) / DAY_MS));
  return Math.max(1, Math.min(windowDays, age));
}

export function computeVelocity(stats: SalesWindowStats, options: VelocityOptions = {}): VelocityResult {
  const now = options.now ?? new Date();
  const minUnits = options.minUnitsForWindow ?? 5;

  if (stats.units90d <= 0) {
    return {
      dailyVelocity: null,
      basis: null,
      basisDays: null,
      trend: "unknown",
      trendPercent: null,
      confidence: "none",
      explanation: "Pas assez de données : aucune vente enregistrée sur les 90 derniers jours.",
    };
  }

  const windows: Array<{ basis: VelocityBasis; days: number; units: number }> = [
    { basis: "7d", days: 7, units: stats.units7d },
    { basis: "30d", days: 30, units: stats.units30d },
    { basis: "90d", days: 90, units: stats.units90d },
  ];

  // Fenêtre la plus courte avec assez de ventes ; sinon la plus longue avec au moins une vente.
  let chosen = windows.find((w) => w.units >= minUnits);
  let confidence: Confidence = "high";
  if (!chosen) {
    chosen = [...windows].reverse().find((w) => w.units > 0);
    confidence = "low";
  } else if (chosen.basis === "90d") {
    confidence = "medium";
  }
  if (!chosen) {
    return {
      dailyVelocity: null,
      basis: null,
      basisDays: null,
      trend: "unknown",
      trendPercent: null,
      confidence: "none",
      explanation: "Pas assez de données.",
    };
  }

  const days = effectiveDays(chosen.days, stats.firstSaleAt, now);
  const dailyVelocity = chosen.units / days;

  let trend: Trend = "unknown";
  let trendPercent: number | null = null;
  if (stats.unitsPrev7d > 0) {
    trendPercent = ((stats.units7d - stats.unitsPrev7d) / stats.unitsPrev7d) * 100;
    trend = trendPercent > 20 ? "up" : trendPercent < -20 ? "down" : "stable";
  } else if (stats.units7d > 0 && stats.units90d > stats.units7d) {
    trend = "up";
  } else if (stats.units7d === 0 && stats.units30d > 0) {
    trend = "down";
  }

  const basisLabel = chosen.basis === "7d" ? "7 jours" : chosen.basis === "30d" ? "30 jours" : "90 jours";
  const explanation =
    `${chosen.units} unité(s) vendue(s) sur ${days === chosen.days ? basisLabel : `${days} jour(s) (produit récent)`}` +
    ` → ${dailyVelocity.toFixed(2)} / jour` +
    (confidence === "low" ? " (peu de ventes : estimation fragile)" : "");

  return { dailyVelocity, basis: chosen.basis, basisDays: days, trend, trendPercent, confidence, explanation };
}

/** Jours de couverture = stock disponible / vitesse quotidienne. null si vitesse inconnue. */
export function computeDaysOfCover(availableStock: number, dailyVelocity: number | null): number | null {
  if (dailyVelocity === null || !Number.isFinite(dailyVelocity)) return null;
  if (availableStock <= 0) return 0;
  if (dailyVelocity <= 0) return Number.POSITIVE_INFINITY;
  return availableStock / dailyVelocity;
}
