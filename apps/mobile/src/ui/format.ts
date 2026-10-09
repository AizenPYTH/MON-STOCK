import type { StockLevel } from "@/domain/inventory/alerts";
import type { Tone } from "~/ui/theme";

export { formatMoney, formatNumber, formatPercent, formatDate, formatDateTime, formatRelative, formatDays, NOT_PROVIDED } from "@/lib/format";
export { STOCK_LEVEL_LABEL } from "@/domain/inventory/alerts";

export const STOCK_LEVEL_TONE: Record<StockLevel, Tone> = { out_of_stock: "danger", at_risk: "warning", low: "warning", normal: "success" };

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
