/**
 * Niveau de confiance d'une offre (donnée affichée à l'utilisateur), par ordre de priorité :
 *
 *   🔴 « Offre expirée »        statut expiré / rejeté, date d'expiration passée, ou vue il y a > 30 jours
 *   🟡 « Donnée ancienne »      vue il y a > 48 h (ou date de vérification inconnue)
 *   🟠 « Stock incertain »      stock inconnu, confiance stock < 0,6, ou source découverte non validée
 *   🟢 « Vérifié récemment »    vue ≤ 24 h, confiance prix ≥ 0,9, statut actif
 *   ⚪ « À confirmer »          aucun des cas précédents (vue entre 24 et 48 h, confiance prix < 0,9
 *                               ou inconnue, offre suspecte) — jamais promue « vérifiée » par défaut
 *
 * Chaque niveau porte ses raisons. Formatage relatif en français : « il y a 5 minutes ».
 */

export type ConfidenceLevel = "verified_recently" | "unconfirmed" | "stock_uncertain" | "stale" | "expired";

export interface ConfidenceInput {
  lastSeenAt: string | Date | null;
  status: "active" | "expired" | "suspicious" | "rejected";
  expiresAt?: string | Date | null;
  /** confiance dans le prix 0–1 (null = inconnue) */
  priceConfidence: number | null;
  /** confiance dans le stock 0–1 (null = inconnue) */
  stockConfidence: number | null;
  /** la source communique un stock (quantité ou statut) */
  stockKnown: boolean;
  /** source découverte automatiquement et pas encore validée par l'utilisateur */
  sourceDiscovered?: boolean;
  /** la source a été validée (accès automatisé attesté) */
  sourceValidated?: boolean;
}

export interface OfferConfidence {
  level: ConfidenceLevel;
  emoji: string;
  label: string;
  reasons: string[];
  ageMinutes: number | null;
  /** « Dernière vérification : il y a N minutes » */
  lastCheckedLabel: string;
}

export const CONFIDENCE_META: Record<ConfidenceLevel, { emoji: string; label: string }> = {
  verified_recently: { emoji: "🟢", label: "Vérifié récemment" },
  unconfirmed: { emoji: "⚪", label: "À confirmer" },
  stock_uncertain: { emoji: "🟠", label: "Stock incertain" },
  stale: { emoji: "🟡", label: "Donnée ancienne" },
  expired: { emoji: "🔴", label: "Offre expirée" },
};

export const FRESH_HOURS = 24;
export const STALE_AFTER_HOURS = 48;
export const EXPIRED_AFTER_DAYS = 30;
export const MIN_PRICE_CONFIDENCE = 0.9;
export const MIN_STOCK_CONFIDENCE = 0.6;

function toDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(x.getTime()) ? null : x;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

/** Durée écoulée en français : « à l'instant », « il y a 5 minutes », « il y a 3 heures », « il y a 2 jours ». */
export function formatRelativeFr(ms: number): string {
  const safe = Math.max(0, ms);
  const minutes = Math.floor(safe / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${plural(minutes, "minute")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${plural(hours, "heure")}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${plural(days, "jour")}`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
}

/** « Dernière vérification : il y a N minutes » (ou « date inconnue »). */
export function formatLastChecked(lastSeenAt: string | Date | null | undefined, now: Date = new Date()): string {
  const d = toDate(lastSeenAt);
  if (!d) return "Dernière vérification : date inconnue";
  return `Dernière vérification : ${formatRelativeFr(now.getTime() - d.getTime())}`;
}

export function assessOfferConfidence(input: ConfidenceInput, now: Date = new Date()): OfferConfidence {
  const seen = toDate(input.lastSeenAt);
  const ageMs = seen ? Math.max(0, now.getTime() - seen.getTime()) : null;
  const ageHours = ageMs !== null ? ageMs / 3_600_000 : null;
  const lastCheckedLabel = formatLastChecked(input.lastSeenAt, now);

  const expired: string[] = [];
  const stale: string[] = [];
  const stock: string[] = [];
  const unconfirmed: string[] = [];

  const expiresAt = toDate(input.expiresAt);
  if (input.status === "expired") expired.push("Offre marquée expirée par la source");
  if (input.status === "rejected") expired.push("Offre rejetée par la validation des données");
  if (expiresAt && expiresAt.getTime() < now.getTime()) expired.push("Date d'expiration dépassée");
  if (ageHours !== null && ageHours > EXPIRED_AFTER_DAYS * 24) expired.push(`Non revue depuis plus de ${EXPIRED_AFTER_DAYS} jours`);

  if (ageHours === null) stale.push("Date de dernière vérification inconnue");
  else if (ageHours > STALE_AFTER_HOURS) stale.push(`Vue ${formatRelativeFr(ageMs as number)} (plus de ${STALE_AFTER_HOURS} h)`);

  if (!input.stockKnown) stock.push("Stock non communiqué par la source");
  else if (input.stockConfidence !== null && input.stockConfidence < MIN_STOCK_CONFIDENCE) stock.push(`Confiance stock faible (${Math.round(input.stockConfidence * 100)} %)`);
  if (input.sourceDiscovered && !input.sourceValidated) stock.push("Source découverte automatiquement, pas encore validée");
  else if (input.sourceValidated === false) stock.push("Source non validée");

  if (ageHours !== null && ageHours > FRESH_HOURS && ageHours <= STALE_AFTER_HOURS) unconfirmed.push(`Vue ${formatRelativeFr(ageMs as number)} (plus de ${FRESH_HOURS} h)`);
  if (input.priceConfidence === null) unconfirmed.push("Confiance prix inconnue");
  else if (input.priceConfidence < MIN_PRICE_CONFIDENCE) unconfirmed.push(`Confiance prix ${Math.round(input.priceConfidence * 100)} % (< ${Math.round(MIN_PRICE_CONFIDENCE * 100)} %)`);
  if (input.status === "suspicious") unconfirmed.push("Offre signalée suspecte par la validation");

  const build = (level: ConfidenceLevel, reasons: string[]): OfferConfidence => ({ level, ...CONFIDENCE_META[level], reasons, ageMinutes: ageMs !== null ? Math.floor(ageMs / 60_000) : null, lastCheckedLabel });

  if (expired.length > 0) return build("expired", expired);
  if (stale.length > 0) return build("stale", [...stale, ...stock]);
  if (stock.length > 0) return build("stock_uncertain", [...stock, ...unconfirmed]);
  if (unconfirmed.length === 0 && input.status === "active" && ageHours !== null && ageHours <= FRESH_HOURS) {
    return build("verified_recently", [`Vue ${formatRelativeFr(ageMs as number)}`, `Confiance prix ${Math.round((input.priceConfidence as number) * 100)} %`]);
  }
  return build("unconfirmed", unconfirmed.length > 0 ? unconfirmed : ["Données à confirmer"]);
}
