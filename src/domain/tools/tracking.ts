/**
 * Suivi de colis (module pur, partagé) : normalisation et détection du transporteur d'après le
 * numéro, statuts normalisés, calendrier d'actualisation, décisions d'alerte.
 *
 * Règles : un statut ou une date de livraison ne viennent QUE d'une API de suivi ; la détection
 * par motif est une SUGGESTION (plusieurs transporteurs partagent les mêmes formats numériques)
 * que l'utilisateur peut corriger.
 */

export type CarrierCode = "laposte" | "colissimo" | "chronopost" | "ups" | "dhl" | "dpd" | "gls" | "mondial_relay" | "colis_prive" | "relais_colis" | "fedex" | "amazon" | "other";

export const CARRIER_LABEL: Record<CarrierCode, string> = {
  laposte: "La Poste",
  colissimo: "Colissimo",
  chronopost: "Chronopost",
  ups: "UPS",
  dhl: "DHL",
  dpd: "DPD",
  gls: "GLS",
  mondial_relay: "Mondial Relay",
  colis_prive: "Colis Privé",
  relais_colis: "Relais Colis",
  fedex: "FedEx",
  amazon: "Amazon Logistics",
  other: "Autre transporteur",
};

/** Transporteurs couverts par l'API officielle La Poste « Suivi v2 ». */
export const LA_POSTE_GROUP: CarrierCode[] = ["laposte", "colissimo", "chronopost"];

export type TrackingStatus =
  | "pending"
  | "info_received"
  | "in_transit"
  | "out_for_delivery"
  | "available_for_pickup"
  | "failed_attempt"
  | "exception"
  | "delivered"
  | "returned"
  | "expired"
  | "not_found"
  | "unknown";

export const TRACKING_STATUS_LABEL: Record<TrackingStatus, string> = {
  pending: "En attente d'informations",
  info_received: "Étiquette créée, colis pas encore pris en charge",
  in_transit: "En transit",
  out_for_delivery: "En cours de livraison",
  available_for_pickup: "Disponible en point de retrait",
  failed_attempt: "Échec de livraison",
  exception: "Incident de transport",
  delivered: "Livré",
  returned: "Retourné à l'expéditeur",
  expired: "Suivi expiré",
  not_found: "Numéro inconnu du transporteur",
  unknown: "Statut non disponible",
};

/** Statuts finaux : plus d'actualisation automatique. */
export const FINAL_STATUSES = new Set<TrackingStatus>(["delivered", "returned", "expired"]);

export const PROBLEM_STATUSES = new Set<TrackingStatus>(["failed_attempt", "exception", "returned"]);

/** Majuscules, sans espaces ni tirets (les transporteurs impriment souvent « 6A 1898 7970 674 »). */
export function normalizeTrackingNumber(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-.  ]/g, "");
}

export type TrackingNumberError = "empty" | "too_short" | "too_long" | "invalid_chars";

export function validateTrackingNumber(raw: string): { ok: true; number: string } | { ok: false; error: TrackingNumberError } {
  const n = normalizeTrackingNumber(raw);
  if (n === "") return { ok: false, error: "empty" };
  if (!/^[A-Z0-9]+$/.test(n)) return { ok: false, error: "invalid_chars" };
  if (n.length < 8) return { ok: false, error: "too_short" };
  if (n.length > 40) return { ok: false, error: "too_long" };
  return { ok: true, number: n };
}

export const TRACKING_NUMBER_ERROR_LABEL: Record<TrackingNumberError, string> = {
  empty: "Saisissez un numéro de suivi.",
  too_short: "Numéro trop court (8 caractères minimum).",
  too_long: "Numéro trop long (40 caractères maximum).",
  invalid_chars: "Lettres et chiffres uniquement.",
};

/** Clé de contrôle UPU S10 (8 chiffres de série, pondérations 8 6 4 2 3 5 9 7). */
export function s10CheckDigit(serial: string): number | null {
  if (!/^\d{8}$/.test(serial)) return null;
  const weights = [8, 6, 4, 2, 3, 5, 9, 7];
  const sum = serial.split("").reduce((acc, d, i) => acc + Number(d) * weights[i]!, 0);
  const check = 11 - (sum % 11);
  return check === 10 ? 0 : check === 11 ? 5 : check;
}

export type DetectionConfidence = "high" | "medium" | "low";

export interface CarrierCandidate {
  carrier: CarrierCode;
  confidence: DetectionConfidence;
  reason: string;
}

