import { formatMoney } from "@/lib/format";




export { formatMoney, formatNumber, formatPercent, formatDate, formatDateTime, formatRelative, formatDays, NOT_PROVIDED } from "@/lib/format";
export { STOCK_LEVEL_LABEL } from "@/domain/inventory/alerts";

export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  receipt: "Réception",
  adjustment: "Ajustement",
  return: "Retour",
  transfer_in: "Transfert entrant",
  transfer_out: "Transfert sortant",
  correction: "Correction",
  sale: "Vente",
  cancellation: "Annulation de vente",
  initial: "Stock initial",
};

/** Variation en % avec signe (« +18 % »). */
export function formatSignedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded)} %`;
}

/** Montant en milliers (« 38 k€ »). */
export function formatCompactMoney(value: number, currency = "EUR"): string {
  if (Math.abs(value) < 10_000) return formatMoneyRounded(value, currency);
  return `${Math.round(value / 1000)} k${currency === "EUR" ? "€" : ` ${currency}`}`;
}

/** Montant arrondi à l'unité (« 1 284 € »), format français. */
export function formatMoneyRounded(value: number | null | undefined, currency = "EUR"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return formatMoney(value, currency, { decimals: 0 });
}

/** Heure locale « 09:12 ». */
export function formatClock(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(d);
}

/** « Jeudi 9 octobre ». */
export function formatLongDate(d: Date): string {
  const s = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
