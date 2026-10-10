/** Formatage FR : monnaie, nombres, dates relatives. Aucune valeur inventée : null → « — ». */
const UNKNOWN = "—";

export function formatMoney(value: number | null | undefined, currency = "EUR", options: { decimals?: number } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      minimumFractionDigits: options.decimals ?? 2,
      maximumFractionDigits: options.decimals ?? 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)} %`;
}

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  if (!value) return UNKNOWN;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return UNKNOWN;
  return new Intl.DateTimeFormat("fr-FR", opts).format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(value: string | Date | null | undefined): string {
  return formatDate(value, { timeStyle: "short" });
}

/**
 * « il y a 12 minutes », « il y a 3 jours », « dans 2 heures ».
 * Sans Intl.RelativeTimeFormat : ce module est partagé avec l'application mobile, dont le moteur
 * JavaScript (Hermes) ne l'implémente pas — l'appel y lève une exception et ferme l'application.
 */
export function formatRelative(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return UNKNOWN;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return UNKNOWN;
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return "à l'instant";
  const units: Array<[number, string, string]> = [
    [60, "minute", "minutes"],
    [3600, "heure", "heures"],
    [86400, "jour", "jours"],
    [86400 * 30, "mois", "mois"],
    [86400 * 365, "an", "ans"],
  ];
  let [size, one, many] = units[0]!;
  if (abs >= 3600) [size, one, many] = units[1]!;
  if (abs >= 86400) [size, one, many] = units[2]!;
  if (abs >= 86400 * 30) [size, one, many] = units[3]!;
  if (abs >= 86400 * 365) [size, one, many] = units[4]!;
  const n = Math.max(1, Math.round(abs / size));
  const label = `${n} ${n > 1 ? many : one}`;
  return diffSec < 0 ? `il y a ${label}` : `dans ${label}`;
}

export function formatDays(value: number | null | undefined): string {
  if (value === Number.POSITIVE_INFINITY) return "∞";
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;
  if (value < 1) return `${formatNumber(value, 1)} jour`;
  return `${formatNumber(value, value < 10 ? 1 : 0)} jours`;
}

export const NOT_PROVIDED = "Non communiqué";
