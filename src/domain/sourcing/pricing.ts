/**
 * Helpers de prix du sourcing : conversion de devise (avec taux fourni, original conservé),
 * HT/TTC (uniquement si le type de taxe est connu), prix comparable tenant compte du MOQ,
 * fraîcheur des données et statistiques d'historique.
 */
import type { TaxType } from "@/domain/sourcing/types";

export interface ConvertedPrice {
  original: number;
  originalCurrency: string;
  amount: number;
  currency: string;
  rate: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Convertit un montant avec un taux fourni. Taux null → conversion indisponible (null). */
export function convertPrice(amount: number, from: string, to: string, rate: number | null): ConvertedPrice | null {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return { original: amount, originalCurrency: f, amount: round4(amount), currency: t, rate: 1 };
  if (rate === null || !Number.isFinite(rate) || rate <= 0) return null;
  return { original: amount, originalCurrency: f, amount: round4(amount * rate), currency: t, rate };
}

export function toHt(ttc: number, vatRatePercent: number): number {
  return round4(ttc / (1 + vatRatePercent / 100));
}

export function toTtc(ht: number, vatRatePercent: number): number {
  return round4(ht * (1 + vatRatePercent / 100));
}

export interface TaxNormalization {
  amount: number | null;
  taxType: TaxType;
  converted: boolean;
  note: string | null;
}

/**
 * Ramène un prix sur la base demandée (ht ou ttc) si son type de taxe et le taux de TVA
 * sont connus. Sinon : montant inchangé et note explicite, jamais de conversion devinée.
 */
export function normalizeTax(amount: number, taxType: TaxType, target: "ht" | "ttc", vatRatePercent: number | null): TaxNormalization {
  if (taxType === "unknown") return { amount, taxType: "unknown", converted: false, note: "HT/TTC non communiqué : prix affiché tel quel" };
  if (taxType === target) return { amount, taxType: target, converted: false, note: null };
  if (vatRatePercent === null || !Number.isFinite(vatRatePercent)) return { amount, taxType, converted: false, note: "Taux de TVA non renseigné dans les paramètres : conversion HT/TTC impossible" };
  const converted = target === "ht" ? toHt(amount, vatRatePercent) : toTtc(amount, vatRatePercent);
  return { amount: converted, taxType: target, converted: true, note: `Converti ${taxType.toUpperCase()} → ${target.toUpperCase()} avec une TVA de ${vatRatePercent} %` };
}

export interface ComparablePriceInput {
  unitPrice: number;
  moq: number | null;
  minimumOrderValue: number | null;
}

export interface ComparablePrice {
  unitPrice: number;
  /** quantité minimale à commander (MOQ ou 1) */
  minimumUnits: number;
  /** montant minimum réel = max(prix × MOQ, minimum de commande) */
  minimumOrderValue: number;
  /** vrai si le minimum de commande impose plus que le MOQ */
  constrainedByOrderValue: boolean;
}

export function comparablePrice(input: ComparablePriceInput): ComparablePrice {
  const minimumUnits = input.moq && input.moq > 0 ? input.moq : 1;
  const byMoq = round2(input.unitPrice * minimumUnits);
  const mov = input.minimumOrderValue ?? 0;
  const minimumOrderValue = Math.max(byMoq, mov);
  return { unitPrice: input.unitPrice, minimumUnits, minimumOrderValue: round2(minimumOrderValue), constrainedByOrderValue: mov > byMoq };
}

export const STALE_HOURS = 48;
export const VERY_STALE_DAYS = 7;

export interface Freshness {
  label: string;
  ageHours: number | null;
  stale: boolean;
  veryStale: boolean;
  warning: string | null;
}

export function freshness(lastSeenAt: string | Date | null | undefined, now: Date = new Date()): Freshness {
  if (!lastSeenAt) return { label: "Date de vérification inconnue", ageHours: null, stale: true, veryStale: true, warning: "Donnée potentiellement obsolète" };
  const d = typeof lastSeenAt === "string" ? new Date(lastSeenAt) : lastSeenAt;
  if (Number.isNaN(d.getTime())) return { label: "Date de vérification inconnue", ageHours: null, stale: true, veryStale: true, warning: "Donnée potentiellement obsolète" };
  const ms = Math.max(0, now.getTime() - d.getTime());
  const ageHours = ms / 3_600_000;
  const minutes = Math.round(ms / 60_000);
  let rel: string;
  if (minutes < 1) rel = "à l'instant";
  else if (minutes < 60) rel = `il y a ${minutes} minute${minutes > 1 ? "s" : ""}`;
  else if (ageHours < 24) {
    const h = Math.round(ageHours);
    rel = `il y a ${h} heure${h > 1 ? "s" : ""}`;
  } else {
    const days = Math.round(ageHours / 24);
    rel = `il y a ${days} jour${days > 1 ? "s" : ""}`;
  }
  const veryStale = ageHours > VERY_STALE_DAYS * 24;
  const stale = ageHours > STALE_HOURS;
  return { label: `Vérifié ${rel}`, ageHours: Math.round(ageHours * 10) / 10, stale, veryStale, warning: veryStale ? "Prix potentiellement obsolète" : stale ? "Donnée potentiellement obsolète" : null };
}

export interface PricePoint {
  price: number;
  recordedAt: string | Date;
}

export interface PriceStats {
  current: number | null;
  previous: number | null;
  avg30d: number | null;
  min30d: number | null;
  max30d: number | null;
  count30d: number;
  /** écart du prix courant vs moyenne 30 j, en % (négatif = moins cher) */
  vsAveragePercent: number | null;
  /** variation entre le prix précédent et le prix courant, en % (négatif = baisse) */
  changePercent: number | null;
}

export function priceHistoryStats(points: PricePoint[], now: Date = new Date()): PriceStats {
  const sorted = [...points]
    .map((p) => ({ price: p.price, at: typeof p.recordedAt === "string" ? new Date(p.recordedAt) : p.recordedAt }))
    .filter((p) => Number.isFinite(p.price) && !Number.isNaN(p.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const current = sorted.length > 0 ? sorted[sorted.length - 1]!.price : null;
  const previous = sorted.length > 1 ? sorted[sorted.length - 2]!.price : null;
  const cutoff = now.getTime() - 30 * 86_400_000;
  const last30 = sorted.filter((p) => p.at.getTime() >= cutoff).map((p) => p.price);
  const avg30d = last30.length > 0 ? round2(last30.reduce((a, b) => a + b, 0) / last30.length) : null;
  const min30d = last30.length > 0 ? Math.min(...last30) : null;
  const max30d = last30.length > 0 ? Math.max(...last30) : null;
  const vsAveragePercent = current !== null && avg30d !== null && avg30d > 0 && last30.length >= 2 ? round2(((current - avg30d) / avg30d) * 100) : null;
  const changePercent = current !== null && previous !== null && previous > 0 ? round2(((current - previous) / previous) * 100) : null;
  return { current, previous, avg30d, min30d, max30d, count30d: last30.length, vsAveragePercent, changePercent };
}

export const TAX_LABEL: Record<TaxType, string> = { ht: "HT", ttc: "TTC", unknown: "HT/TTC non communiqué" };
