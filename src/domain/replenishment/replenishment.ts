/**
 * ReplenishmentService — quantité recommandée, toujours expliquée.
 *
 * besoin cible = stock à consommer pendant (délai fournisseur + horizon de couverture) + stock de sécurité
 * quantité à commander = besoin cible − stock disponible − en commande, arrondie au MOQ / multiple MOQ.
 */
export interface ReplenishmentInput {
  skuLabel: string;
  availableStock: number;
  /** quantités déjà commandées chez un fournisseur, non reçues */
  onOrder?: number;
  dailyVelocity: number | null;
  leadTimeDays: number | null;
  safetyStock: number;
  /** nombre de jours de vente à couvrir après réception (défaut 14) */
  coverDays?: number;
  moq?: number | null;
  /** quantité disponible chez le fournisseur (null = inconnue) */
  supplierAvailable?: number | null;
}

export interface ReplenishmentResult {
  /** quantité cible pour couvrir délai + horizon + sécurité */
  targetQuantity: number | null;
  /** quantité recommandée à commander (0 si rien à faire) */
  recommendedQuantity: number | null;
  /** quantité brute avant arrondi MOQ */
  rawQuantity: number | null;
  needed: boolean;
  explanation: string;
  usedDefaultLeadTime: boolean;
  /** avertissements (stock fournisseur insuffisant, délai inconnu...) */
  warnings: string[];
}

export const DEFAULT_LEAD_TIME_DAYS = 7;
export const DEFAULT_COVER_DAYS = 14;

export function computeReplenishment(input: ReplenishmentInput): ReplenishmentResult {
  const warnings: string[] = [];
  const onOrder = input.onOrder ?? 0;

  if (input.dailyVelocity === null) {
    const belowSafety = input.availableStock <= input.safetyStock;
    if (belowSafety && input.safetyStock > 0) {
      const raw = Math.max(0, input.safetyStock - input.availableStock - onOrder);
      const recommended = applyMoq(raw, input.moq ?? null);
      return {
        targetQuantity: input.safetyStock,
        recommendedQuantity: recommended,
        rawQuantity: raw,
        needed: recommended > 0,
        explanation: `Vitesse de vente inconnue (pas assez de données). Le stock disponible (${input.availableStock}) est sous le stock de sécurité (${input.safetyStock}) : nous recommandons ${recommended} unité(s) pour revenir au niveau de sécurité${moqNote(raw, recommended, input.moq)}.`,
        usedDefaultLeadTime: false,
        warnings,
      };
    }
    return {
      targetQuantity: null,
      recommendedQuantity: null,
      rawQuantity: null,
      needed: false,
      explanation: "Pas assez de données de vente pour recommander une quantité.",
      usedDefaultLeadTime: false,
      warnings,
    };
  }

  const usedDefaultLeadTime = input.leadTimeDays === null;
  const leadTime = input.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
  if (usedDefaultLeadTime) warnings.push(`Délai fournisseur inconnu : ${DEFAULT_LEAD_TIME_DAYS} jours utilisés par défaut.`);
  const coverDays = input.coverDays ?? DEFAULT_COVER_DAYS;

  const demandDuringLeadTime = input.dailyVelocity * leadTime;
  const demandDuringCover = input.dailyVelocity * coverDays;
  const target = Math.ceil(demandDuringLeadTime + demandDuringCover + input.safetyStock);
  const raw = Math.max(0, target - input.availableStock - onOrder);
  const recommended = applyMoq(raw, input.moq ?? null);

  if (input.supplierAvailable !== null && input.supplierAvailable !== undefined && recommended > input.supplierAvailable) {
    warnings.push(`Le fournisseur n'annonce que ${input.supplierAvailable} unité(s) disponibles.`);
  }

  const daysOfCover = input.dailyVelocity > 0 ? input.availableStock / input.dailyVelocity : Number.POSITIVE_INFINITY;
  const coverText =
    input.availableStock < 0
      ? `aucun jour (stock négatif : ${input.availableStock})`
      : input.availableStock === 0
        ? "aucun jour (rupture)"
        : Number.isFinite(daysOfCover)
          ? `${daysOfCover.toFixed(1)} jour(s)`
          : "plus de 90 jours";
  const stockTerm = input.availableStock < 0 ? `+ ${-input.availableStock} (stock négatif à compenser)` : `− ${input.availableStock} (stock)`;

  const explanation =
    raw === 0
      ? `Aucune commande nécessaire : votre stock (${input.availableStock}${onOrder ? ` + ${onOrder} en commande` : ""}) couvre environ ${coverText}, soit plus que le délai fournisseur (${leadTime} j) et l'horizon de ${coverDays} j avec un stock de sécurité de ${input.safetyStock}.`
      : `Nous recommandons ${recommended} unité(s) car votre vitesse moyenne est de ${formatVelocity(input.dailyVelocity)}/jour, votre fournisseur livre en ${leadTime} jour(s)${usedDefaultLeadTime ? " (délai par défaut)" : ""} et votre stock actuel couvre environ ${coverText}. Calcul : ${Math.ceil(demandDuringLeadTime)} (délai) + ${Math.ceil(demandDuringCover)} (${coverDays} j de couverture) + ${input.safetyStock} (sécurité) ${stockTerm}${onOrder ? ` − ${onOrder} (en commande)` : ""} = ${raw}${moqNote(raw, recommended, input.moq)}.`;

  return { targetQuantity: target, recommendedQuantity: recommended, rawQuantity: raw, needed: recommended > 0, explanation, usedDefaultLeadTime, warnings };
}

/** Vitesse lisible : 2 décimales sous 1 unité/jour (0,03 ≠ « 0,0 »), 1 décimale au-delà. */
export function formatVelocity(v: number): string {
  return v.toFixed(Math.abs(v) < 1 ? 2 : 1);
}

/** Arrondi au MOQ (et au multiple de MOQ si le besoin dépasse le MOQ). */
export function applyMoq(raw: number, moq: number | null): number {
  if (raw <= 0) return 0;
  if (!moq || moq <= 1) return raw;
  if (raw <= moq) return moq;
  return Math.ceil(raw / moq) * moq;
}

function moqNote(raw: number, recommended: number, moq: number | null | undefined): string {
  if (!moq || moq <= 1 || raw === recommended) return "";
  return `, arrondi à ${recommended} pour respecter le MOQ fournisseur de ${moq}`;
}
