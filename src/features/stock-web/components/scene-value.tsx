"use client";
import { CountingFigure } from "@/components/instrument/counting-figure";

/** Valeur du stock au coût (comptage 600 ms) ; « ≈ » quand des coûts manquent ; inconnue → « — ». */
export function StockValueFigure({ amount, currency, approx }: { amount: number | null; currency: string; approx: boolean }) {
  const fmt = (n: number) => `${approx ? "≈ " : ""}${new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(n)}`;
  return <CountingFigure amount={amount} format={fmt} size="md" />;
}