/**
 * Transporteurs plausibles pour un numéro, du plus probable au moins probable. Liste vide =
 * format non reconnu (le transporteur peut être choisi à la main, ou détecté par l'API).
 */
export function detectCarriers(raw: string): CarrierCandidate[] {
  const n = normalizeTrackingNumber(raw);
  const out: CarrierCandidate[] = [];
  const s10 = /^([A-Z]{2})(\d{8})(\d)([A-Z]{2})$/.exec(n);
  if (s10) {
    const valid = s10CheckDigit(s10[2]!) === Number(s10[3]);
    if (s10[4] === "FR") {
      out.push({ carrier: "laposte", confidence: valid ? "high" : "medium", reason: `Format postal international (S10) émis en France${valid ? ", clé de contrôle valide" : ""}.` });
      out.push({ carrier: "chronopost", confidence: "low", reason: "Chronopost utilise aussi ce format." });
    } else {
      out.push({ carrier: "other", confidence: valid ? "medium" : "low", reason: `Format postal international (S10) émis par ${s10[4]} : la poste du pays d'arrivée prend le relais.` });
    }
    return out;
  }
  if (/^1Z[A-Z0-9]{15}\d$/.test(n)) return [{ carrier: "ups", confidence: "high", reason: "Format UPS (1Z…, 18 caractères)." }];
  if (/^TB[ACM]\d{12}$/.test(n)) return [{ carrier: "amazon", confidence: "high", reason: "Format Amazon Logistics (TBA…)." }];
  if (/^\d[A-Z]\d{11}$/.test(n)) return [{ carrier: "colissimo", confidence: "medium", reason: "Format Colissimo / La Poste (13 caractères, ex. 6A…)." }];
  if (/^J[A-Z]{2,3}\d{9,10}$/.test(n)) return [{ carrier: "dhl", confidence: "medium", reason: "Format de colis DHL (J…)." }];
  if (/^\d+$/.test(n)) {
    // Formats purement numériques : partagés par plusieurs transporteurs → suggestions faibles.
    const len = n.length;
    if (len === 8) out.push({ carrier: "mondial_relay", confidence: "low", reason: "8 chiffres : souvent Mondial Relay." });
    if (len === 10 || len === 11) out.push({ carrier: "dhl", confidence: "low", reason: `${len} chiffres : souvent DHL Express.` });
    if (len === 11 || len === 12) out.push({ carrier: "gls", confidence: "low", reason: `${len} chiffres : souvent GLS.` });
    if (len === 12) out.push({ carrier: "mondial_relay", confidence: "low", reason: "12 chiffres : parfois Mondial Relay." });
    if (len === 12 || len === 15) out.push({ carrier: "fedex", confidence: "low", reason: `${len} chiffres : souvent FedEx.` });
    if (len === 14) out.push({ carrier: "dpd", confidence: "low", reason: "14 chiffres : souvent DPD." });
  }
  return out;
}

export type TrackingProviderId = "laposte" | "ship24";

/**
 * API à interroger : La Poste « Suivi v2 » pour le groupe La Poste (gratuit, officiel), sinon
 * l'agrégateur multi-transporteurs. null = aucune API configurée pour ce numéro.
 */
export function chooseProvider(carrier: CarrierCode | null, configured: { laposte: boolean; ship24: boolean }): TrackingProviderId | null {
  if (carrier && LA_POSTE_GROUP.includes(carrier) && configured.laposte) return "laposte";
  if (configured.ship24) return "ship24";
  if (carrier === null && configured.laposte) return "laposte";
  return null;
}

/** Codes d'événement La Poste « Suivi v2 » → statut normalisé (code inconnu → null). */
export function laPosteEventStatus(code: string | null | undefined): TrackingStatus | null {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c === "DR1") return "info_received";
  if (/^(PC[12]|ET[1-4]|EP1|DO[1-3]|PB2)$/.test(c)) return "in_transit";
  if (c === "PB1") return "exception";
  if (c === "MD2") return "out_for_delivery";
  if (c === "ND1") return "failed_attempt";
  if (c === "AG1") return "available_for_pickup";
  if (c === "RE1" || c === "DI2") return "returned";
  if (c === "DI1") return "delivered";
  return null;
}

/** Jalons Ship24 (`statusMilestone`) → statut normalisé. */
export function ship24MilestoneStatus(milestone: string | null | undefined): TrackingStatus {
  switch (milestone) {
    case "pending":
      return "pending";
    case "info_received":
      return "info_received";
    case "in_transit":
      return "in_transit";
    case "out_for_delivery":
      return "out_for_delivery";
    case "failed_attempt":
      return "failed_attempt";
    case "available_for_pickup":
      return "available_for_pickup";
    case "delivered":
      return "delivered";
    case "exception":
      return "exception";
    default:
      return "unknown";
  }
}

