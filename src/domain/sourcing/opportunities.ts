/**
 * Détection d'opportunités sur une offre à partir de son historique réel :
 * prix anormalement bas, baisse de prix, retour en stock, stock faible.
 * Chaque règle exige que les données sous-jacentes soient réellement présentes.
 */
import { median } from "@/domain/sourcing/validation";
import type { StockStatus } from "@/domain/sourcing/types";

export type OpportunityKind = "abnormal_low_price" | "price_drop" | "new_stock" | "low_stock";

export interface Opportunity {
  kind: OpportunityKind;
  message: string;
  /** valeur chiffrée associée (pourcentage de baisse, quantité…) */
  value: number | null;
}

export interface OfferSnapshot {
  price: number | null;
  currency: string;
  availableQuantity: number | null;
  stockStatus: StockStatus;
}

export interface PriceHistoryPoint {
  price: number;
  recordedAt: string | Date;
}

export interface StockHistoryPoint {
  availableQuantity: number | null;
  stockStatus: StockStatus;
  recordedAt: string | Date;
}

export const ABNORMAL_LOW_RATIO = 0.8;
export const PRICE_DROP_MIN_PERCENT = 10;
export const LOW_STOCK_DROP_RATIO = 0.5;
export const MIN_HISTORY_POINTS = 3;

function toTime(d: string | Date): number {
  return (typeof d === "string" ? new Date(d) : d).getTime();
}

function fmt(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function detectOpportunities(offer: OfferSnapshot, priceHistory: PriceHistoryPoint[], stockHistory: StockHistoryPoint[], now: Date = new Date()): Opportunity[] {
  const out: Opportunity[] = [];
  const prices = [...priceHistory].filter((p) => Number.isFinite(p.price) && p.price > 0).sort((a, b) => toTime(a.recordedAt) - toTime(b.recordedAt));

  if (offer.price !== null && offer.price > 0 && prices.length >= 2) {
    const previous = prices[prices.length - 1]!.price === offer.price && prices.length >= 2 ? prices[prices.length - 2]!.price : prices[prices.length - 1]!.price;
    if (previous > 0 && previous !== offer.price) {
      const drop = ((previous - offer.price) / previous) * 100;
      if (drop >= PRICE_DROP_MIN_PERCENT) {
        out.push({ kind: "price_drop", value: Math.round(drop * 10) / 10, message: `Baisse de prix de ${drop.toFixed(0)} % : ${fmt(previous, offer.currency)} → ${fmt(offer.price, offer.currency)}` });
      }
    }
  }

  if (offer.price !== null && offer.price > 0) {
    const cutoff = now.getTime() - 30 * 86_400_000;
    const usual = prices.filter((p) => toTime(p.recordedAt) >= cutoff && p.price !== offer.price).map((p) => p.price);
    const med = median(usual);
    if (med !== null && usual.length >= MIN_HISTORY_POINTS && offer.price < med * ABNORMAL_LOW_RATIO) {
      const pct = ((med - offer.price) / med) * 100;
      out.push({ kind: "abnormal_low_price", value: Math.round(pct * 10) / 10, message: `Prix anormalement bas : ${fmt(offer.price, offer.currency)}, soit ${pct.toFixed(0)} % sous le prix habituel (${fmt(med, offer.currency)} sur 30 jours)` });
    }
  }

  const stocks = [...stockHistory].sort((a, b) => toTime(a.recordedAt) - toTime(b.recordedAt));
  const previousStock = stocks.length > 0 ? stocks[stocks.length - 1]! : null;
  const prevUnavailable = previousStock !== null && (previousStock.stockStatus === "out_of_stock" || previousStock.availableQuantity === 0);
  const nowAvailable = offer.stockStatus === "in_stock" || offer.stockStatus === "low" || (offer.availableQuantity !== null && offer.availableQuantity > 0);
  if (prevUnavailable && nowAvailable) {
    out.push({ kind: "new_stock", value: offer.availableQuantity, message: offer.availableQuantity !== null ? `Retour en stock : ${offer.availableQuantity} unité(s) disponibles` : "Retour en stock" });
  }

  if (previousStock && previousStock.availableQuantity !== null && previousStock.availableQuantity > 0 && offer.availableQuantity !== null && offer.availableQuantity >= 0) {
    const drop = (previousStock.availableQuantity - offer.availableQuantity) / previousStock.availableQuantity;
    if (drop >= LOW_STOCK_DROP_RATIO && previousStock.availableQuantity >= 10) {
      out.push({ kind: "low_stock", value: offer.availableQuantity, message: `Stock en forte baisse : ${previousStock.availableQuantity} → ${offer.availableQuantity} unité(s) (−${Math.round(drop * 100)} %)` });
    }
  }

  return out;
}

export const OPPORTUNITY_LABEL: Record<OpportunityKind, string> = {
  abnormal_low_price: "Prix anormalement bas",
  price_drop: "Baisse de prix",
  new_stock: "Retour en stock",
  low_stock: "Stock en baisse",
};
