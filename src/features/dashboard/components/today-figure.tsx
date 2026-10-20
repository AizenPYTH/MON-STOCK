"use client";
import { CountingFigure } from "@/components/instrument/counting-figure";
import { formatMoney } from "@/lib/format";

/** CA du jour qui compte jusqu'à sa valeur (le format est défini côté client : une fonction ne traverse pas la frontière serveur). */
export function TodayFigure({ amount, currency }: { amount: number | null; currency: string }) {
  return <CountingFigure amount={amount} format={(n) => formatMoney(n, currency, { decimals: 0 })} size="xl" />;
}
