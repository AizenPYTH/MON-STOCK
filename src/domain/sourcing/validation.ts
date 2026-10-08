/**
 * DataValidationService — anomalies d'une offre entrante. Un prix à 0 n'est jamais
 * enregistré comme nouveau prix valide : le prix précédent est conservé et l'offre
 * est marquée « suspicious ».
 */
import { ISO_4217 } from "@/domain/sourcing/dictionaries";

export interface OfferToValidate {
  title: string | null | undefined;
  price: number | null;
  currency: string | null;
  moq: number | null;
  availableQuantity: number | null;
  sourceUrl: string | null;
}

export interface ValidationHistory {
  /** dernier prix enregistré pour cette offre (même devise), null si nouvelle offre */
  previousPrice: number | null;
  /** prix des 30 derniers jours (même devise) */
  prices30d: number[];
}

export type AnomalyCode = "title_missing" | "price_missing" | "price_zero" | "price_negative" | "price_too_low" | "price_too_high" | "negative_stock" | "moq_invalid" | "currency_unknown" | "url_invalid";

export interface OfferAnomaly {
  code: AnomalyCode;
  message: string;
  severity: "blocking" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  anomalies: OfferAnomaly[];
  anomalyCodes: AnomalyCode[];
  status: "active" | "suspicious";
  /** prix à enregistrer (prix précédent si le nouveau est 0), null si aucun prix exploitable */
  effectivePrice: number | null;
  /** vrai si le prix reçu a été rejeté */
  priceRejected: boolean;
  /** quantité à enregistrer (null si incohérente) */
  effectiveQuantity: number | null;
  effectiveMoq: number | null;
  effectiveUrl: string | null;
}

export const ANOMALY_LABEL: Record<AnomalyCode, string> = {
  title_missing: "Titre manquant",
  price_missing: "Prix manquant",
  price_zero: "Prix à 0 (ignoré, prix précédent conservé)",
  price_negative: "Prix négatif",
  price_too_low: "Prix anormalement bas par rapport à l'historique",
  price_too_high: "Prix anormalement élevé par rapport à l'historique",
  negative_stock: "Stock négatif",
  moq_invalid: "MOQ incohérent",
  currency_unknown: "Devise inconnue",
  url_invalid: "URL invalide",
};

export const PRICE_LOW_RATIO = 0.3;
export const PRICE_HIGH_RATIO = 3;
export const MOQ_MAX = 1_000_000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

export function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateOffer(offer: OfferToValidate, history: ValidationHistory = { previousPrice: null, prices30d: [] }): ValidationResult {
  const anomalies: OfferAnomaly[] = [];
  const add = (code: AnomalyCode, severity: OfferAnomaly["severity"], extra?: string) => anomalies.push({ code, severity, message: extra ? `${ANOMALY_LABEL[code]} : ${extra}` : ANOMALY_LABEL[code] });

  if (!offer.title || offer.title.trim().length === 0) add("title_missing", "blocking");

  const currency = offer.currency?.trim().toUpperCase() ?? "";
  if (!currency || !ISO_4217.has(currency)) add("currency_unknown", "blocking", currency ? `« ${currency} » n'est pas un code ISO 4217 connu` : "aucune devise fournie");

  let effectivePrice: number | null = null;
  let priceRejected = false;
  if (offer.price === null || !Number.isFinite(offer.price)) {
    if (history.previousPrice !== null) {
      effectivePrice = history.previousPrice;
      priceRejected = true;
      add("price_missing", "warning", "prix précédent conservé");
    } else {
      add("price_missing", "blocking");
    }
  } else if (offer.price < 0) {
    add("price_negative", history.previousPrice !== null ? "warning" : "blocking");
    effectivePrice = history.previousPrice;
    priceRejected = true;
  } else if (offer.price === 0) {
    add("price_zero", history.previousPrice !== null ? "warning" : "blocking");
    effectivePrice = history.previousPrice;
    priceRejected = true;
  } else {
    effectivePrice = offer.price;
    const med = median(history.prices30d);
    if (med !== null && med > 0 && history.prices30d.length >= 2) {
      if (offer.price < med * PRICE_LOW_RATIO) add("price_too_low", "warning", `${offer.price} contre une médiane de ${med.toFixed(2)} sur 30 jours`);
      else if (offer.price > med * PRICE_HIGH_RATIO) add("price_too_high", "warning", `${offer.price} contre une médiane de ${med.toFixed(2)} sur 30 jours`);
    }
  }

  let effectiveQuantity = offer.availableQuantity;
  if (offer.availableQuantity !== null && (offer.availableQuantity < 0 || !Number.isFinite(offer.availableQuantity))) {
    add("negative_stock", "warning", String(offer.availableQuantity));
    effectiveQuantity = null;
  } else if (effectiveQuantity !== null) {
    effectiveQuantity = Math.floor(effectiveQuantity);
  }

  let effectiveMoq = offer.moq;
  if (offer.moq !== null && (!Number.isFinite(offer.moq) || offer.moq < 1 || offer.moq > MOQ_MAX || !Number.isInteger(offer.moq))) {
    add("moq_invalid", "warning", String(offer.moq));
    effectiveMoq = null;
  }

  let effectiveUrl = offer.sourceUrl?.trim() || null;
  if (effectiveUrl && !isValidHttpUrl(effectiveUrl)) {
    add("url_invalid", "warning", effectiveUrl.slice(0, 80));
    effectiveUrl = null;
  }

  const blocking = anomalies.some((a) => a.severity === "blocking");
  const valid = !blocking && effectivePrice !== null;
  const status: ValidationResult["status"] = anomalies.length > 0 ? "suspicious" : "active";
  return {
    valid,
    anomalies,
    anomalyCodes: anomalies.map((a) => a.code),
    status,
    effectivePrice,
    priceRejected,
    effectiveQuantity,
    effectiveMoq,
    effectiveUrl,
  };
}
