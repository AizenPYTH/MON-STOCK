/**
 * Rotation du stock — combien de fois le stock moyen a été vendu sur la période.
 *
 *   rotation (30 j) = unités vendues sur la fenêtre / stock moyen sur la même fenêtre
 *
 * Le stock moyen est reconstitué exactement depuis le journal des mouvements (fonction SQL
 * sku_rotation). Jamais d'estimation : si la fenêtre observée est trop courte ou si le stock
 * moyen est nul / négatif, la rotation n'est pas calculée (« Pas assez de données »).
 */
export interface RotationInput {
  unitsSold: number;
  /** stock moyen (pondéré par le temps) sur la fenêtre ; null = inconnu */
  avgOnHand: number | null;
  /** durée réellement couverte (jours) : 30, ou moins pour un SKU récent */
  windowDays: number;
}

export interface RotationResult {
  /** nombre de rotations sur la fenêtre ; null si non calculable */
  rotation: number | null;
  /** couverture moyenne (jours) = fenêtre / rotation ; null si pas de vente ou non calculable */
  averageDaysToSell: number | null;
  explanation: string;
}

export const MIN_ROTATION_WINDOW_DAYS = 7;

export function computeRotation(input: RotationInput): RotationResult {
  const days = Math.round(input.windowDays);
  if (!Number.isFinite(input.windowDays) || input.windowDays < MIN_ROTATION_WINDOW_DAYS) {
    return { rotation: null, averageDaysToSell: null, explanation: `Pas assez de données : SKU suivi depuis moins de ${MIN_ROTATION_WINDOW_DAYS} jours.` };
  }
  if (input.avgOnHand === null || !Number.isFinite(input.avgOnHand) || input.avgOnHand <= 0) {
    return { rotation: null, averageDaysToSell: null, explanation: `Pas assez de données : stock moyen nul ou négatif sur ${days} jours.` };
  }
  const rotation = Math.max(0, input.unitsSold) / input.avgOnHand;
  const avg = Math.round(input.avgOnHand * 10) / 10;
  if (rotation === 0) {
    return { rotation: 0, averageDaysToSell: null, explanation: `Aucune vente sur ${days} jours pour un stock moyen de ${avg} unité(s).` };
  }
  return {
    rotation,
    averageDaysToSell: input.windowDays / rotation,
    explanation: `${input.unitsSold} unité(s) vendue(s) sur ${days} jours pour un stock moyen de ${avg} unité(s).`,
  };
}