export interface TrackingEvent {
  /** horodatage tel que fourni par le transporteur (ISO) */
  at: string | null;
  label: string;
  location: string | null;
  status: TrackingStatus | null;
  code: string | null;
}

export interface TrackingSnapshot {
  status: TrackingStatus;
  statusDetail: string | null;
  /** date de livraison estimée FOURNIE par l'API (jamais calculée) */
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  events: TrackingEvent[];
  carrierLabel: string | null;
  providerUrl: string | null;
}

/** Événements du plus récent au plus ancien (date inconnue en dernier), sans doublon. */
export function sortEvents(events: TrackingEvent[]): TrackingEvent[] {
  const seen = new Set<string>();
  const unique = events.filter((e) => {
    const k = `${e.at ?? ""}|${e.code ?? ""}|${e.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.sort((a, b) => (b.at ? Date.parse(b.at) : -Infinity) - (a.at ? Date.parse(a.at) : -Infinity));
}

const HOUR = 3_600_000;

/**
 * Prochaine actualisation automatique (sobre : l'API n'est interrogée que pour les colis non
 * finalisés, de moins en moins souvent). null = plus d'actualisation automatique.
 */
export function nextCheckAt(status: TrackingStatus, now: Date, ctx: { createdAt: string; checkCount: number }): Date | null {
  if (FINAL_STATUSES.has(status)) return null;
  const ageDays = (now.getTime() - Date.parse(ctx.createdAt)) / (24 * HOUR);
  if (ageDays > 60) return null; // suivi abandonné au-delà de 60 jours
  let hours: number;
  switch (status) {
    case "out_for_delivery":
      hours = 2;
      break;
    case "in_transit":
    case "available_for_pickup":
    case "failed_attempt":
    case "exception":
      hours = 4;
      break;
    case "info_received":
    case "pending":
      hours = 8;
      break;
    case "not_found":
      if (ageDays > 7) return null; // numéro jamais trouvé en 7 jours : on arrête
      hours = 12;
      break;
    default:
      hours = 12;
  }
  return new Date(now.getTime() + hours * HOUR);
}

export type TrackingAlertKind = "parcel_delivered" | "parcel_problem" | "parcel_delayed";

export interface TrackingAlert {
  kind: TrackingAlertKind;
  severity: "info" | "warning";
  title: string;
  message: string;
  /** clé de déduplication (une alerte par colis et par événement) */
  dedupeKey: string;
}

/**
 * Alertes à émettre après une actualisation (comparaison ancien / nouveau statut). Retard :
 * uniquement si l'API a fourni une date estimée désormais dépassée.
 */
export function trackingAlerts(parcel: { id: string; label: string; trackingNumber: string }, previous: TrackingStatus | null, next: TrackingSnapshot, now: Date): TrackingAlert[] {
  const name = parcel.label || parcel.trackingNumber;
  const out: TrackingAlert[] = [];
  if (next.status === "delivered" && previous !== "delivered") {
    out.push({ kind: "parcel_delivered", severity: "info", title: "Colis livré", message: `${name} a été livré${next.deliveredAt ? ` le ${next.deliveredAt.slice(0, 10).split("-").reverse().join("/")}` : ""}.`, dedupeKey: `parcel_delivered:${parcel.id}` });
  }
  if (PROBLEM_STATUSES.has(next.status) && previous !== next.status) {
    out.push({ kind: "parcel_problem", severity: "warning", title: "Problème de livraison", message: `${name} : ${TRACKING_STATUS_LABEL[next.status].toLowerCase()}${next.statusDetail ? ` (${next.statusDetail})` : ""}.`, dedupeKey: `parcel_problem:${parcel.id}:${next.status}` });
  }
  if (next.estimatedDelivery && !FINAL_STATUSES.has(next.status)) {
    const due = Date.parse(next.estimatedDelivery);
    // la date estimée est souvent un jour sans heure : retard seulement après la fin de ce jour
    if (!Number.isNaN(due) && now.getTime() > due + 24 * HOUR) {
      out.push({ kind: "parcel_delayed", severity: "warning", title: "Colis en retard", message: `${name} devait être livré le ${next.estimatedDelivery.slice(0, 10).split("-").reverse().join("/")} et ne l'est pas encore.`, dedupeKey: `parcel_delayed:${parcel.id}:${next.estimatedDelivery.slice(0, 10)}` });
    }
  }
  return out;
}
