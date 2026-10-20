import { canonicalTrackingNumber, CARRIER_LABEL, detectCarriers, extractTrackingFromScan, TRACKING_NUMBER_ERROR_LABEL, validateTrackingNumber, type CarrierCandidate, type CarrierCode } from "@/domain/tools/tracking";

/**
 * Saisie d'un numéro de suivi (module pur) : validation, transporteur détecté (suggestion
 * corrigeable) et lecture d'une liste de numéros collés (un par ligne), mêmes règles que
 * l'écran « Suivre un colis » de l'application.
 */

export interface TrackingEntryState {
  /** numéro canonique si valide */
  number: string | null;
  error: string | null;
  candidates: CarrierCandidate[];
  /** transporteur retenu : choisi à la main, sinon suggestion fiable, sinon celui choisi */
  carrier: CarrierCode | null;
  /** « Colissimo détecté », « UPS choisi », « Transporteur détecté au premier suivi » */
  detectedText: string | null;
}

export function evaluateTrackingEntry(raw: string, manual: { enabled: boolean; carrier: CarrierCode | null }): TrackingEntryState {
  if (!raw.trim()) return { number: null, error: null, candidates: [], carrier: manual.enabled ? manual.carrier : null, detectedText: null };
  const v = validateTrackingNumber(raw);
  if (!v.ok) return { number: null, error: TRACKING_NUMBER_ERROR_LABEL[v.error], candidates: [], carrier: manual.enabled ? manual.carrier : null, detectedText: null };
  const candidates = detectCarriers(v.number);
  const suggested = candidates[0] && candidates[0].confidence !== "low" ? candidates[0].carrier : null;
  const carrier = manual.enabled ? manual.carrier : (suggested ?? manual.carrier);
  const detectedText = carrier ? `${CARRIER_LABEL[carrier]} ${manual.enabled ? "choisi" : "détecté"}` : "Transporteur détecté au premier suivi";
  return { number: canonicalTrackingNumber(v.number), error: null, candidates, carrier, detectedText };
}

export interface QueuedParcel {
  number: string;
  carrier: CarrierCode | null;
}

/** Texte collé (un numéro ou un contenu de code-barres par ligne) → numéros à suivre, sans doublon. */
export function parseTrackingLines(text: string, already: QueuedParcel[] = []): { items: QueuedParcel[]; rejected: string[]; duplicates: string[] } {
  const items: QueuedParcel[] = [];
  const rejected: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set(already.map((q) => q.number));
  for (const line of text.split(/\r?\n|;/)) {
    const raw = line.trim();
    if (!raw) continue;
    const found = extractTrackingFromScan(raw);
    const v = found ? validateTrackingNumber(found.number) : null;
    if (!found || !v?.ok) {
      rejected.push(raw.slice(0, 60));
      continue;
    }
    const number = canonicalTrackingNumber(v.number);
    if (seen.has(number)) {
      duplicates.push(number);
      continue;
    }
    seen.add(number);
    items.push({ number, carrier: found.carrier });
  }
  return { items, rejected, duplicates };
}

export const queuedText = (q: QueuedParcel) => `${q.number}${q.carrier ? ` · ${CARRIER_LABEL[q.carrier]}` : ""}`;
