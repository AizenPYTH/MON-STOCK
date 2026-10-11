/**
 * PROTOTYPE ISOLÉ (octobre 2026) — non branché dans l'application ni dans l'Edge Function.
 * Sert à évaluer Karrio (auto-hébergé) avant toute décision : voir
 * docs/research/karrio-sendcloud-audit-2026-10.md. Aucune route, aucun écran ne l'importe.
 * (Sendcloud est passé du prototype au connecteur réel src/integrations/shipping/sendcloud.ts.)
 */

/** Origine du prix : API du transporteur (compte du marchand) ou tarif négocié par un agrégateur. */
export type PrototypePriceBasis = "carrier_api" | "aggregator_tariff";

export interface PrototypeSurcharge {
  label: string;
  /** texte décimal exact (« 1.32 ») */
  amount: string;
}

export interface PrototypeQuote {
  key: string;
  via: "karrio";
  carrier: string;
  service: string;
  /** total facturé tel que renvoyé (texte décimal exact, > 0) */
  price: string;
  /** l'API ne précise pas toujours si le prix est HT ou TTC : null = non précisé (jamais supposé) */
  vatIncluded: boolean | null;
  surcharges: PrototypeSurcharge[];
  currency: string;
  /** délai fourni par l'API (heures), sinon null — jamais estimé localement */
  transitHours: number | null;
  deliveryToPickupPoint: boolean | null;
  tracked: boolean | null;
  priceBasis: PrototypePriceBasis;
  /** contraintes à respecter pour obtenir ce prix (ex. point relais à choisir) */
  requirements: string[];
  quotedAt: string;
}

/** Offre écartée volontairement (prix nul, grille statique, erreur) — affichée comme telle, jamais comme un prix. */
export interface RejectedQuote {
  carrier: string;
  service: string | null;
  reason: string;
}

export interface PrototypeQuoteResult {
  quotes: PrototypeQuote[];
  rejected: RejectedQuote[];
}

/** « 10.71 », 10.71 → « 10.71 » ; null si absent, non numérique ou négatif. */
export function decimalText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v).trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(s) ? s : null;
}

/** Vrai si le texte décimal vaut strictement plus que zéro. */
export function isPositiveDecimal(s: string): boolean {
  return /[1-9]/.test(s);
}
